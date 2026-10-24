/* ============================================================
 * server/test-ui.js — 前端渲染冒烟测试
 *
 * 为什么需要它：`strikeTarget: 'hidden'` 这类裁剪一旦做错，规则测试全绿、
 * 界面上却可能把「目标不明」画成具体星系。这里用 jsdom 跑真实的 web/js/ui.js，
 * 喂真实 viewFor 产出的视图，只断言"画出来的东西里有没有不该有的信息"。
 *
 * 依赖 jsdom（可选）：`cd server && npm i jsdom`；没装就跳过，不算失败。
 * 运行：node server/test-ui.js
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch {
  console.log('跳过 UI 冒烟测试：未安装 jsdom（cd server && npm i jsdom）');
  process.exit(0);
}

const { createGame } = require('../shared/rules.js');
const { viewFor } = require('../shared/view.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };

const dom = new JSDOM(
  '<!doctype html><html><body><div id="app"></div><div id="conn"></div></body></html>',
  { url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'outside-only' }
);
const w = dom.window;

w.eval(fs.readFileSync(path.join(ROOT, 'shared/cards.js'), 'utf8'));
w.eval(fs.readFileSync(path.join(ROOT, 'shared/rules.js'), 'utf8'));
w.eval(fs.readFileSync(path.join(ROOT, 'shared/view.js'), 'utf8'));
// 用假的 Net 驱动渲染：ui.js 只依赖 Net.view / Net.room / Net.me
w.eval(`var Net = {
  view: null, room: null, me: { playerId: 'p0' }, local: true, canLan: false,
  on(fn){}, act(){}, leave(){}, setMode(){}, setStrikeTarget(){}, addAI(){}, removeAI(){}, start(){},
  name(){ return ''; }, setName(){}, autoResume(){ return false; }, hasSession(){ return false; }, lanUrl(){ return null; }
};`);
w.eval(fs.readFileSync(path.join(ROOT, 'web/js/ui.js'), 'utf8') + `
  // const 只活在这次 eval 的作用域里，必须显式挂到 window 才能被测试驱动
  window.__UI = UI;
  window.__render = render;
`);

function show(view, pid) {
  w.Net.view = view;
  w.Net.me = { playerId: pid };
  w.__UI.gate = null;
  w.__UI.turnKey = null;
  w.__render();
  return w.document.querySelector('#app').innerHTML;
}

console.log('=== UI 1. 隐藏打击目标：在飞打击不写目的地 ===');
const g = createGame(['A', 'B', 'C'], { strikeTarget: 'hidden' });
const S = g.state();
S.players[0].galaxy = 1; S.players[1].galaxy = 4; S.players[2].galaxy = 5;
S.players[0].energy = 20;
S.players[0].hand = [{ uid: 'x1', key: 'photoid' }];
S.currentIdx = 0; S.step = 'action';
g.playStrike('p0', 'x1', 4);

let html = show(viewFor(g, 'p1'), 'p1');
ok(html.indexOf('暗打') >= 0, 'HUD 应显示「暗打」徽章');
ok(html.indexOf('目标不明') >= 0, '中央提示应写「目标不明」');
ok(/mini strike blind/.test(html), '座位卡上的打击应带 blind 样式');
ok(/→<\/b>\? 已0手/.test(html), '座位卡应显示「→ ? 已0手」');
ok(html.indexOf('strike-tag') < 0, '隐藏模式的打击不往星图上钉目的地标签');

console.log('=== UI 2. 发起者自己：目标照常可见 ===');
const htmlMe = show(viewFor(g, 'p0'), 'p0');
ok(htmlMe.indexOf('巴纳德') >= 0, '发起者看得到自己的目标');
ok(!/mini strike blind/.test(htmlMe), '发起者的打击不该标 blind');

console.log('=== UI 3. 公开模式：与旧版一致 ===');
const g2 = createGame(['A', 'B'], { strikeTarget: 'open' });
const S2 = g2.state();
S2.players[0].galaxy = 1; S2.players[1].galaxy = 5;
S2.players[0].energy = 20;
S2.players[0].hand = [{ uid: 'y1', key: 'nuke' }];
S2.currentIdx = 0; S2.step = 'action';
g2.playStrike('p0', 'y1', 4);
const htmlOpen = show(viewFor(g2, 'p1'), 'p1');
ok(htmlOpen.indexOf('暗打') < 0, '公开模式不显示「暗打」');
ok(htmlOpen.indexOf('巴纳德') >= 0, '公开模式看得到目标');
ok(htmlOpen.indexOf('strike-tag') >= 0, '公开模式打击会钉在目标星系上');

console.log('=== UI 4. 科技锁死：弃牌堆里标出落点 ===');
const g3 = createGame(['A', 'B'], { strikeTarget: 'hidden' });
const S3 = g3.state();
S3.players[0].galaxy = 1; S3.players[1].galaxy = 4;
S3.players[0].energy = 20;
S3.players[1].buildZone = [{ uid: 'z1', key: 'solar' }];
S3.players[0].hand = [{ uid: 'z2', key: 'lock' }];
S3.currentIdx = 0; S3.step = 'action';
g3.playStrike('p0', 'z2', 4);
const htmlLock = show(viewFor(g3, 'p1'), 'p1');
ok(htmlLock.indexOf('dc-dest') >= 0, '弃牌条目应带落点样式');
ok(htmlLock.indexOf('4·巴纳德') >= 0, '弃牌条目应写出「4·巴纳德」');

console.log('=== UI 5. 落地播报 ===');
const g4 = createGame(['A', 'B'], { strikeTarget: 'hidden' });
const S4 = g4.state();
S4.players[0].galaxy = 1; S4.players[1].galaxy = 4;
S4.players[0].energy = 20;
S4.players[0].hand = [{ uid: 'w1', key: 'photoid' }];
S4.players[1].hand = [{ uid: 'w2', key: 'solar' }];
S4.currentIdx = 0; S4.step = 'action';
g4.playStrike('p0', 'w1', 4);
g4.endTurn('p0');
S4.step = 'action';
g4.endTurn('p1');            // p0 回合开始 → 打击结算
w.Net.view = viewFor(g4, 'p1');
w.Net.me = { playerId: 'p1' };
w.__UI.gate = null;
w.__UI.strikeSeq = 0;        // 视作已看过历史，只看这一下
w.__UI.strikeReveal = null;
w.__render();
const htmlHit = w.document.querySelector('#app').innerHTML;
ok(htmlHit.indexOf('落在') >= 0, '落地应播报落点');
ok(htmlHit.indexOf('巴纳德') >= 0, '播报里应写出星系名');
ok(/callout reveal/.test(htmlHit), '播报用 reveal 样式');

console.log('=== UI 6. 房间页：设置收进齿轮、加对手是折叠菜单 ===');
w.Net.view = null;
w.Net.room = {
  roomId: 'ABCDE', hostId: 'p0', started: false, mode: 'standard', strikeTarget: 'hidden',
  seats: [
    { playerId: 'p0', name: 'A', connected: true, isAI: false },
    { playerId: 'p1', name: 'B', connected: true, isAI: true, aiLevel: 'sophon' },
  ],
  levels: [],
};
w.Net.me = { playerId: 'p0' };
w.__render();
const lobbyHtml = w.document.querySelector('#app').innerHTML;
ok(lobbyHtml.indexOf('id="settingsBtn"') >= 0, '房主应看到右上角的设置按钮');
ok(lobbyHtml.indexOf('<details') >= 0, '添加对手应是折叠菜单');
ok(lobbyHtml.indexOf('rule-line') >= 0 && lobbyHtml.indexOf('目标隐藏') >= 0, '规则摘要应带上当前设置');
ok(lobbyHtml.indexOf('data-strike=') < 0, '对局设置本体不该铺在大厅里');
ok(lobbyHtml.indexOf('对手 · 智子') >= 0, '人机席位应显示为「对手」');

w.openSettings();
const sm = w.document.querySelector('#settingsModal');
ok(!!sm, '点齿轮应弹出设置');
ok(sm && sm.querySelectorAll('[data-strike]').length === 2, '设置里应有两个打击目标选项');
ok(sm && sm.querySelectorAll('[data-mode]').length === 2, '设置里应有两个节奏选项');
ok(!!(sm && sm.querySelector('.set-opt.on')), '当前取值应高亮');
sm && sm.remove();

/* ---------- 7. 入口页的「下载安卓版」 ----------
 * 只验证两种结局：后端给了 apk.json 就画出入口；没给就什么都不画（不留死链）。*/
