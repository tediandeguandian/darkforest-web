/* ============================================================
 * worker/test-users.mjs — 账号 DO（worker/src/auth.js）的测试
 *
 * 直接把 Durable Object 类当普通对象用：ctx.storage 换成内存 Map，
 * 发信走 MAIL_MODE=console（不会连网，验证码直接回给调用方）。
 * 这样不用起 wrangler dev 也能覆盖注册/登录/锁定/验证码/重置全流程。
 * ============================================================ */
import * as mod from './.test/bundle.mjs';
const { Users } = mod;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };

function makeCtx() {
  const map = new Map();
  return {
    _map: map,
    storage: {
      async get(k) { return map.has(k) ? map.get(k) : undefined; },
      async put(k, v) { map.set(k, v); },
      async delete(k) { map.delete(k); },
    },
  };
}

/* 每个实例一台"服务器"：同一 ctx 共享存储 */
function makeUsers(env) {
  return new Users(makeCtx(), env || { MAIL_MODE: 'console' });
}

async function call(users, op, body) {
  const res = await users.fetch(new Request('https://do/' + op, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  }));
  return res.json();
}

/* 让控制台别被验证码日志刷屏：整个过程只保留错误输出 */
const origLog = console.log;
const quiet = () => { console.log = () => {}; };
const loud = () => { console.log = origLog; };

console.log('=== 1. 注册：校验、重名、自动登录 ===');
{
  const U = makeUsers();
  let r = await call(U, 'register', { username: 'a', password: 'abcd1234' });
  ok(!!r.error && /2–12/.test(r.error), '用户名太短应被拒，实际 ' + JSON.stringify(r));

  r = await call(U, 'register', { username: '宇航员', password: '12345678' });
  ok(!!r.error && /字母和数字/.test(r.error), '纯数字密码应被拒');

  r = await call(U, 'register', { username: '宇航员', password: 'abcd1234' });
  ok(!r.error && !!r.token && r.user.username === '宇航员', '正常注册应返回 token，实际 ' + JSON.stringify(r));
  ok(r.user.email === '' && r.user.emailOk === false, '没填邮箱时邮箱应为空');

  const r2 = await call(U, 'register', { username: '宇航员', password: 'abcd1234' });
  ok(!!r2.error && /被用了/.test(r2.error), '重名应被拒');

  /* 大小写与前后空格都算同一个用户名：不做归一化的话，
     "Shuwang" 和 "shuwang" 会变成两个账号，登录时谁都可能登错 */
  const r3 = await call(U, 'register', { username: ' shuwang ', password: 'abcd1234' });
  ok(!r3.error, '带空格的新名字应能注册');
  const r4 = await call(U, 'register', { username: 'SHUWANG', password: 'abcd1234' });
  ok(!!r4.error && /被用了/.test(r4.error), '大小写不同也算重名');

  const r5 = await call(U, 'register', { username: '带空格 的', password: 'abcd1234' });
  ok(!!r5.error, '名字里带空格应被拒');
}

console.log('=== 2. 登录：密码错、用户不存在、连续失败锁定 ===');
{
  const U = makeUsers();
  await call(U, 'register', { username: '张三', password: 'abcd1234' });

  let r = await call(U, 'login', { username: '张三', password: 'abcd1234' });
  ok(!r.error && !!r.token, '密码对应登录成功');

  r = await call(U, 'login', { username: '张三', password: 'wrong1234' });
  ok(!!r.error && /用户名或密码不对/.test(r.error), '密码错应给统一文案（不透露是账号还是密码错）');

  r = await call(U, 'login', { username: '不存在的人', password: 'abcd1234' });
  ok(!!r.error && /用户名或密码不对/.test(r.error), '用户不存在也给同样的文案');

  /* 连错 5 次 → 锁 10 分钟 */
  for (let i = 0; i < 5; i++) await call(U, 'login', { username: '张三', password: 'bad12345' });
  r = await call(U, 'login', { username: '张三', password: 'abcd1234' });
  ok(!!r.error && /分钟后再试/.test(r.error), '连续失败应锁定，实际 ' + JSON.stringify(r));
}

console.log('=== 3. 会话：校验、登出、过期 ===');
{
  const U = makeUsers();
  const reg = await call(U, 'register', { username: '李四', password: 'abcd1234' });

  let r = await call(U, 'session', { token: reg.token });
  ok(r.ok === true && r.user.username === '李四', '有效 token 应能换回用户');

  r = await call(U, 'session', { token: 'nope' });
  ok(r.ok === false, '无效 token 应返回 ok:false');

  await call(U, 'logout', { token: reg.token });
  r = await call(U, 'session', { token: reg.token });
  ok(r.ok === false, '登出后 token 应立即失效');

  /* 过期：直接把会话时间改到过去 */
  const reg2 = await call(U, 'register', { username: '王五', password: 'abcd1234' });
  const key = 'sess:' + reg2.token;
  const rec = U.ctx.storage && null;   // 占位，真正取存储走下面的 hack
  const stored = await U.ctx.storage.get(key);
  ok(!!stored && stored.exp > Date.now(), '会话应带过期时间');
  stored.exp = Date.now() - 1;
  await U.ctx.storage.put(key, stored);
  r = await call(U, 'session', { token: reg2.token });
  ok(r.ok === false, '过期 token 应失效');
}

