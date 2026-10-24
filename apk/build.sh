#!/bin/sh
# 手工构建 APK：aapt2 → javac → d8 → zipalign → apksigner
# 不依赖 Gradle；macOS / Linux / 构建容器都能跑。
#
# 用法：
#   ./build.sh                                   # 自动找 SDK
#   ANDROID_HOME=/path/to/sdk ./build.sh         # 指定 SDK
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/.." && pwd)          # 工程根：web/ shared/ 在这里
VER=$(sed -n 's/.*android:versionName="\([^"]*\)".*/\1/p' AndroidManifest.xml)

# ---------- 0. 定位 SDK ----------
# 顺序：显式 ANDROID_HOME > macOS 默认安装位置 > 构建容器里的老路径
if [ -n "$ANDROID_HOME" ]; then
  SDK="$ANDROID_HOME"
elif [ -d "$HOME/Library/Android/sdk" ]; then
  SDK="$HOME/Library/Android/sdk"
else
  SDK="/root/android-sdk"
fi
BT="$SDK/build-tools/34.0.0"
PLATFORM="$SDK/platforms/android-34/android.jar"

# 选 build-tools：取最高版本，且必须 aapt2 / d8 / zipalign / apksigner 四件齐全。
# ⚠️ 不要死认 34：build-tools 34 自带的 d8（R8 8.2）在本工程的 lambda 字节码上会
#    NPE（"Cannot invoke String.length() because parameter1 is null"），编译直接中断；
#    build-tools 35 的 d8（R8 8.6）正常。所以下面按版本从高到低挑第一个能用的。
BT=""
for v in $(ls -1 "$SDK/build-tools" 2>/dev/null | sort -r); do
  cand="$SDK/build-tools/$v"
  if [ -x "$cand/aapt2" ] && [ -x "$cand/d8" ] && [ -x "$cand/zipalign" ] && [ -x "$cand/apksigner" ]; then
    BT="$cand"; break
  fi
done
[ -n "$BT" ] || { echo "✗ 没找到完整的 build-tools（需要 aapt2/d8/zipalign/apksigner）" >&2; exit 1; }
echo "· build-tools: $BT"

[ -x "$BT/aapt2" ] || { echo "✗ 找不到 $BT/aapt2" >&2; echo "  装一下：sdkmanager \"build-tools;34.0.0\"" >&2; exit 1; }
[ -f "$PLATFORM" ] || { echo "✗ 找不到 $PLATFORM" >&2; echo "  装一下：sdkmanager \"platforms;android-34\"" >&2; exit 1; }
ZIP=$(command -v zip || true)
[ -n "$ZIP" ] || { echo "✗ 找不到 zip（macOS 自带 /usr/bin/zip）" >&2; exit 1; }

cd "$HERE"
rm -rf build
mkdir -p build/gen build/classes build/dex build/assets/www/js build/assets/www/shared

# ---------- 1. 网页与共享脚本 ----------
# 唯一真源在 ../web 与 ../shared，APK 里只放构建时的快照
cp "$ROOT/web/style.css" build/assets/www/
# 背景图（style.css 里 url("img/bg-forest.jpg")）——漏了它 APK 里就是纯色底
mkdir -p build/assets/www/img
cp "$ROOT/web/img/"*.jpg build/assets/www/img/ 2>/dev/null || true
cp "$ROOT/web/js/ui.js" "$ROOT/web/js/local.js" "$ROOT/web/js/net.js" build/assets/www/js/
[ -f "$ROOT/web/js/net-lan.js" ] && cp "$ROOT/web/js/net-lan.js" build/assets/www/js/
cp "$ROOT/shared/cards.js" "$ROOT/shared/rules.js" "$ROOT/shared/ai.js" "$ROOT/shared/view.js" build/assets/www/shared/
# file:// 下 ../shared 解析不到，改成 assets 内的相对路径；
# 同时把本机版本号注进去，页面拿它跟线上 apk.json 比对，有新版就在右上角点一个小圆点
sed 's|\.\./shared/|shared/|g' "$ROOT/web/local.html" \
  | sed "s|</head>|<script>window.DF_APP=1;window.DF_VERSION=\"$VER\";window.DF_SERVER=\"https://darkforest.dpdns.org\";</script></head>|" \
  > build/assets/www/index.html
[ -f "$ROOT/web/lan.html" ] && sed 's|\.\./shared/|shared/|g' "$ROOT/web/lan.html" > build/assets/www/lan.html

# 在线联机页：把服务器根路径改成相对路径，并注入服务器地址（file:// 下没有 location.host）
ROOT="$ROOT" VER="$VER" node -e '
const fs = require("fs");
const root = process.env.ROOT;
let s = fs.readFileSync(root + "/web/index.html", "utf8");
s = s.replace(/"\/shared\//g, "\"shared/")
     .replace(/"\/web\/js\//g, "\"js/")
     .replace(/"\/web\/style.css"/g, "\"style.css\"")
     .replace("</head>", "<script>window.DF_APP=1;window.DF_VERSION=\"" + process.env.VER + "\";window.DF_SERVER=\"https://darkforest.dpdns.org\";</script></head>");
