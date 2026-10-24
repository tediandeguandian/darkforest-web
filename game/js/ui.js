/* ============================================================
 * ui.js — 渲染与交互
 * ============================================================ */

const UI = {
  selected: new Set(),
  targetGalaxy: null,
  godMode: true,
  modal: null,
  responseDraft: {},
  arrowEls: {},
  lastArrowKey: null,
};

const $ = sel => document.querySelector(sel);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
};
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtDist = d => d === INF ? '∞' : d;

/* ---------- 开局 ---------- */
function renderSetup() {
  const root = $('#app');
  root.innerHTML = '';
  const box = el('div', 'setup');
  box.innerHTML = `
    <h1>三体 · 黑暗森林</h1>
    <p class="sub">基础规则版 · 无 AI · 本地热座</p>
    <div class="setup-row">
      <label>玩家人数</label>
      <input id="pcount" type="range" min="2" max="9" value="4" />
      <span id="pcountVal">4</span>
    </div>
    <div id="names" class="names"></div>
    <div class="setup-actions">
      <button class="btn primary" id="startBtn">开始对局</button>
      <button class="btn" id="rulesBtn">查看规则速查</button>
    </div>
    <p class="hint">每个星系只存在一个玩家 · 坐标随机且互不重复 · 牌库 64 张</p>
  `;
  root.appendChild(box);

  const namesWrap = $('#names');
  const buildNames = n => {
    namesWrap.innerHTML = '';
    for (let i = 0; i < n; i++) {
      const inp = el('input', 'name-input');
      inp.value = '玩家 ' + (i + 1);
      inp.dataset.idx = i;
      namesWrap.appendChild(inp);
    }
  };
  buildNames(4);

  $('#pcount').addEventListener('input', e => {
    $('#pcountVal').textContent = e.target.value;
    buildNames(+e.target.value);
  });
  $('#startBtn').addEventListener('click', () => {
    const names = [...namesWrap.querySelectorAll('input')].map((inp, i) => inp.value.trim() || ('玩家 ' + (i + 1)));
    Engine.newGame(names);
    UI.selected.clear(); UI.targetGalaxy = null; UI.modal = null;
    render();
  });
  $('#rulesBtn').addEventListener('click', () => window.open('../三体黑暗森林桌游规则速查.html', '_blank'));
}

/* ---------- 主渲染 ---------- */
function render() {
  const S = Engine.getState();
  if (!S) return renderSetup();

  const app = $('#app');
  const scrollLog = $('.log-list')?.scrollTop || 0;

  app.innerHTML = `
    <header class="topbar">
      <div class="brand">三体 · 黑暗森林 <span class="tag">基础版</span></div>
      <div class="turninfo" id="turninfo"></div>
      <div class="topactions">
        <label class="switch"><input type="checkbox" id="godToggle" ${UI.godMode ? 'checked' : ''}/> 上帝视角</label>
        <button class="btn small" id="newGameBtn">新对局</button>
      </div>
    </header>
    <main class="layout">
      <section class="col-left" id="players"></section>
      <section class="col-center">
        <div class="map-wrap" id="map"></div>
        <div class="hand-wrap" id="hand"></div>
      </section>
      <section class="col-right">
        <div class="panel discard-panel" id="discard"></div>
        <div class="panel log-panel">
          <div class="panel-title">事件日志</div>
          <div class="log-list" id="log"></div>
        </div>
      </section>
    </main>
    <div class="modal-root" id="modalRoot"></div>
    <svg class="arrow-layer" id="arrowLayer"></svg>
  `;

  renderTurnInfo(S);
  renderPlayers(S);
  renderMap(S);
  renderHand(S);
  renderDiscard(S);
  renderLog(S);
  renderModal(S);

  $('#godToggle').addEventListener('change', e => { UI.godMode = e.target.checked; render(); });
  $('#newGameBtn').addEventListener('click', () => {
    if (confirm('确定放弃当前对局，开始新的一局？')) { Engine.newGame([]); Engine.getState() && renderSetup(); }
  });

  const logEl = $('#log');
  if (logEl) logEl.scrollTop = scrollLog;
  requestAnimationFrame(() => drawArrow());
}

