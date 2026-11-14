/* ============================================================
 * server/test-auth.js — 本地服务器的账号接口（HTTP 层）
 *
 * 上面 worker/test-users.mjs 测的是账号逻辑本身，这里测的是**接线**：
 * 路由有没有挂对、Authorization 头认不认、联机闸门在 AUTH_REQUIRED=1
 * 时是不是真的把没登录的 WebSocket 挡在 101 之前。
 *
 * 真起一个服务器子进程（随机端口 + 临时账号库），因为这几件事只有
 * 走一遍 HTTP 才看得见：路由没挂 = 404，头没读 = 401 满屏。
 *
 * 运行：node server/test-auth.js
 * ============================================================ */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 18000 + Math.floor(Math.random() * 900);
const BASE = `http://127.0.0.1:${PORT}`;
const TMP = path.join(os.tmpdir(), `df-users-${Date.now()}.json`);

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };

let WebSocket = null;
try { WebSocket = require('ws'); }
catch (e) { console.log('跳过：未安装 ws（cd server && npm i）'); process.exit(0); }

const sleep = ms => new Promise(r => setTimeout(r, ms));

function startServer(env) {
  const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DF_USERS_FILE: TMP, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', d => process.stderr.write('[server] ' + d));
  return new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error('服务器没起来')), 8000);
    child.stdout.on('data', d => {
      buf += d;
      if (buf.includes('服务已启动')) { clearTimeout(timer); resolve(child); }
    });
  });
}

async function post(p, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(BASE + p, { method: 'POST', headers, body: JSON.stringify(body || {}) });
  let data = {};
  try { data = await res.json(); } catch (e) {}
  return { status: res.status, data };
}

async function get(p, token) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(BASE + p, { headers });
  let data = {};
  try { data = await res.json(); } catch (e) {}
  return { status: res.status, data };
}

/** 尝试握手；成功 resolve({ok:true})，被拒 resolve({ok:false, code}) */
let ROOM = 'AAAAA';   // 由 /api/create 建出来的真实房号

