/* ============================================================
 * server/auth.js — 本地 Node 版的账号服务
 *
 * 接口与 Cloudflare 那边的 Users Durable Object 完全一致，
 * 前端不用区分自己连的是哪一边：
 *   POST /api/auth/register|login|logout|code|bind|reset|password
 *   GET  /api/auth/me
 *
 * 存储：server/data/users.json（已 gitignore）。没上数据库是因为
 * 这个服务只在开发机 / 局域网里跑，单进程单文件足够；
 * 线上那份在 Worker 里，用 Durable Object 的 storage。
 *
 * ⚠️ 密码哈希的存储格式必须与 worker/src/auth.js 一致
 *    （pbkdf2$迭代数$salt$hash，标准 Base64），
 *    这样同一个 users.json 在两边都能校验通过。
 * ============================================================ */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ITER = 60000;
const SESSION_TTL = 30 * 24 * 3600 * 1000;
const CODE_TTL = 10 * 60 * 1000;
const CODE_COOL = 60 * 1000;
const CODE_PER_HOUR = 5;
const MAX_FAIL = 5;
const LOCK_MS = 10 * 60 * 1000;

/* 测试会把它指到临时文件，免得把开发机上真实的账号库写脏 */
const FILE = process.env.DF_USERS_FILE || path.join(__dirname, 'data', 'users.json');
const EMPTY = () => ({ users: {}, sess: {}, code: {}, cool: {}, hour: {}, mail: {} });

let db = (() => {
  try { return Object.assign(EMPTY(), JSON.parse(fs.readFileSync(FILE, 'utf8'))); }
  catch (e) { return EMPTY(); }
})();

let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  // 攒一下再写：注册/登录会在几十毫秒内连着改好几个 key
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      fs.writeFileSync(FILE, JSON.stringify(db, null, 1));
    } catch (e) { console.error('[auth] 落盘失败', e.message); }
  }, 120);
  saveTimer.unref?.();
}

/* ---------- 哈希与校验（格式与 Worker 版逐字节一致） ---------- */
function pbkdf2(password, salt, iterations) {
  return crypto.pbkdf2Sync(String(password), salt, iterations, 32, 'sha256');
}
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = pbkdf2(password, salt, ITER);
  return `pbkdf2$${ITER}$${salt.toString('base64')}$${hash.toString('base64')}`;
}
function checkPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iter = Number(parts[1]);
  if (!iter || iter > 1e6) return false;
  const hash = pbkdf2(password, Buffer.from(parts[2], 'base64'), iter);
  const want = Buffer.from(parts[3], 'base64');
  if (hash.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash[i] ^ want[i];
  return diff === 0;
}

const newToken = () => crypto.randomBytes(24).toString('hex');
const newCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
const normName = s => String(s || '').trim();
const normMail = s => String(s || '').trim().toLowerCase();

const NAME_RE = /^[\u4e00-\u9fa5A-Za-z0-9_]{2,12}$/;
const MAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function validName(s) { return NAME_RE.test(s) ? '' : '用户名 2–12 位，只能用中文、字母、数字、下划线'; }
function validPassword(s) {
  const p = String(s || '');
  if (p.length < 8) return '密码至少 8 位';
  if (p.length > 64) return '密码最多 64 位';
  if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) return '密码要同时包含字母和数字';
  return '';
}
function validMail(s) {
  if (s.length > 100) return '邮箱太长';
  if (!MAIL_RE.test(s)) return '邮箱格式不对';
  return '';
}

const pub = u => ({ username: u.u, email: u.email || '', emailOk: !!u.emailOk, createdAt: u.createdAt || 0 });

/* ---------- 会话 ---------- */
function openSession(key) {
  const token = newToken();
  db.sess[token] = { u: key, exp: Date.now() + SESSION_TTL };
  const set = db.sess['set:' + key] || [];
  set.push(token);
  while (set.length > 20) delete db.sess[set.shift()];
  db.sess['set:' + key] = set;
  persist();
  return token;
}
function sessionOf(token) {
  if (!token) return null;
  const s = db.sess[token];
  if (!s) return null;
  if (s.exp < Date.now()) { delete db.sess[token]; persist(); return null; }
  return s;
}
function kickSessions(key, keep) {
  const set = db.sess['set:' + key] || [];
  db.sess['set:' + key] = set.filter(t => {
    if (t === keep) return true;
    delete db.sess[t];
    return false;
  });
  persist();
}

