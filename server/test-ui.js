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
  view: null, room: null, me: { playerId: 'p0' }, roomId: null, local: true, canLan: false, spectating: false,
  __h: [],
  on(fn){ this.__h.push(fn); }, act(){}, leave(){}, setMode(){}, setStrikeTarget(){}, addAI(){}, removeAI(){}, start(){}, watch(){},
  name(){ return ''; }, setName(){}, autoResume(){ return false; }, hasSession(){ return false; }, lanUrl(){ return null; }
};`);
w.eval(fs.readFileSync(path.join(ROOT, 'web/js/ui.js'), 'utf8') + `
  // const 只活在这次 eval 的作用域里，必须显式挂到 window 才能被测试驱动
  window.__UI = UI;
  window.__render = render;
  window.__setConnHint = setConnHint;
  window.__stashHandoff = stashHandoff;
  window.__syncAIFoldWide = syncAIFoldWide;
  window.__cardArt = cardArt;
  window.__CARD_GLYPHS = CARD_GLYPHS;
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
ok(lobbyHtml.indexOf('id="aiFold"') >= 0 && /aria-expanded=/.test(lobbyHtml), '添加对手应是可折叠菜单');
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

// 缺省（老房间没带 strikeTarget）时应高亮"隐藏"——本版起默认隐藏打击目标
delete w.Net.room.strikeTarget;
w.openSettings();
const sm2 = w.document.querySelector('#settingsModal');
const onOpt = sm2 && sm2.querySelector('[data-strike].on');
ok(!!onOpt && onOpt.getAttribute('data-strike') === 'hidden',
  '缺省时应高亮隐藏，实际 ' + (onOpt && onOpt.getAttribute('data-strike')));
sm2 && sm2.remove();
sm2 && sm2.remove();

