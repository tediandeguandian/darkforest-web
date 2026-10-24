const { createGame } = require('../shared/rules.js');
const { viewFor } = require('../shared/view.js');

let pass=0, fail=0;
const ok=(c,m)=>{ if(c) pass++; else { fail++; console.log('  ✗ '+m); } };

console.log('=== 1. 视图裁剪 ===');
const g = createGame(['A','B','C']);
const v0 = viewFor(g, 'p0');
const others = v0.players.filter(p => p.id !== 'p0');
ok(others.every(p => p.galaxy === null), '对手坐标必须为 null');
ok(others.every(p => p.hand === null), '对手手牌必须为 null');
ok(v0.players.find(p=>p.id==='p0').galaxy !== null, '自己坐标可见');
ok(v0.players.find(p=>p.id==='p0').hand.length === 4, '自己手牌可见');
ok(v0.deck === undefined, '牌库内容不下发');
console.log('  A 坐标:', v0.players[0].galaxy, '| B 坐标字段:', v0.players[1].galaxy);

console.log('=== 2. 动作权限 ===');
const S = g.state();
const notCurrent = S.players.find(p => p.id !== S.players[S.currentIdx].id);
let r = g.playBuild(notCurrent.id, notCurrent.hand[0]?.uid);
ok(r.ok === false && /还没轮到你/.test(r.msg), '非当前玩家不能行动: ' + r.msg);
r = g.endTurn(notCurrent.id);
ok(r.ok === false, '非当前玩家不能结束回合');

console.log('=== 3. 广播响应收集（服务端权威）===');
// 构造：p0 在 1，p1 在 2，p2 在 5；p0 有恒星广播，p1 有广播牌
S.players[0].galaxy = 1; S.players[1].galaxy = 2; S.players[2].galaxy = 5;
S.players[0].energy = 10; S.players[1].energy = 10;
S.players[0].hand = [{uid:'a1', key:'star_coop'}];
S.players[1].hand = [{uid:'b1', key:'star_coop'}];
S.players[2].hand = [];
S.currentIdx = 0; S.step = 'action';
r = g.playBroadcast('p0', 'a1', 2);
ok(r.ok === true, '广播应成功: ' + (r.msg||''));
const B = S.broadcast;
ok(B && B.stage === 'collecting', '应进入收集阶段');
ok(B.candidates.length === 1, '只有 p1 可回应，实际 ' + B.candidates.length);
ok(B.candidates[0].mandatory === true, 'p1 被点名应强制');

const vA = viewFor(g, 'p0');
ok(vA.broadcast.responders === null, '收集阶段不泄露回应者');
ok(vA.broadcast.candidates === undefined, '不向任何人下发候选者名单（等于公开谁手里有广播牌）');
ok(vA.broadcast.candidateCount === 1, '只给聚合数：1 人可回应');
ok(vA.broadcast.myCandidate === null, '非候选者没有 myCandidate');
const vB = viewFor(g, 'p1');
ok(vB.broadcast.myCandidate.options.length === 1, '候选者能看到自己的可选牌');
ok(vB.broadcast.myCandidate.mandatory === true, '候选者知道自己被点名');

// 非候选者不能响应
r = g.setResponse('p2', null, null);
ok(r.ok === false, '非候选者不能响应');

// p1 提交
r = g.setResponse('p1', 'b1', 'coop');
ok(r.ok === true && r.complete === true, 'p1 提交后应 complete');
const vA2 = viewFor(g, 'p0');
ok(vA2.broadcast.stage === 'collecting', '未 finalize 前仍在收集阶段');

// finalize
r = g.finalizeBroadcast();
ok(r.ok === true, 'finalize 应成功');
ok(r.autoResolved === true, '单人响应应自动结算');
ok(S.broadcast === null, '广播应结束');
ok(S.players[0].energy === 13, 'A 应 10→13，实际 ' + S.players[0].energy);
ok(S.players[1].energy === 13, 'B 应 10→13，实际 ' + S.players[1].energy);
ok(S.discard.current.length === 2, '结算后两张广播牌都应入堆，实际 ' + S.discard.current.length);
ok(S.discard.current[0].uid === 'a1' && S.discard.current[1].uid === 'b1',
  '入堆顺序应为 发布者(a1) → 响应者(b1)；展示层反转后回应牌在前，实际 ' +
  JSON.stringify(S.discard.current.map(d => d.uid)));

console.log('=== 4. 强制回应者不能弃权 ===');
const g2 = createGame(['A','B']);
const S2 = g2.state();
S2.players[0].galaxy = 1; S2.players[1].galaxy = 2;
S2.players[0].energy = 10;
S2.players[0].hand = [{uid:'x', key:'star_coop'}];
S2.players[1].hand = [{uid:'y', key:'star_coop'}];
S2.currentIdx = 0; S2.step = 'action';
g2.playBroadcast('p0', 'x', 2);
r = g2.setResponse('p1', null, null);
ok(r.ok === false, '强制回应者弃权应被拒绝: ' + r.msg);

console.log('=== 5. 监听基地可合法沉默 ===');
const g3 = createGame(['A','B']);
const S3 = g3.state();
S3.players[0].galaxy = 1; S3.players[1].galaxy = 2;
S3.players[0].energy = 10;
S3.players[0].hand = [{uid:'x', key:'star_coop'}];
S3.players[1].hand = [{uid:'y', key:'star_coop'}];
S3.players[1].buildZone = [{uid:'l', key:'listener'}];
S3.currentIdx = 0; S3.step = 'action';
g3.playBroadcast('p0', 'x', 2);
const B3 = S3.broadcast;
ok(B3.candidates[0].mandatory === false, '有监听基地则不强制');
r = g3.setResponse('p1', null, null);
ok(r.ok === true, '可沉默');
ok(g3.responsesComplete(), '沉默也算已响应');

console.log('=== 6. 多响应者由发布者挑选 ===');
const g4 = createGame(['A','B','C']);
const S4 = g4.state();
S4.players[0].galaxy = 1; S4.players[1].galaxy = 2; S4.players[2].galaxy = 1;
S4.players[0].energy = 10; S4.players[1].energy = 10; S4.players[2].energy = 10;
S4.players[0].hand = [{uid:'x', key:'star_coop'}];
S4.players[1].hand = [{uid:'y', key:'star_disg'}];
S4.players[2].hand = [{uid:'z', key:'star_coop'}];
S4.currentIdx = 0; S4.step = 'action';
g4.playBroadcast('p0', 'x', 2);
g4.setResponse('p1', 'y', 'disg');
g4.setResponse('p2', 'z', 'coop');
r = g4.finalizeBroadcast();
ok(r.needChoose === true, '两人响应应需挑选');
const v4 = viewFor(g4, 'p0');
ok(v4.broadcast.responders.length === 2, '揭晓 2 名回应者');
ok(v4.broadcast.isMyChoice === true, '发布者可挑选');
// 非发布者不能挑
r = g4.chooseResponder('p1', 'p2');
ok(r.ok === false, '非发布者不能挑选');
r = g4.chooseResponder('p1', 'p0');
ok(r.ok === true, '发布者可挑选');
ok(S4.players[0].energy === 10 && S4.players[1].energy === 15, 'A(合作)×B(伪装)：A 0，B +5 → 15，实际 A=' + S4.players[0].energy + ' B=' + S4.players[1].energy);

console.log('=== 7. 弃牌堆不下发归属 ===');
const g5 = createGame(['A','B'], { mode: 'fast' });   // 快速局：弃牌后不交棒，弃牌堆留在 current
const S5 = g5.state();
S5.currentIdx = 0; S5.step = 'action'; S5.players[0].energy = 10;
S5.players[0].hand.push({uid:'zz', key:'solar'});
g5.discardCards('p0', ['zz']);
const v5 = viewFor(g5, 'p0');
ok(v5.discard.current.length === 1, '应有 1 张弃牌');
ok(v5.discard.current[0].ownerId === undefined, '弃牌归属不得下发');
ok(v5.arrow && v5.arrow.playerId === 'p0', '箭头归属（当下可见）应下发');

console.log('=== 8. 弃牌堆最简说明（cardFacts）===');
const { CARD_DEFS, cardFacts } = require('../shared/cards.js');
// 3 个 "面未公开" 占位不进牌库，也不算一种牌
const keys = Object.keys(CARD_DEFS).filter(k => !CARD_DEFS[k].hidden);
ok(keys.length === 19, '共 19 种卡牌，实际 ' + keys.length);
ok(Object.keys(CARD_DEFS).length === 22, '另有 3 个未翻面占位');
const bad = keys.filter(k => {
  const f = cardFacts(k);
  return !f || typeof f.cost !== 'number' || !f.main || !f.sub;
});
ok(bad.length === 0, '每种牌都有能量/效果/条件，缺失: ' + bad.join(','));
ok(cardFacts('solar').main === '产能 +1' && cardFacts('solar').sub === '依赖恒星', '太阳能阵列：产能 + 依赖恒星');
ok(cardFacts('fusion').sub === '不依赖恒星', '聚变反应堆：不依赖恒星');
ok(cardFacts('photoid').main === '摧毁恒星', '光粒：摧毁恒星');
ok(cardFacts('annihilate').main === '摧毁恒星+建设', '湮灭：摧毁恒星+建设');
ok(cardFacts('dimension').main === '毁灭星系', '降维：毁灭星系');
ok(cardFacts('nuke').main === '无特殊效果', '热核：无特殊效果');
ok(cardFacts('ftl_coop').main === '距离 ∞', '超距广播：距离 ∞');
ok(cardFacts('cosmic_coop').main === '距离 2', '宇宙广播：距离 2');

