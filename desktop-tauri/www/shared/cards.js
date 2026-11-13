/* ============================================================
 * shared/cards.js — 卡牌数据与星图（前后端同构）
 * 数据来源：实物卡牌扫描图（64 张调整后牌库）
 * ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  const INF = 99; // 表示距离/等级 ∞

  const CARD_DEFS = {
    /* ---------- 广播牌（28 张） ---------- */
    star_coop:   { name: '恒星广播·合作', short: '恒星·合作', type: 'broadcast', face: 'coop', cost: 0, dist: 1,  count: 9, desc: '以恒星为天线，向世界发布恒星级功率的电磁波' },
    star_disg:   { name: '恒星广播·伪装', short: '恒星·伪装', type: 'broadcast', face: 'disg', cost: 0, dist: 1,  count: 5, desc: '以恒星为天线，向世界发布恒星级功率的电磁波' },
    cosmic_coop: { name: '宇宙广播·合作', short: '宇宙·合作', type: 'broadcast', face: 'coop', cost: 1, dist: 2,  count: 6, desc: '以简并态物质作为引力波震源，向宇宙发射引力波' },
    cosmic_disg: { name: '宇宙广播·伪装', short: '宇宙·伪装', type: 'broadcast', face: 'disg', cost: 1, dist: 2,  count: 4, desc: '以简并态物质作为引力波震源，向宇宙发射引力波' },
    ftl_coop:    { name: '超距广播·合作', short: '超距·合作', type: 'broadcast', face: 'coop', cost: 2, dist: INF, count: 2, desc: '利用宇宙的膜结构，在高维空间的投影产生信号' },
    ftl_disg:    { name: '超距广播·伪装', short: '超距·伪装', type: 'broadcast', face: 'disg', cost: 2, dist: INF, count: 2, desc: '利用宇宙的膜结构，在高维空间的投影产生信号' },

    /* 占位：广播在结算翻面前，对外只露出"是哪种广播"，不露出合作/伪装。
     * count 为 0，不进牌库，只用于前端渲染与文案。 */
    star_hidden:   { name: '恒星广播', short: '恒星广播', type: 'broadcast', cost: 0, dist: 1,  count: 0, hidden: true, desc: '合作 / 伪装在结算时才翻开' },
    cosmic_hidden: { name: '宇宙广播', short: '宇宙广播', type: 'broadcast', cost: 1, dist: 2,  count: 0, hidden: true, desc: '合作 / 伪装在结算时才翻开' },
    ftl_hidden:    { name: '超距广播', short: '超距广播', type: 'broadcast', cost: 2, dist: INF, count: 0, hidden: true, desc: '合作 / 伪装在结算时才翻开' },

    /* ---------- 打击牌（14 张） ---------- */
    lock:       { name: '科技锁死', short: '科技锁死', type: 'strike', cost: 4,  level: INF, count: 2, immediate: true, disableBuilds: true, desc: '立即生效：拆掉目标星系玩家的全部已建卡牌（建设牌），不伤害玩家、不清能量、不动手牌' },
    nuke:       { name: '热核打击', short: '热核',     type: 'strike', cost: 4,  level: 1,   count: 4, desc: '打击无特殊效果' },
    photoid:    { name: '光粒打击', short: '光粒',     type: 'strike', cost: 6,  level: 2,   count: 4, destroyStar: true, desc: '无论是否被防御，均毁灭目标恒星' },
    annihilate: { name: '湮灭打击', short: '湮灭',     type: 'strike', cost: 8,  level: 3,   count: 2, destroyStar: true, destroyBuilds: true, desc: '无论是否被防御，均毁灭目标恒星及所有建造牌' },
    dimension:  { name: '降维打击', short: '降维',     type: 'strike', cost: 10, level: INF, count: 2, destroyStar: true, destroyBuilds: true, destroyGalaxy: true, desc: '无论是否被防御，均毁灭目标星系及其中所有玩家' },

    /* ---------- 建设牌（22 张） ---------- */
    solar:      { name: '太阳能阵列', short: '太阳能阵列', type: 'build', cost: 2,  count: 4, income: 1, starDependent: true,  desc: '每回合开始时，能量 +1；依赖恒星' },
    fusion:     { name: '聚变反应堆', short: '聚变堆',     type: 'build', cost: 3,  count: 4, income: 1, starDependent: false, desc: '每回合开始时，能量 +1；不依赖恒星' },
    dyson:      { name: '戴森球',     short: '戴森球',     type: 'build', cost: 6,  count: 2, income: 3, starDependent: true,  onePerPlayer: true, desc: '每回合开始时，能量 +3；依赖恒星；每个玩家只能建造 1 个' },
    antimatter: { name: '反物质引擎', short: '反物质',     type: 'build', cost: 6,  count: 2, income: 2, starDependent: false, desc: '每回合开始时，能量 +2；不依赖恒星' },
    bunker:     { name: '掩体星环',   short: '掩体星环',   type: 'build', cost: 6,  count: 4, defense: 2, desc: '可在打击 2 及以下的打击中幸存' },
    ghost:      { name: '量子幽灵',   short: '量子幽灵',   type: 'build', cost: 8,  count: 2, defense: 3, desc: '可在打击 3 及以下的打击中幸存' },
    lightship:  { name: '光速飞船',   short: '光速飞船',   type: 'build', cost: 10, count: 2, escape: true, desc: '仅在遭到打击后可发动：跃迁至随机空星系，不携带能量与建造牌，只能用 1 次' },
    listener:   { name: '监听基地',   short: '监听基地',   type: 'build', cost: 2,  count: 2, noResponse: true, desc: '所在星系接收广播后，可不回应' },
  };

  /* 星系图：按实物版图（赫尔辛根莫斯肯）的分布重绘
   *        2 —— 6 —— 8
   *        |    |    |
   *        1    5    9
   *        |   / \  /
   *        4 -    7
   *        |      |
   *        3 —————
   * 实际连线：12 条，5 号是枢纽
   */
  /* 原著地名：罗辑诅咒的 187J3X1、云天明赠予的 DX3906、三体世界所在的半人马座α … */
  const GALAXY_NAMES = {
    1: '187J3X1', 2: 'DX3906',   3: '波江座ε', 4: '巴纳德星',
    5: '太阳系',   6: '半人马座α', 7: '参宿四',   8: '天狼星',   9: '天鹅座α',
  };

  const ADJACENCY = {
    1: [2, 4],
    2: [1, 6],
    3: [4, 7],
    4: [1, 3, 5],
    5: [4, 6, 7, 9],
    6: [2, 5, 8],
    7: [3, 5, 9],
    8: [6, 9],
    9: [5, 7, 8],
  };

  /* 像素坐标（viewBox 600×440），按实物版图相对位置摆放 */
  const GALAXY_POS = {
    2: { x: 150, y: 62 },
    6: { x: 272, y: 108 },
    8: { x: 432, y: 92 },
    1: { x: 72,  y: 176 },
    4: { x: 136, y: 244 },
    5: { x: 278, y: 238 },
    9: { x: 474, y: 268 },
    3: { x: 62,  y: 358 },
    7: { x: 268, y: 392 },
  };

  /* ---------- 最简说明（弃牌堆 / 提示面板共用） ----------
   * 强制保证四项基本信息：能量、距离、打击效果、产能与恒星依赖。
   * main = 一眼看懂的效果；sub = 关键限定条件。
   */
  function cardFacts(key) {
    const d = CARD_DEFS[key];
    const lu = v => (v === INF ? '∞' : String(v));
    const f = { cost: d.cost, type: d.type, main: '', sub: '' };

    if (d.type === 'broadcast') {
      f.main = '距离 ' + lu(d.dist);
      f.sub = d.hidden ? '面未公开' : (d.face === 'coop' ? '合作面' : '伪装面');
    } else if (d.type === 'strike') {
      if (key === 'lock')       { f.main = '弃其建造牌';      f.sub = '等级 ' + lu(d.level) + ' · 不摧毁'; }
      else if (d.destroyGalaxy) { f.main = '毁灭星系';        f.sub = '等级 ' + lu(d.level) + ' · 不可防'; }
      else if (d.destroyBuilds) { f.main = '摧毁恒星+建设';   f.sub = '等级 ' + lu(d.level); }
      else if (d.destroyStar)   { f.main = '摧毁恒星';        f.sub = '等级 ' + lu(d.level); }
      else                      { f.main = '无特殊效果';      f.sub = '等级 ' + lu(d.level); }
    } else {
      if (d.income) {
        f.main = '产能 +' + d.income;
        f.sub = d.starDependent ? '依赖恒星' : '不依赖恒星';
      } else if (d.defense) {
        f.main = '防御 ≤' + d.defense;
        f.sub = '只保人，不保星系';
      } else if (d.escape) {
        f.main = '被打击后跃迁';
        f.sub = '弃全部能量与建造';
      } else if (d.noResponse) {
        f.main = '可不回应';
        f.sub = '免强制回应';
      }
    }
    return f;
  }

  const _distCache = {};
  function galaxyDistance(a, b) {
    if (a === b) return 0;
    const key = a < b ? a + '-' + b : b + '-' + a;
    if (_distCache[key] !== undefined) return _distCache[key];
    const seen = new Set([a]);
    let frontier = [a], d = 0;
    while (frontier.length) {
      d++;
      const next = [];
      for (const g of frontier) {
        for (const n of ADJACENCY[g]) {
          if (n === b) { _distCache[key] = d; return d; }
          if (!seen.has(n)) { seen.add(n); next.push(n); }
        }
      }
      frontier = next;
    }
    _distCache[key] = INF;
    return INF;
  }

  function buildDeck() {
    const deck = [];
    for (const [key, def] of Object.entries(CARD_DEFS)) {
      for (let i = 0; i < def.count; i++) deck.push(key);
    }
    return deck;
  }

  const TOTAL_CARDS = Object.values(CARD_DEFS).reduce((s, c) => s + c.count, 0);

  /* ---------- 广播脱敏 ----------
   * 广播牌正面写着合作/伪装，但那一面要在结算时才翻开。
   * 在此之前对外只给"家族"（恒星 / 宇宙 / 超距），不给 face。
   */
  const HIDDEN_OF = {
    star_coop: 'star_hidden',   star_disg: 'star_hidden',
    cosmic_coop: 'cosmic_hidden', cosmic_disg: 'cosmic_hidden',
    ftl_coop: 'ftl_hidden',     ftl_disg: 'ftl_hidden',
  };
  /** 把任意广播牌换成"未翻面"的对外标识 */
  function hideFace(key) { return HIDDEN_OF[key] || key; }
  /** 对外可见的广播名（不含合作/伪装） */
  function familyName(key) { return CARD_DEFS[hideFace(key)].name; }

  /** 拆除建设牌能返还多少能量：建造费的一半，向下取整（6→3、3→1、2→1、8→4） */
  function demolishRefund(key) {
    const def = CARD_DEFS[key];
    return def && typeof def.cost === 'number' ? Math.floor(def.cost / 2) : 0;
  }

  return { INF, CARD_DEFS, GALAXY_NAMES, ADJACENCY, GALAXY_POS, galaxyDistance, cardFacts, buildDeck, TOTAL_CARDS,
           hideFace, familyName, demolishRefund };
});
