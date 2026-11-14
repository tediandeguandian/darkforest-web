import * as mod from './.test/bundle.mjs';
const { Room } = mod;

let pass=0, fail=0;
const ok=(c,m)=>{ if(c) pass++; else { fail++; console.log('  ✗ '+m); } };

function makeCtx() {
  const wsList = [];
  const map = new Map();
  const ctx = {
    alarmAt: null,
    storage: {
      async get(k) { return map.has(k) ? JSON.parse(map.get(k)) : undefined; },
      async put(k,v) { map.set(k, JSON.stringify(v)); },
      async setAlarm(t) { ctx.alarmAt = t; },
      async getAlarm() { return ctx.alarmAt; },
    },
    getWebSockets() { return wsList; },
    acceptWebSocket(ws) { wsList.push(ws); },
    _ws: wsList,
  };
  return ctx;
}
function makeWS() {
  let att = null;
  return {
    sent: [],
    serializeAttachment(a) { att = a; },
    deserializeAttachment() { return att; },
    send(s) { this.sent.push(JSON.parse(s)); },
    close() {},
  };
}
const msg = (ws, o) => ws.sent.push; // noop
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function send(room, ws, obj) { await room.webSocketMessage(ws, JSON.stringify(obj)); }

const env = { META: null, AI_THINK_MIN: 3000, AI_THINK_MAX: 10000 };
const ctx = makeCtx();
let room = new Room(ctx, env);
await room.fetch(new Request('https://do/init?room=TEST1', { method: 'POST' }));
ok((await ctx.storage.get('room')).id === 'TEST1', 'init 应写入房号');

console.log('=== 1. 握手与座位 ===');
const w1 = makeWS(), w2 = makeWS(), w3 = makeWS();
[w1,w2,w3].forEach(w => ctx.acceptWebSocket(w));
await send(room, w1, { t: 'hello', name: 'A' });
await send(room, w2, { t: 'hello', name: 'B' });
await send(room, w3, { t: 'hello', name: 'C' });
ok(w1.sent.some(x => x.t === 'joined'), 'A 应收到 joined');
ok(w2.sent.find(x=>x.t==='joined').playerId === 'p1', 'B 应为 p1');
ok(w3.sent.find(x=>x.t==='joined').playerId === 'p2', 'C 应为 p2');
const tokenB = w2.sent.find(x => x.t === 'joined').token;
ok(!!tokenB, '应下发重连 token');

console.log('=== 2. 开局与视图裁剪 ===');
await send(room, w1, { t: 'start' });
const stateA = w1.sent.filter(x => x.t === 'state').pop();
ok(!!stateA, 'A 应收到 state');
ok(stateA.view.players.length === 3, '应 3 名玩家');
ok(stateA.view.players.filter(p => p.id !== 'p0').every(p => p.galaxy === null), '对手坐标不下发');
ok(stateA.view.players.filter(p => p.id !== 'p0').every(p => p.hand === null), '对手手牌不下发');
ok(stateA.view.players.find(p=>p.id==='p0').hand.length === 4, '自己 4 张手牌');

console.log('=== 3. 非房主不能开局 ===');
const room2ctx = makeCtx();
const room2 = new Room(room2ctx, env);
await room2.fetch(new Request('https://do/init', { method: 'POST' }));
const a2 = makeWS(), b2 = makeWS();
[a2,b2].forEach(w => room2ctx.acceptWebSocket(w));
await send(room2, a2, { t: 'hello', name: 'A' });
await send(room2, b2, { t: 'hello', name: 'B' });
await send(room2, b2, { t: 'start' });
ok(b2.sent.some(x => x.t === 'error' && /房主/.test(x.msg)), '非房主开局应被拒');

console.log('=== 4. 动作权威校验 ===');
const cur = stateA.view.currentPlayerId;
const other = stateA.view.players.find(p => p.id !== cur);
const otherWS = { p1: w2, p2: w3 }[other.id];
const before = otherWS.sent.length;
await send(room, otherWS, { t: 'act', action: { type: 'end' } });
ok(otherWS.sent.slice(before).some(x => x.t === 'error'), '非当前玩家结束回合应被拒');

