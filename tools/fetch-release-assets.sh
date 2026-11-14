#!/bin/sh
# ============================================================
# tools/fetch-release-assets.sh —— 让 web/download/ 与当前版本对齐
#
#   sh tools/fetch-release-assets.sh
#
# 谁在用：release.yml 的 publish job、deploy-worker.yml（push main 时）。
#
# 为什么需要它：安装包不进 git（105 MB 的完整版超 GitHub 单文件上限），
# 但 Worker 的静态资源又必须带上 dmg / 轻量 exe。所以每次部署前在这里
# 「按 desktop/package.json 的版本号」把包补齐：本地有就用本地的，
# 没有就从 GitHub Release 拉当前版本的附件。
#
# 两条护栏（别拆，都是踩过的坑）：
#   1. 只有当前版本的同类包确实就位时，才删同后缀的旧包。否则保留——
#      宁可线上多一个旧版本的下载项，也不能让「下载客户端」变 404。
#   2. 当前版本的包一个都没有、Release 也还没建时，**不重算清单**。
#      否则版本号刚 bump、tag 还没打的那段时间里，push 一次 main 就会
#      把 desktop.json 写成指向不存在的 Release 的链接（提示有新版，点进去 404）。
#
# 需要环境变量：GH_TOKEN（仓库令牌，gh CLI 用）。没有 gh 也能跑，只是拉不到。
# ============================================================
set -e
HERE=$(cd "$(dirname "$0")/.." && pwd)
DL="$HERE/web/download"
VER=$(node -p "require('$HERE/desktop/package.json').version")
TAG="v$VER"

MAC_NAME="dark-forest-$VER-macos-universal.dmg"
WIN_NAME="dark-forest-$VER-tauri-setup.exe"

mkdir -p "$DL"
echo "· 目标版本 $VER（$TAG）"

have_gh=0
command -v gh >/dev/null 2>&1 && have_gh=1

# Release 是否存在，只探一次
rel_ok=0
if [ "$have_gh" = 1 ] && gh release view "$TAG" >/dev/null 2>&1; then
  rel_ok=1
fi

# ---------- 1. 补齐当前版本的包 ----------
pull() {
  name="$1"
  [ -f "$DL/$name" ] && { echo "  已有 $name"; return 0; }
  [ "$rel_ok" = 1 ] || { echo "  ⚠ Release $TAG 还不存在，跳过 $name" >&2; return 0; }
  echo "  从 $TAG 拉 $name"
  gh release download "$TAG" --pattern "$name" --dir "$DL" --clobber 2>/dev/null \
    || echo "  ⚠ 下载失败：$name" >&2
}

pull "$MAC_NAME"
pull "$WIN_NAME"

# ---------- 2. 收拾旧包 ----------
have_mac=0; [ -f "$DL/$MAC_NAME" ] && have_mac=1
have_win=0; [ -f "$DL/$WIN_NAME" ] && have_win=1

for f in "$DL"/*.dmg; do
  [ -e "$f" ] || continue
  [ "$(basename "$f")" = "$MAC_NAME" ] && continue
  if [ "$have_mac" = 1 ]; then rm -f "$f"; echo "  − 移除旧包 $(basename "$f")"
  else echo "  ! 保留旧包 $(basename "$f")：当前版本的 dmg 还没到位" >&2; fi
done
for f in "$DL"/*.exe; do
  [ -e "$f" ] || continue
  [ "$(basename "$f")" = "$WIN_NAME" ] && continue
  if [ "$have_win" = 1 ]; then rm -f "$f"; echo "  − 移除旧包 $(basename "$f")"
  else echo "  ! 保留旧包 $(basename "$f")：当前版本的 exe 还没到位" >&2; fi
done

# ---------- 3. 重算清单 ----------
# 清单里的版本 / 体积 / 链接全部现算，别手改（以前就是靠手改，漏一处就是死链）
if [ "$have_mac" = 1 ] || [ "$have_win" = 1 ] || [ "$rel_ok" = 1 ]; then
  node "$HERE/tools/make-desktop-manifest.js"
else
  echo "  ⚠ $VER 的安装包还没到位、Release $TAG 也没建，清单保持原样"
  echo "    （这一版还没发；发版由 release.yml 在附件传完后自动重算）"
fi

echo "· web/download 现状："
ls -lh "$DL" | tail -n +2 | awk '{print "    " $9 "  " $5}'
