/* ============================================================
 * server/server.js — 本地开发后端（Node + ws）
 * 协议与 Cloudflare Worker 版保持一致：
 *   GET /api/create        → { roomId }
 *   WS  /ws?room=ABC       → 连上后发 { t:'hello', name } 或 { t:'hello', token }
 * ============================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { Room, getRoom, rooms } = require('./room.js');
const auth = require('./auth.js');
const { viewFor } = require('../shared/view.js');
const { runAI } = require('../shared/ai.js');

const PORT = process.env.PORT || 8080;
/* 本地开发默认不强制登录：局域网里随手一局不该先注册账号。
   想验证线上的强制登录行为，用 AUTH_REQUIRED=1 启动。
   云端那个 Worker 是永远强制的，没有开关。 */
const AUTH_REQUIRED = process.env.AUTH_REQUIRED === '1';
const ROOT = path.resolve(__dirname, '..');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.apk': 'application/vnd.android.package-archive',
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const jsonOut = (res, status, obj) => {
  res.writeHead(status, { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
};

const bearer = req => {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
  return m ? m[1].trim() : '';
};

function readJson(req, cb) {
  let raw = '';
  req.on('data', d => {
    raw += d;
    if (raw.length > 1e6) { req.destroy(); }   // 别让一个超大 body 把进程吃了
  });
  req.on('end', () => { try { cb(JSON.parse(raw || '{}')); } catch (e) { cb({}); } });
}

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/web/index.html';
  // 下载短链：/download/x → /web/download/x（与 Cloudflare 版保持一致）
  if (urlPath.startsWith('/download/')) urlPath = '/web' + urlPath;

  // 本地调试时允许 APK（file:// 页面）跨域建房
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }

  /* 账号接口：与云端 Worker 完全同形，前端不用分叉 */
  if (urlPath === '/api/auth/me') {
    const r = auth.session({ token: bearer(req) });
    return jsonOut(res, 200, { authRequired: AUTH_REQUIRED, user: r.ok ? r.user : null });
  }
  if (urlPath.startsWith('/api/auth/')) {
    const op = urlPath.slice('/api/auth/'.length);
    /* 前端用更自然的 /api/auth/email/*，内部只认短名——与 Worker 那边同一张表，
       两处不一致就会出现「注册能过、绑定邮箱说未知操作」。 */
    const AUTH_OP = { 'email/code': 'code', 'email/bind': 'bind' };
    return readJson(req, body => {
      const token = bearer(req) || body.token || '';
      const [status, out] = auth.handle(AUTH_OP[op] || op, Object.assign({}, body, { token }));
      jsonOut(res, status, out);
    });
  }

  // 建房接口
  if (urlPath === '/api/create') {
    const room = new Room();
    res.writeHead(200, { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ roomId: room.id }));
  }

  const allowed = ['/web/', '/shared/'];
  if (!allowed.some(p => urlPath.startsWith(p))) return notFound(res);

  const filePath = path.join(ROOT, path.normalize(urlPath));
  if (!filePath.startsWith(ROOT)) return notFound(res);

  fs.readFile(filePath, (err, data) => {
    if (err) return notFound(res);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404');
}

/* ---------- WebSocket ---------- */
const wss = new WebSocketServer({
  server,
  path: '/ws',
  /* 账号闸门放在升级之前：拒绝时直接回 401，客户端不会先连上再被踢
     （先连上再踢会让前端的自动重连一直循环）。 */
  verifyClient(info, cb) {
    const u = new URL(info.req.url, 'http://localhost');
    const q = u.searchParams.get('auth') || '';
    const sReq = q ? auth.session({ token: q }) : { ok: false };
    info.req.dfUser = sReq.ok ? sReq.user.username : '';
    if (!AUTH_REQUIRED) return cb(true);
    return cb(!!sReq.ok, sReq.ok ? 200 : 401, sReq.ok ? 'OK' : '请先登录');
  },
});

function send(ws, obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function pushState(room) {
  if (!room.game) return;
  for (const seat of room.seats) {
    if (seat.ws && seat.ws.readyState === 1) {
      const v = viewFor(room.game, seat.playerId);
      if (v) v.thinking = !!room.thinking;
      send(seat.ws, { t: 'state', view: v });
    }
  }
  // 观战者：playerId 传 null，拿到的是没有「我」的公开视图
  for (const w of room.watchers) {
    if (w.ws && w.ws.readyState === 1) {
      const v = viewFor(room.game, null);
      if (v) v.thinking = !!room.thinking;
      send(w.ws, { t: 'state', view: v });
    }
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * 驱动人机行动，直到轮到真人。
 * 每次只走一步并推送状态，让前端能看见逐个动作（而不是一次性跳到结果）。
 */
/* 人机"思考"时长：默认 3–10 秒，让玩家看得清、反应得过来 */
const AI_MIN = Number(process.env.AI_THINK_MIN || 3000);
const AI_MAX = Number(process.env.AI_THINK_MAX || 10000);
const thinkTime = () => AI_MIN + Math.floor(Math.random() * Math.max(0, AI_MAX - AI_MIN));

async function driveAI(room) {
  if (!room.game || room.aiRunning) return;
  const seats = room.aiSeats();
  if (!seats.size) return;
  // 光速飞船挂起时整局都在等那一个人；他要是真人，人机先别动
  const pend = room.game.state().escapePending;
  if (pend && !seats.has(pend.targetId)) return;
  room.aiRunning = true;
  try {
    for (let i = 0; i < 60; i++) {
      const S = room.game && room.game.state();
      if (!S || S.phase !== 'playing') break;
      // 先亮出"正在思考"的状态，让玩家知道轮到人机了
      room.thinking = S.players[S.currentIdx] && seats.has(S.players[S.currentIdx].id);
      pushState(room);
      if (room.thinking) await sleep(thinkTime());
      const played = runAI(room.game, seats, viewFor, { maxSteps: 1 });
      if (!played.length) { room.thinking = false; break; }
      pushState(room);
      await sleep(260);          // 动作之间的短停顿，让每个动作都看得见
    }
  } catch (e) {
    console.error('[ai]', e && e.message);
  } finally {
    room.aiRunning = false;
    room.thinking = false;
    if (room.game) pushState(room);
  }
}

function pushLobby(room) {
  for (const seat of room.seats) {
    if (seat.ws && seat.ws.readyState === 1) {
      send(seat.ws, { t: 'lobby', room: room.summary(), you: seat.playerId });
    }
  }
  for (const w of room.watchers) {
    if (w.ws && w.ws.readyState === 1) send(w.ws, { t: 'lobby', room: room.summary() });
  }
}

function handleAction(room, playerId, a) {
  const g = room.game;
  if (!g) return { ok: false, msg: '对局尚未开始' };
  switch (a.type) {
    case 'build':     return g.playBuild(playerId, a.uid);
    case 'demolish':  return g.demolish(playerId, a.uid);
    case 'broadcast': return g.playBroadcast(playerId, a.uid, a.galaxy);
    case 'strike':    return g.playStrike(playerId, a.uid, a.galaxy);
    case 'discard':   return g.discardCards(playerId, a.uids || []);
    case 'end':       return g.endTurn(playerId);
    case 'withdraw':  return g.withdrawStrike(playerId, a.uid);
    case 'respond': {
      const r = g.setResponse(playerId, a.uid || null, a.face || null);
      if (r.ok && r.complete) return g.finalizeBroadcast();
      return r;
    }
    case 'choose':    return g.chooseResponder(a.targetId, playerId);
    case 'escape':    return g.chooseEscape(playerId, !!a.use);
    default:          return { ok: false, msg: '未知动作' };
  }
}

wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  const url = new URL(req.url, 'http://localhost');
  const roomId = (url.searchParams.get('room') || '').toUpperCase();
  let session = null;

  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw.toString()); } catch { return; }

    /* --- 握手：带 token 则重连，否则占新席位 --- */
    if (m.t === 'hello') {
      const room = getRoom(roomId);
      if (!room) return send(ws, { t: 'error', msg: '房间不存在或已过期' });

      /* 观战：只读连接。不占席位、不发 token，也不会被当成某个玩家的重连 */
      if (m.spectate) {
        const w = room.addWatcher(ws, url.searchParams.get('user') || m.name);
        session = { roomId: room.id, spectator: true, wid: w.wid };
        ws.roomId = room.id;
        ws.spectator = true;
        send(ws, { t: 'joined', roomId: room.id, spectator: true, wid: w.wid });
        if (room.started && room.game) {
          send(ws, { t: 'state', view: viewFor(room.game, null) });
          driveAI(room);   // 幂等：若正卡在人机回合，这里会推进
        } else pushLobby(room);
        return;
      }

      /* 登录用户的席位名以账号为准：客户端自报的 name 不作数，否则可以随便冒充 */
      const r = m.token ? room.rejoin(m.token, ws) : room.join(req.dfUser || m.name, ws);
      if (r.error) return send(ws, { t: 'error', msg: r.error });

      session = { roomId: room.id, playerId: r.playerId };
      ws.roomId = room.id;
      ws.playerId = r.playerId;
      send(ws, {
        t: 'joined', roomId: room.id, playerId: r.playerId,
        token: m.token || r.token, seat: room.seats.findIndex(s => s.playerId === r.playerId),
      });
      if (room.started) {
        send(ws, { t: 'state', view: viewFor(room.game, r.playerId) });
        driveAI(room);   // 幂等：若正卡在人机回合，这里会推进
      } else pushLobby(room);
      return;
    }

    if (!session) return send(ws, { t: 'error', msg: '尚未进入房间' });
    const room = getRoom(session.roomId);
    if (!room) return send(ws, { t: 'error', msg: '房间已失效' });

    /* 观战者：只能 ping / 主动退出，任何会改变局面的消息一律拒绝 */
    if (session.spectator) {
      if (m.t === 'ping') return send(ws, { t: 'pong', ts: Date.now() });
      if (m.t === 'leave') { room.removeWatcher(ws); session = null; return; }
      /* 入座：从观战席坐回玩家席（仅开局前，房间没满） */
      if (m.t === 'sit') {
        const r = room.sitDown(session.wid, ws);
        if (r.error) return send(ws, { t: 'error', msg: r.error });
        session = { roomId: room.id, playerId: r.playerId };
        ws.playerId = r.playerId;
        ws.spectator = false;
        send(ws, {
          t: 'joined', roomId: room.id, playerId: r.playerId,
          token: r.token, seat: r.seat,
        });
        pushLobby(room);
        return;
      }
      return send(ws, { t: 'error', msg: '观战中不能操作' });
    }

    const playerId = session.playerId;

    if (m.t === 'start') {
      const r = room.start(playerId);
      if (r.error) return send(ws, { t: 'error', msg: r.error });
      pushState(room);
      driveAI(room);
      return;
    }

    if (m.t === 'spectate') {
      const r = room.toSpectator(playerId, ws);
      if (r.error) return send(ws, { t: 'error', msg: r.error });
      session = { roomId: room.id, spectator: true, wid: r.wid };
      ws.spectator = true;
      ws.playerId = null;
      send(ws, { t: 'joined', roomId: room.id, spectator: true, wid: r.wid });
      // 席位上的 token 作废，前端要把它删掉；否则刷新页面会被当成"重连到不存在的席位"
      send(ws, { t: 'unseat' });
      pushLobby(room);
      return;
    }

    if (m.t === 'transferHost') {
      const r = room.transferHost(playerId, m.playerId);
      if (r.error) return send(ws, { t: 'error', msg: r.error });
      pushLobby(room);
      return;
    }

    if (m.t === 'mode') {
      const r = room.setMode(playerId, m.mode);
      if (r.error) return send(ws, { t: 'error', msg: r.error });
      pushLobby(room);
      return;
    }

    if (m.t === 'strikeTarget') {
      const r = room.setStrikeTarget(playerId, m.value);
      if (r.error) return send(ws, { t: 'error', msg: r.error });
      pushLobby(room);
      return;
    }

    if (m.t === 'addAI') {
      const r = room.addAI(playerId, m.level);
      if (r.error) return send(ws, { t: 'error', msg: r.error });
      pushLobby(room);
      return;
    }

    if (m.t === 'removeAI') {
      const r = room.removeAI(playerId, m.playerId);
      if (r.error) return send(ws, { t: 'error', msg: r.error });
      pushLobby(room);
      return;
    }

    if (m.t === 'act') {
      const r = handleAction(room, playerId, m.action || {});
      if (!r.ok) send(ws, { t: 'error', msg: r.msg || '操作失败' });
      pushState(room);
      driveAI(room);
      return;
    }

    if (m.t === 'ping') return send(ws, { t: 'pong', ts: Date.now() });

    if (m.t === 'leave') {
      room.leave(playerId);
      if (!room.started) pushLobby(room); else pushState(room);
      session = null;
    }
  });

  ws.on('close', () => {
    if (!session) return;
    const room = getRoom(session.roomId);
    if (!room) return;
    if (session.spectator) { room.removeWatcher(ws); return; }
    room.leave(session.playerId);
    if (!room.started) pushLobby(room); else pushState(room);
  });
});

/* 超时推进：每 700ms 检查一次（广播 60s / 光速飞船待决 30s） */
setInterval(() => {
  for (const room of rooms.values()) {
    if (!room.game || !room.started) continue;
    const S = room.game.state();
    let changed = false;
    if (S.broadcast && room.game.tickBroadcast(Date.now()).changed) changed = true;
    if (S.escapePending && room.game.tickEscape(Date.now()).changed) changed = true;
    if (changed) {
      pushState(room);
      driveAI(room);
    }
  }
}, 700).unref?.();

setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  });
}, 30000).unref?.();

server.listen(PORT, () => {
  console.log(`\n  三体·黑暗森林 服务已启动`);
  console.log(`  → http://localhost:${PORT}\n`);
});