function tryWS(query) {
  return new Promise(resolve => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?room=${ROOM}${query || ''}`);
    let settled = false;
    const done = r => { if (!settled) { settled = true; resolve(r); try { ws.close(); } catch (e) {} } };
    ws.on('open', () => done({ ok: true }));
    ws.on('unexpected-response', (req, res) => done({ ok: false, status: res.statusCode }));
    ws.on('error', e => done({ ok: false, error: String(e && e.message || e) }));
    setTimeout(() => done({ ok: false, error: 'timeout' }), 3000);
  });
}

(async () => {
  let srv = null;
  try {
    /* ---------- 不强制登录的默认形态 ---------- */
    console.log('=== 1. 默认（本地开发）：不强制登录 ===');
    srv = await startServer({ AUTH_REQUIRED: '0' });
    {
      let r = await get('/api/auth/me');
      ok(r.status === 200 && r.data.authRequired === false, 'me 应说明这台服务器不要求登录，实际 ' + JSON.stringify(r.data));
      ok(r.data.user === null, '没登录时 user 应为 null');

      const reg = await post('/api/auth/register', { username: '本地玩家', password: 'abcd1234' });
      ok(reg.status === 200 && !!reg.data.token, '注册应返回 token，实际 ' + JSON.stringify(reg.data));

      r = await get('/api/auth/me', reg.data.token);
      ok(r.data.user && r.data.user.username === '本地玩家', 'Authorization 头应能换回用户');

      const login = await post('/api/auth/login', { username: '本地玩家', password: 'abcd1234' });
      ok(!!login.data.token, '应能登录，实际 ' + JSON.stringify(login.data));

      const bad = await post('/api/auth/login', { username: '本地玩家', password: 'wrong1234' });
      ok(/不对/.test(bad.data.error || ''), '密码错应被拒');

      /* 不强制登录时，游客也能连上联机（房间得先建出来，ws 不会自己建房） */
      const made = await (await fetch(BASE + '/api/create')).json();
      ROOM = made.roomId;
      ok(/^[A-Z0-9]{5}$/.test(ROOM), '应能建房，实际 ' + ROOM);
      const ws = await tryWS('');
      ok(ws.ok === true, '默认形态下游客应能连上 /ws，实际 ' + JSON.stringify(ws));
    }
    srv.kill();
    await sleep(200);

    /* ---------- 强制登录（模拟线上） ---------- */
    console.log('=== 2. AUTH_REQUIRED=1：没登录连不上联机 ===');
    srv = await startServer({ AUTH_REQUIRED: '1' });
    {
      let r = await get('/api/auth/me');
      ok(r.data.authRequired === true, 'me 应说明要登录，实际 ' + JSON.stringify(r.data));

      const noAuth = await tryWS('');
      ok(noAuth.ok === false, '没登录的 WebSocket 应被拒，实际 ' + JSON.stringify(noAuth));
      ok(noAuth.status === 401, '被拒时状态码应是 401，实际 ' + noAuth.status);

      const made = await (await fetch(BASE + '/api/create')).json();
      ROOM = made.roomId;

      const reg = await post('/api/auth/register', { username: '线上玩家', password: 'abcd1234' });
      ok(!!reg.data.token, '强制登录时注册照常可用');

      const withAuth = await tryWS('&auth=' + encodeURIComponent(reg.data.token));
      ok(withAuth.ok === true, '带有效 token 应能连上，实际 ' + JSON.stringify(withAuth));

      const badAuth = await tryWS('&auth=deadbeef');
      ok(badAuth.ok === false, '无效 token 应被拒');

      /* 席位名以账号为准：连上后 hello 自报的名字不作数 */
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?room=${ROOM}&auth=${encodeURIComponent(reg.data.token)}`);
      const joined = await new Promise(resolve => {
        const t = setTimeout(() => resolve(null), 3000);
        ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', name: '冒充别人' })));
        ws.on('message', raw => {
          let m = {};
          try { m = JSON.parse(raw.toString()); } catch (e) {}
          if (m.t === 'joined') { clearTimeout(t); resolve(m); }
        });
        ws.on('error', () => {});
      });
      ok(!!joined && joined.playerId === 'p0', '应拿到席位，实际 ' + JSON.stringify(joined));
      try { ws.close(); } catch (e) {}

      console.log('=== 3. 邮箱：发码与绑定要真的挂在 /api/auth/email/* 上 ===');
      {
        /* 前端调的是 /api/auth/email/code，内部才叫 code。
           这条路径漏映射时注册能过、绑定邮箱回「未知操作」。 */
        const me = await post('/api/auth/register', { username: '邮箱测试', password: 'abcd1234' });
        const code = await post('/api/auth/email/code',
          { email: 'box@example.com', purpose: 'bind' }, me.data.token);
        ok(!code.data.error && /^\d{6}$/.test(code.data.devCode || ''),
          'email/code 应能发码，实际 ' + JSON.stringify(code.data));

        const bad = await post('/api/auth/email/bind',
          { email: 'box@example.com', code: '000000' }, me.data.token);
        ok(/验证码不对/.test(bad.data.error || ''), 'email/bind 应能识别错码，实际 ' + JSON.stringify(bad.data));

        const good = await post('/api/auth/email/bind',
          { email: 'box@example.com', code: code.data.devCode }, me.data.token);
        ok(!good.data.error && good.data.user && good.data.user.emailOk === true,
          'email/bind 应能绑定成功，实际 ' + JSON.stringify(good.data));
      }

      console.log('=== 4. 观战席与房主转让的 HTTP 侧可达 ===');
      /* 这两条是 WebSocket 协议，不是 HTTP；这里只确认房间推送里带上了字段，
         真正的行为断言在 worker/test-do.mjs 第 11–13 节。 */
      const ws2 = new WebSocket(`ws://127.0.0.1:${PORT}/ws?room=${ROOM}&auth=${encodeURIComponent(reg.data.token)}`);
      const lobby = await new Promise(resolve => {
        const t = setTimeout(() => resolve(null), 3000);
        ws2.on('open', () => ws2.send(JSON.stringify({ t: 'hello', name: '甲' })));
        ws2.on('message', raw => {
          let m = {};
          try { m = JSON.parse(raw.toString()); } catch (e) {}
          if (m.t === 'lobby') { clearTimeout(t); resolve(m.room); }
        });
        ws2.on('error', () => {});
      });
      ok(!!lobby && typeof lobby.hostId === 'string', '大厅应带 hostId，实际 ' + JSON.stringify(lobby && lobby.hostId));
      ok(!!lobby && Array.isArray(lobby.watchers), '大厅应带观战席数组');
      try { ws2.close(); } catch (e) {}
    }
  } catch (e) {
    fail++;
    console.log('  ✗ 测试异常：' + (e && e.stack || e));
  } finally {
    if (srv) { try { srv.kill(); } catch (e) {} }
    try { fs.unlinkSync(TMP); } catch (e) {}
  }

  console.log(`\n结果：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})();