console.log('=== 9. 人机系统 ===');
const { runAI, LEVELS, LEVEL_KEYS } = require('../shared/ai.js');
const { Room } = require('./room.js');

ok(Object.keys(LEVELS).length === 4, '应有四档难度');
ok(LEVELS.sophon.retention === 1 && LEVELS.dehydrator.retention < 0.5, '难度只差记忆保留率');

// 全 AI 对局：必须能打完，且从不产生非法动作
let simFail = 0, simIllegal = 0, simTurns = [];
for (let i = 0; i < 8; i++) {
  const levels = [LEVEL_KEYS[i % 4], LEVEL_KEYS[(i + 1) % 4], LEVEL_KEYS[(i + 2) % 4]];
  const gg = createGame(levels.map((lv, k) => lv + k));
  const seats = new Map(levels.map((lv, k) => ['p' + k, { level: lv, seed: 1000 + i * 97 + k }]));
  const played = runAI(gg, seats, viewFor, { maxSteps: 3000 });
  const gs = gg.state();
  simTurns.push(gs.turnIndex);
  if (gs.phase !== 'ended') simFail++;
  if (played.some(x => x.ok === false)) simIllegal++;
}
ok(simFail === 0, '全 AI 对局应全部结束，未结束 ' + simFail);
ok(simIllegal === 0, '全 AI 对局不应出现非法动作，出现 ' + simIllegal + ' 局');
console.log('  回合数样本:', simTurns.join(','));

// 房间权限
const room = new Room();
const host = room.join('房主', null);
ok(room.addAI(host.playerId, 'sophon').ok, '房主可添加人机');
ok(room.addAI('p9', 'sophon').error, '非房主不可添加人机');
ok(room.seats.length === 2 && room.seats[1].isAI, '人机占一个席位');
ok(room.seats[1].name.indexOf('智子') === 0, '人机名字用难度命名：' + room.seats[1].name);
ok(room.start(host.playerId).ok, '1 人 + 1 机可以开局');
ok(room.aiSeats().size === 1, 'aiSeats 只含人机');

const room2 = new Room();
const h2 = room2.join('房主', null);
room2.addAI(h2.playerId, 'dehydrator');
room2.addAI(h2.playerId, 'sophon');
const aiId = room2.seats[1].playerId;
ok(room2.removeAI(h2.playerId, aiId).ok, '房主可移除人机');
ok(room2.seats.length === 2, '移除后剩 2 席');
ok(room2.seats[1].playerId === 'p1', '移除后 playerId 重排');

console.log('=== 10. 弃牌规则：每回合一次、不限张数 ===');
const g6 = createGame(['A','B'], { mode: 'fast' });   // 快速局：弃牌后还能继续行动
const S6 = g6.state();
S6.currentIdx = 0; S6.step = 'action'; S6.players[0].energy = 5;
const uids6 = S6.players[0].hand.map(c => c.uid);
let r6 = g6.discardCards('p0', uids6.slice(0, 3));
ok(r6.ok === true, '一次弃 3 张应成功: ' + (r6.msg || ''));
ok(S6.players[0].hand.length === 4, '弃后应补满 4 张，实际 ' + S6.players[0].hand.length);
ok(S6.discard.current.length === 3, '弃牌堆应有 3 张');
ok(S6.discardUsed === true, '应标记本回合已弃置');
r6 = g6.discardCards('p0', [S6.players[0].hand[0].uid]);
ok(r6.ok === false && /弃置过/.test(r6.msg), '同回合第二次弃置应被拒: ' + r6.msg);
g6.endTurn('p0');
const S6b = g6.state();
ok(S6b.players[S6b.currentIdx].id === 'p1', '回合已交给 p1');
g6.endTurn('p1');
const S6c = g6.state();
ok(S6c.players[0].id === 'p0' && S6c.discardUsed === false, '新回合弃置次数应重置');
let r7 = g6.discardCards('p0', [S6c.players[0].hand[0].uid]);
ok(r7.ok === true, '新回合可以再弃');
// 视图里带上标记
ok(viewFor(g6, 'p0').discardUsed === true || g6.state().discardUsed === false, '视图应下发 discardUsed');

console.log('=== 11. 广播等待与超时 ===');

// 11.1 没人能回应：等 5–20 秒后自动结算
const gA = createGame(['A','B']);
const SA = gA.state();
SA.players[0].galaxy = 1; SA.players[1].galaxy = 5;
SA.players[0].energy = 10;
SA.players[0].hand = [{ uid: 'x1', key: 'star_coop' }];
SA.players[1].hand = [{ uid: 'y1', key: 'nuke' }];       // 没有广播牌 → 无法回应
SA.currentIdx = 0; SA.step = 'action';
gA.playBroadcast('p0', 'x1', 2);
ok(SA.broadcast && SA.broadcast.stage === 'collecting', '没人能回应时也应先进入等待');
const waitA = SA.broadcast.deadline - Date.now();
ok(waitA >= 4500 && waitA <= 20500, '无人可回应应等 5–20 秒，实际 ' + waitA + 'ms');
ok(gA.tickBroadcast(Date.now()).changed === false, '未到期不应结算');
const eBefore = SA.players[0].energy;
gA.tickBroadcast(Date.now() + 60000);
ok(SA.broadcast === null, '到期应自动结算');
ok(SA.players[0].energy === eBefore + 1, '无人回应发布者应 +1 能量');

// 11.2 我在目标星系但没牌：连候选者都不是，不会被强制
const gB = createGame(['A','B']);
const SB = gB.state();
SB.players[0].galaxy = 1; SB.players[1].galaxy = 2;
SB.players[0].energy = 10;
SB.players[0].hand = [{ uid: 'x2', key: 'star_coop' }];
SB.players[1].hand = [{ uid: 'y2', key: 'nuke' }];        // 人在目标星系，但手上没广播牌
SB.currentIdx = 0; SB.step = 'action';
gB.playBroadcast('p0', 'x2', 2);
ok(SB.broadcast.candidates.length === 0, '没牌的人不算候选者');
ok(viewFor(gB, 'p1').broadcast.myCandidate === null, '没牌的人没有回应资格');
ok(viewFor(gB, 'p1').broadcast.iAmTarget === true, '但要告诉他自己就在目标星系（自知信息）');

// 11.3 有人能回应：等 60 秒；超时自动替他回应（优先伪装面）
const gC = createGame(['A','B']);
const SC = gC.state();
SC.players[0].galaxy = 1; SC.players[1].galaxy = 2;
SC.players[0].energy = 10;
SC.players[0].hand = [{ uid: 'x3', key: 'star_coop' }];
SC.players[1].hand = [{ uid: 'y3', key: 'star_disg' }];
SC.currentIdx = 0; SC.step = 'action';
gC.playBroadcast('p0', 'x3', 2);
const waitC = SC.broadcast.deadline - Date.now();
ok(waitC >= 59000 && waitC <= 61000, '有人可回应应等 60 秒，实际 ' + waitC + 'ms');
ok(SC.broadcast.candidates[0].mandatory === true, '被点名且有牌 → 强制回应');
const e1Before = SC.players[1].energy;
gC.tickBroadcast(Date.now() + 61000);
ok(SC.broadcast === null, '超时后应结算完毕');
ok(SC.players[1].energy === e1Before + 5, '超时应自动用伪装回应（对方合作 +5），实际 ' + SC.players[1].energy);

// 11.4 多人回应时挑选超时
const gD = createGame(['A','B','C']);
const SD = gD.state();
SD.players[0].galaxy = 1; SD.players[1].galaxy = 2; SD.players[2].galaxy = 1;
SD.players.forEach(p => { p.energy = 10; });
SD.players[0].hand = [{ uid: 'x4', key: 'star_coop' }];
SD.players[1].hand = [{ uid: 'y4', key: 'star_disg' }];
SD.players[2].hand = [{ uid: 'z4', key: 'star_coop' }];
SD.currentIdx = 0; SD.step = 'action';
gD.playBroadcast('p0', 'x4', 2);
gD.setResponse('p1', 'y4', 'disg');
gD.setResponse('p2', 'z4', 'coop');
const fin = gD.finalizeBroadcast();
ok(fin.needChoose === true, '两人响应应进入挑选');
ok(SD.broadcast.chooseDeadline > Date.now(), '应设置挑选超时');
gD.tickBroadcast(Date.now() + 20000);
ok(SD.broadcast === null, '挑选超时后应自动结算');

