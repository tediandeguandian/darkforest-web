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

const { createGame } = rulesPkg;
const { viewFor } = viewPkg;
const { runAI, LEVELS } = aiPkg;

const ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function makeRoomId() {
  return Array.from({ length: 5 }, () => ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)]).join('');
}

/* APK 用 file:// 打开页面，Origin 是 null，跨域必须显式放行 */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

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

    /* WebSocket：按房间名路由到对应 DO */
    if (url.pathname === '/ws') {
      const roomId = (url.searchParams.get('room') || '').toUpperCase();
      if (!roomId) return new Response('missing room', { status: 400 });
      const stub = env.ROOMS.get(env.ROOMS.idFromName(roomId));
      return stub.fetch(request);
    }

    /* 静态资源：/ → /web/index.html；/download/* → /web/download/*（对外的短链） */
    let pathname = url.pathname === '/' ? '/web/index.html' : url.pathname;
    if (pathname.startsWith('/download/')) pathname = '/web' + pathname;
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
    this.data = saved || { id: null, seats: [], started: false, snap: null, createdAt: Date.now(), mode: 'standard', strikeTarget: 'open' };
    this.data.mode = this.data.mode || 'standard';   // 旧房间没有这个字段
    this.data.strikeTarget = this.data.strikeTarget === 'hidden' ? 'hidden' : 'open';   // 同上
    return this.data;
  }

  async save() {
    await this.ctx.storage.put('room', this.data);
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
    const playerId = att.playerId;

    /* 握手：token 重连，否则占座 */
    if (m.t === 'hello') {
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
          name: String(m.name || '').slice(0, 12) || ('玩家 ' + (this.data.seats.length + 1)),
          isAI: false,
        };
        this.data.seats.push(seat);
        await this.save();
      }

      seat.connected = true;
      ws.serializeAttachment({ playerId: seat.playerId });
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

    if (!playerId) return this.send(ws, { t: 'error', msg: '尚未进入房间' });
    const seat = this.data.seats.find(s => s.playerId === playerId);
    if (!seat) return this.send(ws, { t: 'error', msg: '席位不存在' });

    /* 开局 */
    if (m.t === 'start') {
      if (this.data.started) return this.send(ws, { t: 'error', msg: '对局已经开始' });
      if (this.data.seats[0].playerId !== playerId) return this.send(ws, { t: 'error', msg: '只有房主可以开始对局' });
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
      if (this.data.seats[0] && this.data.seats[0].playerId !== playerId)
        return this.send(ws, { t: 'error', msg: '只有房主可以修改房间规则' });
      this.data.mode = m.mode === 'fast' ? 'fast' : 'standard';
      await this.save();
      this.pushLobby();
      return;
    }

    if (m.t === 'strikeTarget') {
      if (this.data.started) return this.send(ws, { t: 'error', msg: '对局已经开始，无法修改规则' });
      if (this.data.seats[0] && this.data.seats[0].playerId !== playerId)
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
    if (att.playerId) {
      const seat = this.data.seats.find(s => s.playerId === att.playerId);
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
    const host = this.data.seats[0];
    if (!host || host.playerId !== byPlayerId) return { error: '只有房主可以添加人机' };
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
    const host = this.data.seats[0];
    if (!host || host.playerId !== byPlayerId) return { error: '只有房主可以移除人机' };
    const seat = this.data.seats.find(s => s.playerId === targetId && s.isAI);
    if (!seat) return { error: '没有这个人机' };
    this.data.seats = this.data.seats.filter(s => s !== seat);
    this.data.seats.forEach((s, i) => { s.playerId = 'p' + i; });
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

  /** 人机思考时长（毫秒）：默认 5–10 秒，可用环境变量调 */
  thinkMs() {
    const min = Number((this.env && this.env.AI_THINK_MIN) || 5000);
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
      // 重排 playerId，避免空缺
      this.data.seats.forEach((s, i) => { s.playerId = 'p' + i; });
      await this.save();
      this.pushLobby();
    } else {
      await this.save();
      this.pushState();
    }
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
      if (!att || !att.playerId) continue;
      try {
        const v = viewFor(game, att.playerId);
        if (v) v.thinking = !!this.thinking;
        ws.send(JSON.stringify({ t: 'state', view: v }));
      } catch {}
    }
  }

  pushLobby() {
    const summary = {
      roomId: this.data.id,
      hostId: this.data.seats[0] ? this.data.seats[0].playerId : null,
      started: this.data.started,
      mode: this.data.mode || 'standard',
      strikeTarget: this.data.strikeTarget === 'hidden' ? 'hidden' : 'open',
      seats: this.data.seats.map(s => ({
        playerId: s.playerId, name: s.name, connected: s.connected !== false,
        isAI: !!s.isAI, aiLevel: s.aiLevel || null,
      })),
      levels: Object.values(LEVELS).map(l => ({ key: l.key, name: l.name, blurb: l.blurb, retention: l.retention })),
    };
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment();
      if (!att || !att.playerId) continue;
      try {
        ws.send(JSON.stringify({ t: 'lobby', room: summary, you: att.playerId }));
      } catch {}
    }
  }
}
