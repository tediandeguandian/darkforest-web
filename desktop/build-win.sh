#!/bin/sh
# 打 Windows 桌面版（Electron）：在 macOS 上也能出 win32-x64 的包，
# 不需要 wine（只做免安装文件夹 + zip，不做 NSIS 安装器，后者才要 wine）。
#
# 用法：sh build-win.sh
# 产物：dist/dark-forest-win32-x64/（双击 dark-forest.exe 即可）
#       dist/黑暗森林-win64-v<版本>.zip
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/.." && pwd)
VER=$(node -p "require('$HERE/package.json').version")
cd "$HERE"

ZIP=$(command -v zip || true)
[ -n "$ZIP" ] || { echo "✗ 找不到 zip" >&2; exit 1; }

# ---------- 1. 页面：唯一真源在 ../web 与 ../shared，这里只放快照 ----------
rm -rf www build release   # release 是 electron-builder 的输出目录，不进包 release   # release 是 electron-builder 的输出目录，不进包
mkdir -p www/js www/shared www/img build
cp "$ROOT/web/style.css" www/
cp "$ROOT/web/img/"*.jpg www/img/
cp "$ROOT/web/js/ui.js" "$ROOT/web/js/local.js" "$ROOT/web/js/net.js" www/js/
[ -f "$ROOT/web/js/net-lan.js" ] && cp "$ROOT/web/js/net-lan.js" www/js/
cp "$ROOT/shared/cards.js" "$ROOT/shared/rules.js" "$ROOT/shared/ai.js" "$ROOT/shared/view.js" www/shared/
cp "$ROOT/apk/icon/icon-512.png" www/icon.png
cp "$ROOT/web/favicon.ico" "$ROOT/web/favicon.png" "$ROOT/web/apple-touch-icon.png" www/

# 离线页：file:// 下 ../shared 解析不到，改成本目录里的相对路径
# （不注入 DF_APP：那是安卓壳的标记，桌面版没有原生桥）
sed 's|\.\./shared/|shared/|g' "$ROOT/web/local.html" \
  | sed 's|</head>|<script>window.DF_SERVER="https://darkforest.dpdns.org";</script></head>|' \
  > www/index.html

# 联机页：把服务器绝对路径改成相对路径，并注入服务器地址
ROOT="$ROOT" node -e '
const fs = require("fs");
let s = fs.readFileSync(process.env.ROOT + "/web/index.html", "utf8");
s = s.replace(/"\/shared\//g, "\"shared/")
     .replace(/"\/web\/js\//g, "\"js/")
     .replace(/"\/web\/style\.css"/g, "\"style.css\"")
     .replace("</head>", "<script>window.DF_SERVER=\"https://darkforest.dpdns.org\";</script></head>");
fs.writeFileSync("www/online.html", s);
'

[ -f www/index.html ] || { echo "✗ www/index.html 没生成" >&2; exit 1; }
[ -f www/online.html ] || { echo "✗ www/online.html 没生成" >&2; exit 1; }

# ---------- 2. 图标：Electron 在 Windows 下要 .ico（多尺寸） ----------
PY=/Users/hephoebe/.workbuddy/binaries/python/envs/default/bin/python
if [ -x "$PY" ]; then
  "$PY" - <<'EOF'
from PIL import Image
im = Image.open('www/icon.png').convert('RGBA')
im.save('build/icon.ico', sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
print('· icon.ico 已生成')
EOF
else
  echo "⚠ 没找到 Pillow，跳过 .ico（exe 会用 Electron 默认图标）"
fi

# ---------- 3. 依赖 ----------
[ -d node_modules/electron ] || npm install --no-audit --no-fund

# ---------- 4. 打包 ----------
ICON=""
[ -f build/icon.ico ] && ICON="--icon=build/icon.ico"

# ⚠️ 用 --no-asar（文件夹模式）：本机的文件沙箱会在 asar 打包那一步拒绝写临时文件，
#    packager 直接以 SIGTERM 退出。文件夹模式功能上完全等价，只是 resources/app 里的
#    js 是明文，改起来还方便。
# ⚠️ 镜像：github 直连不通时用 npmmirror，可用 ELECTRON_MIRROR 覆盖
pack() {
  npx electron-packager . dark-forest \
    --platform=win32 --arch=x64 \
    --app-version="$VER" \
    --out=dist --overwrite --no-asar \
    --ignore='^/(dist|build|release)' --ignore='^/node_modules($|/)' \
    --ignore='\.yml$' --ignore='\.nsi$' \
    --ignore='^/smoke\.js$' --ignore='^/probe\.js$' --ignore='\.md$' \
    --win32metadata.CompanyName=shuwang \
    --win32metadata.FileDescription="三体·黑暗森林" \
    --win32metadata.ProductName="黑暗森林" \
    $ICON
}
pack || {
  echo "· 直连失败，换 npmmirror 镜像重试"
  ELECTRON_MIRROR="${ELECTRON_MIRROR:-https://npmmirror.com/mirrors/electron/}" pack
}

OUT="dist/dark-forest-win32-x64"
[ -f "$OUT/dark-forest.exe" ] || { echo "✗ 没产出 dark-forest.exe" >&2; exit 1; }

# ---------- 5. 瘦身：只留中英文语言包（49 MB → 2 MB） ----------
for f in "$OUT/locales/"*.pak; do
  case "$(basename "$f")" in
    zh-CN.pak|zh-TW.pak|en-US.pak) ;;
    *) rm -f "$f" ;;
  esac
done

# ---------- 5. 压缩包 ----------
ZABS="$HERE/dist/黑暗森林-win64-v$VER.zip"
rm -f "$ZABS"
( cd dist && "$ZIP" -qr "$ZABS" "dark-forest-win32-x64" )

echo ""
echo "EXE    → $HERE/$OUT/dark-forest.exe"
echo "整目录 → $OUT  [$(du -sh "$OUT" | awk '{print $1}')]"
echo "ZIP    → $ZABS  [$(du -h "$ZABS" | awk '{print $1}')]"