console.log('=== 5. DO 休眠后状态恢复 ===');
const snapBefore = await ctx.storage.get('room');
ok(snapBefore && snapBefore.started === true, '状态应已持久化');
ok(!!snapBefore.snap, '应存有对局快照');
// 模拟休眠：丢弃内存，新建实例
room = new Room(ctx, env);
await send(room, w1, { t: 'hello', name: 'A', token: w1.sent.find(x=>x.t==='joined').token });
const afterWake = w1.sent.filter(x => x.t === 'state').pop();
ok(!!afterWake, '唤醒后应能恢复对局并推送 state');
ok(afterWake.view.players.length === 3, '唤醒后玩家数正确');
ok(afterWake.view.turnIndex === stateA.view.turnIndex, '唤醒后回合数一致');
console.log('  唤醒后手牌数:', afterWake.view.players.find(p=>p.id===afterWake.view.me.id).hand.length);

console.log('=== 6. 重连恢复原席位 ===');
const w2b = makeWS();
ctx.acceptWebSocket(w2b);
await send(room, w2b, { t: 'hello', token: tokenB });
const joinedB = w2b.sent.find(x => x.t === 'joined');
ok(joinedB && joinedB.playerId === 'p1', '重连应回到 p1，实际 ' + (joinedB && joinedB.playerId));

console.log('=== 7. 满员与开局后禁止加入 ===');
const w9 = [];
for (let i = 0; i < 6; i++) { const w = makeWS(); ctx.acceptWebSocket(w); w9.push(w); await send(room, w, { t: 'hello', name: 'X'+i }); }
const extra = makeWS(); ctx.acceptWebSocket(extra);
await send(room, extra, { t: 'hello', name: 'Y' });
ok(extra.sent.some(x => x.t === 'error'), '开局后新玩家应被拒');

console.log('=== 8. 人机席位 ===');
const ctx5 = makeCtx();
const room5 = new Room(ctx5, env);
await room5.fetch(new Request('https://do/init?room=AI01', { method: 'POST' }));
const h5 = makeWS(); ctx5.acceptWebSocket(h5);
await send(room5, h5, { t: 'hello', name: '人类' });
await send(room5, h5, { t: 'addAI', level: 'sophon' });
room5.data.seats[1].aiSeed = 4242;   // 固定种子，避免随机行为导致断言抖动
const lob = h5.sent.filter(x => x.t === 'lobby').pop();
ok(lob && lob.room.seats.length === 2, '人机应占一个席位');
ok(lob && lob.room.seats[1].isAI === true && lob.room.seats[1].aiLevel === 'sophon', '席位标记为人机/智子');
ok(lob && lob.room.levels && lob.room.levels.length === 4, '大厅应下发四难度');

await send(room5, h5, { t: 'start' });
// 人类先手：开局时不该有人机在"思考"
ok(!ctx5.alarmAt, '人类先手时不应为人机排 alarm');

// 人类结束回合 → 轮到人机：只排一个 5–10 秒的 alarm，不秒出牌
await send(room5, h5, { t: 'act', action: { type: 'end' } });
ok(!!ctx5.alarmAt, '轮到人机时应排 alarm');
const thinkGap = ctx5.alarmAt - Date.now();
ok(thinkGap >= 3000 && thinkGap <= 11000, '思考延迟应在 5–10 秒量级，实际 ' + thinkGap + 'ms');
const stBefore = h5.sent.filter(x => x.t === 'state').pop();
ok(stBefore && stBefore.view.currentPlayerId === 'p1', '当前玩家应是人机，实际 ' + (stBefore && stBefore.view.currentPlayerId));
ok(stBefore && stBefore.view.thinking === true, '应下发 thinking 状态供前端显示"人机思考中"');
ok(stBefore && stBefore.view.turnIndex === 2, '人机尚未落子，回合数不应推进');