function renderTurnInfo(S) {
  const p = Engine.currentPlayer();
  const stepMap = { production: '生产', action: '行动', supply: '补给' };
  $('#turninfo').innerHTML = `
    <span class="chip">回合 ${S.turnIndex}</span>
    <span class="chip cur">当前：${esc(p ? p.name : '—')}</span>
    <span class="chip stage">${stepMap[S.step] || ''}阶段</span>
    ${S.broadcast ? '<span class="chip warn-chip">广播待结算</span>' : ''}
  `;
}

function renderPlayers(S) {
  const wrap = $('#players');
  wrap.innerHTML = `<div class="panel-title">文明</div>`;
  const meNow = Engine.currentPlayer();
  S.players.forEach((p, i) => {
    const isCur = i === S.currentIdx && p.alive;
    const isSelf = meNow && p.id === meNow.id;
    const card = el('div', 'player-card' + (isCur ? ' current' : '') + (p.alive ? '' : ' dead'));
    card.dataset.pid = p.id;
    const galaxyLabel = (UI.godMode || isSelf)
      ? `<span class="gal">${p.galaxy} · ${GALAXY_NAMES[p.galaxy]}${isSelf && !UI.godMode ? '（你）' : ''}</span>`
      : `<span class="gal dim">坐标保密</span>`;
    const builds = p.buildZone.map(c => `<span class="mini" title="${esc(CARD_DEFS[c.key].desc)}">${CARD_DEFS[c.key].short}</span>`).join('');
    const strikes = p.strikes.filter(s => !s.resolved).map(s => {
      const def = CARD_DEFS[s.key];
      return `<span class="mini strike" title="${esc(def.name)} → ${GALAXY_NAMES[s.targetGalaxy]}">${def.short} ${s.progress}/${s.required}</span>`;
    }).join('');
    card.innerHTML = `
      <div class="pc-head">
        <span class="pname">${esc(p.name)}</span>
        ${p.alive ? '' : '<span class="badge dead">淘汰</span>'}
      </div>
      <div class="pc-row">${galaxyLabel}<span class="energy">⚡ ${p.energy}</span></div>
      <div class="pc-row small">手牌 ${p.hand.length} · 建设 ${p.buildZone.length}</div>
      <div class="pc-builds">${builds || '<span class="dim">无建设</span>'}</div>
      <div class="pc-strikes">${strikes || ''}</div>
    `;
    if (p.alive && isCur && S.step === 'action') card.classList.add('active');
    wrap.appendChild(card);
  });
}