console.log('=== 12. 能量变化事件（供前端飘字）===');

const gE = createGame(['A','B']);
const SE = gE.state();
SE.players[0].galaxy = 1; SE.players[1].galaxy = 4; SE.players[0].energy = 10;
SE.players[0].hand = [{ uid: 'e1', key: 'solar' }, { uid: 'e2', key: 'cosmic_coop' }];
SE.players[1].hand = [{ uid: 'e3', key: 'star_disg' }];
SE.currentIdx = 0; SE.step = 'action';

gE.playBuild('p0', 'e1');
const eBuild = SE.events.filter(e => e.type === 'energy').pop();
ok(!!eBuild && eBuild.delta === -2 && eBuild.reason === 'build',
  '建造应产生 -2 能量事件，实际 ' + JSON.stringify(eBuild));
ok(eBuild.total === SE.players[0].energy, '事件应带变动后的总量');

// 广播结算：发布者 -2 +0，响应者 +5
gE.playBroadcast('p0', 'e2', 3);
gE.setResponse('p1', 'e3', 'disg');
gE.finalizeBroadcast();
const evs = SE.events.filter(e => e.type === 'energy');
const casterEv = evs.filter(e => e.actor === 'p0').pop();
const respEv = evs.filter(e => e.actor === 'p1').pop();
ok(casterEv && casterEv.reason === 'broadcast', '发布者应有广播结算事件');
ok(casterEv.delta === -1, '合作×伪装：发布者净变化 -1（宇宙广播费 1），实际 ' + casterEv.delta);
ok(respEv && respEv.delta === 5, '响应者应 +5，实际 ' + (respEv && respEv.delta));

// 净变化为 0 时不应产生事件（0 费广播 + 无人回应 → +1，但 0 费场景另有）
const before0 = SE.events.filter(e => e.type === 'energy').length;
SE.players[1].energy = 3;
gE.endTurn('p0');          // → p1 生产 +1
const prodEv = SE.events.filter(e => e.type === 'energy').pop();
ok(prodEv && prodEv.actor === 'p1' && (prodEv.delta === 1 || prodEv.delta === 2) && prodEv.reason === 'production',
  '生产阶段应产生 +1（半数概率 +2）事件，实际 ' + JSON.stringify(prodEv));

// 视图要下发这些事件（顺序按 id 递增）
const vE = viewFor(gE, 'p0');
const vEnergies = vE.events.filter(e => e.type === 'energy');
ok(vEnergies.length >= 3, '视图应下发能量事件，实际 ' + vEnergies.length);
ok(vEnergies.every((e, i, a) => i === 0 || a[i - 1].id < e.id), '能量事件应按 id 递增');
ok(vEnergies.some(e => e.delta < 0) && vEnergies.some(e => e.delta > 0), '应同时包含加与减');

// 打击发射：-cost
const gF = createGame(['A','B']);
const SF = gF.state();
SF.players[0].galaxy = 1; SF.players[1].galaxy = 4; SF.players[0].energy = 20;
SF.players[0].hand = [{ uid: 'f1', key: 'photoid' }];
SF.currentIdx = 0; SF.step = 'action';
gF.playStrike('p0', 'f1', 3);
const strikeEv = SF.events.filter(e => e.type === 'energy').pop();
ok(strikeEv && strikeEv.delta === -6 && strikeEv.reason === 'strike',
  '发射光粒应 -6，实际 ' + JSON.stringify(strikeEv));

console.log('=== 13. 本轮规则校正 ===');

// 13.1 没有能量：即使有广播牌也不能回应（连候选者都不是）
const gG = createGame(['A','B']);
const SG = gG.state();
SG.players[0].galaxy = 1; SG.players[1].galaxy = 2;
SG.players[0].energy = 10; SG.players[1].energy = 0;     // B 没能量
SG.players[0].hand = [{ uid: 'g1', key: 'star_coop' }];
SG.players[1].hand = [{ uid: 'g2', key: 'cosmic_coop' }]; // 有牌，但宇宙广播要 1 点
SG.currentIdx = 0; SG.step = 'action';
gG.playBroadcast('p0', 'g1', 2);
ok(SG.broadcast.candidates.length === 0, '没能量的人不能成为候选者，实际 ' + SG.broadcast.candidates.length);
ok(viewFor(gG, 'p1').broadcast.myCandidate === null, '没能量的人没有回应资格');
ok(viewFor(gG, 'p1').broadcast.iAmTarget === true, '仍告诉他自己在目标星系');

// 13.2 有能量后可以回应
SG.players[1].energy = 5;
const gG2 = createGame(['A','B']);
const SG2 = gG2.state();
SG2.players[0].galaxy = 1; SG2.players[1].galaxy = 2;
SG2.players[0].energy = 10; SG2.players[1].energy = 5;
SG2.players[0].hand = [{ uid: 'h1', key: 'star_coop' }];
SG2.players[1].hand = [{ uid: 'h2', key: 'cosmic_coop' }];
SG2.currentIdx = 0; SG2.step = 'action';
gG2.playBroadcast('p0', 'h1', 2);
ok(SG2.broadcast.candidates.length === 1, '有能量就能成为候选者');

// 13.3 合作 × 合作：双方各 +3（各自还扣掉自己那张牌的费用）
gG2.setResponse('p1', 'h2', 'coop');
gG2.finalizeBroadcast();
// A：恒星广播 0 费，+3 → 13；B：宇宙广播 1 费，+3−1=+2 → 7
ok(SG2.players[0].energy === 13, '发布者合作×合作应 +3，实际 ' + SG2.players[0].energy);
ok(SG2.players[1].energy === 7, '回应者 +3 再扣自己 1 费 = +2，实际 ' + SG2.players[1].energy);

// 13.4 多人回应：未被选中者弃牌、付自己牌的费用、返还 1
const gH = createGame(['A','B','C']);
const SH = gH.state();
SH.players[0].galaxy = 1; SH.players[1].galaxy = 2; SH.players[2].galaxy = 1;
SH.players.forEach(p => { p.energy = 10; });
SH.players[0].hand = [{ uid: 'k1', key: 'star_coop' }];
SH.players[1].hand = [{ uid: 'k2', key: 'star_disg' }];      // 0 费
SH.players[2].hand = [{ uid: 'k3', key: 'cosmic_coop' }];    // 1 费
SH.currentIdx = 0; SH.step = 'action';
gH.playBroadcast('p0', 'k1', 2);
gH.setResponse('p1', 'k2', 'disg');
gH.setResponse('p2', 'k3', 'coop');
gH.finalizeBroadcast();
ok(SH.broadcast && SH.broadcast.stage === 'choosing', '两人响应应进入挑选');
const p2Before = SH.players[2].energy;
gH.chooseResponder('p1', 'p0');       // 选 p1（伪装，0 费）
ok(SH.players[2].energy === p2Before - 1 + 1, '未选中者：−1 费 +1 返还 = 不变，实际 ' + SH.players[2].energy);
ok(SH.discard.current.some(d => d.uid === 'k3'), '未选中者的牌应进弃牌堆');
ok(SH.discard.current.find(d => d.uid === 'k3').tag === 'rejected', '未选中者的牌应标记 rejected');
ok(SH.discard.current.find(d => d.uid === 'k1').tag === 'cast', '发布牌应标记 cast');
ok(SH.discard.current.find(d => d.uid === 'k2').tag === 'response', '被采纳的回应应标记 response');
const batchIds = new Set(SH.discard.current.map(d => d.batch));
ok(batchIds.size === 1, '同一次广播结算的三张牌应在同一批，实际 ' + batchIds.size + ' 批');
ok(SH.players[2].hand.length === 0, '未选中者的手牌应被拿走');

// 13.5 打击不泄露飞行回合数
const gI = createGame(['A','B']);
const SI = gI.state();
SI.players[0].galaxy = 1; SI.players[1].galaxy = 4; SI.players[0].energy = 20;
SI.players[0].hand = [{ uid: 'm1', key: 'photoid' }];
SI.currentIdx = 0; SI.step = 'action';
gI.playStrike('p0', 'm1', 3);
const mineStrike = viewFor(gI, 'p0').players[0].strikes[0];
const otherStrike = viewFor(gI, 'p1').players[0].strikes[0];
ok(mineStrike.progress === 0 && mineStrike.required === 2, '发起者能看到自己的进度');
ok(otherStrike.progress === 0, '「已飞几手」对所有人公开');
ok(otherStrike.required === null, '但「还要几手」= 距离，只有发起者知道');
ok(otherStrike.turnsLeft === null, '他人算不出还剩几手');
ok(otherStrike.targetGalaxy === 3, '但目的地仍是公开的');
const castEv = SI.events.find(e => e.type === 'strike_cast');
ok(castEv && castEv.distance === undefined, 'strike_cast 事件不得携带距离');
ok(!/回合到达|需 \d+ 回合/.test(SI.log[0].text), '日志不得写出需要几回合，实际：' + SI.log[0].text);

