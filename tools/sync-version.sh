#!/bin/sh
# ============================================================
# tools/sync-version.sh —— 版本号唯一真源
#
#   版本号只写在 desktop/package.json 一个地方，这个脚本把它同步到：
#     · desktop-tauri/src-tauri/tauri.conf.json（Tauri 安装包的版本，此前漏了）
#
# AndroidManifest 的 versionName 由 apk/build.sh 从 manifest 自己读，versionCode 手工递增，
# 所以不在这里动——但每次发版记得把它一起改（README 的发版清单里有写）。
#
#   sh tools/sync-version.sh
# ============================================================
set -e
HERE=$(cd "$(dirname "$0")/.." && pwd)
VER=$(node -p "require('$HERE/desktop/package.json').version")

TAURI_CONF="$HERE/desktop-tauri/src-tauri/tauri.conf.json"
node - "$TAURI_CONF" "$VER" <<'EOF'
const fs = require('fs');
const [, , file, ver] = process.argv;
const j = JSON.parse(fs.readFileSync(file, 'utf8'));
if (j.version !== ver) {
  j.version = ver;
  fs.writeFileSync(file, JSON.stringify(j, null, 2) + '\n');
  console.log('· tauri.conf.json 版本 →', ver);
} else {
  console.log('· tauri.conf.json 版本已是', ver);
}
EOF
