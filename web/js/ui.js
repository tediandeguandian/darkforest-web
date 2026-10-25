/* ============================================================
 * web/js/ui.js — 联机版渲染与交互
 * 数据源：Net.view（服务端裁剪后的视图）
 * ============================================================ */

const UI = {
  selected: new Set(),
  targetGalaxy: null,
  arrowKey: null,
  apk: null,           // /download/apk.json 的内容（版本 / 体积），拿到过一次就缓存
  pref: null,          // 界面偏好 { frost, level }：毛玻璃开关与浓度
  desktop: null,       // /download/desktop.json：Windows 版下载入口
  updateDownloaded: null,  // 本次会话里已经下好的更新包文件名（再点就走「直接安装」）
  energySeq: null,     // 已展示过的最大能量事件 id，用于判重
  strikeSeq: null,     // 已展示过的最大"打击落地"事件 id（隐藏目标模式的落点播报）
  strikeReveal: null,  // { text, sub, until }：落地瞬间的落点横幅
  turnKey: null,       // 当前回合标识（turnIndex + 当前玩家），用于检测换人
  gate: null,          // 换人时的 3 秒提示 { name, mine, until }

  /* ---- 动效用的比对游标 ----
     renderGame() 每次操作都重建整块 DOM，纯 CSS 动画会跟着每次重绘重播
     （选一张牌，整手牌都重新"发"一遍）。所以这里记住上一帧看到了什么，
     只在"多出来的那部分"上打标记，让动画只播一次。 */
  scene: null,         // 'entry' | 'lobby' | 'game'：场景切换时才播入场
  sceneTimer: null,    // 入场动画的收尾定时器（播完就摘掉 scene-in）
  logOpen: false,      // 战报抽屉是否展开（重绘时要恢复）
  seenHand: null,      // Set(uid)：已见过的牌，用于判断哪张是刚摸到的
  prevSel: null,       // Set(uid)：上一帧选中的牌，用于区分"选中"和"取消选中"
  discardSig: undefined, // 弃牌堆的 uid 串，变了才让新的一摞落下
  dimmedSet: null,     // Set(galaxy)：上一帧已被降维的星系
  logTop: null,        // 上一帧最新一条战报的标识
  calloutHTML: null,   // 上一帧中央提示的内容，变了才播换字动画
  seatSet: null,       // Set(pid)：大厅里已出现过的席位
  deckCount: null,     // 上一帧牌库数，变了让数字跳一下
};

const $ = s => document.querySelector(s);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
};
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtDist = d => d === INF ? '∞' : d;
const shortGalaxy = g => (GALAXY_NAMES[g] || '').replace(/座|系$|旋臂/g, '').slice(0, 4);
/* 全站统一：星系一律「序号 · 名称」，避免只写名字时对不上号 */
const galLabel = g => (g == null ? '—' : `${g} · ${GALAXY_NAMES[g] || ''}`);
const galShort = g => (g == null ? '—' : `${g}·${shortGalaxy(g)}`);
/* 粗略估算 SVG 文本宽度：中文按字宽算，其余按 0.55 字宽 */
const svgTextWidth = (s, fs) => [...String(s)].reduce(
  (w, ch) => w + (/[\u4e00-\u9fa5]/.test(ch) ? fs : fs * 0.55), 0);

/* ---------- 设置齿轮（入口页与房间页共用同一个图标） ---------- */
const GEAR = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7"
      stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/>
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.11A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.7 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.11A1.7 1.7 0 0 0 4.7 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.7a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.11A1.7 1.7 0 0 0 15 4.7a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.3 9v.11A1.7 1.7 0 0 0 20.86 10H21a2 2 0 1 1 0 4h-.11A1.7 1.7 0 0 0 19.4 15z"/></svg>`;

/* ============================================================
 * 界面偏好：毛玻璃开关 + 浓度（只影响本机，存 localStorage）
 * 浓度同时驱动两件事——面板的不透明度、背景的模糊半径。
 * 只调其中一个都不像毛玻璃：只降透明度会花，只加模糊会糊成一块。
 * ============================================================ */
const UI_PREF_KEY = 'df_ui_pref';
const UI_PREF_DEFAULT = { frost: true, level: 0, motion: true };

function loadUiPref() {
  try {
    const raw = localStorage.getItem(UI_PREF_KEY);
    if (!raw) return { ...UI_PREF_DEFAULT };
    const o = JSON.parse(raw) || {};
    const lv = Number(o.level);
    return {
      frost: o.frost !== false,
      level: Number.isFinite(lv) ? Math.min(1, Math.max(0, lv)) : UI_PREF_DEFAULT.level,
      motion: o.motion !== false,
    };
  } catch (e) {
    return { ...UI_PREF_DEFAULT };   // 隐私模式 / 存储被禁：退回默认，不报错
  }
}

function saveUiPref(pref) {
  try { localStorage.setItem(UI_PREF_KEY, JSON.stringify(pref)); } catch (e) { /* 存不了就算了 */ }
}

function applyUiPref(pref) {
  UI.pref = pref;
  if (typeof document === 'undefined' || !document.body) return;
  const b = document.body;
  b.classList.toggle('frost', !!pref.frost);
  b.classList.toggle('no-motion', pref.motion === false);   // 关掉动效：退化成瞬间完成
  if (!pref.frost) return;                      // 关掉就走实色面板，变量留着下次用
  const lv = pref.level;
  // 面板不透明度 0.40 → 0.95。区间给足，否则牌桌上的变化看不出来
  // （牌桌底图是星空，本来就很暗，0.7 以上的不透明度和实色几乎没差别）
  b.style.setProperty('--frost-a', (0.40 + lv * 0.55).toFixed(3));
  b.style.setProperty('--frost-blur', (6 + lv * 16).toFixed(1) + 'px');  // 6 → 22
}

/* 入口页的齿轮：改名字 + 毛玻璃开关 + 浓度 */
function openPrefModal() {
  document.getElementById('prefModal')?.remove();
  const pref = { ...(UI.pref || loadUiPref()) };

  const box = document.createElement('div');
  box.id = 'prefModal';
  box.className = 'settings-mask';
  box.innerHTML = `
    <div class="settings">
      <div class="set-head"><b>设置</b><button class="mini-x" id="prefClose" title="关闭">×</button></div>

      <div class="set-group">
        <div class="set-label">界面</div>
        <div class="pref-row">
          <span class="pr-txt">毛玻璃<span>面板半透明、背景虚化；关掉更清楚</span></span>
          <button class="switch${pref.frost ? ' on' : ''}" id="prefFrost" role="switch"
            aria-checked="${pref.frost}" title="毛玻璃"></button>
        </div>
        <div class="pref-row">
          <span class="pr-txt">动效<span>面板、牌面与提示的过渡；关掉更快</span></span>
          <button class="switch${pref.motion !== false ? ' on' : ''}" id="prefMotion" role="switch"
            aria-checked="${pref.motion !== false}" title="动效"></button>
        </div>
        <div class="pref-row"><span class="pr-txt">浓度<span>越高越不透明，也越糊</span></span></div>
        <div class="range-wrap">
          <input type="range" id="prefLevel" min="0" max="100" step="1"
            value="${Math.round(pref.level * 100)}" ${pref.frost ? '' : 'disabled'} />
          <span class="pref-val" id="prefVal">${pref.frost ? Math.round(pref.level * 100) + '%' : '关'}</span>
        </div>
      </div>

      <div class="set-foot">只影响这台设备，改完立刻生效</div>
    </div>`;
  document.body.appendChild(box);

  const close = () => fxExit(box);
  box.addEventListener('click', e => { if (e.target === box) close(); });
  box.querySelector('#prefClose').addEventListener('click', close);
  document.addEventListener('keydown', function esc3(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc3); }
  });

  const sw = box.querySelector('#prefFrost');
  const mo = box.querySelector('#prefMotion');
  const range = box.querySelector('#prefLevel');
  const val = box.querySelector('#prefVal');

  sw.addEventListener('click', () => {
    pref.frost = !pref.frost;
    sw.classList.toggle('on', pref.frost);
    sw.setAttribute('aria-checked', String(pref.frost));
    range.disabled = !pref.frost;
    val.textContent = pref.frost ? Math.round(pref.level * 100) + '%' : '关';
    applyUiPref(pref);
    saveUiPref(pref);
  });

  mo.addEventListener('click', () => {
    pref.motion = pref.motion === false;
    mo.classList.toggle('on', pref.motion);
    mo.setAttribute('aria-checked', String(pref.motion));
    applyUiPref(pref);       // 立刻生效：关掉时正在播的动画会被压成 1ms
    saveUiPref(pref);
  });

  range.addEventListener('input', () => {
    pref.level = Math.min(1, Math.max(0, Number(range.value) / 100));
    val.textContent = Math.round(pref.level * 100) + '%';
    applyUiPref(pref);       // 拖动时实时预览，松手才落盘
  });
  range.addEventListener('change', () => saveUiPref(pref));
}

/* ---------- 入口 ---------- */
function renderEntry() {
  const saved = Net.name();
  const offline = !!Net.local;
  const canLan = !!Net.canLan;
  const lanUrl = canLan ? Net.lanUrl() : null;

  $('#app').innerHTML = `
    <div class="lobby lobby-entry">
      <button class="icon-btn" id="prefBtn" title="设置" aria-label="设置">${GEAR}</button>
      <h1>三体 · 黑暗森林</h1>
      <p class="sub">${offline ? '单人对局 · 四档对手都在本机' : '2–9 人 · 藏好自己，做好清理'}</p>
      <div class="field">
        <label>你的名字</label>
        <input id="myname" maxlength="12" placeholder="输入名字" value="${esc(saved)}" />
      </div>
      <div class="lobby-actions">
        <button class="btn primary" id="createBtn">${offline ? '开始对局' : '创建对局'}</button>
      </div>

      ${offline ? `
        <div class="divider">和身边的人一起玩</div>
        <div class="lobby-actions">
          <button class="btn" id="onlineBtn">联机对局</button>
        </div>
        ${canLan ? `
          <div class="divider">同一个 Wi-Fi</div>
          <div class="lobby-actions">
            <button class="btn" id="lanBtn">${lanUrl ? '关闭房间' : '开设房间'}</button>
          </div>
          <p class="dim small" id="lanHint" style="text-align:center;margin-top:10px">
            ${lanUrl
              ? `已开设：<b style="color:var(--gold)">${esc(lanUrl)}</b><br>同一个 Wi-Fi 下的人用浏览器打开就能进来`
              : '开设后，同一个 Wi-Fi 下的人用浏览器输入你手机上的地址即可加入'}
          </p>` : ''}
        <p class="dim small" style="text-align:center;margin-top:18px">
          不需要网络：四档对手、整套规则都在这台设备里。
        </p>
      ` : `
        <div class="divider">或加入一场对局</div>
        <div class="field">
          <label>对局码</label>
          <input id="roomcode" class="room" maxlength="5" placeholder="ABCDE" />
        </div>
        <div class="lobby-actions">
          <button class="btn" id="joinBtn">加入</button>
        </div>
        ${(typeof window !== 'undefined' && window.DF_APP) ? `
          <div class="lobby-actions" style="margin-top:14px">
            <button class="btn ghost" id="backOffline">← 单人模式</button>
          </div>` : ''}
      `}
      <div id="apkSlot"></div>
    </div>`;

  $('#createBtn').addEventListener('click', () => {
    const n = ($('#myname').value || '').trim() || '玩家';
    Net.setName(n);
    Net.createRoom(n);
  });

  const jb = $('#joinBtn');
  if (jb) {
    jb.addEventListener('click', () => {
      const n = ($('#myname').value || '').trim() || '玩家';
      const r = ($('#roomcode').value || '').trim().toUpperCase();
      if (!r) return toast('请输入对局码');
      Net.setName(n);
      Net.joinRoom(r, n);
    });
    $('#roomcode').addEventListener('keydown', e => { if (e.key === 'Enter') jb.click(); });
  }

  const lb = $('#lanBtn');
  if (lb) {
    lb.addEventListener('click', () => {
      if (lanUrl) { Net.stopLan(); toast('房间已关闭'); renderEntry(); return; }
      const info = Net.startLan();
      if (!info || !info.ok) return toast('没法开设房间：' + ((info && info.error) || '未知原因'));
      toast('房间已开设');
      renderEntry();
    });
  }

  // APK 里：单人 ⇄ 联机 两个页面互相跳
  const ob = $('#onlineBtn');
  if (ob) ob.addEventListener('click', () => { location.href = 'online.html'; });
  const bo = $('#backOffline');
  if (bo) bo.addEventListener('click', () => { location.href = 'index.html'; });

  const pb = $('#prefBtn');
  if (pb) pb.addEventListener('click', openPrefModal);

  mountDownloadEntry();
  checkAppUpdate();
}