/* ---------- 星图 ---------- */
function renderMap(S) {
  const wrap = $('#map');
  const W = 600, H = 458;
  const pos = g => GALAXY_POS[g];

  const me = Engine.currentPlayer();
  const selCard = UI.selected.size === 1 ? me?.hand.find(c => c.uid === [...UI.selected][0]) : null;
  const selDef = selCard ? CARD_DEFS[selCard.key] : null;
  const reachable = selDef && (selDef.type === 'broadcast')
    ? new Set(Engine.validBroadcastTargets(me.id, selCard.uid))
    : null;

  let svg = `<svg viewBox="0 0 ${W} ${H}" class="starmap">`;
  // 连线
  const drawn = new Set();
  for (const [a, list] of Object.entries(ADJACENCY)) {
    for (const b of list) {
      const k = Math.min(a, b) + '-' + Math.max(a, b);
      if (drawn.has(k)) continue;
      drawn.add(k);
      const p1 = pos(+a), p2 = pos(+b);
      svg += `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" class="edge"/>`;
    }
  }
  // 星系
  for (let g = 1; g <= 9; g++) {
    const { x, y } = pos(g);
    const m = S.markers[g];
    const occupants = S.players.filter(p => p.alive && p.galaxy === g);
    const occupied = occupants.length > 0;
    const isTarget = UI.targetGalaxy === g;
    const canPick = reachable ? reachable.has(g) : true;
    const classes = ['node', isTarget ? 'target' : '', occupied ? 'occupied' : '', canPick ? '' : 'far'].join(' ');
    svg += `<g class="${classes}" data-g="${g}">`;
    svg += `<circle cx="${x}" cy="${y}" r="30" class="node-bg"/>`;
    svg += `<text x="${x}" y="${y - 3}" class="node-num">${g}</text>`;
    svg += `<text x="${x}" y="${y + 15}" class="node-name">${esc(GALAXY_NAMES[g])}</text>`;
    // 标记
    let mx = x - 22;
    if (m.black) { svg += `<circle cx="${mx}" cy="${y - 30}" r="5" class="marker black"/>`; mx += 12; }
    if (m.purple) { svg += `<circle cx="${mx}" cy="${y - 30}" r="5" class="marker purple"/>`; mx += 12; }
    if (m.red) { svg += `<circle cx="${mx}" cy="${y - 30}" r="5" class="marker red"/>`; }
    // 占位者
    if (occupied && UI.godMode) {
      svg += `<text x="${x}" y="${y + 47}" class="node-owner">${esc(occupants[0].name)}</text>`;
    } else if (occupied) {
      svg += `<text x="${x}" y="${y + 47}" class="node-owner">?</text>`;
    }
    svg += `</g>`;
  }
  svg += `</svg>`;
  wrap.innerHTML = `<div class="panel-title">星图 <span class="dim small">（点击选择目标星系）</span></div>` + svg;

  wrap.querySelectorAll('.node').forEach(node => {
    node.addEventListener('click', () => {
      const g = +node.dataset.g;
      UI.targetGalaxy = (UI.targetGalaxy === g) ? null : g;
      render();
    });
  });
}

/* ---------- 手牌 ---------- */
function renderHand(S) {
  const wrap = $('#hand');
  const p = Engine.currentPlayer();
  if (!p) { wrap.innerHTML = ''; return; }

  const canAct = S.step === 'action' && !S.broadcast && p.alive;
  let html = `<div class="panel-title">${esc(p.name)} 的手牌 <span class="dim small">（能量 ${p.energy}）</span></div>`;
  html += `<div class="cards">`;
  p.hand.forEach(c => {
    const def = CARD_DEFS[c.key];
    const sel = UI.selected.has(c.uid);
    const affordable = p.energy >= def.cost;
    html += `
      <div class="card ${def.type} ${sel ? 'selected' : ''} ${affordable ? '' : 'unaffordable'}" data-uid="${c.uid}">
        <div class="card-top">
          <span class="cost">⚡${def.cost}</span>
          <span class="ctype">${def.type === 'broadcast' ? '广播' : def.type === 'strike' ? '打击' : '建设'}</span>
        </div>
        <div class="card-name">${esc(def.name)}</div>
        <div class="card-meta">${def.type === 'broadcast' ? '距离 ' + fmtDist(def.dist) : def.type === 'strike' ? '等级 ' + fmtDist(def.level) : ''}</div>
        <div class="card-desc">${esc(def.desc)}</div>
      </div>`;
  });
  html += `</div>`;

  // 操作区
  const selCards = [...UI.selected].map(u => p.hand.find(c => c.uid === u)).filter(Boolean);
  const types = new Set(selCards.map(c => CARD_DEFS[c.key].type));
  html += `<div class="actions">`;
  if (canAct) {
    if (selCards.length === 1 && types.has('build')) {
      html += `<button class="btn primary" id="actBuild">建造「${CARD_DEFS[selCards[0].key].short}」</button>`;
    }
    if (selCards.length === 1 && types.has('broadcast')) {
      const ok = UI.targetGalaxy && Engine.validBroadcastTargets(p.id, selCards[0].uid).includes(UI.targetGalaxy);
      html += `<button class="btn primary" id="actBroadcast" ${ok ? '' : 'disabled'}>发布广播${UI.targetGalaxy ? ' → ' + GALAXY_NAMES[UI.targetGalaxy] : '（先选星系）'}</button>`;
    }
    if (selCards.length === 1 && types.has('strike')) {
      html += `<button class="btn danger" id="actStrike" ${UI.targetGalaxy ? '' : 'disabled'}>发射打击${UI.targetGalaxy ? ' → ' + GALAXY_NAMES[UI.targetGalaxy] : '（先选星系）'}</button>`;
    }
    html += `<button class="btn" id="actDiscard" ${selCards.length ? '' : 'disabled'}>弃置 ${selCards.length || ''} 张</button>`;
    html += `<button class="btn ghost" id="actEnd">结束回合</button>`;
  } else if (S.broadcast) {
    html += `<span class="hint">等待广播结算……</span>`;
  }
  html += `</div>`;
  wrap.innerHTML = html;

  wrap.querySelectorAll('.card').forEach(cardEl => {
    cardEl.addEventListener('click', () => {
      if (!canAct) return;
      const u = cardEl.dataset.uid;
      if (UI.selected.has(u)) UI.selected.delete(u); else UI.selected.add(u);
      render();
    });
  });

  const bind = (id, fn) => { const b = $('#' + id); if (b) b.addEventListener('click', fn); };
  bind('actBuild', () => {
    const r = Engine.playBuild(p.id, [...UI.selected][0]);
    if (!r.ok) return toast(r.msg);
    UI.selected.clear(); render();
  });
  bind('actBroadcast', () => {
    const r = Engine.playBroadcast(p.id, [...UI.selected][0], UI.targetGalaxy);
    if (!r.ok) return toast(r.msg);
    UI.selected.clear(); UI.targetGalaxy = null;
    const B = Engine.getState().broadcast;
    if (B && B.stage === 'collecting') openResponseModal();
    render();
  });
  bind('actStrike', () => {
    const r = Engine.playStrike(p.id, [...UI.selected][0], UI.targetGalaxy);
    if (!r.ok) return toast(r.msg);
    UI.selected.clear(); UI.targetGalaxy = null; render();
  });
  bind('actDiscard', () => {
    const r = Engine.discardCards(p.id, [...UI.selected]);
    if (!r.ok) return toast(r.msg);
    UI.selected.clear(); render();
  });
  bind('actEnd', () => {
    if (S.broadcast) return toast('请先结算当前广播');
    const r = Engine.endTurn();
    UI.selected.clear(); UI.targetGalaxy = null;
    render();
  });
}

