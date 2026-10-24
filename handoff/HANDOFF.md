# 交接说明（HANDOFF）

> 给下一个接手的 AI 或人类开发者。读完这一份，你应该能在 10 分钟内跑起来、30 分钟内改第一个需求。
>
> 项目版本：**v1.0.16**（2026-10-24）
> 线上：<https://darkforest.dpdns.org>（Cloudflare Worker `dark-forest` + Durable Object）
> APK：`黑暗森林-v1.0.14.apk`（644 KB，versionCode 20，含 5 档图标 + 自适应图标 + 两张背景）

---

## 1. 这是什么

把桌游《三体·黑暗森林》（游歌，A 款）做成**网页 + 安卓**的多人游戏。

三种玩法共用一套规则引擎：

| 玩法 | 权威状态在哪 | 需要什么 |
|---|---|---|
| 离线（人机） | 手机 WebView | 什么都不需要 |
| 局域网 | 手机当主机，`LanServer` 只做中继 | 同一个 Wi-Fi |
| 在线 | Cloudflare Durable Object | 有网 |

核心设计只有一句话：**坐标从来没有发到过客户端**。别人的 `galaxy` 和 `hand` 在服务端就被置成 `null`，不是前端藏起来。

---

## 2. 五分钟上手

```bash
cd server && npm install && npm start     # → http://localhost:8080
node server/test-server.js                # 267 项规则测试（最常用）
node server/test-ui.js                    # 19 项前端渲染冒烟（需 cd server && npm i jsdom）
cd worker && npm test                     # 34 项 DO 测试
cd worker && npx wrangler deploy          # 部署线上
cd apk && sh build.sh                     # 出 APK（需要 Android SDK 34）
```

目录：

```
shared/        规则引擎（唯一真源，Node / DO / 浏览器共用）
  cards.js     卡牌、星图、距离、广播脱敏
  rules.js     纯状态机 createGame(names, {mode})
  view.js      可见性过滤（唯一的下发出口）
  ai.js        四档人机（记忆即难度）
server/        Node 后端（本地开发）
worker/        Cloudflare 后端（Durable Object）
web/           联机前端（原生 JS，无框架）
desktop/       Windows 桌面版（Electron）：main.js 外壳 + build-win.sh，产物在 dist/
desktop-tauri/ Windows 桌面版（Tauri）：安装包约 5 MB，构建要 Windows/CI；见 .github/workflows/
tools/         prep-frontend.sh：桌面两套壳共用的「网页 → www/」整理脚本
.github/workflows/build-windows.yml  在 Windows runner 上同时出 Tauri / Electron 安装包
desktop/build-installer.sh  出 Windows NSIS 安装包（本机已跑通，104 MB）
               ⚠️ style.css 里有**两套 :root 主题**（后半段才是生效的紫黑那套），
                  改配色/背景别只看文件开头
  local.html   离线 / 局域网主机版
  download/    「下载安卓版」的安装包 + apk.json（由 apk/build.sh 写入，别手改；notes 来自 apk/release-notes.json）
  img/         两张页面背景（bg-forest 入口/大厅、bg-space 对局中；来源与调色见 img/CREDIT.md）
               界面偏好（毛玻璃开关/浓度）存在浏览器 localStorage 的 df_ui_pref，不进视图、不影响对局
apk/           Android 工程（手工构建，不用 Gradle）
handoff/       本交接包
tools/usage.py 查当天 Cloudflare 额度
```

---

## 3. 三条不能破的红线

违反任何一条，游戏立刻失去意义（不是"变难玩"，是"没法玩"）。

### 3.1 信息只能从 `viewFor` 出去

任何新字段，先问"谁该看到"。对手的坐标、手牌、别人还没翻开的广播面，一律不下发。
**日志、事件流、弹窗、弃牌堆、战报是五个独立出口**——堵一个不算堵（曾经漏过四个）。

### 3.2 规则只在 `shared/` 里改

Node、Durable Object、浏览器 WebView 共用同一份 `rules.js`。不要在 `server/` 或 `worker/` 里写规则判断，否则三条路径迟早分叉。

### 3.3 挂起状态必须防重入 + 必须能收尾

"等玩家决定"的状态目前有两个：`S.broadcast`（广播响应）和 `S.escapePending`（光速飞船）。
新增同类状态时，必须回答：谁有权解？超时怎么算？对局结束时怎么清？已有挂起时又来一个会怎样？