/* ---------- 发信：本地固定 console 模式 ----------
   开发机不一定能连外网 SMTP，而且把验证码直接回给前端更好调试。
   真发信那套在 worker/src/mail.js 里。 */
function sendMail(to, subject, text) {
  const m = /(\d{6})/.exec(subject);
  console.log(`\n[auth:mail] → ${to}\n   ${subject.replace(/\n/g, '\n   ')}\n`);
  return { ok: true, devCode: m ? m[1] : undefined };
}

/* ---------- 业务 ---------- */
function register(b) {
  const name = normName(b.username);
  const pwd = String(b.password || '');
  const mail = normMail(b.email);

  let err = validName(name);
  if (err) return { error: err };
  err = validPassword(pwd);
  if (err) return { error: err };
  if (mail && (err = validMail(mail))) return { error: err };

  const key = name.toLowerCase();
  if (db.users[key]) return { error: '这个用户名已经被用了' };

  const u = {
    u: name, ph: hashPassword(pwd), email: '', emailOk: false,
    createdAt: Date.now(), lastLoginAt: Date.now(), fail: 0, lockUntil: 0,
  };
  db.users[key] = u;
  const token = openSession(key);
  const out = { token, user: pub(u) };

  if (mail) {
    u.email = mail;
    const r = trySendCode(mail, 'bind');
    out.user = pub(u);
    out.codeSent = !!r.ok;
    if (!r.ok) out.mailError = r.error;
    if (r.devCode) out.devCode = r.devCode;
  }
  persist();
  return out;
}

function login(b) {
  const name = normName(b.username);
  const pwd = String(b.password || '');
  if (!name || !pwd) return { error: '请填写用户名和密码' };

  const u = db.users[name.toLowerCase()];
  if (!u) {
    pbkdf2(pwd, Buffer.alloc(16), 1000);   // 不存在也走一遍，别用响应时间探测账号
    return { error: '用户名或密码不对' };
  }
  if (u.lockUntil && u.lockUntil > Date.now()) {
    return { error: `密码错太多次，${Math.ceil((u.lockUntil - Date.now()) / 60000)} 分钟后再试` };
  }
  if (!checkPassword(pwd, u.ph)) {
    u.fail = (u.fail || 0) + 1;
    if (u.fail >= MAX_FAIL) { u.lockUntil = Date.now() + LOCK_MS; u.fail = 0; }
    persist();
    return { error: '用户名或密码不对' };
  }
  u.fail = 0; u.lockUntil = 0; u.lastLoginAt = Date.now();
  const token = openSession(u.u.toLowerCase());
  persist();
  return { token, user: pub(u) };
}

function logout(b) {
  if (b.token && db.sess[b.token]) {
    const key = db.sess[b.token].u;
    delete db.sess[b.token];
    const set = db.sess['set:' + key] || [];
    db.sess['set:' + key] = set.filter(t => t !== b.token);
    persist();
  }
  return { ok: true };
}

function session(b) {
  const s = sessionOf(b.token);
  if (!s) return { ok: false };
  const u = db.users[s.u];
  if (!u) return { ok: false };
  return { ok: true, user: pub(u) };
}

function findByEmail(mail) {
  const key = db.mail[normMail(mail)];
  return key ? db.users[key] : null;
}

function trySendCode(mail, purpose) {
  const now = Date.now();
  if (db.cool[mail] && db.cool[mail] > now) {
    return { ok: false, error: `别点太快，${Math.ceil((db.cool[mail] - now) / 1000)} 秒后再试` };
  }
  const hour = db.hour[mail] || { n: 0, start: now };
  if (now - hour.start > 3600 * 1000) { hour.n = 0; hour.start = now; }
  if (hour.n >= CODE_PER_HOUR) return { ok: false, error: '这个邮箱今天发得太频繁了，过一会儿再试' };

  const code = newCode();
  db.code[mail] = { c: code, exp: now + CODE_TTL, tries: 0, purpose };
  db.cool[mail] = now + CODE_COOL;
  db.hour[mail] = { n: hour.n + 1, start: hour.start };
  persist();

  const title = purpose === 'reset' ? '重置密码' : '绑定邮箱';
  const r = sendMail(mail, `【黑暗森林】${title}验证码 ${code}`,
    `你的验证码是 ${code}，10 分钟内有效。`);
  if (!r.ok) {
    delete db.code[mail];
    persist();
    return { ok: false, error: '验证码发送失败，请稍后再试' };
  }
  return { ok: true, devCode: r.devCode };
}

