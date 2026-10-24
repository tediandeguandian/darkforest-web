/* ============================================================
 * web/js/net.js — WebSocket 客户端
 * 协议：GET /api/create 建房 → WS /ws?room=ID → hello
 * 同时兼容 Node 后端与 Cloudflare Workers（Durable Object）
 * ============================================================ */

const Net = (() => {
  let ws = null;
  let retry = 0;
  let manualClose = false;
  let handlers = [];
  let pendingRoom = null;   // 本次要进入的房间
  let pendingName = null;

  const state = { view: null, room: null, me: null, connected: false, roomId: null };

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

  function wsUrl(roomId) {
    if (DF_SERVER) {
      const u = new URL(DF_SERVER);
      const proto = u.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${u.host}/ws?room=${encodeURIComponent(roomId)}`;
    }
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/ws?room=${encodeURIComponent(roomId)}`;
  }

  function open(roomId, name = null, token = null) {
    pendingRoom = roomId;
    pendingName = name;
    state.roomId = roomId;

    if (ws) { try { manualClose = true; ws.close(); } catch {} ws = null; }
    manualClose = false;

    ws = new WebSocket(wsUrl(roomId));

    ws.onopen = () => {
      retry = 0;
      state.connected = true;
      emit('open');
      const t = token || LS.get('df_token');
      ws.send(JSON.stringify({ t: 'hello', name: pendingName || LS.get('df_name') || '玩家', token: t || undefined }));
    };

    ws.onmessage = ev => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      switch (m.t) {
        case 'joined':
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
        case 'error':
          emit('error', m.msg);
          if (/房间不存在|已过期|失效/.test(m.msg)) { LS.del('df_token'); LS.del('df_room'); }
          break;
      }
    };

    ws.onclose = () => {
      state.connected = false;
      emit('close');
      if (manualClose) return;
      retry++;
      emit('reconnecting', retry);
      // 只要还有房间就自动重连（指数退避）
      const room = pendingRoom || LS.get('df_room');
      if (!room) return;
      const delay = Math.min(8000, 500 * Math.pow(1.6, retry));
      setTimeout(() => {
        if (!state.connected) open(room, pendingName, LS.get('df_token'));
      }, delay);
    };

    ws.onerror = () => {};
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
        open(roomId, name);
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
      open(String(roomId).toUpperCase(), name);
    },

    send(obj) {
      if (!ws || ws.readyState !== 1) { emit('error', '连接已断开，正在重连…'); return false; }
      ws.send(JSON.stringify(obj));
      return true;
    },

    start() { this.send({ t: 'start' }); },
    act(action) { this.send({ t: 'act', action }); },
    addAI(level) { this.send({ t: 'addAI', level }); },
    removeAI(playerId) { this.send({ t: 'removeAI', playerId }); },

    leave() {
      manualClose = true;
      try { this.send({ t: 'leave' }); } catch {}
      try { ws && ws.close(); } catch {}
      LS.del('df_token'); LS.del('df_room');
      state.view = null; state.room = null; state.me = null; state.roomId = null;
      pendingRoom = null;
    },

    on: fn => handlers.push(fn),
    get view() { return state.view; },
    get room() { return state.room; },
    get me() { return state.me; },
    get connected() { return state.connected; },
    get roomId() { return state.roomId; },
    name() { return LS.get('df_name') || ''; },
    setName(n) { LS.set('df_name', n); },
    hasSession() { return !!(LS.get('df_token') && LS.get('df_room')); },
  };
})();
