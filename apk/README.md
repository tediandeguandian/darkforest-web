# APK：离线 / 局域网 / 在线三合一

## 这是什么

一个把整份游戏塞进手机的 Android 应用（约 640 KB，其中约 180 KB 是图标、约 370 KB 是两张背景），三种玩法：

- **完全离线**：规则引擎、可见性过滤、四档人机全部在 WebView 里跑，飞行模式下也能玩
- **局域网联机**：手机自己当主机，开一个 HTTP 服务，同一 Wi-Fi 下其他人用**浏览器**打开 `http://手机IP:8080` 就能加入，不需要公网、不需要云服务器
- **在线联机**：连到 `darkforest.dpdns.org` 的服务器，和用网页版的朋友进同一个房间——安卓用户和浏览器用户可以在同一局里对打

## 怎么装

把 `黑暗森林-v1.0.14.apk` 传到手机，点击安装（需要允许"安装未知来源应用"）。

版本 1.0.14（versionCode 20）：更新弹窗按版本分组展示改动，跨版本时一次列出所跨各版本，装的是最新整包。

1.0.12（versionCode 19）：更新弹窗里列出「本次更新」清单（来自 `release-notes.json`）。

1.0.11（versionCode 18）：对局顶栏也加了设置齿轮，游戏里调毛玻璃当场生效；浓度区间放宽到 0.40–0.95，牌桌上的变化才看得出来。

1.0.10（versionCode 17）：点「新版本」先弹应用内对话框（显示版本号与体积，可选立即更新 / 稍后再说）；退出对局也改用内置弹窗，全站不再出现浏览器原生 confirm。

1.0.9（versionCode 16）：面板改成毛玻璃，入口页右上角齿轮里可以改名字、开关毛玻璃、调浓度（存本机）。

1.0.8（versionCode 15）：顶栏的记牌器去掉，只保留「牌库还剩几张」。

1.0.7（versionCode 14）：对局中点击对手座位卡可弹出详情（名字 / 能量 / 手牌数 / 建设区每张牌的完整说明）。

1.0.6（versionCode 13）：对局开始后背景换成银河星空（入口 / 大厅仍是雾林）。

1.0.5（versionCode 12）：更新改成**应用内下载 + 直接唤起安装器**（原来跳系统浏览器）。

1.0.4（versionCode 11）：修好背景图不显示（样式表里第二条 `body` 规则把它盖掉了）。

1.0.3（versionCode 10）：修好更新检测——APK 里页面是 `file://`，请求要走绝对地址（`DF_SERVER`），服务端静态资源也补了 CORS 头。

1.0.2（versionCode 9）：背景换成雾中松林实拍（Pexels，来源见 `../web/img/CREDIT.md`）。

1.0.1（versionCode 8）：主页改版（对局设置收进右上角齿轮、加对手改成折叠），
同一个 Wi-Fi 可以随时**关闭房间**，启动时会跟线上版本号比对、有新版本在右上角点一个小圆点。签名与旧版相同，可直接覆盖升级。

最低 Android 7.0（API 24）。

## 怎么玩

### 单机 / 热座

打开 App → 输入名字 → **开始新对局** → 在右侧加人机（脱水者 / 乱纪元 / 恒纪元 / 智子，可加多个）→ 开始。

一个人加几个人机就是标准单机对局；把手机传着玩就是热座。

### 在线联机（和网页玩家同一个房间）

1. 入口页点 **在线联机（服务器房间）**
2. **创建房间** → 拿到 5 位房号，发给朋友
3. 朋友用浏览器打开 `https://darkforest.dpdns.org`，输入房号加入；也可以反过来，你加入他们建的房
4. 房主加人机、点开始

对局状态在服务器的 Durable Object 上，手机只是客户端——所以手机和网页看到的是同一局，坐标依旧只发给自己。

返回入口点左上角的 **← 离线模式** 即可切回本机人机。

### 局域网联机

1. 手机 A 打开 App，在入口点 **开启局域网**，界面上会显示形如 `http://192.168.1.7:8080` 的地址
2. 其他人连**同一个 Wi-Fi**，用手机或电脑浏览器打开这个地址
3. 输入名字 → 加入 → 出现在 A 的大厅里
4. A 加人机、点开始，所有人同时进入对局

最多 9 席（真人 + 人机合计）。

> 如果打不开：确认两台设备在同一 Wi-Fi、路由器没开"AP 隔离"、手机防火墙没拦 8080 端口。