// 模拟 alarm 到点：人机走一步
await room5.alarm();
const stAi = h5.sent.filter(x => x.t === 'state').pop();
// 一个动作可能只是"建造"（手牌/能量变了但回合没结束），所以要看整体状态差异
const sig = v => {
  const me = v.players.find(p => p.id === 'p1');
  return [me.handCount, me.energy, me.buildZone.length, me.strikes.length,
          v.discard.current.length, v.broadcast ? 1 : 0, v.turnIndex].join('/');
};
ok(stAi && sig(stAi.view) !== sig(stBefore.view),
  'alarm 后人机应已行动：前 ' + sig(stBefore.view) + ' 后 ' + (stAi && sig(stAi.view)));
ok(stAi && stAi.view.players.find(p => p.id === 'p1' && p.id !== stAi.view.me.id).galaxy === null,
  '人机坐标同样不下发给人类');

console.log('=== 9. 广播超时（DO alarm）===');
const ctx6 = makeCtx();
const room6 = new Room(ctx6, env);
await room6.fetch(new Request('https://do/init?room=BC01', { method: 'POST' }));
const w6a = makeWS(), w6b = makeWS();
ctx6.acceptWebSocket(w6a); ctx6.acceptWebSocket(w6b);
await send(room6, w6a, { t: 'hello', name: 'A' });
await send(room6, w6b, { t: 'hello', name: 'B' });
await send(room6, w6a, { t: 'start' });

// 直接改状态构造"没人能回应"的广播
const g6 = room6.gameFromSnap();
const S6 = g6.state();
S6.players[0].galaxy = 1; S6.players[1].galaxy = 5;
S6.players[0].energy = 10;
S6.players[0].hand = [{ uid: 'x9', key: 'star_coop' }];
S6.players[1].hand = [{ uid: 'y9', key: 'nuke' }];      // 没有广播牌 → 无法回应
S6.currentIdx = 0; S6.step = 'action';
g6.playBroadcast('p0', 'x9', 2);
const left6 = S6.broadcast.deadline - Date.now();
ok(left6 >= 4500 && left6 <= 20500, '无人可回应应等 5–20 秒，实际 ' + left6 + 'ms');
ok(S6.broadcast.stage === 'collecting', '没人能回应也先进入等待');
S6.broadcast.deadline = Date.now() - 1;                 // 手动过期，模拟 alarm 到点
room6.data.snap = g6.state();
await room6.alarm();
const after6 = room6.gameFromSnap().state();
ok(after6.broadcast === null, 'alarm 应结算过期广播');
ok(after6.players[0].energy === 11, '无人回应发布者 +1，实际 ' + after6.players[0].energy);

console.log('=== 10. 观战：只读连接 ===');
const ctx7 = makeCtx();
const room7 = new Room(ctx7, env);
await room7.fetch(new Request('https://do/init?room=SP01', { method: 'POST' }));
const h7 = makeWS(), g7 = makeWS();
ctx7.acceptWebSocket(h7); ctx7.acceptWebSocket(g7);
await send(room7, h7, { t: 'hello', name: 'A' });
await send(room7, g7, { t: 'hello', name: 'B' });
await send(room7, h7, { t: 'start' });

const wv = makeWS();
ctx7.acceptWebSocket(wv);
await send(room7, wv, { t: 'hello', spectate: true });
const jv = wv.sent.find(x => x.t === 'joined');
ok(!!jv && jv.spectator === true, '观战者应收到 spectator joined');
ok(!!jv && !jv.playerId && !jv.token, '观战者不该拿到席位与重连 token');
const sv = wv.sent.filter(x => x.t === 'state').pop();
ok(!!sv && sv.view.spectator === true, '观战者应收到观战视图');
ok(!!sv && sv.view.me === null, '观战视图没有「我」');
ok(!!sv && sv.view.players.every(p => p.galaxy === null), '观战视图不下发任何人的坐标');
ok(!!sv && sv.view.players.every(p => p.hand === null), '观战视图不下发任何人的手牌');
ok(room7.data.seats.length === 2, '观战不应占席位，实际 ' + room7.data.seats.length);

