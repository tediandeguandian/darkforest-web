#!/usr/bin/env node
/* ============================================================
 * tools/make-desktop-manifest.js —— 生成 web/download/desktop.json
 *
 *   node tools/make-desktop-manifest.js
 *
 * 这份清单有两个读者：
 *   1) 网页入口的「下载客户端」弹层（读 items）
 *   2) 桌面版自身的更新检查（读 version / notes / history / platforms）
 *
 * 以前是手写的，每发一版都要改版本号、文件名、体积、GitHub 链接，漏一处就是
 * 「提示有新版，点进去 404」。所以版本、体积一律现算：
 *   · version  —— desktop/package.json（唯一真源）
 *   · 体积     —— web/download 下安装包的实际字节数
 *   · 改动清单 —— apk/release-notes.json（和安卓共用一份，别写两遍）
 *
 * 安装包没放进 web/download 时（比如本地还没构建），该项退回 GitHub Release 直链；
 * 两条都拿不到就干脆不写这一项，宁可不显示，也不给死链。
 * ============================================================ */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DL = path.join(ROOT, 'web/download');
const VER = JSON.parse(fs.readFileSync(path.join(ROOT, 'desktop/package.json'), 'utf8')).version;
const REPO = 'https://github.com/tediandeguandian/darkforest-web/releases/download';

const notesAll = JSON.parse(fs.readFileSync(path.join(ROOT, 'apk/release-notes.json'), 'utf8')) || {};
const history = {};
for (const k of Object.keys(notesAll)) if (Array.isArray(notesAll[k])) history[k] = notesAll[k];

const mb = n => (n / 1024 / 1024).toFixed(1) + ' MB';
const sizeOf = f => {
  try { return fs.statSync(path.join(DL, f)).size; } catch (e) { return 0; }
};

/* 一个平台条目：本地有文件就用本地短链，否则退回 Release 直链；
   两样都没有返回 null（调用方跳过这一项）。 */
function entry({ os, file, githubFile, label, tail }) {
  const bytes = sizeOf(file);
  if (bytes) {
    return {
      os, label,
      sub: `v${VER} · ${mb(bytes)} · ${tail}`,
      url: `/download/${file}`,
      file: os === 'mac' ? `黑暗森林-v${VER}-macos.dmg` : `黑暗森林-v${VER}-win64-setup.exe`,
      bytes,
    };
  }
  if (!githubFile) return null;
  return {
    os, label,
    sub: `v${VER} · ${tail}`,
    url: `${REPO}/v${VER}/${githubFile}`,
  };
}

const MAC_FILE = `dark-forest-${VER}-macos-universal.dmg`;
const WIN_LITE = `dark-forest-${VER}-tauri-setup.exe`;
const WIN_FULL = `dark-forest-${VER}-win64-setup.exe`;

const mac = entry({
  os: 'mac', file: MAC_FILE, githubFile: MAC_FILE,
  label: '下载 macOS 版',
  tail: '通用二进制（Intel / Apple 芯片）',
});
const winLite = entry({
  os: 'win', file: WIN_LITE, githubFile: WIN_LITE,
  label: '下载 Windows 版（轻量）',
  tail: '需 WebView2（缺失时自动装）',
});
const winFull = entry({
  os: 'win', file: WIN_FULL, githubFile: WIN_FULL,
  label: '下载 Windows 版（完整）',
  tail: '零依赖，自带浏览器内核',
});

const items = [mac, winLite, winFull].filter(Boolean);

/* platforms 只放「更新提示」要用的那一个包：
   mac 给 dmg，Windows 给轻量版（体积小，装完即用）。 */
const platforms = {};
if (mac) platforms.mac = mac;
if (winLite || winFull) platforms.win = winLite || winFull;

const out = {
  version: VER,
  title: '桌面版',
  notes: Array.isArray(notesAll[VER]) ? notesAll[VER] : [],
  history,
  items,
  platforms,
};

fs.writeFileSync(path.join(DL, 'desktop.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`· desktop.json → v${VER}，${items.length} 个下载项`);
for (const it of items) console.log(`    ${it.os.padEnd(3)} ${it.label}  ${it.sub}  ${it.url}`);
if (!mac) console.log('  ⚠ 没有 macOS 安装包，更新提示会跳过 mac');