// 13.6 多张主动弃置：同一批、标签 discard
const gJ = createGame(['A','B'], { mode: 'fast' });
const SJ = gJ.state();
SJ.currentIdx = 0; SJ.step = 'action'; SJ.players[0].energy = 10;
const uidsJ = SJ.players[0].hand.map(c => c.uid);
gJ.discardCards('p0', uidsJ.slice(0, 2));
const two = SJ.discard.current.filter(d => uidsJ.slice(0, 2).includes(d.uid));
ok(two.length === 2, '两张都应入堆');
ok(two[0].batch === two[1].batch, '同一次弃置应在同一批');
ok(two.every(d => d.tag === 'discard'), '标记为 discard');

// 13.7 回合结束补满手牌
const gK = createGame(['A','B']);
const SK = gK.state();
SK.currentIdx = 0; SK.step = 'action'; SK.players[0].energy = 20;
SK.players[0].hand = [{ uid: 'n1', key: 'solar' }];
gK.playBuild('p0', 'n1');
ok(SK.players[0].hand.length === 0, '出牌后手牌应为 0');
gK.endTurn('p0');
ok(SK.players[0].hand.length === 4, '回合结束应补满 4 张，实际 ' + SK.players[0].hand.length);

console.log('=== 14. 科技锁死 ===');
const gL = createGame(['A','B']);
const SL = gL.state();
SL.players[0].galaxy = 1; SL.players[1].galaxy = 5;   // 距离 2
SL.players[0].energy = 20;
SL.players[0].hand = [{ uid: 'lk', key: 'lock' }];
SL.players[1].buildZone = [{ uid: 'b1', key: 'solar' }, { uid: 'b2', key: 'bunker' }];
SL.players[1].hand = [{ uid: 'h1', key: 'nuke' }, { uid: 'h2', key: 'solar' }];
SL.players[1].energy = 7;
SL.currentIdx = 0; SL.step = 'action';

gL.playStrike('p0', 'lk', 5);
ok(SL.players[1].alive === true, '科技锁死不应淘汰玩家');
ok(SL.players[1].buildZone.length === 0, '应拆掉全部已建卡牌，实际 ' + SL.players[1].buildZone.length);
ok(SL.players[1].energy === 7, '不应清除能量，实际 ' + SL.players[1].energy);
ok(SL.players[1].hand.length === 2, '不应动到手牌，实际 ' + SL.players[1].hand.length);
ok(SL.players[0].strikes.length === 0, '应立即结算，不留飞行中的打击');
ok(SL.players[0].energy === 16, '玩家 A 只付 4 费、无清场奖励，实际 ' + SL.players[0].energy);
ok(SL.players[1].buildZone.length === 0 && SL.players[1].alive, '玩家带着空建设区继续活着');
ok(SL.discard.current.some(d => d.key === 'lock'), '打击牌应进弃牌堆');

console.log('=== 15. 出牌阶段开始补满手牌（快速局）===');
const gM = createGame(['A','B','C'], { mode: 'fast' });
const SM = gM.state();
// 牌库掏空、回收堆有牌：A 结束回合时补不到，牌洗完回后才轮到 B 的开始阶段
const stockM = SM.deck.splice(0, SM.deck.length);
SM.discard.last = stockM.map(c => ({ uid: c.uid, key: c.key, ownerId: 'p0', name: 'x', turn: 1, batch: 0, tag: 'discard' }));
SM.players[0].hand.splice(0, 3);
SM.players[1].hand.splice(0, 3);   // B 在别人回合里被消耗到 1 张
gM.endTurn('p0');
ok(SM.players[1].hand.length === 4, 'B 出牌阶段开始应补满 4 张，实际 ' + SM.players[1].hand.length);
ok(SM.players[0].hand.length === 1, 'A 结束回合时牌库为空、补不到，实际 ' + SM.players[0].hand.length);
ok(SM.log.some(l => /回合开始补牌/.test(l.text)), '日志应记「回合开始补牌」');

console.log('=== 16. 光速飞船：只能挨打时启动 ===');
/** 发一枚打击并把它推到"下一手就命中"，再结束回合让被打者在自己的回合开始时结算 */
function fireAndResolve(g, S) {
  g.playStrike('p0', 'st1', 2);
  const st = S.players[0].strikes[0];
  st.progress = st.required - 1;
  g.endTurn('p0');   // 交给 B
  g.endTurn('p1');   // 回到 A：回合开始推进打击并结算
}
function setupShipCase(targetEnergy) {
  const g = createGame(['A','B']);
  const S = g.state();
  S.players[0].galaxy = 1; S.players[1].galaxy = 2;    // 相邻，飞行 1 手
  S.players[0].energy = 20;
  S.players[0].hand = [{ uid: 'st1', key: 'nuke' }];
  S.players[1].hand = [{ uid: 'lp', key: 'lightship' }];
  S.players[1].energy = targetEnergy;
  S.currentIdx = 0; S.step = 'action';
  return { g, S };
}

// 16.1 不能主动建造
{
  const g = createGame(['A','B']);
  const S = g.state();
  S.players[0].energy = 20;
  S.players[0].hand = [{ uid: 'x1', key: 'lightship' }];
  S.step = 'action';
  const r = g.playBuild('p0', 'x1');
  ok(r.ok === false, '光速飞船不应能主动建造');
  ok(S.players[0].hand.length === 1, '被拒绝后手牌不变');
}

// 16.2 挨打时挂起等待选择（而不是自动跑）
{
  const { g, S } = setupShipCase(12);
  fireAndResolve(g, S);
  ok(!!S.escapePending, '手里有飞船且付得起，应挂起等待选择');
  ok(S.step === 'escape', 'step 应为 escape，实际 ' + S.step);
  const vB = viewFor(g, 'p1');
  ok(vB.escape && vB.escape.mine === true, '被打者应看到自己的选择');
  const vA = viewFor(g, 'p0');
  ok(vA.escape && vA.escape.mine === false, '其他人只能看到"有人在决定"');
  ok(vA.escape && vA.escape.cardKey === undefined, '不应向其他人泄露他手里是什么牌');
  ok(S.players[1].alive === true, '还没选择前不能先淘汰');

  // 16.3 启动 → 跃迁
  const before = S.players[1].galaxy;
  g.chooseEscape('p1', true);
  ok(S.players[1].alive === true, '启动后应存活');
  ok(S.players[1].galaxy !== before && S.players[1].galaxy !== 1, '应跃迁到别的空星系，实际 ' + S.players[1].galaxy);
  ok(S.players[1].energy === 0, '跃迁后能量应清零，实际 ' + S.players[1].energy);
  ok(S.players[1].lightshipUsed === true, '应标记为已用过');
  ok(!S.players[1].hand.some(c => c.uid === 'lp'), '这张飞船牌应被弃掉（补牌抽到同款不算）');
  ok(S.discard.current.some(d => d.key === 'lightship'), '飞船牌应进弃牌堆');
  ok(!S.escapePending, '选择后挂起状态应清空');
  ok(S.step === 'action', '应接回被打断的回合，实际 ' + S.step);
}

// 16.4 放弃 → 被淘汰
{
  const g = createGame(['A','B']);
  const S = g.state();
  S.players[0].galaxy = 1; S.players[1].galaxy = 2;
  S.players[0].energy = 20;
  S.players[0].hand = [{ uid: 'st1', key: 'nuke' }];
  S.players[1].hand = [{ uid: 'lp', key: 'lightship' }];
  S.players[1].energy = 12;
  S.currentIdx = 0; S.step = 'action';
  fireAndResolve(g, S);
  g.chooseEscape('p1', false);
  ok(S.players[1].alive === false, '放弃应被淘汰');
  ok(S.phase === 'ended' || S.players[S.currentIdx].id === 'p0', '淘汰后应推进/结束');
}

// 16.5 能量不足 → 不询问，直接死
{
  const g = createGame(['A','B']);
  const S = g.state();
  S.players[0].galaxy = 1; S.players[1].galaxy = 2;
  S.players[0].energy = 20;
  S.players[0].hand = [{ uid: 'st1', key: 'nuke' }];
  S.players[1].hand = [{ uid: 'lp', key: 'lightship' }];
  S.players[1].energy = 5;      // 付不起 10
  S.currentIdx = 0; S.step = 'action';
  fireAndResolve(g, S);
  ok(!S.escapePending, '付不起能量时不该弹选择');
  ok(S.players[1].alive === false, '付不起就只能被淘汰');
}

// 16.6 挂机超时 = 放弃
{
  const g = createGame(['A','B']);
  const S = g.state();
  S.players[0].galaxy = 1; S.players[1].galaxy = 2;
  S.players[0].energy = 20;
  S.players[0].hand = [{ uid: 'st1', key: 'nuke' }];
  S.players[1].hand = [{ uid: 'lp', key: 'lightship' }];
  S.players[1].energy = 12;
  S.currentIdx = 0; S.step = 'action';
  fireAndResolve(g, S);
  const r = g.tickEscape(Date.now() + 40000);
  ok(r.timedOut === true, '超过 30 秒应超时');
  ok(S.players[1].alive === false, '超时视为放弃');
}

