/* ============================================================
 * shared/ai.js — 人机（四难度）
 *
 * 设计原则（来自设计文档 4.x / 5.x）：
 *   1. 四个难度共用同一套推理与决策代码，唯一差异是「记忆保真度」
 *   2. AI 只通过 viewFor(game, aiId) 取信息 —— 与真人完全同一条路径
 *   3. 记忆 = 全部公开事件里按保留率随机留下的子集；上一回合硬保护
 *   4. 记忆用 event.id + seed 做确定性采样，因此无需持久化：
 *      同一个 id 要么永远记得、要么永远忘了（不会时好时坏）
 *
 * 输出只有"意图"（build / broadcast / strike / discard / end / respond / choose），
 * 全部交给规则引擎校验，AI 没有作弊通道。
 * ============================================================ */
(function (root, factory) {
  let cards;
  if (typeof module === 'object' && module.exports) cards = require('./cards.js');
  else cards = root;
  const api = factory(cards);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {

  const { CARD_DEFS, GALAXY_NAMES, galaxyDistance, INF } = C;
  const ALL_GALAXIES = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  /* ---------- 四难度：只有记忆保留率不同 ---------- */
  const LEVELS = {
    dehydrator:  { key: 'dehydrator',  name: '脱水者', retention: 0.30, blurb: '记得约三成，常把对手的位置搞混' },
    chaotic_era: { key: 'chaotic_era', name: '乱纪元', retention: 0.55, blurb: '记得一半，大致能拼出位置' },
    stable_era:  { key: 'stable_era',  name: '恒纪元', retention: 0.88, blurb: '几乎不漏，定位相当准' },
    sophon:      { key: 'sophon',      name: '智子',   retention: 1.00, blurb: '记得每一个公开事件' },
  };
  const LEVEL_KEYS = Object.keys(LEVELS);

  /* ---------- 确定性伪随机（同一 id 结果恒定） ---------- */
  function hash01(n) {
    let x = (n | 0) ^ 0x9e3779b9;
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    x = (x ^ (x >>> 16)) >>> 0;
    return x / 4294967296;
  }

  /**
   * 记忆召回：返回这个 AI「现在还记得」的事件列表。
   * - 上一回合（turnIndex-1 之后）的事件硬保护，一定记得
   * - 更早的事件按 retention 均匀抽样保留（无放回，用 id 保证稳定）
   */
  function recall(view, levelKey, seed) {
    const lv = LEVELS[levelKey] || LEVELS.chaotic_era;
    const events = view.events || [];
    if (lv.retention >= 1) return events;
    const t = view.turnIndex;
    return events.filter(e => e.turn >= t - 1 || hash01(e.id * 2654435761 + (seed | 0)) < lv.retention);
  }

  /* ---------- 信念：每个对手「可能在哪些星系」 ---------- */
  function belief(view, meId, memory) {
    const me = view.players.find(p => p.id === meId);
    const live = ALL_GALAXIES.filter(g => !view.markers[g].red && g !== me.galaxy);
    const out = {};

    for (const o of view.players) {
      if (o.id === meId || !o.alive) continue;
      let cand = new Set(live);

      for (const e of memory) {
        // 打击结果不再是公开情报（战报只写"什么打击抵达什么星系"），AI 必须和人看到的一样多：
        //   · 打空：只有自己打空才知道那儿当时没人；别人打空不公开
        //   · 命中（真打死了人）：死讯公开，可以划掉
        //   · 被挡下：既不公开死了人也没公开谁挡的，不能划掉
        if (e.type === 'strike_miss') {
          if (e.actor === meId) cand.delete(e.target);
          continue;
        }
        if (e.type === 'strike_hit') {
          if (!e.defended) cand.delete(e.target);
          continue;
        }
        if (e.actor !== o.id) continue;
        if (e.type === 'broadcast_cast') {
          // 公开的只有这张牌的射程：发布者在目标星系 radius 格以内。
          // 超距广播（radius 为 null）不构成任何约束，一个候选都不能划掉。
          // ⚠️ 这里绝不能去用「实际距离」——那等于让 AI 拿到人眼看不到的坐标信息。
          if (e.radius != null) {
            cand = new Set([...cand].filter(g => galaxyDistance(g, e.target) <= e.radius));
          }
        } else if (e.type === 'broadcast_response') {
          const lim = CARD_DEFS[e.card] ? CARD_DEFS[e.card].dist : 2;
          cand = new Set([...cand].filter(g => galaxyDistance(g, e.target) <= lim));
        } else if (e.type === 'strike_cast') {
          // 飞行回合数不公开（会暴露打击者坐标），所以打击只说明
          // 「他认为目标星系里有人」，对打击者自身位置没有约束力。
          // 唯一能用的是：他不能把目标选在自己站着的星系（否则 0 回合立即生效，
          // 规则上允许，但 AI 不会这么做），这条太弱，直接跳过。
        } else if (e.type === 'lightship') {
          // 跃迁落点不公开：只知道他离开了 e.from，至于去了哪，只能重新猜
          cand.delete(e.from);
        }
      }
      // 约束自相矛盾时（记忆碎片拼不上），退化为「全图均匀」而不是空集
      if (!cand.size) cand = new Set(live);
      out[o.id] = cand;
    }

    // 一个星系只有一个玩家：别人确定了，我就排除
    for (let pass = 0; pass < 4; pass++) {
      const taken = new Set();
      for (const id in out) if (out[id].size === 1) taken.add([...out[id]][0]);
      if (!taken.size) break;
      let changed = false;
      for (const id in out) {
        if (out[id].size === 1) continue;
        const next = new Set([...out[id]].filter(g => !taken.has(g)));
        if (next.size && next.size !== out[id].size) { out[id] = next; changed = true; }
      }
      if (!changed) break;
    }
    return out;
  }

  const probOf = (set, g) => (set && set.has(g) ? 1 / set.size : 0);
  function galaxyMass(cands, g) {
    let s = 0;
    for (const id in cands) s += probOf(cands[id], g);
    return s;
  }

  /* ---------- 决策 ---------- */
  function createAI(playerId, level, seed) {
    const lv = LEVELS[level] ? level : 'chaotic_era';

    function decide(view) {
      if (!view || view.phase !== 'playing') return null;
      const me = view.players.find(p => p.id === playerId);
      if (!me || !me.alive) return null;

      /* ① 广播进行中：先处理响应 / 挑选 */
      if (view.broadcast) {
        const B = view.broadcast;
        if (B.stage === 'collecting') {
          const c = B.myCandidate;
          if (c && !c.responded) return respondAction(view, me, c);
          return null;
        }
        if (B.stage === 'choosing' && B.isMyChoice) return chooseAction(view, B);
        return null;
      }

      /* ② 只在自己的行动阶段出牌 */
      if (view.currentPlayerId !== playerId || view.step !== 'action') return null;

      const memory = recall(view, lv, seed);
      const cands = belief(view, playerId, memory);

      // 一回合最多两个动作，避免无限换牌
      if ((view.actionsThisTurn || 0) >= 2) return { type: 'end' };

      return mainAction(view, me, cands, memory);
    }

    /* ---- 响应广播 ---- */
    function respondAction(view, me, c) {
      const opts = c.options || [];
      if (!opts.length) return { type: 'respond', uid: null };

      // 伪装面是严格占优策略（对方合作我 +5，对方伪装我也不亏）
      const pick = opts.find(o => o.face === 'disg') || opts[0];

      if (c.mandatory) return { type: 'respond', uid: pick.uid, face: pick.face };

      // 可沉默时也基本都回应：伪装面严格占优，回应期望 +3~5 能量，
      // 代价只是暴露「我在目标 d 以内」。唯一例外：只剩一张超距/宇宙广播，
      // 且能量充裕——那张牌留着自己发布更有价值。
      const spare = (me.hand || []).filter(x => CARD_DEFS[x.key].type === 'broadcast').length;
      const precious = opts.length === 1 && pick.cost >= 1 && spare === 1 && me.energy >= 10;
      return precious
        ? { type: 'respond', uid: null, face: null }
        : { type: 'respond', uid: pick.uid, face: pick.face };
    }

    /* ---- 发布者挑选结算对象 ---- */
    function chooseAction(view, B) {
      const list = B.responders || [];
      if (!list.length) return null;
      // 回应者的面在结算前看不到，所以这里没法"挑合作的人"，
      // 只能按席位顺序挑第一个——这正是这一版规则想要的信息不对称。
      return { type: 'choose', targetId: list[0].playerId };
    }

    /* ---- 主行动 ---- */
    function mainAction(view, me, cands, memory) {
      const hand = (me.hand || []).map(c => ({ uid: c.uid, key: c.key, def: CARD_DEFS[c.key] }));
      const ofType = t => hand.filter(x => x.def.type === t);
      const energy = me.energy;
      const alive = view.players.filter(p => p.alive).length;

      /* A. 被打击时先保命 */
      const incoming = [];
      view.players.forEach(p => {
        if (p.id === me.id || !p.alive) return;
        p.strikes.forEach(s => { if (s.targetGalaxy === me.galaxy) incoming.push({ by: p, s }); });
      });
      if (incoming.length) {
        const maxLvl = incoming.reduce((m, x) => Math.max(m, CARD_DEFS[x.s.key].level), 0);
        if (maxLvl !== INF) {
          const shields = ofType('build')
            .filter(x => x.def.defense && x.def.defense >= maxLvl && energy >= x.def.cost)
            .sort((a, b) => a.def.cost - b.def.cost);
          if (shields.length) return buildAction(shields[0]);
        }
        // 挡不住（降维 / 科技锁死）时，手里的光速飞船会在命中时自动弹出选择，
        // 这里不需要、也没法主动建造。
      }

      /* B. 打击：算「期望收益 − 造价」，只有划算才开火 */
      const strikes = ofType('strike').filter(x => energy >= x.def.cost);
      if (strikes.length) {
        const pick = pickStrike(view, me, cands, strikes, alive);
        if (pick) return { type: 'strike', uid: pick.card.uid, galaxy: pick.galaxy };
      }

      /* C. 建设：先滚产能，再补防御 */
      // 光速飞船不是建造牌：它留在手里等被打击，不能建
      const builds = ofType('build').filter(x => energy >= x.def.cost && !x.def.escape);
      if (builds.length) {
        const pick = pickBuild(me, builds, view);
        if (pick) return buildAction(pick);
      }

      /* D. 广播：拿信息（也顺手赚 1 点） */
      // 一回合只发一次广播：每发一次就要等一轮回应（联机 60 秒 / 本地 15 秒），
      // 连发两次就是两轮干等——那正是「AI 看起来不动」的观感来源。
      const casts = (view.broadcastsThisTurn || 0) < 1
        ? ofType('broadcast').filter(x => energy >= x.def.cost + 1)
        : [];
      if (casts.length) {
        const pick = pickProbe(view, me, cands, casts, memory);
        if (pick) return { type: 'broadcast', uid: pick.card.uid, galaxy: pick.galaxy };
      }

      /* E. 没事干：弃掉最没用的牌换一张（每回合只能弃一次） */
      if (hand.length && !view.discardUsed) {
        const worst = pickWorst(hand, energy, me);
        if (worst) return { type: 'discard', uids: [worst.uid] };
      }
      return { type: 'end' };
    }

    function buildAction(x) { return { type: 'build', uid: x.uid }; }

    function pickBuild(me, builds, view) {
      const owned = new Set(me.buildZone.map(b => b.key));
      const income = me.buildZone.reduce((s, b) => s + (CARD_DEFS[b.key].income || 0), 0);
      const scored = [];

      for (const x of builds) {
        const d = x.def;
        let score = 0;
        if (d.income) {
          if (income >= 6) score = 0;                          // 产能已够，别再无脑铺
          else score = (d.income / Math.max(1, d.cost)) * 10;
          if (!d.starDependent) score += 1.2;                  // 不依赖恒星更稳
          if (owned.has(x.key)) score = 0;                     // 同类不重复铺
        } else if (d.defense) {
          const threatened = view.players.some(p => p.alive && p.id !== me.id &&
            p.strikes.some(s => CARD_DEFS[s.key].level !== INF && CARD_DEFS[s.key].level <= d.defense));
          score = threatened ? 3 : 0.4;
          if (me.buildZone.some(b => CARD_DEFS[b.key].defense)) score -= 1.5;
        } else if (d.noResponse) {
          score = 1.4;                                          // 便宜，防强制回应
          if (owned.has(x.key)) score = 0;
        } else if (d.escape) {
          score = me.energy >= 12 ? 0.8 : -1;                    // 钱多才提前备船
        }
        if (score > 0) scored.push({ x, score });
      }
      // 有监听基地就别重复建
      const filtered = scored.filter(s => !(s.x.def.noResponse && owned.has(s.x.key)));
      filtered.sort((a, b) => b.score - a.score);
      return filtered.length ? filtered[0].x : null;
    }

    function pickStrike(view, me, cands, strikes, alive) {
      let best = null;
      for (const card of strikes) {
        const lvl = card.def.level;
        for (const g of ALL_GALAXIES) {
          if (g === me.galaxy || view.markers[g].red) continue;
          let exp = 0;
          for (const o of view.players) {
            if (o.id === me.id || !o.alive) continue;
            const p = probOf(cands[o.id], g);
            if (!p) continue;
            const shield = o.buildZone
              .map(b => CARD_DEFS[b.key].defense || 0)
              .reduce((m, v) => Math.max(m, v), 0);
            const blocked = lvl !== INF && shield >= lvl;
            const hasShip = o.buildZone.some(b => CARD_DEFS[b.key].escape);
            // 命中：清场奖励 3×存活人数；被挡：只熄恒星，值一点；有船：他跑了但清空基建
            // 被挡下时的价值：湮灭会清空对方所有建设牌（开罐器），远高于普通被挡
            // 清场奖励 = 淘汰后剩余人数 × 3（自己也会少一个，所以要减 1）
            const gain = blocked
              ? (card.def.destroyBuilds ? 2.6 : 0.6)
              : (hasShip ? 2.0 : 3 * Math.max(0, alive - 1));
            exp += p * gain;
          }
          exp -= card.def.cost * 0.55;                          // 造价与暴露风险折算
          if (!best || exp > best.exp) best = { card, galaxy: g, exp, p: galaxyMass(cands, g) };
        }
      }
      // 期望门槛随盈余能量放宽：钱多不花就是废纸，僵局多半是囤出来的
      if (!best) return null;
      // 能量到 10 以上时，钱几乎只能用来开火——哪怕只有 1/6 的把握也值得赌
      const rich = me.energy >= 10;
      // 残局逼迫：回合数远超人数时，所有人都开始「有枣没枣打一竿子」，
      // 否则互相憋防御会把对局拖成无限局
      const late = view.turnIndex > 12 * view.players.length;
      const minP = late ? 0.05 : (rich ? 0.15 : 0.32);
      const minExp = late ? -99 : (rich ? -1.5 : 1.6);
      if (best.exp <= minExp || best.p < minP) return null;
      return best;
    }

    function pickProbe(view, me, cands, casts, memory) {
      // 记忆越糊，越值得广播；已经全图锁定就不浪费牌了
      let best = null;
      for (const card of casts) {
        for (const g of ALL_GALAXIES) {
          if (view.markers[g].red) continue;
          if (galaxyDistance(me.galaxy, g) > card.def.dist) continue;
          const mass = galaxyMass(cands, g);
          if (mass <= 0) continue;
          // mass 是「这个星系里可能有人」的边际概率；人少时它天然很小，
          // 所以必须放大，否则 2 人局会永远不敢广播 → 永远无法定位 → 僵局
          const multi = Object.values(cands).filter(s => s.has(g)).length;
          const score = mass * 3 + Math.min(multi, 3) * 0.4 - card.def.cost * 0.3;
          if (!best || score > best.score) best = { card, galaxy: g, score };
        }
      }
      if (!best || best.score <= 0.35) return null;
      return best;
    }

    function pickWorst(hand, energy, me) {
      let worst = null, worstScore = Infinity;
      const counts = {};
      hand.forEach(c => { counts[c.key] = (counts[c.key] || 0) + 1; });
      for (const x of hand) {
        const d = x.def;
        let s = 0;
        // 「贵」只在打不出的时候才是缺点；有钱时贵牌反而是主力
        if (d.cost > energy) s += 6 + (d.cost - energy);
        if (counts[x.key] > 1) s += 3;                 // 重复的牌先扔
        if (d.type === 'broadcast') s -= 1.5;          // 广播便宜好用，倾向留
        if (d.defense) s += 1;
        if (d.escape) s -= 3;                          // 保命牌：宁可占手也别扔
        // 破防的唯一手段：降维 / 湮灭 / 科技锁死，绝不当垃圾扔掉
        if (d.destroyGalaxy) s -= 8;
        else if (d.destroyBuilds) s -= 5;
        else if (d.level === INF) s -= 3;
        if (s < worstScore) { worstScore = s; worst = x; }
      }
      return worst;
    }

    return { playerId, level: lv, seed, decide, recall: v => recall(v, lv, seed) };
  }

  /* ---------- 动作执行（与服务器的 handleAction 语义一致） ---------- */
  function applyAction(game, playerId, a) {
    if (!a) return { ok: false, msg: 'no action' };
    switch (a.type) {
      case 'build':     return game.playBuild(playerId, a.uid);
      case 'broadcast': return game.playBroadcast(playerId, a.uid, a.galaxy);
      case 'strike':    return game.playStrike(playerId, a.uid, a.galaxy);
      case 'discard':   return game.discardCards(playerId, a.uids || []);
      case 'end':       return game.endTurn(playerId);
      case 'withdraw':  return game.withdrawStrike(playerId, a.uid);
      case 'respond':   return game.setResponse(playerId, a.uid || null, a.face || null);
      case 'choose':    return game.chooseResponder(a.targetId, playerId);
      case 'escape':    return game.chooseEscape(playerId, !!a.use);
      default:          return { ok: false, msg: '未知动作' };
    }
  }

  /**
   * 驱动所有 AI 行动，直到轮到真人或对局结束。
   * @param game     规则实例 createGame()
   * @param seats    Map/Array: playerId -> { level, seed }
   * @param viewFor  可见性过滤函数（服务端同一份）
   * @param opts     { maxSteps, onStep(game) }
   * @returns        执行过的动作记录数组
   */
  function runAI(game, seats, viewFor, opts) {
    const o = opts || {};
    const maxSteps = o.maxSteps || 120;
    const getSeat = id => (seats instanceof Map ? seats.get(id) : seats[id]);
    const ais = new Map();
    const played = [];

    for (let step = 0; step < maxSteps; step++) {
      const S = game.state();
      if (!S || S.phase !== 'playing') break;
      // 兜底：超过 240 回合仍未分胜负 → 热寂收局（正常局约 35 回合）
      if (S.turnIndex > 240) { game.forceEnd('回合上限'); break; }

      /* 光速飞船待决：被打的如果是我，能跑就跑 */
      if (S.escapePending) {
        const E = S.escapePending;
        const seat = getSeat(E.targetId);
        if (!seat) break;                        // 真人在决定，等他
        const act = { type: 'escape', use: true };
        game.chooseEscape(E.targetId, true);
        played.push({ actor: E.targetId, act });
        if (o.onStep) o.onStep(game);
        continue;
      }

      /* 广播收集阶段：让 AI 候选者提交 */
      if (S.broadcast && S.broadcast.stage === 'collecting') {
        const B = S.broadcast;
        // 没有任何人能回应时，引擎会等 5–20 秒再自动结算；模拟里直接跳过这段等待
        if (!B.candidates.length) {
          game.tickBroadcast(Date.now() + 1e9);
          if (o.onStep) o.onStep(game);
          continue;
        }
        const pend = B.candidates.filter(c =>
          !Object.prototype.hasOwnProperty.call(B.responses, c.playerId) && getSeat(c.playerId));
        if (!pend.length) break;                 // 等真人回应
        const c = pend[0];
        const seat = getSeat(c.playerId);
        const ai = ais.get(c.playerId) || ais.set(c.playerId, createAI(c.playerId, seat.level, seat.seed || 1)).get(c.playerId);
        const view = viewFor(game, c.playerId);
        const act = ai.decide(view) || { type: 'respond', uid: null };
        const r = applyAction(game, c.playerId, act);
        if (!r.ok && act.uid) applyAction(game, c.playerId, { type: 'respond', uid: null });
        played.push({ actor: c.playerId, act });
        if (game.responsesComplete()) game.finalizeBroadcast();
        if (o.onStep) o.onStep(game);
        continue;
      }

      /* 挑选结算对象 */
      if (S.broadcast && S.broadcast.stage === 'choosing') {
        const B = S.broadcast;
        const seat = getSeat(B.casterId);
        if (!seat) break;                        // 真人在挑
        const ai = ais.get(B.casterId) || ais.set(B.casterId, createAI(B.casterId, seat.level, seat.seed || 1)).get(B.casterId);
        const act = ai.decide(viewFor(game, B.casterId));
        if (!act) break;
        const r = applyAction(game, B.casterId, act);
        played.push({ actor: B.casterId, act });
        if (!r.ok) {                              // 兜底：随便挑一个
          const any = Object.values(B.responses).find(Boolean);
          if (!any) break;
        }
        if (o.onStep) o.onStep(game);
        continue;
      }

      /* 轮到谁 */
      const cur = S.players[S.currentIdx];
      const seat = cur && getSeat(cur.id);
      if (!seat || !cur.alive) break;
      if (S.step !== 'action') break;

      const ai = ais.get(cur.id) || ais.set(cur.id, createAI(cur.id, seat.level, seat.seed || 1)).get(cur.id);
      const act = ai.decide(viewFor(game, cur.id));
      // 兜底：AI 拿不出动作时**收手**，绝不能空转。
      // 空动作 = runAI 返回空数组 = 本地驱动以为「AI 没事做」就退出循环，
      // 而局面还停在 AI 的回合上 —— 牌桌从此干等到天荒地老（曾表现为"智子 5 分钟不动"）。
      if (!act) {
        const end = applyAction(game, cur.id, { type: 'end' });
        played.push({ actor: cur.id, act: { type: 'end' }, ok: end.ok });
        break;
      }

      const r = applyAction(game, cur.id, act);
      played.push({ actor: cur.id, act, ok: r.ok, msg: r.msg });

      if (!r.ok) {
        // 决策失效（牌被偷/能量不够等）→ 直接收手，绝不卡住
        const end = applyAction(game, cur.id, { type: 'end' });
        played.push({ actor: cur.id, act: { type: 'end' }, ok: end.ok });
        break;
      }
      if (o.onStep) o.onStep(game);
      if (act.type === 'end') continue;          // 换下一个（可能还是 AI）
    }
    /* 收尾兜底（关键）：
       走到这里说明这一轮 AI 一个动作都没做，但局面**可能仍然停在 AI 的回合上**。
       最典型的就是：AI 发了广播、但那张牌够不着任何人（候选为空）——
       引擎会在同一个循环里把这轮广播自动结算掉，然后 continue 结束本轮，
       于是本轮"没做任何事"就返回了空数组。
       上层（本地驱动）看到空数组会以为"AI 没事做"而退出循环，
       可局面还停在 AI 的回合上 —— 没有任何东西会再唤醒它，牌桌就此冻结。
       （曾表现为：本地局里「智子」5 分钟以上一动不动。）
       所以这里再兜一次底：只要局面还等着 AI 行动，就替它收手，把回合交出去。 */
    const SS = game.state();
    if (!played.length && SS && SS.phase === 'playing' && !SS.broadcast && !SS.escapePending) {
      const cur2 = SS.players[SS.currentIdx];
      const seat2 = cur2 && getSeat(cur2.id);
      if (seat2 && cur2.alive && SS.step === 'action') {
        const end = applyAction(game, cur2.id, { type: 'end' });
        played.push({ actor: cur2.id, act: { type: 'end' }, ok: end.ok });
      }
    }
    return played;
  }

  return { LEVELS, LEVEL_KEYS, createAI, runAI, applyAction, recall, belief };
});
