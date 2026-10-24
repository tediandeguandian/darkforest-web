三体 · 黑暗森林 v1.0.14

网站：https://darkforest.dpdns.org
（旧地址 shuwang.dpdns.org 已 301 重定向到新地址，旧版本安装包照常可用）

本版改动
· 站点迁移至 darkforest.dpdns.org
· 桌面版提供 Windows 安装程序：向导安装、可选目录、桌面与开始菜单快捷方式、可从「设置 → 应用」卸载

下载
· 黑暗森林-1.0.14-win64-setup.exe   Windows 安装程序（约 112 MB，NSIS / LZMA）
· 黑暗森林-win64-v1.0.14.zip       Windows 免安装版（约 144 MB，解压后双击 dark-forest.exe）
· 黑暗森林-v1.0.14.apk             安卓版（约 644 KB，签名不变，可覆盖升级）

关于安卓版
· 首次启动会检查更新，右上角出现「新版本」时点开可看到本次改动清单
· 「同一个 Wi-Fi」开房需要下载安装完整版；网页版只能连线上房间

源码结构
· web/ 与 shared/     游戏本体（原生 JS，无框架）
· server/             Node 服务与房间逻辑（Durable Object 在 worker/）
· apk/                安卓壳工程（MainActivity + LanServer + build.sh）
· desktop/            Electron 桌面版（main.js + build-win.sh + build-installer.sh）
· desktop-tauri/      Tauri 桌面版工程（安装包约 5 MB，需 Windows 或 CI 构建）
· tools/              共用脚本（前端整理、GitHub 发布）

构建
· 安卓：cd apk && sh build.sh
· 桌面：cd desktop && sh build-win.sh && sh build-installer.sh
· 线上：cd worker && npx wrangler deploy