console.log('=== 17. 广播：表态完就结算，不必等满 60 秒 ===');
{
  const gN = createGame(['A','B']);
  const SN = gN.state();
  SN.players[0].galaxy = 1; SN.players[1].galaxy = 2;
  SN.players[0].energy = 10;
  SN.players[0].hand = [{ uid: 'b1', key: 'star_coop' }];
  SN.players[1].hand = [{ uid: 'b2', key: 'star_coop' }];
  SN.players[1].energy = 10;
  SN.currentIdx = 0; SN.step = 'action';
  gN.playBroadcast('p0', 'b1', 2);

  ok(SN.broadcast && SN.broadcast.candidates.length === 1, 'B 应有回应资格');
  const wait = SN.broadcast.deadline - Date.now();
  ok(wait > 55000, '回应窗口应为 60 秒，实际 ' + wait + 'ms');

  const r = gN.setResponse('p1', 'b2', 'coop');
  ok(r.complete === true, '唯一候选者一表态就该 complete');
  const fin = gN.finalizeBroadcast();
  ok(fin.ok && fin.autoResolved, '应立刻结算，不用干等 60 秒');
  ok(SN.broadcast === null, '结算后广播应清空');
}
{
  // 不回应也是"表态"，同样立即结束等待
  const gO = createGame(['A','B']);
  const SO = gO.state();
  SO.players[0].galaxy = 1; SO.players[1].galaxy = 2;
  SO.players[0].energy = 10;
  SO.players[0].hand = [{ uid: 'c1', key: 'star_coop' }];
  SO.players[1].hand = [{ uid: 'c2', key: 'star_coop' }];
  SO.players[1].energy = 10;
  SO.players[1].buildZone = [{ uid: 'lb', key: 'listener' }];   // 有监听基地 → 可以不回应
  SO.currentIdx = 0; SO.step = 'action';
  gO.playBroadcast('p0', 'c1', 2);
  const r = gO.setResponse('p1', null, null);
  ok(r.ok && r.complete, '选择不回应也应立即 complete');
  const fin = gO.finalizeBroadcast();
  ok(fin.noResponse === true, '无人回应 → 发布者 +1');
  ok(SO.broadcast === null, '同样不必等 60 秒');
}

// 16.7 同一回合两枚打击同时到期：不能因为连续挂起把 step 卡死
{
  const g = createGame(['A','B','C']);
  const S = g.state();
  S.players[0].galaxy = 1; S.players[1].galaxy = 2; S.players[2].galaxy = 3;
  S.players[0].energy = 20;
  S.players[1].hand = [{ uid: 'lp', key: 'lightship' }];
  S.players[1].energy = 20;
  S.players[0].strikes = [
    { uid: 't1', key: 'nuke', casterId: 'p0', targetGalaxy: 2, progress: 0, required: 1, resolved: false },
    { uid: 't2', key: 'nuke', casterId: 'p0', targetGalaxy: 2, progress: 1, required: 1, resolved: false },
  ];
  S.currentIdx = 0; S.step = 'action';
  g.endTurn('p0');   // → B
  g.endTurn('p1');   // → C
  g.endTurn('p2');   // → A：两枚同时到期
  ok(!!S.escapePending, '应挂起等待 B 决定，实际 step=' + S.step);
  g.chooseEscape('p1', true);
  ok(S.step !== 'escape', '选择后不能卡在 escape 状态，实际 ' + S.step);
  ok(S.players[1].alive, 'B 应该还活着');
  const r = g.endTurn('p0');
  ok(r.ok, '回合应能继续推进（' + (r.msg || '') + '）');
}

console.log('=== 18. 初始能量与回合随机补给 ===');
{
  const gP = createGame(['A','B']);
  const SP = gP.state();
  // 首回合产能已经结算给 p0，所以 p0 是 3+产能，还没轮到的 p1 仍是 3
  ok(SP.players[1].energy === 3, '开局每人 3 点能量，未行动的 p1 应为 3，实际 ' + SP.players[1].energy);
  ok([4, 5].includes(SP.players[0].energy), '首回合 p0 应为 3+1 或 3+2，实际 ' + SP.players[0].energy);

  // 连走 30 个回合，看"进入回合的那个人"拿到多少
  const deltas = [];
  SP.players.forEach(p => { p.buildZone = []; });
  const snap = {};
  SP.players.forEach(p => { snap[p.id] = p.energy; });
  for (let i = 0; i < 30; i++) {
    const cur = SP.players[SP.currentIdx];
    gP.endTurn(cur.id);
    const nx = SP.players[SP.currentIdx];
    deltas.push(nx.energy - snap[nx.id]);
    snap[nx.id] = nx.energy;
  }
  ok(deltas.every(d => d === 1 || d === 2), '每回合产能应为 1 或 2，实际 ' + [...new Set(deltas)].join(','));
  ok(deltas.includes(1) && deltas.includes(2), '30 回合里应两种都出现，实际 ' + JSON.stringify(deltas.slice(0, 10)));
}

console.log('=== 19. 广播牌不提前暴露合作/伪装 ===');
{
  const gQ = createGame(['A','B']);
  const SQ = gQ.state();
  SQ.players[0].galaxy = 1; SQ.players[1].galaxy = 2;
  SQ.players[0].energy = 10;
  SQ.players[0].hand = [{ uid: 'q1', key: 'star_disg' }];
  SQ.players[1].hand = [{ uid: 'q2', key: 'nuke' }];   // 没有广播牌 → 无人能回应
  SQ.players[1].energy = 10;
  SQ.currentIdx = 0; SQ.step = 'action';
  gQ.playBroadcast('p0', 'q1', 2);

  // 19.1 战报不写面
  const logLine = SQ.log[0].text;
  ok(/恒星广播/.test(logLine) && !/伪装|合作/.test(logLine), '战报不能出现面：' + logLine);

  // 19.2 事件不泄露
  const castEv = SQ.events.filter(e => e.type === 'broadcast_cast').pop();
  ok(castEv && castEv.family === 'star_hidden', '事件只给家族，实际 ' + JSON.stringify(castEv));
  ok(!castEv.card, '事件里不应有原始卡牌 key');

  // 19.3 视图：别人看不到面，发布者自己看得到
  const vOther = viewFor(gQ, 'p1');
  ok(vOther.broadcast.card.revealed === false, '旁观者不应看到已翻面');
  ok(!/合作|伪装/.test(vOther.broadcast.card.name), '旁观者拿到的是脱敏名：' + vOther.broadcast.card.name);
  ok(CARD_DEFS[vOther.broadcast.card.key].hidden === true, '旁观者拿到的 key 应是未翻面占位');
  const vSelf = viewFor(gQ, 'p0');
  ok(vSelf.broadcast.card.revealed === true && vSelf.broadcast.card.key === 'star_disg', '发布者自己知道是哪一面');

  // 19.4 无人回应：弃牌堆是明牌，能看到是哪一面
  gQ.tickBroadcast(Date.now() + 61000);
  const dNo = SQ.discard.current.find(d => d.uid === 'q1');
  ok(dNo && dNo.key === 'star_disg', '进弃牌堆就应恢复真牌，实际 ' + (dNo && dNo.key));
  ok(dNo && /伪装/.test(dNo.name), '弃牌堆应写明面：' + (dNo && dNo.name));
}
{
  // 19.5 有人回应：结算后翻开
  const gR = createGame(['A','B']);
  const SR = gR.state();
  SR.players[0].galaxy = 1; SR.players[1].galaxy = 2;
  SR.players[0].energy = 10; SR.players[1].energy = 10;
  SR.players[0].hand = [{ uid: 'r1', key: 'star_disg' }];
  SR.players[1].hand = [{ uid: 'r2', key: 'star_coop' }];
  SR.currentIdx = 0; SR.step = 'action';
  gR.playBroadcast('p0', 'r1', 2);
  gR.setResponse('p1', 'r2', 'coop');
  gR.finalizeBroadcast();
  const dYes = SR.discard.current.find(d => d.uid === 'r1');
  ok(dYes && dYes.key === 'star_disg', '有人回应并结算后，面应翻开，实际 ' + (dYes && dYes.key));
}