console.log('=== UI 6b. 大厅局部更新：加人机不重建、菜单不被收走 ===');
{
  w.Net.room.strikeTarget = 'hidden';
  w.__render();
  const root0 = w.document.querySelector('#app .lobby-room');
  const fold0 = w.document.querySelector('#aiFold');
  ok(!!root0 && !!fold0, '大厅应有骨架与折叠面板');
  ok(fold0.getAttribute('data-open') === '0', '已有人机时首次默认收起，实际 ' + fold0.getAttribute('data-open'));

  w.document.querySelector('#aiFoldBtn').click();
  ok(fold0.getAttribute('data-open') === '1', '点标题应展开');
  ok(fold0.querySelector('.fold-head').getAttribute('aria-expanded') === 'true', 'aria-expanded 应同步');

  const seatP1 = w.document.querySelector('.seat[data-pid="p1"]');
  w.Net.room = {
    ...w.Net.room,
    seats: [...w.Net.room.seats, { playerId: 'p2', name: 'C', connected: true, isAI: true, aiLevel: 'dehydrator' }],
  };
  w.__render();
  ok(w.document.querySelector('#app .lobby-room') === root0, '重绘不该重建大厅骨架');
  ok(w.document.querySelector('.seat[data-pid="p1"]') === seatP1, '已在场的席位不该被重建');
  ok(w.document.querySelectorAll('.seat').length === 3,
    '应多出一位，实际 ' + w.document.querySelectorAll('.seat').length);
  ok(w.document.querySelector('#aiFold').getAttribute('data-open') === '1',
    '加人机后菜单应保持展开（以前会被收走 → 页面跳一下）');
  ok(w.document.querySelector('.seat[data-pid="p2"]').classList.contains('is-new'), '新席位应播入场');

  // 移除一位：只删那个节点，其余照旧
  w.Net.room = { ...w.Net.room, seats: w.Net.room.seats.slice(0, 2) };
  w.__render();
  ok(w.document.querySelectorAll('.seat').length === 2, '移除后应只剩 2 位');
  ok(w.document.querySelector('.seat[data-pid="p1"]') === seatP1, '移除别人不该重建本席位');
}

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

  /* ---------- 9b. 桌面壳（macOS / Windows）：同一套提示，清单换成 desktop.json ----------
   * 之前 checkAppUpdate 只认 DF_APP，桌面版装了 1.0.26 也从来没有更新提示。
   * 桌面壳没有原生安装桥，所以「立即更新」改成「前往下载」——必须开系统浏览器。 */
  console.log('=== UI 9b. 桌面版更新提示（macOS / Windows）===');
  w.document.getElementById('updateBadge')?.remove();
  w.document.getElementById('updateDialog')?.remove();
  // 真机上安卓桥与桌面壳不会共存；这里也删掉，免得 openExternal 走错分支
  w.eval(`delete window.DF_APP; delete window.Android;
    window.DF_DESKTOP = 1; window.DF_VERSION = '1.0.26';
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', configurable: true });
    window.__opened = [];
    window.open = u => { window.__opened.push(u); return {}; };
    window.__lastFetch = null;
    window.fetch = u => { window.__lastFetch = u; return Promise.resolve({ ok: true, json: () => Promise.resolve({
      version: '1.0.27',
      platforms: {
        mac: { url: '/download/dark-forest-1.0.27-macos-universal.dmg', bytes: 5870000,
               sub: 'v1.0.27 · 5.6 MB · 通用二进制（Intel / Apple 芯片）' },
        win: { url: '/download/dark-forest-1.0.27-tauri-setup.exe', bytes: 1732527,
               sub: 'v1.0.27 · 1.7 MB · 需 WebView2（缺失时自动装）' }
      },
      history: { '1.0.26': ['这条不该出现（本机就是 1.0.26）'], '1.0.27': ['macOS 版新增更新提示'] }
    }) }); };`);
  w.__render();
  await new Promise(r => setTimeout(r, 0));
  ok(w.__lastFetch === 'https://darkforest.dpdns.org/download/desktop.json',
    '桌面版应请求 desktop.json，实际 ' + w.__lastFetch);
  const dbadge = w.document.querySelector('#updateBadge');
  ok(!!dbadge, '桌面版有新版本时也应出现提示（以前这里只认 DF_APP）');

  dbadge && dbadge.click();
  const dud = w.document.querySelector('#updateDialog');
  const dhtml = dud ? dud.innerHTML : '';
  ok(!!dud, '桌面版点「新版本」也要有应用内弹窗');
  ok(dhtml.indexOf('前往下载') >= 0, '桌面版按钮应说「前往下载」（没有原生安装器，不能假装一键装好）');
  ok(dhtml.indexOf('通用二进制') >= 0, 'macOS 弹窗应写清是通用二进制');
  ok(dhtml.indexOf('拖进「应用程序」') >= 0, 'macOS 要说明装法：拖进应用程序替换');
  ok(dhtml.indexOf('这条不该出现') < 0, '本机已装版本的改动不该列');
  ok(dhtml.indexOf('macOS 版新增更新提示') >= 0, '应列出新版本的改动');
  ok((w.__opened || []).length === 0, '还没确认，不该打开浏览器');

  dud && dud.querySelector('[data-ok]').click();
  const opened = w.__opened || [];
  ok(opened.length === 1, '确认后应打开一次下载页，实际 ' + opened.length);
  ok(/^https:\/\/darkforest\.dpdns\.org\/download\/dark-forest-1\.0\.27-macos-universal\.dmg$/.test(opened[0] || ''),
    'macOS 应打开 dmg 的绝对地址，实际 ' + opened[0]);

  // Windows：同一个清单，按 UA 换到 exe
  w.document.getElementById('updateBadge')?.remove();
  w.eval(`Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', configurable: true });
    window.__opened = [];`);
  w.__render();
  await new Promise(r => setTimeout(r, 0));
  const wbadge = w.document.querySelector('#updateBadge');
  ok(!!wbadge, 'Windows 版同样应有提示');
  wbadge && wbadge.click();
  const wud = w.document.querySelector('#updateDialog');
  ok(!!wud && wud.innerHTML.indexOf('需 WebView2') >= 0, 'Windows 弹窗应带 WebView2 说明');
  ok(!!wud && wud.innerHTML.indexOf('覆盖安装') >= 0, 'Windows 要说明覆盖安装即可');
  wud && wud.querySelector('[data-ok]').click();
  ok(/tauri-setup\.exe$/.test((w.__opened || [])[0] || ''),
    'Windows 应打开 exe，实际 ' + (w.__opened || [])[0]);

  // 网页版：既没有壳标记也没有版本号，一次请求都不该发
  w.document.getElementById('updateBadge')?.remove();
  w.eval(`delete window.DF_DESKTOP; delete window.DF_VERSION; window.__lastFetch = null;`);
  w.__render();
  await new Promise(r => setTimeout(r, 0));
  ok(!w.__lastFetch, '网页版不该请求任何更新清单');
  ok(!w.document.querySelector('#updateBadge'), '网页版不该出现更新提示');

  // 恢复成第 9 节的安卓壳状态，后面的用例还要用
  w.eval(`window.DF_APP = 1; window.DF_VERSION = '1.0.0'; delete window.DF_DESKTOP;
    window.Android = { downloadApk: () => '{"ok":true}', installDownloaded: () => '{"ok":false}',
      openUrl: () => {} };
    window.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({
      version: '1.0.3', file: 'dark-forest.apk', bytes: 338130 }) });`);

/* ---------- 9c. 构建脚本：桌面壳必须带上「我是桌面版」和本机版本 ----------
 * 没有这两个变量，ui.js 就把桌面版当成普通网页：既不提示更新，也回不到单人模式。 */
