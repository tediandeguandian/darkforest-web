#!/bin/sh
# 组装静态资源：public/web ← web/，public/shared ← shared/
set -e
cd "$(dirname "$0")"
rm -rf public
mkdir -p public
cp -r ../web public/web
cp -r ../shared public/shared
echo "assets: $(find public -type f | wc -l | tr -d ' ') files"