function consumeCode(mail, code, purpose) {
  const rec = db.code[mail];
  if (!rec) return { error: '验证码无效或已过期' };
  if (rec.exp < Date.now()) { delete db.code[mail]; persist(); return { error: '验证码已过期，请重新获取' }; }
  if (rec.purpose !== purpose) return { error: '验证码用途不符，请重新获取' };
  if (rec.tries >= 5) { delete db.code[mail]; persist(); return { error: '错误次数太多，请重新获取验证码' }; }
  if (String(code || '').trim() !== rec.c) {
    rec.tries = (rec.tries || 0) + 1;
    persist();
    return { error: '验证码不对' };
  }
  delete db.code[mail];
  persist();
  return { ok: true };
}

function sendCodeApi(b) {
  const mail = normMail(b.email);
  const purpose = b.purpose === 'reset' ? 'reset' : 'bind';
  const err = validMail(mail);
  if (err) return { error: err };

  if (purpose === 'bind') {
    const s = sessionOf(b.token);
    if (!s) return { error: '登录状态已失效，请重新登录' };
    const me = db.users[s.u];
    if (me && me.emailOk && normMail(me.email) === mail) return { error: '这个邮箱已经绑在当前账号上了' };
  } else if (!findByEmail(mail)) {
    // 重置密码：邮箱没绑定过就不发，但对外仍回 ok，别让人拿这里探测账号
    return { ok: true, silent: true };
  }

  const r = trySendCode(mail, purpose);
  if (!r.ok) return { error: r.error };
  return { ok: true, devCode: r.devCode };
}

function bind(b) {
  const s = sessionOf(b.token);
  if (!s) return { error: '登录状态已失效，请重新登录' };
  const mail = normMail(b.email);
  const err = validMail(mail);
  if (err) return { error: err };

  const owned = db.mail[mail];
  if (owned && owned !== s.u) return { error: '这个邮箱已经绑在别的账号上了' };

  const c = consumeCode(mail, b.code, 'bind');
  if (c.error) return { error: c.error };

  const u = db.users[s.u];
  if (!u) return { error: '账号不存在' };
  if (u.email && normMail(u.email) !== mail) delete db.mail[normMail(u.email)];
  u.email = mail;
  u.emailOk = true;
  db.mail[mail] = s.u;
  persist();
  return { ok: true, user: pub(u) };
}

function reset(b) {
  const mail = normMail(b.email);
  const pwd = String(b.password || '');
  const err = validPassword(pwd);
  if (err) return { error: err };

  const c = consumeCode(mail, b.code, 'reset');
  if (c.error) return { error: c.error };

  const u = findByEmail(mail);
  if (!u) return { error: '这个邮箱没有绑定账号' };

  u.ph = hashPassword(pwd);
  u.fail = 0;
  u.lockUntil = 0;
  const key = u.u.toLowerCase();
  kickSessions(key);
  const token = openSession(key);
  persist();
  return { ok: true, token, user: pub(u) };
}

function changePassword(b) {
  const s = sessionOf(b.token);
  if (!s) return { error: '登录状态已失效，请重新登录' };
  const u = db.users[s.u];
  if (!u) return { error: '账号不存在' };
  if (!checkPassword(String(b.old || ''), u.ph)) return { error: '原密码不对' };
  const err = validPassword(b.next);
  if (err) return { error: err };

  u.ph = hashPassword(String(b.next));
  kickSessions(s.u, b.token);
  persist();
  return { ok: true };
}

const OPS = {
  register, login, logout, session,
  code: sendCodeApi, bind, reset, password: changePassword,
};

/** 处理一个 /api/auth/* 请求；返回 [status, body] */
function handle(op, body) {
  const fn = OPS[op];
  if (!fn) return [404, { error: '未知操作' }];
  try {
    const out = fn(body || {});
    const expired = out && /登录状态已失效|未登录/.test(out.error || '');
    return [expired ? 401 : 200, out];
  } catch (e) {
    console.error('[auth]', op, e && e.stack || e);
    return [500, { error: '服务器开小差了，请稍后再试' }];
  }
}

module.exports = { handle, session, validName, validPassword, validMail, FILE };