/* 下载安卓版：先问后端有没有 /download/apk.json——没有就不渲染，
   避免在同一个 Wi-Fi / APK 这类拿不到安装包的场景留一个死链 */
const APK_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
  stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <rect x="6" y="2.5" width="12" height="19" rx="2.4"/>
  <path d="M12 7.5v6.6"/><path d="M9.4 11.4 12 14l2.6-2.6"/><path d="M10.2 18.6h3.6"/></svg>`;
/* Windows 版入口的小图标：一扇窗 */
const WIN_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
    stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3.5" y="4.5" width="17" height="15" rx="2"/>
    <path d="M3.5 9h17"/><path d="M8 9v5"/><path d="M8 14h4v-5"/>
    <path d="M14 14h3v-2"/><path d="M14 12h2.5"/>
  </svg>`;

/* 下载入口：所有安装包聚合成**一个**「下载客户端」按钮，
   点开在应用内弹层里挑平台。
   之前是三行下载条（安卓 / Windows 轻量 / Windows 完整），入口页被撑到显示不全。 */
function mountDownloadEntry() {
  const slot = $('#apkSlot');
  if (!slot) return;
  // APK / 桌面版里（file:// 或注入了 DF_APP）自己就是程序，不需要下载入口
  if (typeof window !== 'undefined' && (window.DF_APP || location.protocol === 'file:')) return;

  const collect = () => {
    const out = [];
    const apk = UI.apk;
    if (apk && apk.file) {
      const kb = apk.bytes ? Math.round(apk.bytes / 1024) : 0;
      out.push({
        icon: APK_ICON,
        label: '下载安卓版',
        sub: [apk.version ? 'v' + apk.version : '', kb ? kb + ' KB' : '', '离线 · 同 Wi-Fi · 联机']
          .filter(Boolean).join(' · '),
        url: '/download/' + apk.file,
        file: '黑暗森林' + (apk.version ? '-v' + apk.version : '') + '.apk',
      });
    }
    const desk = UI.desktop;
    if (desk && Array.isArray(desk.items)) {
      desk.items.forEach(it => out.push({
        icon: WIN_ICON,
        label: it.label || '下载 Windows 版',
        sub: it.sub || '',
        url: it.url || '#',
        file: it.file || '',
      }));
    }
    return out;
  };

  const paint = () => {
    const list = collect();
    if (!list.length) return;
    slot.innerHTML = `<button class="apk-get" id="dlBtn" type="button">
      <span class="apk-ico">${APK_ICON}</span>
      <span class="apk-txt"><b>下载客户端</b><span>${list.length} 个版本 · 安卓 / Windows</span></span>
      <span class="apk-arrow">↓</span>
    </button>`;
    const btn = $('#dlBtn');
    if (btn) btn.addEventListener('click', () => openDownloadDialog(list));
  };

  const load = url => fetch(url, { cache: 'no-store' })
    .then(r => (r.ok ? r.json() : null)).catch(() => null);
  const p1 = UI.apk !== null ? Promise.resolve(UI.apk)
    : load('/download/apk.json').then(x => { UI.apk = x || false; return UI.apk; });
  const p2 = UI.desktop !== null ? Promise.resolve(UI.desktop)
    : load('/download/desktop.json').then(x => { UI.desktop = x || false; return UI.desktop; });
  Promise.all([p1, p2]).then(() => { if ($('#apkSlot')) paint(); });
}

/* 下载客户端弹层：列出各平台安装包 */
function openDownloadDialog(list) {
  document.getElementById('dlDialog')?.remove();
  const box = document.createElement('div');
  box.id = 'dlDialog';
  box.className = 'dlg-mask';
  box.innerHTML = `
    <div class="dlg">
      <div class="dlg-head"><b>下载客户端</b><button class="mini-x" data-close title="关闭">×</button></div>
      <div class="dlg-body"><div class="dl-list">
        ${list.map(it => {
          // 本地文件（同源 /download/…）直接下；外链（GitHub Release）才新窗口打开
          const local = !/^https?:\/\//i.test(it.url || '');
          const dl = local && it.file ? ` download="${esc(it.file)}"` : '';
          const ext = local ? '' : ' target="_blank" rel="noopener"';
          return `<a class="apk-get dl-item" href="${esc(it.url || '#')}"${dl}${ext}>
            <span class="apk-ico">${it.icon}</span>
            <span class="apk-txt"><b>${esc(it.label)}</b><span>${esc(it.sub)}</span></span>
            <span class="apk-arrow">${local ? '↓' : '↗'}</span>
          </a>`;
        }).join('')}
      </div></div>
      <div class="dlg-foot"><button class="btn ghost" data-close>关闭</button></div>
    </div>`;
  document.body.appendChild(box);
  const close = () => fxExit(box, '.dlg');
  box.addEventListener('click', e => { if (e.target === box) close(); });
  box.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
  document.addEventListener('keydown', function esc4(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc4); }
  });
}

/* 服务器根地址：APK 里是 file://，相对路径会解析成 file:///download/… 根本发不出去，
   所以安装包里必须用 window.DF_SERVER 拼绝对地址；网页里留空走同源即可。 */
function serverBase() {
  if (typeof window === 'undefined') return '';
  return String(window.DF_SERVER || '').replace(/\/+$/, '');
}

/* 原生桥返回的是 JSON 字符串，解析失败不能把界面炸掉 */
function safeParse(s) {
  try { return JSON.parse(String(s || '')); } catch (e) { return null; }
}

