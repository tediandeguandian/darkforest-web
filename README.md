# 三体 · 黑暗森林（桌游网页版）

以《三体》"黑暗森林"为背景的隐蔽坐标桌游：每位玩家随机藏在一个星系里，坐标对其他人严格保密。通过**广播试探、打击飞行、公开事件推理**拼出别人的位置，淘汰所有对手即获胜。

规则引擎只有一份（`shared/`），网页联机、单机热座、安卓 APK、Windows 桌面版全部共用。

## 怎么玩

### 开局

- 1–9 号星图，每人随机抽一张**星系牌**作为坐标，对其他人**严格保密**
- 每人 3 点能量起手、手牌 4 张
- 2–9 人（联机房间可加人机，四档难度）

### 回合流程

```
生产（+1 能量 + 建设产能） → 行动（出牌或弃牌二选一） → 补给（补至 4 张） → 下一位
```

- 一名玩家的回合内，**所有人**都可以打出响应类卡牌
- 弃牌即结束回合（每回合限一次，一次可弃任意张）

### 三类卡牌

| 类型 | 作用 |
|---|---|
| **广播**（6 种 28 张） | 朝某个星系发布信号，所有够得着的人必须回应：**合作**帮发布者做事，**伪装**则反咬。回应牌在结算前不公开是哪一面 |
| **打击**（5 种 14 张） | 按距离累积飞行进度，命中看目标星系**有没有人**——有则淘汰，无人则落空。可被防御建筑挡下（只保人不保星系），可主动撤回 |
| **建设**（8 种 22 张） | 正面放置全场可见：产能（太阳能/戴森球…）、防御（掩体星环/量子幽灵）、**光速飞船**（仅被打击且会致命时才能启动，跃迁到随机空星系保命）、监听基地（免回应） |

### 关键规则

- **命中判定**：结算时只看目标星系是否有人——坐标保密全靠这条：你能推断"某人可能在哪"，但永远拿不到直接坐标
- **淘汰奖励**：打击真正淘汰一名玩家时，打击者获得 `剩余玩家数 × 3` 点能量
- **死人也会开枪**：被淘汰者已发出的打击照常结算
- **星系标记**：打击和某些事件会留下黑/紫/红标记，永久改变星图
- **胜负**：最后幸存者获胜

完整规则速查见 [三体黑暗森林桌游规则速查.html](三体黑暗森林桌游规则速查.html)。

## 下载安装包