(async () => {
  console.log('=== UI 7. 下载安卓版入口 ===');
  w.Net.view = null;
  w.Net.room = null;
  w.Net.me = { playerId: 'p0' };

  // 后端有安装包
  w.eval(`window.fetch = () => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ version: '1.0.1', file: 'dark-forest.apk', bytes: 338130 })
  });`);
  w.__render();
  await new Promise(r => setTimeout(r, 0));
  let slot = w.document.querySelector('#apkSlot');
  ok(!!slot && slot.innerHTML.indexOf('下载客户端') >= 0, '有 apk.json 时应画出下载入口');
  ok(!!slot && slot.querySelectorAll('.apk-get').length === 1, '入口页只画一个下载按钮');
  // 具体的平台条目在弹层里
  const dlBtn0 = w.document.querySelector('#dlBtn');
  dlBtn0 && dlBtn0.click();
  const dlg0 = w.document.querySelector('#dlDialog');
  const l0 = dlg0 ? [...dlg0.querySelectorAll('a.apk-get')] : [];
  ok(l0.length === 1, '弹层里应有安卓版一条，实际 ' + l0.length);
  ok(l0[0] && l0[0].href.indexOf('/download/dark-forest.apk') >= 0, '链接应指向 /download/ 短链');
  ok(l0[0] && l0[0].textContent.indexOf('v1.0.1') >= 0, '应显示版本号');
  ok(l0[0] && l0[0].textContent.indexOf('330 KB') >= 0, '应显示体积（338130 → 330 KB）');
  ok(l0[0] && /download="黑暗森林-v1\.0\.1\.apk"/.test(l0[0].outerHTML), '下载文件名应友好');
  dlg0 && dlg0.remove();

  // 后端没有安装包（局域网 / 纯网页部署）
  w.eval(`window.fetch = () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) });`);
  w.__UI.apk = null;
  w.__render();
  await new Promise(r => setTimeout(r, 0));
  slot = w.document.querySelector('#apkSlot');
  ok(!slot || slot.innerHTML === '', '拿不到 apk.json 时不应渲染任何入口');

  console.log('=== UI 8. 版本比较与 APK 更新提示 ===');
  ok(w.compareVer('1.0.10', '1.0.9') === 1, '1.0.10 应大于 1.0.9（不能按字符串比）');
  ok(w.compareVer('1.0.1', '1.0.1') === 0, '同版本应相等');
  ok(w.compareVer('1.0.2', '1.0.11') === -1, '1.0.2 应小于 1.0.11');

  // 假装自己是 APK：本机 1.0.0，线上 1.0.1 → 右上角出现提示
  // 同时验证 file:// 下必须拼绝对地址（相对路径会变成 file:///download/… 发不出去）
  w.eval(`window.DF_APP = 1; window.DF_VERSION = '1.0.0'; window.DF_SERVER = 'https://darkforest.dpdns.org';`);
  w.eval(`window.__lastFetch = null;
    window.fetch = (u) => { window.__lastFetch = u; return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        version: '1.0.3', file: 'dark-forest.apk', bytes: 338130,
        notes: ['1.0.3 的改动'],
        history: {
          '1.0.0': ['这条不该出现（本机就是 1.0.0）'],
          '1.0.1': ['新增「毛玻璃」板块，可根据喜好调节浓度'],
          '1.0.2': ['更新前新增确认弹窗，展示版本号与安装包体积'],
          '1.0.3': ['合并展示跨版本改动，直接安装最新版'],
          '1.0.4': ['这条也不该出现（比目标版本还新）']
        } })
    }); };`);
  w.__render();
  await new Promise(r => setTimeout(r, 0));
  ok(w.__lastFetch === 'https://darkforest.dpdns.org/download/apk.json',
    'APK 里应请求绝对地址，实际 ' + w.__lastFetch);
  const badge = w.document.querySelector('#updateBadge');
  ok(!!badge, '线上版本更新时应出现小圆点提示');
  ok(!!badge && /v1\.0\.3/.test(badge.title), '提示里应写清新版本号');

  // 本机已是最新 → 不提示
  badge && badge.remove();
  w.eval(`window.DF_VERSION = '1.0.3';`);
  w.__render();
  await new Promise(r => setTimeout(r, 0));
  ok(!w.document.querySelector('#updateBadge'), '已是最新版本时不该提示');

  /* 点更新要走「应用内下载」，不是把用户甩到浏览器 */
  console.log('=== UI 9. 点更新：先弹应用内对话框，确认才下载 ===');
  w.eval(`window.DF_VERSION = '1.0.0';
    window.__calls = [];
    window.__nativeDialogs = 0;
    window.confirm = () => { window.__nativeDialogs++; return true; };
    window.alert = () => { window.__nativeDialogs++; };
    window.Android = {
      downloadApk: u => { window.__calls.push(['download', u]); return '{"ok":true}'; },
      installDownloaded: () => { window.__calls.push(['install']); return '{"ok":false,"error":"还没有下载好的安装包"}'; },
      openUrl: u => { window.__calls.push(['openUrl', u]); },
    };`);
  w.__render();
  await new Promise(r => setTimeout(r, 0));
  const badge2 = w.document.querySelector('#updateBadge');
  ok(!!badge2, '有新版时应出现提示按钮');

  // 点一下只弹窗，不能直接下
  badge2 && badge2.click();
  const ud = w.document.querySelector('#updateDialog');
  ok(!!ud, '点「新版本」应弹出应用内对话框');
  const udHtml = ud ? ud.innerHTML : '';
  ok(udHtml.indexOf('发现新版本') >= 0, '对话框应写明「发现新版本」');
  ok(udHtml.indexOf('v1.0.3') >= 0, '对话框应显示新版本号');
  ok(udHtml.indexOf('当前 v1.0.0') >= 0, '对话框应显示当前版本号');
  ok(udHtml.indexOf('立即更新') >= 0 && udHtml.indexOf('稍后再说') >= 0, '应给「立即更新 / 稍后再说」两个选择');
  ok(udHtml.indexOf('完整安装包') >= 0, '应说明下载的是完整安装包');

  // 跨版本：三个版本各一组，标题里带版本数
  ok(udHtml.indexOf('本次更新 · 3 个版本') >= 0, '跨 3 个版本时标题应标明版本数');
  ok(udHtml.indexOf('落后 3 个版本，直接更新到最新版') >= 0, '应说明直接装最新版、不用逐个更新');
  ok(udHtml.indexOf('v1.0.3') >= 0 && udHtml.indexOf('v1.0.2') >= 0 && udHtml.indexOf('v1.0.1') >= 0,
    '三个版本的改动都要列出');
  ok(udHtml.indexOf('新增「毛玻璃」板块，可根据喜好调节浓度') >= 0, '应列出 1.0.1 的改动');
  ok(udHtml.indexOf('更新前新增确认弹窗，展示版本号与安装包体积') >= 0, '应列出 1.0.2 的改动');
  ok(udHtml.indexOf('这条不该出现') < 0, '本机已装版本（1.0.0）的改动不该列');
  ok(udHtml.indexOf('这条也不该出现') < 0, '比目标更新（1.0.4）的改动不该列');
  ok((udHtml.match(/dlg-verline/g) || []).length === 3, '应有 3 个版本小标题');
  ok(udHtml.indexOf('<ul class="dlg-list">') >= 0, '清单要用 ul 渲染');
  ok((w.__calls || []).length === 0, '还没确认，不该开始下载');

  // 稍后再说：关掉就什么都不做
  ud && ud.querySelector('[data-close]').click();
  ok(!w.document.querySelector('#updateDialog'), '点「稍后再说」应关闭对话框');
  ok((w.__calls || []).length === 0, '取消后不该下载');

  // 再来一次，点「立即更新」
  badge2 && badge2.click();
  const ud2 = w.document.querySelector('#updateDialog');
  ud2 && ud2.querySelector('[data-ok]').click();
  const calls = w.__calls || [];
  ok(!w.document.querySelector('#updateDialog'), '确认后对话框应关闭');
  ok(calls.some(c => c[0] === 'download'), '确认后应调用原生 downloadApk');
  ok(calls.filter(c => c[0] === 'download').every(c => /^https:\/\/darkforest\.dpdns\.org\/download\//.test(c[1])),
    '下载地址应是绝对地址，实际 ' + JSON.stringify(calls));
  ok(!calls.some(c => c[0] === 'openUrl'), '不该再甩到系统浏览器');
  ok(badge2 && /下载中/.test(badge2.innerHTML), '下载期间按钮应显示「下载中」');

  // 下过一次之后再点：直接装，不重复下载
  w.eval(`window.__calls = [];
    window.Android.installDownloaded = () => { window.__calls.push(['install']); return '{"ok":true}'; };`);
  w.__UI.updateDownloaded = 'dark-forest.apk';
  if (badge2) badge2.disabled = false;
  badge2 && badge2.click();
  const ud3 = w.document.querySelector('#updateDialog');
  ud3 && ud3.querySelector('[data-ok]').click();
  ok((w.__calls || []).some(c => c[0] === 'install'), '已下过时应走「直接安装」');
  ok(!(w.__calls || []).some(c => c[0] === 'download'), '已下过时不该重复下载');

  // 全程不能碰浏览器原生弹窗
  ok(w.__nativeDialogs === 0, '整个过程不该出现原生 alert/confirm，实际 ' + w.__nativeDialogs + ' 次');

  // 老的 apk.json 没有 notes 字段：不能因此崩，也不能留个空标题
  badge2 && (badge2.disabled = false);
  w.document.getElementById('updateDialog')?.remove();
  w.document.getElementById('updateBadge')?.remove();
  w.eval(`window.fetch = () => Promise.resolve({ ok:true,
    json: () => Promise.resolve({ version: '1.0.3', file: 'dark-forest.apk', bytes: 338130,
      notes: ['只有单版本清单时的兜底文案'] }) });`);
  w.__render();
  await new Promise(r => setTimeout(r, 0));
  const badge3 = w.document.querySelector('#updateBadge');
  badge3 && badge3.click();
  const ud4 = w.document.querySelector('#updateDialog');
  ok(!!ud4, '没有 history 时弹窗照常出现');
  ok(!!ud4 && ud4.innerHTML.indexOf('只有单版本清单时的兜底文案') >= 0, '没有 history 应退回 notes');
  ok(!!ud4 && ud4.innerHTML.indexOf('dlg-verline') < 0, '只有一组时不画版本小标题');
  const ud4b = w.document.querySelector('#updateDialog');
  ud4b && ud4b.remove();
  w.document.getElementById('updateBadge')?.remove();
  w.eval(`window.fetch = () => Promise.resolve({ ok:true,
    json: () => Promise.resolve({ version: '1.0.3', file: 'dark-forest.apk', bytes: 338130 }) });`);
  w.__render();
  await new Promise(r => setTimeout(r, 0));
  const badge4 = w.document.querySelector('#updateBadge');
  badge4 && badge4.click();
  const ud5 = w.document.querySelector('#updateDialog');
  ok(!!ud5, '连 notes 都没有时弹窗仍然出现');
  ok(!!ud5 && ud5.innerHTML.indexOf('本次更新') < 0, '没有清单时不该留空标题');
  ud5 && ud5.querySelector('[data-close]').click();

console.log('=== UI 10. 对局中换星空背景 ===');
  // 牌桌上 body 应带 in-game（CSS 据此把背景换成星空），入口/大厅不带
  show(viewFor(g, 'p1'), 'p1');
  ok(w.document.body.classList.contains('in-game'), '对局中 body 应有 in-game');
  w.Net.view = null;
  w.Net.room = null;
  w.__render();
  ok(!w.document.body.classList.contains('in-game'), '入口页不该带 in-game');
  w.Net.room = {
    roomId: 'ABCDE', hostId: 'p0', started: false, mode: 'standard', strikeTarget: 'open',
    seats: [{ playerId: 'p0', name: 'A', connected: true, isAI: false }], levels: [],
  };
  w.__render();
  ok(!w.document.body.classList.contains('in-game'), '大厅还没开局，不该换星空');

  // 样式表里真的有这张图和这条规则（防止以后改背景把对局那张弄丢）
  const css = fs.readFileSync(path.join(ROOT, 'web/style.css'), 'utf8');
  ok(/img\/bg-space\.jpg/.test(css), '样式表应引用 bg-space.jpg');
  ok(/body\.in-game\s+#app::before\{opacity:1\}/.test(css), '应有「对局中显示星空层」的规则');
  ok(fs.existsSync(path.join(ROOT, 'web/img/bg-space.jpg')), 'bg-space.jpg 应存在');

  console.log('=== UI 11. 点头像看对手详情 ===');
  const g5 = createGame(['甲', '乙', '丙'], { strikeTarget: 'open' });
  const S5 = g5.state();
  S5.players[0].galaxy = 1;
  S5.players[1].galaxy = 4; S5.players[1].energy = 9;
  S5.players[2].galaxy = 7; S5.players[2].energy = 4;
  S5.players[1].buildZone = [{ uid: 'a1', key: 'fusion' }, { uid: 'a2', key: 'bunker' }];
  S5.players[1].hand = [{ uid: 'h1', key: 'nuke' }, { uid: 'h2', key: 'solar' }];
  S5.currentIdx = 0; S5.step = 'action';
  show(viewFor(g5, 'p0'), 'p0');

  const seatB = w.document.querySelector('.seat-card[data-pid="p1"]');
  ok(!!seatB, '对手座位卡应在场');
  ok(seatB && seatB.classList.contains('clickable'), '对手座位卡应可点');
  ok(!w.document.querySelector('.seat-card[data-pid="p0"]'), '自己的席位不在对手列表里');

  seatB && seatB.click();
  const pm = w.document.querySelector('#playerModal');
  ok(!!pm, '点头像应弹出详情弹窗');
  const phtml = pm ? pm.innerHTML : '';
  ok(phtml.indexOf('乙') >= 0, '弹窗应显示玩家名称');
  ok(phtml.indexOf('⚡9') >= 0, '弹窗应显示能量');
  ok(phtml.indexOf('聚变反应堆') >= 0, '弹窗应列出建设牌名称');
  ok(phtml.indexOf('每回合开始时，能量 +1') >= 0, '建设牌应带完整效果说明');
  ok(phtml.indexOf('掩体星环') >= 0, '第二张建设牌也要列出');
  ok(phtml.indexOf('巴纳德星') < 0, '弹窗不该泄露对手坐标（乙在 4 号星系）');
  ok(phtml.indexOf('pm-empty') < 0, '有建设牌时不显示空态');

  pm && pm.querySelector('#pmClose').click();
  ok(!w.document.querySelector('#playerModal'), '点 × 应关闭弹窗');

  // 没建设的对手：给空态，不给空白
  const seatC = w.document.querySelector('.seat-card[data-pid="p2"]');
  seatC && seatC.click();
  const pm2 = w.document.querySelector('#playerModal');
  ok(!!pm2 && pm2.innerHTML.indexOf('还没有建设任何牌') >= 0, '无建设时应显示空态提示');
  pm2 && pm2.remove();

  console.log('=== UI 12. 顶栏只报牌库数量，不列牌 ===');
  const g6 = createGame(['甲', '乙'], { strikeTarget: 'open' });
  const S6 = g6.state();
  S6.players[0].galaxy = 1; S6.players[1].galaxy = 5;
  show(viewFor(g6, 'p0'), 'p0');
  const bar = w.document.querySelector('#counterBar').innerHTML;
  ok(/牌库/.test(bar), '应显示「牌库」');
  ok(new RegExp('>' + S6.deck.length + '<').test(bar), '应显示剩余张数（牌库 ' + S6.deck.length + '）');
  ok(bar.indexOf('cnt-group') < 0, '不该再有分组');
  ok(bar.indexOf('光粒') < 0 && bar.indexOf('热核') < 0, '不该列出牌库里有哪些牌');
  ok(w.document.querySelectorAll('#counterBar .cnt').length === 0, '记牌器小方块应全部移除');

  console.log('=== UI 13. 入口设置：改名 + 毛玻璃 ===');
  w.Net.view = null;
  w.Net.room = null;
  w.Net.setName = v => { w.__savedName = v; };
  w.eval(`try { localStorage.removeItem('df_ui_pref'); } catch (e) {}`);
  w.applyUiPref(w.loadUiPref());
  w.__render();

  ok(!!w.document.querySelector('#prefBtn'), '入口页应有设置按钮');
  w.document.querySelector('#prefBtn').click();
  const pbox = w.document.querySelector('#prefModal');
  ok(!!pm, '点设置应弹出面板');
  const pmHtml = pbox ? pbox.innerHTML : '';
  ok(pmHtml.indexOf('名字') < 0, '设置里不再有名字编辑（名字只在入口页输入）');
  ok(pmHtml.indexOf('毛玻璃') >= 0, '面板里应有毛玻璃开关');
  ok(!!(pbox && pbox.querySelector('#prefLevel')), '应有浓度滑杆');

  // 默认开，并且真的把变量写到 body 上
  ok(w.document.body.classList.contains('frost'), '毛玻璃默认开启');
  const a0 = parseFloat(w.document.body.style.getPropertyValue('--frost-a') || '0');
  ok(a0 > 0, '应写入 --frost-a，实际 ' + a0);
  // 默认浓度 0%（滑杆最左）→ 映射到区间下界 0.40，要"看得出是玻璃"又不压字
  ok(Math.abs(a0 - 0.40) < 0.001, '默认浓度应为 0%（--frost-a = 0.40），实际 ' + a0);
  ok(/px$/.test(w.document.body.style.getPropertyValue('--frost-blur')), '应写入 --frost-blur');

  // 拉高浓度 → 面板更不透明（模糊也跟着变强）
  const range = pbox.querySelector('#prefLevel');
  range.value = '95';
  range.dispatchEvent(new w.Event('input', { bubbles: true }));
  const a1 = parseFloat(w.document.body.style.getPropertyValue('--frost-a') || '0');
  ok(a1 > a0, '浓度调高后不透明度应变大（' + a0 + ' → ' + a1 + '）');
  ok(pbox.querySelector('#prefVal').textContent === '95%', '应显示当前浓度百分比');

  // 关掉
  pbox.querySelector('#prefFrost').click();
  ok(!w.document.body.classList.contains('frost'), '关掉后应移除 frost 类');
  const saved = JSON.parse(w.localStorage.getItem('df_ui_pref') || '{}');
  ok(saved.frost === false, '开关状态应落盘');
  ok(!!(pbox.querySelector('#prefLevel').disabled), '关掉后浓度滑杆应变灰');

  // 名字编辑已从设置里去掉（名字只在入口页输入）
  ok(!pbox.querySelector('#prefName'), '设置里不应再有名字输入框');
  ok(!pbox.querySelector('#prefNameSave'), '设置里不应再有名字保存按钮');
  ok(pbox.innerHTML.indexOf('名字') < 0, '设置面板不应出现「名字」字样');

  pbox.remove();
  w.applyUiPref({ frost: true, level: 0.55 });

  // 样式表里必须有这两条，否则开关点了没效果
  const css13 = fs.readFileSync(path.join(ROOT, 'web/style.css'), 'utf8');
  ok(/body\.frost\{/.test(css13), '应有 body.frost 的变量覆盖');
  ok(/body\.frost\s+\.hud/.test(css13), '大面板应加 backdrop-filter');

  console.log('=== UI 14. 退出对局：内置弹窗，不用 confirm ===');
  show(viewFor(g, 'p1'), 'p1');
  w.eval(`window.__nativeDialogs = 0;`);
  const leaveBtn = w.document.querySelector('#leaveBtn');
  ok(!!leaveBtn, '对局里应有退出按钮');
  leaveBtn && leaveBtn.click();
  const dd = w.document.querySelector('#appDialog');
  ok(!!dd, '点退出应弹出内置确认框');
  ok(!!dd && dd.innerHTML.indexOf('退出对局') >= 0, '确认框应写明「退出对局」');
  ok(!!dd && /退出/.test(dd.innerHTML) && /继续玩/.test(dd.innerHTML), '应给「退出 / 继续玩」两个选择');
  ok(w.__nativeDialogs === 0, '不该调用原生 confirm，实际 ' + w.__nativeDialogs + ' 次');
  dd && dd.querySelector('[data-close]').click();
  ok(!w.document.querySelector('#appDialog'), '点「继续玩」应关闭');

  console.log('=== UI 15. 对局内也能调毛玻璃，与入口同一套 ===');
  w.applyUiPref({ frost: true, level: 0.45 });
  show(viewFor(g, 'p1'), 'p1');
  ok(!!w.document.querySelector('#prefBtnGame'), '对局顶栏应有设置齿轮');
  ok(w.document.body.classList.contains('in-game') && w.document.body.classList.contains('frost'),
    '对局里毛玻璃应继续生效');

  const a5 = parseFloat(w.document.body.style.getPropertyValue('--frost-a') || '0');
  w.document.querySelector('#prefBtnGame').click();
  const pm5 = w.document.querySelector('#prefModal');
  ok(!!pm5, '对局里点齿轮应打开同一套设置');
  ok(!!(pm5 && pm5.querySelector('#prefLevel')), '对局里的设置也带浓度滑杆');

  const r5 = pm5.querySelector('#prefLevel');
  r5.value = '5';
  r5.dispatchEvent(new w.Event('input', { bubbles: true }));
  const a6 = parseFloat(w.document.body.style.getPropertyValue('--frost-a') || '0');
  ok(a6 < a5, '调低浓度应立即变透（' + a5 + ' → ' + a6 + '）');
  ok(w.document.body.classList.contains('in-game'), '改设置不该把对局状态弄丢');

  pm5.querySelector('#prefFrost').click();
  ok(!w.document.body.classList.contains('frost') && w.document.body.classList.contains('in-game'),
    '关掉毛玻璃后仍在对局里（只是面板回到实色）');
  pm5.remove();
  w.applyUiPref({ frost: true, level: 0.45 });

  console.log('=== UI 16. 入口页下载入口：聚合成一个「下载客户端」按钮 ===');
  // 第 9 节设过 window.DF_APP（模拟安卓壳），入口函数会因此整块跳过——先删掉
  w.eval(`delete window.DF_APP; window.__UI.desktop = null; window.__UI.apk = null;
    window.fetch = (u) => {
      if (String(u).indexOf('desktop.json') >= 0) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ title: 'Windows 版', items: [
          { label: '下载 Windows 版（轻量）', sub: 'v1.0.18 · 1.5 MB', url: '/download/dark-forest-1.0.18-tauri-setup.exe', file: 'dark-forest-1.0.18-tauri-setup.exe' },
          { label: '下载 Windows 版（完整）', sub: 'v1.0.18 · 105 MB', url: 'https://github.com/x/darkforest-web/releases/download/v1.0.18/dark-forest-1.0.18-win64-setup.exe' },
        ] }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ version: '1.0.18', file: 'dark-forest.apk', bytes: 657691, notes: [] }) });
    };`);
  show(null, null);
  await new Promise(r => setTimeout(r, 30));
  const dlBtn = w.document.querySelector('#dlBtn');
  ok(!!dlBtn, '入口页应有「下载客户端」按钮');
  ok(dlBtn && /下载客户端/.test(dlBtn.textContent), '按钮文字应是「下载客户端」');
  ok(w.document.querySelectorAll('#apkSlot .apk-get').length === 1, '入口页只应有一个下载条目（不再堆三行）');

  // 点开是应用内弹层，列出各平台
  dlBtn && dlBtn.click();
  const dlg = w.document.querySelector('#dlDialog');
  ok(!!dlg, '点按钮应弹出应用内下载弹层');
  const dlinks = dlg ? [...dlg.querySelectorAll('a.apk-get')] : [];
  ok(dlinks.length === 3, '弹层应列出 3 个安装包，实际 ' + dlinks.length);
  const dhrefs = dlinks.map(a => a.href);
  ok(/dark-forest\.apk$/.test(dhrefs[0] || ''), '第一项应是安卓版，实际 ' + dhrefs[0]);
  ok(/\/download\/dark-forest-1\.0\.18-tauri-setup\.exe$/.test(dhrefs[1] || ''), '第二项应是轻量版（本站直链）');
  ok(/^https:\/\/github\.com\//.test(dhrefs[2] || ''), '第三项应是完整版（GitHub 外链）');
  ok(dlinks[0] && dlinks[0].getAttribute('download'), '本站直链应带 download 属性');
  ok(dlinks[2] && dlinks[2].getAttribute('target') === '_blank', '外链应新窗口打开');
  ok(dlinks[1] && /↓/.test(dlinks[1].textContent), '本站直链箭头应是 ↓');
  ok(dlinks[2] && /↗/.test(dlinks[2].textContent), '外链箭头应是 ↗');
  dlg && dlg.querySelector('[data-close]').click();
  ok(!w.document.querySelector('#dlDialog'), '关闭后弹层应消失');

  // 桌面壳 / APK 内不给自己挂下载入口
  w.eval(`window.__UI.desktop = null; window.__UI.apk = null; window.DF_APP = 1;`);
  show(null, null);
  await new Promise(r => setTimeout(r, 30));
  ok(!w.document.querySelector('#dlBtn'), '桌面版/APK 内不该出现下载按钮');
  w.eval(`delete window.DF_APP; window.__UI.desktop = null; window.__UI.apk = null;`);
  show(null, null);

  console.log('=== UI 17. 窄屏不画跨屏箭头，改在牌块上标名字 ===');
  const g17 = createGame(['罗辑', '脱水者', '智子'], { strikeTarget: 'open' });
  const S17 = g17.state();
  S17.players[0].galaxy = 1; S17.players[1].galaxy = 3; S17.players[2].galaxy = 6;
  S17.players[1].hand = [{ uid: 'n1', key: 'cosmic_coop' }, { uid: 'n2', key: 'photoid' }];
  S17.currentIdx = 1; S17.step = 'action';
  g17.discardCards('p1', ['n1', 'n2']);
  S17.arrow = { playerId: 'p1', at: Date.now(), uids: ['n1', 'n2'] };

  // 窄屏：matchMedia 命中 1100px 断点
  w.eval(`window.matchMedia = q => ({ matches: /max-width:1100px/.test(q), media: q,
    addListener(){}, removeListener(){} });`);
  show(viewFor(g17, 'p0'), 'p0');
  await new Promise(r => setTimeout(r, 60));
  ok((w.document.querySelector('#arrowLayer').innerHTML || '') === '',
    '窄屏不该画跨屏箭头（会盖住星图和提示）');
  const whos = [...w.document.querySelectorAll('.dc-who')].map(e => e.textContent);
  ok(whos.length >= 2 && whos.every(t => t === '脱水者'), '牌块上应标出是谁打的，实际 ' + JSON.stringify(whos));

  // 宽屏：箭头照画
  w.eval(`window.matchMedia = q => ({ matches: false, media: q, addListener(){}, removeListener(){} });`);
  show(viewFor(g17, 'p0'), 'p0');
  await new Promise(r => setTimeout(r, 60));
  ok((w.document.querySelector('#arrowLayer').innerHTML || '').length > 0, '宽屏仍应画出箭头线');
  ok(w.document.querySelectorAll('.dc-who').length >= 2, '名字标签仍然在 DOM 里（宽屏用 CSS 藏掉）');

  console.log('=== UI 18. 光速飞船：点得动（为了弃置），出牌按钮恒灰 ===');
  {
    const g18 = createGame(['A', 'B'], { strikeTarget: 'open' });
    const S18 = g18.state();
    S18.players[0].galaxy = 2; S18.players[1].galaxy = 7;
    S18.players[0].energy = 10;
    S18.players[0].hand = [{ uid: 'sp1', key: 'lightship' }, { uid: 'sp2', key: 'photoid' }];
    S18.currentIdx = 0; S18.step = 'action';
    show(viewFor(g18, 'p0'), 'p0');
    // 第一次渲染会挂 3 秒换人提示（按钮全灰），清掉再渲染一次才是正常可操作状态
    w.__UI.gate = null;
    w.__render();
    await new Promise(r => setTimeout(r, 30));

    const ship = w.document.querySelector('.pcard[data-uid="sp1"]');
    ok(!!ship, '手里应有光速飞船牌');
    ok(ship && ship.classList.contains('reserved'), '飞船牌应带 reserved 标记');

    // 点它：曾经的 bug 是弹个 toast 就 return，连选都选不了。
    // ⚠️ 点了会 renderGame() 重建 DOM，旧引用失效——每次断言都要重新查
    ship && ship.click();
    const shipSel = w.document.querySelector('.pcard[data-uid="sp1"]');
    ok(shipSel && shipSel.classList.contains('selected'), '点光速飞船应能选中（为了弃置），实际 class=' + (shipSel ? shipSel.className : ''));
    ok(w.document.querySelector('#actPlay').disabled, '选中飞船时「出牌」应置灰');
    ok(!w.document.querySelector('#actDiscard').disabled, '选中飞船时「弃置」应可用');
    ok(/弃置 1 张/.test(w.document.querySelector('#actDiscard').textContent), '弃置按钮应显示张数');

    // 再点一次取消选中
    const shipAgain = w.document.querySelector('.pcard[data-uid="sp1"]');
    shipAgain && shipAgain.click();
    ok(!w.document.querySelector('.pcard[data-uid="sp1"]').classList.contains('selected'), '再点一次应取消选中');
    ok(w.document.querySelector('#actDiscard').disabled, '没选牌时「弃置」应置灰');

    // 普通牌不受影响
    const other = w.document.querySelector('.pcard[data-uid="sp2"]');
    other && other.click();
    ok(w.document.querySelector('.pcard[data-uid="sp2"]').classList.contains('selected'), '普通牌照常能选中');
    ok(!w.document.querySelector('#actDiscard').disabled, '选中普通牌也能弃');
  }

  console.log('=== UI 19. 换人提示：3 秒 ===');
  {
    const g19 = createGame(['A', 'B'], { strikeTarget: 'open' });
    const S19 = g19.state();
    S19.players[0].galaxy = 1; S19.players[1].galaxy = 4;
    S19.players[0].energy = 10;
    S19.players[0].hand = [{ uid: 'q1', key: 'solar' }];   // 建设牌：不用选目标，按钮状态只受 gate 影响
    S19.currentIdx = 0; S19.step = 'action';
    show(viewFor(g19, 'p0'), 'p0');   // turnKey 从 null 变过来 → 挂提示
    await new Promise(r => setTimeout(r, 20));
    ok(!!w.__UI.gate, '换人应出现提示');
    ok(w.__UI.gate && w.__UI.gate.mine === true, '轮到自己应标记 mine');
    const dur = w.__UI.gate ? (w.__UI.gate.until - Date.now()) : -1;
    ok(dur > 2700 && dur <= 3000, '提示时长应为 3 秒，实际 ' + dur + 'ms');
    const html19 = w.document.querySelector('#app').innerHTML;
    ok(html19.indexOf('轮到你出牌') >= 0, '应显示「轮到你出牌」');
    // 选一张牌（提示期间允许选，只是不能确认）
    const q = w.document.querySelector('.pcard[data-uid="q1"]');
    q && q.click();
    ok(w.document.querySelector('.pcard[data-uid="q1"]').classList.contains('selected'), '提示期间应能选牌');
    ok(w.document.querySelector('#actPlay').disabled, '提示期间即使选了牌「出牌」也置灰');
    // 清掉提示后恢复可操作
    w.__UI.gate = null;
    w.__render();
    ok(!w.document.querySelector('#actPlay').disabled, '提示消失后「出牌」应恢复');
  }

  console.log('=== UI 20. 打击剩余手数 / 降维置灰 / 宽屏并排 ===');
  {
    // 20.1 别人的打击：不知道还要飞几手 → 显示"还需 ? 手到达"（早先误显示 0 手）
    const g20 = createGame(['A', 'B'], { strikeTarget: 'open' });
    const S20 = g20.state();
    S20.players[0].galaxy = 1; S20.players[1].galaxy = 3;
    S20.players[0].energy = 30;
    S20.players[0].hand = [{ uid: 's20', key: 'nuke' }];
    S20.currentIdx = 0; S20.step = 'action';
    g20.playStrike('p0', 's20', 3);
    const st20 = S20.players[0].strikes[0];
    st20.progress = 1;
    show(viewFor(g20, 'p1'), 'p1');       // B 是被打的人
    await new Promise(r => setTimeout(r, 40));
    const co = w.document.querySelector('#callout');
    const coText = co ? co.textContent : '';
    ok(coText.indexOf('还需 ? 手到达') >= 0, '被打方应看到"还需 ? 手到达"，实际 ' + coText);
    ok(coText.indexOf('还需 0 手') < 0, '不该再显示"还需 0 手到达"，实际 ' + coText);

    // 20.2 降维打击后的星系：星图节点带 dimmed 类
    const S20b = g20.state();
    S20b.markers[2].red = true;
    show(viewFor(g20, 'p1'), 'p1');
    await new Promise(r => setTimeout(r, 40));
    const node2 = w.document.querySelector('.node[data-g="2"]');
    ok(!!node2 && node2.classList.contains('dimmed'), '被降维的星系应带 dimmed 类');
    const node1 = w.document.querySelector('.node[data-g="1"]');
    ok(!!node1 && !node1.classList.contains('dimmed'), '其他星系不该带 dimmed 类');

    // 20.3 宽屏：星图与弃牌堆在同一个 .arena-main 容器里（CSS 负责左右并排）
    ok(!!w.document.querySelector('.arena-main'), '应有 .arena-main 容器');
    ok(!!w.document.querySelector('.arena-main .map-wrap'), '.arena-main 里应有星图');
    ok(!!w.document.querySelector('.arena-main .tray'), '.arena-main 里应有弃牌堆');
    const css20 = fs.readFileSync(path.join(ROOT, 'web/style.css'), 'utf8');
    ok(/\.arena-main\{[^}]*grid-template-columns:1fr 250px/.test(css20), '宽屏应把星图与弃牌堆左右并排');
    ok(/\.arena-main\{grid-template-columns:1fr;grid-template-rows:auto auto/.test(css20), '窄屏应改回上下堆叠');
  }

  console.log(`\nUI 结果: ${pass} 通过, ${fail} 失败`);  console.log(`\\nUI 结果: ${pass} 通过, ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})();
