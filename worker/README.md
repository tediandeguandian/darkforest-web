# Cloudflare 部署指南

## 先说结论：对局状态用 Durable Object，不要用 KV

| 需求 | KV | Durable Object |
|---|---|---|
| 强一致（出牌后立刻看到） | ❌ 最终一致，写入到全局可见有延迟 | ✅ 单实例单线程，天然串行 |
| 并发写不丢 | ❌ 无事务，后写覆盖先写 | ✅ 天然排队 |
| WebSocket 长连接 | ❌ 无法保持 | ✅ 支持 Hibernation |
| 每房间独立状态 | ❌ 要靠 key 拼 | ✅ 一个房间一个实例 |
| 免费层可用 | ✅ | ✅（SQLite 后端） |

**KV 只做这些**：房间索引、玩家 token、战绩、配置。这些都是"读多写少、允许短暂不一致"的数据。

一句话：**KV 是缓存，DO 是房间。** 把对局塞进 KV，两个玩家同时响应广播就会丢操作。

---

## 架构

```
Worker（入口）
  ├─ GET /api/create     生成房号 → env.ROOMS.idFromName(roomId) 初始化
  ├─ GET /ws?room=ABC    转发到该房间的 DO
  └─ 其他                 env.ASSETS.fetch（web/ + shared/）

Durable Object「Room」（每房间一个，单线程）
  ├─ 席位表 + 重连 token
  ├─ 对局状态（快照存 ctx.storage）
  ├─ 所有 WebSocket（Hibernation API）
  └─ 按人裁剪的 state 推送

KV（可选）
  └─ room:{id} → { createdAt, players, started }
```

---

## 部署

```bash
cd worker
npm install

npx wrangler login      # 浏览器授权
npm run deploy
```

首次部署会自动创建 Durable Object 命名空间（见 `wrangler.toml` 的 `migrations`）。

部署成功后会输出地址，形如：

```
https://dark-forest.<你的子域>.workers.dev
```

### 本地开发

```bash
npm run dev
# → http://localhost:8787
```

`wrangler dev` 会在本地起 workerd，Durable Object 和 KV 都能模拟，不用联网。

### 加 KV（可选）

```bash
npx wrangler kv namespace create META
```

把输出的 `id` 填进 `wrangler.toml`，取消注释：

```toml
[[kv_namespaces]]
binding = "META"
id = "xxxxxxxx"
```

不加也能跑，代码里所有 KV 调用都有 `.catch(() => {})` 兜底。

---

## 免费额度（以官方文档为准）

| 项 | 免费层 |
|---|---|
| 请求 | 100,000 / 天 |
| 时长 | 13,000 GB-s / 天 |
| 存储 | 5 GB |
| SQLite 行读 | 5M / 天 |
| SQLite 行写 | 100K / 天 |

两个省钱要点：

1. **必须用 SQLite 后端**（`new_sqlite_classes`），KV 后端的 DO 只在付费计划可用。
2. **用 Hibernation**（`ctx.acceptWebSocket`），空闲时不计时长。代码里已经这么用了。

WebSocket 入站消息按 **20:1** 折算请求数，所以一局几百条消息几乎不占额度。

单房间软上限 1,000 请求/秒——这个游戏每秒几条消息，不可能碰到。

---

## 关键实现说明

### 1. 休眠后状态怎么恢复

DO 空闲会被回收，内存里的 `game` 对象消失。所以：

- 每次状态变更 → `ctx.storage.put('room', { seats, started, snap })`
- `snap` 是 `game.state()` 的纯 JSON 快照
- 唤醒后 `createGame().hydrate(snap)` 重建实例

`test-do.mjs` 专门测了这条：模拟休眠（丢弃内存、新建实例）后，回合数、手牌、席位全部还原。

### 2. WebSocket 身份怎么存

用 `ws.serializeAttachment({ playerId })`，它会随连接持久化，唤醒后可用 `deserializeAttachment()` 取回。这比在内存里维护 Map 更可靠——休眠后 Map 就没了。

### 3. 视图裁剪在哪里

`server/view.js` 的 `viewFor(game, playerId)`，Node 版和 Worker 版共用同一份。坐标、手牌、别人的选择都在这一个函数里被裁掉。**这是唯一的下发出口**，改这里就够了。

---

## 测试

```bash
npm test
```

会先组装静态资源、用 esbuild 打包，再用 Node 模拟 DO 环境跑 18 项断言：

- 握手、座位分配、token 下发
- 开局、视图裁剪（对手坐标/手牌为 null）
- 非房主不能开局、非当前玩家不能行动
- **休眠后状态恢复**
- 重连回到原席位
- 开局后禁止新人加入

---

## 已知限制

- 房间不会自动过期（`wrangler.toml` 里没有配 alarm）。长期运行需要在 DO 里加 `setAlarm` 清理，或用 KV 的 `expirationTtl` 配合定时任务。
- 广播响应没有超时自动弃权，有人挂机会卡住（Node 版同样）。
- 观战、回放、战绩统计未做。
- 免费层单账号 100 个 DO class（够用，一个 class 就够）。