console.log('=== 20. 挑选阶段不下发回应者的面 ===');
{
  const gS = createGame(['A','B','C']);
  const SS = gS.state();
  SS.players[0].galaxy = 1; SS.players[1].galaxy = 2; SS.players[2].galaxy = 6;  // 6 与 2 相邻
  SS.players.forEach(p => { p.energy = 12; });
  SS.players[0].hand = [{ uid: 's1', key: 'star_coop' }];
  SS.players[1].hand = [{ uid: 's2', key: 'star_disg' }];
  SS.players[2].hand = [{ uid: 's3', key: 'star_coop' }];
  SS.currentIdx = 0; SS.step = 'action';
  gS.playBroadcast('p0', 's1', 2);
  gS.setResponse('p1', 's2', 'disg');
  gS.setResponse('p2', 's3', 'coop');
  const fin = gS.finalizeBroadcast();
  ok(fin.needChoose === true, '两个回应者 → 进入挑选');

  const vC = viewFor(gS, 'p0');
  ok(vC.broadcast.responders.length === 2, '应能看到有两人回应');
  ok(vC.broadcast.responders.every(r => !('face' in r) && !('key' in r)),
    '挑选阶段不能下发 face/key，实际 ' + JSON.stringify(vC.broadcast.responders));

  // 结算后弃牌堆里两面都翻出来
  gS.chooseResponder('p2', 'p0');
  const names = SS.discard.current.map(d => d.name);
  ok(names.some(n => /合作/.test(n)) && names.some(n => /伪装/.test(n)),
    '结算后两张牌的面都应可见：' + names.join(' / '));
}

console.log('=== 21. 边界兜底：牌库见底 / 死者的打击 / 回合上限 ===');

// 21.1 牌库见底时把弃牌堆洗回，不让任何人永远缺手牌
{
  const gT = createGame(['A','B']);
  const ST = gT.state();
  ST.players[0].hand = [{ uid: 'h1', key: 'solar' }];
  ST.deck = [];                                  // 牌库空
  ST.discard.current = [
    { uid: 'd1', key: 'solar', ownerId: 'p0', name: '太阳能阵列', turn: 1, batch: 1, tag: 'discard' },
    { uid: 'd2', key: 'nuke',  ownerId: 'p0', name: '热核打击',   turn: 1, batch: 1, tag: 'discard' },
    { uid: 'd3', key: 'solar', ownerId: 'p0', name: '太阳能阵列', turn: 1, batch: 1, tag: 'discard' },
  ];
  ST.currentIdx = 0; ST.step = 'action';
  gT.endTurn('p0');
  ok(ST.players[0].hand.length === 4, '牌库见底应回收弃牌补满，实际 ' + ST.players[0].hand.length);
  ok(ST.log.some(l => /牌库见底/.test(l.text)), '应记录洗回日志');
}

// 21.2 被淘汰的玩家，在飞的打击失去制导（不能永远挂在星图上）
{
  const gU = createGame(['A','B','C']);
  const SU = gU.state();
  SU.players[0].galaxy = 1; SU.players[1].galaxy = 2; SU.players[2].galaxy = 5;
  SU.players[0].energy = 20;
  SU.players[0].strikes = [{ uid: 'k1', key: 'nuke', casterId: 'p0', targetGalaxy: 2, progress: 0, required: 1, resolved: false }];
  SU.players[1].strikes = [{ uid: 'k2', key: 'nuke', casterId: 'p1', targetGalaxy: 5, progress: 0, required: 3, resolved: false }];
  SU.currentIdx = 0; SU.step = 'action';

  gU.endTurn('p0');   // → B
  gU.endTurn('p1');   // → C
  gU.endTurn('p2');   // → A，A 的打击命中 B
  ok(SU.players[1].alive === false, 'B 应被淘汰');
  ok(SU.players[1].strikes.length === 0, 'B 在飞的打击应被清空，实际剩 ' + SU.players[1].strikes.length);
  ok(SU.discard.current.some(d => d.uid === 'k2'), '那枚打击应进弃牌堆');
  ok(SU.events.some(e => e.type === 'strike_void'), '应记录"失去制导"事件');
}

// 21.3 回合上限：人类局也要能收
{
  const gV = createGame(['A','B']);
  const SV = gV.state();
  SV.turnIndex = 240;
  SV.players[0].energy = 9; SV.players[1].energy = 4;
  SV.currentIdx = 0; SV.step = 'action';
  gV.endTurn('p0');
  ok(SV.phase === 'ended', '到回合上限应收局，实际 ' + SV.phase);
  ok(SV.winner === 'p0', '能量最高者胜，实际 ' + SV.winner);
}

// 21.4 收局时清掉挂起的广播
{
  const gW = createGame(['A','B']);
  const SW = gW.state();
  SW.players[0].galaxy = 1; SW.players[1].galaxy = 2;
  SW.players[0].energy = 10;
  SW.players[0].hand = [{ uid: 'w1', key: 'star_coop' }];
  SW.players[1].hand = [{ uid: 'w2', key: 'star_coop' }];
  SW.currentIdx = 0; SW.step = 'action';
  gW.playBroadcast('p0', 'w1', 2);
  ok(!!SW.broadcast, '广播应挂起');
  gW.forceEnd('测试');
  ok(SW.broadcast === null, '收局后不应残留广播');
  ok(SW.step === 'ended', 'step 应为 ended，实际 ' + SW.step);
}

console.log('=== 22. 自己打自己星系（距离 0）不能卡死 ===');
{
  // 22.1 3 人局：自打击致死，回合必须交给下一位
  const gX = createGame(['A','B','C']);
  const SX = gX.state();
  SX.players[0].galaxy = 1; SX.players[1].galaxy = 2; SX.players[2].galaxy = 5;
  SX.players[0].energy = 20;
  SX.players[0].hand = [{ uid: 'x1', key: 'nuke' }];
  SX.currentIdx = 0; SX.step = 'action';
  const r = gX.playStrike('p0', 'x1', 1);
  ok(r.ok, '自打击本身应合法');
  ok(SX.players[0].alive === false, '自己应被自己的打击淘汰');
  ok(SX.phase === 'playing', '还有两人在场，对局应继续');
  ok(SX.players[SX.currentIdx].id === 'p1', '回合应交给下一位，实际停在 ' + SX.players[SX.currentIdx].id);
  ok(SX.step === 'action', '应直接进入下一位的行动阶段，实际 ' + SX.step);
  const r2 = gX.endTurn('p1');
  ok(r2.ok, '下一位应能正常结束回合（' + (r2.msg || '') + '）');
}
{
  // 22.2 2 人局：自打击致死 → 直接分出胜负
  const gY = createGame(['A','B']);
  const SY = gY.state();
  SY.players[0].galaxy = 1; SY.players[1].galaxy = 2;
  SY.players[0].energy = 20;
  SY.players[0].hand = [{ uid: 'y1', key: 'nuke' }];
  SY.currentIdx = 0; SY.step = 'action';
  gY.playStrike('p0', 'y1', 1);
  ok(SY.phase === 'ended', '只剩一人应直接收局，实际 ' + SY.phase);
  ok(SY.winner === 'p1', '胜者应为对手，实际 ' + SY.winner);
}
{
  // 22.3 自打击但有防御牌 → 不死，回合照常
  const gZ = createGame(['A','B','C']);
  const SZ = gZ.state();
  SZ.players[0].galaxy = 1; SZ.players[1].galaxy = 2; SZ.players[2].galaxy = 5;
  SZ.players[0].energy = 20;
  SZ.players[0].hand = [{ uid: 'z1', key: 'nuke' }];
  SZ.players[0].buildZone = [{ uid: 'bz', key: 'bunker' }];
  SZ.currentIdx = 0; SZ.step = 'action';
  gZ.playStrike('p0', 'z1', 1);
  ok(SZ.players[0].alive === true, '有掩体星环应活下来');
  ok(SZ.players[SZ.currentIdx].id === 'p0' && SZ.step === 'action', '回合应留在自己身上');
}
{
  // 22.4 已出局玩家不能结束回合（防御性校验）
  const gW2 = createGame(['A','B']);
  const SW2 = gW2.state();
  SW2.players[0].galaxy = 1; SW2.players[1].galaxy = 2;
  SW2.players[0].energy = 20;
  SW2.players[0].hand = [{ uid: 'w9', key: 'nuke' }];
  SW2.currentIdx = 0; SW2.step = 'action';
  SW2.phase = 'playing';
  SW2.players[0].alive = false;     // 直接构造"死人还在当前席位"
  const r = gW2.endTurn('p0');
  ok(r.ok === false, '已出局玩家不该能结束回合');
}

// 22.5 自打击 + 手上有光速飞船：应停下等选择，选完回合还能继续
{
  const gShip = createGame(['A','B','C']);
  const SShip = gShip.state();
  SShip.players[0].galaxy = 1; SShip.players[1].galaxy = 2; SShip.players[2].galaxy = 5;
  SShip.players[0].energy = 20;
  SShip.players[0].hand = [{ uid: 'sp1', key: 'nuke' }, { uid: 'sp2', key: 'lightship' }];
  SShip.currentIdx = 0; SShip.step = 'action';
  gShip.playStrike('p0', 'sp1', 1);
  ok(!!SShip.escapePending, '自打击且会死时，应停下来问是否启动飞船');
  gShip.chooseEscape('p0', true);
  ok(SShip.players[0].alive === true, '启动后应存活');
  ok(SShip.players[SShip.currentIdx].id === 'p0', '回合仍应在自己身上');
  ok(SShip.step === 'action', '选择后应回到行动阶段，实际 ' + SShip.step);
  const rr = gShip.endTurn('p0');
  ok(rr.ok, '回合应能正常结束（' + (rr.msg || '') + '）');
}

