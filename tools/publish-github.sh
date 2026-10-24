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
REPO="${1:-}"
TOKEN="${2:-}"
BODY="${3:-}"
[ -n "$REPO" ] && [ -n "$TOKEN" ] || { echo "用法: sh tools/publish-github.sh <仓库名> <PAT> [说明]" >&2; exit 1; }

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

echo "· 建 Release v$VER"
TAG="v$VER"
REL=$(curl -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
  "$API/repos/$OWNER/$REPO/releases" \
  -d "{\"tag_name\":\"$TAG\",\"name\":\"黑暗森林 $TAG\",\"body\":\"$BODY\",\"draft\":false,\"prerelease\":false}")
ID=$(printf '%s' "$REL" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);process.stdout.write(String(j.id||''))}catch(e){}})")
[ -n "$ID" ] || { echo "✗ 建 Release 失败：$REL" >&2; exit 1; }

upload() {
  F="$1"; LABEL="$2"
  [ -f "$F" ] || { echo "  跳过（不存在）：$F"; return; }
  echo "  上传 $LABEL（$(du -h "$F" | awk '{print $1}')）…"
  curl -s -o /dev/null -w "    %{http_code}\n" -X POST \
    -H "$AUTH" -H "Content-Type: application/octet-stream" \
    --data-binary "@$F" \
    "$API/repos/$OWNER/$REPO/releases/$ID/assets?name=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$LABEL")"
}

upload "desktop/dist/黑暗森林-$VER-win64-setup.exe" "黑暗森林-$VER-win64-setup.exe"
upload "desktop/dist/黑暗森林-win64-v$VER.zip" "黑暗森林-win64-v$VER.zip"
upload "黑暗森林-v$VER.apk" "黑暗森林-v$VER.apk"

echo ""
echo "完成：https://github.com/$OWNER/$REPO/releases/tag/$TAG"
