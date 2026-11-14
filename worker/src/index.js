/* ============================================================
 * worker/src/index.js — Cloudflare Workers 版
 *
 * 架构：
 *   Worker    路由：/api/create、/ws?room=ID、静态资源
 *   Durable Object「Room」：每个房间一个实例，持有对局状态 + WebSocket
 *   KV（可选）：房间索引 / 战绩，不存对局状态
 *
 * 为什么对局状态用 DO 而不是 KV：
 *   DO 单实例单线程、强一致，两个玩家同时响应广播不会丢写；
 *   KV 最终一致且无事务，做实时对局会丢操作。
 * ============================================================ */
import rulesPkg from '../../shared/rules.js';
import viewPkg from '../../shared/view.js';
import aiPkg from '../../shared/ai.js';
import { Users } from './auth.js';

const { createGame } = rulesPkg;
const { viewFor } = viewPkg;
const { runAI, LEVELS } = aiPkg;

export { Users };

const ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function makeRoomId() {
  return Array.from({ length: 5 }, () => ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)]).join('');
}

/* APK 用 file:// 打开页面，Origin 是 null，跨域必须显式放行。
   Allow-Credentials 没开，所以会话只能走 Authorization 头（不能用 Cookie）。 */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

/* 会话 token：优先 Authorization: Bearer，其次 body.token，最后 ?auth=（WebSocket 用） */
function bearer(request, url) {
  const h = request.headers.get('Authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (m) return m[1].trim();
  return (url && url.searchParams.get('auth')) || '';
}

/* 所有账号操作都转发给单实例的 Users DO，Worker 只做路由与鉴权头的解析 */
async function usersCall(env, op, payload) {
  if (!env.USERS) return { error: '账号服务未启用' };
  const stub = env.USERS.get(env.USERS.idFromName('global'));
  const res = await stub.fetch('https://do/' + op, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  try {
    return await res.json();
  } catch (e) {
    return { error: '账号服务返回异常' };
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    /* 建房：生成房号 → 初始化 DO → 可选写 KV 索引 */
    if (url.pathname === '/api/create') {
      const roomId = makeRoomId();
      const stub = env.ROOMS.get(env.ROOMS.idFromName(roomId));
      // 必须把房号传进 DO —— idFromName 的名字在 DO 内部读不到
      await stub.fetch(`https://do/init?room=${roomId}`, { method: 'POST' });

      if (env.META) {
        // KV 只存"房间存在"这类弱一致索引，绝不存对局状态
        await env.META.put(`room:${roomId}`, JSON.stringify({ createdAt: Date.now() }), { expirationTtl: 86400 }).catch(() => {});
      }
      return new Response(JSON.stringify({ roomId }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    /* ---------- 账号：注册 / 登录 / 会话 / 邮箱验证码 ---------- */
    if (url.pathname.startsWith('/api/auth/')) {
      const op = url.pathname.slice('/api/auth/'.length);
      const token = bearer(request, url);

      if (op === 'me') {
        const r = await usersCall(env, 'session', { token });
        /* 没绑定 USERS 就等于这个部署没开账号服务：告诉前端"不必登录"，
           否则前端会一直卡在登录面板上，连游客都进不去。 */
        if (!r || r.error === '账号服务未启用') return json({ authRequired: false, user: null });
        return r.ok
          ? json({ authRequired: true, user: r.user })
          : json({ authRequired: true, user: null }, 401);
      }
      if (request.method !== 'POST') return json({ error: '请求方法不对' }, 405);

      // 前端用更自然的 /api/auth/email/* 路径，DO 内部只认短名
      const DO_OP = { 'email/code': 'code', 'email/bind': 'bind' };
      const body = await request.json().catch(() => ({}));
      const out = await usersCall(env, DO_OP[op] || op, { ...body, token });
      const expired = out && /登录状态已失效|未登录/.test(out.error || '');
      return json(out, expired ? 401 : 200);
    }

    /* WebSocket：按房间名路由到对应 DO */
    if (url.pathname === '/ws') {
      const roomId = (url.searchParams.get('room') || '').toUpperCase();
      if (!roomId) return new Response('missing room', { status: 400 });

      /* 联机必须登录。只在前端拦是拦不住的——直接 wss 连过来就绕过了，
         所以闸门放在这里：会话无效直接 401，连 DO 都不进。 */
      const token = bearer(request, url);
      const sess = await usersCall(env, 'session', { token });
      if (!sess || !sess.ok) return json({ error: '请先登录' }, 401);

      const stub = env.ROOMS.get(env.ROOMS.idFromName(roomId));
      /* 把账号名塞进 query 交给 DO：席位名以账号为准，客户端传来的 name 不作数 */
      const fwd = new URL(request.url);
      fwd.searchParams.set('user', sess.user.username);
      return stub.fetch(new Request(fwd.toString(), request));
    }

    /* 静态资源：/ → /web/index.html；/download/* → /web/download/*（对外的短链） */
    let pathname = url.pathname === '/' ? '/web/index.html' : url.pathname;
    if (pathname.startsWith('/download/')) pathname = '/web' + pathname;
    // favicon：页面在根路径（/），图标文件在 web/ 里，这里补一层映射
    if (/^\/(favicon\.ico|favicon\.png|apple-touch-icon\.png)$/.test(pathname)) pathname = '/web' + pathname;
    const assetUrl = new URL(pathname + url.search, url);
    // 显式构造 GET，避免把原请求的 body 带进 assets.fetch
    const assetRes = await env.ASSETS.fetch(new Request(assetUrl.toString(), {
      method: 'GET',
      headers: request.headers,
    }));
    // 静态资源也要带 CORS：APK 里页面是 file://（Origin: null），
    // 跨域读 /download/apk.json 做版本检查，没有这个头会被浏览器直接拦下来。
    const h = new Headers(assetRes.headers);
    for (const [k, v] of Object.entries(CORS)) h.set(k, v);
    // text/css / javascript 默认不带 charset，中文注释会被当 Latin-1 解码成乱码
    const ct = h.get('content-type') || '';
    if (/^text\/css|javascript/i.test(ct) && !/charset/i.test(ct)) h.set('content-type', ct + '; charset=utf-8');
    return new Response(assetRes.body, { status: assetRes.status, statusText: assetRes.statusText, headers: h });
  },
};

/* ============================================================
 * Durable Object：一个房间
 * ============================================================ */
export class Room {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.data = null;   // { id, seats, started, snap }
  }

  /* ---------- 持久化 ---------- */
  async load() {
    if (this.data) return this.data;
    const saved = await this.ctx.storage.get('room');
    this.data = saved || { id: null, seats: [], started: false, snap: null, createdAt: Date.now(), mode: 'standard', strikeTarget: 'hidden' };
    this.data.mode = this.data.mode || 'standard';   // 旧房间没有这个字段
    this.data.strikeTarget = this.data.strikeTarget === 'open' ? 'open' : 'hidden';   // 同上（默认隐藏）
    /* 观战席与房主都是后加的字段：旧房间读出来是空的，这里补默认值。
       房主以前靠「seats[0]」隐式表示——一旦允许转让、允许有人站起来去观战，
       席位顺序就不再等于房主身份，必须落到显式字段上。 */
    if (!Array.isArray(this.data.watchers)) this.data.watchers = [];
    if (!this.data.hostId) this.data.hostId = this.data.seats[0] ? this.data.seats[0].playerId : null;
    return this.data;
  }

  async save() {
    await this.ctx.storage.put('room', this.data);
  }

  /** 现任房主的 playerId。房主必须是真人（AI 不能接管房间规则） */
  hostId() {
    const d = this.data;
    if (d.hostId && d.seats.some(s => s.playerId === d.hostId && !s.isAI)) return d.hostId;
    this.syncHost();
    return d.hostId;
  }

  /** 房主失效（走了 / 席位被删 / 变成了 AI）时，把房主交给下一个真人 */
  syncHost() {
    const d = this.data;
    if (d.hostId && d.seats.some(s => s.playerId === d.hostId && !s.isAI)) return;
    const next = d.seats.find(s => !s.isAI) || d.seats[0] || null;
    d.hostId = next ? next.playerId : null;
  }

  /**
   * 席位变动后重排 playerId（引擎里 players 下标必须与席位一一对应）。
   * ⚠️ 重排会改动所有人的 playerId，而每条连接的 attachment 里都存着一份，
   *    所以必须一并改写，否则被挪动的人下一条消息就会「席位不存在」。
   *    所以 attachment 里存 token（稳定），重排时按 token 找回新 id。
   */
  reindex() {
    const hostSeat = this.data.seats.find(s => s.playerId === this.data.hostId);
    this.data.seats.forEach((s, i) => { s.playerId = 'p' + i; });
    this.data.hostId = hostSeat ? hostSeat.playerId : (this.data.seats[0] ? this.data.seats[0].playerId : null);
    this.reattach();
  }

  /** 把每条连接的 attachment 与其席位的当前 playerId 对齐 */
  reattach() {
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() || {};
      if (!a.token) continue;
      const seat = this.data.seats.find(s => s.token === a.token);
      if (seat && seat.playerId !== a.playerId) ws.serializeAttachment({ ...a, playerId: seat.playerId });
    }
  }

  /** 从快照重建游戏实例（DO 休眠唤醒后内存为空） */
  gameFromSnap() {
    if (!this.data.snap) return null;
    return createGame().hydrate(this.data.snap);
  }

  /* ---------- HTTP ---------- */
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/init') {
      await this.load();
      if (!this.data.id) {
        this.data.id = (url.searchParams.get('room') || '').toUpperCase() || null;
        await this.save();
      }
      return new Response('ok');
    }

    // WebSocket 升级
    if (request.headers.get('Upgrade') === 'websocket') {
      await this.load();
      // 兜底：直接连 /ws?room=X 而未走过 /init 时，也能确定房号
      if (!this.data.id) {
        const rid = (url.searchParams.get('room') || '').toUpperCase();
        if (rid) { this.data.id = rid; await this.save(); }
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);   // Hibernation API
      /* 账号名是 Worker 校验会话后放进 query 的，先记在 attachment 上；
         hello 建席位时用它覆盖客户端自报的 name（否则名字可以随便伪造）。 */
      const authUser = url.searchParams.get('user') || '';
      if (authUser) server.serializeAttachment({ user: authUser });
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('not found', { status: 404 });
  }

  /* ---------- 消息 ---------- */
  async webSocketMessage(ws, raw) {
    await this.load();
    let m;
    try { m = JSON.parse(raw); } catch { return; }

    const att = ws.deserializeAttachment() || {};
    let playerId = att.playerId;   // 查到席位后会被纠正成最新值
    const authUser = att.user || '';   // 登录用户的账号名，见 fetch 里的升级分支

    /* 握手：token 重连，否则占座 */
    if (m.t === 'hello') {
      /* 观战：只读连接，占「观战席」而不是玩家席。
         attachment 里只记 wid，不写 playerId——这样下面所有需要席位的分支都不会把它当成玩家。 */
      if (m.spectate) {
        const wid = crypto.randomUUID();
        const name = (authUser || String(m.name || '')).slice(0, 12) || '观战者';
        this.data.watchers.push({ wid, name, connected: true });
        /* 观战席不是无上限的：一个房间挂几十个只读连接既没意义又烧配额。
           超了就把最早的挤出去（它们的 socket 还在，只是不再显示在大厅里）。 */
        while (this.data.watchers.length > 20) this.data.watchers.shift();
        await this.save();
        ws.serializeAttachment({ wid, user: authUser });
        this.send(ws, { t: 'joined', roomId: this.data.id, spectator: true, wid });
        const game = this.gameFromSnap();
        if (this.data.started && game) {
          // 数据可能是别的 isolate 写的，先落一次再算视图
          this.data.snap = game.state();
          await this.save();
          const v = viewFor(game, null);
          if (v) v.thinking = !!this.thinking;
          this.send(ws, { t: 'state', view: v });
        } else this.pushLobby();
        return;
      }

      if (this.data.started && !m.token) {
        return this.send(ws, { t: 'error', msg: '对局已开始，无法加入' });
      }

      let seat = null;
      if (m.token) seat = this.data.seats.find(s => s.token === m.token);

      if (!seat) {
        if (this.data.started) return this.send(ws, { t: 'error', msg: '对局已开始，无法加入' });
        if (this.data.seats.length >= 9) return this.send(ws, { t: 'error', msg: '房间已满（最多 9 人）' });
        const pid = 'p' + this.data.seats.length;
        seat = {
          playerId: pid,
          token: crypto.randomUUID(),
          name: (authUser || String(m.name || '')).slice(0, 12) || ('玩家 ' + (this.data.seats.length + 1)),
          isAI: false,
        };
        this.data.seats.push(seat);
        this.syncHost();     // 第一个进来的人自动成为房主
        await this.save();
      }

      seat.connected = true;
      ws.serializeAttachment({ playerId: seat.playerId, token: seat.token, user: authUser });
      this.send(ws, {
        t: 'joined', roomId: this.data.id, playerId: seat.playerId,
        token: seat.token, seat: this.data.seats.indexOf(seat),
      });

      const game = this.gameFromSnap();
      if (this.data.started && game) {
        this.data.snap = game.state();
        await this.save();
        await this.planNext(game);      // 幂等补排：万一 alarm 丢了，这里续上
        const v = viewFor(game, seat.playerId);
        if (v) v.thinking = !!this.thinking;
        this.send(ws, { t: 'state', view: v });
        this.pushState();
      } else this.pushLobby();
      return;
    }

    if (!playerId) {
      const att0 = ws.deserializeAttachment() || {};
      if (m.t === 'ping') return this.send(ws, { t: 'pong', ts: Date.now() });
      if (!att0.wid) return this.send(ws, { t: 'error', msg: '尚未进入房间' });
      if (m.t === 'leave') { await this.dropWatcher(att0.wid); try { ws.close(); } catch {} return; }
      if (m.t === 'sit') return this.sitDown(ws, att0);
      return this.send(ws, { t: 'error', msg: '观战中不能操作' });
    }
    /* 优先按 token 找席位：席位重排会改 playerId，attachment 里的旧值可能已过期 */
    const att1 = ws.deserializeAttachment() || {};
    const seat = (att1.token && this.data.seats.find(s => s.token === att1.token))
      || this.data.seats.find(s => s.playerId === playerId);
    if (!seat) return this.send(ws, { t: 'error', msg: '席位不存在' });
    playerId = seat.playerId;

    /* 座位 ⇄ 观战席：只允许在开局前换。开局后席位与引擎里的 players 下标绑死了，
       中途让人站起来会把整局的对齐关系打乱。 */
    if (m.t === 'spectate') {
      if (this.data.started) return this.send(ws, { t: 'error', msg: '对局已开始，不能转为观战' });
      await this.toSpectator(ws, seat);
      return;
    }

    if (m.t === 'transferHost') {
      const r = this.transferHost(playerId, m.playerId);
      if (r && r.error) return this.send(ws, { t: 'error', msg: r.error });
      await this.save();
      this.pushLobby();
      return;
    }

    /* 开局 */
    if (m.t === 'start') {
      if (this.data.started) return this.send(ws, { t: 'error', msg: '对局已经开始' });
      if (this.hostId() !== playerId) return this.send(ws, { t: 'error', msg: '只有房主可以开始对局' });
      if (this.data.seats.length < 2) return this.send(ws, { t: 'error', msg: '至少需要 2 名玩家' });

      const game = createGame(this.data.seats.map(s => s.name), {
        mode: this.data.mode, strikeTarget: this.data.strikeTarget,
      });
      this.data.started = true;
      this.data.lastAITurn = -1;
      this.data.snap = game.state();
      await this.save();
      await this.planNext(game);

      if (this.env.META) {
        await this.env.META.put(`room:${this.data.id}`, JSON.stringify({
          createdAt: this.data.createdAt, players: this.data.seats.length, started: true,
        }), { expirationTtl: 86400 }).catch(() => {});
      }
      this.pushState();
      return;
    }

    /* 动作 */
    if (m.t === 'act') {
      const game = this.gameFromSnap();
      if (!game) return this.send(ws, { t: 'error', msg: '对局尚未开始' });
      if (game.state().phase === 'ended') return this.send(ws, { t: 'error', msg: '对局已结束' });

      const r = this.handleAction(game, playerId, m.action || {});
      if (!r.ok) this.send(ws, { t: 'error', msg: r.msg || '操作失败' });

      this.data.snap = game.state();
      await this.save();
      await this.planNext(game);   // 轮到人机 → 5–10 秒后由 alarm 唤醒
      this.pushState();
      return;
    }

    if (m.t === 'mode') {
      if (this.data.started) return this.send(ws, { t: 'error', msg: '对局已经开始，无法修改规则' });
      if (this.hostId() !== playerId)
        return this.send(ws, { t: 'error', msg: '只有房主可以修改房间规则' });
      this.data.mode = m.mode === 'fast' ? 'fast' : 'standard';
      await this.save();
      this.pushLobby();
      return;
    }

    if (m.t === 'strikeTarget') {
      if (this.data.started) return this.send(ws, { t: 'error', msg: '对局已经开始，无法修改规则' });
      if (this.hostId() !== playerId)
        return this.send(ws, { t: 'error', msg: '只有房主可以修改房间规则' });
      this.data.strikeTarget = m.value === 'hidden' ? 'hidden' : 'open';
      await this.save();
      this.pushLobby();
      return;
    }

    if (m.t === 'addAI') {
      const r = this.addAI(playerId, m.level);
      if (r && r.error) return this.send(ws, { t: 'error', msg: r.error });
      await this.save();
      this.pushLobby();
      return;
    }

    if (m.t === 'removeAI') {
      const r = this.removeAI(playerId, m.playerId);
      if (r && r.error) return this.send(ws, { t: 'error', msg: r.error });
      await this.save();
      this.pushLobby();
      return;
    }

    if (m.t === 'leave') {
      await this.removeSeat(playerId);
      return;
    }

    if (m.t === 'ping') return this.send(ws, { t: 'pong', ts: Date.now() });
  }

  async webSocketClose(ws) {
    await this.load();
    const att = ws.deserializeAttachment() || {};
    if (att.wid) {
      /* 观战者：直接摘掉。刷新页面、关标签都算退出观战，不留幽灵 */
      await this.dropWatcher(att.wid);
    } else if (att.playerId || att.token) {
      const seat = (att.token && this.data.seats.find(s => s.token === att.token))
        || this.data.seats.find(s => s.playerId === att.playerId);
      if (seat) seat.connected = false;
      await this.save();
      this.data.started ? this.pushState() : this.pushLobby();
    }
    try { ws.close(); } catch {}
  }

  async webSocketError(ws) {
    await this.webSocketClose(ws);
  }

  /* ---------- 动作分发 ---------- */
  handleAction(game, playerId, a) {
    switch (a.type) {
      case 'build':     return game.playBuild(playerId, a.uid);
      case 'demolish':  return game.demolish(playerId, a.uid);
      case 'broadcast': return game.playBroadcast(playerId, a.uid, a.galaxy);
      case 'strike':    return game.playStrike(playerId, a.uid, a.galaxy);
      case 'discard':   return game.discardCards(playerId, a.uids || []);
      case 'end':       return game.endTurn(playerId);
      case 'withdraw':  return game.withdrawStrike(playerId, a.uid);
      case 'respond': {
        const r = game.setResponse(playerId, a.uid || null, a.face || null);
        if (r.ok && r.complete) return game.finalizeBroadcast();
        return r;
      }
      case 'choose':    return game.chooseResponder(a.targetId, playerId);
      case 'escape':    return game.chooseEscape(playerId, !!a.use);
      default:          return { ok: false, msg: '未知动作' };
    }
  }

  /* ---------- 人机 ---------- */
  addAI(byPlayerId, level) {
    if (this.data.started) return { error: '对局已开始，无法添加人机' };
    if (this.hostId() !== byPlayerId) return { error: '只有房主可以添加人机' };
    if (this.data.seats.length >= 9) return { error: '房间已满（最多 9 人）' };
    const lv = LEVELS[level] ? level : 'chaotic_era';
    this.data.aiSeq = (this.data.aiSeq || 0) + 1;
    const n = this.data.aiSeq;
    this.data.seats.push({
      playerId: 'p' + this.data.seats.length,
      token: null,
      name: `${LEVELS[lv].name}·${n}号`,
      isAI: true, aiLevel: lv,
      aiSeed: crypto.getRandomValues(new Uint32Array(1))[0] % 2000000000 + 1,
      connected: true,
    });
    return { ok: true };
  }

  removeAI(byPlayerId, targetId) {
    if (this.data.started) return { error: '对局已开始，无法移除人机' };
    if (this.hostId() !== byPlayerId) return { error: '只有房主可以移除人机' };
    const seat = this.data.seats.find(s => s.playerId === targetId && s.isAI);
    if (!seat) return { error: '没有这个人机' };
    this.data.seats = this.data.seats.filter(s => s !== seat);
    this.reindex();
    return { ok: true };
  }

  /** 驱动人机（DO 内同步执行：一次请求里把 AI 回合全部走完） */
  aiSeats() {
    const seats = new Map();
    this.data.seats.forEach(s => {
      if (s.isAI) seats.set(s.playerId, { level: s.aiLevel || 'chaotic_era', seed: s.aiSeed || 1 });
    });
    return seats;
  }

  /** 人机思考时长（毫秒）：默认 3–10 秒，可用环境变量调 */
  thinkMs() {
    const min = Number((this.env && this.env.AI_THINK_MIN) || 3000);
    const max = Number((this.env && this.env.AI_THINK_MAX) || 10000);
    return min + Math.floor(Math.random() * Math.max(0, max - min));
  }

  /** 走一步人机；返回这一步的动作（没有动作则空数组） */
  stepAI(game) {
    const seats = this.aiSeats();
    if (!seats.size) return [];
    try {
      return runAI(game, seats, viewFor, { maxSteps: 1 }) || [];
    } catch (e) {
      console.error('ai error', e && e.stack);
      return [];
    }
  }

  /** 当前是否该人机动手（他的回合，或广播里有他还没回应） */
  aiPending(game) {
    const seats = this.aiSeats();
    if (!seats.size) return false;
    const S = game.state();
    if (S.phase !== 'playing') return false;
    // 光速飞船挂起时，整局都在等那一个人；只有他本人是 AI 才轮得到人机
    if (S.escapePending) return seats.has(S.escapePending.targetId);
    const cur = S.players[S.currentIdx];
    if (cur && seats.has(cur.id)) return true;
    const B = S.broadcast;
    if (B) {
      return B.candidates.some(c =>
        seats.has(c.playerId) &&
        !Object.prototype.hasOwnProperty.call(B.responses, c.playerId));
    }
    return false;
  }

  /**
   * 决定下一次唤醒时间并设置 alarm。
   * - 有人在等回应 / 有飞行中的打击：按广播截止时间
   * - 该人机动手：按思考时长（同一回合内连着的第二个动作只等 1–2 秒）
   */
  async scheduleNext(game, opts) {
    const o = opts || {};
    if (!this.ctx.storage.setAlarm) return;
    const now = Date.now();
    const S = game.state();
    let when = null;

    if (o.aiDelay != null) when = now + Math.max(400, o.aiDelay);

    const B = S.broadcast;
    if (B) {
      const d = B.stage === 'choosing' ? (B.chooseDeadline || B.deadline) : B.deadline;
      if (d) when = when == null ? d : Math.min(when, d);
    }
    if (S.escapePending && S.escapePending.deadline) {
      when = when == null ? S.escapePending.deadline : Math.min(when, S.escapePending.deadline);
    }
    if (when == null) return;
    await this.ctx.storage.setAlarm(Math.max(now + 200, when));
  }

  /** 一步走完后的统一收尾：存盘、推送、排下一次 */
  async afterStep(game) {
    this.data.snap = game.state();
    await this.save();
    this.pushState();
    await this.planNext(game);
  }

  async planNext(game) {
    const S = game.state();
    if (S.phase !== 'playing') return;
    if (this.aiPending(game)) {
      const cur = S.players[S.currentIdx];
      const seats = this.aiSeats();
      const sameTurn = seats.has(cur.id) && this.data.lastAITurn === S.turnIndex;
      this.thinking = true;
      this.data.lastAITurn = S.turnIndex;
      await this.scheduleNext(game, { aiDelay: sameTurn ? 1200 + Math.random() * 800 : this.thinkMs() });
    } else {
      this.thinking = false;
      await this.scheduleNext(game, {});   // 只保留广播超时
    }
  }

  /** alarm 到点：先结算广播超时，再走一步人机 */
  async alarm() {
    await this.load();
    const game = this.gameFromSnap();
    if (!game || !this.data.started) return;

    const r = game.tickBroadcast(Date.now());
    const re = game.tickEscape(Date.now());
    const played = this.stepAI(game);
    this.thinking = false;

    if (r.changed || re.changed || played.length) {
      await this.afterStep(game);      // 存盘 + 推送 + 排下一次
    } else {
      await this.planNext(game);       // 没动静也要重排，避免死等
    }
  }

  async removeSeat(playerId) {
    const seat = this.data.seats.find(s => s.playerId === playerId);
    if (!seat) return;
    seat.connected = false;
    if (!this.data.started) {
      this.data.seats = this.data.seats.filter(s => s !== seat);
      // 重排 playerId，避免空缺；重排后房主要是走了，自动交给下一个真人
      this.reindex();
      this.syncHost();
      await this.save();
      this.pushLobby();
    } else {
      await this.save();
      this.pushState();
    }
  }

  /* ---------- 观战席 ---------- */

  /** 玩家从席位站起来去观战（仅开局前）。席位会重排，房主跟着席位走 */
  async toSpectator(ws, seat) {
    const att = ws.deserializeAttachment() || {};
    this.data.seats = this.data.seats.filter(s => s !== seat);
    this.reindex();
    this.syncHost();
    const wid = crypto.randomUUID();
    this.data.watchers.push({ wid, name: seat.name, connected: true });
    await this.save();
    ws.serializeAttachment({ wid, user: att.user || '' });
    this.send(ws, { t: 'joined', roomId: this.data.id, spectator: true, wid });
    /* 已经不在席位上了，原来那个 token 也就作废——否则刷新页面会被当成"重连"
       到一个已经不存在的席位，服务端只好给他重新占一个座。 */
    this.send(ws, { t: 'unseat' });
    this.pushLobby();
  }

  /** 观战者入座（仅开局前） */
  async sitDown(ws, att) {
    if (this.data.started) return this.send(ws, { t: 'error', msg: '对局已开始，不能再入座' });
    if (this.data.seats.length >= 9) return this.send(ws, { t: 'error', msg: '房间已满（最多 9 人）' });

    const seat = {
      playerId: 'p' + this.data.seats.length,
      token: crypto.randomUUID(),
      name: (att.user || '').slice(0, 12) || ('玩家 ' + (this.data.seats.length + 1)),
      isAI: false,
      connected: true,
    };
    this.data.seats.push(seat);
    this.data.watchers = this.data.watchers.filter(w => w.wid !== att.wid);
    this.syncHost();
    await this.save();
    ws.serializeAttachment({ playerId: seat.playerId, token: seat.token, user: att.user || '' });
    this.send(ws, {
      t: 'joined', roomId: this.data.id, playerId: seat.playerId,
      token: seat.token, seat: this.data.seats.indexOf(seat),
    });
    this.pushLobby();
  }

  /** 观战连接断开：直接从列表里摘掉（刷新页面＝退出观战，不会留下幽灵观战者） */
  async dropWatcher(wid) {
    const before = this.data.watchers.length;
    this.data.watchers = this.data.watchers.filter(w => w.wid !== wid);
    await this.save();
    if (this.data.watchers.length !== before && !this.data.started) this.pushLobby();
  }

  /** 转让房主：只能给同一房间里的真人玩家（AI 与观战者不行） */
  transferHost(byPlayerId, toPlayerId) {
    if (this.data.started) return { error: '对局已经开始，不能再转让房主' };
    if (this.hostId() !== byPlayerId) return { error: '只有房主可以转让' };
    const t = this.data.seats.find(s => s.playerId === toPlayerId);
    if (!t) return { error: '找不到这位玩家' };
    if (t.isAI) return { error: '只能转让给真人玩家' };
    if (t.playerId === byPlayerId) return { error: '你已经是房主了' };
    this.data.hostId = t.playerId;
    this.syncHost();   // 防止下一次读 hostId() 时被兜底逻辑改回去
    return { ok: true };
  }

  /* ---------- 推送 ---------- */
  send(ws, obj) {
    try { ws.send(JSON.stringify(obj)); } catch {}
  }

  pushState() {
    const game = this.gameFromSnap();
    if (!game) return;
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment();
      if (!att || (!att.playerId && !att.wid)) continue;
      try {
        const v = viewFor(game, att.wid ? null : att.playerId);
        if (v) v.thinking = !!this.thinking;
        ws.send(JSON.stringify({ t: 'state', view: v }));
      } catch {}
    }
  }

  pushLobby() {
    const summary = {
      roomId: this.data.id,
      hostId: this.hostId(),
      started: this.data.started,
      mode: this.data.mode || 'standard',
      strikeTarget: this.data.strikeTarget === 'open' ? 'open' : 'hidden',
      seats: this.data.seats.map(s => ({
        playerId: s.playerId, name: s.name, connected: s.connected !== false,
        isAI: !!s.isAI, aiLevel: s.aiLevel || null,
      })),
      levels: Object.values(LEVELS).map(l => ({ key: l.key, name: l.name, blurb: l.blurb, retention: l.retention })),
      /* 观战席：只给名字与在线状态，没有任何身份信息 */
      watchers: this.data.watchers.map(w => ({ wid: w.wid, name: w.name, connected: w.connected !== false })),
      watcherCount: this.data.watchers.length,
    };
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment();
      if (!att || (!att.playerId && !att.wid)) continue;
      try {
        const msg = { t: 'lobby', room: summary };
        if (att.playerId) msg.you = att.playerId;
        ws.send(JSON.stringify(msg));
      } catch {}
    }
  }
}