console.log('=== UI 9c. prep-frontend 注入桌面标记与版本 ===');
try {
  const { execFileSync } = require('child_process');
  const outDir = path.join(require('os').tmpdir(), 'df-prep-test');
  execFileSync('sh', [path.join(ROOT, 'tools/prep-frontend.sh'), outDir], { stdio: 'pipe' });
  const ver = JSON.parse(fs.readFileSync(path.join(ROOT, 'desktop/package.json'), 'utf8')).version;
  [['index.html', 'index.html'], ['online.html', 'online.html']].forEach(([label, f]) => {
    const html = fs.readFileSync(path.join(outDir, f), 'utf8');
    ok(html.indexOf('window.DF_DESKTOP=1') >= 0, label + ' 应注入 DF_DESKTOP（否则桌面版当成网页）');
    ok(html.indexOf('window.DF_VERSION="' + ver + '"') >= 0, label + ' 应注入本机版本 ' + ver);
  });
} catch (e) {
  console.log('  （跳过：这台机器跑不了 sh）' + (e && e.message ? ' ' + e.message : ''));
}

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

  console.log('=== UI 16b. 箭头层只跑一条 rAF 链（重绘不叠加）===');
  {
    const g16b = createGame(['A', 'B'], { strikeTarget: 'open' });
    const S16b = g16b.state();
    S16b.players[0].galaxy = 1; S16b.players[1].galaxy = 4;
    S16b.players[0].energy = 20;
    S16b.players[0].hand = [{ uid: 'a1', key: 'solar' }, { uid: 'a2', key: 'nuke' }];
    S16b.currentIdx = 0; S16b.step = 'action';
    const rd = g16b.discardCards('p0', ['a1']);
    ok(rd.ok === true, '弃牌应成功: ' + (rd.msg || ''));

    // 这一帧同时是"入口 → 牌桌"的换场景帧
    w.__UI.scene = null;
    show(viewFor(g16b, 'p1'), 'p1');
    const app16 = w.document.querySelector('#app');
    ok(app16.classList.contains('scene-in'), '换场景应挂上入专场类');
    const firstRaf = w.__UI.arrowRaf;
    ok(firstRaf > 0, '牌桌渲染应排上一帧箭头动画，实际 ' + firstRaf);

    // 720ms 内又来一次推送：整屏入场不该重播，箭头也不该另起一条链
    w.__render();
    ok(!w.document.querySelector('#app').classList.contains('scene-in'),
      '入场期间的重绘应先摘掉 scene-in，否则整屏入场动画重播（看着就是闪一下）');
    ok(w.__UI.arrowRaf === firstRaf, '重绘不该另起一条 rAF 链（' + firstRaf + ' → ' + w.__UI.arrowRaf + '）');

    w.drawArrow();                       // 500ms 兜底定时器走的就是这条路
    const layer16 = w.document.querySelector('#arrowLayer');
    ok((layer16.innerHTML || '').indexOf('<path') >= 0, '有目标时应画出箭头路径');
    ok(w.__UI.arrowRaf !== firstRaf, '手动调度后应只留一条新的链');

    // 内容没变就别重写 SVG（每帧改一次 innerHTML 会白白触发重排重绘）
    let writes = 0;
    const d0 = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(layer16), 'innerHTML');
    Object.defineProperty(layer16, 'innerHTML', {
      configurable: true,
      get() { return d0.get.call(this); },
      set(v) { writes++; d0.set.call(this, v); },
    });
    w.drawArrow();
    ok(writes === 0, '箭头内容没变时不该重写 innerHTML，实际写了 ' + writes + ' 次');

    // #app 重绘会换掉 <svg id="arrowLayer">：缓存必须跟着失效，否则箭头再也画不出来
    w.__render();
    w.drawArrow();
    ok((w.document.querySelector('#arrowLayer').innerHTML || '').indexOf('<path') >= 0,
      '换了 SVG 节点之后箭头要能重新画出来');
  }

  console.log('=== UI 16c. 点牌重绘不能把滚动条弹回顶部 ===');
  {
    const g16c = createGame(['A', 'B'], { strikeTarget: 'open' });
    const S16c = g16c.state();
    S16c.players[0].galaxy = 1; S16c.players[1].galaxy = 4;
    S16c.players[0].energy = 20;
    S16c.players[0].hand = [{ uid: 'c1', key: 'solar' }, { uid: 'c2', key: 'nuke' }];
    S16c.currentIdx = 0; S16c.step = 'action';

    let scrolled = 0;
    w.scrollTo = () => { scrolled++; };
    Object.defineProperty(w, 'scrollY', { configurable: true, get: () => 600 });

    // 换场景进牌桌：允许回到顶部（原来的意图）
    w.__UI.scene = null;
    show(viewFor(g16c, 'p0'), 'p0');
    ok(scrolled >= 1, '刚进牌桌应回到顶部，实际 ' + scrolled + ' 次');

    // 点一张牌：同步触发 renderGame()，但绝不能动滚动位置
    scrolled = 0;
    const card16 = w.document.querySelector('.pcard[data-uid="c1"]');
    ok(!!card16, '应画出手牌');
    if (card16) card16.click();
    ok(scrolled === 0, '点牌重绘不该调用 scrollTo（实际 ' + scrolled + ' 次）');
    ok(!!w.document.querySelector('.pcard[data-uid="c1"].selected'), '点牌仍应正常选中');
  }

  console.log('=== UI 16d. 点建设牌看详情 / 拆除 ===');
  {
    const g16d = createGame(['A', 'B'], { strikeTarget: 'open' });
    const S16d = g16d.state();
    S16d.players[0].galaxy = 1; S16d.players[1].galaxy = 4;
    S16d.players[0].energy = 12;
    S16d.players[0].hand = [{ uid: 'd1', key: 'fusion' }];   // 建造费 3 → 拆返还 1
    S16d.currentIdx = 0; S16d.step = 'action';
    g16d.playBuild('p0', 'd1');
    const dUid = S16d.players[0].buildZone[0].uid;

    const calls = [];
    const oldAct = w.Net.act;
    w.Net.act = a => calls.push(a);

    show(viewFor(g16d, 'p0'), 'p0');
    w.__UI.gate = null;              // 跳过"先看清局势"的 3 秒
    w.__render();

    const chip = w.document.querySelector('.eq[data-build]');
    ok(!!chip, '建设区的牌应是可点元素');
    if (chip) chip.click();

    const bm = w.document.getElementById('buildModal');
    ok(!!bm, '点建设牌应弹出详情');
    ok(!!bm && bm.textContent.indexOf('聚变反应堆') >= 0, '详情应显示牌名');
    ok(!!bm && /返还/.test(bm.textContent) && /⚡1/.test(bm.textContent), '详情应显示返还 1 能量');
    const go = w.document.getElementById('bmGo');
    ok(!!go && !go.disabled, '自己行动阶段「拆除」应可用');

    if (go) go.click();
    const dlg = w.document.getElementById('appDialog');
    ok(!!dlg && dlg.textContent.indexOf('拆除') >= 0, '点拆除应先弹确认框');
    const okBtn = dlg && dlg.querySelector('[data-ok]');
    if (okBtn) okBtn.click();
    ok(calls.length === 1 && calls[0].type === 'demolish' && calls[0].uid === dUid,
      '确认后应发出 demolish 动作，实际 ' + JSON.stringify(calls));

    // 不是自己回合：按钮置灰 + 说明原因
    S16d.currentIdx = 1;
    show(viewFor(g16d, 'p0'), 'p0');
    const chip2 = w.document.querySelector('.eq[data-build]');
    if (chip2) chip2.click();
    const go2 = w.document.getElementById('bmGo');
    ok(!!go2 && go2.disabled, '不是自己回合「拆除」应置灰');
    const bm2 = w.document.getElementById('buildModal');
    ok(!!bm2 && bm2.textContent.indexOf('只能在自己的回合') >= 0, '应说明为什么不能拆');

    w.Net.act = oldAct;
  }

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
    // 提示卡不能在 #app 里：牌桌每次状态推送都整块重写 #app，
    // 节点被重建 → tgPop 入场动画重播 → 3 秒里一直闪
    const gate19 = w.document.querySelector('.turn-gate');
    ok(!!gate19 && gate19.textContent.indexOf('轮到你出牌') >= 0, '应显示「轮到你出牌」');
    ok(!w.document.querySelector('#app .turn-gate'), '换人提示不该放在 #app 内（会被重绘带走）');
    w.__render();
    ok(w.document.querySelector('.turn-gate') === gate19, '状态推送重绘时换人提示应复用同一节点');
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

  console.log('=== UI 19b. 广播弹窗：重绘不重建节点（不重播入场动画）===');
  {
    const g19b = createGame(['A', 'B'], { strikeTarget: 'open' });
    const S19b = g19b.state();
    S19b.players[0].galaxy = 1; S19b.players[1].galaxy = 2;
    S19b.players[0].energy = 10; S19b.players[1].energy = 10;
    S19b.players[0].hand = [{ uid: 'a1', key: 'star_coop' }];
    S19b.players[1].hand = [{ uid: 'b1', key: 'star_coop' }];
    S19b.currentIdx = 0; S19b.step = 'action';
    const rb = g19b.playBroadcast('p0', 'a1', 2);
    ok(rb.ok === true, '广播应发出: ' + (rb.msg || ''));

    show(viewFor(g19b, 'p1'), 'p1');        // p1 是候选者 → 弹窗里要"你可以回应"
    await new Promise(r => setTimeout(r, 20));
    const m1 = w.document.querySelector('#modalRoot .modal');
    ok(!!m1, '应弹出广播响应弹窗');
    ok(!w.document.querySelector('#app #modalRoot'), '弹窗容器不该放在 #app 内（会被整块重绘带走）');
    ok(!w.document.getElementById('modalRoot').classList.contains('no-anim'), '首次挂载应播入场动画');

    // 等待别人回应时的状态推送：内容没变
    w.__render();
    ok(w.document.querySelector('#modalRoot .modal') === m1, '内容没变时弹窗节点应复用，不再重播入场动画');

    // 内容真变了（已提交）：只换内容，也不该把遮罩"再浮一次"
    g19b.setResponse('p1', 'b1', 'coop');
    show(viewFor(g19b, 'p1'), 'p1');
    await new Promise(r => setTimeout(r, 20));
    ok(/已提交/.test(w.document.querySelector('#modalRoot').textContent), '回应后应显示"已提交"');
    ok(w.document.getElementById('modalRoot').classList.contains('no-anim'), '内容变化时只换内容，不重播入场动画');
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
    ok(/\.arena-main\{[^}]*grid-template-columns:1fr \d+px/.test(css20), '宽屏应把星图与弃牌堆左右并排（1fr + 固定宽侧栏）');
    ok(/\.arena-main\{[^}]*grid-template-columns:1fr;grid-template-rows:auto auto/.test(css20), '窄屏应改回上下堆叠');
  }

  console.log('=== UI 21. 我的在飞打击：随时可撤回 ===');
  {
    const g21 = createGame(['A', 'B'], { strikeTarget: 'hidden' });
    const S21 = g21.state();
    S21.players[0].galaxy = 1; S21.players[1].galaxy = 4;
    S21.players[0].energy = 20;
    S21.players[0].hand = [{ uid: 'q21', key: 'nuke' }];
    S21.currentIdx = 0; S21.step = 'action';
    g21.playStrike('p0', 'q21', 4);

    show(viewFor(g21, 'p0'), 'p0');
    const chip = w.document.querySelector('.me-strikes .strike-chip[data-wd]');
    ok(!!chip, '自己的在飞打击应出现在 .me-strikes 里，并带撤回入口');
    ok(!!chip && chip.title.indexOf('撤回') >= 0, '悬停提示应说明点一下就是撤回');
    ok(!!chip && chip.getAttribute('data-wd') === 'q21', 'data-wd 应指向这支打击');
    // 自己的目标始终可见（隐藏模式只藏别人的）
    ok(!!chip && chip.textContent.indexOf('4') >= 0, '自己的打击应写出去哪个星系，实际 ' + (chip && chip.textContent));

    // 点一下：先弹确认（能量不退得说清楚），确认后才发动作
    const acts = [];
    const prevAct = w.Net.act;
    w.Net.act = a => acts.push(a);
    chip.click();
    const dlg = w.document.querySelector('#appDialog');
    ok(!!dlg, '点撤回应先弹确认框');
    ok(!!dlg && dlg.textContent.indexOf('不返还') >= 0, '确认框要写明能量不退');
    ok(acts.length === 0, '只是打开确认框，不该立刻撤回');
    dlg && dlg.querySelector('[data-ok]').click();
    ok(acts.length === 1 && acts[0].type === 'withdraw' && acts[0].uid === 'q21',
      '确认后应发出 withdraw 动作：' + JSON.stringify(acts));
    w.Net.act = prevAct;
    dlg && dlg.remove();

    // 出局后：打击还在飞，但撤回入口收掉，只留只读提示
    S21.players[0].alive = false;
    show(viewFor(g21, 'p0'), 'p0');
    const off = w.document.querySelector('.me-strikes .strike-chip.off');
    ok(!!off, '出局后仍应看到自己在飞的打击');
    ok(!!off && !off.hasAttribute('data-wd'), '出局后不该再给撤回入口');
    ok(!!off && off.title.indexOf('仍按原计划') >= 0, '提示里应说明出局后打击照旧飞完');
  }

  console.log('=== UI 22. 默认隐藏打击目标 ===');
  {
    // 新局不传设置：视图必须已经是 hidden，界面据此打「暗打」标
    const g22 = createGame(['A', 'B']);
    ok(viewFor(g22, 'p0').strikeTarget === 'hidden', '新局默认应是 hidden');
  }

  console.log('=== UI 23. 断线提示条：真断线才亮，离开就收 ===');
  {
    const conn = w.document.getElementById('conn');
    const fire = (t, p) => w.Net.__h.forEach(f => { try { f(t, p); } catch (e) { console.log(e); } });

    // 在房间里被服务器断开
    w.Net.roomId = 'ABCD';
    w.Net.room = { roomId: 'ABCD', seats: [] };
    fire('close');
    ok(conn.classList.contains('show'), '真断线时提示条应亮起');

    // 重连成功
    fire('open');
    ok(!conn.classList.contains('show'), '重连成功应收起提示条');

    // 断线后点「返回」：Net.leave() 会把 roomId 置空，然后 render 回入口页
    fire('close');
    ok(conn.classList.contains('show'), '断线时提示条应是亮的');
    w.Net.roomId = null;
    w.Net.room = null;
    show(null, null);
    ok(!conn.classList.contains('show'), '从房间返回主页后不该留着「连接已断开，正在重连…」');

    // 主动关连接时 close 回调晚到（浏览器里是异步的）：此时已经不在房间里
    fire('close');
    ok(!conn.classList.contains('show'), '已经离开房间时迟到的 close 不该点亮提示条');

    // 直接调 setConnHint 也要能收（离开路径不依赖 render 也能收干净）
    w.__setConnHint(true, '连接已断开，正在重连…');
    ok(conn.classList.contains('show'), 'setConnHint(true) 应能点亮');
    w.__setConnHint(false);
    ok(!conn.classList.contains('show'), 'setConnHint(false) 应能收起');
  }

  console.log('=== UI 24. 观战：没有手牌区，也不泄露任何位置 ===');
  {
    const g24 = createGame(['A', 'B', 'C'], { strikeTarget: 'hidden' });
    const S24 = g24.state();
    S24.players[0].galaxy = 1; S24.players[1].galaxy = 4; S24.players[2].galaxy = 6;
    S24.players[0].energy = 20;
    S24.players[0].hand = [{ uid: 'w1', key: 'nuke' }];
    S24.currentIdx = 0; S24.step = 'action';
    g24.playStrike('p0', 'w1', 4);

    const v24 = viewFor(g24, null);
    ok(v24.spectator === true, '观战视图应带 spectator 标记');
    ok(v24.me === null, '观战视图没有「我」');
    ok(v24.players.every(p => p.galaxy === null), '观战者看不到任何人的坐标');
    ok(v24.players.every(p => p.hand === null), '观战者看不到任何人的手牌');
    ok(v24.players.every(p => p.handCount >= 0), '手牌数量仍公开');

    // 真渲染一遍：me 为 null 时不能让牌桌崩
    w.Net.spectating = true;
    w.Net.roomId = 'ABCDE';
    w.Net.room = { roomId: 'ABCDE', seats: [] };
    w.Net.view = v24;
    w.Net.me = null;
    w.__UI.gate = null;
    w.__UI.turnKey = null;
    let threw = null;
    try { w.__render(); } catch (e) { threw = e; }
    ok(!threw, '观战视图应能正常渲染，实际抛了 ' + (threw && threw.message));
    const html24 = w.document.querySelector('#app').innerHTML;
    ok(html24.indexOf('观战中') >= 0, '界面应标明正在观战');
    ok(!w.document.querySelector('#hand'), '观战不该有手牌区');
    ok(!w.document.querySelector('#handHead'), '观战不该有「我的手牌」那一行');
    ok(!!w.document.querySelector('.mode-chip.spec'), '顶栏应有「观战」徽章');
    ok((w.document.querySelector('#leaveBtn') || {}).textContent === '退出观战', '退出按钮应写「退出观战」');

    // 大厅阶段（还没开局）也走观战文案
    w.Net.view = null;
    w.Net.room = { roomId: 'ABCDE', hostId: 'p0', seats: [{ playerId: 'p0', name: 'A', connected: true }], levels: [], mode: 'standard', strikeTarget: 'hidden' };
    w.__render();
    ok((w.document.querySelector('#leaveLobby') || {}).textContent === '退出观战', '大厅里观战者的返回按钮应写「退出观战」');
    ok(/等房主开局/.test((w.document.querySelector('#lobbyWait') || {}).textContent || ''), '观战者应看到「等房主开局」');

    w.Net.spectating = false;
    w.Net.roomId = null;
    w.Net.room = null;
  }

  console.log('=== UI 25. 桌面壳的联机入口要有回到单机的出口 ===');
  {
    // 网页版：没有单机页，不该出现这个按钮
    w.eval(`delete window.DF_APP; delete window.DF_DESKTOP; window.Net.local = false;`);
    show(null, null);
    ok(!w.document.querySelector('#backOffline'), '普通网页不该出现「返回单人模式」');

    // 安卓壳
    w.eval(`window.DF_APP = 1;`);
    show(null, null);
    ok(!!w.document.querySelector('#backOffline'), 'APK 联机页应能回到单机页');
    w.eval(`delete window.DF_APP;`);

    // 桌面壳（Tauri / Electron）
    // 这里以前只认 DF_APP，桌面版点完「联机对局」就再也回不到单机了
    w.eval(`window.DF_DESKTOP = 1;`);
    show(null, null);
    const back = w.document.querySelector('#backOffline');
    ok(!!back, '桌面壳的联机入口必须有「返回单人模式」');
    ok(back && /返回单人模式/.test(back.textContent), '按钮文案应写「返回单人模式」');
    w.eval(`delete window.DF_DESKTOP; window.Net.local = true;`);
    show(null, null);

    // 单机页自己要有去联机的入口（来回都得通）
    ok(!!w.document.querySelector('#onlineBtn'), '单机入口应有「联机对局」');
  }

  console.log('=== UI 26. 壳内换页：交接首帧、跳过入场动画 ===');
  {
    // 各端 HTML 都由这两个源页面生成，交接脚本必须同时存在
    ['web/local.html', 'web/index.html'].forEach(f => {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      ok(/df_handoff/.test(src) && /DF_HANDOFF/.test(src), f + ' 应有首帧交接脚本');
      ok(/location\.hash === '#df'/.test(src), f + ' 应有 hash 兜底（file:// 不共享 storage）');
    });
    const uiSrc = fs.readFileSync(path.join(ROOT, 'web/js/ui.js'), 'utf8');
    ok(/location\.href = url \+ '#df'/.test(uiSrc), 'goShell 应带 #df 交接标记');
    ok(/goShell\('online\.html'\)/.test(uiSrc) && /goShell\('index\.html'\)/.test(uiSrc),
      '单机 ⇄ 联机两个方向都要走交接跳转');

    // 跳之前确实把当前画面存下来了
    w.eval(`delete window.DF_HANDOFF; window.Net.view = null; window.Net.room = null;`);
    w.__render();
    try { w.sessionStorage.removeItem('df_handoff'); } catch (e) {}
    w.__stashHandoff();
    let saved = null;
    try { saved = JSON.parse(w.sessionStorage.getItem('df_handoff')); } catch (e) {}
    ok(!!saved && typeof saved.html === 'string' && saved.html.length > 0, '应存下当前 #app 的画面');
    ok(!!saved && typeof saved.at === 'number', '应带时间戳（过期的画面不贴）');

    // 目标页：交接标记在，本次渲染不许播整屏入场
    const app = w.document.querySelector('#app');
    app.style.pointerEvents = 'none';
    w.eval(`window.DF_HANDOFF = 1; window.__UI.scene = null; window.__UI.sceneTimer = null;`);
    w.__render();
    ok(!app.classList.contains('scene-in'), '交接首帧不该再挂 scene-in（整屏淡入就是「闪一下」）');
    ok(w.DF_HANDOFF === 0, '交接标记应被消费掉，之后换场景照常播入场');
    ok(app.style.pointerEvents !== 'none', '占位画面的点击禁用应被解除');

    // 之后真正的场景切换仍要有入场
    w.eval(`window.__UI.scene = null;`);
    w.__render();
    ok(app.classList.contains('scene-in'), '非交接的换场景仍应播入场动画');
    w.eval(`window.__UI.sceneTimer = null;`);
  }

  console.log('=== UI 27. 大厅宽屏两栏：藏掉 −/+ 且不再折叠 ===');
  {
    w.eval(`window.matchMedia = q => ({ matches: /min-width: 821px/.test(q), media: q,
      addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });`);
    w.eval(`window.__UI.foldWide = null; window.__UI.aiFoldOpen = false;`);
    w.Net.view = null;
    w.Net.me = { playerId: 'p0' };
    w.Net.room = {
      roomId: 'ABCDE', hostId: 'p0', mode: 'standard', strikeTarget: 'hidden',
      seats: [
        { playerId: 'p0', name: 'A', connected: true, isAI: false },
        { playerId: 'p1', name: 'B', connected: true, isAI: true, aiLevel: 'sophon' },
      ],
      levels: [],
    };
    w.__render();
    const fold = w.document.querySelector('#aiFold');
    ok(!!fold && fold.classList.contains('wide'), '宽屏应给「添加对手」打上 .wide');
    ok(fold.getAttribute('data-open') === '1', '宽屏两栏应恒展开');
    w.document.querySelector('#aiFoldBtn').click();
    ok(fold.getAttribute('data-open') === '1', '宽屏点标题不该折叠（符号已藏，收起就展不开了）');
    const css = fs.readFileSync(path.join(ROOT, 'web/style.css'), 'utf8');
    ok(/\.fold\.wide \.fold-head::after\{display:none\}/.test(css), 'CSS 应藏掉 −/+ 符号');
    ok(/\.fold\.wide \.fold-head\{cursor:default\}/.test(css), '宽屏标题不该还像按钮');

    // 拖回窄屏：−/+ 与折叠能力都回来，并恢复用户上次的选择
    w.eval(`window.matchMedia = q => ({ matches: false, media: q,
      addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });`);
    w.__render();
    ok(!fold.classList.contains('wide'), '窄屏应摘掉 .wide');
    ok(fold.getAttribute('data-open') === '0', '回到窄屏应恢复用户上次的收起状态');
    w.document.querySelector('#aiFoldBtn').click();
    ok(fold.getAttribute('data-open') === '1', '窄屏点标题应能正常展开');
    w.eval(`delete window.matchMedia;`);
  }

  console.log('=== UI 28. 每张卡牌都有自己的矢量图 ===');
