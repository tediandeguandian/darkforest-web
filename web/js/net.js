/* ============================================================
 * web/js/net.js — WebSocket 客户端
 * 协议：GET /api/create 建房 → WS /ws?room=ID → hello
 * 同时兼容 Node 后端与 Cloudflare Workers（Durable Object）
 * ============================================================ */

const Net = (() => {
  let ws = null;
  let retry = 0;
  let handlers = [];
  let pendingRoom = null;   // 本次要进入的房间
  let pendingName = null;

  const state = { view: null, room: null, me: null, connected: false, roomId: null, spectating: false };

  const LS = {
    get: k => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
    del: k => { try { localStorage.removeItem(k); } catch {} },
  };

  function emit(type, payload) {
    handlers.forEach(h => { try { h(type, payload); } catch (e) { console.error(e); } });
  }

  /**
   * 服务器基址。网页里留空＝同源；APK 里用 file:// 打开，
   * 由页面注入 window.DF_SERVER 指向线上服务器。
   */
  const DF_SERVER = (typeof window !== 'undefined' && window.DF_SERVER)
    ? String(window.DF_SERVER).replace(/\/+$/, '')
    : '';

  function httpUrl(path) {
    return DF_SERVER ? DF_SERVER + path : path;
  }

  /* 会话 token 随 URL 一起送：WebSocket 不能自定义请求头，而 Worker 那边
     会在升级前用 ?auth= 校验会话（Authorization 头在 ws 握手时不保证送达）。
     单机页 / 局域网页没有 Auth 模块，这里自然是空串。 */
  function authQuery() {
    const t = (typeof Auth !== 'undefined' && Auth.token) ? Auth.token : '';
    return t ? '&auth=' + encodeURIComponent(t) : '';
  }

  function wsUrl(roomId) {
    const q = `?room=${encodeURIComponent(roomId)}${authQuery()}`;
    if (DF_SERVER) {
      const u = new URL(DF_SERVER);
      const proto = u.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${u.host}/ws${q}`;
    }
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/ws${q}`;
  }

  /* 关闭旧连接 / 判断"这次 close 还算不算我们的"
     以前用一个共享的 manualClose 布尔值：open() 一进来就把它重置成 false，
     而旧 socket 的 onclose 是异步派发的——等它到的时候标志已经变回 false，
     于是自己主动关掉的那次也会被当成"掉线"：弹断线提示、还触发一轮自动重连。
     现在按 socket 实例打标记，旧连接的回调一律无视。 */
  const retire = sock => {
    if (!sock) return;
    sock._dfRetired = true;
    try { sock.close(); } catch {}
  };

  function open(roomId, name = null, token = null, opts = null) {
    pendingRoom = roomId;
    pendingName = name;
    state.roomId = roomId;
    if (opts && typeof opts.spectate === 'boolean') state.spectating = opts.spectate;

    const old = ws;
    ws = null;
    retire(old);

    const sock = new WebSocket(wsUrl(roomId));
    ws = sock;
    state.connected = false;
    const spectate = state.spectating;

    sock.onopen = () => {
      if (sock !== ws) return;
      retry = 0;
      state.connected = true;
      emit('open');
      const t = token || LS.get('df_token');
      /* 观战：不带 token（观战者没有席位），服务端只挂一条只读连接。
         带了 token 反而会被当成"原玩家重连"，直接接管席位。 */
      if (spectate) {
        sock.send(JSON.stringify({ t: 'hello', name: '观战者', spectate: true }));
      } else {
        sock.send(JSON.stringify({ t: 'hello', name: pendingName || LS.get('df_name') || '玩家', token: t || undefined }));
      }
    };

    sock.onmessage = ev => {
      if (sock !== ws) return;
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      switch (m.t) {
        case 'joined':
          if (m.spectator) {
            // 观战不写 localStorage：刷新页面就等于退出观战，不会"下次自动回到观战"
            state.me = null;
            state.roomId = m.roomId;
            state.spectating = true;
            emit('joined', m);
            break;
          }
          state.spectating = false;
          state.me = { playerId: m.playerId };
          state.roomId = m.roomId;
          LS.set('df_token', m.token);
          LS.set('df_room', m.roomId);
          emit('joined', m);
          break;
        case 'lobby':
          state.room = m.room;
          emit('lobby', m);
          break;
        case 'state':
          state.view = m.view;
          emit('state', m.view);
          break;
        case 'unseat':
          /* 座位已经交出去了：本地那条 token 立刻作废。
             不删的话刷新页面会拿它去"重连"，而席位其实已经不存在。 */
          LS.del('df_token');
          LS.del('df_room');
          state.me = null;
          break;
        case 'error':
          emit('error', m.msg);
          if (/房间不存在|已过期|失效/.test(m.msg)) { LS.del('df_token'); LS.del('df_room'); }
          break;
      }
    };

    sock.onclose = () => {
      /* 主动关闭（离开房间、换房间）或被新连接取代：这不是断线。
         以前这里先 emit('close') 再判断——用户点「返回」时提示条就亮起来，
         而回到主页后不会再建立连接，也就永远等不到 open 去把它关掉。 */
      if (sock._dfRetired || sock !== ws) return;
      state.connected = false;
      emit('close');
      retry++;
      emit('reconnecting', retry);
      // 只要还有房间就自动重连（指数退避）
      const room = pendingRoom || LS.get('df_room');
      if (!room) return;
      const delay = Math.min(8000, 500 * Math.pow(1.6, retry));
      setTimeout(() => {
        if (!state.connected && ws === sock) open(room, pendingName, LS.get('df_token'));
      }, delay);
    };

    sock.onerror = () => {};
  }

  return {
    /* 自动重连（页面加载时若存在会话） */
    autoResume() {
      const room = LS.get('df_room');
      const token = LS.get('df_token');
      if (room && token) open(room, LS.get('df_name'), token);
      return !!(room && token);
    },

    async createRoom(name) {
      LS.set('df_name', name);
      try {
        const res = await fetch(httpUrl('/api/create'), { method: 'GET' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const { roomId } = await res.json();
        LS.del('df_token');
        open(roomId, name, null, { spectate: false });
      } catch (e) {
        emit('error', '创建房间失败：' + e.message);
      }
    },

    /** 房主切换房间规则：standard / fast */
    setMode(mode) {
      this.send({ t: 'mode', mode: mode === 'fast' ? 'fast' : 'standard' });
    },

    /** 房主切换打击目标显示：open（公开）/ hidden（只公开类型与已飞手数） */
    setStrikeTarget(value) {
      this.send({ t: 'strikeTarget', value: value === 'hidden' ? 'hidden' : 'open' });
    },

    joinRoom(roomId, name) {
      LS.set('df_name', name);
      LS.del('df_token');
      open(String(roomId).toUpperCase(), name, null, { spectate: false });
    },

    /** 观战：只读进房，不占席位、不下发任何人的坐标与手牌 */
    watch(roomId) {
      const r = String(roomId || '').trim().toUpperCase();
      if (!r) { emit('error', '请输入对局码'); return false; }
      LS.del('df_token');
      open(r, null, null, { spectate: true });
      return true;
    },

    send(obj) {
      if (!ws || ws.readyState !== 1) {
        // 只有"确实还在房间里"才提示掉线；已经离开/还没进房就不该冒这句话
        if (pendingRoom) emit('error', '连接已断开，正在重连…');
        return false;
      }
      ws.send(JSON.stringify(obj));
      return true;
    },

    start() { this.send({ t: 'start' }); },

    /** 座位 → 观战席（仅开局前）。服务端会同时发回 joined(spectator) 与 unseat */
    toSpectator() { this.send({ t: 'spectate' }); },
    /** 观战席 → 座位（仅开局前、且房间没满） */
    sit() { this.send({ t: 'sit' }); },
    /** 转让房主：服务端只接受真人玩家 */
    transferHost(playerId) { this.send({ t: 'transferHost', playerId }); },
    act(action) { this.send({ t: 'act', action }); },
    addAI(level) { this.send({ t: 'addAI', level }); },
    removeAI(playerId) { this.send({ t: 'removeAI', playerId }); },

    leave() {
      const sock = ws;
      ws = null;                       // 先摘引用：之后到达的 onclose 一定被忽略
      if (sock && sock.readyState === 1) {
        // 直接写 socket，不走 send()（否则连接已断时会弹一句"正在重连"）
        try { sock.send(JSON.stringify({ t: 'leave' })); } catch {}
      }
      retire(sock);
      state.connected = false;
      state.view = null; state.room = null; state.me = null; state.roomId = null;
      state.spectating = false;
      pendingRoom = null;
      pendingName = null;
      retry = 0;
      LS.del('df_token'); LS.del('df_room');
    },

    on: fn => handlers.push(fn),
    get view() { return state.view; },
    get room() { return state.room; },
    get me() { return state.me; },
    get connected() { return state.connected; },
    get roomId() { return state.roomId; },
    get spectating() { return state.spectating; },
    name() { return LS.get('df_name') || ''; },
    setName(n) { LS.set('df_name', n); },
    hasSession() { return !!(LS.get('df_token') && LS.get('df_room')); },
  };
})();
