var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// ../shared/cards.js
var require_cards = __commonJS({
  "../shared/cards.js"(exports, module) {
    (function(root, factory) {
      const api = factory();
      if (typeof module === "object" && module.exports) module.exports = api;
      else Object.assign(root, api);
    })(typeof globalThis !== "undefined" ? globalThis : exports, function() {
      const INF = 99;
      const CARD_DEFS = {
        /* ---------- 广播牌（28 张） ---------- */
        star_coop: { name: "\u6052\u661F\u5E7F\u64AD\xB7\u5408\u4F5C", short: "\u6052\u661F\xB7\u5408\u4F5C", type: "broadcast", face: "coop", cost: 0, dist: 1, count: 9, desc: "\u4EE5\u6052\u661F\u4E3A\u5929\u7EBF\uFF0C\u5411\u4E16\u754C\u53D1\u5E03\u6052\u661F\u7EA7\u529F\u7387\u7684\u7535\u78C1\u6CE2" },
        star_disg: { name: "\u6052\u661F\u5E7F\u64AD\xB7\u4F2A\u88C5", short: "\u6052\u661F\xB7\u4F2A\u88C5", type: "broadcast", face: "disg", cost: 0, dist: 1, count: 5, desc: "\u4EE5\u6052\u661F\u4E3A\u5929\u7EBF\uFF0C\u5411\u4E16\u754C\u53D1\u5E03\u6052\u661F\u7EA7\u529F\u7387\u7684\u7535\u78C1\u6CE2" },
        cosmic_coop: { name: "\u5B87\u5B99\u5E7F\u64AD\xB7\u5408\u4F5C", short: "\u5B87\u5B99\xB7\u5408\u4F5C", type: "broadcast", face: "coop", cost: 1, dist: 2, count: 6, desc: "\u4EE5\u7B80\u5E76\u6001\u7269\u8D28\u4F5C\u4E3A\u5F15\u529B\u6CE2\u9707\u6E90\uFF0C\u5411\u5B87\u5B99\u53D1\u5C04\u5F15\u529B\u6CE2" },
        cosmic_disg: { name: "\u5B87\u5B99\u5E7F\u64AD\xB7\u4F2A\u88C5", short: "\u5B87\u5B99\xB7\u4F2A\u88C5", type: "broadcast", face: "disg", cost: 1, dist: 2, count: 4, desc: "\u4EE5\u7B80\u5E76\u6001\u7269\u8D28\u4F5C\u4E3A\u5F15\u529B\u6CE2\u9707\u6E90\uFF0C\u5411\u5B87\u5B99\u53D1\u5C04\u5F15\u529B\u6CE2" },
        ftl_coop: { name: "\u8D85\u8DDD\u5E7F\u64AD\xB7\u5408\u4F5C", short: "\u8D85\u8DDD\xB7\u5408\u4F5C", type: "broadcast", face: "coop", cost: 2, dist: INF, count: 2, desc: "\u5229\u7528\u5B87\u5B99\u7684\u819C\u7ED3\u6784\uFF0C\u5728\u9AD8\u7EF4\u7A7A\u95F4\u7684\u6295\u5F71\u4EA7\u751F\u4FE1\u53F7" },
        ftl_disg: { name: "\u8D85\u8DDD\u5E7F\u64AD\xB7\u4F2A\u88C5", short: "\u8D85\u8DDD\xB7\u4F2A\u88C5", type: "broadcast", face: "disg", cost: 2, dist: INF, count: 2, desc: "\u5229\u7528\u5B87\u5B99\u7684\u819C\u7ED3\u6784\uFF0C\u5728\u9AD8\u7EF4\u7A7A\u95F4\u7684\u6295\u5F71\u4EA7\u751F\u4FE1\u53F7" },
        /* 占位：广播在结算翻面前，对外只露出"是哪种广播"，不露出合作/伪装。
         * count 为 0，不进牌库，只用于前端渲染与文案。 */
        star_hidden: { name: "\u6052\u661F\u5E7F\u64AD", short: "\u6052\u661F\u5E7F\u64AD", type: "broadcast", cost: 0, dist: 1, count: 0, hidden: true, desc: "\u5408\u4F5C / \u4F2A\u88C5\u5728\u7ED3\u7B97\u65F6\u624D\u7FFB\u5F00" },
        cosmic_hidden: { name: "\u5B87\u5B99\u5E7F\u64AD", short: "\u5B87\u5B99\u5E7F\u64AD", type: "broadcast", cost: 1, dist: 2, count: 0, hidden: true, desc: "\u5408\u4F5C / \u4F2A\u88C5\u5728\u7ED3\u7B97\u65F6\u624D\u7FFB\u5F00" },
        ftl_hidden: { name: "\u8D85\u8DDD\u5E7F\u64AD", short: "\u8D85\u8DDD\u5E7F\u64AD", type: "broadcast", cost: 2, dist: INF, count: 0, hidden: true, desc: "\u5408\u4F5C / \u4F2A\u88C5\u5728\u7ED3\u7B97\u65F6\u624D\u7FFB\u5F00" },
        /* ---------- 打击牌（14 张） ---------- */
        lock: { name: "\u79D1\u6280\u9501\u6B7B", short: "\u79D1\u6280\u9501\u6B7B", type: "strike", cost: 4, level: INF, count: 2, immediate: true, disableBuilds: true, desc: "\u7ACB\u5373\u751F\u6548\uFF1A\u62C6\u6389\u76EE\u6807\u661F\u7CFB\u73A9\u5BB6\u7684\u5168\u90E8\u5DF2\u5EFA\u5361\u724C\uFF08\u5EFA\u8BBE\u724C\uFF09\uFF0C\u4E0D\u4F24\u5BB3\u73A9\u5BB6\u3001\u4E0D\u6E05\u80FD\u91CF\u3001\u4E0D\u52A8\u624B\u724C" },
        nuke: { name: "\u70ED\u6838\u6253\u51FB", short: "\u70ED\u6838", type: "strike", cost: 4, level: 1, count: 4, desc: "\u6253\u51FB\u65E0\u7279\u6B8A\u6548\u679C" },
        photoid: { name: "\u5149\u7C92\u6253\u51FB", short: "\u5149\u7C92", type: "strike", cost: 6, level: 2, count: 4, destroyStar: true, desc: "\u65E0\u8BBA\u662F\u5426\u88AB\u9632\u5FA1\uFF0C\u5747\u6BC1\u706D\u76EE\u6807\u6052\u661F" },
        annihilate: { name: "\u6E6E\u706D\u6253\u51FB", short: "\u6E6E\u706D", type: "strike", cost: 8, level: 3, count: 2, destroyStar: true, destroyBuilds: true, desc: "\u65E0\u8BBA\u662F\u5426\u88AB\u9632\u5FA1\uFF0C\u5747\u6BC1\u706D\u76EE\u6807\u6052\u661F\u53CA\u6240\u6709\u5EFA\u9020\u724C" },
        dimension: { name: "\u964D\u7EF4\u6253\u51FB", short: "\u964D\u7EF4", type: "strike", cost: 10, level: INF, count: 2, destroyStar: true, destroyBuilds: true, destroyGalaxy: true, desc: "\u65E0\u8BBA\u662F\u5426\u88AB\u9632\u5FA1\uFF0C\u5747\u6BC1\u706D\u76EE\u6807\u661F\u7CFB\u53CA\u5176\u4E2D\u6240\u6709\u73A9\u5BB6" },
        /* ---------- 建设牌（22 张） ---------- */
        solar: { name: "\u592A\u9633\u80FD\u9635\u5217", short: "\u592A\u9633\u80FD\u9635\u5217", type: "build", cost: 2, count: 4, income: 1, starDependent: true, desc: "\u6BCF\u56DE\u5408\u5F00\u59CB\u65F6\uFF0C\u80FD\u91CF +1\uFF1B\u4F9D\u8D56\u6052\u661F" },
        fusion: { name: "\u805A\u53D8\u53CD\u5E94\u5806", short: "\u805A\u53D8\u5806", type: "build", cost: 3, count: 4, income: 1, starDependent: false, desc: "\u6BCF\u56DE\u5408\u5F00\u59CB\u65F6\uFF0C\u80FD\u91CF +1\uFF1B\u4E0D\u4F9D\u8D56\u6052\u661F" },
        dyson: { name: "\u6234\u68EE\u7403", short: "\u6234\u68EE\u7403", type: "build", cost: 6, count: 2, income: 3, starDependent: true, onePerPlayer: true, desc: "\u6BCF\u56DE\u5408\u5F00\u59CB\u65F6\uFF0C\u80FD\u91CF +3\uFF1B\u4F9D\u8D56\u6052\u661F\uFF1B\u6BCF\u4E2A\u73A9\u5BB6\u53EA\u80FD\u5EFA\u9020 1 \u4E2A" },
        antimatter: { name: "\u53CD\u7269\u8D28\u5F15\u64CE", short: "\u53CD\u7269\u8D28", type: "build", cost: 6, count: 2, income: 2, starDependent: false, desc: "\u6BCF\u56DE\u5408\u5F00\u59CB\u65F6\uFF0C\u80FD\u91CF +2\uFF1B\u4E0D\u4F9D\u8D56\u6052\u661F" },
        bunker: { name: "\u63A9\u4F53\u661F\u73AF", short: "\u63A9\u4F53\u661F\u73AF", type: "build", cost: 6, count: 4, defense: 2, desc: "\u53EF\u5728\u6253\u51FB 2 \u53CA\u4EE5\u4E0B\u7684\u6253\u51FB\u4E2D\u5E78\u5B58" },
        ghost: { name: "\u91CF\u5B50\u5E7D\u7075", short: "\u91CF\u5B50\u5E7D\u7075", type: "build", cost: 8, count: 2, defense: 3, desc: "\u53EF\u5728\u6253\u51FB 3 \u53CA\u4EE5\u4E0B\u7684\u6253\u51FB\u4E2D\u5E78\u5B58" },
        lightship: { name: "\u5149\u901F\u98DE\u8239", short: "\u5149\u901F\u98DE\u8239", type: "build", cost: 10, count: 2, escape: true, desc: "\u4EC5\u5728\u906D\u5230\u6253\u51FB\u540E\u53EF\u53D1\u52A8\uFF1A\u8DC3\u8FC1\u81F3\u968F\u673A\u7A7A\u661F\u7CFB\uFF0C\u4E0D\u643A\u5E26\u80FD\u91CF\u4E0E\u5EFA\u9020\u724C\uFF0C\u53EA\u80FD\u7528 1 \u6B21" },
        listener: { name: "\u76D1\u542C\u57FA\u5730", short: "\u76D1\u542C\u57FA\u5730", type: "build", cost: 2, count: 2, noResponse: true, desc: "\u6240\u5728\u661F\u7CFB\u63A5\u6536\u5E7F\u64AD\u540E\uFF0C\u53EF\u4E0D\u56DE\u5E94" }
      };
      const GALAXY_NAMES = {
        1: "187J3X1",
        2: "DX3906",
        3: "\u6CE2\u6C5F\u5EA7\u03B5",
        4: "\u5DF4\u7EB3\u5FB7\u661F",
        5: "\u592A\u9633\u7CFB",
        6: "\u534A\u4EBA\u9A6C\u5EA7\u03B1",
        7: "\u53C2\u5BBF\u56DB",
        8: "\u5929\u72FC\u661F",
        9: "\u5929\u9E45\u5EA7\u03B1"
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
        9: [5, 7, 8]
      };
      const GALAXY_POS = {
        2: { x: 150, y: 62 },
        6: { x: 272, y: 108 },
        8: { x: 432, y: 92 },
        1: { x: 72, y: 176 },
        4: { x: 136, y: 244 },
        5: { x: 278, y: 238 },
        9: { x: 474, y: 268 },
        3: { x: 62, y: 358 },
        7: { x: 268, y: 392 }
      };
      function cardFacts(key) {
        const d = CARD_DEFS[key];
        const lu = (v) => v === INF ? "\u221E" : String(v);
        const f = { cost: d.cost, type: d.type, main: "", sub: "" };
        if (d.type === "broadcast") {
          f.main = "\u8DDD\u79BB " + lu(d.dist);
          f.sub = d.hidden ? "\u9762\u672A\u516C\u5F00" : d.face === "coop" ? "\u5408\u4F5C\u9762" : "\u4F2A\u88C5\u9762";
        } else if (d.type === "strike") {
          if (key === "lock") {
            f.main = "\u5F03\u5176\u5EFA\u9020\u724C";
            f.sub = "\u7B49\u7EA7 " + lu(d.level) + " \xB7 \u4E0D\u6467\u6BC1";
          } else if (d.destroyGalaxy) {
            f.main = "\u6BC1\u706D\u661F\u7CFB";
            f.sub = "\u7B49\u7EA7 " + lu(d.level) + " \xB7 \u4E0D\u53EF\u9632";
          } else if (d.destroyBuilds) {
            f.main = "\u6467\u6BC1\u6052\u661F+\u5EFA\u8BBE";
            f.sub = "\u7B49\u7EA7 " + lu(d.level);
          } else if (d.destroyStar) {
            f.main = "\u6467\u6BC1\u6052\u661F";
            f.sub = "\u7B49\u7EA7 " + lu(d.level);
          } else {
            f.main = "\u65E0\u7279\u6B8A\u6548\u679C";
            f.sub = "\u7B49\u7EA7 " + lu(d.level);
          }
        } else {
          if (d.income) {
            f.main = "\u4EA7\u80FD +" + d.income;
            f.sub = d.starDependent ? "\u4F9D\u8D56\u6052\u661F" : "\u4E0D\u4F9D\u8D56\u6052\u661F";
          } else if (d.defense) {
            f.main = "\u9632\u5FA1 \u2264" + d.defense;
            f.sub = "\u53EA\u4FDD\u4EBA\uFF0C\u4E0D\u4FDD\u661F\u7CFB";
          } else if (d.escape) {
            f.main = "\u6328\u6253\u540E\u8DC3\u8FC1";
            f.sub = "\u5F03\u5168\u90E8\u80FD\u91CF\u4E0E\u5EFA\u9020";
          } else if (d.noResponse) {
            f.main = "\u53EF\u4E0D\u56DE\u5E94";
            f.sub = "\u514D\u5F3A\u5236\u56DE\u5E94";
          }
        }
        return f;
      }
      const _distCache = {};
      function galaxyDistance(a, b) {
        if (a === b) return 0;
        const key = a < b ? a + "-" + b : b + "-" + a;
        if (_distCache[key] !== void 0) return _distCache[key];
        const seen = /* @__PURE__ */ new Set([a]);
        let frontier = [a], d = 0;
        while (frontier.length) {
          d++;
          const next = [];
          for (const g of frontier) {
            for (const n of ADJACENCY[g]) {
              if (n === b) {
                _distCache[key] = d;
                return d;
              }
              if (!seen.has(n)) {
                seen.add(n);
                next.push(n);
              }
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
      const HIDDEN_OF = {
        star_coop: "star_hidden",
        star_disg: "star_hidden",
        cosmic_coop: "cosmic_hidden",
        cosmic_disg: "cosmic_hidden",
        ftl_coop: "ftl_hidden",
        ftl_disg: "ftl_hidden"
      };
      function hideFace(key) {
        return HIDDEN_OF[key] || key;
      }
      function familyName(key) {
        return CARD_DEFS[hideFace(key)].name;
      }
      return {
        INF,
        CARD_DEFS,
        GALAXY_NAMES,
        ADJACENCY,
        GALAXY_POS,
        galaxyDistance,
        cardFacts,
        buildDeck,
        TOTAL_CARDS,
        hideFace,
        familyName
      };
    });
  }
});

// ../shared/rules.js
var require_rules = __commonJS({
  "../shared/rules.js"(exports, module) {
    (function(root, factory) {
      let cards;
      if (typeof module === "object" && module.exports) cards = require_cards();
      else cards = root;
      const api = factory(cards);
      if (typeof module === "object" && module.exports) module.exports = api;
      else Object.assign(root, api);
    })(typeof globalThis !== "undefined" ? globalThis : exports, function(C) {
      const { INF, CARD_DEFS, GALAXY_NAMES, ADJACENCY, galaxyDistance, buildDeck } = C;
      const hideFace = C.hideFace || ((k) => k);
      const familyName = C.familyName || ((k) => CARD_DEFS[k] ? CARD_DEFS[k].name : k);
      const BONUS_INCOME_CHANCE = 0.5;
      const MAX_TURNS = 240;
      const clone = (o) => JSON.parse(JSON.stringify(o));
      const shuffle = (arr) => {
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
      };
      function createGame2(names, opts) {
        let S = null;
        let uidSeq = 0;
        const uid = () => "c" + ++uidSeq;
        const MODE = opts && opts.mode === "fast" ? "fast" : "standard";
        const STRIKE_TARGET = opts && opts.strikeTarget === "hidden" ? "hidden" : "open";
        const blindStrikes = () => S.strikeTarget === "hidden";
        const alivePlayers = () => S.players.filter((p) => p.alive);
        const byId = (id) => S.players.find((p) => p.id === id);
        const log = (text, kind = "info") => {
          S.log.unshift({ text, kind, turn: S.turnIndex, at: Date.now() });
          if (S.log.length > 300) S.log.pop();
        };
        const ev = (type, data) => {
          S.eventSeq = (S.eventSeq || 0) + 1;
          S.events.push(Object.assign({ id: S.eventSeq, turn: S.turnIndex, type }, data));
          if (S.events.length > 240) S.events.splice(0, S.events.length - 240);
        };
        const noteEnergy = (p, before, reason) => {
          if (!p) return;
          const delta = p.energy - before;
          if (!delta) return;
          ev("energy", { actor: p.id, delta, reason, total: p.energy });
        };
        function newGame(playerNames) {
          uidSeq = 0;
          const deck = shuffle(buildDeck()).map((k) => ({ uid: uid(), key: k }));
          const galaxies = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, playerNames.length);
          S = {
            phase: "playing",
            mode: MODE,
            strikeTarget: STRIKE_TARGET,
            players: playerNames.map((name, i) => ({
              id: "p" + i,
              seat: i,
              name: name || "\u73A9\u5BB6 " + (i + 1),
              galaxy: galaxies[i],
              energy: 3,
              hand: [],
              buildZone: [],
              strikes: [],
              alive: true,
              lightshipUsed: false,
              eliminatedTurn: null
            })),
            turnIndex: 1,
            currentIdx: 0,
            step: "production",
            deck,
            discard: { current: [], last: [] },
            markers: Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((g) => [g, { black: false, purple: false, red: false }])),
            broadcast: null,
            escapePending: null,
            // 挨打时的光速飞船待决（只有被打者能回答）
            log: [],
            arrow: null,
            winner: null,
            endReason: null,
            // last_stand / heat_death，决定结算界面怎么说
            actionCount: 0,
            // 本回合已行动次数（AI 用来判断何时收手）
            discardUsed: false,
            // 本回合是否已弃置过（每回合只能弃一次，但可一次弃多张）
            events: [],
            // 结构化公开事件（与日志同源，供 AI 记忆 / 复盘）
            eventSeq: 0,
            theme: "\u8D6B\u5C14\u8F9B\u6839\u83AB\u65AF\u80AF"
          };
          S.players.forEach((p) => {
            for (let i = 0; i < 4; i++) if (S.deck.length) p.hand.push(S.deck.pop());
          });
          log(`\u5BF9\u5C40\u5F00\u59CB\uFF1A${playerNames.length} \u4F4D\u73A9\u5BB6\uFF0C\u724C\u5E93 ${S.deck.length} \u5F20`, "system");
          S.players.forEach((p) => log(`${p.name} \u5C31\u4F4D\uFF08\u5750\u6807\u4FDD\u5BC6\uFF09`));
          beginTurn();
          return S;
        }
        function refillHand(p, label) {
          if (!p || !p.alive) return 0;
          let drawn = 0;
          while (p.hand.length < 4) {
            if (!S.deck.length) recycleDiscard();
            if (!S.deck.length) break;
            p.hand.push(S.deck.pop());
            drawn++;
          }
          if (drawn) log(`${p.name} ${label || "\u8865\u724C"} ${drawn} \u5F20`, "production");
          return drawn;
        }
        function recycleDiscard() {
          const pool = S.discard.current.slice();
          if (!pool.length) return 0;
          pool.forEach((d) => S.deck.push({ uid: d.uid, key: d.key }));
          S.discard.current = [];
          shuffle(S.deck);
          log(`\u724C\u5E93\u89C1\u5E95\uFF1A${pool.length} \u5F20\u5F03\u724C\u6D17\u56DE\u724C\u5E93`, "discard");
          return pool.length;
        }
        function beginTurn() {
          const p = S.players[S.currentIdx];
          if (!p.alive) {
            nextPlayer();
            return;
          }
          S.step = "production";
          S.broadcast = null;
          S.actionCount = 0;
          S.discardUsed = false;
          tickStrikes(p);
          if (S.phase !== "playing") return;
          if (!p.alive) {
            nextPlayer();
            return;
          }
          if (S.escapePending) {
            S.step = "escape";
            return;
          }
          startActionPhase(p);
        }
        function startActionPhase(p) {
          if (S.mode !== "standard") refillHand(p, "\u56DE\u5408\u5F00\u59CB\u8865\u724C");
          let gain = 1;
          const starDead = S.markers[p.galaxy].black;
          const detail = [];
          p.buildZone.forEach((c) => {
            const def = CARD_DEFS[c.key];
            if (!def.income) return;
            if (def.starDependent && starDead) return;
            gain += def.income;
            detail.push(`${def.short}+${def.income}`);
          });
          const bonus = Math.random() < BONUS_INCOME_CHANCE ? 1 : 0;
          gain += bonus;
          const prodBefore = p.energy;
          p.energy += gain;
          noteEnergy(p, prodBefore, "production");
          log(`${p.name} \u8FDB\u5165\u56DE\u5408\uFF1A\u57FA\u7840 1${bonus ? "\u3001\u968F\u673A\u8865\u7ED9 +1" : ""}${detail.length ? "\uFF0C" + detail.join("\u3001") : ""} \u2192 \u80FD\u91CF ${p.energy}`, "production");
          S.step = "action";
        }
        function tickStrikes(p) {
          const due = [];
          p.strikes.forEach((st) => {
            if (st.resolved) return;
            st.progress++;
            if (st.progress >= st.required) due.push(st);
          });
          due.forEach((st) => {
            if (!S.escapePending) resolveStrike(st);
          });
        }
        function advanceIfCurrentDead() {
          if (S.phase !== "playing") return false;
          const cur = S.players[S.currentIdx];
          if (cur && !cur.alive) {
            nextPlayer();
            return true;
          }
          return false;
        }
        function nextPlayer() {
          if (S.phase !== "playing") return;
          let guard = 0;
          do {
            S.currentIdx = (S.currentIdx + 1) % S.players.length;
            guard++;
          } while (!S.players[S.currentIdx].alive && guard < S.players.length * 2);
          if (alivePlayers().length <= 1) return endGame();
          S.turnIndex++;
          beginTurn();
        }
        function markActed() {
          S.actionCount = (S.actionCount || 0) + 1;
          if (S.mode === "standard") S.discardUsed = true;
        }
        function canAct(playerId) {
          const p = byId(playerId);
          if (!p || !p.alive) return { ok: false, msg: "\u73A9\u5BB6\u4E0D\u53EF\u7528" };
          if (S.phase !== "playing") return { ok: false, msg: "\u5BF9\u5C40\u5DF2\u7ED3\u675F" };
          if (S.players[S.currentIdx].id !== playerId) return { ok: false, msg: "\u8FD8\u6CA1\u8F6E\u5230\u4F60" };
          if (S.step !== "action") return { ok: false, msg: "\u73B0\u5728\u4E0D\u662F\u884C\u52A8\u9636\u6BB5" };
          if (S.broadcast) return { ok: false, msg: "\u6709\u5E7F\u64AD\u5F85\u7ED3\u7B97" };
          return { ok: true, p };
        }
        function discardCards(playerId, uids) {
          const c = canAct(playerId);
          if (!c.ok) return c;
          if (S.discardUsed) return { ok: false, msg: "\u672C\u56DE\u5408\u5DF2\u7ECF\u5F03\u7F6E\u8FC7\u4E86\uFF08\u6BCF\u56DE\u5408\u53EA\u80FD\u5F03\u4E00\u6B21\uFF09" };
          const p = c.p;
          const cards = [];
          (uids || []).forEach((u) => {
            const i = p.hand.findIndex((x) => x.uid === u);
            if (i >= 0) cards.push(p.hand.splice(i, 1)[0]);
          });
          if (!cards.length) return { ok: false, msg: "\u6CA1\u6709\u53EF\u5F03\u7684\u724C" };
          const batch = nextBatch();
          cards.forEach((card) => pushDiscard(card, p.id, { batch, tag: "discard" }));
          S.arrow = { playerId: p.id, uids: cards.map((x) => x.uid), at: Date.now() };
          log(`${p.name} \u5F03\u7F6E ${cards.length} \u5F20\u624B\u724C`, "discard");
          S.actionCount = (S.actionCount || 0) + 1;
          S.discardUsed = true;
          if (S.mode === "standard") {
            log(`${p.name} \u5F03\u724C\u540E\u76F4\u63A5\u7ED3\u675F\u56DE\u5408`, "discard");
            endTurn(p.id);
            return { ok: true, endedTurn: true };
          }
          refillHand(p, "\u7ACB\u5373\u8865\u724C");
          return { ok: true };
        }
        function playBuild(playerId, cardUid) {
          const c = canAct(playerId);
          if (!c.ok) return c;
          const p = c.p;
          const i = p.hand.findIndex((x) => x.uid === cardUid);
          if (i < 0) return { ok: false, msg: "\u624B\u724C\u4E2D\u6CA1\u6709\u8FD9\u5F20\u724C" };
          const card = p.hand[i], def = CARD_DEFS[card.key];
          if (def.type !== "build") return { ok: false, msg: "\u8FD9\u4E0D\u662F\u5EFA\u8BBE\u724C" };
          if (def.escape) return { ok: false, msg: "\u5149\u901F\u98DE\u8239\u4E0D\u80FD\u5EFA\u9020\uFF0C\u53EA\u80FD\u5728\u906D\u5230\u6253\u51FB\u65F6\u9009\u62E9\u542F\u52A8" };
          if (p.energy < def.cost) return { ok: false, msg: `\u80FD\u91CF\u4E0D\u8DB3\uFF08\u9700\u8981 ${def.cost}\uFF09` };
          if (def.onePerPlayer && p.buildZone.some((x) => x.key === card.key))
            return { ok: false, msg: "\u6BCF\u4E2A\u73A9\u5BB6\u53EA\u80FD\u5EFA\u9020 1 \u4E2A\u6234\u68EE\u7403" };
          p.hand.splice(i, 1);
          const buildBefore = p.energy;
          p.energy -= def.cost;
          noteEnergy(p, buildBefore, "build");
          p.buildZone.push(card);
          log(`${p.name} \u5EFA\u9020\u300C${def.name}\u300D\uFF08\u2212${def.cost} \u80FD\u91CF\uFF09`, "build");
          ev("build", { actor: p.id, card: card.key });
          markActed();
          return { ok: true };
        }
        function playBroadcast(playerId, cardUid, targetGalaxy) {
          const c = canAct(playerId);
          if (!c.ok) return c;
          const p = c.p;
          const i = p.hand.findIndex((x) => x.uid === cardUid);
          if (i < 0) return { ok: false, msg: "\u624B\u724C\u4E2D\u6CA1\u6709\u8FD9\u5F20\u724C" };
          const card = p.hand[i], def = CARD_DEFS[card.key];
          if (def.type !== "broadcast") return { ok: false, msg: "\u8FD9\u4E0D\u662F\u5E7F\u64AD\u724C" };
          if (p.energy < def.cost) return { ok: false, msg: `\u80FD\u91CF\u4E0D\u8DB3\uFF08\u9700\u8981 ${def.cost}\uFF09` };
          const d = galaxyDistance(p.galaxy, targetGalaxy);
          if (d > def.dist) return { ok: false, msg: `\u8D85\u51FA\u5E7F\u64AD\u8DDD\u79BB\uFF08\u8DDD\u79BB ${d}\uFF0C\u4E0A\u9650 ${def.dist === INF ? "\u221E" : def.dist}\uFF09` };
          const candidates = [];
          S.players.forEach((o) => {
            if (!o.alive || o.id === p.id) return;
            const od = galaxyDistance(o.galaxy, targetGalaxy);
            const usable = o.hand.filter((x) => {
              const bd = CARD_DEFS[x.key];
              return bd.type === "broadcast" && od <= bd.dist && bd.cost <= o.energy;
            });
            if (!usable.length) return;
            const isTarget = o.galaxy === targetGalaxy;
            const hasListener = o.buildZone.some((x) => CARD_DEFS[x.key].noResponse);
            candidates.push({
              playerId: o.id,
              // 强制回应成立的前提是「手里真的有能用的广播牌」——没牌就根本没法回应，
              // 因此这种人连候选者都不算，哪怕广播的就是他所在星系。
              mandatory: isTarget && !hasListener && usable.length > 0,
              canDecline: isTarget && hasListener,
              options: usable.map((x) => ({ uid: x.uid, key: x.key, face: CARD_DEFS[x.key].face }))
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
            stage: "collecting",
            createdAt: now,
            // 有人能回应：最多等 60 秒；没人能回应：随机等 5–20 秒后自动结算
            deadline: now + (candidates.length ? 6e4 : 5e3 + Math.floor(Math.random() * 15001)),
            chooseDeadline: null
          };
          log(`${p.name} \u53D1\u5E03\u300C${familyName(card.key)}\u300D\u2192 ${GALAXY_NAMES[targetGalaxy]}\uFF08\u8DDD\u79BB ${d}\uFF09`, "broadcast");
          ev("broadcast_cast", { actor: p.id, family: hideFace(card.key), target: targetGalaxy, distance: d });
          markActed();
          return { ok: true };
        }
        function setResponse(playerId, uidOrNull, face) {
          const B = S.broadcast;
          if (!B || B.stage !== "collecting") return { ok: false, msg: "\u5F53\u524D\u6CA1\u6709\u5F85\u54CD\u5E94\u7684\u5E7F\u64AD" };
          const cand = B.candidates.find((c) => c.playerId === playerId);
          if (!cand) return { ok: false, msg: "\u4F60\u6CA1\u6709\u54CD\u5E94\u8D44\u683C" };
          if (uidOrNull) {
            const opt = cand.options.find((o) => o.uid === uidOrNull);
            if (!opt) return { ok: false, msg: "\u8FD9\u5F20\u724C\u4E0D\u80FD\u7528\u4E8E\u8BE5\u5E7F\u64AD" };
            if (cand.mandatory === false && !cand.options.length) return { ok: false, msg: "\u65E0\u53EF\u7528\u724C" };
            B.responses[playerId] = { uid: uidOrNull, key: opt.key, face: opt.face };
          } else {
            if (cand.mandatory) return { ok: false, msg: "\u5F3A\u5236\u56DE\u5E94\u8005\u5FC5\u987B\u56DE\u5E94" };
            B.responses[playerId] = null;
          }
          return { ok: true, complete: responsesComplete() };
        }
        function responsesComplete() {
          const B = S.broadcast;
          if (!B) return false;
          return B.candidates.every((c) => Object.prototype.hasOwnProperty.call(B.responses, c.playerId));
        }
        function finalizeBroadcast() {
          const B = S.broadcast;
          if (!B || B.stage !== "collecting") return { ok: false, msg: "\u5F53\u524D\u4E0D\u5728\u6536\u96C6\u9636\u6BB5" };
          if (!responsesComplete()) return { ok: false, msg: "\u8FD8\u6709\u73A9\u5BB6\u672A\u54CD\u5E94" };
          const responders = Object.entries(B.responses).filter(([, v]) => v);
          if (!responders.length) {
            B.stage = "resolving";
            resolveNoResponse();
            return { ok: true, noResponse: true };
          }
          if (responders.length === 1) {
            B.stage = "choosing";
            const res = chooseResponder(responders[0][0]);
            return res.ok ? { ok: true, autoResolved: true } : res;
          }
          B.stage = "choosing";
          B.chooseDeadline = Date.now() + 15e3;
          return { ok: true, needChoose: true };
        }
        function chooseResponder(playerId, byPlayerId) {
          const B = S.broadcast;
          if (!B || B.stage !== "choosing") return { ok: false, msg: "\u5F53\u524D\u4E0D\u5728\u9009\u62E9\u9636\u6BB5" };
          if (byPlayerId && B.casterId !== byPlayerId) return { ok: false, msg: "\u53EA\u6709\u53D1\u5E03\u8005\u53EF\u4EE5\u6311\u9009" };
          const r = B.responses[playerId];
          if (!r) return { ok: false, msg: "\u8BE5\u73A9\u5BB6\u6CA1\u6709\u56DE\u5E94" };
          const caster = byId(B.casterId), responder = byId(playerId);
          const casterFace = CARD_DEFS[B.card.key].face;
          let cGain = 0, rGain = 0;
          if (casterFace === "coop" && r.face === "coop") {
            cGain = 3;
            rGain = 3;
          } else if (casterFace === "coop" && r.face === "disg") {
            cGain = 0;
            rGain = 5;
          } else if (casterFace === "disg" && r.face === "coop") {
            cGain = 5;
            rGain = 0;
          }
          const cBefore = caster.energy, rBefore = responder.energy;
          caster.energy = Math.max(0, caster.energy - B.cost);
          caster.energy += cGain;
          const rDef = CARD_DEFS[r.key];
          responder.energy = Math.max(0, responder.energy - rDef.cost);
          responder.energy += rGain;
          noteEnergy(caster, cBefore, "broadcast");
          noteEnergy(responder, rBefore, "broadcast");
          const batch = nextBatch();
          pushDiscard(B.card, caster.id, { batch, tag: "cast" });
          const rCard = responder.hand.find((x) => x.uid === r.uid);
          if (rCard) {
            responder.hand.splice(responder.hand.indexOf(rCard), 1);
            pushDiscard(rCard, responder.id, { batch, tag: "response" });
          }
          const others = Object.entries(B.responses).filter(([id, v]) => v && id !== playerId);
          others.forEach(([id]) => {
            const o = byId(id), rv = B.responses[id];
            const od = CARD_DEFS[rv.key];
            const card = o.hand.find((x) => x.uid === rv.uid);
            if (card) {
              o.hand.splice(o.hand.indexOf(card), 1);
              pushDiscard(card, o.id, { batch, tag: "rejected" });
            }
            const oBefore = o.energy;
            o.energy = Math.max(0, o.energy - od.cost);
            o.energy += 1;
            noteEnergy(o, oBefore, "broadcast");
            log(`${o.name} \u7684\u56DE\u5E94\u672A\u88AB\u91C7\u7EB3\uFF1A\u5F03\u7F6E\u300C${od.name}\u300D\uFF0C\u8FD4\u8FD8 1 \u70B9\u80FD\u91CF`, "broadcast");
          });
          const fmt = (f) => f === "coop" ? "\u5408\u4F5C" : "\u4F2A\u88C5";
          log(`${caster.name}(${fmt(casterFace)}) \xD7 ${responder.name}(${fmt(r.face)}) \u2192 \u53D1\u5E03\u65B9 +${cGain}\uFF0C\u54CD\u5E94\u65B9 +${rGain}`, "broadcast");
          ev("broadcast_response", {
            actor: responder.id,
            card: r.key,
            face: r.face,
            target: B.targetGalaxy,
            distance: CARD_DEFS[r.key].dist
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
          noteEnergy(caster, nbBefore, "broadcast");
          pushDiscard(B.card, caster.id, { batch: nextBatch(), tag: "cast" });
          log(`\u65E0\u4EBA\u56DE\u5E94\uFF1A${caster.name} \u83B7\u5F97 1 \u70B9\u80FD\u91CF\uFF08\u80FD\u91CF ${caster.energy}\uFF09`, "broadcast");
          ev("broadcast_none", { actor: caster.id, target: B.targetGalaxy });
          S.broadcast = null;
        }
        function tickBroadcast(now) {
          const B = S.broadcast;
          if (!B || S.phase !== "playing") return { changed: false };
          const t = now || Date.now();
          if (B.stage === "collecting" && t >= (B.deadline || 0)) {
            let auto = 0;
            B.candidates.forEach((c) => {
              if (Object.prototype.hasOwnProperty.call(B.responses, c.playerId)) return;
              if (c.mandatory && c.options && c.options.length) {
                const pick = c.options.find((o) => o.face === "disg") || c.options[0];
                B.responses[c.playerId] = { uid: pick.uid, key: pick.key, face: pick.face };
              } else {
                B.responses[c.playerId] = null;
              }
              auto++;
            });
            if (auto) log(`\u7B49\u5F85\u8D85\u65F6\uFF1A${auto} \u540D\u672A\u54CD\u5E94\u7684\u73A9\u5BB6\u5DF2\u81EA\u52A8\u5904\u7406`, "broadcast");
            const res = finalizeBroadcast();
            if (res && res.ok === false && S.broadcast) S.broadcast = null;
            return { changed: true, timedOut: true, needChoose: !!(res && res.needChoose) };
          }
          if (B.stage === "choosing" && B.chooseDeadline && t >= B.chooseDeadline) {
            const responders = Object.entries(B.responses).filter(([, v]) => v);
            if (responders.length) {
              const pick = responders[0];
              log("\u7B49\u5F85\u6311\u9009\u8D85\u65F6\uFF1A\u81EA\u52A8\u7ED3\u7B97\u6700\u5148\u56DE\u5E94\u7684\u90A3\u540D", "broadcast");
              chooseResponder(pick[0], B.casterId);
            } else {
              S.broadcast = null;
            }
            return { changed: true, timedOut: true };
          }
          return { changed: false };
        }
        function playStrike(playerId, cardUid, targetGalaxy) {
          const c = canAct(playerId);
          if (!c.ok) return c;
          const p = c.p;
          const i = p.hand.findIndex((x) => x.uid === cardUid);
          if (i < 0) return { ok: false, msg: "\u624B\u724C\u4E2D\u6CA1\u6709\u8FD9\u5F20\u724C" };
          const card = p.hand[i], def = CARD_DEFS[card.key];
          if (def.type !== "strike") return { ok: false, msg: "\u8FD9\u4E0D\u662F\u6253\u51FB\u724C" };
          if (p.energy < def.cost) return { ok: false, msg: `\u80FD\u91CF\u4E0D\u8DB3\uFF08\u9700\u8981 ${def.cost}\uFF09` };
          const d = galaxyDistance(p.galaxy, targetGalaxy);
          p.hand.splice(i, 1);
          const strikeBefore = p.energy;
          p.energy -= def.cost;
          noteEnergy(p, strikeBefore, "strike");
          const st = {
            uid: card.uid,
            key: card.key,
            casterId: p.id,
            targetGalaxy,
            progress: 0,
            required: d,
            resolved: false,
            createdAtTurn: S.turnIndex
          };
          p.strikes.push(st);
          if (blindStrikes() && !def.immediate) {
            log(`${p.name} \u53D1\u5C04\u300C${def.name}\u300D\u2014\u2014\u76EE\u6807\u4E0D\u516C\u5F00\uFF08\u2212${def.cost} \u80FD\u91CF\uFF09`, "strike");
            ev("strike_cast", { actor: p.id, card: card.key, hidden: true });
          } else {
            log(`${p.name} \u53D1\u5C04\u300C${def.name}\u300D\u2192 ${GALAXY_NAMES[targetGalaxy]}\uFF08\u2212${def.cost} \u80FD\u91CF\uFF09`, "strike");
            ev("strike_cast", { actor: p.id, card: card.key, target: targetGalaxy });
          }
          markActed();
          if (d === 0 || def.immediate) {
            resolveStrike(st);
            advanceIfCurrentDead();
          }
          return { ok: true };
        }
        function withdrawStrike(playerId, strikeUid) {
          if (S.phase !== "playing") return { ok: false, msg: "\u5BF9\u5C40\u5DF2\u7ED3\u675F" };
          const p = byId(playerId);
          if (!p || !p.alive) return { ok: false, msg: "\u73A9\u5BB6\u4E0D\u53EF\u7528" };
          const st = p.strikes.find((s) => s.uid === strikeUid && !s.resolved);
          if (!st) return { ok: false, msg: "\u6CA1\u6709\u8FD9\u5F20\u98DE\u884C\u4E2D\u7684\u6253\u51FB" };
          p.strikes.splice(p.strikes.indexOf(st), 1);
          const def = CARD_DEFS[st.key];
          pushDiscard({ uid: st.uid, key: st.key }, p.id, { batch: nextBatch(), tag: "discard" });
          log(`${p.name} \u64A4\u56DE\u300C${def.name}\u300D\u2014\u2014\u80FD\u91CF\u4E0D\u9000`, "strike");
          ev("strike_withdraw", blindStrikes() ? { actor: p.id, card: st.key } : { actor: p.id, card: st.key, target: st.targetGalaxy });
          return { ok: true };
        }
        function resolveStrike(st) {
          st.resolved = true;
          const caster = byId(st.casterId);
          const def = CARD_DEFS[st.key];
          const targets = S.players.filter((p) => p.alive && p.galaxy === st.targetGalaxy);
          const target = targets[0];
          if (!target) {
            log(`\u300C${def.name}\u300D\u62B5\u8FBE ${GALAXY_NAMES[st.targetGalaxy]}\u2014\u2014\u7A7A\u65E0\u4E00\u4EBA\uFF0C\u6253\u51FB\u843D\u7A7A`, "strike");
            ev("strike_miss", { actor: st.casterId, card: st.key, target: st.targetGalaxy });
            if (caster) caster.strikes = caster.strikes.filter((s) => s !== st);
            pushDiscard({ uid: st.uid, key: st.key }, st.casterId, { batch: nextBatch(), tag: "discard" });
            return;
          }
          const defenders = target.buildZone.filter((b) => def.level !== INF && CARD_DEFS[b.key].defense >= def.level);
          const defended = defenders.length > 0;
          const defName = defended ? CARD_DEFS[defenders[0].key].name : "";
          const wouldDie = !defended;
          if (def.disableBuilds) {
            const n = target.buildZone.length;
            discardAllBuilds(target);
            log(`${target.name}\uFF08${GALAXY_NAMES[st.targetGalaxy]}\uFF09\u7684 ${n} \u5F20\u5DF2\u5EFA\u5361\u724C\u88AB\u79D1\u6280\u9501\u6B7B\u62C6\u9664\uFF08\u73A9\u5BB6\u5B58\u6D3B\uFF0C\u80FD\u91CF\u4E0E\u624B\u724C\u4E0D\u53D7\u5F71\u54CD\uFF09`, "strike");
            ev("strike_hit", { actor: st.casterId, card: st.key, target: st.targetGalaxy, defended: false, disabled: n });
            finishStrike(st, caster, { noReward: true, targetGalaxy: st.targetGalaxy });
            return;
          }
          if (wouldDie && !target.lightshipUsed) {
            const shipCard = target.hand.find((c) => CARD_DEFS[c.key].escape);
            if (shipCard && target.energy >= CARD_DEFS[shipCard.key].cost) {
              S.escapePending = {
                strikeUid: st.uid,
                targetId: target.id,
                cardUid: shipCard.uid,
                cardKey: shipCard.key,
                cost: CARD_DEFS[shipCard.key].cost,
                // 上一次挂起还没走完时又被打中，退回"生产"重新接回合，绝不能让 step 残留成 escape
                prevStep: S.step === "escape" ? "production" : S.step,
                deadline: Date.now() + 3e4
                // 挂机兜底：30 秒不选即视为放弃
              };
              S.step = "escape";
              log(`${target.name} \u624B\u91CC\u6709\u300C\u5149\u901F\u98DE\u8239\u300D\u2014\u2014\u7B49\u5F85\u4ED6\u51B3\u5B9A\u662F\u5426\u542F\u52A8`, "strike");
              return;
            }
          }
          if (defended) {
            log(`${target.name}\uFF08${GALAXY_NAMES[st.targetGalaxy]}\uFF09\u7684\u300C${defName}\u300D\u6321\u4E0B\u4E86\u300C${def.name}\u300D`, "strike");
            ev("strike_hit", { actor: st.casterId, card: st.key, target: st.targetGalaxy, defended: true });
            applyGalaxyEffects(st, def);
            if (def.key === "annihilate") {
              discardAllBuilds(target);
              log(`${target.name} \u5F03\u7F6E\u5168\u90E8\u5EFA\u8BBE\u724C`, "strike");
            }
          } else {
            eliminate(target, `\u88AB\u300C${def.name}\u300D\u547D\u4E2D \xB7 ${GALAXY_NAMES[st.targetGalaxy]}`);
            ev("strike_hit", { actor: st.casterId, card: st.key, target: st.targetGalaxy, defended: false });
            applyGalaxyEffects(st, def);
          }
          finishStrike(st, caster);
        }
        function applyGalaxyEffects(st, def) {
          const g = st.targetGalaxy;
          if (def.destroyStar) {
            S.markers[g].black = true;
            log(`${GALAXY_NAMES[g]} \u7684\u6052\u661F\u88AB\u6BC1\u706D\uFF08\u4F9D\u8D56\u6052\u661F\u7684\u5EFA\u7B51\u5931\u6548\uFF09`, "marker");
            ev("marker", { galaxy: g, kind: "black" });
          }
          if (def.destroyBuilds) {
            S.markers[g].purple = true;
            S.players.forEach((p) => {
              if (p.galaxy === g) discardAllBuilds(p);
            });
            log(`${GALAXY_NAMES[g]} \u88AB\u6807\u8BB0\u4E3A\u7D2B\u8272\uFF08\u6E6E\u706D\uFF09`, "marker");
            ev("marker", { galaxy: g, kind: "purple" });
          }
          if (def.destroyGalaxy) {
            S.markers[g].red = true;
            log(`${GALAXY_NAMES[g]} \u88AB\u5F7B\u5E95\u6E05\u9664\uFF08\u7EA2\u8272\u6807\u8BB0\uFF09`, "marker");
            ev("marker", { galaxy: g, kind: "red" });
          }
        }
        function chooseEscape(playerId, use) {
          const E = S.escapePending;
          if (!E) return { ok: false, msg: "\u5F53\u524D\u6CA1\u6709\u5F85\u51B3\u7684\u5149\u901F\u98DE\u8239" };
          if (E.targetId !== playerId) return { ok: false, msg: "\u8FD9\u4E0D\u662F\u4F60\u80FD\u51B3\u5B9A\u7684\u4E8B" };
          const target = byId(E.targetId);
          const caster = byId(function() {
            const owner = S.players.find((p) => p.strikes.some((x) => x.uid === E.strikeUid));
            return owner ? owner.id : null;
          }());
          const st = caster && caster.strikes.find((x) => x.uid === E.strikeUid);
          if (!st) {
            S.escapePending = null;
            return { ok: false, msg: "\u8FD9\u652F\u6253\u51FB\u5DF2\u4E0D\u5B58\u5728" };
          }
          const sdef = CARD_DEFS[st.key];
          S.escapePending = null;
          if (use) {
            escapeWithLightship(target, st, sdef, E.cardUid);
          } else {
            log(`${target.name} \u653E\u5F03\u542F\u52A8\u5149\u901F\u98DE\u8239`, "strike");
            ev("lightship_decline", { actor: target.id });
            eliminate(target, `\u88AB\u300C${sdef.name}\u300D\u547D\u4E2D \xB7 ${GALAXY_NAMES[st.targetGalaxy]}`);
            ev("strike_hit", { actor: st.casterId, card: st.key, target: st.targetGalaxy, defended: false });
            applyGalaxyEffects(st, sdef);
            finishStrike(st, caster);
          }
          if (S.phase !== "playing") return { ok: true };
          const me = byId(playerId);
          const cur = S.players[S.currentIdx];
          if (!me.alive && cur && cur.id === playerId) {
            nextPlayer();
            return { ok: true };
          }
          if (S.step !== "escape") return { ok: true };
          if (!cur || !cur.alive) {
            nextPlayer();
            return { ok: true };
          }
          if (E.prevStep === "production") startActionPhase(cur);
          else S.step = E.prevStep || "action";
          return { ok: true };
        }
        function tickEscape(now) {
          const E = S.escapePending;
          if (!E) return { changed: false };
          const t = now || Date.now();
          if (t < (E.deadline || 0)) return { changed: false };
          log("\u7B49\u5F85\u5149\u901F\u98DE\u8239\u51B3\u5B9A\u8D85\u65F6\uFF1A\u89C6\u4E3A\u653E\u5F03", "strike");
          chooseEscape(E.targetId, false);
          return { changed: true, timedOut: true };
        }
        function escapeWithLightship(target, st, def, cardUid) {
          target.lightshipUsed = true;
          const idx = target.hand.findIndex((c) => c.uid === cardUid);
          if (idx >= 0) {
            const card = target.hand.splice(idx, 1)[0];
            pushDiscard(card, target.id, { batch: nextBatch(), tag: "discard" });
          }
          discardAllBuilds(target);
          const shipBefore = target.energy;
          target.energy = 0;
          noteEnergy(target, shipBefore, "lightship");
          const occupied = new Set(S.players.filter((p) => p.alive).map((p) => p.galaxy));
          const empties = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((g) => !occupied.has(g) && !S.markers[g].red);
          if (!empties.length) {
            log(`${target.name} \u542F\u52A8\u5149\u901F\u98DE\u8239\uFF0C\u4F46\u5DF2\u65E0\u7A7A\u661F\u7CFB\u53EF\u53BB`, "strike");
            eliminate(target, "\u65E0\u5904\u53EF\u9003");
            finishStrike(st, byId(st.casterId));
            return;
          }
          const dest = empties[Math.floor(Math.random() * empties.length)];
          const from = target.galaxy;
          target.galaxy = dest;
          log(`${target.name} \u542F\u52A8\u5149\u901F\u98DE\u8239\uFF0C\u64A4\u79BB ${GALAXY_NAMES[from]}\uFF08\u53BB\u5411\u4E0D\u660E\uFF1B\u5F03\u5168\u90E8\u5EFA\u8BBE\u724C\u4E0E\u80FD\u91CF\uFF09`, "strike");
          ev("lightship", { actor: target.id, from });
          finishStrike(st, byId(st.casterId));
        }
        function finishStrike(st, caster, opts2) {
          const alive = alivePlayers().length;
          if (!(opts2 && opts2.noReward) && caster && caster.alive) {
            const reward = alive * 3;
            const rewardBefore = caster.energy;
            caster.energy += reward;
            noteEnergy(caster, rewardBefore, "reward");
            log(`${caster.name} \u83B7\u5F97\u6E05\u573A\u5956\u52B1 +${reward} \u80FD\u91CF\uFF08\u5269\u4F59 ${alive} \u4EBA\uFF09`, "strike");
          }
          if (caster) caster.strikes = caster.strikes.filter((s) => s !== st);
          const meta = { batch: nextBatch(), tag: "discard" };
          if (opts2 && opts2.targetGalaxy != null) meta.targetGalaxy = opts2.targetGalaxy;
          pushDiscard({ uid: st.uid, key: st.key }, st.casterId, meta);
          checkVictory();
        }
        function discardAllBuilds(p) {
          const builds = p.buildZone.splice(0, p.buildZone.length);
          const bb = nextBatch();
          builds.forEach((c) => pushDiscard(c, p.id, { batch: bb, tag: "discard" }));
        }
        function eliminate(p, reason) {
          p.alive = false;
          p.eliminatedTurn = S.turnIndex;
          log(`${p.name} \u88AB\u6DD8\u6C70\uFF08${reason}\uFF09`, "elim");
          ev("eliminate", { actor: p.id, galaxy: p.galaxy });
          const flying = p.strikes.filter((s) => !s.resolved);
          if (flying.length) {
            p.strikes = p.strikes.filter((s) => s.resolved);
            const fb = nextBatch();
            flying.forEach((st) => pushDiscard({ uid: st.uid, key: st.key }, p.id, { batch: fb, tag: "discard" }));
            log(`${p.name} \u5728\u98DE\u7684 ${flying.length} \u679A\u6253\u51FB\u5931\u53BB\u5236\u5BFC\uFF0C\u5760\u5165\u865A\u7A7A`, "elim");
            flying.forEach((st) => ev("strike_void", blindStrikes() ? { actor: p.id, card: st.key } : { actor: p.id, card: st.key, target: st.targetGalaxy }));
          }
          const hand = p.hand.splice(0, p.hand.length);
          const hb = nextBatch();
          hand.forEach((c) => pushDiscard(c, p.id, { batch: hb, tag: "discard" }));
          discardAllBuilds(p);
        }
        function checkVictory() {
          if (alivePlayers().length <= 1) endGame();
        }
        function forceEnd(reason) {
          if (S.phase !== "playing") return { ok: false };
          const alive = alivePlayers();
          const best = alive.slice().sort((a, b) => b.energy - a.energy)[0];
          S.broadcast = null;
          S.escapePending = null;
          S.step = "ended";
          S.phase = "ended";
          S.winner = best ? best.id : null;
          S.endReason = "heat_death";
          log(`\u5B87\u5B99\u70ED\u5BC2\uFF08${reason || "\u56DE\u5408\u4E0A\u9650"}\uFF09\uFF1A\u80FD\u91CF\u6700\u9AD8\u8005 ${best ? best.name : "\u65E0"} \u80DC\u51FA`, "system");
          return { ok: true };
        }
        function endGame() {
          const alive = alivePlayers();
          S.phase = "ended";
          S.winner = alive.length === 1 ? alive[0].id : null;
          S.endReason = "last_stand";
          log(alive.length === 1 ? `${alive[0].name} \u6210\u4E3A\u6700\u540E\u7684\u5E78\u5B58\u8005` : "\u6240\u6709\u6587\u660E\u5747\u88AB\u6E05\u7406\uFF0C\u5168\u573A\u65E0\u8D62\u5BB6", "system");
        }
        function nextBatch() {
          S.discardSeq = (S.discardSeq || 0) + 1;
          return S.discardSeq;
        }
        function pushDiscard(card, ownerId, meta) {
          const m = meta || {};
          const entry = {
            uid: card.uid,
            key: card.key,
            ownerId,
            name: CARD_DEFS[card.key].name,
            turn: S.turnIndex,
            batch: m.batch || 0,
            tag: m.tag || "discard"
          };
          if (m.targetGalaxy != null) entry.targetGalaxy = m.targetGalaxy;
          S.discard.current.push(entry);
        }
        function rollDiscard() {
          const recycled = S.discard.last;
          if (recycled.length) {
            recycled.forEach((d) => S.deck.push({ uid: d.uid, key: d.key }));
            shuffle(S.deck);
            log(`${recycled.length} \u5F20\u724C\u5DF2\u6D17\u56DE\u724C\u5E93`, "discard");
          }
          S.discard.last = S.discard.current;
          S.discard.current = [];
        }
        function endTurn(playerId) {
          if (S.phase !== "playing") return { ok: false, msg: "\u5BF9\u5C40\u5DF2\u7ED3\u675F" };
          const cur = S.players[S.currentIdx];
          if (playerId && cur.id !== playerId) return { ok: false, msg: "\u8FD8\u6CA1\u8F6E\u5230\u4F60" };
          if (!cur.alive) return { ok: false, msg: "\u4F60\u5DF2\u51FA\u5C40" };
          if (S.broadcast) return { ok: false, msg: "\u8BF7\u5148\u7ED3\u7B97\u5F53\u524D\u5E7F\u64AD" };
          if (S.escapePending) return { ok: false, msg: "\u8BF7\u5148\u51B3\u5B9A\u662F\u5426\u542F\u52A8\u5149\u901F\u98DE\u8239" };
          S.step = "supply";
          refillHand(cur, "\u8865\u724C");
          rollDiscard();
          if (alivePlayers().length <= 1) {
            endGame();
            return { ok: true };
          }
          if (S.turnIndex >= MAX_TURNS) {
            forceEnd("\u56DE\u5408\u4E0A\u9650");
            return { ok: true };
          }
          nextPlayer();
          return { ok: true };
        }
        function validTargets(playerId, cardUid, kind) {
          const p = byId(playerId);
          const card = p.hand.find((x) => x.uid === cardUid);
          if (!card) return [];
          const def = CARD_DEFS[card.key];
          if (kind === "broadcast" && def.type !== "broadcast") return [];
          if (kind === "strike" && def.type !== "strike") return [];
          const limit = kind === "broadcast" ? def.dist : INF;
          return [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((g) => galaxyDistance(p.galaxy, g) <= limit);
        }
        const api = {
          newGame,
          state: () => S,
          currentPlayer: () => S.players[S.currentIdx],
          byId,
          alivePlayers,
          playBuild,
          playBroadcast,
          setResponse,
          responsesComplete,
          finalizeBroadcast,
          chooseResponder,
          playStrike,
          withdrawStrike,
          discardCards,
          endTurn,
          validTargets,
          forceEnd,
          tickBroadcast,
          chooseEscape,
          tickEscape,
          playerNames: () => S.players.map((p) => p.name),
          /** 从快照恢复（Durable Object 休眠唤醒 / 服务器热重载用） */
          hydrate(snapshot) {
            S = snapshot;
            S.mode = S.mode || "standard";
            S.strikeTarget = S.strikeTarget === "hidden" ? "hidden" : "open";
            S.events = S.events || [];
            S.eventSeq = S.eventSeq || (S.events.length ? S.events[S.events.length - 1].id : 0);
            return api;
          },
          _log: log
        };
        if (names && names.length) api.newGame(names);
        return api;
      }
      let _solo = null;
      const Engine = {
        newGame(names) {
          _solo = createGame2(names);
          return _solo.state();
        },
        getState() {
          return _solo ? _solo.state() : null;
        },
        currentPlayer() {
          return _solo ? _solo.currentPlayer() : null;
        },
        playBuild: (...a) => _solo.playBuild(...a),
        playBroadcast: (...a) => _solo.playBroadcast(...a),
        submitResponses(map) {
          const B = _solo.state().broadcast;
          if (!B) return { ok: false, msg: "\u5F53\u524D\u6CA1\u6709\u5F85\u54CD\u5E94\u7684\u5E7F\u64AD" };
          for (const c of B.candidates) {
            const r = map[c.playerId];
            _solo.setResponse(c.playerId, r && r.uid ? r.uid : null, r ? r.face : null);
          }
          return _solo.finalizeBroadcast();
        },
        chooseResponder(pid) {
          return _solo.chooseResponder(pid);
        },
        playStrike: (...a) => _solo.playStrike(...a),
        withdrawStrike: (...a) => _solo.withdrawStrike(...a),
        discardCards: (...a) => _solo.discardCards(...a),
        endTurn: () => _solo.endTurn(),
        validBroadcastTargets: (pid, uid) => _solo.validTargets(pid, uid, "broadcast")
      };
      return { createGame: createGame2, Engine, CARD_DEFS, GALAXY_NAMES, ADJACENCY, galaxyDistance, INF };
    });
  }
});

// ../shared/view.js
var require_view = __commonJS({
  "../shared/view.js"(exports, module) {
    (function(root, factory) {
      let cards;
      if (typeof module === "object" && module.exports) cards = require_cards();
      else cards = root;
      const api = factory(cards);
      if (typeof module === "object" && module.exports) module.exports = api;
      else Object.assign(root, api);
    })(typeof globalThis !== "undefined" ? globalThis : exports, function(C) {
      const { CARD_DEFS, GALAXY_NAMES } = C;
      function publicPlayer(p, playerId, opts) {
        const hideStrikeTargets = !!(opts && opts.hideStrikeTargets);
        return {
          id: p.id,
          seat: p.seat,
          name: p.name,
          alive: p.alive,
          energy: p.energy,
          handCount: p.hand.length,
          buildZone: p.buildZone.map((c) => ({ uid: c.uid, key: c.key })),
          // 建设区公开
          // 打击正面朝上，但**飞行回合数只有发起者知道**：
          // 轮数 = 发起者到目标的距离，公开它就等于公开发起者坐标。
          strikes: p.strikes.filter((s) => !s.resolved).map((s) => {
            const mine = s.casterId === playerId;
            const blind = hideStrikeTargets && !mine;
            return {
              uid: s.uid,
              key: s.key,
              targetGalaxy: blind ? null : s.targetGalaxy,
              blind,
              // 前端据此渲染「目标不明」
              mine,
              // 「已经飞了几手」是公开的（进度指示物摆在桌上），
              // 但「还要几手」= 距离，只有发起者知道。
              progress: s.progress,
              required: mine ? s.required : null,
              turnsLeft: mine ? Math.max(0, s.required - s.progress) : null
            };
          })
        };
      }
      function visibleEvents(S, playerId) {
        const src = (S.events || []).slice(-160);
        if (S.strikeTarget !== "hidden") return src;
        return src.map((e) => {
          if (!e || e.actor === playerId) return e;
          if (e.type !== "strike_cast" && e.type !== "strike_withdraw" && e.type !== "strike_void") return e;
          const out = Object.assign({}, e);
          delete out.target;
          delete out.distance;
          return out;
        });
      }
      function discardEntry(d, S, hideStrikeTargets) {
        const out = {
          uid: d.uid,
          key: d.key,
          name: d.name,
          turn: d.turn,
          batch: d.batch || 0,
          tag: d.tag || "discard"
        };
        if (hideStrikeTargets && d.key === "lock" && d.turn === S.turnIndex && d.targetGalaxy != null) {
          out.targetGalaxy = d.targetGalaxy;
        }
        return out;
      }
      function viewFor2(game, playerId) {
        const S = game.state();
        if (!S) return null;
        const me = S.players.find((p) => p.id === playerId);
        const hideStrikeTargets = S.strikeTarget === "hidden";
        const players = S.players.map((p) => {
          const base = publicPlayer(p, playerId, { hideStrikeTargets });
          if (p.id === playerId) {
            base.galaxy = p.galaxy;
            base.hand = p.hand.map((c) => ({ uid: c.uid, key: c.key }));
            base.isMe = true;
          } else {
            base.galaxy = null;
            base.hand = null;
          }
          return base;
        });
        let broadcast = null;
        if (S.broadcast) {
          const B = S.broadcast;
          const collecting = B.stage === "collecting";
          const myCand = B.candidates.find((c) => c.playerId === playerId);
          const isCaster = B.casterId === playerId;
          broadcast = {
            casterId: B.casterId,
            // 广播牌的「合作 / 伪装」面要在结算时才翻：除发布者本人，谁都不下发真实 key
            card: isCaster ? { uid: B.card.uid, key: B.card.key, name: CARD_DEFS[B.card.key].name, revealed: true } : { uid: B.card.uid, key: C.hideFace(B.card.key), name: C.familyName(B.card.key), revealed: false },
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
              options: myCand.options
            } : null,
            // 收集阶段不下发任何人的回应；进入挑选阶段也只说"谁回应了"，
            // 不说是哪一面——面要等真正结算（翻开）后才公开，弃牌堆里有。
            responders: collecting ? null : Object.entries(B.responses).filter(([, v]) => v).map(([pid]) => ({ playerId: pid })),
            isMyChoice: !collecting && B.casterId === playerId,
            iAmCaster: isCaster,
            myOptions: myCand ? myCand.options : null
          };
        }
        let escape = null;
        if (S.escapePending) {
          const E = S.escapePending;
          escape = E.targetId === playerId ? { mine: true, cardUid: E.cardUid, cardKey: E.cardKey, cost: E.cost, deadline: E.deadline } : { mine: false, targetId: E.targetId, deadline: E.deadline };
        }
        return {
          phase: S.phase,
          mode: S.mode || "standard",
          // standard / fast，前端据此显示规则与按钮
          // open（默认，全场可见打击目标） / hidden（只公开类型与已飞手数，落地才公布落点）
          strikeTarget: hideStrikeTargets ? "hidden" : "open",
          escape,
          turnIndex: S.turnIndex,
          currentPlayerId: S.players[S.currentIdx] ? S.players[S.currentIdx].id : null,
          step: S.step,
          thinking: false,
          // 由 server 层填充
          actionsThisTurn: S.actionCount || 0,
          discardUsed: !!S.discardUsed,
          players,
          deckCount: S.deck.length,
          discard: {
            // 去 ownerId（匿名），但保留 batch / tag：前端据此堆叠并标注来源
            current: S.discard.current.map((d) => discardEntry(d, S, hideStrikeTargets)),
            last: S.discard.last.map((d) => discardEntry(d, S, hideStrikeTargets))
          },
          markers: S.markers,
          broadcast,
          arrow: S.arrow,
          // 弃牌瞬间的归属提示，15 秒后由前端自行淡出
          winner: S.winner,
          endReason: S.endReason || null,
          // 结构化公开事件（与日志同源）：AI 的记忆来源，也是回放的原料。
          // 隐藏打击目标时，别人的发射/撤回/坠毁事件会被摘掉目的地。
          events: visibleEvents(S, playerId),
          log: S.log.slice(0, 60),
          me: me ? { id: me.id, seat: me.seat, name: me.name, galaxy: me.galaxy, alive: me.alive, energy: me.energy } : null,
          galaxyNames: GALAXY_NAMES
        };
      }
      return { viewFor: viewFor2 };
    });
  }
});

// ../shared/ai.js
var require_ai = __commonJS({
  "../shared/ai.js"(exports, module) {
    (function(root, factory) {
      let cards;
      if (typeof module === "object" && module.exports) cards = require_cards();
      else cards = root;
      const api = factory(cards);
      if (typeof module === "object" && module.exports) module.exports = api;
      else Object.assign(root, api);
    })(typeof globalThis !== "undefined" ? globalThis : exports, function(C) {
      const { CARD_DEFS, GALAXY_NAMES, galaxyDistance, INF } = C;
      const ALL_GALAXIES = [1, 2, 3, 4, 5, 6, 7, 8, 9];
      const LEVELS2 = {
        dehydrator: { key: "dehydrator", name: "\u8131\u6C34\u8005", retention: 0.3, blurb: "\u8BB0\u5F97\u7EA6\u4E09\u6210\uFF0C\u5E38\u628A\u5BF9\u624B\u7684\u4F4D\u7F6E\u641E\u6DF7" },
        chaotic_era: { key: "chaotic_era", name: "\u4E71\u7EAA\u5143", retention: 0.55, blurb: "\u8BB0\u5F97\u4E00\u534A\uFF0C\u5927\u81F4\u80FD\u62FC\u51FA\u4F4D\u7F6E" },
        stable_era: { key: "stable_era", name: "\u6052\u7EAA\u5143", retention: 0.88, blurb: "\u51E0\u4E4E\u4E0D\u6F0F\uFF0C\u5B9A\u4F4D\u76F8\u5F53\u51C6" },
        sophon: { key: "sophon", name: "\u667A\u5B50", retention: 1, blurb: "\u8BB0\u5F97\u6BCF\u4E00\u4E2A\u516C\u5F00\u4E8B\u4EF6" }
      };
      const LEVEL_KEYS = Object.keys(LEVELS2);
      function hash01(n) {
        let x = (n | 0) ^ 2654435769;
        x = Math.imul(x ^ x >>> 16, 2146121005);
        x = Math.imul(x ^ x >>> 15, 2221713035);
        x = (x ^ x >>> 16) >>> 0;
        return x / 4294967296;
      }
      function recall(view, levelKey, seed) {
        const lv = LEVELS2[levelKey] || LEVELS2.chaotic_era;
        const events = view.events || [];
        if (lv.retention >= 1) return events;
        const t = view.turnIndex;
        return events.filter((e) => e.turn >= t - 1 || hash01(e.id * 2654435761 + (seed | 0)) < lv.retention);
      }
      function belief(view, meId, memory) {
        const me = view.players.find((p) => p.id === meId);
        const live = ALL_GALAXIES.filter((g) => !view.markers[g].red && g !== me.galaxy);
        const out = {};
        for (const o of view.players) {
          if (o.id === meId || !o.alive) continue;
          let cand = new Set(live);
          for (const e of memory) {
            if (e.type === "strike_miss" || e.type === "strike_hit") {
              cand.delete(e.target);
              continue;
            }
            if (e.actor !== o.id) continue;
            if (e.type === "broadcast_cast") {
              cand = new Set([...cand].filter((g) => galaxyDistance(g, e.target) <= e.distance));
            } else if (e.type === "broadcast_response") {
              const lim = CARD_DEFS[e.card] ? CARD_DEFS[e.card].dist : 2;
              cand = new Set([...cand].filter((g) => galaxyDistance(g, e.target) <= lim));
            } else if (e.type === "strike_cast") {
            } else if (e.type === "lightship") {
              cand.delete(e.from);
            }
          }
          if (!cand.size) cand = new Set(live);
          out[o.id] = cand;
        }
        for (let pass = 0; pass < 4; pass++) {
          const taken = /* @__PURE__ */ new Set();
          for (const id in out) if (out[id].size === 1) taken.add([...out[id]][0]);
          if (!taken.size) break;
          let changed = false;
          for (const id in out) {
            if (out[id].size === 1) continue;
            const next = new Set([...out[id]].filter((g) => !taken.has(g)));
            if (next.size && next.size !== out[id].size) {
              out[id] = next;
              changed = true;
            }
          }
          if (!changed) break;
        }
        return out;
      }
      const probOf = (set, g) => set && set.has(g) ? 1 / set.size : 0;
      function galaxyMass(cands, g) {
        let s = 0;
        for (const id in cands) s += probOf(cands[id], g);
        return s;
      }
      function createAI(playerId, level, seed) {
        const lv = LEVELS2[level] ? level : "chaotic_era";
        function decide(view) {
          if (!view || view.phase !== "playing") return null;
          const me = view.players.find((p) => p.id === playerId);
          if (!me || !me.alive) return null;
          if (view.broadcast) {
            const B = view.broadcast;
            if (B.stage === "collecting") {
              const c = B.myCandidate;
              if (c && !c.responded) return respondAction(view, me, c);
              return null;
            }
            if (B.stage === "choosing" && B.isMyChoice) return chooseAction(view, B);
            return null;
          }
          if (view.currentPlayerId !== playerId || view.step !== "action") return null;
          const memory = recall(view, lv, seed);
          const cands = belief(view, playerId, memory);
          if ((view.actionsThisTurn || 0) >= 2) return { type: "end" };
          return mainAction(view, me, cands, memory);
        }
        function respondAction(view, me, c) {
          const opts = c.options || [];
          if (!opts.length) return { type: "respond", uid: null };
          const pick = opts.find((o) => o.face === "disg") || opts[0];
          if (c.mandatory) return { type: "respond", uid: pick.uid, face: pick.face };
          const spare = (me.hand || []).filter((x) => CARD_DEFS[x.key].type === "broadcast").length;
          const precious = opts.length === 1 && pick.cost >= 1 && spare === 1 && me.energy >= 10;
          return precious ? { type: "respond", uid: null, face: null } : { type: "respond", uid: pick.uid, face: pick.face };
        }
        function chooseAction(view, B) {
          const list = B.responders || [];
          if (!list.length) return null;
          return { type: "choose", targetId: list[0].playerId };
        }
        function mainAction(view, me, cands, memory) {
          const hand = (me.hand || []).map((c) => ({ uid: c.uid, key: c.key, def: CARD_DEFS[c.key] }));
          const ofType = (t) => hand.filter((x) => x.def.type === t);
          const energy = me.energy;
          const alive = view.players.filter((p) => p.alive).length;
          const incoming = [];
          view.players.forEach((p) => {
            if (p.id === me.id || !p.alive) return;
            p.strikes.forEach((s) => {
              if (s.targetGalaxy === me.galaxy) incoming.push({ by: p, s });
            });
          });
          if (incoming.length) {
            const maxLvl = incoming.reduce((m, x) => Math.max(m, CARD_DEFS[x.s.key].level), 0);
            if (maxLvl !== INF) {
              const shields = ofType("build").filter((x) => x.def.defense && x.def.defense >= maxLvl && energy >= x.def.cost).sort((a, b) => a.def.cost - b.def.cost);
              if (shields.length) return buildAction(shields[0]);
            }
          }
          const strikes = ofType("strike").filter((x) => energy >= x.def.cost);
          if (strikes.length) {
            const pick = pickStrike(view, me, cands, strikes, alive);
            if (pick) return { type: "strike", uid: pick.card.uid, galaxy: pick.galaxy };
          }
          const builds = ofType("build").filter((x) => energy >= x.def.cost && !x.def.escape);
          if (builds.length) {
            const pick = pickBuild(me, builds, view);
            if (pick) return buildAction(pick);
          }
          const casts = ofType("broadcast").filter((x) => energy >= x.def.cost + 1);
          if (casts.length) {
            const pick = pickProbe(view, me, cands, casts, memory);
            if (pick) return { type: "broadcast", uid: pick.card.uid, galaxy: pick.galaxy };
          }
          if (hand.length && !view.discardUsed) {
            const worst = pickWorst(hand, energy, me);
            if (worst) return { type: "discard", uids: [worst.uid] };
          }
          return { type: "end" };
        }
        function buildAction(x) {
          return { type: "build", uid: x.uid };
        }
        function pickBuild(me, builds, view) {
          const owned = new Set(me.buildZone.map((b) => b.key));
          const income = me.buildZone.reduce((s, b) => s + (CARD_DEFS[b.key].income || 0), 0);
          const scored = [];
          for (const x of builds) {
            const d = x.def;
            let score = 0;
            if (d.income) {
              if (income >= 6) score = 0;
              else score = d.income / Math.max(1, d.cost) * 10;
              if (!d.starDependent) score += 1.2;
              if (owned.has(x.key)) score = 0;
            } else if (d.defense) {
              const threatened = view.players.some((p) => p.alive && p.id !== me.id && p.strikes.some((s) => CARD_DEFS[s.key].level !== INF && CARD_DEFS[s.key].level <= d.defense));
              score = threatened ? 3 : 0.4;
              if (me.buildZone.some((b) => CARD_DEFS[b.key].defense)) score -= 1.5;
            } else if (d.noResponse) {
              score = 1.4;
              if (owned.has(x.key)) score = 0;
            } else if (d.escape) {
              score = me.energy >= 12 ? 0.8 : -1;
            }
            if (score > 0) scored.push({ x, score });
          }
          const filtered = scored.filter((s) => !(s.x.def.noResponse && owned.has(s.x.key)));
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
                const shield = o.buildZone.map((b) => CARD_DEFS[b.key].defense || 0).reduce((m, v) => Math.max(m, v), 0);
                const blocked = lvl !== INF && shield >= lvl;
                const hasShip = o.buildZone.some((b) => CARD_DEFS[b.key].escape);
                const gain = blocked ? card.def.destroyBuilds ? 2.6 : 0.6 : hasShip ? 2 : 3 * alive;
                exp += p * gain;
              }
              exp -= card.def.cost * 0.55;
              if (!best || exp > best.exp) best = { card, galaxy: g, exp, p: galaxyMass(cands, g) };
            }
          }
          if (!best) return null;
          const rich = me.energy >= 10;
          const late = view.turnIndex > 12 * view.players.length;
          const minP = late ? 0.05 : rich ? 0.15 : 0.32;
          const minExp = late ? -99 : rich ? -1.5 : 1.6;
          if (best.exp <= minExp || best.p < minP) return null;
          return best;
        }
        function pickProbe(view, me, cands, casts, memory) {
          let best = null;
          for (const card of casts) {
            for (const g of ALL_GALAXIES) {
              if (view.markers[g].red) continue;
              if (galaxyDistance(me.galaxy, g) > card.def.dist) continue;
              const mass = galaxyMass(cands, g);
              if (mass <= 0) continue;
              const multi = Object.values(cands).filter((s) => s.has(g)).length;
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
          hand.forEach((c) => {
            counts[c.key] = (counts[c.key] || 0) + 1;
          });
          for (const x of hand) {
            const d = x.def;
            let s = 0;
            if (d.cost > energy) s += 6 + (d.cost - energy);
            if (counts[x.key] > 1) s += 3;
            if (d.type === "broadcast") s -= 1.5;
            if (d.defense) s += 1;
            if (d.escape) s -= 3;
            if (d.destroyGalaxy) s -= 8;
            else if (d.destroyBuilds) s -= 5;
            else if (d.level === INF) s -= 3;
            if (s < worstScore) {
              worstScore = s;
              worst = x;
            }
          }
          return worst;
        }
        return { playerId, level: lv, seed, decide, recall: (v) => recall(v, lv, seed) };
      }
      function applyAction(game, playerId, a) {
        if (!a) return { ok: false, msg: "no action" };
        switch (a.type) {
          case "build":
            return game.playBuild(playerId, a.uid);
          case "broadcast":
            return game.playBroadcast(playerId, a.uid, a.galaxy);
          case "strike":
            return game.playStrike(playerId, a.uid, a.galaxy);
          case "discard":
            return game.discardCards(playerId, a.uids || []);
          case "end":
            return game.endTurn(playerId);
          case "withdraw":
            return game.withdrawStrike(playerId, a.uid);
          case "respond":
            return game.setResponse(playerId, a.uid || null, a.face || null);
          case "choose":
            return game.chooseResponder(a.targetId, playerId);
          case "escape":
            return game.chooseEscape(playerId, !!a.use);
          default:
            return { ok: false, msg: "\u672A\u77E5\u52A8\u4F5C" };
        }
      }
      function runAI2(game, seats, viewFor2, opts) {
        const o = opts || {};
        const maxSteps = o.maxSteps || 120;
        const getSeat = (id) => seats instanceof Map ? seats.get(id) : seats[id];
        const ais = /* @__PURE__ */ new Map();
        const played = [];
        for (let step = 0; step < maxSteps; step++) {
          const S = game.state();
          if (!S || S.phase !== "playing") break;
          if (S.turnIndex > 240) {
            game.forceEnd("\u56DE\u5408\u4E0A\u9650");
            break;
          }
          if (S.escapePending) {
            const E = S.escapePending;
            const seat2 = getSeat(E.targetId);
            if (!seat2) break;
            const act2 = { type: "escape", use: true };
            game.chooseEscape(E.targetId, true);
            played.push({ actor: E.targetId, act: act2 });
            if (o.onStep) o.onStep(game);
            continue;
          }
          if (S.broadcast && S.broadcast.stage === "collecting") {
            const B = S.broadcast;
            if (!B.candidates.length) {
              game.tickBroadcast(Date.now() + 1e9);
              if (o.onStep) o.onStep(game);
              continue;
            }
            const pend = B.candidates.filter((c2) => !Object.prototype.hasOwnProperty.call(B.responses, c2.playerId) && getSeat(c2.playerId));
            if (!pend.length) break;
            const c = pend[0];
            const seat2 = getSeat(c.playerId);
            const ai2 = ais.get(c.playerId) || ais.set(c.playerId, createAI(c.playerId, seat2.level, seat2.seed || 1)).get(c.playerId);
            const view = viewFor2(game, c.playerId);
            const act2 = ai2.decide(view) || { type: "respond", uid: null };
            const r2 = applyAction(game, c.playerId, act2);
            if (!r2.ok && act2.uid) applyAction(game, c.playerId, { type: "respond", uid: null });
            played.push({ actor: c.playerId, act: act2 });
            if (game.responsesComplete()) game.finalizeBroadcast();
            if (o.onStep) o.onStep(game);
            continue;
          }
          if (S.broadcast && S.broadcast.stage === "choosing") {
            const B = S.broadcast;
            const seat2 = getSeat(B.casterId);
            if (!seat2) break;
            const ai2 = ais.get(B.casterId) || ais.set(B.casterId, createAI(B.casterId, seat2.level, seat2.seed || 1)).get(B.casterId);
            const act2 = ai2.decide(viewFor2(game, B.casterId));
            if (!act2) break;
            const r2 = applyAction(game, B.casterId, act2);
            played.push({ actor: B.casterId, act: act2 });
            if (!r2.ok) {
              const any = Object.values(B.responses).find(Boolean);
              if (!any) break;
            }
            if (o.onStep) o.onStep(game);
            continue;
          }
          const cur = S.players[S.currentIdx];
          const seat = cur && getSeat(cur.id);
          if (!seat || !cur.alive) break;
          if (S.step !== "action") break;
          const ai = ais.get(cur.id) || ais.set(cur.id, createAI(cur.id, seat.level, seat.seed || 1)).get(cur.id);
          const act = ai.decide(viewFor2(game, cur.id));
          if (!act) return played;
          const r = applyAction(game, cur.id, act);
          played.push({ actor: cur.id, act, ok: r.ok, msg: r.msg });
          if (!r.ok) {
            const end = applyAction(game, cur.id, { type: "end" });
            played.push({ actor: cur.id, act: { type: "end" }, ok: end.ok });
            break;
          }
          if (o.onStep) o.onStep(game);
          if (act.type === "end") continue;
        }
        return played;
      }
      return { LEVELS: LEVELS2, LEVEL_KEYS, createAI, runAI: runAI2, applyAction, recall, belief };
    });
  }
});

// src/index.js
var import_rules = __toESM(require_rules());
var import_view = __toESM(require_view());
var import_ai = __toESM(require_ai());
var { createGame } = import_rules.default;
var { viewFor } = import_view.default;
var { runAI, LEVELS } = import_ai.default;
var ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function makeRoomId() {
  return Array.from({ length: 5 }, () => ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)]).join("");
}
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400"
};
var index_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }
    if (url.pathname === "/api/create") {
      const roomId = makeRoomId();
      const stub = env.ROOMS.get(env.ROOMS.idFromName(roomId));
      await stub.fetch(`https://do/init?room=${roomId}`, { method: "POST" });
      if (env.META) {
        await env.META.put(`room:${roomId}`, JSON.stringify({ createdAt: Date.now() }), { expirationTtl: 86400 }).catch(() => {
        });
      }
      return new Response(JSON.stringify({ roomId }), {
        headers: { ...CORS, "Content-Type": "application/json" }
      });
    }
    if (url.pathname === "/ws") {
      const roomId = (url.searchParams.get("room") || "").toUpperCase();
      if (!roomId) return new Response("missing room", { status: 400 });
      const stub = env.ROOMS.get(env.ROOMS.idFromName(roomId));
      return stub.fetch(request);
    }
    let pathname = url.pathname === "/" ? "/web/index.html" : url.pathname;
    const assetUrl = new URL(pathname + url.search, url);
    return env.ASSETS.fetch(new Request(assetUrl.toString(), {
      method: "GET",
      headers: request.headers
    }));
  }
};
var Room = class {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.data = null;
  }
  /* ---------- 持久化 ---------- */
  async load() {
    if (this.data) return this.data;
    const saved = await this.ctx.storage.get("room");
    this.data = saved || { id: null, seats: [], started: false, snap: null, createdAt: Date.now(), mode: "standard", strikeTarget: "open" };
    this.data.mode = this.data.mode || "standard";
    this.data.strikeTarget = this.data.strikeTarget === "hidden" ? "hidden" : "open";
    return this.data;
  }
  async save() {
    await this.ctx.storage.put("room", this.data);
  }
  /** 从快照重建游戏实例（DO 休眠唤醒后内存为空） */
  gameFromSnap() {
    if (!this.data.snap) return null;
    return createGame().hydrate(this.data.snap);
  }
  /* ---------- HTTP ---------- */
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/init") {
      await this.load();
      if (!this.data.id) {
        this.data.id = (url.searchParams.get("room") || "").toUpperCase() || null;
        await this.save();
      }
      return new Response("ok");
    }
    if (request.headers.get("Upgrade") === "websocket") {
      await this.load();
      if (!this.data.id) {
        const rid = (url.searchParams.get("room") || "").toUpperCase();
        if (rid) {
          this.data.id = rid;
          await this.save();
        }
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response("not found", { status: 404 });
  }
  /* ---------- 消息 ---------- */
  async webSocketMessage(ws, raw) {
    await this.load();
    let m;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    const att = ws.deserializeAttachment() || {};
    const playerId = att.playerId;
    if (m.t === "hello") {
      if (this.data.started && !m.token) {
        return this.send(ws, { t: "error", msg: "\u5BF9\u5C40\u5DF2\u5F00\u59CB\uFF0C\u65E0\u6CD5\u52A0\u5165" });
      }
      let seat2 = null;
      if (m.token) seat2 = this.data.seats.find((s) => s.token === m.token);
      if (!seat2) {
        if (this.data.started) return this.send(ws, { t: "error", msg: "\u5BF9\u5C40\u5DF2\u5F00\u59CB\uFF0C\u65E0\u6CD5\u52A0\u5165" });
        if (this.data.seats.length >= 9) return this.send(ws, { t: "error", msg: "\u623F\u95F4\u5DF2\u6EE1\uFF08\u6700\u591A 9 \u4EBA\uFF09" });
        const pid = "p" + this.data.seats.length;
        seat2 = {
          playerId: pid,
          token: crypto.randomUUID(),
          name: String(m.name || "").slice(0, 12) || "\u73A9\u5BB6 " + (this.data.seats.length + 1),
          isAI: false
        };
        this.data.seats.push(seat2);
        await this.save();
      }
      seat2.connected = true;
      ws.serializeAttachment({ playerId: seat2.playerId });
      this.send(ws, {
        t: "joined",
        roomId: this.data.id,
        playerId: seat2.playerId,
        token: seat2.token,
        seat: this.data.seats.indexOf(seat2)
      });
      const game = this.gameFromSnap();
      if (this.data.started && game) {
        this.data.snap = game.state();
        await this.save();
        await this.planNext(game);
        const v = viewFor(game, seat2.playerId);
        if (v) v.thinking = !!this.thinking;
        this.send(ws, { t: "state", view: v });
        this.pushState();
      } else this.pushLobby();
      return;
    }
    if (!playerId) return this.send(ws, { t: "error", msg: "\u5C1A\u672A\u8FDB\u5165\u623F\u95F4" });
    const seat = this.data.seats.find((s) => s.playerId === playerId);
    if (!seat) return this.send(ws, { t: "error", msg: "\u5E2D\u4F4D\u4E0D\u5B58\u5728" });
    if (m.t === "start") {
      if (this.data.started) return this.send(ws, { t: "error", msg: "\u5BF9\u5C40\u5DF2\u7ECF\u5F00\u59CB" });
      if (this.data.seats[0].playerId !== playerId) return this.send(ws, { t: "error", msg: "\u53EA\u6709\u623F\u4E3B\u53EF\u4EE5\u5F00\u59CB\u5BF9\u5C40" });
      if (this.data.seats.length < 2) return this.send(ws, { t: "error", msg: "\u81F3\u5C11\u9700\u8981 2 \u540D\u73A9\u5BB6" });
      const game = createGame(this.data.seats.map((s) => s.name), {
        mode: this.data.mode,
        strikeTarget: this.data.strikeTarget
      });
      this.data.started = true;
      this.data.lastAITurn = -1;
      this.data.snap = game.state();
      await this.save();
      await this.planNext(game);
      if (this.env.META) {
        await this.env.META.put(`room:${this.data.id}`, JSON.stringify({
          createdAt: this.data.createdAt,
          players: this.data.seats.length,
          started: true
        }), { expirationTtl: 86400 }).catch(() => {
        });
      }
      this.pushState();
      return;
    }
    if (m.t === "act") {
      const game = this.gameFromSnap();
      if (!game) return this.send(ws, { t: "error", msg: "\u5BF9\u5C40\u5C1A\u672A\u5F00\u59CB" });
      if (game.state().phase === "ended") return this.send(ws, { t: "error", msg: "\u5BF9\u5C40\u5DF2\u7ED3\u675F" });
      const r = this.handleAction(game, playerId, m.action || {});
      if (!r.ok) this.send(ws, { t: "error", msg: r.msg || "\u64CD\u4F5C\u5931\u8D25" });
      this.data.snap = game.state();
      await this.save();
      await this.planNext(game);
      this.pushState();
      return;
    }
    if (m.t === "mode") {
      if (this.data.started) return this.send(ws, { t: "error", msg: "\u5BF9\u5C40\u5DF2\u7ECF\u5F00\u59CB\uFF0C\u65E0\u6CD5\u4FEE\u6539\u89C4\u5219" });
      if (this.data.seats[0] && this.data.seats[0].playerId !== playerId)
        return this.send(ws, { t: "error", msg: "\u53EA\u6709\u623F\u4E3B\u53EF\u4EE5\u4FEE\u6539\u623F\u95F4\u89C4\u5219" });
      this.data.mode = m.mode === "fast" ? "fast" : "standard";
      await this.save();
      this.pushLobby();
      return;
    }
    if (m.t === "strikeTarget") {
      if (this.data.started) return this.send(ws, { t: "error", msg: "\u5BF9\u5C40\u5DF2\u7ECF\u5F00\u59CB\uFF0C\u65E0\u6CD5\u4FEE\u6539\u89C4\u5219" });
      if (this.data.seats[0] && this.data.seats[0].playerId !== playerId)
        return this.send(ws, { t: "error", msg: "\u53EA\u6709\u623F\u4E3B\u53EF\u4EE5\u4FEE\u6539\u623F\u95F4\u89C4\u5219" });
      this.data.strikeTarget = m.value === "hidden" ? "hidden" : "open";
      await this.save();
      this.pushLobby();
      return;
    }
    if (m.t === "addAI") {
      const r = this.addAI(playerId, m.level);
      if (r && r.error) return this.send(ws, { t: "error", msg: r.error });
      await this.save();
      this.pushLobby();
      return;
    }
    if (m.t === "removeAI") {
      const r = this.removeAI(playerId, m.playerId);
      if (r && r.error) return this.send(ws, { t: "error", msg: r.error });
      await this.save();
      this.pushLobby();
      return;
    }
    if (m.t === "leave") {
      await this.removeSeat(playerId);
      return;
    }
    if (m.t === "ping") return this.send(ws, { t: "pong", ts: Date.now() });
  }
  async webSocketClose(ws) {
    await this.load();
    const att = ws.deserializeAttachment() || {};
    if (att.playerId) {
      const seat = this.data.seats.find((s) => s.playerId === att.playerId);
      if (seat) seat.connected = false;
      await this.save();
      this.data.started ? this.pushState() : this.pushLobby();
    }
    try {
      ws.close();
    } catch {
    }
  }
  async webSocketError(ws) {
    await this.webSocketClose(ws);
  }
  /* ---------- 动作分发 ---------- */
  handleAction(game, playerId, a) {
    switch (a.type) {
      case "build":
        return game.playBuild(playerId, a.uid);
      case "broadcast":
        return game.playBroadcast(playerId, a.uid, a.galaxy);
      case "strike":
        return game.playStrike(playerId, a.uid, a.galaxy);
      case "discard":
        return game.discardCards(playerId, a.uids || []);
      case "end":
        return game.endTurn(playerId);
      case "withdraw":
        return game.withdrawStrike(playerId, a.uid);
      case "respond": {
        const r = game.setResponse(playerId, a.uid || null, a.face || null);
        if (r.ok && r.complete) return game.finalizeBroadcast();
        return r;
      }
      case "choose":
        return game.chooseResponder(a.targetId, playerId);
      case "escape":
        return game.chooseEscape(playerId, !!a.use);
      default:
        return { ok: false, msg: "\u672A\u77E5\u52A8\u4F5C" };
    }
  }
  /* ---------- 人机 ---------- */
  addAI(byPlayerId, level) {
    if (this.data.started) return { error: "\u5BF9\u5C40\u5DF2\u5F00\u59CB\uFF0C\u65E0\u6CD5\u6DFB\u52A0\u4EBA\u673A" };
    const host = this.data.seats[0];
    if (!host || host.playerId !== byPlayerId) return { error: "\u53EA\u6709\u623F\u4E3B\u53EF\u4EE5\u6DFB\u52A0\u4EBA\u673A" };
    if (this.data.seats.length >= 9) return { error: "\u623F\u95F4\u5DF2\u6EE1\uFF08\u6700\u591A 9 \u4EBA\uFF09" };
    const lv = LEVELS[level] ? level : "chaotic_era";
    this.data.aiSeq = (this.data.aiSeq || 0) + 1;
    const n = this.data.aiSeq;
    this.data.seats.push({
      playerId: "p" + this.data.seats.length,
      token: null,
      name: `${LEVELS[lv].name}\xB7${n}\u53F7`,
      isAI: true,
      aiLevel: lv,
      aiSeed: crypto.getRandomValues(new Uint32Array(1))[0] % 2e9 + 1,
      connected: true
    });
    return { ok: true };
  }
  removeAI(byPlayerId, targetId) {
    if (this.data.started) return { error: "\u5BF9\u5C40\u5DF2\u5F00\u59CB\uFF0C\u65E0\u6CD5\u79FB\u9664\u4EBA\u673A" };
    const host = this.data.seats[0];
    if (!host || host.playerId !== byPlayerId) return { error: "\u53EA\u6709\u623F\u4E3B\u53EF\u4EE5\u79FB\u9664\u4EBA\u673A" };
    const seat = this.data.seats.find((s) => s.playerId === targetId && s.isAI);
    if (!seat) return { error: "\u6CA1\u6709\u8FD9\u4E2A\u4EBA\u673A" };
    this.data.seats = this.data.seats.filter((s) => s !== seat);
    this.data.seats.forEach((s, i) => {
      s.playerId = "p" + i;
    });
    return { ok: true };
  }
  /** 驱动人机（DO 内同步执行：一次请求里把 AI 回合全部走完） */
  aiSeats() {
    const seats = /* @__PURE__ */ new Map();
    this.data.seats.forEach((s) => {
      if (s.isAI) seats.set(s.playerId, { level: s.aiLevel || "chaotic_era", seed: s.aiSeed || 1 });
    });
    return seats;
  }
  /** 人机思考时长（毫秒）：默认 5–10 秒，可用环境变量调 */
  thinkMs() {
    const min = Number(this.env && this.env.AI_THINK_MIN || 5e3);
    const max = Number(this.env && this.env.AI_THINK_MAX || 1e4);
    return min + Math.floor(Math.random() * Math.max(0, max - min));
  }
  /** 走一步人机；返回这一步的动作（没有动作则空数组） */
  stepAI(game) {
    const seats = this.aiSeats();
    if (!seats.size) return [];
    try {
      return runAI(game, seats, viewFor, { maxSteps: 1 }) || [];
    } catch (e) {
      console.error("ai error", e && e.stack);
      return [];
    }
  }
  /** 当前是否该人机动手（他的回合，或广播里有他还没回应） */
  aiPending(game) {
    const seats = this.aiSeats();
    if (!seats.size) return false;
    const S = game.state();
    if (S.phase !== "playing") return false;
    if (S.escapePending) return seats.has(S.escapePending.targetId);
    const cur = S.players[S.currentIdx];
    if (cur && seats.has(cur.id)) return true;
    const B = S.broadcast;
    if (B) {
      return B.candidates.some((c) => seats.has(c.playerId) && !Object.prototype.hasOwnProperty.call(B.responses, c.playerId));
    }
    return false;
  }
  /**
   * 决定下一次唤醒时间并设置 alarm。
   * - 有人在等回应 / 有飞行中的打击：按广播截止时间
   * - 该人机动手：按思考时长（同一回合内连着的第二个动作只等 1–2 秒）
   */
  async scheduleNext(game, opts) {
    const o = opts || {};
    if (!this.ctx.storage.setAlarm) return;
    const now = Date.now();
    const S = game.state();
    let when = null;
    if (o.aiDelay != null) when = now + Math.max(400, o.aiDelay);
    const B = S.broadcast;
    if (B) {
      const d = B.stage === "choosing" ? B.chooseDeadline || B.deadline : B.deadline;
      if (d) when = when == null ? d : Math.min(when, d);
    }
    if (S.escapePending && S.escapePending.deadline) {
      when = when == null ? S.escapePending.deadline : Math.min(when, S.escapePending.deadline);
    }
    if (when == null) return;
    await this.ctx.storage.setAlarm(Math.max(now + 200, when));
  }
  /** 一步走完后的统一收尾：存盘、推送、排下一次 */
  async afterStep(game) {
    this.data.snap = game.state();
    await this.save();
    this.pushState();
    await this.planNext(game);
  }
  async planNext(game) {
    const S = game.state();
    if (S.phase !== "playing") return;
    if (this.aiPending(game)) {
      const cur = S.players[S.currentIdx];
      const seats = this.aiSeats();
      const sameTurn = seats.has(cur.id) && this.data.lastAITurn === S.turnIndex;
      this.thinking = true;
      this.data.lastAITurn = S.turnIndex;
      await this.scheduleNext(game, { aiDelay: sameTurn ? 1200 + Math.random() * 800 : this.thinkMs() });
    } else {
      this.thinking = false;
      await this.scheduleNext(game, {});
    }
  }
  /** alarm 到点：先结算广播超时，再走一步人机 */
  async alarm() {
    await this.load();
    const game = this.gameFromSnap();
    if (!game || !this.data.started) return;
    const r = game.tickBroadcast(Date.now());
    const re = game.tickEscape(Date.now());
    const played = this.stepAI(game);
    this.thinking = false;
    if (r.changed || re.changed || played.length) {
      await this.afterStep(game);
    } else {
      await this.planNext(game);
    }
  }
  async removeSeat(playerId) {
    const seat = this.data.seats.find((s) => s.playerId === playerId);
    if (!seat) return;
    seat.connected = false;
    if (!this.data.started) {
      this.data.seats = this.data.seats.filter((s) => s !== seat);
      this.data.seats.forEach((s, i) => {
        s.playerId = "p" + i;
      });
      await this.save();
      this.pushLobby();
    } else {
      await this.save();
      this.pushState();
    }
  }
  /* ---------- 推送 ---------- */
  send(ws, obj) {
    try {
      ws.send(JSON.stringify(obj));
    } catch {
    }
  }
  pushState() {
    const game = this.gameFromSnap();
    if (!game) return;
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment();
      if (!att || !att.playerId) continue;
      try {
        const v = viewFor(game, att.playerId);
        if (v) v.thinking = !!this.thinking;
        ws.send(JSON.stringify({ t: "state", view: v }));
      } catch {
      }
    }
  }
  pushLobby() {
    const summary = {
      roomId: this.data.id,
      hostId: this.data.seats[0] ? this.data.seats[0].playerId : null,
      started: this.data.started,
      mode: this.data.mode || "standard",
      strikeTarget: this.data.strikeTarget === "hidden" ? "hidden" : "open",
      seats: this.data.seats.map((s) => ({
        playerId: s.playerId,
        name: s.name,
        connected: s.connected !== false,
        isAI: !!s.isAI,
        aiLevel: s.aiLevel || null
      })),
      levels: Object.values(LEVELS).map((l) => ({ key: l.key, name: l.name, blurb: l.blurb, retention: l.retention }))
    };
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment();
      if (!att || !att.playerId) continue;
      try {
        ws.send(JSON.stringify({ t: "lobby", room: summary, you: att.playerId }));
      } catch {
      }
    }
  }
};
export {
  Room,
  index_default as default
};