console.log('=== 23. 标准对局 / 快速对局 ===');

// 23.1 标准局：出过牌就不能再弃牌
{
  const gF = createGame(['A','B'], { mode: 'standard' });
  const SF = gF.state();
  ok(SF.mode === 'standard', '模式应为 standard，实际 ' + SF.mode);
  SF.players[0].energy = 20;
  SF.players[0].hand = [{ uid: 'f1', key: 'solar' }, { uid: 'f2', key: 'nuke' }];
  SF.currentIdx = 0; SF.step = 'action';
  ok(gF.playBuild('p0', 'f1').ok, '先出牌应成功');
  const r = gF.discardCards('p0', ['f2']);
  ok(r.ok === false, '标准局出牌后不能再弃牌');
  ok(/不能/.test(r.msg) || /弃置过/.test(r.msg), '应给出拒绝理由：' + r.msg);
}

// 23.2 标准局：弃牌即结束回合
{
  const gF = createGame(['A','B'], { mode: 'standard' });
  const SF = gF.state();
  SF.players[0].galaxy = 1; SF.players[1].galaxy = 2;
  SF.players[0].hand = [{ uid: 'a', key: 'solar' }, { uid: 'b', key: 'solar' },
                        { uid: 'c', key: 'solar' }, { uid: 'd', key: 'solar' }];
  SF.currentIdx = 0; SF.step = 'action';
  const r = gF.discardCards('p0', ['a', 'b']);
  ok(r.ok && r.endedTurn === true, '弃牌应带回 endedTurn 标记');
  ok(SF.players[SF.currentIdx].id === 'p1', '应直接进入下一位，实际 ' + SF.players[SF.currentIdx].id);
  ok(SF.players[0].hand.length === 4, '弃牌者应在回合结束时补满，实际 ' + SF.players[0].hand.length);
  ok(SF.turnIndex === 2, '回合数应 +1，实际 ' + SF.turnIndex);
}

// 23.3 标准局回合开始不补牌；快速局补
{
  const gF = createGame(['A','B'], { mode: 'standard' });
  const SF = gF.state();
  SF.players[1].hand = SF.players[1].hand.slice(0, 2);
  SF.currentIdx = 0; SF.step = 'action';
  gF.endTurn('p0');
  ok(SF.players[1].hand.length === 2, '标准局回合开始不该补牌，实际 ' + SF.players[1].hand.length);

  const gS = createGame(['A','B'], { mode: 'fast' });
  const SS = gS.state();
  SS.players[1].hand = SS.players[1].hand.slice(0, 2);
  SS.currentIdx = 0; SS.step = 'action';
  gS.endTurn('p0');
  ok(SS.players[1].hand.length === 4, '快速局回合开始应补满，实际 ' + SS.players[1].hand.length);
}

// 23.4 快速局：出牌后仍可弃牌（两种规则的真正差别）
{
  const gS = createGame(['A','B'], { mode: 'fast' });
  const SS = gS.state();
  SS.players[0].energy = 20;
  SS.players[0].hand = [{ uid: 's1', key: 'solar' }, { uid: 's2', key: 'nuke' }];
  SS.currentIdx = 0; SS.step = 'action';
  gS.playBuild('p0', 's1');
  const r = gS.discardCards('p0', ['s2']);
  ok(r.ok === true, '快速局出牌后还能弃牌，实际 ' + (r.msg || 'ok'));
}

// 23.5 标准局弃牌后不能反悔出牌（回合已经交出去）
{
  const gF = createGame(['A','B'], { mode: 'standard' });
  const SF = gF.state();
  SF.players[0].energy = 20;
  SF.players[0].hand = [{ uid: 'p1', key: 'solar' }, { uid: 'p2', key: 'solar' },
                        { uid: 'p3', key: 'solar' }, { uid: 'p4', key: 'solar' }];
  SF.currentIdx = 0; SF.step = 'action';
  gF.discardCards('p0', ['p1']);
  const r = gF.playBuild('p0', 'p2');
  ok(r.ok === false, '交棒后不能再出牌');
  ok(/还没轮到/.test(r.msg), '应提示不是你的回合：' + r.msg);
}

// 23.6 不给 mode 时默认标准局
{
  const gD = createGame(['A','B']);
  ok(gD.state().mode === 'standard', '默认应为 standard，实际 ' + gD.state().mode);
}

console.log('=== 24. 房间设置：打击目标显示 ===');
// 整节包在一个块里，避免和上面的顶层 const 撞名
{

// 24.1 默认（open）：与旧版一致，全场看到「谁 → 哪个星系」
{
  const gO = createGame(['A','B']);
  const SO = gO.state();
  ok(SO.strikeTarget === 'open', '默认应为 open，实际 ' + SO.strikeTarget);
  SO.players[0].galaxy = 1; SO.players[1].galaxy = 5;
  SO.players[0].energy = 20;
  SO.players[0].hand = [{ uid: 'o1', key: 'nuke' }];
  SO.currentIdx = 0; SO.step = 'action';
  ok(gO.playStrike('p0', 'o1', 4).ok, '公开模式发射应成功');
  const vO = viewFor(gO, 'p1');
  const sO = vO.players[0].strikes[0];
  ok(sO.targetGalaxy === 4, '公开模式：对手应看到目标星系，实际 ' + sO.targetGalaxy);
  ok(sO.blind === false, '公开模式不该标 blind');
  ok(vO.strikeTarget === 'open', '视图应下发 strikeTarget=open');
  ok(SO.log[0].text.indexOf('巴纳德星') >= 0, '公开模式战报应写目标：' + SO.log[0].text);
}

// 24.2 关闭（hidden）：只剩「谁 · 哪种 · 已飞几手」
const gH = createGame(['A','B','C'], { strikeTarget: 'hidden' });
const SH = gH.state();
SH.players[0].galaxy = 1; SH.players[1].galaxy = 4; SH.players[2].galaxy = 5;
SH.players[0].energy = 20;
SH.players[0].hand = [{ uid: 'h1', key: 'photoid' }];
SH.currentIdx = 0; SH.step = 'action';
ok(gH.playStrike('p0', 'h1', 4).ok, '隐藏模式发射应成功');

const vH = viewFor(gH, 'p1');
const sH = vH.players[0].strikes[0];
ok(vH.strikeTarget === 'hidden', '视图应下发 strikeTarget=hidden');
ok(sH.targetGalaxy === null, '隐藏模式：对手不得拿到目标星系，实际 ' + sH.targetGalaxy);
ok(sH.blind === true, '隐藏模式：应标 blind 供前端渲染「目标不明」');
ok(sH.key === 'photoid' && sH.progress === 0, '打击类型与已飞手数仍然公开');
ok(sH.required === null && sH.turnsLeft === null, '飞行回合数依旧只有发起者知道');

const vMe = viewFor(gH, 'p0');
ok(vMe.players[0].strikes[0].targetGalaxy === 4, '发起者自己始终能看到自己的目标');
ok(vMe.players[0].strikes[0].blind === false, '自己的打击不算 blind');

// 日志与事件：另外两个出口也要堵住
ok(SH.log[0].text.indexOf('巴纳德星') < 0, '隐藏模式战报不得写目标：' + SH.log[0].text);
const castEv = SH.events.filter(e => e.type === 'strike_cast').pop();
ok(castEv && castEv.target === undefined && castEv.distance === undefined,
  '事件流不得带目的地：' + JSON.stringify(castEv));
ok(viewFor(gH, 'p2').events.every(e => e.type !== 'strike_cast' || e.target === undefined),
  '所有对手的事件流都不带目的地');

// 24.3 撤回：目标同样不该泄露
{
  const st = SH.players[0].strikes[0];
  ok(gH.withdrawStrike('p0', st.uid).ok, '撤回应成功');
  const wd = SH.events.filter(e => e.type === 'strike_withdraw').pop();
  ok(wd && wd.target === undefined, '撤回事件不得带目标：' + JSON.stringify(wd));
  ok(SH.log[0].text.indexOf('巴纳德星') < 0, '撤回战报也不写目标：' + SH.log[0].text);
}

// 24.4 打击生效那一刻：落点公开
{
  const gR = createGame(['A','B'], { strikeTarget: 'hidden' });
  const SR = gR.state();
  SR.players[0].galaxy = 1; SR.players[1].galaxy = 4;
  SR.players[0].energy = 20;
  SR.players[0].hand = [{ uid: 'r1', key: 'photoid' }];
  SR.players[1].hand = [{ uid: 'r2', key: 'solar' }];   // 手上别留光速飞船，保证直接结算
  SR.currentIdx = 0; SR.step = 'action';
  gR.playStrike('p0', 'r1', 4);
  gR.endTurn('p0');            // → p1 回合，p0 的打击不推进
  SR.step = 'action';
  gR.endTurn('p1');            // → p0 回合开始，tickStrikes 结算
  const hit = SR.events.filter(e => e.type === 'strike_hit').pop();
  ok(hit && hit.target === 4, '落地事件必须公开落点，实际 ' + JSON.stringify(hit));
  ok(SR.players[1].alive === false, '命中应淘汰');
  ok(SR.log.some(l => l.text.indexOf('巴纳德星') >= 0), '落地战报应写出星系');
}

// 24.5 科技锁死：落点写进弃牌堆，但只在当回合
{
  const gL = createGame(['A','B'], { strikeTarget: 'hidden' });
  const SL = gL.state();
  SL.players[0].galaxy = 1; SL.players[1].galaxy = 4;
  SL.players[0].energy = 20;
  SL.players[1].buildZone = [{ uid: 'lb1', key: 'solar' }, { uid: 'lb2', key: 'fusion' }];
  SL.players[0].hand = [{ uid: 'lk', key: 'lock' }];
  SL.currentIdx = 0; SL.step = 'action';
  ok(gL.playStrike('p0', 'lk', 4).ok, '科技锁死应成功');
  ok(SL.players[1].buildZone.length === 0, '锁死应拆光建设牌');
  ok(SL.players[1].alive === true, '锁死不杀人');

  const lockEntry = () => viewFor(gL, 'p1').discard.current.find(d => d.key === 'lock');
  const cur = lockEntry();
  ok(cur && cur.targetGalaxy === 4, '当回合弃牌堆应标出锁死目标，实际 ' + JSON.stringify(cur));

  gL.endTurn('p0');            // 滚动：current → last
  const rolled = viewFor(gL, 'p1').discard.last.find(d => d.key === 'lock');
  ok(rolled && rolled.targetGalaxy === undefined, '滚进上一回合后不再显示目标');

  // 公开模式下不必额外标目标（出牌时就公开了）
  const gL2 = createGame(['A','B'], { strikeTarget: 'open' });
  const SL2 = gL2.state();
  SL2.players[0].galaxy = 1; SL2.players[1].galaxy = 4;
  SL2.players[0].energy = 20;
  SL2.players[0].hand = [{ uid: 'lk2', key: 'lock' }];
  SL2.currentIdx = 0; SL2.step = 'action';
  gL2.playStrike('p0', 'lk2', 4);
  const openLock = viewFor(gL2, 'p1').discard.current.find(d => d.key === 'lock');
  ok(openLock && openLock.targetGalaxy === undefined, '公开模式弃牌堆不加目标字段');
}

// 24.6 旧快照 hydrate 默认回到 open
{
  const gOld = createGame(['A','B']);
  const snap = JSON.parse(JSON.stringify(gOld.state()));
  delete snap.strikeTarget;
  const gNew = createGame().hydrate(snap);
  ok(gNew.state().strikeTarget === 'open', '旧快照应默认 open');
  const snap2 = JSON.parse(JSON.stringify(gOld.state()));
  snap2.strikeTarget = 'hidden';
  ok(createGame().hydrate(snap2).state().strikeTarget === 'hidden', '快照里的 hidden 应保留');
}

// 24.7 隐藏目标不影响对局收尾（全 AI 跑两局）
{
  let notEnded = 0;
  for (let i = 0; i < 2; i++) {
    const levels = [LEVEL_KEYS[i % 4], LEVEL_KEYS[(i + 1) % 4], LEVEL_KEYS[(i + 2) % 4]];
    const gg = createGame(levels, { strikeTarget: 'hidden' });
    const seats = new Map(levels.map((lv, k) => ['p' + k, { level: lv, seed: 7000 + i * 31 + k }]));
    runAI(gg, seats, viewFor, { maxSteps: 3000 });
    if (gg.state().phase !== 'ended') notEnded++;
  }
  ok(notEnded === 0, '隐藏目标模式全 AI 对局应能收尾，卡住 ' + notEnded + ' 局');
}

// 24.8 房间设置：只有房主能改，开局后锁死，开局时传给引擎
{
  const rH = new Room();
  const hostH = rH.join('房主', null);
  const guestH = rH.join('客人', null);
  ok(rH.strikeTarget === 'open', '新房间默认 open');
  ok(rH.setStrikeTarget(guestH.playerId, 'hidden').error, '非房主不能改打击目标设置');
  ok(rH.setStrikeTarget(hostH.playerId, 'hidden').ok, '房主可以改');
  ok(rH.summary().strikeTarget === 'hidden', '大厅摘要应带 strikeTarget');
  ok(rH.start(hostH.playerId).ok, '应能开局');
  ok(rH.game.state().strikeTarget === 'hidden', '开局应把设置传给引擎');
  ok(!!rH.setStrikeTarget(hostH.playerId, 'open').error, '开局后不能再改');
}

}