/* ---------- 弃牌堆 ---------- */
function renderDiscard(S) {
  const wrap = $('#discard');
  const arrow = S.arrow;
  const alive = arrow && (Date.now() - arrow.at < 15000);

  const chip = (d, zone) => {
    const def = CARD_DEFS[d.key];
    const f = cardFacts(d.key);
    const hot = alive && arrow.uids.includes(d.uid);
    const tip = `${def.name}｜⚡${f.cost}｜${f.main}｜${f.sub}｜${def.desc}`;
    return `<div class="dchip ${def.type}${hot ? ' arrowed' : ''}" data-uid="${d.uid}" data-zone="${zone}" title="${esc(tip)}">
      <div class="dc-top"><span class="dc-name">${esc(def.short)}</span><span class="dc-cost">⚡${f.cost}</span></div>
      <div class="dc-meta"><span class="dc-eff">${esc(f.main)}</span><span class="dc-sub">${esc(f.sub)}</span></div>
      <div class="dc-desc">${esc(def.desc)}</div>
    </div>`;
  };
  const listHtml = (list, zone) => list.map(d => chip(d, zone)).join('') || '<span class="dim small">空</span>';

  wrap.innerHTML = `
    <div class="panel-title">弃牌堆 <span class="dim small">匿名 · 点牌看说明</span></div>
    <div class="dzone">
      <div class="dzone-label">本回合 <b>${S.discard.current.length}</b></div>
      <div class="dlist" id="dlCurrent">${listHtml(S.discard.current, 'current')}</div>
    </div>
    <div class="dzone">
      <div class="dzone-label">上一回合 <b>${S.discard.last.length}</b> <span class="dim small">（本回合结束后洗回）</span></div>
      <div class="dlist" id="dlLast">${listHtml(S.discard.last, 'last')}</div>
    </div>
  `;

  wrap.querySelectorAll('.dchip').forEach(c => {
    c.addEventListener('click', () => {
      const open = c.classList.contains('expanded');
      wrap.querySelectorAll('.dchip.expanded').forEach(x => x.classList.remove('expanded'));
      if (!open) c.classList.add('expanded');
    });
  });
}