/* 版本比较：1.0.10 > 1.0.9（按段转数字，不能直接比字符串） */
function compareVer(a, b) {
  const pa = String(a).split('.').map(x => parseInt(x, 10) || 0);
  const pb = String(b).split('.').map(x => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

/* ============================================================
 * 动效小工具
 * ============================================================ */

/* 退场：能播就播 150ms 再删，不能播就当场删。
   ⚠️ 两个坑，都踩过：
   1) 不能无条件延迟删除——jsdom（UI 冒烟测试）没有 Element.animate，
      测试点完按钮就会断言节点没了，延迟删会全红。所以先探一下能力再说。
   2) 必须 fill:'forwards'。不加的话动画一结束就把样式让回下面的 CSS，
      元素会在这一帧弹回"完全不透明"，下一帧才被删——看起来就是关弹窗时闪几下。 */
function fxExit(node, panelSel) {
  if (!node) return;
  const done = () => node.remove();
  if (typeof node.animate !== 'function') return done();
  const ease = 'cubic-bezier(.4,0,1,1)';
  const opts = { duration: 150, easing: ease, fill: 'forwards' };
  node.style.pointerEvents = 'none';        // 淡出期间别再挡住底下的点击
  let last = null;
  try {
    last = node.animate([{ opacity: 1 }, { opacity: 0 }], opts);
    const panel = panelSel ? node.querySelector(panelSel) : null;
    if (panel) last = panel.animate(
      [{ transform: 'none', opacity: 1 }, { transform: 'translateY(6px) scale(.985)', opacity: 0 }], opts);
  } catch (e) { /* 动画失败不该拦住关闭 */ }
  if (last && last.finished && last.finished.then) last.finished.then(done, done);
  setTimeout(done, 220);                    // 兜底：动画被系统跳过时也要收尸
}

/* 弹窗内容没变就别重写 DOM——否则每个状态推送都会把入场动画重播一遍，
   等待别人回应时那层遮罩会一直"浮上来"。返回 true 表示这次真的写了。 */
function paintModal(root, html) {
  if (root.__dfHtml === html) return false;
  root.__dfHtml = html;
  root.innerHTML = html;
  return true;
}

/* 数值变动时跳一下：能量、牌库数都走这里 */
function bump(node, up) {
  if (!node || !node.classList) return;
  node.classList.remove('e-bump', 'e-up', 'e-down');
  void node.offsetWidth;                    // 强制回流，同名 class 才会重新触发
  node.classList.add('e-bump', up ? 'e-up' : 'e-down');
  setTimeout(() => node.classList.remove('e-bump', 'e-up', 'e-down'), 720);
}

/* ============================================================
 * 通用对话框：应用内弹窗，不用 alert/confirm
 * （原生弹窗在 WebView 里长得像系统警告，而且不能换样式；
 *  这里统一用一块 .dlg，标题 + 正文 HTML + 取消/确定两个按钮）
 * ============================================================ */
function openDialog(opts) {
  const o = opts || {};
  const id = o.id || 'appDialog';
  document.getElementById(id)?.remove();

  const mask = document.createElement('div');
  mask.id = id;
  mask.className = 'dlg-mask';
  mask.innerHTML = `
    <div class="dlg" role="dialog" aria-modal="true" aria-label="${esc(o.title || '提示')}">
      <div class="dlg-head"><b>${esc(o.title || '提示')}</b>
        <button class="mini-x" data-close title="关闭">×</button></div>
      <div class="dlg-body">${o.body || ''}</div>
      <div class="dlg-foot">
        ${o.cancelText === null ? '' : `<button class="btn ghost" data-close>${esc(o.cancelText || '取消')}</button>`}
        <button class="btn ${o.danger ? 'danger' : 'primary'}" data-ok>${esc(o.okText || '确定')}</button>
      </div>
    </div>`;
  document.body.appendChild(mask);

  const close = () => {
    fxExit(mask, '.dlg');
    document.removeEventListener('keydown', onKey);
  };
  const onKey = e => { if (e.key === 'Escape') close(); };

  mask.addEventListener('click', e => { if (e.target === mask) close(); });
  mask.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
  mask.querySelector('[data-ok]').addEventListener('click', () => {
    close();
    if (typeof o.onOk === 'function') o.onOk();
  });
  document.addEventListener('keydown', onKey);
  return { close };
}

/* 安卓包里检查更新：和线上的版本号比，有新版本才在右上角点一个小圆点 */
function checkAppUpdate() {
  if (typeof window === 'undefined') return;
  if (!window.DF_APP || !window.DF_VERSION) return;     // 网页版不需要
  if (document.getElementById('updateBadge')) return;
  fetch(serverBase() + '/download/apk.json', { cache: 'no-store' })
    .then(r => (r.ok ? r.json() : null))
    .catch(() => null)
    .then(info => {
      if (!info || !info.version) return;
      if (compareVer(info.version, window.DF_VERSION) <= 0) return;
      if (document.getElementById('updateBadge')) return;
      const b = document.createElement('button');
      b.id = 'updateBadge';
      b.title = `有新版本 v${info.version}（当前 v${window.DF_VERSION}）`;
      b.innerHTML = '<span class="ub-dot"></span>新版本';
      b.addEventListener('click', () => openUpdateDialog(info));
      document.body.appendChild(b);
    });
}

/* 点「新版本」先问一句：版本号、体积、这一跳跨过了哪些改动、要下不下 */
function openUpdateDialog(info) {
  const cur = window.DF_VERSION || '';
  const kb = info.bytes ? Math.round(info.bytes / 1024) : 0;
  const groups = updateGroups(info, cur, info.version);
  const multi = groups.length > 1;

  // 最多列 4 个版本、每个版本 4 条：再老的版本折叠成一句，别把弹窗撑成说明书
  const shown = groups.slice(0, 4);
  const notes = shown.map(g => `
    ${multi ? `<div class="dlg-verline">v${esc(g.ver)}</div>` : ''}
    <ul class="dlg-list">${g.items.slice(0, 4).map(n => `<li>${esc(n)}</li>`).join('')}</ul>`).join('');
  const rest = groups.length - shown.length;

  openDialog({
    id: 'updateDialog',
    title: '发现新版本',
    body: `
      <div class="dlg-ver"><span>v${esc(info.version)}</span><i>当前 v${esc(cur)}</i></div>
      <p class="dlg-note">${[kb ? kb + ' KB' : '', '完整安装包', '离线 · 同 Wi-Fi · 联机'].filter(Boolean).join(' · ')}</p>
      ${multi ? `<p class="dlg-note">落后 ${groups.length} 个版本，直接更新到最新版，无需逐版本安装。</p>` : ''}
      ${groups.length ? `<div class="dlg-sub">本次更新${multi ? ` · ${groups.length} 个版本` : ''}</div>${notes}` : ''}
      ${rest > 0 ? `<p class="dlg-note">另有 ${rest} 个较早版本的改动未列出。</p>` : ''}
      <p class="dlg-note">更新不会影响本机设置。</p>`,
    okText: '立即更新',
    cancelText: '稍后再说',
    onOk: () => downloadUpdate(info),
  });
}

/* 版本改动按「本机版本 < v ≤ 目标版本」聚合成若干组（新的在前）。
   没有 history 的老 apk.json 就退回只看 notes——必须优雅降级。 */
function updateGroups(info, cur, target) {
  const hist = info.history && typeof info.history === 'object' ? info.history : null;
  const clean = arr => (Array.isArray(arr) ? arr.filter(n => typeof n === 'string' && n.trim()) : []);
  const out = [];
  if (hist) {
    for (const k of Object.keys(hist)) {
      if (compareVer(k, cur) <= 0) continue;     // 已经装过的版本不用再讲一遍
      if (compareVer(k, target) > 0) continue;   // 比目标还新的不该出现在这次更新里
      const items = clean(hist[k]);
      if (items.length) out.push({ ver: k, items });
    }
  }
  if (!out.length) {
    const items = clean(info.notes);
    if (items.length) out.push({ ver: target, items });
  }
  return out.sort((a, b) => compareVer(b.ver, a.ver));
}

/* 真正的下载：安卓壳走原生（下完直接唤起安装器），网页版退回浏览器 */
function downloadUpdate(info) {
  const file = info.file || 'dark-forest.apk';
  const url = serverBase() + '/download/' + file;   // APK 里必须绝对地址（file:// 下没有同源）
  const A = window.Android;
  const b = document.getElementById('updateBadge');

  if (A && A.downloadApk) {
    // 已经下过（比如刚被系统要求去开「安装未知应用」权限）就直接装，别重复下几百 KB
    if (UI.updateDownloaded === file && A.installDownloaded) {
      const r0 = safeParse(A.installDownloaded());
      if (r0 && r0.ok) return;
    }
    const r = safeParse(A.downloadApk(url));
    if (r && r.ok) {
      UI.updateDownloaded = file;
      if (b) {
        b.disabled = true;
        b.innerHTML = '<span class="ub-dot"></span>下载中';
        // 原生 Toast 报结果；这里只负责别让按钮永远卡在「下载中」
        setTimeout(() => { b.disabled = false; b.innerHTML = '<span class="ub-dot"></span>新版本'; }, 8000);
      }
      return;
    }
    toast((r && r.error) || '下载没能开始');
    return;
  }
  if (A && A.openUrl) A.openUrl(url);
  else location.href = url;
}

/* ---------- 大厅 ---------- */
const LEVEL_FALLBACK = [
  { key: 'dehydrator',  name: '脱水者', retention: 0.30, blurb: '忘掉大部分旧牌，常把对手位置搞混' },
  { key: 'chaotic_era', name: '乱纪元', retention: 0.55, blurb: '记得一半，大致能拼出位置' },
  { key: 'stable_era',  name: '恒纪元', retention: 0.88, blurb: '几乎不漏，定位相当准' },
  { key: 'sophon',      name: '智子',   retention: 1.00, blurb: '记得每一个公开事件' },
];

function renderLobby() {
  const room = Net.room;
  if (!room) return renderEntry();
  const isHost = room.hostId === Net.me?.playerId;
  const levels = (room.levels && room.levels.length) ? room.levels : LEVEL_FALLBACK;
  const lvName = k => (levels.find(l => l.key === k) || {}).name || k;
  const aiCount = room.seats.filter(s => s.isAI).length;
  const free = 9 - room.seats.length;
  const modeName = room.mode === 'fast' ? '快速' : '标准';
  const targetName = room.strikeTarget === 'hidden' ? '目标隐藏' : '目标公开';

  const seenSeats = UI.seatSet;
  const seats = room.seats.map((s, i) => `
    <div class="seat${s.isAI ? ' ai' : ''}${seenSeats && !seenSeats.has(s.playerId) ? ' is-new' : ''}">
      <span class="seat-name"><span class="dot ${s.connected ? '' : 'off'}"></span>${esc(s.name)}
        ${s.playerId === Net.me?.playerId ? '<span class="badge-you">你</span>' : ''}
        ${s.isAI ? `<span class="badge ai">对手 · ${esc(lvName(s.aiLevel))}</span>` : ''}</span>
      <span class="seat-right">
        ${i === 0 ? '<span class="host">房主</span>' : ''}
        ${(isHost && s.isAI) ? `<button class="mini-x" data-remove="${s.playerId}" title="移除这位对手">×</button>` : ''}
      </span>
    </div>`).join('') || '<div class="dim small" style="padding:12px">还没有其他玩家</div>';
  UI.seatSet = new Set(room.seats.map(s => s.playerId));

  $('#app').innerHTML = `
    <div class="lobby lobby-room">
      ${isHost ? `<button class="icon-btn" id="settingsBtn" title="对局设置" aria-label="对局设置">${GEAR}</button>` : ''}
      <header class="lobby-head">
        <h1>三体 · 黑暗森林</h1>
        <p class="sub">${room.seats.length}/9 位文明就位${aiCount ? ` · ${aiCount} 位对手` : ''}</p>
        <div class="roomcode">${esc(room.roomId)}</div>
        <div class="dim small">把这个号发给朋友，或直接加几位对手开打</div>
      </header>

      <div class="lobby-grid">
        <section class="lobby-col">
          <div class="col-title">席位 <span>${room.seats.length}/9</span></div>
          <div class="seatlist">${seats}</div>
        </section>

        <section class="lobby-col">
          ${isHost ? `
            <details class="fold" id="aiFold" ${aiCount ? '' : 'open'}>
              <summary>添加对手 <span>${free > 0 ? `还可加 ${free} 位` : '已满 9 人'}</span></summary>
              <div class="ai-levels">
                ${levels.map(l => `
                  <button class="ai-btn" data-level="${l.key}" ${free <= 0 ? 'disabled' : ''} title="${esc(l.blurb)}">
                    <b>${esc(l.name)}</b>
                    <span class="ai-ret">记忆 ${Math.round(l.retention * 100)}%</span>
                    <span class="ai-blurb">${esc(l.blurb)}</span>
                  </button>`).join('')}
              </div>
            </details>

            <div class="rule-line">
              <span>${modeName}对局</span><i>·</i><span>${targetName}</span>
              <button class="rule-edit" id="settingsBtn2">调整</button>
            </div>

            <div class="lobby-actions">
              <button class="btn primary" id="startBtn" ${room.seats.length < 2 ? 'disabled' : ''}>
                开始对局
              </button>
              <button class="btn ghost" id="leaveLobby">返回</button>
            </div>
            ${room.seats.length < 2 ? '<p class="dim small" style="margin-top:8px">至少需要 2 位玩家（可以加对手）</p>' : ''}
          ` : `
            <div class="rule-line">
              <span>${modeName}对局</span><i>·</i><span>${targetName}</span>
            </div>
            <p class="dim small">等房主开局…</p>
            <div class="lobby-actions">
              <button class="btn ghost" id="leaveLobby">返回</button>
            </div>
          `}
        </section>
      </div>
    </div>`;

  const b = $('#startBtn');
  if (b) b.addEventListener('click', () => Net.start());

  const gear = () => openSettings();
  $('#settingsBtn')?.addEventListener('click', gear);
  $('#settingsBtn2')?.addEventListener('click', gear);

  $('#leaveLobby')?.addEventListener('click', () => {
    Net.leave();
    render();
  });

  document.querySelectorAll('.ai-btn').forEach(btn => {
    btn.addEventListener('click', () => Net.addAI(btn.dataset.level));
  });
  document.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => Net.removeAI(btn.dataset.remove));
  });
}

