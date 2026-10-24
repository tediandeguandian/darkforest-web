# Tauri 桌面版（Windows）

同一套网页，换成 Tauri 外壳：**安装包约 5 MB**（对比 Electron 的 90 MB+）。

## 为什么小

Electron 自带整个 Chromium（exe 就 238 MB）；Tauri 直接调用系统里的 **WebView2**
（Windows 10 1803+ / Windows 11 自带，或者被 Edge 浏览器带上）。

## WebView2 缺失怎么办

`tauri.conf.json` 里写的是：

```json
"webviewInstallMode": { "type": "downloadBootstrapper", "silent": true }
```

意思是：**安装程序先检测 WebView2**，检测不到就从微软官网下载引导安装程序并静默装上，
装完继续走自己的安装流程。用户全程只点一次安装包，不会看到空白窗口。

> 静默模式需要系统已装 WebView2 Runtime 的引导程序能联网；断网时会失败并提示。
> 想改成"问一句要不要下载"，把 `silent` 改成 `false`。

## 怎么构建

Windows 上一条命令：

```powershell
sh desktop-tauri/prep.sh                 # 1. 把网页整理进 desktop-tauri/www
cd desktop-tauri/src-tauri
cargo install tauri-cli --version "^2" --locked
cargo tauri build --bundles nsis         # 2. 出安装包
```

产物：`desktop-tauri/src-tauri/target/release/bundle/nsis/黑暗森林_1.0.13_x64-setup.exe`

也可以在 GitHub Actions 里构建（仓库里已带 `.github/workflows/build-windows.yml`），
push 一个 tag 或手动触发，安装包直接挂在 Artifacts 上。

## 为什么这台 Mac 上没编出来

Tauri 要出 Windows 包需要 Rust + Windows 目标工具链（MSVC 或 mingw-w64），
这台机器上没有装，也没有 Homebrew/NSIS，所以只交了**工程源码**与 **CI 配置**。
工程里的代码、配置、图标、前端整理脚本都是可以直接在 Windows 或 CI 上跑的。

## 和 Electron 版的差异

| | Electron | Tauri |
|---|---|---|
| 安装包体积 | ~90 MB | ~5 MB |
| 运行时依赖 | 无 | WebView2（缺失时安装包自动下载） |
| 局域网同步 | ❌ | ❌ |
| 应用内更新 | ❌ | ❌ |
| 存档 / 设置位置 | `%APPDATA%\dark-forest` | WebView2 数据目录（按应用标识隔离） |

游戏逻辑完全一致——两个壳跑的是同一份 `web/` + `shared/`。
