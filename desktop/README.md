# 桌面版（Windows · Electron）

把同一套网页装进一个窗口里，双击 `dark-forest.exe` 就能玩，不经过浏览器。

## 和安卓版的区别

| | 安卓版（APK） | 桌面版（exe） |
|---|---|---|
| 内核 | 系统 WebView | 自带 Electron（Chromium），**不依赖系统里装了什么** |
| 离线单机 | ✅ | ✅ |
| 联机 | ✅（同一个 Wi-Fi + 线上） | ✅ 只能连线上（没有局域网开服） |
| 更新提示 | ✅ 比对 `apk.json`，应用内下载安装 | ❌ 需要手动换整包（exe 不能自己替换自己） |
| 体积 | 640 KB | 安装包 104 MB / 免安装 zip 140 MB / 解压 310 MB |

局域网那块之所以没有：安卓版是 `LanServer` 在 App 进程里起了个 8080 的 HTTP 服务，
桌面版要做同样的事得把 `server/` 连同 `ws` 依赖一起塞进来（Node 服务），
这一版没做——想联机就走线上服务器。

## 构建

```bash
cd desktop
sh build-win.sh
```

脚本做的事：把 `web/` 与 `shared/` 拷进 `www/`（生成 `index.html` / `online.html`）、
从 `apk/icon/icon-512.png` 生成多尺寸 `icon.ico`、`npm install`、`electron-packager` 打 win32-x64、压 zip。

产物：

```
dist/dark-forest-win32-x64/dark-forest.exe    ← 双击就能跑
dist/黑暗森林-win64-v<版本>.zip                ← 整个文件夹的压缩包（发给别人用这个，约 144 MB）
```

> 在 macOS 上能直接出 Windows 包，是因为这里只做「免安装文件夹」，
> 不需要 wine。要做 NSIS 安装器（`setup.exe`）才需要 wine，本工程没做。

## 冒烟测试

```bash
cd desktop
npm run smoke
```

用隐藏窗口加载真实页面，断言入口页渲染、规则引擎已加载、开局后牌桌与牌库数字正确、
对手详情弹窗可用。跑完自动退出，退出码非 0 即为失败。

## 安装程序（setup.exe）

**已成功产出**：`dist/黑暗森林-1.0.13-win64-setup.exe`（104 MB，325 MB 压到 33.4%）。
向导式安装、可选目录、桌面/开始菜单快捷方式、控制面板卸载、装到当前用户目录不需要管理员权限。

构建方式（`sh build-installer.sh`，已脚本化）：

1. 先跑 `sh build-win.sh` 出免安装版（payload）
2. NSIS 工具链：`build/nsis/` 来自 npmmirror 的 `nsis-3.0.4.1.7z`（官方 7z24.09 mac 版解压），
   其中 `mac/makensis` 是原生 macOS 可执行文件（x86_64，走 Rosetta），不需要 wine；
   ⚠️ makensis 写死了找 stubs 的路径 `/usr/local/share/nsis`，
   所以 `build/nsis/` 还要拷一份过去：`cp -R build/nsis/ /usr/local/share/nsis/`
3. `./build/nsis/makensis -V2 installer.nsi`（脚本在 `installer.nsi`）

> 备选：`electron-builder.yml` 也写好了（electron-builder 自带 NSIS），但本机文件沙箱会拦它
> 的临时锁文件（实测必挂）；在 Windows 或 CI 上可以用它，效果相同。
> CI 方案见 `.github/workflows/build-windows.yml`。

## 已知限制

- **exe 不能自己更新**：Electron 的自动更新要签名 + 单独的更新服务，这里没做；
  发版后让对方重新下载 zip 覆盖即可（存档和设置都在用户目录里，不会被覆盖）。
- 首页的「下载安卓版」入口在桌面版不显示（`file://` 下自动跳过，避免死链）。
- 窗口最小 900×620；再窄就用竖屏布局（和浏览器一致）。
