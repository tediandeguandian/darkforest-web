/* ============================================================
 * web/js/local.js — 本地对局版（无需服务器）
 * 与 net.js 暴露完全相同的接口，所以 ui.js 一行都不用改。
 * 规则引擎、可见性过滤、人机全部在浏览器里跑。
 * ============================================================ */

const Net = (() => {
  const state = { view: null, room: null, me: null, connected: true, roomId: null };
  let handlers = [];

  let game = null;              // createGame(...)
  let seats = [];               // { playerId, name, isAI, aiLevel, seed }
  let started = false;
  let mode = 'standard';        // standard / fast
  let strikeTarget = 'open';    // open / hidden：打击目标是否公开
  let thinking = false;
  let aiRunning = false;
  let aiTimer = null;
  let tickTimer = null;

  const ME = 'p0';

  /* ---------- 局域网（APK 内） ---------- */
  const HAS_ANDROID = (typeof window !== 'undefined' && !!window.Android);
  let lanOn = false;
  let lanBase = '';                // 主机页面是 file:// 打开的，必须走绝对地址
  let lanTimer = null;
  const remoteByLan = new Map();   // lanPid → gamePid

  function lanPush(to, obj) {
    if (!lanOn) return;
    const q = `pid=${encodeURIComponent(ME)}` + (to ? `&to=${encodeURIComponent(to)}` : '');
    fetch(`${lanBase}/api/push?${q}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) })
      .catch(() => {});
  }

  /** 把当前状态按人裁剪后发给每个远端 */
  function pushAll() {
    if (!lanOn || !game) return;
    remoteByLan.forEach((gamePid, lanPid) => {
      const v = viewFor(game, gamePid);
      if (v) v.thinking = thinking;
      lanPush(lanPid, { t: 'state', view: v });
    });
  }

  function pushLobbyAll() {
    if (!lanOn) return;
    remoteByLan.forEach((gamePid, lanPid) => {
      lanPush(lanPid, { t: 'lobby', room: { ...state.room, meId: gamePid } });
    });
  }

  async function lanLoop() {
    if (!lanOn) return;
    try {
      const res = await fetch(`${lanBase}/api/pull?pid=${encodeURIComponent(ME)}`);
      const j = await res.json();
      (j.msgs || []).forEach(m => {
        const d = m.data;
        if (!d) return;
        if (d.t === 'join') onRemoteJoin(m.from, d.name);
        else if (d.t === 'act' && d.action) onRemoteAct(m.from, d.action);
        else if (d.t === 'hello') { pushAll(); pushLobbyAll(); }
      });
    } catch (e) { /* 主机休眠/网络抖动，忽略 */ }
    lanTimer = setTimeout(lanLoop, 600);
  }

  function onRemoteJoin(lanPid, name) {
    if (remoteByLan.has(lanPid)) { pushAll(); return; }
    if (started) {                       // 开局后加入 → 直接给当前视图（观战/接手）
      remoteByLan.set(lanPid, null);
      lanPush(lanPid, { t: 'error', msg: '对局已开始，只能观战' });
      return;
    }
    if (seats.length >= 9) {
      lanPush(lanPid, { t: 'error', msg: '房间已满' });
      return;
    }
    const gamePid = 'p' + seats.length;
    remoteByLan.set(lanPid, gamePid);
    seats.push({ playerId: gamePid, name: (name || '玩家').slice(0, 12), isAI: false, lanPid });
    lanPush(lanPid, { t: 'joined', playerId: gamePid, roomId: state.roomId, token: gamePid });
    pushLobby();
    pushLobbyAll();
    if (game) pushAll();
  }

  function onRemoteAct(lanPid, action) {
    const gamePid = remoteByLan.get(lanPid);
    if (!game || !gamePid) return;
    const r = applyAndSettle(gamePid, action);
    if (!r.ok) { lanPush(lanPid, { t: 'error', msg: r.msg || '操作失败' }); return; }
    pushView();
    pushAll();
    driveAI();
  }

  /**
   * 走一步动作；如果这是广播回应且所有候选人都已表态，立即结算。
   * （不这么做就得等 60 秒超时——离线版没有服务端的轮询收尾）
   */
  function applyAndSettle(pid, action) {
    const r = applyAction(game, pid, action || {});
    if (r && r.ok && r.complete) {
      const f = game.finalizeBroadcast();
      if (f && f.ok) return f;
      if (f && f.needChoose) return { ok: true, needChoose: true };
    }
    return r;
  }

  function startLan() {
    if (!HAS_ANDROID || lanOn) return null;
    let info;
    try { info = JSON.parse(window.Android.lanStart()); } catch (e) { return null; }
    if (!info || !info.ok) return info;
    lanBase = `http://127.0.0.1:${info.port}`;
    lanOn = true;
    lanLoop();
    return info;
  }

  function stopLan() {
    lanOn = false;
    if (lanTimer) { clearTimeout(lanTimer); lanTimer = null; }
    remoteByLan.clear();
    try { window.Android && window.Android.lanStop(); } catch (e) {}
  }

  /* 人机"思考"时长：本地版比线上略短，避免单机等着无聊 */
  const AI_MIN = 2200;
  const AI_MAX = 4200;
  const thinkMs = () => AI_MIN + Math.floor(Math.random() * (AI_MAX - AI_MIN));

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const emit = (type, payload) => handlers.forEach(h => { try { h(type, payload); } catch (e) { console.error(e); } });

  const aiSeatMap = () => {
    const m = new Map();
    seats.forEach(s => { if (s.isAI) m.set(s.playerId, { level: s.aiLevel || 'chaotic_era', seed: s.aiSeed || 1 }); });
    return m;
  };

  const LEVELS_META = () => Object.values(LEVELS).map(l => ({
    key: l.key, name: l.name, blurb: l.blurb, retention: l.retention,
  }));

  function pushLobby() {
    state.room = {
      roomId: state.roomId,
      hostId: ME,
      started,
      mode,
      strikeTarget,
      seats: seats.map(s => ({
        playerId: s.playerId, name: s.name, connected: true,
        isAI: !!s.isAI, aiLevel: s.aiLevel || null,
      })),
      levels: LEVELS_META(),
    };
    emit('lobby', state.room);
    pushLobbyAll();
  }

  function pushView() {
    if (!game) return;
    const v = viewFor(game, ME);
    if (v) v.thinking = thinking;
    state.view = v;
    emit('state', v);
    pushAll();               // 局域网里的其他人同步收到各自裁剪后的视图
  }

  function aiPending() {
    if (!game) return false;
    const S = game.state();
    if (S.phase !== 'playing') return false;
    const seatsMap = aiSeatMap();
    if (!seatsMap.size) return false;
    // 光速飞船挂起时整局都在等那一个人
    if (S.escapePending) return seatsMap.has(S.escapePending.targetId);
    const cur = S.players[S.currentIdx];
    if (cur && seatsMap.has(cur.id)) return true;
    const B = S.broadcast;
    if (B) {
      return B.candidates.some(c =>
        seatsMap.has(c.playerId) &&
        !Object.prototype.hasOwnProperty.call(B.responses, c.playerId));
    }
    return false;
  }

  /** 人机一路走，直到轮到真人 */
  async function driveAI() {
    if (aiRunning || !game) return;
    aiRunning = true;
    try {
      for (let i = 0; i < 80; i++) {
        const S = game && game.state();
        if (!S || S.phase !== 'playing' || !aiPending()) break;

        thinking = true;
        pushView();                 // 先亮出"思考中"
        await sleep(thinkMs());
        if (!game) break;

        const played = runAI(game, aiSeatMap(), viewFor, { maxSteps: 1 });
        thinking = false;
        if (!played || !played.length) break;
        pushView();
        await sleep(260);
      }
    } finally {
      aiRunning = false;
      thinking = false;
      pushView();
    }
  }

  /** 超时推进（广播 60s / 光速飞船待决 30s） */
  function startTicker() {
    if (tickTimer) return;
    tickTimer = setInterval(() => {
      if (!game) return;
      const S = game.state();
      let changed = false;
      if (S.broadcast && game.tickBroadcast(Date.now()).changed) changed = true;
      if (S.escapePending && game.tickEscape(Date.now()).changed) changed = true;
      if (changed) {
        pushView();
        driveAI();
      }
    }, 700);
  }

  function stopTicker() {
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  }

  function reset() {
    game = null;
    seats = [];
    mode = 'standard';
    strikeTarget = 'open';
    started = false;
    thinking = false;
    aiRunning = false;
    state.view = null;
    state.room = null;
    state.me = null;
    state.roomId = null;
    stopTicker();
  }

  /* ---------------- 对外接口（与 net.js 一致） ---------------- */
  return {
    local: true,

    autoResume() { return false; },

    createRoom(name) {
      reset();
      state.roomId = 'LOCAL';
      state.me = { playerId: ME };
      seats = [{ playerId: ME, name: (name || '你').slice(0, 12), isAI: false }];
      emit('joined', { playerId: ME, roomId: state.roomId, token: 'local' });
      pushLobby();
    },

    joinRoom() {
      emit('error', '离线版不能加入别人的房间，请点「创建房间」');
    },

    addAI(level) {
      if (started) return emit('error', '对局已开始，无法添加人机');
      if (seats.length >= 9) return emit('error', '房间已满（最多 9 人）');
      const lv = LEVELS[level] ? level : 'chaotic_era';
      const aiCount = seats.filter(s => s.isAI).length + 1;
      seats.push({
        playerId: 'p' + seats.length,
        name: `${LEVELS[lv].name}·${aiCount}号`,
        isAI: true,
        aiLevel: lv,
        aiSeed: (Math.floor(Math.random() * 2000000000) + 1),
      });
      pushLobby();
    },

    removeAI(playerId) {
      if (started) return emit('error', '对局已开始，无法移除人机');
      const i = seats.findIndex(s => s.playerId === playerId && s.isAI);
      if (i < 0) return;
      seats.splice(i, 1);
      seats.forEach((s, k) => { s.playerId = 'p' + k; });
      if (seats[0]) seats[0].playerId = ME;
      pushLobby();
    },

    setMode(next) {
      if (started) return emit('error', '对局已经开始，无法修改规则');
      mode = next === 'fast' ? 'fast' : 'standard';
      pushLobby();
    },

    setStrikeTarget(next) {
      if (started) return emit('error', '对局已经开始，无法修改规则');
      strikeTarget = next === 'hidden' ? 'hidden' : 'open';
      pushLobby();
    },

    start() {
      if (started) return emit('error', '对局已经开始');
      if (seats.length < 2) return emit('error', '至少需要 2 名玩家');
      game = createGame(seats.map(s => s.name), { mode, strikeTarget });
      started = true;
      pushView();
      pushLobby();
      startTicker();
      driveAI();
    },

    act(action) {
      if (!game) return emit('error', '对局尚未开始');
      const r = applyAndSettle(ME, action || {});
      if (!r.ok) {
        emit('error', r.msg || '操作失败');
        pushView();
        return;
      }
      pushView();
      driveAI();
    },

    send() { return true; },

    leave() {
      reset();
    },

    /* 局域网（仅 APK 内可用） */
    canLan: HAS_ANDROID,
    startLan, stopLan,
    lanPeers: () => remoteByLan.size,
    lanUrl: () => {
      if (!HAS_ANDROID) return null;
      try {
        const info = JSON.parse(window.Android.lanInfo());
        return info && info.ok && info.urls && info.urls.length ? info.urls[0] : null;
      } catch (e) { return null; }
    },

    on: fn => handlers.push(fn),
    get view() { return state.view; },
    get room() { return state.room; },
    get me() { return state.me; },
    get connected() { return true; },
    get roomId() { return state.roomId; },
    name() { return ''; },
    setName() {},
    hasSession() { return false; },
  };
})();

window.Net = Net;