// 25. 广播不得泄露发布者的实际位置
//    战报里出现「距离 N」＝把发布者到目标星系的真实格数公开了；
//    目标星系是公开的，距离一公开，坐标就等于公开了。
//    唯一能公开的是「这张牌的射程」——即发布者在目标星系 N 格以内。
console.log('=== 25. 广播不泄露实际距离（只给射程） ===');
{
  // 25.1 实际距离 1、牌射程 2：战报必须写「≤ 2 格」，不能写「距离 1」
  const g25 = createGame(['甲', '乙'], { strikeTarget: 'open' });
  const S25 = g25.state();
  S25.players[0].galaxy = 1;      // 甲在 1 号
  S25.players[1].galaxy = 6;      // 乙在 6 号（离得远，够不着）
  S25.players[0].energy = 10;
  S25.players[0].hand = [{ uid: 'z1', key: 'cosmic_disg' }];   // 宇宙广播·伪装，射程 2
  S25.currentIdx = 0; S25.step = 'action';
  g25.playBroadcast('p0', 'z1', 2);                            // 目标 2 号 → 实际距离 1

  const log25 = S25.log[0].text;
  ok(!/距离\s*\d/.test(log25), '战报不得出现「距离 N」：' + log25);
  ok(!/距目标\s*≤\s*1\s*格/.test(log25), '战报不得把实际距离当成射程：' + log25);
  ok(/距目标\s*≤\s*2\s*格/.test(log25), '战报应写牌的射程（2 格）：' + log25);

  // 25.2 事件里不能有实际距离，只能有射程
  const ev25 = S25.events.filter(e => e.type === 'broadcast_cast').pop();
  ok(ev25 && ev25.distance === undefined, '事件不得携带实际距离，实际 ' + JSON.stringify(ev25));
  ok(ev25 && ev25.radius === 2, '事件只应给射程 radius=2，实际 ' + JSON.stringify(ev25));

  // 25.3 旁观者拿到的战报与事件都一样干净
  const v25 = viewFor(g25, 'p1');
  ok(!/距离\s*\d/.test(v25.log[0].text), '旁观者战报同样不得出现实际距离');
  const vEv = v25.events.filter(e => e.type === 'broadcast_cast').pop();
  ok(vEv && vEv.distance === undefined, '旁观者事件同样不得带实际距离');
  ok(!/"distance"/.test(JSON.stringify(v25.events)), '整条事件流里都不该有 distance 字段');

  // 25.4 超距广播：射程 ∞，不构成任何约束
  const g25b = createGame(['甲', '乙'], { strikeTarget: 'open' });
  const S25b = g25b.state();
  S25b.players[0].galaxy = 1; S25b.players[1].galaxy = 9;
  S25b.players[0].energy = 10;
  S25b.players[0].hand = [{ uid: 'y1', key: 'ftl_coop' }];     // 超距广播·合作
  S25b.currentIdx = 0; S25b.step = 'action';
  g25b.playBroadcast('p0', 'y1', 7);                            // 目标 7 号
  const log25b = S25b.log[0].text;
  ok(!/距离\s*\d/.test(log25b), '超距广播的战报也不得出现实际距离：' + log25b);
  ok(/任意星系/.test(log25b), '超距广播应写「任意星系」：' + log25b);
  const ev25b = S25b.events.filter(e => e.type === 'broadcast_cast').pop();
  ok(ev25b && ev25b.radius === null, '超距广播的 radius 应为 null（无约束）');
}

// 26. 弃牌条目带出牌人（窄屏靠它显示「谁出的」，不画跨屏箭头）
{
  const g26 = createGame(['甲', '乙', '丙'], { strikeTarget: 'open' });
  const S26 = g26.state();
  S26.players[1].hand = [{ uid: 'w1', key: 'photoid' }];
  S26.currentIdx = 1; S26.step = 'action';
  g26.discardCards('p1', ['w1']);
  // 弃牌即结束回合，所以牌会从「本回合」滚进「上一回合」区
  const d26 = S26.discard.last[0];
  const v26 = viewFor(g26, 'p0');
  const e26 = v26.discard.last[0];
  ok(e26 && e26.actor === 'p1', '弃牌条目应带 actor，实际 ' + JSON.stringify(e26));
  ok(e26 && e26.actorName === '乙', '弃牌条目应带出牌人名，实际 ' + (e26 && e26.actorName));
  ok(d26.ownerId === 'p1', '引擎侧仍用 ownerId（别把字段名搞混）');
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail?1:0);