// 观战者操作：拒绝，且局面不变
const turnBefore = room7.gameFromSnap().state().turnIndex;
await send(room7, wv, { t: 'act', action: { type: 'end' } });
ok(wv.sent.some(x => x.t === 'error' && /观战/.test(x.msg)), '观战者不能操作对局');
ok(room7.gameFromSnap().state().turnIndex === turnBefore, '被拒的动作不该改变局面');

// 玩家行动后，观战者要跟着收到新状态
const beforeN = wv.sent.filter(x => x.t === 'state').length;
await send(room7, h7, { t: 'act', action: { type: 'end' } });
ok(wv.sent.filter(x => x.t === 'state').length > beforeN, '玩家行动后观战者应收到新 state');


console.log('=== 11. 房主：显式身份与转让 ===');
const ctx8 = makeCtx();
const room8 = new Room(ctx8, env);
await room8.fetch(new Request('https://do/init?room=HOST1', { method: 'POST' }));
const a8 = makeWS(), b8 = makeWS();
ctx8.acceptWebSocket(a8); ctx8.acceptWebSocket(b8);
await send(room8, a8, { t: 'hello', name: 'A' });
await send(room8, b8, { t: 'hello', name: 'B' });
ok(room8.hostId() === 'p0', '第一个进来的人应是房主，实际 ' + room8.hostId());

await send(room8, b8, { t: 'transferHost', playerId: 'p0' });
ok(b8.sent.some(x => x.t === 'error' && /只有房主/.test(x.msg)), '非房主不能转让房主');

await send(room8, a8, { t: 'transferHost', playerId: 'p1' });
const lob8 = a8.sent.filter(x => x.t === 'lobby').pop();
ok(!!lob8 && lob8.room.hostId === 'p1', '转让后大厅的房主应是 p1，实际 ' + (lob8 && lob8.room.hostId));
ok(room8.hostId() === 'p1', '转让后 hostId() 应立刻生效');

/* 转让不只是换个牌子：权限要真的跟着走 */
await send(room8, a8, { t: 'mode', mode: 'fast' });
ok(a8.sent.some(x => x.t === 'error' && /房主/.test(x.msg)), '原房主转让后不能再改规则');
await send(room8, b8, { t: 'mode', mode: 'fast' });
ok(room8.data.mode === 'fast', '新房主应能改规则，实际 ' + room8.data.mode);

/* 只能给真人 */
await send(room8, b8, { t: 'addAI', level: 'chaotic_era' });
const ai8 = room8.data.seats.find(s => s.isAI);
ok(!!ai8, '应加上一个人机');
await send(room8, b8, { t: 'transferHost', playerId: ai8.playerId });
ok(b8.sent.some(x => x.t === 'error' && /真人/.test(x.msg)), '不能把房主转给人机');
ok(room8.hostId() === 'p1', '被拒的转让不该改变房主');

/* 开局之后没必要（也没有意义）再转让：房主权限在局内不生效 */
await send(room8, b8, { t: 'start' });
ok(room8.data.started, '应能开局');
await send(room8, b8, { t: 'transferHost', playerId: 'p0' });
ok(b8.sent.some(x => x.t === 'error' && /已经开始/.test(x.msg)), '开局后不能再转让房主');

console.log('=== 12. 房主离开：自动交给下一个真人，连接不失效 ===');
const ctx9 = makeCtx();
const room9 = new Room(ctx9, env);
await room9.fetch(new Request('https://do/init?room=HOST2', { method: 'POST' }));
const a9 = makeWS(), b9 = makeWS();
ctx9.acceptWebSocket(a9); ctx9.acceptWebSocket(b9);
await send(room9, a9, { t: 'hello', name: 'A' });
await send(room9, b9, { t: 'hello', name: 'B' });
ok(room9.hostId() === 'p0', 'A 是房主');
await send(room9, a9, { t: 'leave' });
ok(room9.data.seats.length === 1, '未开局时离开应删掉席位');
ok(room9.hostId() === 'p0', '房主应自动交给留下的 B（重排后是 p0），实际 ' + room9.hostId());
/* 关键回归：席位重排改了 playerId，B 那条连接的 attachment 必须跟着改，
   否则他下一条消息就会被当成「席位不存在」。 */
