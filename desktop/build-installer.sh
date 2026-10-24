#!/bin/sh
# ============================================================
# build-installer.sh —— 出 Windows 安装程序（NSIS，LZMA 固实压缩）
#
#   产物：dist/黑暗森林-<版本>-win64-setup.exe（约 104 MB，325 MB → 33.4%）
#
# 依赖（本机已就位，重装系统后要重来）：
#   1. NSIS：build/nsis/（npmmirror 的 nsis-3.0.4.1 包，7z 解出）
#      makensis 找 stubs 时写死了 /usr/local/share/nsis，
#      所以 build/nsis/ 还要拷一份到 /usr/local/share/nsis/
#   2. dist/dark-forest-win32-x64/：先跑 build-win.sh 出免安装版
#   3. /tmp/7zz：7-Zip 官方 mac 版，校验安装包内容用（可选）
# ============================================================
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
VER=$(node -p "require('$HERE/package.json').version")
cd "$HERE"

NSIS="$HERE/nsis/makensis"   # 放在 build/ 外面：build-win.sh 会清掉 build/
[ -x "$NSIS" ] || { echo "✗ 没找到 $NSIS（解压 nsis-3.0.4.1.7z 后把 mac/makensis 拷到包根目录）" >&2; exit 1; }
[ -d /usr/local/share/nsis ] || { echo "⚠ /usr/local/share/nsis 不存在：cp -R build/nsis/ /usr/local/share/nsis/ 后再试" >&2; }
[ -d "dist/dark-forest-win32-x64" ] || { echo "✗ 先跑 sh build-win.sh 出 payload" >&2; exit 1; }

"$NSIS" -V2 -DVERSION="$VER" installer.nsi

OUT="dist/黑暗森林-$VER-win64-setup.exe"
[ -f "$OUT" ] || { echo "✗ 没产出 $OUT" >&2; exit 1; }
echo "SETUP   → $HERE/$OUT  [$(du -h "$OUT" | awk '{print $1}')]"

# 校验安装包能被打开、payload 在里面（有 /tmp/7zz 才做）
if [ -x /tmp/7zz ]; then
  N=$(/tmp/7zz l "$OUT" 2>/dev/null | grep -c -E "dark-forest.exe|locales" || true)
  [ "$N" -ge 2 ] && echo "· 安装包内容校验通过（dark-forest.exe / locales 都在）"
fi
