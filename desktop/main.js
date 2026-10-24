/* ============================================================
 * desktop/main.js —— 桌面版外壳（Electron）
 *
 * 整个游戏还是 web/ 与 shared/ 那套静态页面：构建时拷进 www/，
 * 这里只负责开一个窗口、禁掉默认菜单、把外链交给系统浏览器。
 * 和安卓壳的区别：没有 window.Android 桥，所以不会出现「检查更新」
 * 和「同一个 Wi-Fi」这两块——它们依赖 APK 原生能力。
 * ============================================================ */
const { app, BrowserWindow, Menu, shell, session } = require('electron');
const path = require('path');

const INDEX = path.join(__dirname, 'www', 'index.html');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: '#0a0714',   // 和页面底色一致，白屏一闪会很难看
    title: '三体 · 黑暗森林',
    icon: path.join(__dirname, 'www', 'icon.png'),
    show: false,                  // 先藏着，等页面画好再显示
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,     // 页面是纯静态 JS，不需要 Node
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => win.show());
  win.loadFile(INDEX);

  // 外链（比如「联机对局」指向的官网）走系统默认浏览器，不在小窗里开
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  return win;
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);

  // 本地页面要往线上服务器要 apk.json / 连 WebSocket，file:// 下算跨域：
  // 只放行我们自己那几个域名，别把整个跨域限制拆了
  // 新旧两个域名都放行：老版本安装包里烙的是旧地址，联机时不该被本机拦下来
  const ALLOW = [
    'https://darkforest.dpdns.org', 'wss://darkforest.dpdns.org',
    'https://shuwang.dpdns.org', 'wss://shuwang.dpdns.org',
  ];
  session.defaultSession.webRequest.onBeforeSendHeaders((details, cb) => {
    if (ALLOW.some(h => details.url.startsWith(h))) {
      details.requestHeaders['Origin'] = 'https://darkforest.dpdns.org';
    }
    cb({ requestHeaders: details.requestHeaders });
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