/* 对局设置：收在右上角的齿轮里，不占大厅版面 */
function openSettings() {
  document.getElementById('settingsModal')?.remove();
  const room0 = Net.room || {};
  const isHost = room0.hostId === Net.me?.playerId;

  const box = document.createElement('div');
  box.id = 'settingsModal';
  box.className = 'settings-mask';
  const close = () => {
    fxExit(box, '.settings');
    document.removeEventListener('keydown', onKey);
  };
  const onKey = e => { if (e.key === 'Escape') close(); };

  const paint = () => {
    const r = Net.room || room0;
    box.innerHTML = `
      <div class="settings">
        <div class="set-head"><b>对局设置</b><button class="mini-x" id="setClose">×</button></div>

        <div class="set-group">
          <div class="set-label">节奏</div>
          <div class="set-opts">
            ${[['standard', '标准', '出牌或弃牌二选一，弃牌即结束回合'],
               ['fast', '快速', '可以先弃牌换牌再出牌，回合两头都补牌']].map(([k, n, d]) => `
              <button class="set-opt${(r.mode || 'standard') === k ? ' on' : ''}" data-mode="${k}" ${isHost ? '' : 'disabled'}>
                <b>${n}</b><span>${d}</span></button>`).join('')}
          </div>
        </div>

        <div class="set-group">
          <div class="set-label">打击目标</div>
          <div class="set-opts">
            ${[['open', '公开', '全场知道「谁 → 哪个星系」'],
               ['hidden', '隐藏', '只公开打击类型与已飞手数，落地那一刻才公布位置']].map(([k, n, d]) => `
              <button class="set-opt${(r.strikeTarget || 'open') === k ? ' on' : ''}" data-strike="${k}" ${isHost ? '' : 'disabled'}>
                <b>${n}</b><span>${d}</span></button>`).join('')}
          </div>
        </div>

        ${isHost ? '<div class="set-foot">开局后不能再改</div>' : '<div class="set-foot">由房主决定</div>'}
      </div>`;
    box.querySelector('#setClose').addEventListener('click', close);
    box.querySelectorAll('[data-mode]').forEach(btn => btn.addEventListener('click', () => {
      if (btn.disabled) return;
      Net.setMode(btn.dataset.mode);
      box.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('on', x === btn));
    }));
    box.querySelectorAll('[data-strike]').forEach(btn => btn.addEventListener('click', () => {
      if (btn.disabled) return;
      Net.setStrikeTarget(btn.dataset.strike);
      box.querySelectorAll('[data-strike]').forEach(x => x.classList.toggle('on', x === btn));
    }));
  };

  box.addEventListener('click', e => { if (e.target === box) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(box);
  paint();
}

/* ---------- 游戏 ---------- */
function renderGame() {
  const v = Net.view;
  if (!v) return;

  /* 换人提示：轮到一个人时，先给 3 秒"XX 即将出牌"，避免瞬间跳过来看不清 */
  const turnKey = `${v.turnIndex}:${v.currentPlayerId}`;
  if (v.phase === 'playing' && v.step === 'action') {
    if (UI.turnKey !== turnKey) {
      const cp = v.players.find(p => p.id === v.currentPlayerId);
      UI.gate = {
        name: cp ? cp.name : '',
        mine: v.currentPlayerId === v.me.id,
        until: Date.now() + 3000,
      };
      clearTimeout(UI.gateTimer);
      UI.gateTimer = setTimeout(() => { UI.gate = null; renderGame(); }, 3100);
    }
    UI.turnKey = turnKey;
  }
  const me = v.players.find(p => p.id === v.me.id) || v.me;
  const cur = v.players.find(p => p.id === v.currentPlayerId);
  const isMyTurn = v.currentPlayerId === v.me.id;
  const stepMap = { production: '生产', action: '行动', supply: '补给' };

  $('#app').innerHTML = `
    <header class="hud">
      <div class="brand">三体 · 黑暗森林 <span class="room">${esc(Net.room?.roomId || '')}</span></div>
      <div class="counter-bar" id="counterBar"></div>
      <div class="hud-actions">
        <span class="mode-chip ${v.mode === 'fast' ? 'fast' : ''}"
          title="${v.mode === 'fast'
            ? '快速对局：可先弃牌换牌再出牌；回合开始与结束各补满 4 张'
            : '标准对局：出牌或弃牌二选一；弃牌即结束回合；只在回合结束时补满 4 张'}">${v.mode === 'fast' ? '快速' : '标准'}</span>
        ${v.strikeTarget === 'hidden'
          ? `<span class="mode-chip blind" title="隐藏打击目标：只公开打击类型与已飞手数，落地那一刻才公布位置">暗打</span>`
          : ''}
        <span class="hud-turn" title="第 ${v.turnIndex} 回合">T${v.turnIndex} · ${esc(cur ? cur.name : '—')} · ${stepMap[v.step] || ''}</span>
        <button class="hbtn hbtn-icon" id="prefBtnGame" title="设置" aria-label="设置">${GEAR}</button>
        <button class="hbtn" id="logBtn">战报</button>
        <button class="hbtn" id="leaveBtn">退出</button>
      </div>
    </header>

    <main class="board">
      <aside class="seats" id="seatsLeft"></aside>

      <section class="arena">
        <div class="arena-top">
          <span class="arena-title">星图</span>
          <span class="target-chip" id="targetChip"></span>
          <span class="arena-turn${isMyTurn ? ' mine' : ''}${v.thinking && !isMyTurn ? ' thinking' : ''}">${
            isMyTurn ? '轮到你'
            : (UI.gate ? '<span class="dim">即将出牌</span>'
              : (v.thinking ? `<i class="dots"><b></b><b></b><b></b></i>${esc(cur ? cur.name : '')} 思考中`
                            : esc(cur ? cur.name : '') + ' 行动中'))}</span>
        </div>
        <div class="arena-main">
          <div class="map-wrap" id="map"></div>
          <div class="tray" id="discard"></div>
        </div>
        <div class="callout" id="callout"></div>
        <div class="action-bar" id="actions"></div>
      </section>

      <aside class="seats" id="seatsRight"></aside>
    </main>

    <footer class="mybar">
      <div class="my-line" id="handHead"></div>
      <div class="hand" id="hand"></div>
    </footer>

    <div class="log-drawer${UI.logOpen ? ' open' : ''}" id="logDrawer">
      <div class="log-head">战报 <button class="mini-x" id="logClose">×</button></div>
      <div class="log-list" id="log"></div>
    </div>

    <div class="modal-root" id="modalRoot"></div>
    <svg class="arrow-layer" id="arrowLayer"></svg>
    ${UI.gate ? `<div class="turn-gate${UI.gate.mine ? ' mine' : ''}">
      <div class="tg-card">
        <div class="tg-name">${UI.gate.mine ? '轮到你出牌' : esc(UI.gate.name) + ' 即将出牌'}</div>
        <div class="tg-sub">${UI.gate.mine ? '看清局势再动手' : '做好准备'}</div>
      </div>
    </div>` : ''}
  `;

  renderCounter(v);
  renderPlayers(v);
  renderMap(v);
  trackStrikeReveals(v);   // 隐藏目标模式：落地瞬间要播报落点，必须先于 callout
  renderCallout(v);
  renderDiscard(v);
  renderHand(v);
  renderLog(v);
  renderBroadcastModal(v);
  renderEscapeModal(v);

  $('#leaveBtn').addEventListener('click', () => {
    // 以前是 confirm()——WebView 里会弹成系统警告框，样式完全不受控
    openDialog({
      title: '退出对局',
      body: '<p class="dlg-note" style="margin-top:0">这一局会直接结束，席位也会空出来。确定离开？</p>',
      okText: '退出',
      cancelText: '继续玩',
      danger: true,
      onOk: () => { Net.leave(); location.reload(); },
    });
  });
  $('#prefBtnGame').addEventListener('click', openPrefModal);
  /* 战报抽屉开着的时候会被下一次重绘拆掉（renderGame 整块换 DOM），
     所以"开着"这个状态存在 UI 里，重绘时按它恢复——否则 AI 每动一步抽屉就自己关上。 */
  $('#logBtn').addEventListener('click', () => {
    UI.logOpen = !UI.logOpen;
    $('#logDrawer').classList.toggle('open', UI.logOpen);
  });
  $('#logClose').addEventListener('click', () => {
    UI.logOpen = false;
    $('#logDrawer').classList.remove('open');
  });

  requestAnimationFrame(drawArrow);
  requestAnimationFrame(() => handleEnergyEvents(v));
  // 换局/重渲染时回到顶部，避免沿用上一屏的滚动位置
  if (window.scrollY > 0 && window.innerWidth <= 1100) window.scrollTo(0, 0);
}

/* ---------- 能量飘字：在玩家卡上浮出 +N / −N，约 3 秒后淡出 ---------- */
const ENERGY_REASON = {
  production: '生产', build: '建造', strike: '发射打击',
  broadcast: '广播结算', lightship: '光速飞船', reward: '清场奖励',
};

function ensureFloatLayer() {
  let layer = document.getElementById('floatLayer');
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'floatLayer';
    layer.className = 'float-layer';
    document.body.appendChild(layer);
  }
  return layer;
}

/** 飘字锚点：优先能量数字所在位置 */
function energyAnchor(pid) {
  return document.querySelector(`.seat-card[data-pid="${pid}"] .st-e`)
      || document.querySelector(`.me-chip[data-pid="${pid}"] .me-energy`)
      || document.querySelector(`.seat-card[data-pid="${pid}"] .seat-name`)
      || null;
}

function handleEnergyEvents(v) {
  const all = (v.events || []).filter(e => e.type === 'energy' && typeof e.delta === 'number');
  if (!all.length) {
    UI.energySeq = null;
    return;
  }
  const latest = all[all.length - 1].id;

  // 首次渲染 / 换局（事件序列回退）→ 只记游标，不补飘历史
  if (UI.energySeq == null || latest < UI.energySeq) {
    UI.energySeq = latest;
    return;
  }

  const fresh = all.filter(e => e.id > UI.energySeq);
  UI.energySeq = latest;
  if (!fresh.length) return;

  const layer = ensureFloatLayer();
  const stack = {};

  fresh.forEach(e => {
    const anchor = energyAnchor(e.actor);
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    if (!r.width && !r.height) return;

    const n = stack[e.actor] || 0;
    stack[e.actor] = n + 1;

    bump(anchor, e.delta > 0);   // 数字本身也跳一下，光飘字容易错过

    const node = document.createElement('div');
    node.className = 'e-float ' + (e.delta > 0 ? 'gain' : 'loss');
    node.textContent = (e.delta > 0 ? '+' : '−') + Math.abs(e.delta);
    node.dataset.reason = ENERGY_REASON[e.reason] || '';
    node.style.left = (r.left + r.width / 2) + 'px';
    node.style.top = (r.top - 21 - n * 19) + 'px';   // 浮在能量数字上方，不遮挡数值
    node.style.animationDelay = (n * 80) + 'ms';
    layer.appendChild(node);

    const kill = () => node.remove();
    node.addEventListener('animationend', kill);
    setTimeout(kill, 4200 + n * 80);   // 兜底（动画被跳过时也能清）
  });
}

/* 座位卡上用的两字缩写（空间太窄，牌名放不下） */
const ABBR = {
  lock: '锁死', nuke: '热核', photoid: '光粒', annihilate: '湮灭', dimension: '降维',
  star_coop: '恒合', star_disg: '恒伪', cosmic_coop: '宇合', cosmic_disg: '宇伪',
  ftl_coop: '超合', ftl_disg: '超伪',
  solar: '太阳', fusion: '聚变', dyson: '戴森', antimatter: '反物',
  bunker: '掩体', ghost: '幽灵', lightship: '光速', listener: '监听',
};

/* ---------- 顶栏：只剩牌库还剩几张 ----------
   以前这里还列着 19 种牌各剩几张（记牌器）。那等于把"牌库里有哪些牌"
   摊在明面上，牌库一下变成透明的——现在只报一个总数，
   想知道某张牌还剩几张，自己去数弃牌堆和场上的牌。 */
function renderCounter(v) {
  const prev = UI.deckCount;
  $('#counterBar').innerHTML = `<span class="cnt-deck">牌库 <b id="deckNum">${v.deckCount}</b></span>`;
  UI.deckCount = v.deckCount;
  if (prev != null && prev !== v.deckCount) bump($('#deckNum'), v.deckCount > prev);
}

