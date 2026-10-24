const WebSocket = require('ws');
const URL = 'ws://localhost:8080/ws';
const N = 9;

const clients = [];
let roomId = null;
const states = new Array(N).fill(null);
const log = (...a) => console.log(...a);

function connect(i) {
  return new Promise((resolve) => {
    const ws = new WebSocket(URL);
    const c = { i, ws, token: null, playerId: null, states: [] };
    ws.on('open', () => resolve(c));
    ws.on('message', raw => {
      const m = JSON.parse(raw);
      if (m.t === 'joined') { c.token = m.token; c.playerId = m.playerId; }
      if (m.t === 'lobby') { c.roomId = m.room.roomId; roomId = m.room.roomId; }
      if (m.t === 'state') { c.states.push(m.view); states[i] = m.view; }
      if (m.t === 'error') { c.lastError = m.msg; }
    });
    clients.push(c);
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const send = (c, o) => c.ws.send(JSON.stringify(o));

(async () => {
  let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) pass++; else { fail++; log('  ✗ ' + m); } };

  for (let i = 0; i < N; i++) await connect(i);
  send(clients[0], { t: 'create', name: 'P0' });
  await sleep(300);
  for (let i = 1; i < N; i++) send(clients[i], { t: 'join', roomId, name: 'P' + i });
  await sleep(600);
  log('房间:', roomId, '| 座位:', clients[0].states.length);

  send(clients[0], { t: 'start' });
  await sleep(900);
  const v0 = states[0];
  ok(!!v0, '开局应收到 state');
  ok(v0.players.length === N, '应 9 名玩家');
  ok(v0.players.filter(p => p.id !== v0.me.id).every(p => p.galaxy === null), '对手坐标不下发');
  log('  P0 坐标:', v0.me.galaxy, '| 星系占用:', v0.players.filter(p=>p.id===v0.me.id).length);

  // P0 发广播到一个可达星系（9人局必有响应）
  const me = v0.players.find(p => p.id === v0.me.id);
  const bcard = me.hand.find(c => CARD_DEFS_REF[c.key] && CARD_DEFS_REF[c.key].type === 'broadcast');
  if (!bcard) { log('  手牌无广播牌，跳过广播测试'); }
  else {
    const def = CARD_DEFS_REF[bcard.key];
    const target = [1,2,3,4,5,6,7,8,9].find(g => DIST(me.galaxy, g) <= def.dist && g !== me.galaxy);
    send(clients[0], { t: 'act', action: { type: 'broadcast', uid: bcard.uid, galaxy: target } });
    await sleep(700);
    const bc = states[0].broadcast;
    ok(bc && bc.stage === 'collecting', '应进入收集阶段, 实际 ' + (bc && bc.stage));
    ok(bc && bc.responders === null, '收集阶段不泄露回应者');
    log('  候选人数:', bc.candidates.length);

    // 每个候选者在自己视图中提交
    let submitted = 0;
    for (let i = 1; i < N; i++) {
      const v = states[i];
      if (!v.broadcast) continue;
      const myCand = v.broadcast.candidates.find(c => c.playerId === v.me.id);
      if (!myCand || myCand.responded) continue;
      const opt = myCand.myOptions && myCand.myOptions[0];
      send(clients[i], { t: 'act', action: { type: 'respond', uid: opt ? opt.uid : null, face: opt ? opt.face : null } });
      submitted++;
    }
    await sleep(1200);
    log('  提交响应数:', submitted);
    const after = states[0];
    ok(after.broadcast === null || after.broadcast.stage === 'choosing', '应已结算或进入挑选, 实际 ' + (after.broadcast && after.broadcast.stage));

    // 若需挑选，发布者选第一个
    if (after.broadcast && after.broadcast.stage === 'choosing') {
      const r = after.broadcast.responders[0];
      send(clients[0], { t: 'act', action: { type: 'choose', targetId: r.playerId } });
      await sleep(600);
      ok(states[0].broadcast === null, '挑选后广播应结束');
    }
    ok(states[0].discard.current.length >= 2, '应有广播牌进入弃牌堆');
    log('  弃牌堆:', states[0].discard.current.map(d => d.key).join(','));
  }

  // 结束回合
  const t0 = states[0].turnIndex;
  send(clients[0], { t: 'act', action: { type: 'end' } });
  await sleep(500);
  ok(states[0].turnIndex === t0 + 1 || states[0].currentPlayerId !== states[0].me.id, '回合应推进');

  // 断线重连
  const token0 = clients[1].token, pid1 = clients[1].playerId;
  clients[1].ws.close();
  await sleep(400);
  const re = await connect(99);
  re.ws.send(JSON.stringify({ t: 'rejoin', roomId, token: token0 }));
  await sleep(700);
  ok(re.playerId === pid1, '重连应恢复同一席位, 实际 ' + re.playerId + ' vs ' + pid1);
  ok(re.states.length > 0, '重连后应收到完整 state');
  if (re.states.length) {
    const vv = re.states[re.states.length - 1];
    ok(vv.me.id === pid1, '重连后 me 正确');
    ok(vv.players.find(p => p.id === pid1).galaxy !== null, '重连后能看到自己坐标');
  }

  log(`\n结果: ${pass} 通过, ${fail} 失败`);
  clients.forEach(c => { try { c.ws.close(); } catch {} });
  process.exit(fail ? 1 : 0);
})();

// 引入常量
const { CARD_DEFS, galaxyDistance } = require('../shared/cards.js');
const CARD_DEFS_REF = CARD_DEFS;
const DIST = galaxyDistance;