fs.writeFileSync("build/assets/www/online.html", s);
'

# ---------- 2. 资源 ----------
"$BT/aapt2" compile --dir res -o build/res.zip
"$BT/aapt2" link -o build/base.apk -I "$PLATFORM" --manifest AndroidManifest.xml \
  -A build/assets --java build/gen build/res.zip

# ---------- 3. 编译 ----------
# 注意：javac 的错误不能被管道吞掉——曾经 `| grep -v warning || true` 让编译失败照常打包
find src build/gen -name "*.java" > build/sources.txt
if ! javac --release 8 -encoding UTF-8 -classpath "$PLATFORM" -d build/classes @build/sources.txt > build/javac.log 2>&1; then
  echo "✗ javac 失败：" >&2
  cat build/javac.log >&2
  exit 1
fi
CLASS_COUNT=$(find build/classes -name "*.class" | wc -l | tr -d ' ')
[ "$CLASS_COUNT" -gt 0 ] || { echo "✗ 没产出任何 .class" >&2; exit 1; }

# ---------- 4. dex ----------
"$BT/d8" --lib "$PLATFORM" --min-api 24 --output build/dex $(find build/classes -name "*.class")
[ -f build/dex/classes.dex ] || { echo "✗ d8 没有产出 classes.dex" >&2; exit 1; }

# ---------- 5. 打包 ----------
cp build/base.apk build/app.apk
( cd build/dex && "$ZIP" -q ../app.apk classes.dex )
"$BT/zipalign" -f 4 build/app.apk build/app-aligned.apk
[ -f build/app-aligned.apk ] || { echo "✗ zipalign 失败" >&2; exit 1; }

# ---------- 6. 签名 ----------
# keystore 放在 build/ 之外：rm -rf build 不会把签名材料删掉，否则装过旧版就再也覆盖不上
KS="$HERE/df.keystore"
if [ ! -f "$KS" ]; then
  keytool -genkeypair -keystore "$KS" -alias df -keyalg RSA -keysize 2048 \
    -validity 10000 -storepass darkforest -keypass darkforest -dname "CN=DarkForest" >/dev/null 2>&1
  echo "⚠ 生成了新的签名证书——这一版无法覆盖安装旧版"
fi
"$BT/apksigner" sign --ks "$KS" --ks-pass pass:darkforest --key-pass pass:darkforest \
  --out build/dark-forest.apk build/app-aligned.apk
"$BT/apksigner" verify --print-certs build/dark-forest.apk | head -3

# 版本号取自 AndroidManifest，产物名带上版本，避免几个包在桌面里分不清
[ -n "$VER" ] && cp build/dark-forest.apk "$ROOT/黑暗森林-v$VER.apk"

# ---------- 7. 网页的「下载安卓版」入口 ----------
# 放到 web/download/ 下，前端用 /download/apk.json 判断"有没有得下"，所以这里必须成套写
DL="$ROOT/web/download"
mkdir -p "$DL"
cp build/dark-forest.apk "$DL/dark-forest.apk"
BYTES=$(wc -c < "$DL/dark-forest.apk" | tr -d ' ')
SHA=$(shasum -a 256 "$DL/dark-forest.apk" | cut -d' ' -f1)
# apk.json 里还带一份「新功能」清单（release-notes.json 按版本号取），
# 更新弹窗直接读它——加功能时只改这个文件，不用动前端代码
DL="$DL" VER="${VER:-unknown}" BYTES="$BYTES" SHA="$SHA" NOTES="$HERE/release-notes.json" \
  node -e '
const fs = require("fs");
// release-notes.json 是「版本 → 改动清单」的表；apk.json 里同时写两份：
//   notes   —— 本次目标版本的清单（老前端只认这个）
//   history —— 全部版本，跨版本更新时前端按「本机版本 < v ≤ 目标版本」聚合，
//              让 1.0.6 的用户一次看到这一跳跨过的所有改动（安装包始终是最新整包）
let all = {};
try { all = JSON.parse(fs.readFileSync(process.env.NOTES, "utf8")) || {}; }
catch (e) { /* 没有清单就不带这两块，弹窗只是不显示 */ }

const history = {};
for (const k of Object.keys(all)) if (Array.isArray(all[k])) history[k] = all[k];

const out = {
  version: process.env.VER,
  file: "dark-forest.apk",
  bytes: Number(process.env.BYTES),
  sha256: process.env.SHA,
  notes: Array.isArray(all[process.env.VER]) ? all[process.env.VER] : [],
  history,
};
fs.writeFileSync(process.env.DL + "/apk.json", JSON.stringify(out, null, 2) + "\n");
'

echo "APK: $HERE/build/dark-forest.apk  $(du -h build/dark-forest.apk | cut -f1)  (class ×$CLASS_COUNT)"
[ -n "$VER" ] && echo "已复制 → $ROOT/黑暗森林-v$VER.apk"
echo "网页入口 → $DL/dark-forest.apk（$BYTES 字节）"