/* ---------- 两侧对手 ---------- */
function seatCard(v, p, compact) {
  const isCur = p.id === v.currentPlayerId && p.alive;
  const isMe = p.id === v.me.id;
  const bAll = p.buildZone || [];
  const builds = bAll.slice(0, 4).map(c =>
    `<span class="mini" title="${esc(CARD_DEFS[c.key].name)}">${ABBR[c.key] || CARD_DEFS[c.key].short}</span>`).join('')
    + (bAll.length > 4 ? `<span class="mini" title="${bAll.slice(4).map(c => CARD_DEFS[c.key].name).join('、')}">+${bAll.length - 4}</span>` : '');
  const strikes = (p.strikes || []).map(s => {
    // 飞行回合数只有发起者知道：别人只看到「谁朝哪儿开了火」
    const known = s.mine || s.progress != null;
    const left = known ? Math.max(0, s.required - s.progress) : null;
    // 隐藏目标模式下，别人的打击连目的地都不下发，只剩「哪种 · 已飞几手」
    const blind = s.targetGalaxy == null;
    // 已飞几手是公开的；还要几手只有发起者知道
    const tail = `已${s.progress}手`;
    const tip = blind
      ? `${CARD_DEFS[s.key].name} → 目标不公开（本局隐藏打击目标），已飞 ${s.progress} 手`
      : known
        ? `${CARD_DEFS[s.key].name} → ${galLabel(s.targetGalaxy)}，已飞 ${s.progress} 手 / 共需 ${s.required} 手`
        : `${CARD_DEFS[s.key].name} → ${galLabel(s.targetGalaxy)}，已飞 ${s.progress} 手（到达时间未知）`;
    return `<span class="mini strike${blind ? ' blind' : ''}" title="${esc(tip)}">
      ${CARD_DEFS[s.key].short}<b class="mini-arrow">→</b>${blind ? '?' : esc(galShort(s.targetGalaxy))} ${tail}</span>`;
  }).join('');
  const glyph = esc((p.name || '?').trim().slice(0, 1));

  return `<div class="seat-card${isCur ? ' current' : ''}${p.alive ? '' : ' dead'}${isMe ? ' me' : ''}" data-pid="${p.id}">
    <div class="av${p.alive ? '' : ' off'}">${glyph}${isCur ? '<span class="av-dot"></span>' : ''}</div>
    <div class="seat-name">${esc(p.name)}${isMe ? '<span class="badge-you">你</span>' : ''}</div>
    <div class="seat-stat">
      <span class="st-e">⚡${p.energy}</span>
      <span class="st-c">牌 ${p.handCount}</span>
      <span class="st-c">建 ${p.buildZone.length}</span>
    </div>
    <div class="seat-mini">${builds}${strikes}${(builds || strikes) ? '' : '<span class="dim">—</span>'}</div>
    ${p.alive ? '' : '<div class="seat-out">已出局</div>'}
  </div>`;
}

function renderPlayers(v) {
  const opp = v.players.filter(p => p.id !== v.me.id);
  const half = Math.ceil(opp.length / 2);
  $('#seatsLeft').innerHTML = opp.slice(0, half).map(p => seatCard(v, p)).join('') ||
    '<div class="seat-empty">等待对手</div>';
  $('#seatsRight').innerHTML = opp.slice(half).map(p => seatCard(v, p)).join('') || '';

  // 点头像看详情。座位卡每帧都重绘，所以监听器跟着重绘一起挂；
  // 自己的信息在手牌区已经全都有，不给自己的卡加可点样式。
  document.querySelectorAll('#seatsLeft .seat-card, #seatsRight .seat-card').forEach(card => {
    const pid = card.getAttribute('data-pid');
    if (pid === v.me.id) return;
    card.classList.add('clickable');
    card.title = '查看详情';
    card.addEventListener('click', () => {
      const cur = (Net.view && Net.view.players || []).find(x => x.id === pid);
      if (cur) openPlayerModal(cur, Net.view);
    });
  });
}

/* ---------- 对手详情：名字 / 能量 / 建设区的每一张牌 ----------
   数据全部取自 view（publicPlayer）：对手坐标本来就不下发，这里也拿不到。
   建设区是公开信息，所以可以一张张摊开讲清楚效果。 */
function openPlayerModal(p, v) {
  document.getElementById('playerModal')?.remove();
  const builds = p.buildZone || [];
  const isCur = !!(v && v.currentPlayerId === p.id) && p.alive;

  const cards = builds.map(c => {
    const def = CARD_DEFS[c.key];
    const f = cardFacts(c.key);
    const kind = def.type === 'broadcast' ? '广播' : def.type === 'strike' ? '打击' : '建设';
    return `<div class="sm-card ${def.type}">
      <span class="dc-tag on">${kind}</span>
      <div class="sm-top"><span class="sm-name">${esc(def.name)}</span><span class="sm-cost">⚡${f.cost}</span></div>
      <div class="sm-facts"><span>${esc(f.main)}</span><span>${esc(f.sub)}</span></div>
      <div class="sm-desc">${esc(def.desc)}</div>
    </div>`;
  }).join('');

  const box = document.createElement('div');
  box.id = 'playerModal';
  box.className = 'stack-modal-mask pm-mask';   // 比弃牌弹窗浅一点：看对手时场上局势还要留着
  box.innerHTML = `
    <div class="stack-modal player-modal">
      <div class="pm-top">
        <span class="pm-av${p.alive ? '' : ' off'}">${esc((p.name || '?').trim().slice(0, 1))}</span>
        <span class="pm-id">
          <b>${esc(p.name)}</b>
          <span class="pm-tags">
            ${p.alive ? '' : '<i class="pm-tag dead">已出局</i>'}
            ${isCur ? '<i class="pm-tag cur">当前回合</i>' : ''}
          </span>
        </span>
        <button class="mini-x" id="pmClose" title="关闭">×</button>
      </div>
      <div class="pm-stats">
        <span><i>能量</i><b>⚡${p.energy}</b></span>
        <span><i>手牌</i><b>${p.handCount}</b></span>
        <span><i>建设</i><b>${builds.length}</b></span>
      </div>
      <div class="pm-label">建设区</div>
      <div class="sm-grid pm-builds">${cards || '<p class="pm-empty">还没有建设任何牌</p>'}</div>
    </div>`;
  document.body.appendChild(box);

  const close = () => fxExit(box, '.stack-modal');
  box.addEventListener('click', e => { if (e.target === box) close(); });
  box.querySelector('#pmClose').addEventListener('click', close);
  document.addEventListener('keydown', function esc2(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc2); }
  });
}

/* ---------- 星图 ---------- */
function renderMap(v) {
  const wrap = $('#map');
  const W = 600, H = 458;
  const pos = g => GALAXY_POS[g];

  const me = v.players.find(p => p.id === v.me.id);
  const selCard = UI.selected.size === 1
    ? (me.hand || []).find(c => c.uid === [...UI.selected][0])
    : null;
  const selDef = selCard ? CARD_DEFS[selCard.key] : null;
  let reachable = null;
  if (selDef && selDef.type === 'broadcast') {
    reachable = new Set([1,2,3,4,5,6,7,8,9].filter(g => galaxyDistance(me.galaxy, g) <= selDef.dist));
  }

  /* 飞行中的打击：按目的地分组（隐藏目标的打击没有目的地，不往星图上钉） */
  const flightBy = {};
  v.players.forEach(p => (p.strikes || []).forEach(s => {
    if (s.targetGalaxy == null) return;
    (flightBy[s.targetGalaxy] = flightBy[s.targetGalaxy] || []).push(s);
  }));

  /* 这一帧才被降维的星系：让它的边框从烧红褪成死灰。
     第一次渲染不播（一开局全是"新的"，整张图会一起红一下）。 */
  const dimmedNow = new Set([1,2,3,4,5,6,7,8,9].filter(g => v.markers[g].red));
  const justDimmed = new Set();
  if (UI.dimmedSet) dimmedNow.forEach(g => { if (!UI.dimmedSet.has(g)) justDimmed.add(g); });
  UI.dimmedSet = dimmedNow;

  let svg = `<svg viewBox="0 0 ${W} ${H}" class="starmap">`;
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
  for (let g = 1; g <= 9; g++) {
    const { x, y } = pos(g);
    const m = v.markers[g];
    const isMine = me.galaxy === g;
    const isTarget = UI.targetGalaxy === g;
    const canPick = reachable ? reachable.has(g) : true;
    const incoming = flightBy[g] || [];
    const cls = ['node', isTarget ? 'target' : '', isMine ? 'occupied' : '',
                 canPick ? '' : 'far', incoming.length ? 'under-strike' : '',
                 m.red ? 'dimmed' : '', justDimmed.has(g) ? 'just-dimmed' : ''].join(' ');   // 降维打击后的星系：文字置灰
    svg += `<g class="${cls}" data-g="${g}">`;
    svg += `<circle cx="${x}" cy="${y}" r="33" class="node-bg"/>`;
    svg += `<text x="${x}" y="${y - 5}" class="node-num">${g}</text>`;
    svg += `<text x="${x}" y="${y + 15}" class="node-name">${esc(GALAXY_NAMES[g])}</text>`;
    let mx = x - 22;
    if (m.black)  { svg += `<circle cx="${mx}" cy="${y - 30}" r="4.5" class="marker black"/>`; mx += 11; }
    if (m.purple) { svg += `<circle cx="${mx}" cy="${y - 30}" r="4.5" class="marker purple"/>`; mx += 11; }
    if (m.red)    { svg += `<circle cx="${mx}" cy="${y - 30}" r="4.5" class="marker red"/>`; }
    if (isMine) svg += `<text x="${x}" y="${y + 27}" class="node-owner">你</text>`;

    incoming.slice(0, 2).forEach((s, i) => {
      const known = s.mine && s.required != null;
      const label = known
        ? `${CARD_DEFS[s.key].short} ${s.progress}/${s.required}`
        : `${CARD_DEFS[s.key].short} 已${s.progress}手`;
      const w = svgTextWidth(label, 8.6) + 12;
      const ty = y + 46 + i * 14;
      svg += `<g class="strike-tag">
        <rect x="${x - w / 2}" y="${ty - 9}" width="${w}" height="13" rx="3"/>
        <text x="${x}" y="${ty + 1}" class="strike-tag-text">${esc(label)}</text>
      </g>`;
    });
    if (incoming.length > 2) {
      svg += `<text x="${x}" y="${y + 46 + 28 + 1}" class="strike-tag-more">+${incoming.length - 2}</text>`;
    }
    svg += `</g>`;
  }
  svg += `</svg>`;
  wrap.innerHTML = svg;

  wrap.querySelectorAll('.node').forEach(n => {
    n.addEventListener('click', () => {
      const g = +n.dataset.g;
      UI.targetGalaxy = (UI.targetGalaxy === g) ? null : g;
      renderGame();
    });
  });

  /* 目标提示条 */
  const chip = $('#targetChip');
  if (chip) {
    if (!UI.targetGalaxy) {
      chip.className = 'target-chip';
      chip.innerHTML = '点击星系选择目标';
    } else {
      const d = galaxyDistance(me.galaxy, UI.targetGalaxy);
      chip.className = 'target-chip on';
      chip.innerHTML = `目标 ${galLabel(UI.targetGalaxy)} <span class="tc-d">距离 ${fmtDist(d)}</span>
        <button class="tc-x" id="clearTarget">×</button>`;
      $('#clearTarget').addEventListener('click', () => { UI.targetGalaxy = null; renderGame(); });
    }
  }
}

/* ---------- 中央大字提示 ----------
   内容是"算出来"再一次性写进去的：这样能拿上一帧的内容做比对，
   只有字真的换了才播一次换字动画——同一个状态被反复重绘时不会一直闪。 */