> 这两个问题都真实发生过：两枚打击同时到期把 `step` 卡在 `escape`，全 AI 局 3000 步跑不完；朝自己星系开火把自己打死后，房间停在死人身上。

---

## 4. 现在的实现状态

| 模块 | 文件 | 状态 |
|---|---|---|
| 规则引擎 | `shared/rules.js` | ✅ 标准/快速两种房间规则 |
| 卡牌与星图 | `shared/cards.js` | ✅ 19 种 64 张，原著星系命名 |
| 可见性过滤 | `shared/view.js` | ✅ |
| 四档人机 | `shared/ai.js` | ✅ 脱水者 / 乱纪元 / 恒纪元 / 智子 |
| Node 服务端 | `server/` | ✅ |
| Cloudflare | `worker/` | ✅ DO + Hibernation + alarm |
| 联机前端 | `web/` | ✅ 平面牌桌 |
| 安卓三合一 | `apk/` | ✅ 离线 / 局域网 / 在线 |
| 测试 | — | 267（规则）+ 19（UI 冒烟）+ 34（DO） |
| 观战 / 回放 / 战绩 | — | ⬜ 未开始 |
| 房主移交 / 踢人 | — | ⬜ 未开始 |
| 真机验证 APK | — | ⚠️ v1.0.16 已出包（签名可覆盖升级），仍未在真安卓机跑过 |

---

## 5. 已经定死的规则（别再改回去）

这些是用户反复确认过的，改动前先问。

| 主题 | 结论 |
|---|---|
| 初始能量 | **3 点**；每回合开始基础 +1，另有 50% 概率再 +1 |
| 补牌 | **标准局**：只在回合结束补至 4；**快速局**：回合开始 + 弃牌后 + 回合结束都补 |
| 弃牌 | 每回合一次、可一次弃多张。标准局弃牌＝结束回合；快速局弃牌＝换牌还能继续出 |
| 光速飞船 | **留在手牌，不能建造**。只在"这一击会要命"时弹窗问，30 秒不选＝放弃。启动代价：弃牌 + 弃全部建设 + 能量归零 + 随机空星系，**落点不公开** |
| 广播面 | 出牌时、回应时都看不到合作/伪装；**进了弃牌堆就是明牌** |
| 广播等待 | 60 秒上限，**全员表态就立刻结算**；无人回应 5–20 秒 |
| 多人回应挑选 | 发布者只看得到"谁回应了"，看不到面；15 秒不挑则结算最先回应者 |
| 打击 | 只公开"谁打哪个星系"，不公开飞行回合；可撤回（能量不退） |
| 回合上限 | 240 回合热寂，能量最高者胜 |
| 弹窗 | 前端**禁用 alert/confirm**，一律走 `openDialog()`（应用内 `.dlg`）；WebView 里的原生确认框样式不可控、且挡住牌桌 |
| 版本号 | `1.0.x` 小步迭代（1.0.1 → 1.0.2 → … → 1.0.10），**不要自行跳大版本**（1.1.0/1.2.0）；`versionCode` 每次 +1 |
| 打击目标显示 | **房间设置**，默认「公开」；关闭后飞行中只公开「谁 · 哪种 · 已飞几手」，**落地那一刻**才公布位置（战报 + 事件 + 5 秒播报）。发起者自己始终看得见自己的目标；科技锁死是即时牌，当回合的弃牌堆条目上会带目标 |
| 观战 | 出局玩家继续看牌桌，但拿不到别人的坐标 |

完整的规则与边界裁决见 `三体黑暗森林桌游-网页化设计与AI方案.md` 第二章（尤其 2.10「边界情况的裁决」）。

---

## 6. 踩过的坑（改之前先看）

`三体黑暗森林桌游-网页化设计与AI方案.md` 第六章有 30 多条，这里只列最容易再犯的五条：

1. **前端藏不住信息** —— 必须服务端裁剪。
2. **挂起状态被覆盖** —— 第二枚打击把 `prevStep` 记成 `escape`，整局静默卡死。
3. **keystore 不能放 `build/`** —— `rm -rf build` 会把签名材料一起删掉，装过旧版就再也覆盖不上。
4. **WebView 不实现 `confirm`** —— 不接管 `WebChromeClient` 的话，所有确认框点了都没反应。
5. **测试别写死数字** —— 断言 `energy === 7` 会在每次调平衡时红一片，写 `before + 5`。

---

## 7. 已知问题 / 风险