/* 「符合名称」是个可以回归的约束：22 个 key 一个不能少，且两两不同。
   曾经手牌只用一个汉字水印（广/击/建），按类型共用，看不出是哪张牌。 */
const allKeys = Object.keys(w.CARD_DEFS);
const missArt = allKeys.filter(k => !w.__CARD_GLYPHS[k]);
ok(missArt.length === 0, '每个卡牌 key 都要有图标，缺：' + missArt.join(','));
const artList = allKeys.map(k => w.__CARD_GLYPHS[k]);
ok(new Set(artList).size === allKeys.length,
  `图标应两两不同（当前 ${new Set(artList).size}/${allKeys.length} 个不重复）`);
ok(artList.every(a => /<(path|circle|rect|ellipse|line)\b/.test(a || '')), '每个图标都要有实际图形，不能是空串');

const shell28 = w.__cardArt('solar');
ok(shell28.indexOf('<svg') === 0 && shell28.indexOf('class="card-art-svg"') > 0, 'cardArt 应返回统一样式的 svg');
ok(shell28.indexOf('viewBox="0 0 48 48"') > 0, '图标统一 48×48 画布');
ok(w.__cardArt('__not_a_card__') === '', '未知 key 返回空串，不在卡面留破图');

/* 手牌：三张不同的牌 → 三张不同的图 */
const g28 = createGame(['A', 'B'], { strikeTarget: 'hidden' });
const S28 = g28.state();
S28.players[0].galaxy = 1; S28.players[1].galaxy = 5;
S28.players[0].hand = [{ uid: 'a1', key: 'solar' }, { uid: 'a2', key: 'nuke' }, { uid: 'a3', key: 'cosmic_coop' }];
S28.currentIdx = 0; S28.step = 'action';
show(viewFor(g28, 'p0'), 'p0');
const pcs28 = [...w.document.querySelectorAll('.pcard')];
ok(pcs28.length === 3, '手牌应有三张');
ok(pcs28.every(c => !!c.querySelector('.pc-art svg')), '每张手牌都要有卡面插画');
const artOf28 = c => c.querySelector('.pc-art svg').innerHTML;
ok(new Set(pcs28.map(artOf28)).size === 3, '三张不同的牌应画出三张不同的图');

