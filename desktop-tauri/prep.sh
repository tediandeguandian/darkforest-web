#!/bin/sh
# Tauri 桌面版：构建前把网页拷进 www/（和 Electron 版共用同一套整理逻辑）
#   sh desktop-tauri/prep.sh
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
sh "$HERE/../tools/prep-frontend.sh" "$HERE/www"
