/* ============================================================
 * shared/rules.js — 规则引擎（前后端同构）
 * createGame(names) 返回一局独立游戏实例。
 * 服务端权威：所有动作都校验 playerId 与阶段。
 * ============================================================ */
(function (root, factory) {
  let cards;
  if (typeof module === 'object' && module.exports) cards = require('./cards.js');
  else cards = root;
  const api = factory(cards);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {

  const { INF, CARD_DEFS, GALAXY_NAMES, ADJACENCY, galaxyDistance, buildDeck } = C;
  // 广播牌在结算前不对外暴露合作/伪装
  const hideFace = C.hideFace || (k => k);
  const familyName = C.familyName || (k => (CARD_DEFS[k] ? CARD_DEFS[k].name : k));

  /* 回合上限：到这个回合还没分出胜负就按能量收局（人类局也要有兜底，不能只靠 AI 自己收手） */
  const MAX_TURNS = 240;
  const clone = o => JSON.parse(JSON.stringify(o));
  const shuffle = arr => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  function createGame(names, opts) {
    let S = null;
    let uidSeq = 0;
    const uid = () => 'c' + (++uidSeq);
    /**
     * 房间规则（标准默认）：
     *   standard —— 出牌与弃牌二选一；出过牌就不能再弃；弃牌即结束回合；
     *               只在回合结束时补至 4 张（回合开始不补）
     *   fast     —— 行动阶段可以先弃牌换牌再出牌；回合开始 + 回合结束各补一次
     */
    const MODE = (opts && opts.mode === 'fast') ? 'fast' : 'standard';
    /**
     * 打击目标显示（房间设置）：
     *   open   —— 默认，与旧版完全一致：打击正面朝上，全场看到「谁 → 哪个星系」
     *   hidden —— 只公开「谁打了哪一种、已飞几手」，目标星系与距离不下发；
     *             **打击生效那一刻**才公布落点。发起者自己始终能看到自己的目标。
     * 注意：`科技锁死` 是 immediate 牌，打出即生效，所以它的落点当回合就是公开的。
     */
    const STRIKE_TARGET = (opts && opts.strikeTarget === 'hidden') ? 'hidden' : 'open';
    /** 当前是否隐藏打击目标——只读 S，才能让 hydrate 吃旧快照 */
    const blindStrikes = () => S.strikeTarget === 'hidden';

    const alivePlayers = () => S.players.filter(p => p.alive);
    const byId = id => S.players.find(p => p.id === id);
    const log = (text, kind = 'info') => {
      S.log.unshift({ text, kind, turn: S.turnIndex, at: Date.now() });
      if (S.log.length > 300) S.log.pop();
    };
    /** 结构化公开事件：只记录"摆在桌面上谁都能看见"的事，绝不记录手牌 */
    const ev = (type, data) => {
      S.eventSeq = (S.eventSeq || 0) + 1;
      S.events.push(Object.assign({ id: S.eventSeq, turn: S.turnIndex, type }, data));
      if (S.events.length > 240) S.events.splice(0, S.events.length - 240);
    };

    /**
     * 记录一次能量变化（供前端在玩家卡上飘 +N / -N）。
     * 传入变动前的数值，取实际净变化——广播那种"先扣费再结算"的场景
     * 只会产生一条飘字，不会两个数字打架。
     */
    const noteEnergy = (p, before, reason) => {
      if (!p) return;
      const delta = p.energy - before;
      if (!delta) return;
      ev('energy', { actor: p.id, delta, reason, total: p.energy });
    };

    /* ---------- 初始化 ---------- */
    function newGame(playerNames) {
      uidSeq = 0;
      const deck = shuffle(buildDeck()).map(k => ({ uid: uid(), key: k }));
      const galaxies = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, playerNames.length);

      S = {
        phase: 'playing',
        mode: MODE,
        strikeTarget: STRIKE_TARGET,
        players: playerNames.map((name, i) => ({
          id: 'p' + i,
          seat: i,
          name: name || ('玩家 ' + (i + 1)),
          galaxy: galaxies[i],
          energy: 3,
          hand: [],
          buildZone: [],
          strikes: [],
          alive: true,
          lightshipUsed: false,
          eliminatedTurn: null,
        })),
        turnIndex: 1,
        currentIdx: 0,
        step: 'production',
        deck,
        discard: { current: [], last: [] },
        markers: Object.fromEntries([1,2,3,4,5,6,7,8,9].map(g => [g, { black: false, purple: false, red: false }])),
        broadcast: null,
        escapePending: null,   // 被打击时的光速飞船待决（只有被打者能回答）
        log: [],
        arrow: null,
        winner: null,
        endReason: null,   // last_stand / heat_death，决定结算界面怎么说
        actionCount: 0,    // 本回合已行动次数（AI 用来判断何时收手）
        discardUsed: false, // 本回合是否已弃置过（每回合只能弃一次，但可一次弃多张）
        events: [],        // 结构化公开事件（与日志同源，供 AI 记忆 / 复盘）
        eventSeq: 0,
        theme: '赫尔辛根莫斯肯',
      };

      S.players.forEach(p => {
        for (let i = 0; i < 4; i++) if (S.deck.length) p.hand.push(S.deck.pop());
      });

      log(`对局开始：${playerNames.length} 位玩家，牌库 ${S.deck.length} 张`, 'system');
      S.players.forEach(p => log(`${p.name} 就位（坐标保密）`));
      beginTurn();
      return S;
    }

    /* ---------- 回合 ---------- */
    /** 补至 4 张：回合开始、弃牌后、回合结束都走这里 */
    function refillHand(p, label) {
      if (!p || !p.alive) return 0;
      let drawn = 0;
      while (p.hand.length < 4) {
        if (!S.deck.length) recycleDiscard();        // 牌库见底就回收，避免有人永远少手牌
        if (!S.deck.length) break;
        p.hand.push(S.deck.pop());
        drawn++;
      }
      if (drawn) log(`${p.name} ${label || '补牌'} ${drawn} 张`, 'production');
      return drawn;
    }

    /**
     * 牌库见底时的兜底：把当前的弃牌堆洗回牌库。
     * 正常节奏下每回合结束会把上一回合的牌洗回，走不到这里；
     * 只有"一个回合内消耗掉的牌比牌库剩下的还多"才会触发。
     */
    function recycleDiscard() {
      const pool = S.discard.current.slice();
      if (!pool.length) return 0;
      pool.forEach(d => S.deck.push({ uid: d.uid, key: d.key }));
      S.discard.current = [];
      shuffle(S.deck);
      log(`牌库见底：${pool.length} 张弃牌洗回牌库`, 'discard');
      return pool.length;
    }

    function beginTurn() {
      const p = S.players[S.currentIdx];
      if (!p.alive) { nextPlayer(); return; }
      S.step = 'production';
      S.broadcast = null;
      S.actionCount = 0;
      S.discardUsed = false;

      tickStrikes(p);
      if (S.phase !== 'playing') return;
      // 极端情况：玩家跃迁后正好落进自己先前发射的打击目标，被自己打死
      if (!p.alive) { nextPlayer(); return; }
      // 打击命中且他手里有光速飞船：整局挂在这里等他点「启动 / 放弃」
      if (S.escapePending) { S.step = 'escape'; return; }

      startActionPhase(p);
    }

    /** 回合的后半段：补给 → 产能 → 进入行动阶段 */
    function startActionPhase(p) {
      // 快速局：出牌阶段开始时补齐 4 张；标准局只在回合结束补，开局不补
      if (S.mode !== 'standard') refillHand(p, '回合开始补牌');

      let gain = 1;
      const starDead = S.markers[p.galaxy].black;
      const detail = [];
      p.buildZone.forEach(c => {
        const def = CARD_DEFS[c.key];
        if (!def.income) return;
        if (def.starDependent && starDead) return;
        gain += def.income;
        detail.push(`${def.short}+${def.income}`);
      });
      const prodBefore = p.energy;
      p.energy += gain;
      noteEnergy(p, prodBefore, 'production');
      log(`${p.name} 进入回合：基础 1${detail.length ? '，' + detail.join('、') : ''} → 能量 ${p.energy}`, 'production');
      S.step = 'action';
    }

    function tickStrikes(p) {
      const due = [];
      p.strikes.forEach(st => {
        if (st.resolved) return;
        st.progress++;
        if (st.progress >= st.required) due.push(st);
      });
      // 同一回合可能有多枚打击同时到期；一旦要等光速飞船的决定，
      // 后面的先不结算（留到下个回合，届时他要么已经跃迁、要么已经死了）
      due.forEach(st => { if (!S.escapePending) resolveStrike(st); });
    }

    /**
     * 当前玩家已经出局时把回合交出去。
     * 典型的触发场景：朝自己所在星系开火（距离 0，立即结算），把自己打死了——
     * 这时没有人会替他点"结束回合"，不主动交棒整局就停在一个死人身上。
     */
    function advanceIfCurrentDead() {
      if (S.phase !== 'playing') return false;
      const cur = S.players[S.currentIdx];
      if (cur && !cur.alive) { nextPlayer(); return true; }
      return false;
    }

    function nextPlayer() {
      if (S.phase !== 'playing') return;
      let guard = 0;
      do {
        S.currentIdx = (S.currentIdx + 1) % S.players.length;
        guard++;
      } while (!S.players[S.currentIdx].alive && guard < S.players.length * 2);
      if (alivePlayers().length <= 1) return endGame();
      S.turnIndex++;
      beginTurn();
    }

    /** 记一次行动；标准局里"出过牌"意味着本回合不能再弃牌 */
    function markActed() {
      S.actionCount = (S.actionCount || 0) + 1;
      if (S.mode === 'standard') S.discardUsed = true;
    }

    /* ---------- 校验 ---------- */
    function canAct(playerId) {
      const p = byId(playerId);
      if (!p || !p.alive) return { ok: false, msg: '玩家不可用' };
      if (S.phase !== 'playing') return { ok: false, msg: '对局已结束' };
      if (S.players[S.currentIdx].id !== playerId) return { ok: false, msg: '还没轮到你' };
      if (S.step !== 'action') return { ok: false, msg: '现在不是行动阶段' };
      if (S.broadcast) return { ok: false, msg: '有广播待结算' };
      return { ok: true, p };
    }

    /* ---------- 弃牌 ---------- */
    function discardCards(playerId, uids) {
      const c = canAct(playerId); if (!c.ok) return c;
      if (S.discardUsed) return { ok: false, msg: '本回合已经弃置过了（每回合只能弃一次）' };
      const p = c.p;
      const cards = [];
      (uids || []).forEach(u => {
        const i = p.hand.findIndex(x => x.uid === u);
        if (i >= 0) cards.push(p.hand.splice(i, 1)[0]);
      });
      if (!cards.length) return { ok: false, msg: '没有可弃的牌' };

      const batch = nextBatch();
      cards.forEach(card => pushDiscard(card, p.id, { batch, tag: 'discard' }));
      S.arrow = { playerId: p.id, uids: cards.map(x => x.uid), at: Date.now() };
      log(`${p.name} 弃置 ${cards.length} 张手牌`, 'discard');

      S.actionCount = (S.actionCount || 0) + 1;
      S.discardUsed = true;

      if (S.mode === 'standard') {
        // 标准局：弃牌＝交棒。补给交给回合结束统一处理，这里不额外补
        log(`${p.name} 弃牌后直接结束回合`, 'discard');
        endTurn(p.id);
        return { ok: true, endedTurn: true };
      }

      // 快速局：弃牌＝换牌，立刻补满，还能接着出牌（但不能再弃）
      refillHand(p, '立即补牌');
      return { ok: true };
    }

    /* ---------- 建设 ---------- */
    function playBuild(playerId, cardUid) {
      const c = canAct(playerId); if (!c.ok) return c;
      const p = c.p;
      const i = p.hand.findIndex(x => x.uid === cardUid);
      if (i < 0) return { ok: false, msg: '手牌中没有这张牌' };
      const card = p.hand[i], def = CARD_DEFS[card.key];
      if (def.type !== 'build') return { ok: false, msg: '这不是建设牌' };
      if (def.escape) return { ok: false, msg: '光速飞船不能建造，只能在遭到打击时选择启动' };
      if (p.energy < def.cost) return { ok: false, msg: `能量不足（需要 ${def.cost}）` };
      if (def.onePerPlayer && p.buildZone.some(x => x.key === card.key))
        return { ok: false, msg: '每个玩家只能建造 1 个戴森球' };

      p.hand.splice(i, 1);
      const buildBefore = p.energy;
      p.energy -= def.cost;
      noteEnergy(p, buildBefore, 'build');
      p.buildZone.push(card);
      log(`${p.name} 建造「${def.name}」（−${def.cost} 能量）`, 'build');
      ev('build', { actor: p.id, card: card.key });
      markActed();
      return { ok: true };
    }

    /* ---------- 广播 ---------- */
    function playBroadcast(playerId, cardUid, targetGalaxy) {
      const c = canAct(playerId); if (!c.ok) return c;
      const p = c.p;
      const i = p.hand.findIndex(x => x.uid === cardUid);
      if (i < 0) return { ok: false, msg: '手牌中没有这张牌' };
      const card = p.hand[i], def = CARD_DEFS[card.key];
      if (def.type !== 'broadcast') return { ok: false, msg: '这不是广播牌' };
      if (p.energy < def.cost) return { ok: false, msg: `能量不足（需要 ${def.cost}）` };

      const d = galaxyDistance(p.galaxy, targetGalaxy);
      if (d > def.dist) return { ok: false, msg: `超出广播距离（距离 ${d}，上限 ${def.dist === INF ? '∞' : def.dist}）` };

      const candidates = [];
      S.players.forEach(o => {
        if (!o.alive || o.id === p.id) return;
        const od = galaxyDistance(o.galaxy, targetGalaxy);
        // 可用 = 是广播牌 + 距离够 + 付得起这张牌的能量（没能量时连候选者都不算）
        const usable = o.hand.filter(x => {
          const bd = CARD_DEFS[x.key];
          return bd.type === 'broadcast' && od <= bd.dist && bd.cost <= o.energy;
        });
        if (!usable.length) return;
        const isTarget = (o.galaxy === targetGalaxy);
        const hasListener = o.buildZone.some(x => CARD_DEFS[x.key].noResponse);
        candidates.push({
          playerId: o.id,
          // 强制回应成立的前提是「手里真的有能用的广播牌」——没牌就根本没法回应，
          // 因此这种人连候选者都不算，哪怕广播的就是他所在星系。
          mandatory: isTarget && !hasListener && usable.length > 0,
          canDecline: isTarget && hasListener,
          options: usable.map(x => ({ uid: x.uid, key: x.key, face: CARD_DEFS[x.key].face })),
        });
      });

      p.hand.splice(i, 1);
      const now = Date.now();
      S.broadcast = {
        casterId: p.id,
        card,
        cost: def.cost,
        targetGalaxy,
        candidates,
        responses: {},
        stage: 'collecting',
        createdAt: now,
        // 有人能回应：最多等 60 秒；没人能回应：随机等 5–20 秒后自动结算
        deadline: now + (candidates.length ? 60000 : 5000 + Math.floor(Math.random() * 15001)),
        chooseDeadline: null,
      };

      // 只公布「谁朝哪儿发了哪种广播」，不公布合作/伪装——那一面结算时才翻。
      // ⚠️ 更不能公布**实际距离**（发布者到目标星系的真实格数）：
      //    目标星系是公开的，距离一公布，发布者的位置就等于公开了。
      //    公开的只有「这张牌的射程」——即「发布者在目标星系 N 格以内」，
      //    这正是观察者本来就能推出来的约束（见设计文档 2.4.1）。
      const radius = def.dist === INF ? null : def.dist;
      const rangeText = radius === null ? '任意星系' : `距目标 ≤ ${radius} 格`;
      log(`${p.name} 发布「${familyName(card.key)}」→ ${GALAXY_NAMES[targetGalaxy]}（${rangeText}）`, 'broadcast');
      ev('broadcast_cast', { actor: p.id, family: hideFace(card.key), target: targetGalaxy, radius });
      markActed();
      return { ok: true };
    }

    /** 单个玩家提交响应（联机用）；uid 为 null 表示不回应 */
    function setResponse(playerId, uidOrNull, face) {
      const B = S.broadcast;
      if (!B || B.stage !== 'collecting') return { ok: false, msg: '当前没有待响应的广播' };
      const cand = B.candidates.find(c => c.playerId === playerId);
      if (!cand) return { ok: false, msg: '你没有响应资格' };

      if (uidOrNull) {
        const opt = cand.options.find(o => o.uid === uidOrNull);
        if (!opt) return { ok: false, msg: '这张牌不能用于该广播' };
        if (cand.mandatory === false && !cand.options.length) return { ok: false, msg: '无可用牌' };
        B.responses[playerId] = { uid: uidOrNull, key: opt.key, face: opt.face };
      } else {
        if (cand.mandatory) return { ok: false, msg: '强制回应者必须回应' };
        B.responses[playerId] = null;
      }
      return { ok: true, complete: responsesComplete() };
    }

    function responsesComplete() {
      const B = S.broadcast;
      if (!B) return false;
      return B.candidates.every(c => Object.prototype.hasOwnProperty.call(B.responses, c.playerId));
    }

    /** 所有响应到齐后调用；返回 autoResolved / needChoose */
    function finalizeBroadcast() {
      const B = S.broadcast;
      if (!B || B.stage !== 'collecting') return { ok: false, msg: '当前不在收集阶段' };
      if (!responsesComplete()) return { ok: false, msg: '还有玩家未响应' };

      const responders = Object.entries(B.responses).filter(([, v]) => v);
      if (!responders.length) {
        B.stage = 'resolving';
        resolveNoResponse();
        return { ok: true, noResponse: true };
      }
      if (responders.length === 1) {
        B.stage = 'choosing';
        const res = chooseResponder(responders[0][0]);
        return res.ok ? { ok: true, autoResolved: true } : res;
      }
      B.stage = 'choosing';
      B.chooseDeadline = Date.now() + 15000;   // 发布者 15 秒内没挑就自动结算
      return { ok: true, needChoose: true };
    }

    function chooseResponder(playerId, byPlayerId) {
      const B = S.broadcast;
      if (!B || B.stage !== 'choosing') return { ok: false, msg: '当前不在选择阶段' };
      if (byPlayerId && B.casterId !== byPlayerId) return { ok: false, msg: '只有发布者可以挑选' };
      const r = B.responses[playerId];
      if (!r) return { ok: false, msg: '该玩家没有回应' };

      const caster = byId(B.casterId), responder = byId(playerId);
      const casterFace = CARD_DEFS[B.card.key].face;

      let cGain = 0, rGain = 0;
      if (casterFace === 'coop' && r.face === 'coop') { cGain = 3; rGain = 3; }
      else if (casterFace === 'coop' && r.face === 'disg') { cGain = 0; rGain = 5; }
      else if (casterFace === 'disg' && r.face === 'coop') { cGain = 5; rGain = 0; }

      const cBefore = caster.energy, rBefore = responder.energy;
      caster.energy = Math.max(0, caster.energy - B.cost);
      caster.energy += cGain;
      // 回应者打出的牌同样要付能量——否则"没能量不能回应"就只是句空话
      const rDef = CARD_DEFS[r.key];
      responder.energy = Math.max(0, responder.energy - rDef.cost);
      responder.energy += rGain;
      noteEnergy(caster, cBefore, 'broadcast');
      noteEnergy(responder, rBefore, 'broadcast');

      // 入堆顺序 = 真实发生顺序：发布者的牌先打出，响应者的牌后打出。
      // 展示层是「后弃的在前」，所以界面上回应牌会排在发布牌前面。
      const batch = nextBatch();
      pushDiscard(B.card, caster.id, { batch, tag: 'cast' });
      const rCard = responder.hand.find(x => x.uid === r.uid);
      if (rCard) {
        responder.hand.splice(responder.hand.indexOf(rCard), 1);
        pushDiscard(rCard, responder.id, { batch, tag: 'response' });
      }

      // 其余回应者：牌被弃掉、能量照付，但拿回 1 点作为补偿
      const others = Object.entries(B.responses).filter(([id, v]) => v && id !== playerId);
      others.forEach(([id]) => {
        const o = byId(id), rv = B.responses[id];
        const od = CARD_DEFS[rv.key];
        const card = o.hand.find(x => x.uid === rv.uid);
        if (card) {
          o.hand.splice(o.hand.indexOf(card), 1);
          pushDiscard(card, o.id, { batch, tag: 'rejected' });
        }
        const oBefore = o.energy;
        o.energy = Math.max(0, o.energy - od.cost);
        o.energy += 1;
        noteEnergy(o, oBefore, 'broadcast');
        log(`${o.name} 的回应未被采纳：弃置「${od.name}」，返还 1 点能量`, 'broadcast');
      });

      const fmt = f => f === 'coop' ? '合作' : '伪装';
      log(`${caster.name}(${fmt(casterFace)}) × ${responder.name}(${fmt(r.face)}) → 发布方 +${cGain}，响应方 +${rGain}`, 'broadcast');
      ev('broadcast_response', {
        actor: responder.id, card: r.key, face: r.face,
        target: B.targetGalaxy, distance: CARD_DEFS[r.key].dist,
      });

      S.arrow = { playerId: responder.id, uids: [rCard ? rCard.uid : null].filter(Boolean), at: Date.now() };
      S.broadcast = null;
      return { ok: true };
    }

    function resolveNoResponse() {
      const B = S.broadcast;
      if (!B) return;
      const caster = byId(B.casterId);
      const nbBefore = caster.energy;
      caster.energy = Math.max(0, caster.energy - B.cost);
      caster.energy += 1;
      noteEnergy(caster, nbBefore, 'broadcast');
      // 进了弃牌堆就是明牌：牌面朝上摆在桌上，谁都能看
      pushDiscard(B.card, caster.id, { batch: nextBatch(), tag: 'cast' });
      log(`无人回应：${caster.name} 获得 1 点能量（能量 ${caster.energy}）`, 'broadcast');
      ev('broadcast_none', { actor: caster.id, target: B.targetGalaxy });
      S.broadcast = null;
    }

    /**
     * 广播超时推进（服务端每秒调用一次，或 DO alarm 触发）。
     * - 收集阶段到期：强制回应者自动出牌（优先伪装面），其余视为不回应
     * - 挑选阶段到期：发布者不挑，自动按「合作优先」结算一名
     */
    function tickBroadcast(now) {
      const B = S.broadcast;
      if (!B || S.phase !== 'playing') return { changed: false };
      const t = now || Date.now();

      if (B.stage === 'collecting' && t >= (B.deadline || 0)) {
        let auto = 0;
        B.candidates.forEach(c => {
          if (Object.prototype.hasOwnProperty.call(B.responses, c.playerId)) return;
          if (c.mandatory && c.options && c.options.length) {
            const pick = c.options.find(o => o.face === 'disg') || c.options[0];
            B.responses[c.playerId] = { uid: pick.uid, key: pick.key, face: pick.face };
          } else {
            B.responses[c.playerId] = null;
          }
          auto++;
        });
        if (auto) log(`等待超时：${auto} 名未响应的玩家已自动处理`, 'broadcast');
        const res = finalizeBroadcast();
        if (res && res.ok === false && S.broadcast) S.broadcast = null;
        return { changed: true, timedOut: true, needChoose: !!(res && res.needChoose) };
      }

      if (B.stage === 'choosing' && B.chooseDeadline && t >= B.chooseDeadline) {
        const responders = Object.entries(B.responses).filter(([, v]) => v);
        if (responders.length) {
          // 看不见面，就没有"合作优先"可言——按回应先后取第一个
          const pick = responders[0];
          log('等待挑选超时：自动结算最先回应的那名', 'broadcast');
          chooseResponder(pick[0], B.casterId);
        } else {
          S.broadcast = null;
        }
        return { changed: true, timedOut: true };
      }
      return { changed: false };
    }

    /* ---------- 打击 ---------- */
    function playStrike(playerId, cardUid, targetGalaxy) {
      const c = canAct(playerId); if (!c.ok) return c;
      const p = c.p;
      const i = p.hand.findIndex(x => x.uid === cardUid);
      if (i < 0) return { ok: false, msg: '手牌中没有这张牌' };
      const card = p.hand[i], def = CARD_DEFS[card.key];
      if (def.type !== 'strike') return { ok: false, msg: '这不是打击牌' };
      if (p.energy < def.cost) return { ok: false, msg: `能量不足（需要 ${def.cost}）` };

      const d = galaxyDistance(p.galaxy, targetGalaxy);
      p.hand.splice(i, 1);
      const strikeBefore = p.energy;
      p.energy -= def.cost;
      noteEnergy(p, strikeBefore, 'strike');

      const st = {
        uid: card.uid, key: card.key, casterId: p.id,
        targetGalaxy, progress: 0, required: d,
        resolved: false, createdAtTurn: S.turnIndex,
      };
      p.strikes.push(st);
      // 只公开「谁朝哪个星系开了火」，不公开飞行回合数——那等于公开打击者到目标的距离。
      // 隐藏目标模式下，连「朝哪儿」都不公开：只留「谁 · 哪种 · 已飞几手」。
      // 例外：immediate 牌（科技锁死）打出即生效，落点当回合就该公开。
      if (blindStrikes() && !def.immediate) {
        log(`${p.name} 发射「${def.name}」——目标不公开（−${def.cost} 能量）`, 'strike');
        ev('strike_cast', { actor: p.id, card: card.key, hidden: true });
      } else {
        log(`${p.name} 发射「${def.name}」→ ${GALAXY_NAMES[targetGalaxy]}（−${def.cost} 能量）`, 'strike');
        ev('strike_cast', { actor: p.id, card: card.key, target: targetGalaxy });
      }
      markActed();
      // 科技锁死标注了 immediate：打出即生效，不等飞行
      if (d === 0 || def.immediate) {
        resolveStrike(st);
        // 距离 0 = 打的是自己脚下，可能把自己打死；死人没法自己点结束回合
        advanceIfCurrentDead();
      }
      return { ok: true };
    }

    function withdrawStrike(playerId, strikeUid) {
      if (S.phase !== 'playing') return { ok: false, msg: '对局已结束' };
      const p = byId(playerId);
      if (!p || !p.alive) return { ok: false, msg: '玩家不可用' };
      const st = p.strikes.find(s => s.uid === strikeUid && !s.resolved);
      if (!st) return { ok: false, msg: '没有这张飞行中的打击' };
      p.strikes.splice(p.strikes.indexOf(st), 1);
      const def = CARD_DEFS[st.key];
      pushDiscard({ uid: st.uid, key: st.key }, p.id, { batch: nextBatch(), tag: 'discard' });
      log(`${p.name} 撤回「${def.name}」——能量不退`, 'strike');
      // 撤回的牌从未生效，目标不该因为"撤回"这个动作被公开
      ev('strike_withdraw', blindStrikes()
        ? { actor: p.id, card: st.key }
        : { actor: p.id, card: st.key, target: st.targetGalaxy });
      return { ok: true };
    }

    function resolveStrike(st) {
      st.resolved = true;
      const caster = byId(st.casterId);
      const def = CARD_DEFS[st.key];
      const targets = S.players.filter(p => p.alive && p.galaxy === st.targetGalaxy);
      const target = targets[0];

      if (!target) {
        // 战报只写「什么打击抵达什么星系」——不写"空无一人"。
        // 目标星系有没有人是核心情报，写出来等于给全场一台扫描器。
        log(`「${def.name}」抵达 ${GALAXY_NAMES[st.targetGalaxy]}`, 'strike');
        ev('strike_miss', { actor: st.casterId, card: st.key, target: st.targetGalaxy });
        // 光粒 / 湮灭 / 降维打的是"恒星"不是"人"：没人也要摧毁恒星，
        // 与"被防御时照样摧毁"保持一致（卡面写的就是"无论是否被防御"）。
        applyGalaxyEffects(st, def);
        if (caster) caster.strikes = caster.strikes.filter(s => s !== st);
        pushDiscard({ uid: st.uid, key: st.key }, st.casterId, { batch: nextBatch(), tag: 'discard' });
        return;
      }

      const defenders = target.buildZone.filter(b => def.level !== INF && CARD_DEFS[b.key].defense >= def.level);
      const defended = defenders.length > 0;
      const wouldDie = !defended;

      // 科技锁死不杀人，自然轮不到光速飞船，先处理掉
      if (def.disableBuilds) {
        const n = target.buildZone.length;
        discardAllBuilds(target);
        log(`${target.name}（${GALAXY_NAMES[st.targetGalaxy]}）的 ${n} 张已建卡牌被科技锁死拆除（玩家存活，能量与手牌不受影响）`, 'strike');
        ev('strike_hit', { actor: st.casterId, card: st.key, target: st.targetGalaxy, defended: false, disabled: n });
        // 科技锁死是明牌事件：目标写进弃牌条目，当回合在弃牌堆里查得到
        finishStrike(st, caster, { killed: false, targetGalaxy: st.targetGalaxy });
        return;
      }

      // 光速飞船只在"这一击会要命"的瞬间才有资格启动，且必须由被打的人自己点头。
      // 手里有牌 + 付得起 10 能量 + 没用过 → 停下来问他；否则直接进死亡流程。
      if (wouldDie && !target.lightshipUsed) {
        const shipCard = target.hand.find(c => CARD_DEFS[c.key].escape);
        if (shipCard && target.energy >= CARD_DEFS[shipCard.key].cost) {
          S.escapePending = {
            strikeUid: st.uid,
            targetId: target.id,
            cardUid: shipCard.uid,
            cardKey: shipCard.key,
            cost: CARD_DEFS[shipCard.key].cost,
            // 上一次挂起还没走完时又被打中，退回"生产"重新接回合，绝不能让 step 残留成 escape
            prevStep: S.step === 'escape' ? 'production' : S.step,
            deadline: Date.now() + 30000,   // 挂机兜底：30 秒不选即视为放弃
          };
          S.step = 'escape';
          log(`${target.name} 手里有「光速飞船」——等待他决定是否启动`, 'strike');
          return;
        }
      }

      if (defended) {
        // 只写"抵达"：谁挡下了不公开——写出来等于告诉全场"那个星系有人，还有防御"
        log(`「${def.name}」抵达 ${GALAXY_NAMES[st.targetGalaxy]}`, 'strike');
        ev('strike_hit', { actor: st.casterId, card: st.key, target: st.targetGalaxy, defended: true });
        applyGalaxyEffects(st, def);
      } else {
        // 死讯本来就是公开的（座位卡会变灰），但理由里不再重复星系位置
        eliminate(target, `被「${def.name}」命中`);
        ev('strike_hit', { actor: st.casterId, card: st.key, target: st.targetGalaxy, defended: false });
        applyGalaxyEffects(st, def);
        log(`「${def.name}」抵达 ${GALAXY_NAMES[st.targetGalaxy]}`, 'strike');
      }
      // 只有真把人打死才配拿清场奖励；被挡下只是"打了，没死"
      finishStrike(st, caster, { killed: !defended });
    }

    function applyGalaxyEffects(st, def) {
      const g = st.targetGalaxy;
      if (def.destroyStar) {
        S.markers[g].black = true;
        log(`${GALAXY_NAMES[g]} 的恒星被毁灭（依赖恒星的建筑失效）`, 'marker');
        ev('marker', { galaxy: g, kind: 'black' });
      }
      if (def.destroyBuilds) {
        S.markers[g].purple = true;
        S.players.forEach(p => { if (p.galaxy === g) discardAllBuilds(p); });
        log(`${GALAXY_NAMES[g]} 被标记为紫色（湮灭）`, 'marker');
        ev('marker', { galaxy: g, kind: 'purple' });
      }
      if (def.destroyGalaxy) {
        S.markers[g].red = true;
        log(`${GALAXY_NAMES[g]} 被彻底清除（红色标记）`, 'marker');
        ev('marker', { galaxy: g, kind: 'red' });
      }
    }

    /**
     * 被打者的决定：use=true 启动光速飞船，false 放弃（等于被命中）。
     * 决定完把被打断的回合接回去——他是在自己回合开始结算打击时被打断的。
     */
    function chooseEscape(playerId, use) {
      const E = S.escapePending;
      if (!E) return { ok: false, msg: '当前没有待决的光速飞船' };
      if (E.targetId !== playerId) return { ok: false, msg: '这不是你能决定的事' };

      const target = byId(E.targetId);
      const caster = byId((function () {
        const owner = S.players.find(p => p.strikes.some(x => x.uid === E.strikeUid));
        return owner ? owner.id : null;
      })());
      const st = caster && caster.strikes.find(x => x.uid === E.strikeUid);
      if (!st) { S.escapePending = null; return { ok: false, msg: '这支打击已不存在' }; }
      const sdef = CARD_DEFS[st.key];

      S.escapePending = null;

      if (use) {
        escapeWithLightship(target, st, sdef, E.cardUid);
      } else {
        log(`${target.name} 放弃启动光速飞船`, 'strike');
        ev('lightship_decline', { actor: target.id });
        eliminate(target, `被「${sdef.name}」命中 · ${GALAXY_NAMES[st.targetGalaxy]}`);
        ev('strike_hit', { actor: st.casterId, card: st.key, target: st.targetGalaxy, defended: false });
        applyGalaxyEffects(st, sdef);
        finishStrike(st, caster, { killed: true });
      }

      if (S.phase !== 'playing') return { ok: true };

      const me = byId(playerId);
      const cur = S.players[S.currentIdx];
      // 被打的人自己就是当前玩家，而且他已经死了 → 换人
      if (!me.alive && cur && cur.id === playerId) { nextPlayer(); return { ok: true }; }
      if (S.step !== 'escape') return { ok: true };

      // 接回被挂起的回合：打击是在"当前玩家回合开始的结算"里命中的，
      // 那个回合还没走完（生产 → 行动），要接着走。
      if (!cur || !cur.alive) { nextPlayer(); return { ok: true }; }
      if (E.prevStep === 'production') startActionPhase(cur);
      else S.step = E.prevStep || 'action';
      return { ok: true };
    }

    /** 挂机兜底：30 秒没点就当放弃，避免整局卡死 */
    function tickEscape(now) {
      const E = S.escapePending;
      if (!E) return { changed: false };
      const t = now || Date.now();
      if (t < (E.deadline || 0)) return { changed: false };
      log('等待光速飞船决定超时：视为放弃', 'strike');
      chooseEscape(E.targetId, false);
      return { changed: true, timedOut: true };
    }

    function escapeWithLightship(target, st, def, cardUid) {
      target.lightshipUsed = true;

      // 这张牌本身要弃掉——它是消耗品，不是建在星系里的设施
      const idx = target.hand.findIndex(c => c.uid === cardUid);
      if (idx >= 0) {
        const card = target.hand.splice(idx, 1)[0];
        pushDiscard(card, target.id, { batch: nextBatch(), tag: 'discard' });
      }
      discardAllBuilds(target);
      const shipBefore = target.energy;
      target.energy = 0;
      noteEnergy(target, shipBefore, 'lightship');

      const occupied = new Set(S.players.filter(p => p.alive).map(p => p.galaxy));
      const empties = [1,2,3,4,5,6,7,8,9].filter(g => !occupied.has(g) && !S.markers[g].red);
      if (!empties.length) {
        log(`${target.name} 启动光速飞船，但已无空星系可去`, 'strike');
        eliminate(target, '无处可逃');
        finishStrike(st, byId(st.casterId), { killed: true });
        return;
      }
      const dest = empties[Math.floor(Math.random() * empties.length)];
      const from = target.galaxy;
      target.galaxy = dest;
      // 跃迁是随机的，落点只有他自己知道——对外只公布"他跑了"
      log(`${target.name} 启动光速飞船，撤离 ${GALAXY_NAMES[from]}（去向不明；弃全部建设牌与能量）`, 'strike');
      ev('lightship', { actor: target.id, from });
      // 目标成功逃跑：没人被淘汰，不给清场奖励（曾经的 bug 这里也发）
      finishStrike(st, byId(st.casterId), { killed: false });
    }

    function finishStrike(st, caster, opts) {
      const alive = alivePlayers().length;
      // 清场奖励只发给**真淘汰了人**的打击。
      // ⚠️ 曾经的 bug：奖励挂在"打击结束"上，被挡下、目标乘光速飞船逃跑都会触发，
      //    3 人局白送 9 能量——玩家没淘汰任何人却能量暴涨，就是这个原因。
      //    科技锁死（killed:false）、打击落空（提前 return 不走这里）同理不给。
      if (opts && opts.killed && caster && caster.alive) {
        const reward = alive * 3;
        const rewardBefore = caster.energy;
        caster.energy += reward;
        noteEnergy(caster, rewardBefore, 'reward');
        log(`${caster.name} 获得清场奖励 +${reward} 能量（剩余 ${alive} 人）`, 'reward');
      }
      if (caster) caster.strikes = caster.strikes.filter(s => s !== st);
      // opts.targetGalaxy 只在「科技锁死」这类当回合就公开落点的牌上带
      const meta = { batch: nextBatch(), tag: 'discard' };
      if (opts && opts.targetGalaxy != null) meta.targetGalaxy = opts.targetGalaxy;
      pushDiscard({ uid: st.uid, key: st.key }, st.casterId, meta);
      checkVictory();
    }

    function discardAllBuilds(p) {
      const builds = p.buildZone.splice(0, p.buildZone.length);
      const bb = nextBatch();
      builds.forEach(c => pushDiscard(c, p.id, { batch: bb, tag: 'discard' }));
    }

    function eliminate(p, reason) {
      p.alive = false;
      p.eliminatedTurn = S.turnIndex;
      log(`${p.name} 被淘汰（${reason}）`, 'elim');
      ev('eliminate', { actor: p.id, galaxy: p.galaxy });

      // 文明毁灭后，它自己还在飞的打击失去制导——否则会永远挂在星图上没人推进
      const flying = p.strikes.filter(s => !s.resolved);
      if (flying.length) {
        p.strikes = p.strikes.filter(s => s.resolved);
        const fb = nextBatch();
        flying.forEach(st => pushDiscard({ uid: st.uid, key: st.key }, p.id, { batch: fb, tag: 'discard' }));
        log(`${p.name} 在飞的 ${flying.length} 枚打击失去制导，坠入虚空`, 'elim');
        flying.forEach(st => ev('strike_void', blindStrikes()
          ? { actor: p.id, card: st.key }
          : { actor: p.id, card: st.key, target: st.targetGalaxy }));
      }
      const hand = p.hand.splice(0, p.hand.length);
      const hb = nextBatch();
      hand.forEach(c => pushDiscard(c, p.id, { batch: hb, tag: 'discard' }));
      discardAllBuilds(p);
    }

    function checkVictory() {
      if (alivePlayers().length <= 1) endGame();
    }

    /** 回合上限兜底：AI 互相对憋防御时可能永远打不完，用能量最高者收局 */
    function forceEnd(reason) {
      if (S.phase !== 'playing') return { ok: false };
      const alive = alivePlayers();
      const best = alive.slice().sort((a, b) => b.energy - a.energy)[0];
      // 收局时把还在挂起的广播 / 光速飞船决定一并清掉，否则前端会留一个点不动的弹窗
      S.broadcast = null;
      S.escapePending = null;
      S.step = 'ended';
      S.phase = 'ended';
      S.winner = best ? best.id : null;
      S.endReason = 'heat_death';
      log(`宇宙热寂（${reason || '回合上限'}）：能量最高者 ${best ? best.name : '无'} 胜出`, 'system');
      return { ok: true };
    }

    function endGame() {
      const alive = alivePlayers();
      S.phase = 'ended';
      S.winner = alive.length === 1 ? alive[0].id : null;
      S.endReason = 'last_stand';
      log(alive.length === 1 ? `${alive[0].name} 成为最后的幸存者` : '所有文明均被清理，全场无赢家', 'system');
    }

    /* ---------- 弃牌堆 ---------- */
    /** 开一批弃牌：同一次动作产生的牌共享 batch，前端据此堆叠 */
    function nextBatch() {
      S.discardSeq = (S.discardSeq || 0) + 1;
      return S.discardSeq;
    }

    /**
     * 入弃牌堆。meta.tag 用于标记来源：
     *   cast 广播发布 / response 广播回应 / rejected 未被采纳的回应 / discard 主动弃置
     */
    function pushDiscard(card, ownerId, meta) {
      const m = meta || {};
      // 弃牌堆一律明牌：牌面朝上，合作 / 伪装都看得见
      const entry = {
        uid: card.uid, key: card.key, ownerId,
        name: CARD_DEFS[card.key].name, turn: S.turnIndex,
        batch: m.batch || 0,
        tag: m.tag || 'discard',
      };
      // 只有「打出即生效、落点当回合就公开」的牌才带目标（目前是科技锁死）。
      // 其它打击的目标一律不落库，避免从弃牌堆把飞行中的目标翻出来。
      if (m.targetGalaxy != null) entry.targetGalaxy = m.targetGalaxy;
      S.discard.current.push(entry);
    }

    function rollDiscard() {
      const recycled = S.discard.last;
      if (recycled.length) {
        recycled.forEach(d => S.deck.push({ uid: d.uid, key: d.key }));
        shuffle(S.deck);
        log(`${recycled.length} 张牌已洗回牌库`, 'discard');
      }
      S.discard.last = S.discard.current;
      S.discard.current = [];
    }

    /* ---------- 结束回合 ---------- */
    function endTurn(playerId) {
      if (S.phase !== 'playing') return { ok: false, msg: '对局已结束' };
      const cur = S.players[S.currentIdx];
      if (playerId && cur.id !== playerId) return { ok: false, msg: '还没轮到你' };
      if (!cur.alive) return { ok: false, msg: '你已出局' };
      if (S.broadcast) return { ok: false, msg: '请先结算当前广播' };
      if (S.escapePending) return { ok: false, msg: '请先决定是否启动光速飞船' };

      S.step = 'supply';
      refillHand(cur, '补牌');
      rollDiscard();

      if (alivePlayers().length <= 1) { endGame(); return { ok: true }; }
      if (S.turnIndex >= MAX_TURNS) { forceEnd('回合上限'); return { ok: true }; }
      nextPlayer();
      return { ok: true };
    }

    /* ---------- 查询 ---------- */
    function validTargets(playerId, cardUid, kind) {
      const p = byId(playerId);
      const card = p.hand.find(x => x.uid === cardUid);
      if (!card) return [];
      const def = CARD_DEFS[card.key];
      if (kind === 'broadcast' && def.type !== 'broadcast') return [];
      if (kind === 'strike' && def.type !== 'strike') return [];
      const limit = kind === 'broadcast' ? def.dist : INF;
      return [1,2,3,4,5,6,7,8,9].filter(g => galaxyDistance(p.galaxy, g) <= limit);
    }

    const api = {
      newGame, state: () => S, currentPlayer: () => S.players[S.currentIdx], byId, alivePlayers,
      playBuild, playBroadcast, setResponse, responsesComplete, finalizeBroadcast, chooseResponder,
      playStrike, withdrawStrike, discardCards, endTurn, validTargets, forceEnd, tickBroadcast,
      chooseEscape, tickEscape,
      playerNames: () => S.players.map(p => p.name),
      /** 从快照恢复（Durable Object 休眠唤醒 / 服务器热重载用） */
      hydrate(snapshot) {
        S = snapshot;
        S.mode = S.mode || 'standard';   // 旧快照没有这个字段
        // 旧快照没有打击目标设置 → 退回 open（与旧版行为一致）
        S.strikeTarget = S.strikeTarget === 'hidden' ? 'hidden' : 'open';
        S.events = S.events || [];
        S.eventSeq = S.eventSeq || (S.events.length ? S.events[S.events.length - 1].id : 0);
        return api;
      },
      _log: log,
    };
    // 传入名单即自动开局
    if (names && names.length) api.newGame(names);
    return api;
  }

  /* 单机兼容层：浏览器里仍可用全局 Engine（内部持有一个实例） */
  let _solo = null;
  const Engine = {
    newGame(names) { _solo = createGame(names); return _solo.state(); },
    getState() { return _solo ? _solo.state() : null; },
    currentPlayer() { return _solo ? _solo.currentPlayer() : null; },
    playBuild: (...a) => _solo.playBuild(...a),
    playBroadcast: (...a) => _solo.playBroadcast(...a),
    submitResponses(map) {
      const B = _solo.state().broadcast;
      if (!B) return { ok: false, msg: '当前没有待响应的广播' };
      for (const c of B.candidates) {
        const r = map[c.playerId];
        _solo.setResponse(c.playerId, r && r.uid ? r.uid : null, r ? r.face : null);
      }
      return _solo.finalizeBroadcast();
    },
    chooseResponder(pid) { return _solo.chooseResponder(pid); },
    playStrike: (...a) => _solo.playStrike(...a),
    withdrawStrike: (...a) => _solo.withdrawStrike(...a),
    discardCards: (...a) => _solo.discardCards(...a),
    endTurn: () => _solo.endTurn(),
    validBroadcastTargets: (pid, uid) => _solo.validTargets(pid, uid, 'broadcast'),
  };

  return { createGame, Engine, CARD_DEFS, GALAXY_NAMES, ADJACENCY, galaxyDistance, INF };
});