| 问题 | 说明 | 建议 |
|---|---|---|
| 标准局容易拖长 | 手牌是硬约束，AI 常无牌可出，实测单局 36–200 回合，偶尔接近 240 上限 | 可考虑"回合开始补到 2 张"，或把上限提到 300 |
| 真机未验证 | APK 只验证过编译、签名、冷启动资源加载 | 找一台安卓机装上，重点测局域网（8080 端口、`setAllowUniversalAccessFromFileURLs`） |
| 免费额度 | DO 每天 10 万请求 / 10 万行写；人机局约 125 请求/局 | 一天 300 局左右，正常玩用不完；`python3 tools/usage.py` 可查 |
| 断线重连 | 靠 localStorage token 回原席位 | 换设备/清缓存会丢席位 |
| 隐藏目标模式更粗野 | 看不到来袭打击，谁也没法临场补掩体/买飞船；AI 同样看不到，所以不会提前建盾 | 这是设计意图（把飞行窗口从"补盾"变成"赌命"）；实测全 AI 局仍能收尾，只是更快见血 |
| APK 只验证到「装得上」 | v1.0.15 已重打包并核对签名/资源同源，但仍未在真机跑过 | 找一台安卓机装上，重点测同一个 Wi-Fi（8080 端口、`setAllowUniversalAccessFromFileURLs`） |
| 房间不持久 | 内存房间 3 小时无人在线即回收；DO 房间靠存储 | 长局别中途全退 |
| 1.0.4 及更早只能跳浏览器 | 那些版本的更新是 `openUrl` 交给系统浏览器，多点两下、还得手动点安装包 | 从 1.0.5 起是应用内下载 + 直接唤起安装器；旧版需手动装一次 |
| 1.0.1/1.0.2 无法自更新 | 那两版的检测代码用相对路径 + 服务端没给静态 CORS，属于"装上去就再也收不到提示" | 让用户手动装一次 v1.0.3；从 1.0.3 起提示链路才通 |
| 「谁出的牌」提示 | 宽屏：从座位卡画一条贝塞尔曲线到弃牌块（`.arrow-layer`，fixed 全屏 SVG）；**窄屏（≤1100px）不画**，改在牌块上显示 `.dc-who` 出牌人名 | 窄屏布局是上下堆叠的，跨屏线会盖住星图与提示文字。归属信息由 `view.js` 的 `discardEntry.actor/actorName` 提供（本来就是公开信息） |
| CI 自动挂 Release | `softprops/action-gh-release@v2` 需要 `permissions: contents: write`，否则静默失败（被 continue-on-error 吞掉） | tag 由 Release 创建触发 CI，产物会自动挂到对应 Release；v1.0.16 因缺权限没挂上，手动补传 |
| 广播不泄露坐标 | 战报/事件里广播**只给射程**（`radius`），不给实际距离（`distance` 这个字段在广播事件里根本不存在） | 目标星系是公开的，实际距离一公开，发布者坐标就公开了。AI 那边同样只准用 `radius`——用它反推位置才和人眼看到的一样多 |
| Worker 自定义域名 | `worker/wrangler.toml` 的 routes 两个都要挂：darkforest（新）+ shuwang（旧，用户在其 Cloudflare 侧配了 301 → 新域名） | ⚠️ **删掉旧域名那条 custom domain，Cloudflare 会把它的 DNS 记录一起删掉**，域名直接不解析，用户配的重定向规则也会失效。两条一起挂着，规则优先级更高（301 生效），互不干扰 |
| 桌面版下载入口 | 入口页读 `web/download/desktop.json`。**轻量版（1.5 MB）放本站 `/download/` 直链**，完整版跳 GitHub Release；`tools/publish-github.sh <仓库> <PAT> <说明> <Tauri安装包>` 第 4 个参数给了安装包就自动拷进 `web/download/` 并改成本站直链，不给就退回外链 | 105 MB 不能走 Worker 静态资源（免费额度 100 MB/文件）；1.5 MB 随便放。UI 按 URL 是不是 `http(s)://` 开头自动切换：本站直链加 `download` 属性、箭头 ↓；外链 `target=_blank`、箭头 ↗ |
| 域名迁移 | 1.0.14 起 `DF_SERVER` 全部指向 **darkforest.dpdns.org**；`shuwang.dpdns.org` 仍挂在同一个 Worker 上（老安装包里烙的是旧地址，删了它们就没法更新），两个自定义域名都写在 `worker/wrangler.toml` 的 routes 里 |
| 更新弹窗的「新功能」来自 apk.json | `notes` 是目标版本的清单，`history` 是全部版本；前端按「本机版本 < v ≤ 目标版本」聚合，老版本用户一次看到这一跳跨过的全部改动。都来自 `apk/release-notes.json` | 每次发版在 `apk/release-notes.json` 加一条，键名必须和 manifest 的 versionName 一模一样；**永远只有一个整包，不做逐版本递进** |
| 下载入口靠约定 | 前端只看 `/download/apk.json` 在不在；重装环境忘了跑 `apk/build.sh` 就不会出现入口 | 发版流程：先 `apk/build.sh`（顺带同步 web/download），再 `worker` 部署 |

