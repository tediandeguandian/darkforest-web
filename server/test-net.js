/* ============================================================
 * server/test-net.js — WebSocket 客户端连接语义测试
 *
 * 为什么需要它：`close` 事件既可能是"真掉线"，也可能是"我们自己关的"。
 * 判错的后果不是报错，而是界面上的假象——从这里点「返回」回到主页，
 * 顶上会挂一条"连接已断开，正在重连…"永远不消失（因为已经不在房间里，
 * 不会再建立连接，也就等不到 open 去关它）。
 *
 * 这里用假的 WebSocket 跑真实的 web/js/net.js，断言：
 *   1. 主动离开不触发 close / 不自动重连
 *   2. 换连接时旧 socket 迟到的 close 被忽略
 *   3. 真掉线仍然触发 close 并重连
 *
 * 运行：node server/test-net.js
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch {
  console.log('跳过网络层测试：未安装 jsdom（cd server && npm i jsdom）');
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };

const dom = new JSDOM('<!doctype html><html><body><div id="conn"></div></body></html>',
  { url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'outside-only' });
const w = dom.window;

/* 假 socket：不自动派发事件，全部由测试手动触发，好复现"回调迟到" */
const socks = [];
class FakeWS {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    this.closedByApp = false;
    socks.push(this);
  }
  send(s) { this.sent.push(s); }
  close() { this.closedByApp = true; if (this.readyState !== 3) this.readyState = 3; }
  _open() { this.readyState = 1; this.onopen && this.onopen(); }
  _msg(o) { this.onmessage && this.onmessage({ data: JSON.stringify(o) }); }
  _drop() { this.readyState = 3; this.onclose && this.onclose(); }   // 服务端断开 / 迟到回调
}
w.WebSocket = FakeWS;

w.eval(fs.readFileSync(path.join(ROOT, 'web/js/net.js'), 'utf8') + '\nwindow.__Net = Net;');
const Net = w.__Net;

const events = [];
Net.on((t, p) => events.push(t));
const last = () => events[events.length - 1];
const count = t => events.filter(x => x === t).length;

console.log('=== NET 1. 进房 → 连接建立 ===');
Net.joinRoom('ABCD', 'A');
ok(socks.length === 1, '应新建 1 条连接');
const s1 = socks[0];
s1._open();
s1._msg({ t: 'joined', playerId: 'p0', roomId: 'ABCD', token: 'tk' });
ok(Net.connected === true, '连接应标记为已连接');
ok(Net.roomId === 'ABCD', '应记住房间号');
ok(events.includes('open'), '应派发 open（用来收掉提示条）');

console.log('=== NET 2. 主动离开：不算断线 ===');
events.length = 0;
Net.leave();
ok(Net.roomId === null, '离开后 roomId 应清空');
ok(Net.connected === false, '离开后应标记未连接');
ok(events.length === 0, '离开不应派发 close（否则提示条亮起且无人关闭）');
ok(s1.sent.some(x => x.indexOf('"leave"') >= 0), '离开前应尽力通知服务器');

// 浏览器里 close() 的 onclose 是异步到达的，且此时对象引用已经换掉
const before = socks.length;
s1._drop();
ok(!events.includes('close'), '迟到的 close 不该被当成掉线');
ok(socks.length === before, '离开后不该自动重连');

console.log('=== NET 3. 离开后发消息：不该弹「正在重连」 ===');
events.length = 0;
ok(Net.send({ t: 'x' }) === false, '没有连接时 send 应返回 false');
ok(!events.includes('error'), '已离开房间时 send 不该报"连接已断开，正在重连…"');

console.log('=== NET 4. 换房间：旧连接迟到的事件必须无视 ===');
events.length = 0;
Net.joinRoom('EFGH', 'A');
const s2 = socks[socks.length - 1];
ok(s2 !== s1, '应换一条全新的连接');
s2._open();
events.length = 0;
s1._msg({ t: 'lobby', room: { seats: [] } });   // 旧连接的消息迟到
s1._drop();
ok(!events.includes('lobby'), '旧连接的消息不该再影响界面');
ok(!events.includes('close'), '旧连接关闭不该算掉线');
ok(Net.roomId === 'EFGH', '当前房间应保持为新房间');

console.log('=== NET 5. 真掉线：仍要提示 + 自动重连 ===');
events.length = 0;
s2._drop();
ok(events.includes('close'), '服务器断开应派发 close（提示条要亮）');
ok(Net.connected === false, '掉线后应标记未连接');

(async () => {
  const before = socks.length;
  await new Promise(r => setTimeout(r, 900));   // 首次退避 500*1.6 ≈ 800ms
  ok(socks.length === before + 1, '掉线后应自动重连出一条新连接');
  const s3 = socks[socks.length - 1];
  s3._open();
  ok(events.includes('open'), '重连成功应派发 open（提示条要收）');
  ok(Net.connected === true, '重连后应恢复已连接状态');

  console.log('=== NET 6. 观战：不发 token，也不写会话 ===');
  events.length = 0;
  Net.leave();
  Net.watch('abcd');
  const s6 = socks[socks.length - 1];
  s6._open();
  const hello6 = JSON.parse(s6.sent[0] || '{}');
  ok(hello6.t === 'hello' && hello6.spectate === true, '观战握手应带 spectate 标记');
  ok(!hello6.token, '观战握手不该带 token（否则会顶掉原玩家的席位）');

  events.length = 0;
  s6._msg({ t: 'joined', roomId: 'ABCD', spectator: true });
  ok(Net.spectating === true, '应标记为观战中');
  ok(Net.me === null, '观战者没有 me');
  ok(w.localStorage.getItem('df_room') === null, '观战不该写 df_room（刷新即退出，不该自动回到观战）');

  s6._msg({ t: 'state', view: { spectator: true, me: null, players: [] } });
  ok(Net.view && Net.view.spectator === true, '应收到观战视图');

  events.length = 0;
  Net.leave();
  ok(Net.spectating === false, '离开观战应清掉标记');
  ok(Net.view === null && Net.roomId === null, '离开后状态应清空');

  console.log(`\n结果：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})();
