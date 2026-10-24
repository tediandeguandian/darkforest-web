#!/bin/sh
# ============================================================
# tools/publish-github.sh —— 把工程推到 GitHub，并发一个 Release（附安装包）
#
#   用法：sh tools/publish-github.sh <仓库名> <PAT> [说明]
#
# PAT 需要这些权限：repo（建仓 + 推代码 + 建 Release）、workflow（如果推 .github/workflows）
# 建一个 fine-grained token 或 classic token 都行。
#
# 为什么安装包不直接进 git：
#   GitHub 单文件上限 100 MB，而 setup.exe 有 112 MB → 只能走 Release 附件。
#   Release 附件上限 2 GB/个，正合适。
# ============================================================
set -e
REPO="${1:-darkforest-web}"
TOKEN="${2:-}"
BODY_FILE="${3:-}"
TAURI_EXE="${4:-}"
[ -n "$REPO" ] && [ -n "$TOKEN" ] || { echo "用法: sh tools/publish-github.sh <仓库名> <PAT> [说明文件]" >&2; exit 1; }

HERE=$(cd "$(dirname "$0")/.." && pwd)
cd "$HERE"

VER=$(node -p "require('$HERE/desktop/package.json').version")
API="https://api.github.com"
AUTH="Authorization: Bearer $TOKEN"

echo "· 校验凭据"
OWNER=$(curl -s -H "$AUTH" "$API/user" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);process.stdout.write(j.login||'')}catch(e){}})")
[ -n "$OWNER" ] || { echo "✗ PAT 无效或没权限" >&2; exit 1; }
echo "  账号：$OWNER"

echo "· 建仓库 $OWNER/$REPO（已存在就跳过）"
curl -s -o /dev/null -w "" -X POST -H "$AUTH" -H "Content-Type: application/json" \
  "$API/user/repos" -d "{\"name\":\"$REPO\",\"private\":false,\"description\":\"三体 · 黑暗森林：网页 + 安卓 + 桌面版\",\"has_issues\":true}" \
  || true
sleep 1

echo "· 提交并推送"
git add -A
git -c user.name="${GIT_NAME:-shuwang}" -c user.email="${GIT_EMAIL:-shuwang@users.noreply.github.com}" \
    commit -m "发布 v$VER：域名迁移 darkforest.dpdns.org" 2>&1 | tail -2 || true
git branch -M main 2>/dev/null || true
git remote remove origin 2>/dev/null || true
git remote add origin "https://$OWNER:$TOKEN@github.com/$OWNER/$REPO.git"
git push -u origin main 2>&1 | tail -3
# 推完就把 remote 里明文的 token 抹掉（别留在 .git/config 里）
git remote set-url origin "https://github.com/$OWNER/$REPO.git"

echo "· 建 Release v$VER"
TAG="v$VER"
PAYLOAD=$(BODY_FILE="$BODY_FILE" TAG="$TAG" node -e '
const fs = require("fs");
let body = "";
if (process.env.BODY_FILE && fs.existsSync(process.env.BODY_FILE)) body = fs.readFileSync(process.env.BODY_FILE, "utf8");
process.stdout.write(JSON.stringify({
  tag_name: process.env.TAG,
  name: "黑暗森林 " + process.env.TAG,
  body,
  draft: false,
  prerelease: false,
}));')
REL=$(curl -s -H "$AUTH" "$API/repos/$OWNER/$REPO/releases/tags/$TAG")
if ! printf '%s' "$REL" | grep -q '"id"'; then
  REL=$(curl -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
    "$API/repos/$OWNER/$REPO/releases" -d "$PAYLOAD")
fi
ID=$(printf '%s' "$REL" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);process.stdout.write(String(j.id||''))}catch(e){}})")
[ -n "$ID" ] || { echo "✗ 建 Release 失败：$REL" >&2; exit 1; }

upload() {
  F="$1"; LABEL="$2"
  [ -f "$F" ] || { echo "  跳过（不存在）：$F"; return; }
  echo "  上传 $LABEL（$(du -h "$F" | awk '{print $1}')）…"
  curl -s -o /dev/null -w "    %{http_code}\n" -X POST \
    -H "$AUTH" -H "Content-Type: application/octet-stream" \
    --data-binary "@$F" \
    "https://uploads.github.com/repos/$OWNER/$REPO/releases/$ID/assets?name=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$LABEL")"
}

# 附件名一律用 ASCII：中文名经 URL 传参会被 GitHub 截成 "-1.0.14.apk" 这种残缺名
upload "desktop/dist/黑暗森林-$VER-win64-setup.exe" "dark-forest-$VER-win64-setup.exe"
upload "desktop/dist/黑暗森林-win64-v$VER.zip"       "dark-forest-$VER-win64.zip"
upload "黑暗森林-v$VER.apk"                           "dark-forest-$VER.apk"

# ---------- 网页的下载入口：Windows 版 ----------
# 入口页读 web/download/desktop.json（静态文件，随 worker 一起部署）。
# 在这里重写它，保证链接永远指向刚发布的这个版本——否则发一次版就失效一次。
REL_BASE="https://github.com/$OWNER/$REPO/releases/download/$TAG"
TAURI_EXE="$TAURI_EXE" node - "$HERE" "$VER" "$REL_BASE" <<'EOF'
const fs = require('fs');
const path = require('path');
const [here, ver, base] = process.argv.slice(2);
const localExe = process.env.TAURI_EXE;
const localName = 'dark-forest-' + ver + '-tauri-setup.exe';

// 轻量版：有本地文件就拷进 web/download/ 走本站直链（1.5 MB，服务器扛得住），
// 否则退回 GitHub Release 外链
let tauri;
if (localExe && fs.existsSync(localExe)) {
  fs.copyFileSync(localExe, path.join(here, 'web/download', localName));
  tauri = { url: '/download/' + localName, file: localName };
  console.log('· 轻量安装包已放到 web/download/' + localName);
} else {
  tauri = { url: base + '/dark-forest-' + ver + '-tauri-setup.exe' };
  console.log('· 没给 Tauri 安装包路径，轻量版仍指向 GitHub Release');
}

const out = {
  title: 'Windows 版',
  items: [
    {
      label: '下载 Windows 版（轻量）',
      sub: 'v' + ver + ' · 1.5 MB · 需 WebView2（缺失时自动装）',
      ...tauri,
    },
    {
      label: '下载 Windows 版（完整）',
      sub: 'v' + ver + ' · 105 MB · 零依赖，自带浏览器内核',
      url: base + '/dark-forest-' + ver + '-win64-setup.exe',
    },
  ],
};
fs.writeFileSync(here + '/web/download/desktop.json', JSON.stringify(out, null, 2) + '\n');
console.log('· web/download/desktop.json 已更新（指向 ' + ver + '）');
EOF

echo ""
echo "完成：https://github.com/$OWNER/$REPO/releases/tag/$TAG"
echo "别忘了：cd worker && npx wrangler deploy（desktop.json 才能生效）"