到 [Releases](https://github.com/tediandeguandian/darkforest-web/releases) 下载：

| 文件 | 适用 |
|---|---|
| `dark-forest-<版本>.apk` | 安卓。离线单机 / 同一 Wi-Fi 局域网 / 在线联机三合一 |
| `dark-forest-<版本>-macos-universal.dmg` | macOS 10.15+（Intel / Apple 芯片通用）。装好后会在有新版本时自己提示 |
| `dark-forest-<版本>-tauri-setup.exe` | Windows 轻量版（约 1.5 MB）。使用系统 WebView2，缺失时安装程序会自动下载 |
| `dark-forest-<版本>-win64-setup.exe` | Windows 完整版（约 105 MB）。自带浏览器内核，零依赖 |
| `dark-forest-win64-<版本>.zip` | Windows 免安装版。解压双击 `dark-forest.exe` |

也可以直接部署网页版玩（见下节）——入口页会提供上述安装包的下载链接。

## 部署到自己的服务器

### 组成

| 部分 | 目录 | 说明 |
|---|---|---|
| **服务端** | `server/` | Node + `ws`：HTTP 静态服务 + WebSocket，房间管理与**全部规则判定**（坐标不下发，服务端权威） |
| **服务端（可选）** | `worker/` | Cloudflare Workers + Durable Objects 版本，功能等价，适合无服务器部署 |
| **前端** | `web/` | 联机页面（入口 / 大厅 / 牌桌） |
| **前端** | `game/` | 单机热座页面，双击 `index.html` 直接玩，不需要服务端 |
| **共用** | `shared/` | 规则引擎、卡牌数据、视图裁剪、AI——前后端与各客户端唯一规则来源 |

### 用 Node 跑起来

```bash
cd server
npm install        # 唯一依赖：ws
npm start          # 默认 8080 端口
```

浏览器打开 `http://<服务器地址>:8080` 即可开房联机。

### 观战

入口页输入对局码后点「观战」即可旁观：不占席位、不发重连凭证、退出不影响牌局。

观战拿到的是**和普通玩家同一份公开视图**——每个人的坐标与手牌都不下发，
界面上也没有手牌区与操作按钮；绕过界面直接发指令会被服务端拒绝（`观战中不能操作`）。
想给观战者开上帝视角，等于把隐藏信息交给一个可以开麦的人，不要这么做。

### 按自身情况需要改的地方

| 文件 | 什么时候改 |
|---|---|
| 服务器地址 | 同源部署（前端由 server/ 或 worker/ 托管）**无需配置**；前后端分离时在 `web/index.html` 的 `</head>` 前加 `<script>window.DF_SERVER="https://你的服务端";</script>` |
| `web/download/apk.json` | 想提供安卓下载入口时：写入你的 APK 版本号与地址；删掉此文件则入口自动隐藏 |
| `web/download/desktop.json` | 桌面版（macOS / Windows）的下载清单，**同时供桌面版自身检查更新**。别手写：跑 `node tools/make-desktop-manifest.js`，版本、体积、更新说明都从 `desktop/package.json` / `apk/release-notes.json` / 实际安装包现算 |
| `server/server.js` 顶部 `AI_THINK_MIN / AI_THINK_MAX` | 人机"思考"时长（毫秒，默认 3–10 秒） |

### Cloudflare Workers 版

`worker/` 目录与 Node 版功能等价（房间状态跑在 Durable Object 上）。有 Cloudflare 账号的话 `cd worker && npx wrangler deploy` 即可；细节见 [worker/README.md](worker/README.md)。

## 开发与测试

```bash
node server/test-server.js                        # 规则引擎 / 视图裁剪 / AI / 边界兜底
node server/test-net.js                           # 断线语义 / 主动离开 / 观战握手
node server/test-ui.js                            # 前端渲染冒烟（需要 jsdom）
cd worker && npm test                             # Durable Object 逻辑
```

## 发版（维护者）

打一个 tag，剩下的交给 CI。**只需要做三件事**：

```bash
# 1. 改版本号（三处都要）
#    desktop/package.json                 → version    （唯一真源，同步脚本会带给 Tauri）
#    apk/AndroidManifest.xml              → versionName 改成同版本，versionCode 加 1
# 2. 写本版改动
#    apk/release-notes.json               → 加一个 "1.0.31": ["...", "..."] 条目
# 3. 打 tag
sh tools/sync-version.sh
git commit -am "v1.0.31" && git push
git tag v1.0.31 && git push origin v1.0.31
```

之后由 `.github/workflows/release.yml` 串起来：

| 阶段 | 做什么 |
|---|---|
| `prepare` | 校验 tag 与 `desktop/package.json` 一致（不一致直接失败），建 Release，正文由 `release-notes.json` 生成 |
| `mac` / `win` / `apk` | 调三个构建工作流，各自把产物传成 artifact 并挂到 Release |
| `publish` | 收齐产物 → 放进 `web/download/` → 重算 `desktop.json` / `apk.json` → `wrangler deploy` |

只改前端（`web/` `shared/` `worker/`）时不用发版：push 到 main 会触发 `deploy-worker.yml` 自动部署线上。

### 一次性配置

仓库 **Settings → Secrets and variables → Actions** 里填两项，之后不用再碰：

| Secret | 取值 | 用途 |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens → **Edit Cloudflare Workers** 模板 | 部署 Worker |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 首页右下角 Account ID | 同上 |

`GITHUB_TOKEN` 由 Actions 内置，不用配。**没配 Cloudflare 两项时**，发版仍会构建、建 Release、传附件，只跳过部署并给一条 warning。

### 几个已经踩过的坑

- **安装包不进 git**：完整版 exe 有 105 MB，超 GitHub 单文件上限。所以 `web/download/` 里的 dmg / exe 由 `tools/fetch-release-assets.sh` 在每次部署前按版本号从 Release 回填；`make-desktop-manifest.js` 发现本地没有包时会自动退回 Release 外链。
- **别给 `build-macos.yml` / `build-windows.yml` 加 `push.tags`**：`release.yml` 已经在调它们，两条路都开着会构建两遍、并发上传同一个附件。
- **`gh release upload` 不能带 `continue-on-error`**：Release 不存在时上传会失败，被吞掉之后 job 显示绿色，实际没传上去。现在先 `gh release view` 确认，失败就让 job 红。
- **`wrangler.toml` 里的 `shuwang.dpdns.org`**：这条 custom domain 删掉时 Cloudflare 会连带删它的 DNS 记录，域名直接不解析。别动。

### 回滚

```bash
cd worker && npx wrangler rollback          # 网站回到上一个部署版本
gh release delete v1.0.31 --cleanup-tag     # 撤掉错的 Release（含 tag），修好后重打
```