## 架构：为什么规则只有一份

```
┌───────────────────────────────┐
│ 手机 A（主机）                  │
│  WebView 跑完整引擎 createGame  │  ← 唯一权威
│        ↕ 轮询                   │
│  LanServer（HTTP 中继 + 静态）  │  ← 只当信箱，不算规则
└──────────┬────────────────────┘
           │ Wi-Fi
   ┌───────┴────────┐
   │ 浏览器 B / C …  │  只发意图、只收自己那份视图
   └────────────────┘
```

- 每个远端玩家收到的是 `viewFor(game, 他的playerId)`，**别人坐标永远是 null**
- 中继只做消息转发（`/api/push`、`/api/pull`），不做任何判定
- 用 HTTP 短轮询（600–800ms）而不是 WebSocket：实现简单、穿 NAT 无压力，局域网延迟可忽略

## 图标

一个打击准星环里装着**三颗橙色太阳**（三日凌空）和一线深色松林：
三颗太阳＝三体问题 / 三体世界，准星＝黑暗森林打击（"清理"），松林＝黑暗森林本尊。
三层意思叠在一个符号里，缩到 48 px 时是「一个环 + 三个橙点 + 一片暗绿」，仍认得出。

- 母版：`icon/icon-512.png`（512×512，无透明）
- AI 原图：`icon/source-ai-1024.png`（右下角带模型水印，落地前已裁掉）
- 蒙版预览：`icon/mask-preview.png`（圆形 / 圆角方 / 自适应 72 dp 三视图）
- 提示词与重生成步骤：`icon/PROMPT.md`

换图标只需要换母版，然后：

```bash
python3 tools/icons.py icon/icon-512.png --fg-scale 0.84   # 5 档 mipmap + 自适应前景 + 背景色
cd .. && ./build.sh                              # 重新打包
```

`tools/icons.py` 需要 Pillow（`pip install pillow`），它同时写出 `res/values/colors.xml` 里的
`ic_launcher_background`，配色改了会自动跟上。
`--fg-scale 0.84` 是给自适应图标的：启动器只显示 108dp 的中间 72dp，母版徽标占 79%，乘 0.84 正好落进安全区。

## 自己构建

需要 JDK（8 以上）和 Android SDK（`platforms;android-34` + build-tools）。脚本会自己找 SDK：
`$ANDROID_HOME` → `~/Library/Android/sdk`（macOS 默认）→ `/root/android-sdk`（构建容器）。

```bash
cd apk
./build.sh
# → build/dark-forest.apk
# → ../黑暗森林-v<版本>.apk（给人传的）
# → ../web/download/dark-forest.apk + apk.json（网页「下载安卓版」入口读这两个）
```

脚本是纯命令行链路：`aapt2 compile → aapt2 link → javac → d8 → zipalign → apksigner`，不依赖 Gradle。

> **坑：build-tools 34 的 `d8` 编译不了这个工程。** 它自带的 R8 8.2 遇到 `MainActivity$1`（含 lambda 的匿名类）会抛
> `NullPointerException: Cannot invoke "String.length()" because "<parameter1>" is null`，dex 阶段直接失败。
> build-tools 35 的 d8（R8 8.6）正常，所以 `build.sh` 会按版本从高到低挑第一个四件齐全的 build-tools，
> 不要把它改回写死 `34.0.0`。

## 文件结构

```
apk/
├── AndroidManifest.xml
├── build.sh                  构建脚本
├── res/values/strings.xml
├── src/com/shuwang/darkforest/
│   ├── MainActivity.java     WebView 外壳 + JS 桥
│   └── LanServer.java        极简 HTTP 服务（静态 + 消息中继）
└── build/dark-forest.apk     产物
```

网页代码不在这里复制一份，构建时从 `../web` 与 `../shared` 取，保证和线上版永远同源
（连 `web/img/*.jpg` 一起打进 `assets/www/img/`，否则离线版会是纯色底）。

## 已知限制

- 主机退出对局就散了（没有断线重连）
- 局域网模式下没有"观战"：开局后加入会被拒绝
- 没有存档；退出即丢
- APK 用的是自签名证书，不同版本之间覆盖安装需要同证书（`apk/df.keystore`，请保留）
- 在线联机断线后会自动重连（同一个 token 回到原席位）；但房主退了房间还在，只是没人推进
- 在线模式的服务器地址写死在 `build.sh` 注入的 `DF_SERVER` 里，换服务器要改那一行