console.log('=== 4. 绑定邮箱：发码、错码、正确码 ===');
{
  const U = makeUsers();
  quiet();
  const reg = await call(U, 'register', { username: '赵六', password: 'abcd1234' });
  loud();

  let r = await call(U, 'code', { token: reg.token, email: 'zhao@example.com', purpose: 'bind' });
  ok(!r.error && /^\d{6}$/.test(r.devCode || ''), 'console 模式应把验证码回传，实际 ' + JSON.stringify(r));
  const code = r.devCode;

  r = await call(U, 'bind', { token: reg.token, email: 'zhao@example.com', code: '000000' });
  ok(!!r.error && /验证码不对/.test(r.error), '错码应被拒');

  r = await call(U, 'bind', { token: reg.token, email: 'zhao@example.com', code });
  ok(!r.error && r.user.emailOk === true && r.user.email === 'zhao@example.com',
    '正确码应绑定成功，实际 ' + JSON.stringify(r));

  /* 同一个邮箱不能绑到第二个账号 */
  const reg2 = await call(U, 'register', { username: '钱七', password: 'abcd1234' });
  quiet();
  const c2 = await call(U, 'code', { token: reg2.token, email: 'zhao@example.com', purpose: 'bind' });
  loud();
  ok(!c2.error || /别点太快|已经绑/.test(c2.error), '重复发码应被限流而不是崩掉');

  r = await call(U, 'bind', { token: reg2.token, email: 'zhao@example.com', code: c2.devCode || '123456' });
  ok(!!r.error && /别的账号/.test(r.error), '已被占用的邮箱应被拒，实际 ' + JSON.stringify(r));
}

console.log('=== 5. 重置密码：凭邮箱验证码，成功后踢掉旧会话 ===');
{
  const U = makeUsers();
  quiet();
  const reg = await call(U, 'register', { username: '孙八', password: 'abcd1234', email: 'sun@example.com' });
  loud();
  /* 注册时带的邮箱只发码、不自动验证 */
  ok(reg.user.email === 'sun@example.com' && reg.user.emailOk === false, '注册带邮箱应是待验证状态');

  const bind = await call(U, 'bind', { token: reg.token, email: 'sun@example.com', code: reg.devCode });
  ok(!bind.error && bind.user.emailOk === true, '应能完成绑定');

  /* 刚绑定发过码，60 秒冷却还在；测试里直接清掉，不然要真等一分钟 */
  await U.ctx.storage.delete('cool:sun@example.com');
  quiet();
  const c = await call(U, 'code', { email: 'sun@example.com', purpose: 'reset' });
  loud();
  ok(!c.error && !!c.devCode, '重置密码应能发码，实际 ' + JSON.stringify(c));

  let r = await call(U, 'reset', { email: 'sun@example.com', code: c.devCode, password: 'weak' });
  ok(!!r.error && /至少 8 位/.test(r.error), '新密码太弱应被拒');

  r = await call(U, 'reset', { email: 'sun@example.com', code: c.devCode, password: 'newpass123' });
  ok(!r.error && !!r.token, '重置应成功并返回新 token，实际 ' + JSON.stringify(r));

  const old = await call(U, 'session', { token: reg.token });
  ok(old.ok === false, '重置密码后旧会话必须失效');

  const login = await call(U, 'login', { username: '孙八', password: 'newpass123' });
  ok(!login.error, '应能用新密码登录');

  /* 没绑过邮箱的地址：不泄漏"这个邮箱有没有账号" */
  quiet();
  const ghost = await call(U, 'code', { email: 'nobody@example.com', purpose: 'reset' });
  loud();
  ok(!ghost.error && !ghost.devCode, '未注册邮箱应静默返回，不泄漏账号存在性');
}

console.log('=== 6. 改密码：验原密码，保留当前会话、踢掉其它 ===');
{
  const U = makeUsers();
  const a = await call(U, 'register', { username: '周九', password: 'abcd1234' });
  const b = await call(U, 'login', { username: '周九', password: 'abcd1234' });

  let r = await call(U, 'password', { token: a.token, old: 'nope1234', next: 'newpass123' });
  ok(!!r.error && /原密码/.test(r.error), '原密码错应被拒');

  r = await call(U, 'password', { token: a.token, old: 'abcd1234', next: 'newpass123' });
  ok(!r.error, '改密码应成功，实际 ' + JSON.stringify(r));

  const still = await call(U, 'session', { token: a.token });
  ok(still.ok === true, '改密码的那条会话应保留');
  const kicked = await call(U, 'session', { token: b.token });
  ok(kicked.ok === false, '其它设备的会话应被踢掉');
}

console.log('=== 7. 发码限流：60 秒冷却 ===');
{
  const U = makeUsers();
  quiet();
  const reg = await call(U, 'register', { username: '吴十', password: 'abcd1234' });
  const first = await call(U, 'code', { token: reg.token, email: 'wu@example.com', purpose: 'bind' });
  ok(!first.error, '第一次发码应成功');
  const second = await call(U, 'code', { token: reg.token, email: 'wu@example.com', purpose: 'bind' });
  loud();
  ok(!!second.error && /秒后再试/.test(second.error), '紧接着再发应被冷却拦下，实际 ' + JSON.stringify(second));
}

/* ============================================================
 * 8. 密码哈希本身的格式（跨端一致性）
 * 本地 Node 版 server/auth.js 用的是一模一样的字符串格式，
 * 两边共用一个 users.json 才能互相校验。格式一旦漂了这里会先红。
 * ============================================================ */
console.log('=== 8. 密码哈希格式 ===');
{
  const U = makeUsers();
  await call(U, 'register', { username: '哈希', password: 'abcd1234' });
  const u = await U.ctx.storage.get('user:哈希');
  ok(!!u && /^pbkdf2\$60000\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/.test(u.ph),
    '哈希应是 pbkdf2$迭代数$salt$hash（标准 Base64），实际 ' + (u && u.ph && u.ph.slice(0, 40)));
  ok(!!u && u.ph.indexOf('abcd1234') < 0, '明文密码不能出现在存储里');
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