function renderCallout(v) {
  const box = $('#callout');
  if (!box) return;
  let cls = 'callout';
  let html = '';

  if (UI.strikeReveal && Date.now() < UI.strikeReveal.until) {
    // 隐藏目标模式：打击落地/落空的那一下，把落点公开亮出来（约 5 秒）
    cls = 'callout reveal show';
    html = `<div class="co-main">${esc(UI.strikeReveal.text)}</div>
      <div class="co-sub">${esc(UI.strikeReveal.sub)}</div>`;
  } else {
    const me = v.players.find(p => p.id === v.me.id);
    const flight = [];
    v.players.forEach(p => (p.strikes || []).forEach(s => flight.push(s)));
    const known = flight.filter(s => s.targetGalaxy != null);
    const blind = flight.filter(s => s.targetGalaxy == null);

    const toMe = known.filter(s => s.targetGalaxy === me.galaxy)
      .sort((a, b) => (b.progress || 0) - (a.progress || 0))[0];

    if (toMe) {
      // 被打的人也不知道还有几手到——这正是"黑暗森林"该有的压迫感。
      // 注意 required（要飞几手）只有发起者知道，别人的打击这里拿不到，
      // 早先误用 progress 判断导致显示成"还需 0 手到达"。
      const isKnown = toMe.required != null;
      const left = isKnown ? Math.max(0, toMe.required - toMe.progress) : null;
      cls = 'callout danger show';
      html = `<div class="co-main">⚠ ${CARD_DEFS[toMe.key].short} 正在飞向你的星系</div>
        <div class="co-sub">已飞 ${toMe.progress} 手 · ${isKnown ? `还需 ${left} 手到达` : '还需 ? 手到达'} · ${esc(galLabel(me.galaxy))}</div>`;
    } else if (v.escape) {
      const who = v.players.find(p => p.id === (v.escape.mine ? v.me.id : v.escape.targetId));
      cls = 'callout danger show';
      html = v.escape.mine
        ? `<div class="co-main">⚠ 打击命中——是否启动光速飞船？</div>
           <div class="co-sub">这是你唯一的脱身机会</div>`
        : `<div class="co-main">${esc(who ? who.name : '有玩家')} 正在决定是否启动光速飞船</div>
           <div class="co-sub">等待其选择</div>`;
    } else if (v.broadcast) {
      const caster = v.players.find(p => p.id === v.broadcast.casterId);
      cls = 'callout show';
      html = `<div class="co-main">广播 → ${esc(galLabel(v.broadcast.targetGalaxy))}</div>
        <div class="co-sub">${esc(caster ? caster.name : '')} 发布 · 等待回应</div>`;
    } else if (blind.length) {
      // 隐藏目标：只知道"天上还有几枚东西在飞"，不知道飞向哪儿
      const labels = blind.slice(0, 3).map(s => `${CARD_DEFS[s.key].short} 已${s.progress}手`).join(' · ');
      cls = 'callout show blind';
      html = `<div class="co-main">在飞打击 ${blind.length} 枚 · 目标不明</div>
        <div class="co-sub">${esc(labels)}${blind.length > 3 ? ' …' : ''}</div>`;
    } else if (known.length) {
      const s = known.sort((a, b) => (b.progress || 0) - (a.progress || 0))[0];
      const isKnown = s.mine || s.progress != null;
      const left = isKnown ? Math.max(0, s.required - s.progress) : null;
      cls = 'callout show';
      html = `<div class="co-main">${esc(CARD_DEFS[s.key].short)} → ${esc(galLabel(s.targetGalaxy))}</div>
        <div class="co-sub">已飞 ${s.progress} 手${isKnown ? ` · 还需 ${left} 手` : ' · 到达时间未知'}</div>`;
    }
  }

  const changed = UI.calloutHTML !== null && UI.calloutHTML !== html;
  UI.calloutHTML = html;
  box.className = cls + (changed ? ' swap' : '');
  box.innerHTML = html;
}

/* ---------- 打击落地播报（仅在隐藏目标模式下需要） ---------- */
function trackStrikeReveals(v) {
  if (v.strikeTarget !== 'hidden') { UI.strikeSeq = null; UI.strikeReveal = null; return; }
  const all = (v.events || []).filter(e => e.type === 'strike_hit' || e.type === 'strike_miss');
  if (!all.length) { UI.strikeSeq = null; return; }
  const latest = all[all.length - 1].id;

  // 首次进入 / 换局（事件序列回退）→ 只记游标，不补播历史
  if (UI.strikeSeq == null || latest < UI.strikeSeq) { UI.strikeSeq = latest; return; }

  const fresh = all.filter(e => e.id > UI.strikeSeq);
  UI.strikeSeq = latest;
  if (!fresh.length) return;

  const e = fresh[fresh.length - 1];
  const name = CARD_DEFS[e.card] ? CARD_DEFS[e.card].short : '打击';
  const outcome = e.type === 'strike_miss' ? '空无一人'
    : (e.disabled != null ? `拆除 ${e.disabled} 张建设`
      : (e.defended ? '被挡下' : '命中'));
  const who = v.players.find(p => p.id === e.actor);
  UI.strikeReveal = {
    text: `${name} 落在 ${galLabel(e.target)} · ${outcome}`,
    sub: who ? `${who.name} 发射 · 目标已公开` : '目标已公开',
    until: Date.now() + 5000,
  };
  clearTimeout(UI.revealTimer);
  UI.revealTimer = setTimeout(() => { UI.strikeReveal = null; renderGame(); }, 5100);
}

/* ---------- 弃牌盘（中央） ---------- */
function renderDiscard(v) {
  const wrap = $('#discard');
  const arrow = v.arrow;
  const alive = arrow && (Date.now() - arrow.at < 15000);

  /* 弃牌堆只在"真的又打出了牌"时让最新一摞落下。
     首次渲染不动（整块牌桌已经有场景入场了，再来一层就是叠特效）。
     最新的一摞可能在"本回合"也可能在"上一回合"——刚结束回合时
     rules.js 已经把 current 滚进 last 了，所以要按 batch 号认，不能按区认。 */
  const allDiscards = v.discard.current.concat(v.discard.last);
  const sig = allDiscards.map(d => d.uid).join('|');
  const freshBatch = UI.discardSig !== undefined && sig !== UI.discardSig;
  UI.discardSig = sig;
  const newestBatch = allDiscards.reduce((m, d) => Math.max(m, d.batch || 0), -1);

  const chip = (d, zone, i, total) => {
    const def = CARD_DEFS[d.key];
    const f = cardFacts(d.key);
    const hot = alive && arrow.uids && arrow.uids.includes(d.uid);
    // 隐藏目标模式：科技锁死的落点会在当回合的弃牌堆里带上 targetGalaxy
    const destTip = d.targetGalaxy != null ? `｜目标 ${galLabel(d.targetGalaxy)}` : '';
    const tip = `${def.name}｜⚡${f.cost}｜${f.main}｜${f.sub}${destTip}｜${def.desc}`;
    const tagLabel = d.tag === 'response' ? '回应' : d.tag === 'cast' ? '发布' : d.tag === 'rejected' ? '未采纳' : '';
    const RING = ['#57c8d8', '#e0554f', '#5fbf83', '#f2b53c', '#9b7fd4', '#e08f4f'];
    const ring = RING[i % RING.length];
    const spine = i === 0 ? '' : ' spine';
    return `<div class="dchip ${def.type}${spine}${hot ? ' arrowed' : ''}${tagLabel ? ' tagged tag-' + d.tag : ''}"
        data-uid="${d.uid}" data-zone="${zone}" data-batch="${d.batch || 0}"
        style="--ring:${ring}"
        title="${esc(tip)}">
      ${tagLabel ? `<span class="dc-tag">${tagLabel}</span>` : ''}
      <div class="dc-top"><span class="dc-name">${esc(def.short)}</span><span class="dc-cost">⚡${f.cost}</span></div>
      ${d.actorName ? `<span class="dc-who">${esc(d.actorName)}</span>` : ''}
      <div class="dc-meta"><span class="dc-eff">${esc(f.main)}</span><span class="dc-sub">${esc(f.sub)}</span>${
        d.targetGalaxy != null ? `<span class="dc-dest">→ ${esc(galShort(d.targetGalaxy))}</span>` : ''}</div>
    </div>`;
  };

  const batches = arr => {
    const out = [];
    arr.slice().reverse().forEach(d => {
      const b = d.batch || 0;
      const last = out[out.length - 1];
      if (last && last.batch === b) last.items.push(d);
      else out.push({ batch: b, items: [d] });
    });
    return out;
  };

  const list = (arr, zone) => {
    const groups = batches(arr);
    if (!groups.length) return '<span class="dim small">空</span>';
    return groups.map((g, gi) => {
      const cls = ['dstack', gi === 0 ? 'fresh' : 'old', g.items.length > 1 ? 'multi' : '',
                   gi === 0 && freshBatch && g.batch === newestBatch ? 'is-new' : ''].filter(Boolean).join(' ');
      return `<div class="${cls}" data-count="${g.items.length}" data-zone="${zone}" data-batch="${g.batch}">${
        g.items.map((d, i) => chip(d, zone, i, g.items.length)).join('')}</div>`;
    }).join('');
  };

  wrap.innerHTML = `
    <div class="tray-row">
      <span class="tray-label">本回合<br><b>${v.discard.current.length}</b> 张</span>
      <div class="dlist" id="dlCurrent">${list(v.discard.current, 'current')}</div>
    </div>
    <div class="tray-row last">
      <span class="tray-label">上一回合<br><b>${v.discard.last.length}</b> 张</span>
      <div class="dlist" id="dlLast">${list(v.discard.last, 'last')}</div>
    </div>`;

  // 点一张牌 = 展开这一摞（完整卡片列表）
  wrap.querySelectorAll('.dstack').forEach(stackEl => {
    const zone = stackEl.dataset.zone;
    const batch = Number(stackEl.dataset.batch);
    const items = (zone === 'current' ? v.discard.current : v.discard.last)
      .filter(d => (d.batch || 0) === batch);
    stackEl.addEventListener('click', () => openStackModal(items, zone));
  });
}

/* ---------- 弃牌摞展开：每张完整显示（含说明） ---------- */
function openStackModal(items, zone) {
  document.getElementById('stackModal')?.remove();
  if (!items.length) return;

  const box = document.createElement('div');
  box.id = 'stackModal';
  box.className = 'stack-modal-mask';
  box.innerHTML = `
    <div class="stack-modal">
      <div class="sm-head">
        <span>${zone === 'current' ? '本回合弃牌' : '上一回合弃牌'} · <b>${items.length}</b> 张</span>
        <button class="mini-x" id="smClose">×</button>
      </div>
      <div class="sm-grid">
        ${items.map(d => {
          const def = CARD_DEFS[d.key];
          const f = cardFacts(d.key);
          const tag = d.tag === 'response' ? '回应' : d.tag === 'cast' ? '发布' : d.tag === 'rejected' ? '未采纳' : '';
          return `<div class="sm-card ${def.type}">
            ${tag ? `<span class="dc-tag on">${tag}</span>` : ''}
            <div class="sm-top"><span class="sm-name">${esc(def.name)}</span><span class="sm-cost">⚡${f.cost}</span></div>
            <div class="sm-facts"><span>${esc(f.main)}</span><span>${esc(f.sub)}</span>${
              d.targetGalaxy != null ? `<span class="sm-dest">目标 ${esc(galLabel(d.targetGalaxy))}</span>` : ''}</div>
            <div class="sm-desc">${esc(def.desc)}</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  document.body.appendChild(box);
  const close = () => fxExit(box, '.stack-modal');
  box.addEventListener('click', e => { if (e.target === box) close(); });
  box.querySelector('#smClose').addEventListener('click', close);
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });
}