---

## 8. 敏感信息（交接给外人时注意）

| 项 | 位置 | 处理 |
|---|---|---|
| Cloudflare 账户 ID | `tools/usage.py` 里硬编码 | 换人时改成环境变量 |
| wrangler 登录凭据 | `~/.config/.wrangler/config/default.toml`（**不在项目里**） | 不要打包 |
| APK 签名 keystore | `apk/df.keystore`，密码 `darkforest` | 要能覆盖升级就必须保留；公开仓库记得排除 |
| 自定义域名 | `darkforest.dpdns.org` 绑定在 Cloudflare 账号下 | 换账号需重新绑定 |

---

## 9. 给新 AI 的第一条消息（直接复制）

```text
这个仓库是一个《三体·黑暗森林》桌游的网页 + 安卓实现，已经做完并在线上跑着。

请先读这三个文件，不要急着改代码：
1. handoff/HANDOFF.md —— 交接说明（架构、命令、红线、已定规则）
2. handoff/对话-用户需求全记录.md —— 57 条原始需求，按时间顺序
3. 三体黑暗森林桌游-网页化设计与AI方案.md —— 完整设计文档，规则看第二章，踩坑看第六章

然后跑一遍 node server/test-server.js 确认 228 项通过，再开始干活。

三条红线：所有下发必须走 shared/view.js 的 viewFor；规则只在 shared/ 里改；
"等玩家决定"的挂起状态必须防重入、必须能在对局结束时清掉。

我的需求是：<在这里写你的新需求>
```

---

## 10. 交接包里有什么

```
HANDOFF.md                  本文件
对话-用户需求全记录.md        57 条需求原文，9 KB（必读）
对话-完整.md                 400 段完整往来，185 KB（需要复盘决策时再读）
三体黑暗森林桌游-网页化设计与AI方案.md   完整设计文档（1240 行）
README.md                   项目说明与运行方式
shared/ server/ worker/ web/ apk/ game/ tools/
黑暗森林-v1.0.16.apk        现成安装包（v1.5 也留着，用于回退对照）
desktop/dist/黑暗森林-1.0.16-win64-setup.exe  Windows 安装程序（105 MB，NSIS）
desktop/dist/黑暗森林-win64-v1.0.16.zip       Windows 免安装版（142 MB）

GitHub：https://github.com/tediandeguandian/darkforest-web
  · 代码已推 main 分支（144 个文件，不含 node_modules 与构建产物）
  · Release v1.0.14 附件（ASCII 名，避免中文名被 URL 截断）：
      dark-forest-1.0.14-win64-setup.exe   104 MB
      dark-forest-1.0.14-win64.zip         140 MB
      dark-forest-1.0.14.apk               642 KB
  · 发布脚本：tools/publish-github.sh <仓库名> <PAT> <说明文件>
  · CI：.github/workflows/build-windows.yml —— 每次打 tag 自动构建
      Tauri 安装包（约 1.5 MB）与 Electron 安装包（约 100 MB），并自动挂到对应 Release。
      踩过的坑：electron-builder 的 electronDist 那行是本机 macOS 沙箱专用，
      留在配置里会让 Windows runner 直接失败（已删）；图标改成提交进仓库的 desktop/assets/icon.ico，
      runner 上默认没有 Pillow，现场生成会失败。
```

未包含（体积原因）：`node_modules`、`backup/`（历史基线）、`三体黑暗森林卡牌图鉴/`（原始卡牌扫描图，47 MB）。
需要完整备份时用 `backup/dark-forest-baseline-*.tar.gz`。

---

> 一句话提醒：这个项目里真正难的不是写规则，是**"谁在什么时候知道什么"**。
> 任何一次"我觉得这个信息没必要藏"，最后都会变成某一方莫名其妙地赢。
