/* ============================================================
 * server/room.js — 房间与席位（含人机）
 * ============================================================ */
const crypto = require('crypto');
const { createGame } = require('../shared/rules.js');
const { LEVELS } = require('../shared/ai.js');

const rooms = new Map();
const ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉易混字符

function makeRoomId() {
  let id;
  do {
    id = Array.from({ length: 5 }, () => ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)]).join('');
  } while (rooms.has(id));
  return id;
}

class Room {
  constructor() {
    this.id = makeRoomId();
    this.seats = [];        // { playerId, token, name, ws, connected, isAI, aiLevel, aiSeed }
    this.game = null;
    this.started = false;
    this.aiRunning = false;
    this.thinking = false;   // 人机是否正在"思考"（前端显示倒计时/思考中）
    this.aiSeq = 0;
    this.mode = 'standard';   // standard / fast，房主可在开局前切换
    this.strikeTarget = 'open';   // open（全场可见目标）/ hidden（只公开类型与已飞手数）
    this.createdAt = Date.now();
    this.lastActive = Date.now();
    rooms.set(this.id, this);
  }

  get hostId() { return this.seats[0] ? this.seats[0].playerId : null; }

  /** 席位变动后重排 playerId（与引擎 players 下标一一对应） */
  reindex() {
    this.seats.forEach((s, i) => { s.playerId = 'p' + i; });
  }

  join(name, ws) {
    if (this.started) return { error: '对局已开始，无法加入' };
    if (this.seats.length >= 9) return { error: '房间已满（最多 9 人）' };
    const playerId = 'p' + this.seats.length;
    const token = crypto.randomBytes(16).toString('hex');
    this.seats.push({
      playerId, token, name: String(name || '').slice(0, 12) || ('玩家 ' + (this.seats.length + 1)),
      ws, connected: true, isAI: false,
    });
    this.lastActive = Date.now();
    return { playerId, token, seat: this.seats.length - 1 };
  }

  addAI(byPlayerId, level) {
    if (this.started) return { error: '对局已开始，无法添加人机' };
    if (byPlayerId !== this.hostId) return { error: '只有房主可以添加人机' };
    if (this.seats.length >= 9) return { error: '房间已满（最多 9 人）' };
    const lv = LEVELS[level] ? level : 'chaotic_era';
    const n = ++this.aiSeq;
    this.seats.push({
      playerId: 'p' + this.seats.length,
      token: null,
      name: `${LEVELS[lv].name}·${n}号`,
      ws: null, connected: true, isAI: true,
      aiLevel: lv, aiSeed: 1 + Math.floor(Math.random() * 2147483646),
    });
    this.lastActive = Date.now();
    return { ok: true, playerId: this.seats[this.seats.length - 1].playerId };
  }

  removeAI(byPlayerId, targetId) {
    if (this.started) return { error: '对局已开始，无法移除人机' };
    if (byPlayerId !== this.hostId) return { error: '只有房主可以移除人机' };
    const seat = this.seats.find(s => s.playerId === targetId && s.isAI);
    if (!seat) return { error: '没有这个人机' };
    this.seats = this.seats.filter(s => s !== seat);
    this.reindex();
    this.lastActive = Date.now();
    return { ok: true };
  }

  /** 给 runAI 用的席位表：只包含人机 */
  aiSeats() {
    const m = new Map();
    this.seats.forEach(s => {
      if (s.isAI) m.set(s.playerId, { level: s.aiLevel, seed: s.aiSeed });
    });
    return m;
  }

  rejoin(token, ws) {
    const seat = this.seats.find(s => s.token === token);
    if (!seat) return { error: '重连凭证无效' };
    seat.ws = ws;
    seat.connected = true;
    this.lastActive = Date.now();
    return { playerId: seat.playerId, seat: this.seats.indexOf(seat) };
  }

  leave(playerId) {
    // 对局中只标记断开，保留席位以便重连
    const seat = this.seats.find(s => s.playerId === playerId);
    if (!seat) return;
    seat.connected = false;
    seat.ws = null;
    if (!this.started) {
      // 未开局：直接移除，并重排后面的 playerId
      this.seats = this.seats.filter(s => s !== seat);
      this.reindex();
    }
    this.lastActive = Date.now();
  }

  setMode(byPlayerId, mode) {
    if (this.started) return { error: '对局已经开始，无法修改规则' };
    if (byPlayerId !== this.hostId) return { error: '只有房主可以修改房间规则' };
    this.mode = mode === 'fast' ? 'fast' : 'standard';
    this.lastActive = Date.now();
    return { ok: true, mode: this.mode };
  }

  /** 打击目标是否公开。开启＝旧行为；关闭＝只留「谁 · 哪种 · 已飞几手」 */
  setStrikeTarget(byPlayerId, value) {
    if (this.started) return { error: '对局已经开始，无法修改规则' };
    if (byPlayerId !== this.hostId) return { error: '只有房主可以修改房间规则' };
    this.strikeTarget = value === 'hidden' ? 'hidden' : 'open';
    this.lastActive = Date.now();
    return { ok: true, strikeTarget: this.strikeTarget };
  }

  start(byPlayerId) {
    if (this.started) return { error: '对局已经开始' };
    if (byPlayerId !== this.hostId) return { error: '只有房主可以开始对局' };
    if (this.seats.length < 2) return { error: '至少需要 2 名玩家（可添加人机）' };
    const names = this.seats.map(s => s.name);
    this.game = createGame(names, { mode: this.mode, strikeTarget: this.strikeTarget });
    this.started = true;
    this.lastActive = Date.now();
    return { ok: true };
  }

  /** 未开局时的房间摘要 */
  summary() {
    return {
      roomId: this.id,
      hostId: this.hostId,
      started: this.started,
      mode: this.mode,
      strikeTarget: this.strikeTarget,
      seats: this.seats.map(s => ({
        playerId: s.playerId, name: s.name, connected: s.connected,
        isAI: !!s.isAI, aiLevel: s.aiLevel || null,
      })),
      levels: Object.values(LEVELS).map(l => ({ key: l.key, name: l.name, blurb: l.blurb, retention: l.retention })),
    };
  }
}

function getRoom(id) {
  return rooms.get(String(id || '').toUpperCase()) || null;
}

function sweep(maxIdleMs = 3 * 3600 * 1000) {
  const now = Date.now();
  for (const [id, r] of rooms) {
    const anyOnline = r.seats.some(s => s.connected && !s.isAI);
    if (!anyOnline && now - r.lastActive > maxIdleMs) rooms.delete(id);
  }
}
setInterval(sweep, 10 * 60 * 1000).unref?.();

module.exports = { Room, getRoom, rooms };