/* ---------- 日志 ---------- */
function renderLog(S) {
  const wrap = $('#log');
  wrap.innerHTML = S.log.map(l => `<div class="logline ${l.kind}"><span class="lt">T${l.turn}</span>${esc(l.text)}</div>`).join('');
}

/* ---------- 箭头（15 秒保底） ---------- */
function drawArrow() {
  const S = Engine.getState();
  const layer = $('#arrowLayer');
  if (!S || !layer) return;
  const arrow = S.arrow;
  if (!arrow) { layer.innerHTML = ''; return; }

  const elapsed = Date.now() - arrow.at;
  const HOLD = 15000, FADE = 1200;
  if (elapsed > HOLD + FADE) { layer.innerHTML = ''; return; }

  const from = document.querySelector(`.player-card[data-pid="${arrow.playerId}"]`);
  const targets = [...document.querySelectorAll('.dchip.arrowed')];
  if (!from || !targets.length) { layer.innerHTML = ''; return; }

  const o1 = from.getBoundingClientRect();
  const x1 = o1.right, y1 = o1.top + o1.height / 2;
  const op = elapsed <= HOLD ? 1 : Math.max(0, 1 - (elapsed - HOLD) / FADE);

  const paths = targets.map(t => {
    const o2 = t.getBoundingClientRect();
    const x2 = o2.left, y2 = o2.top + o2.height / 2;
    const mx = (x1 + x2) / 2;
    return `<path d="M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}"
      fill="none" stroke="rgba(232,182,76,${0.85 * op})" stroke-width="2"
      marker-end="url(#arrowHead)" opacity="${op}"/>`;
  }).join('');

  layer.innerHTML = `<defs><marker id="arrowHead" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L6,3 L0,6 z" fill="rgba(232,182,76,${0.85 * op})"/></marker></defs>${paths}`;

  requestAnimationFrame(() => drawArrow());
}

/* ---------- 广播响应弹窗 ---------- */
function openResponseModal() {
  const S = Engine.getState();
  const B = S.broadcast;
  if (!B) return;
  // 强制回应者设为 undefined（必须选）；其余默认 null（不回应）
  UI.responseDraft = {};
  B.candidates.forEach(c => { UI.responseDraft[c.playerId] = c.mandatory ? undefined : null; });
  UI.modal = { type: 'response' };
  renderModal(S);
}