function renderHand(v) {
  const me = v.players.find(p => p.id === v.me.id);
  const isMyTurn = v.currentPlayerId === v.me.id;
  // 换人提示期间不是"不能行动"，而是"先别动"——按钮照常显示，只是置灰
  const gated = !!(UI.gate && UI.gate.mine && Date.now() < UI.gate.until);
  const canAct = isMyTurn && v.step === 'action' && !v.broadcast && me.alive;
  const canUse = canAct && !gated;

  const builds = me.buildZone.map(c => {
    const def = CARD_DEFS[c.key], f = cardFacts(c.key);
    return `<span class="eq ${def.type}" title="${esc(def.name)}｜⚡${f.cost}｜${f.main}｜${f.sub}｜${esc(def.desc)}">
      <b>${esc(def.short)}</b><i>${esc(f.main)}</i></span>`;
  }).join('');
  $('#handHead').innerHTML = `
    <div class="me-chip" data-pid="${me.id}">
      <span class="me-av">${esc((me.name || '?').slice(0, 1))}</span>
      <span class="me-name">${esc(me.name)}</span>
      <span class="me-energy">⚡ ${me.energy}</span>
      <span class="me-gal">${esc(galLabel(me.galaxy))}</span>
    </div>
    <div class="me-builds">${builds || '<span class="dim small">尚未建设</span>'}</div>`;

  /* 手牌：平铺一行 */
  const hand = me.hand || [];
  const seen = UI.seenHand || (UI.seenHand = new Set());
  const prevSel = UI.prevSel || new Set();
  $('#hand').innerHTML = hand.map((c, i) => {
    const def = CARD_DEFS[c.key];
    const f = cardFacts(c.key);
    const sel = UI.selected.has(c.uid);
    const reserved = !!def.escape;   // 光速飞船：留着保命，不能主动打出
    const typeLabel = reserved ? '应急' : def.type === 'broadcast' ? '广播' : def.type === 'strike' ? '打击' : '建设';
    const glyph = def.type === 'broadcast' ? '广' : def.type === 'strike' ? '击' : '建';
    // 只给"这一帧才出现的状态"打标记，重绘不会把动画重播一遍
    const fresh = !seen.has(c.uid);
    const fx = fresh ? ' deal' : (sel && !prevSel.has(c.uid) ? ' rise' : (!sel && prevSel.has(c.uid) ? ' fall' : ''));
    return `<div class="pcard ${def.type}${sel ? ' selected' : ''}${me.energy >= def.cost ? '' : ' poor'}${reserved ? ' reserved' : ''}${fx}"
        data-uid="${c.uid}" title="${esc(def.name)}｜⚡${def.cost}｜${esc(f.main)}｜${esc(f.sub)}｜${esc(def.desc)}"
        style="z-index:${i + 1};--d:${i}">
      <span class="pc-glyph">${glyph}</span>
      <div class="pc-top"><span class="pc-cost">⚡${def.cost}</span><span class="pc-type">${typeLabel}</span></div>
      <div class="pc-name">${esc(def.name)}</div>
      <div class="pc-facts">
        <span class="pc-main">${esc(f.main)}</span>
        <span class="pc-sub">${esc(f.sub)}</span>
      </div>
    </div>`;
  }).join('') || '<div class="dim small" style="padding:16px">手里没有牌</div>';
  UI.prevSel = new Set(UI.selected);

  /* 「见过这张牌了」要等这一帧画完再落盘。
     开局 Net.start() 会在同一个任务里连发 state + lobby 两次 render，
     若立刻落盘，第二次就把刚发出去的牌当成旧牌，发牌动画还没画出来就被抹掉。
     rAF 之后才提交，同一帧里的连续重绘就都还认得出"这是新的"。 */
  if (!UI.seenScheduled) {
    const commit = () => {
      if (!UI.seenScheduled) return;
      UI.seenScheduled = false;
      (UI.pendingSeen || []).forEach(u => seen.add(u));
      UI.pendingSeen = [];
    };
    UI.seenScheduled = true;
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(commit);
    setTimeout(commit, 80);          // 后台标签页里 rAF 会被挂起，兜一下
  }
  (UI.pendingSeen = UI.pendingSeen || []).push(...hand.map(c => c.uid));

  /* 斗地主式按钮组：不出 / 提示 / 出牌 */
  const selCards = [...UI.selected].map(u => hand.find(c => c.uid === u)).filter(Boolean);
  const sel = selCards.length === 1 ? selCards[0] : null;
  const selDef = sel ? CARD_DEFS[sel.key] : null;
  const needTarget = selDef && (selDef.type === 'broadcast' || selDef.type === 'strike');
  const targetOk = UI.targetGalaxy && (!needTarget || (selDef.type === 'broadcast'
    ? galaxyDistance(me.galaxy, UI.targetGalaxy) <= selDef.dist : true));
  const canPlay = canUse && selCards.length === 1 && !selDef.escape && me.energy >= selDef.cost && (!needTarget || targetOk);
  const canDiscard = canUse && selCards.length > 0 && !v.discardUsed;

  if (!canAct) {
    const cp = v.players.find(p => p.id === v.currentPlayerId);
    const hint = !me.alive ? '你已出局，可继续观战'
      : v.broadcast ? '广播结算中……'
      : (v.thinking ? `${esc(cp ? cp.name : '')} 正在思考……` : `等待 ${esc(cp ? cp.name : '')} 行动……`);
    $('#actions').innerHTML = `<span class="hint">${hint}</span>`;
  } else {
    $('#actions').innerHTML = `
      <button class="pill pass" id="actPass" ${canUse ? '' : 'disabled'}>不出</button>
      <button class="pill hint" id="actHint" ${canUse ? '' : 'disabled'}>提示</button>
      <button class="pill play" id="actPlay" ${canPlay ? '' : 'disabled'}>出牌</button>
      <button class="pill mini danger" id="actDiscard"
        ${canDiscard ? '' : 'disabled'}
        title="${v.discardUsed
          ? (v.mode === 'standard' ? '标准对局：本回合已经出过牌，不能再弃' : '本回合已经弃置过了')
          : (v.mode === 'standard' ? '标准对局：弃牌后直接结束回合'
            : (selCards.length ? '一次可弃任意张' : '先选牌再弃置'))}">
        弃置${selCards.length ? ' ' + selCards.length + ' 张' : ''}</button>`;
  }

  $('#hand').querySelectorAll('.pcard').forEach(cardEl => {
    cardEl.addEventListener('click', () => {
      if (!canAct) return;
      const u = cardEl.dataset.uid;
      const c = hand.find(x => x.uid === u);
      if (c && CARD_DEFS[c.key].escape) {
        // 光速飞船：不能「出」（出牌按钮对它恒为灰），但**可以弃**——
        // 留着保命只是默认选择，用户想换牌时不该被拦住。
        // （曾经的 bug：这里直接 return，连选择都做不到，等于永远弃不掉。）
        if (UI.selected.has(u)) UI.selected.delete(u); else UI.selected.add(u);
        renderGame();
        return;
      }
      if (UI.selected.has(u)) UI.selected.delete(u); else UI.selected.add(u);
      renderGame();
    });
  });

  const bind = (id, fn) => { const b = $('#' + id); if (b) b.addEventListener('click', fn); };
  bind('actPass', () => { UI.selected.clear(); UI.targetGalaxy = null; Net.act({ type: 'end' }); });
  bind('actHint', () => {
    const usable = hand.filter(c => CARD_DEFS[c.key].cost <= me.energy && !CARD_DEFS[c.key].escape);
    if (!usable.length) return toast('没有打得出的牌，可以先「不出」');
    const order = { build: 0, broadcast: 1, strike: 2 };
    usable.sort((a, b) => order[CARD_DEFS[a.key].type] - order[CARD_DEFS[b.key].type]);
    const pick = usable[0];
    UI.selected = new Set([pick.uid]);
    const d = CARD_DEFS[pick.key];
    if (d.type === 'broadcast') {
      const reach = [1,2,3,4,5,6,7,8,9].filter(g => galaxyDistance(me.galaxy, g) <= d.dist && g !== me.galaxy);
      UI.targetGalaxy = UI.targetGalaxy && reach.includes(UI.targetGalaxy) ? UI.targetGalaxy : reach[0] || null;
    } else if (d.type === 'strike') {
      if (!UI.targetGalaxy || UI.targetGalaxy === me.galaxy) {
        UI.targetGalaxy = [1,2,3,4,5,6,7,8,9].find(g => g !== me.galaxy) || null;
      }
    }
    renderGame();
  });
  bind('actPlay', () => {
    if (!sel || !canPlay) return;
    if (selDef.type === 'build') Net.act({ type: 'build', uid: sel.uid });
    else if (selDef.type === 'broadcast') Net.act({ type: 'broadcast', uid: sel.uid, galaxy: UI.targetGalaxy });
    else Net.act({ type: 'strike', uid: sel.uid, galaxy: UI.targetGalaxy });
    UI.selected.clear(); UI.targetGalaxy = null;
  });
  bind('actDiscard', () => { Net.act({ type: 'discard', uids: [...UI.selected] }); UI.selected.clear(); });
}

function renderLog(v) {
  const lines = v.log || [];
  const key = l => `${l.turn}\u0001${l.text}`;
  /* 战报是"新的插在最前"（rules.js 用 unshift）。拿上一帧最新那条去比对，
     它前面有几条就是这一帧新增的——只让这几条滑进来。
     找不到（换局了 / 已经被 60 条上限挤掉）就当全是旧的，不补动画。 */
  let fresh = 0;
  if (UI.logTop) {
    for (let i = 0; i < lines.length && i <= 20; i++) {
      if (key(lines[i]) === UI.logTop) { fresh = i; break; }
    }
  }
  $('#log').innerHTML = lines.map((l, i) => {
    const isNew = i < fresh;
    const d = isNew ? ` style="--d:${Math.min(i, 4)}"` : '';
    return `<div class="logline ${l.kind}${isNew ? ' is-new' : ''}"${d}>` +
      `<span class="lt">T${l.turn}</span>${esc(l.text)}</div>`;
  }).join('');
  UI.logTop = lines.length ? key(lines[0]) : null;
}

/* ---------- 箭头 ---------- */
function drawArrow() {
  const v = Net.view;
  const layer = $('#arrowLayer');
  if (!v || !layer) return;
  const arrow = v.arrow;
  if (!arrow) { layer.innerHTML = ''; return; }

  const elapsed = Date.now() - arrow.at;
  const HOLD = 15000, FADE = 1200;
  if (elapsed > HOLD + FADE) { layer.innerHTML = ''; return; }

  // 窄屏（竖屏 / 手机）：布局是上下堆叠的，从座位卡画到弃牌托盘要横穿整个屏幕，
  // 会把星图、提示文字全部盖住。这种屏宽度下改为在牌块上直接写出是谁打的（.dc-who）。
  if (window.matchMedia && window.matchMedia('(max-width:1100px)').matches) {
    layer.innerHTML = '';
    return;
  }

  const from = document.querySelector(`.seat-card[data-pid="${arrow.playerId}"], .player-card[data-pid="${arrow.playerId}"]`);
  const targets = [...document.querySelectorAll('.dchip.arrowed')];
  if (!from || !targets.length) { layer.innerHTML = ''; return; }

  const o1 = from.getBoundingClientRect();
  const x1 = o1.right, y1 = o1.top + o1.height / 2;
  const op = elapsed <= HOLD ? 1 : Math.max(0, 1 - (elapsed - HOLD) / FADE);

  const paths = targets.map(t => {
    const o2 = t.getBoundingClientRect();
    const x2 = o2.left, y2 = o2.top + o2.height / 2;
    const mx = (x1 + x2) / 2;
    return `<path d="M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}" fill="none"
      stroke="rgba(232,182,76,${0.85 * op})" stroke-width="2" marker-end="url(#arrowHead)" opacity="${op}"/>`;
  }).join('');

  layer.innerHTML = `<defs><marker id="arrowHead" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
    <path d="M0,0 L6,3 L0,6 z" fill="rgba(232,182,76,${0.85 * op})"/></marker></defs>${paths}`;
  requestAnimationFrame(drawArrow);
}

