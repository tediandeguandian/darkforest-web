/* ============================================================
 * web/js/net-lan.js — 局域网加入方（浏览器打开，连手机上的对战）
 * 与 net.js 暴露同样的接口，ui.js 不用改。
 * 传输：HTTP 短轮询（800ms），不依赖公网、不需要 WebSocket。
 * ============================================================ */

const Net = (() => {
  const state = { view: null, room: null, me: null, connected: false, roomId: null };
  let handlers = [];
  let pid = null;
  let polling = false;
  let timer = null;

  const emit = (type, payload) => handlers.forEach(h => { try { h(type, payload); } catch (e) { console.error(e); } });
  const api = (path) => path;

  async function post(path, body) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body == null ? '' : JSON.stringify(body),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json().catch(() => ({}));
  }

  async function pull() {
    if (!pid || polling) return;
    polling = true;
    try {
      const res = await fetch(`/api/pull?pid=${encodeURIComponent(pid)}`);
      const j = await res.json();
      (j.msgs || []).forEach(m => {
        const d = m.data;
        if (!d) return;
        if (d.t === 'state') {
          state.view = d.view;
          state.connected = true;
          emit('state', d.view);
        } else if (d.t === 'lobby') {
          state.room = d.room;
          emit('lobby', d.room);
        } else if (d.t === 'joined') {
          state.me = { playerId: d.playerId };
          emit('joined', d);
        } else if (d.t === 'error') {
          emit('error', d.msg || '操作失败');
        } else if (d.t === 'kicked') {
          emit('error', '房主结束了这一局');
        }
      });
    } catch (e) {
      state.connected = false;
    } finally {
      polling = false;
    }
  }

  function startPolling() {
    if (timer) return;
    timer = setInterval(pull, 800);
    pull();
  }

  return {
    local: false,
    lan: true,

    autoResume() { return false; },

    /** 加入方只能加入，不能建房 */
    createRoom() {
      emit('error', '局域网模式下请让主机在手机上创建对局，你在这里输入房主的地址加入');
    },

    async joinRoom(_roomId, name) {
      try {
        const j = await post('/api/join');
        pid = j.pid;
        state.roomId = 'LAN';
        state.me = { playerId: pid };
        emit('joined', { playerId: pid, roomId: 'LAN', token: pid });
        await post(`/api/push?pid=${encodeURIComponent(pid)}`, { t: 'join', pid, name: name || '玩家' });
        startPolling();
      } catch (e) {
        emit('error', '连不上主机：' + e.message);
      }
    },

    send(obj) {
      if (!pid) return false;
      post(`/api/push?pid=${encodeURIComponent(pid)}`, obj).catch(() => {});
      return true;
    },

    start() { emit('error', '请等房主开始对局'); },
    act(action) { this.send({ t: 'act', pid, action }); },
    addAI() { emit('error', '只有房主可以添加人机'); },
    removeAI() { emit('error', '只有房主可以移除人机'); },

    leave() {
      if (pid) post(`/api/leave?pid=${encodeURIComponent(pid)}`).catch(() => {});
      if (timer) { clearInterval(timer); timer = null; }
      pid = null;
      state.view = null; state.room = null; state.me = null;
    },

    on: fn => handlers.push(fn),
    get view() { return state.view; },
    get room() { return state.room; },
    get me() { return state.me; },
    get connected() { return state.connected; },
    get roomId() { return state.roomId; },
    name() { return ''; },
    setName() {},
    hasSession() { return false; },
  };
})();

window.Net = Net;