function renderModal(S) {
  const root = $('#modalRoot');
  if (!root) return;
  const B = S.broadcast;

  if (S.phase === 'ended') {
    const winner = S.winner ? S.players.find(p => p.id === S.winner) : null;
    root.innerHTML = `<div class="modal-mask"><div class="modal">
      <h2>${winner ? esc(winner.name) + ' 成为最后的幸存者' : '所有文明均被清理'}</h2>
      <p class="dim">全场无赢家，黑暗森林里没有真正的胜利。</p>
      <div class="modal-actions"><button class="btn primary" onclick="location.reload()">再来一局</button></div>
    </div></div>`;
    return;
  }

  if (!B) { root.innerHTML = ''; return; }

  if (B.stage === 'collecting') {
    const caster = S.players.find(p => p.id === B.casterId);
    const rows = B.candidates.map(c => {
      const p = S.players.find(x => x.id === c.playerId);
      const chosen = UI.responseDraft[c.playerId];
      const opts = c.options.map(o => {
        const def = CARD_DEFS[o.key];
        const on = chosen && chosen.uid === o.uid;
        return `<button class="opt ${on ? 'on' : ''}" data-pid="${c.playerId}" data-uid="${o.uid}" data-face="${o.face}">
          ${def.short}（${o.face === 'coop' ? '合作' : '伪装'}）
          <span class="opt-meta">距离 ${fmtDist(def.dist)} · ⚡${def.cost}</span>
        </button>`;
      }).join('');
      return `<div class="resp-row">
        <div class="resp-name">${esc(p.name)}
          ${c.mandatory ? '<span class="badge warn">强制</span>' : ''}
          ${c.canDecline ? '<span class="badge">可沉默·监听基地</span>' : ''}
        </div>
        <div class="resp-opts">
          ${opts}
          ${c.mandatory
            ? `<button class="opt locked" disabled>不回应<span class="opt-meta">被点名 · 不可弃权</span></button>`
            : `<button class="opt ghost ${chosen === null ? 'on' : ''}" data-pid="${c.playerId}" data-uid="">不回应<span class="opt-meta">放弃本次回应</span></button>`}
        </div>
      </div>`;
    }).join('');

    const missing = B.candidates.some(c => c.mandatory && !UI.responseDraft[c.playerId]);

    root.innerHTML = `<div class="modal-mask"><div class="modal wide">
      <h2>广播响应</h2>
      <p class="dim">${esc(caster.name)} 发布了「${CARD_DEFS[B.card.key].name}」，目标星系 <b>${GALAXY_NAMES[B.targetGalaxy]}</b>。以下玩家可以回应：</p>
      ${rows || '<p class="dim">无人可以回应</p>'}
      <p class="dim small">带「强制」标记的玩家<b>必须回应，不能弃权</b>（建有监听基地者除外）；其余玩家可以「不回应」。</p>
      <div class="modal-actions">
        <button class="btn primary" id="submitResp" ${missing ? 'disabled' : ''}>
          提交响应
        </button>
      </div>
    </div></div>`;

    root.querySelectorAll('.opt[data-pid]').forEach(btn => {
      btn.addEventListener('click', () => {
        const pid = btn.dataset.pid, uid = btn.dataset.uid;
        UI.responseDraft[pid] = uid ? { uid, face: btn.dataset.face } : null;
        renderModal(Engine.getState());
      });
    });
    $('#submitResp')?.addEventListener('click', () => {
      const r = Engine.submitResponses(UI.responseDraft);
      if (!r.ok) return toast(r.msg);
      UI.modal = null;
      const B2 = Engine.getState().broadcast;
      if (B2 && B2.stage === 'choosing') UI.modal = { type: 'choose' };
      render();
    });
    return;
  }

  if (B.stage === 'choosing') {
    const caster = S.players.find(p => p.id === B.casterId);
    const resp = Object.entries(B.responses).filter(([, v]) => v);
    const rows = resp.map(([pid, r]) => {
      const p = S.players.find(x => x.id === pid);
      const label = (r.key && CARD_DEFS[r.key]) ? CARD_DEFS[r.key].short : '广播牌';
      return `<button class="choose-row" data-pid="${pid}">
        <span>${esc(p.name)}</span>
        <span class="dim">${label} · ${r.face === 'coop' ? '合作' : '伪装'}</span>
      </button>`;
    }).join('');
    root.innerHTML = `<div class="modal-mask"><div class="modal">
      <h2>选择结算对象</h2>
      <p class="dim">多名玩家回应，由 ${esc(caster.name)} 挑选其中一名结算，其余收回广播牌。</p>
      ${rows}
    </div></div>`;
    root.querySelectorAll('.choose-row').forEach(btn => {
      btn.addEventListener('click', () => {
        Engine.chooseResponder(btn.dataset.pid);
        UI.modal = null; render();
      });
    });
    return;
  }

  root.innerHTML = '';
}

/* ---------- 提示 ---------- */
let toastTimer = null;
function toast(msg) {
  let t = $('#toast');
  if (!t) { t = el('div', 'toast'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ---------- 定时刷新（箭头/能量） ---------- */
setInterval(() => {
  const S = Engine.getState();
  if (!S || S.phase !== 'playing') return;
  if (S.arrow && Date.now() - S.arrow.at < 16500) drawArrow();
}, 500);

window.addEventListener('DOMContentLoaded', () => render());