/* ---------- 广播弹窗 ---------- */
function renderBroadcastModal(v) {
  const root = $('#modalRoot');
  if (!root) return;

  if (v.phase === 'ended') {
    const w = v.winner ? v.players.find(p => p.id === v.winner) : null;
    const heat = v.endReason === 'heat_death';
    const title = !w ? '所有文明均被清理'
      : heat ? `宇宙热寂 · ${esc(w.name)} 能量最高`
      : `${esc(w.name)} 成为最后的幸存者`;
    const sub = !w ? '全场无赢家。'
      : heat ? `第 ${v.turnIndex} 回合仍未分胜负，宇宙停止膨胀，能源耗尽——按能量排座次。`
      : '黑暗森林里，活到最后的人从不解释。';
    const html = `<div class="modal-mask"><div class="modal">
      <h2>${title}</h2>
      <p class="dim">${sub}</p>
      <div class="modal-actions"><button class="btn primary" id="againBtn">回到大厅</button></div>
    </div></div>`;
    // 内容没变就不重写 DOM（见 paintModal 的注释），重写会把入场动画又播一遍
    if (paintModal(root, html)) {
      $('#againBtn')?.addEventListener('click', () => { Net.leave(); location.reload(); });
    }
    return;
  }

  const B = v.broadcast;
  if (!B) { paintModal(root, ''); return; }

  const caster = v.players.find(p => p.id === B.casterId);
  // 发布阶段不显示合作/伪装：只有发布者自己能看见那一面
  const cardName = (B.card && B.card.name) || (B.card && CARD_DEFS[B.card.key] ? CARD_DEFS[B.card.key].name : '广播');

  if (B.stage === 'collecting') {
    const myCand = B.myCandidate;            // 只下发"我自己的"候选资格，名单不公开
    const otherCount = (B.candidateCount || 0) - (myCand ? 1 : 0);

    let body;
    if (myCand) {
      if (myCand.responded) {
        body = `<div class="waiting"><span class="spinner"></span>已提交，等待其他玩家…</div>`;
      } else {
        const opts = (myCand.options || []).map(o => {
          const def = CARD_DEFS[o.key];
          return `<button class="opt" data-uid="${o.uid}" data-face="${o.face}">
            ${def.short}（${o.face === 'coop' ? '合作' : '伪装'}）
            <span class="opt-meta">距离 ${fmtDist(def.dist)} · ⚡${def.cost}</span>
          </button>`;
        }).join('');
        body = `
          <div class="resp-row">
            <div class="resp-name">你可以回应 ${myCand.mandatory ? '<span class="badge warn">强制</span>' : ''}</div>
            <div class="resp-opts">
              ${opts}
              ${myCand.mandatory
                ? `<button class="opt locked" disabled>不回应<span class="opt-meta">被点名 · 不可弃权</span></button>`
                : `<button class="opt ghost" data-uid="">不回应<span class="opt-meta">放弃本次回应</span></button>`}
            </div>
          </div>`;
      }
    } else {
      body = `<div class="waiting"><span class="spinner"></span>等待响应…</div>`;
    }

    const me = v.players.find(p => p.id === v.me.id) || { hand: [] };
    let note;
    if (myCand) {
      note = myCand.mandatory
        ? '你被点名，<b>必须回应</b>，不能弃权。'
        : (myCand.canDecline ? '监听基地生效，你可以选择不回应。' : '你需要决定是否回应。');
    } else if (B.iAmCaster) {
      note = '广播已发出，正在等待回应（没人能回应时会自动结算）。';
    } else if (B.iAmTarget) {
      // 分清"没牌 / 没能量 / 距离不够"，否则玩家会以为系统坏了
      const bcs = (me.hand || []).filter(c => CARD_DEFS[c.key].type === 'broadcast');
      const inRange = bcs.filter(c => galaxyDistance(me.galaxy, B.targetGalaxy) <= CARD_DEFS[c.key].dist);
      if (!bcs.length) note = '你手里<b>没有广播牌</b>，无法回应（无需回应）。';
      else if (!inRange.length) note = '你的广播牌<b>距离不够</b>，无法回应（无需回应）。';
      else note = '你<b>能量不足</b>，付不起可回应的广播牌——无法回应（无需回应）。';
    } else {
      note = '你不在可回应范围内。';
    }

    const html = `<div class="modal-mask"><div class="modal">
      <h2>广播响应</h2>
      <p class="dim">${esc(caster.name)} 发布了「${esc(cardName)}」，目标星系 <b>${galLabel(B.targetGalaxy)}</b>。
      ${note}</p>
      ${body}
    </div></div>`;

    if (paintModal(root, html)) {
      root.querySelectorAll('.opt[data-uid]').forEach(btn => {
        btn.addEventListener('click', () => {
          Net.act({ type: 'respond', uid: btn.dataset.uid || null, face: btn.dataset.face || null });
        });
      });
    }
    return;
  }

  if (B.stage === 'choosing') {
    const responders = B.responders || [];
    if (B.isMyChoice) {
      // 回应者打了哪一面，结算前谁都看不到——这里只列"谁回应了"
      const rows = responders.map(r => {
        const p = v.players.find(x => x.id === r.playerId);
        return `<button class="choose-row" data-pid="${r.playerId}">
          <span>${esc(p.name)}</span>
          <span class="dim">已回应 · 面未公开</span></button>`;
      }).join('');
      const html = `<div class="modal-mask"><div class="modal">
        <h2>选择结算对象</h2>
        <p class="dim">多名玩家回应。你挑一名结算，其余人的牌会被弃掉（返还 1 点能量）。</p>${rows}
      </div></div>`;
      if (paintModal(root, html)) {
        root.querySelectorAll('.choose-row').forEach(btn => {
          btn.addEventListener('click', () => Net.act({ type: 'choose', targetId: btn.dataset.pid }));
        });
      }
    } else {
      paintModal(root, `<div class="modal-mask"><div class="modal">
        <h2>等待结算</h2>
        <p class="dim">${esc(caster.name)} 正在挑选回应者…</p>
        <div class="waiting"><span class="spinner"></span>等待响应…</div>
      </div></div>`);
    }
  }
}

/* ---------- 光速飞船：被打时的唯一一次生机 ---------- */
function renderEscapeModal(v) {
  const root = $('#modalRoot');
  if (!root) return;
  const E = v.escape;
  if (!E || !E.mine) return;      // 别人在决定：只在顶部 callout 提示

  const def = CARD_DEFS[E.cardKey];
  const html = `<div class="modal-mask"><div class="modal esc-modal">
      <h2 class="esc-title">⚠ 打击命中</h2>
      <p class="dim">你的星系即将被摧毁。你手里有一张「${esc(def.name)}」——</p>
      <ul class="esc-list">
        <li>弃置这张牌，支付 <b>⚡${E.cost}</b></li>
        <li>弃掉<b>全部建设牌</b>与<b>全部能量</b></li>
        <li>随机跃迁到一个空星系，<b>落点不公开</b></li>
      </ul>
      <p class="dim esc-note">光速飞船整局只能用一次。放弃则立即被淘汰。</p>
      <div class="esc-actions">
        <button class="btn primary" id="escGo">启动光速飞船</button>
        <button class="btn ghost" id="escNo">放弃</button>
      </div>
    </div></div>`;

  if (!paintModal(root, html)) return;
  $('#escGo').addEventListener('click', () => Net.act({ type: 'escape', use: true }));
  $('#escNo').addEventListener('click', () => Net.act({ type: 'escape', use: false }));
}

/* ---------- toast ---------- */
let toastTimer = null;
function toast(msg) {
  let t = $('#toast');
  if (!t) { t = el('div', 'toast'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

/* ---------- 主循环 ---------- */
function render() {
  // 背景分两种：入口/大厅是"黑暗森林"（松林 + 月光），牌桌上抬头换成星空
  if (typeof document !== 'undefined' && document.body)
    document.body.classList.toggle('in-game', !!Net.view);

  const scene = Net.view ? 'game' : (Net.room ? 'lobby' : 'entry');
  // 换场景：上一局"看过什么"全部作废，新一局的牌才会重新发一遍
  if (scene !== UI.scene) resetSceneFx();

  if (Net.view) renderGame();
  else if (Net.room) renderLobby();
  else renderEntry();

  markScene(scene);
  syncLoopPhase();
}

/* 清掉动效比对游标（只在换场景时调用） */
function resetSceneFx() {
  UI.seenHand = null;
  UI.pendingSeen = null;
  UI.seenScheduled = false;
  UI.prevSel = null;
  UI.discardSig = undefined;
  UI.dimmedSet = null;
  UI.logTop = null;
  UI.calloutHTML = null;
  UI.seatSet = null;
  UI.deckCount = null;
  UI.logOpen = false;
  clearTimeout(UI.sceneTimer);
}

/* 场景入场：入口 → 大厅 → 牌桌各播一次。
   renderGame() 在对局里会被频繁调用（每次操作、每次 AI 推进），
   而 .hud/.board/.mybar 每次都是新建的 DOM——只要 #app 上还挂着 scene-in，
   新建出来的元素就会把整屏入场动画从头播一遍（表现为「点一下牌，整屏闪一下」）。
   所以入场播完就把类摘掉，之后的任何重绘都不再带动画。 */
function markScene(name) {
  const app = $('#app');
  if (!app || UI.scene === name) return;
  UI.scene = name;
  clearTimeout(UI.sceneTimer);
  app.classList.remove('scene-in');
  void app.offsetWidth;            // 强制回流，同名 class 才会重新触发动画
  app.classList.add('scene-in');
  // 最长的一条是入口页的错峰（240ms 延迟 + 440ms），留到 720ms 收尾
  UI.sceneTimer = setTimeout(() => app.classList.remove('scene-in'), 720);
}

/* 无限循环的装饰动画（目标呼吸、虚线推进、头像涟漪、更新角标）
   在元素被重建时都会从 0 重新开始，点牌时看着就像"闪了一下"。
   用负的 animation-delay 把它们接到原来的相位上跑，重绘就看不出来了。 */
function syncLoopPhase() {
  const app = $('#app');
  if (!app) return;
  const now = (typeof performance !== 'undefined' && performance.now)
    ? performance.now() : Date.now();
  app.style.setProperty('--ph-a', `-${Math.round(now % 1900)}ms`);   // 1.9s 一组
  app.style.setProperty('--ph-b', `-${Math.round(now % 900)}ms`);    // 0.9s：虚线
  app.style.setProperty('--ph-c', `-${Math.round(now % 2200)}ms`);   // 2.2s：角标
}

Net.on((type, payload) => {
  if (type === 'state') { render(); }
  else if (type === 'lobby') { render(); }
  else if (type === 'joined') { if (!Net.view) render(); }
  else if (type === 'error') { toast(payload); }
  else if (type === 'close') {
    const c = $('#connState');
    if (c) c.textContent = '重连中…';
  }
});

setInterval(() => {
  const v = Net.view;
  if (v && v.arrow && Date.now() - v.arrow.at < 16500) drawArrow();
}, 500);

// 毛玻璃偏好要尽早生效：等到 DOMContentLoaded 再套会先闪一下不透明面板
applyUiPref(loadUiPref());

window.addEventListener('DOMContentLoaded', () => {
  Net.autoResume();   // 若本地有会话则自动回到原席位
  render();
});
