#!/usr/bin/env node
/* ============================================================
 * tools/release-notes.js —— 生成 GitHub Release 正文
 *
 *   node tools/release-notes.js 1.0.30 > notes.md
 *
 * 正文只从两处取，不手写：
 *   · 本版改动   ← apk/release-notes.json（和安卓更新弹窗共用一份，别写两遍）
 *   · 附件清单   ← 版本号 + 固定命名规则
 *
 * 以前正文是在网页上敲的，发完就忘；更新弹窗里的清单又另写一遍，
 * 两边经常对不上。现在一份数据两处消费。
 * ============================================================ */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ver = process.argv[2];
if (!ver) {
  console.error('用法: node tools/release-notes.js <版本号>');
  process.exit(1);
}

let all = {};
try {
  all = JSON.parse(fs.readFileSync(path.join(ROOT, 'apk/release-notes.json'), 'utf8')) || {};
} catch (e) {
  console.error('⚠ 读不到 apk/release-notes.json，正文只写附件清单');
}

const cur = Array.isArray(all[ver]) ? all[ver] : [];
const out = ['## 本版改动', ''];
if (cur.length) cur.forEach(x => out.push('- ' + x));
else out.push('- 本版无单独说明');

out.push('', '## 安装包', '');
out.push('| 平台 | 文件 | 说明 |');
out.push('| --- | --- | --- |');
out.push(`| macOS | \`dark-forest-${ver}-macos-universal.dmg\` | 通用二进制（Intel / Apple 芯片），10.15+ |`);
out.push(`| Windows 轻量 | \`dark-forest-${ver}-tauri-setup.exe\` | 约 2 MB，需 WebView2（缺失时自动装） |`);
out.push(`| Windows 完整 | \`dark-forest-${ver}-win64-setup.exe\` | 约 105 MB，零依赖 |`);
out.push(`| Android | \`dark-forest-${ver}.apk\` | 直接安装 |`);
out.push('');
out.push('网页版：https://darkforest.dpdns.org');
out.push('');
out.push('> 已装桌面版的用户可以直接在应用内更新，不用再回来下载。');

process.stdout.write(out.join('\n') + '\n');