/* 建设区标签 / 弃牌筹码 / 详情卡也都带图 */
S28.players[0].buildZone = [{ uid: 'b1', key: 'dyson' }];
show(viewFor(g28, 'p0'), 'p0');
ok(!!w.document.querySelector('.eq svg'), '建设区标签要带小图标');
ok(!w.document.querySelector('.pc-art').textContent.trim(), '插画是纯矢量，不该再残留汉字水印');

const g28c = createGame(['A', 'B'], { strikeTarget: 'hidden' });
const S28c = g28c.state();
S28c.players[0].galaxy = 1; S28c.players[1].galaxy = 4;
S28c.players[0].energy = 20;
S28c.players[1].buildZone = [{ uid: 'z1', key: 'solar' }];
// 用科技锁死而不是光粒：前者 immediate，结算完立刻进弃牌堆；后者还在飞，堆里是空的
S28c.players[0].hand = [{ uid: 'c1', key: 'lock' }];
S28c.currentIdx = 0; S28c.step = 'action';
g28c.playStrike('p0', 'c1', 4);
show(viewFor(g28c, 'p1'), 'p1');
ok(!!w.document.querySelector('.dchip .dc-name svg'), '弃牌筹码要在名称前带小图标');
const ds28 = w.document.querySelector('.dstack');
if (ds28) ds28.click();
const sm28 = w.document.querySelector('#stackModal .sm-art svg');
ok(!!sm28, '弃牌摞展开的详情卡要带图标');
const modal28 = w.document.getElementById('stackModal');
if (modal28) modal28.remove();

console.log(`\nUI 结果: ${pass} 通过, ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})();
