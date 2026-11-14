#!/bin/sh
# ============================================================
# tools/prep-frontend.sh —— 把 web/ 与 shared/ 整理成「能直接开跑」的静态目录
#
#   sh tools/prep-frontend.sh <输出目录>
#
# 三处共用（别各写一份，改这里就行）：
#   · desktop/build-win.sh      Electron 桌面版
#   · desktop-tauri/prep.sh     Tauri 桌面版
#   · CI                        .github/workflows/build-windows.yml
#
# 做的事：
#   1. 拷 style.css / img / js / shared
#   2. local.html → index.html（file:// 或 tauri:// 下 ../shared 解析不到，改成 shared/）
#   3. web/index.html → online.html（去掉 /web、/shared 这类服务器绝对路径）
#   4. 两个页面都注入 window.DF_SERVER，供联机模式拼绝对地址
#   5. 两个页面都注入 DF_DESKTOP 与 DF_VERSION：
#        DF_DESKTOP 让 ui.js 知道「这是桌面壳」（返回单人模式、检查更新都靠它）；
#        DF_VERSION 是本机版本，ui.js 拿它跟线上 desktop.json 比，有新版本才提示。
#        版本号真源仍是 desktop/package.json（CI 里先跑 sync-version.sh 再 prep）。
#   注意：不注入 DF_APP —— 那是安卓壳的标记，桌面版没有原生桥
# ============================================================
set -e
OUT="$1"
[ -n "$OUT" ] || { echo "用法: sh tools/prep-frontend.sh <输出目录>" >&2; exit 1; }

ROOT=$(cd "$(dirname "$0")/.." && pwd)
SERVER="${DF_SERVER:-https://darkforest.dpdns.org}"
# 读版本号用 node 而不是 sed：package.json 的缩进/字段顺序以后可能会变
VER=$(node -p "require(process.argv[1]).version" "$ROOT/desktop/package.json" 2>/dev/null || true)
[ -n "$VER" ] || { echo "✗ 读不到 desktop/package.json 的版本号" >&2; exit 1; }
echo "· 桌面版版本 → $VER"

rm -rf "$OUT"
mkdir -p "$OUT/js" "$OUT/shared" "$OUT/img"

cp "$ROOT/web/style.css" "$OUT/"
cp "$ROOT/web/favicon.ico" "$ROOT/web/favicon.png" "$ROOT/web/apple-touch-icon.png" "$OUT/"
cp "$ROOT/web/img/"*.jpg "$OUT/img/"
cp "$ROOT/web/js/ui.js" "$ROOT/web/js/local.js" "$ROOT/web/js/net.js" "$ROOT/web/js/auth.js" "$OUT/js/"
[ -f "$ROOT/web/js/net-lan.js" ] && cp "$ROOT/web/js/net-lan.js" "$OUT/js/"
cp "$ROOT/shared/cards.js" "$ROOT/shared/rules.js" "$ROOT/shared/ai.js" "$ROOT/shared/view.js" "$OUT/shared/"

# 离线页（入口）
sed 's|\.\./shared/|shared/|g' "$ROOT/web/local.html" \
  | sed "s|</head>|<script>window.DF_SERVER=\"$SERVER\";window.DF_DESKTOP=1;window.DF_VERSION=\"$VER\";</script></head>|" \
  > "$OUT/index.html"

# 联机页
#   DF_SERVER  —— 拼联机地址
#   DF_DESKTOP —— 告诉 ui.js「这是桌面壳」：联机页要挂一个「← 单人模式」的返回按钮，
#                 入口页还要检查更新。光靠 DF_APP 不行（那是安卓壳，没有原生桥）；
#                 靠协议判断也不行（macOS 是 tauri://，Windows 是 http://tauri.localhost）。
#   DF_VERSION —— 本机版本，更新提示拿它跟 desktop.json 比
ROOT="$ROOT" SERVER="$SERVER" VER="$VER" OUT="$OUT" node -e '
const fs = require("fs");
let s = fs.readFileSync(process.env.ROOT + "/web/index.html", "utf8");
s = s.replace(/"\/shared\//g, "\"shared/")
     .replace(/"\/web\/js\//g, "\"js/")
     .replace(/"\/web\/style\.css"/g, "\"style.css\"")
     .replace("</head>", "<script>window.DF_SERVER=\"" + process.env.SERVER
       + "\";window.DF_DESKTOP=1;window.DF_VERSION=\"" + process.env.VER + "\";</script></head>");
fs.writeFileSync(process.env.OUT + "/online.html", s);
'

[ -f "$OUT/index.html" ] || { echo "✗ index.html 没生成" >&2; exit 1; }
[ -f "$OUT/online.html" ] || { echo "✗ online.html 没生成" >&2; exit 1; }
echo "· 前端就绪 → $OUT（$(ls "$OUT" | tr '\n' ' ')）"
