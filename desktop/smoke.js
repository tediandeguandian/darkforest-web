/* ============================================================
 * desktop/smoke.js —— 冒烟测试（只在开发时用，不进打包）
 *
 * 用隐藏窗口加载真正的主页，检查页面跑起来了没有：
 *   · 入口页渲染出来了吗（.lobby / #createBtn）
 *   · 规则引擎挂到 window 上了吗（createGame / viewFor）
 *   · ui.js 的 render 在不在
 * 然后直接进一局：create 一个 3 人局，渲染牌桌，检查有没有 .board 和牌库数字。
 * 全部通过退出码 0，否则 1。
 * ============================================================ */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const os = require('os');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
// 用临时 profile：别去动用户目录里的 Local Storage（测试跑完就丢）
app.setPath('userData', path.join(os.tmpdir(), 'df-electron-smoke'));

const INDEX = path.join(__dirname, 'www', 'index.html');
let failed = 0;
const ok = (cond, msg) => {
  if (cond) console.log('  ✓ ' + msg);
  else { failed++; console.log('  ✗ ' + msg); }
};

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1280, height: 860, webPreferences: { contextIsolation: true } });
  await win.loadFile(INDEX);
  // 等首帧渲染
  await new Promise(r => setTimeout(r, 600));

  const probe = await win.webContents.executeJavaScript(`(() => ({
    title: document.title,
    lobby: !!document.querySelector('.lobby-entry'),
    createBtn: !!document.querySelector('#createBtn'),
    gear: !!document.querySelector('#prefBtn'),
    engine: typeof window.createGame === 'function' && typeof window.viewFor === 'function',
    render: typeof window.render === 'function',
    frost: document.body.classList.contains('frost'),
    bgImg: getComputedStyle(document.body, '::before').backgroundImage.slice(-24),
  }))()`);

  console.log('=== 桌面壳冒烟 ===');
  ok(/黑暗森林/.test(probe.title), '标题含「黑暗森林」：' + probe.title);
  ok(probe.lobby && probe.createBtn, '入口页渲染出来了');
  ok(probe.gear, '入口页有设置齿轮');
  ok(probe.engine, '规则引擎 / 视图裁剪已加载');
  ok(probe.render, 'ui.js 已加载');
  ok(probe.frost, '毛玻璃默认开启');
  ok(/bg-forest\.jpg/.test(probe.bgImg), '背景图引用正确：' + probe.bgImg);

  // 开局：走真实的本地对局流程（Net.view 是只读 getter，不能手写）
  const game = await win.webContents.executeJavaScript(`(async () => {
    Net.createRoom('甲');
    Net.addAI('sophon');
    Net.addAI('chaotic_era');
    Net.start();
    await new Promise(r => setTimeout(r, 300));   // 开局后 AI 会先动，等它落定
    const deckEl = document.querySelector('#counterBar');
    return {
      board: !!document.querySelector('.board'),
      deck: deckEl ? deckEl.textContent : '',
      seats: document.querySelectorAll('.seat-card').length,
      inGame: document.body.classList.contains('in-game'),
      handCards: document.querySelectorAll('.pcard').length,
      playerModalFn: typeof openPlayerModal === 'function',
    };
  })()`);

  ok(game.board, '牌桌渲染出来了（.board）');
  ok(/牌库\s*\d+/.test(game.deck), '顶栏显示牌库数量：' + game.deck.trim());
  ok(game.seats >= 2, '对手席位应至少 2 个，实际 ' + game.seats);
  ok(game.handCards >= 1, '手牌渲染出来了，实际 ' + game.handCards + ' 张');
  ok(game.inGame, 'body 带 in-game（星空背景生效）');
  ok(game.playerModalFn, '对手详情弹窗可用');

  console.log(failed ? `\n冒烟结果: ${failed} 项失败` : '\n冒烟结果: 全部通过');
  app.exit(failed ? 1 : 0);
}).catch(e => {
  console.error('冒烟异常：', e);
  app.exit(1);
});
