/* ============================================================
 * shared/view.js — 可见性过滤
 * 唯一职责：把服务端完整状态裁剪成某个玩家能看到的视图。
 * 红线：坐标、手牌、别人未公开的选择，一律不下发。
 * ============================================================ */

(function (root, factory) {
  let cards;
  if (typeof module === 'object' && module.exports) cards = require('./cards.js');
  else cards = root;
  const api = factory(cards);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, api);   // 浏览器：挂到 window.viewFor
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {

  const { CARD_DEFS, GALAXY_NAMES } = C;

function publicPlayer(p, playerId, opts) {
  // 关闭「打击目标显示」时，别人的打击只剩「谁 · 哪种 · 已飞几手」，
  // 目的地要等落地那一刻才由结算公开。自己的打击始终看得见目标。
  const hideStrikeTargets = !!(opts && opts.hideStrikeTargets);
  return {
    id: p.id,
    seat: p.seat,
    name: p.name,
    alive: p.alive,
    energy: p.energy,
    handCount: p.hand.length,
    buildZone: p.buildZone.map(c => ({ uid: c.uid, key: c.key })),   // 建设区公开
    // 打击正面朝上，但**飞行回合数只有发起者知道**：
    // 轮数 = 发起者到目标的距离，公开它就等于公开发起者坐标。
    strikes: p.strikes.filter(s => !s.resolved).map(s => {
      const mine = s.casterId === playerId;
      const blind = hideStrikeTargets && !mine;
      return {
        uid: s.uid, key: s.key,
        targetGalaxy: blind ? null : s.targetGalaxy,
        blind,                       // 前端据此渲染「目标不明」
        mine,
        // 「已经飞了几手」是公开的（进度指示物摆在桌上），
        // 但「还要几手」= 距离，只有发起者知道。
        progress: s.progress,
        required: mine ? s.required : null,
        turnsLeft: mine ? Math.max(0, s.required - s.progress) : null,
      };
    }),
  };
}

/**
 * 事件流裁剪。事件流是「战报 / 弹窗 / AI 记忆」的共同上游，
 * 堵住 players 里的字段还不够——漏在这里等于全泄。
 */
function visibleEvents(S, playerId) {
  const src = (S.events || []).slice(-160);
  if (S.strikeTarget !== 'hidden') return src;
  return src.map(e => {
    if (!e || e.actor === playerId) return e;          // 自己发的，自己知道
    // 只在「发射 / 撤回 / 坠毁」这三个阶段藏目标；命中与落空本身就是要公开的
    if (e.type !== 'strike_cast' && e.type !== 'strike_withdraw' && e.type !== 'strike_void') return e;
    const out = Object.assign({}, e);
    delete out.target;
    delete out.distance;
    return out;
  });
}

/**
 * 弃牌条目。隐藏目标模式下，只有「科技锁死」带落点，而且只在**当前回合**
 * 的弃牌堆里露出来——下一回合它滚进「上一回合」区，就和其它弃牌一样匿名了。
 * （锁死是 immediate 牌，打出即生效，落点本来就该公开；这一条只是让玩家
 *   在战报滚走之后还能在弃牌堆里查到"刚砸的是哪个星系"。）
 */
function discardEntry(d, S, hideStrikeTargets) {
  const owner = (S.players || []).find(p => p.id === d.ownerId);
  const out = {
    uid: d.uid, key: d.key, name: d.name, turn: d.turn,
    batch: d.batch || 0, tag: d.tag || 'discard',
    // 谁打出来的：窄屏没有空间画跨屏箭头，直接把名字写在牌块上
    actor: d.ownerId || null,
    actorName: owner ? owner.name : '',
  };
  if (hideStrikeTargets && d.key === 'lock' && d.turn === S.turnIndex && d.targetGalaxy != null) {
    out.targetGalaxy = d.targetGalaxy;
  }
  return out;
}

function viewFor(game, playerId) {
  const S = game.state();
  if (!S) return null;
  const me = S.players.find(p => p.id === playerId);
  const hideStrikeTargets = S.strikeTarget === 'hidden';

  const players = S.players.map(p => {
    const base = publicPlayer(p, playerId, { hideStrikeTargets });
    if (p.id === playerId) {
      base.galaxy = p.galaxy;          // 只有自己知道坐标
      base.hand = p.hand.map(c => ({ uid: c.uid, key: c.key }));
      base.isMe = true;
    } else {
      base.galaxy = null;              // 其他人：坐标不下发
      base.hand = null;                // 其他人：手牌不下发
    }
    return base;
  });

  // 广播视图：收集阶段绝不泄露别人的选择
  let broadcast = null;
  if (S.broadcast) {
    const B = S.broadcast;
    const collecting = B.stage === 'collecting';
    const myCand = B.candidates.find(c => c.playerId === playerId);
    const isCaster = B.casterId === playerId;
    broadcast = {
      casterId: B.casterId,
      // 广播牌的「合作 / 伪装」面要在结算时才翻：除发布者本人，谁都不下发真实 key
      card: isCaster
        ? { uid: B.card.uid, key: B.card.key, name: CARD_DEFS[B.card.key].name, revealed: true }
        : { uid: B.card.uid, key: C.hideFace(B.card.key), name: C.familyName(B.card.key), revealed: false },
      targetGalaxy: B.targetGalaxy,
      stage: B.stage,
      deadline: B.deadline,
      chooseDeadline: B.chooseDeadline || null,
      // 我自己是不是就在被广播的星系（自己的坐标自己知道，不构成泄露）
      iAmTarget: me.galaxy === B.targetGalaxy,
      // 只给「有多少人能回应」这个聚合数，不给名单——
      // 名单等于公开「谁手里有能用的广播牌」，属于未打出的手牌信息
      candidateCount: B.candidates.length,
      myCandidate: myCand ? {
        mandatory: myCand.mandatory,
        canDecline: myCand.canDecline,
        responded: Object.prototype.hasOwnProperty.call(B.responses, playerId),
        options: myCand.options,
      } : null,
      // 收集阶段不下发任何人的回应；进入挑选阶段也只说"谁回应了"，
      // 不说是哪一面——面要等真正结算（翻开）后才公开，弃牌堆里有。
      responders: collecting ? null : Object.entries(B.responses)
        .filter(([, v]) => v)
        .map(([pid]) => ({ playerId: pid })),
      isMyChoice: !collecting && B.casterId === playerId,
      iAmCaster: isCaster,
      myOptions: myCand ? myCand.options : null,
    };
  }

  // 光速飞船待决：只有被打的人能操作，其他人只看到"有人在决定"
  let escape = null;
  if (S.escapePending) {
    const E = S.escapePending;
    escape = E.targetId === playerId
      ? { mine: true, cardUid: E.cardUid, cardKey: E.cardKey, cost: E.cost, deadline: E.deadline }
      : { mine: false, targetId: E.targetId, deadline: E.deadline };
  }

  return {
    phase: S.phase,
    mode: S.mode || 'standard',   // standard / fast，前端据此显示规则与按钮
    // open（默认，全场可见打击目标） / hidden（只公开类型与已飞手数，落地才公布落点）
    strikeTarget: hideStrikeTargets ? 'hidden' : 'open',
    escape,
    turnIndex: S.turnIndex,
    currentPlayerId: S.players[S.currentIdx] ? S.players[S.currentIdx].id : null,
    step: S.step,
    thinking: false,   // 由 server 层填充
    actionsThisTurn: S.actionCount || 0,
    broadcastsThisTurn: S.broadcastsThisTurn || 0,
    discardUsed: !!S.discardUsed,
    players,
    deckCount: S.deck.length,
    discard: {
      // 去 ownerId（匿名），但保留 batch / tag：前端据此堆叠并标注来源
      current: S.discard.current.map(d => discardEntry(d, S, hideStrikeTargets)),
      last: S.discard.last.map(d => discardEntry(d, S, hideStrikeTargets)),
    },
    markers: S.markers,
    broadcast,
    arrow: S.arrow,                    // 弃牌瞬间的归属提示，15 秒后由前端自行淡出
    winner: S.winner,
    endReason: S.endReason || null,
    // 结构化公开事件（与日志同源）：AI 的记忆来源，也是回放的原料。
    // 隐藏打击目标时，别人的发射/撤回/坠毁事件会被摘掉目的地。
    events: visibleEvents(S, playerId),
    log: S.log.slice(0, 60),
    me: me ? { id: me.id, seat: me.seat, name: me.name, galaxy: me.galaxy, alive: me.alive, energy: me.energy } : null,
    galaxyNames: GALAXY_NAMES,
  };
}

  return { viewFor };
});