b9.sent.length = 0;
await send(room9, b9, { t: 'addAI', level: 'chaotic_era' });
ok(!b9.sent.some(x => x.t === 'error'), '重排后原连接的席位仍然有效，不该报错：' + JSON.stringify(b9.sent.filter(x => x.t === 'error')));
ok(room9.data.seats.some(s => s.isAI), '新房主应能添加人机');

console.log('=== 13. 观战席：入座、起身、开局后锁死 ===');
const ctx10 = makeCtx();
const room10 = new Room(ctx10, env);
await room10.fetch(new Request('https://do/init?room=SPEC1', { method: 'POST' }));
const a10 = makeWS(), b10 = makeWS(), c10 = makeWS();
ctx10.acceptWebSocket(a10); ctx10.acceptWebSocket(b10); ctx10.acceptWebSocket(c10);
await send(room10, a10, { t: 'hello', name: 'A' });
await send(room10, b10, { t: 'hello', name: 'B' });

await send(room10, c10, { t: 'hello', spectate: true, name: '看客' });
const j10 = c10.sent.find(x => x.t === 'joined');
ok(!!j10 && j10.spectator === true && !!j10.wid, '观战者应拿到 wid');
ok(room10.data.seats.length === 2, '观战不占玩家席');
ok(room10.data.watchers.length === 1, '观战席应有 1 人，实际 ' + room10.data.watchers.length);
const lob10 = a10.sent.filter(x => x.t === 'lobby').pop();
ok(!!lob10 && lob10.room.watchers.length === 1, '大厅推送里应带上观战席');
ok(!!lob10 && lob10.room.watchers[0].name === '看客', '观战席应显示名字');

/* 观战者入座 */
await send(room10, c10, { t: 'sit' });
const j10b = c10.sent.filter(x => x.t === 'joined').pop();
ok(!!j10b && !!j10b.playerId && !!j10b.token, '入座后应拿到席位与重连 token');
ok(room10.data.seats.length === 3, '入座后应占一个玩家席，实际 ' + room10.data.seats.length);
ok(room10.data.watchers.length === 0, '入座后应从观战席移除');

/* 入座之后能正常操作（不再被当成观战者） */
await send(room10, c10, { t: 'mode', mode: 'fast' });
ok(c10.sent.some(x => x.t === 'error' && /只有房主/.test(x.msg)),
  '入座后应按玩家身份处理（这里是因为他不是房主而被拒，而不是"观战中不能操作"');

/* 玩家起身去观战 */
await send(room10, b10, { t: 'spectate' });
const j10c = b10.sent.filter(x => x.t === 'joined').pop();
ok(!!j10c && j10c.spectator === true, '起身后应收到观战 joined');
ok(b10.sent.some(x => x.t === 'unseat'), '起身后要通知前端作废原席位 token');
ok(room10.data.seats.length === 2, '起身后应让出席位，实际 ' + room10.data.seats.length);
ok(room10.data.watchers.length === 1, '起身后应出现在观战席');

/* 起身之后不能再操作 */
const seatsBefore10 = room10.data.seats.length;
await send(room10, b10, { t: 'act', action: { type: 'end' } });
ok(b10.sent.some(x => x.t === 'error' && /观战/.test(x.msg)), '观战席上不能操作对局');
ok(room10.data.seats.length === seatsBefore10, '被拒的动作不该改变房间');

/* 开局后两种切换都要拒绝 */
await send(room10, a10, { t: 'start' });
ok(room10.data.started, '应能开局');
await send(room10, b10, { t: 'sit' });
ok(b10.sent.some(x => x.t === 'error' && /已开始/.test(x.msg)), '开局后观战者不能再入座');
await send(room10, a10, { t: 'spectate' });
ok(a10.sent.some(x => x.t === 'error' && /已开始/.test(x.msg)), '开局后玩家不能转观战');
ok(room10.data.seats.length === 2, '被拒的切换不该改变席位');

/* 观战者断开：从观战席摘掉，不留幽灵（此刻 b10 才是观战席上的人） */
await room10.webSocketClose(b10);
ok(room10.data.watchers.length === 0, '观战连接断开后应从观战席移除');

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
