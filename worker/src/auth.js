/* ============================================================
 * worker/src/auth.js — 账号体系（Durable Object「Users」）
 *
 * 一个单实例 DO 存所有账号：idFromName('global')。
 * 为什么用 DO 而不是 KV/D1：
 *   · KV 是最终一致，注册重名检查会漏（两个请求同时看到"没人用"）
 *   · DO 单线程串行处理请求，唯一性检查天然没有竞态
 *   · D1 要单独建库、把 database_id 写进配置，多一道人工步骤
 *
 * 存储用 KV 风格的 get/put/delete，不以空格分片：
 *   user:<小写用户名>  { u, ph, email, emailOk, createdAt, lastLoginAt, fail, lockUntil }
 *   sess:<token>       { u, exp }
 *   code:<小写邮箱>    { c, exp, tries, purpose }
 *   cool:<小写邮箱>    下次可发码的时间戳（60 秒冷却）
 *   hour:<小写邮箱>    { n, start } 一小时内发码次数
 *
 * ⚠️ 量级上限约数千用户（每次读写都是单 key，没有索引）。
 *    再大要换 D1 并分片，别在这条路上硬撑。
 * ============================================================ */
import { sendMail } from './mail.js';

/* 免费 Workers 每请求 CPU 预算 10ms，PBKDF2 是纯 CPU。
   60k 次约 20–30ms 的 Node 实测值，上线后要复核；
   若报 1102（超出 CPU 时间）就降到 30k，并在提交信息里写明原因。 */
const ITER = 60000;
const SESSION_TTL = 30 * 24 * 3600 * 1000;
const CODE_TTL = 10 * 60 * 1000;
const CODE_COOL = 60 * 1000;
const CODE_PER_HOUR = 5;
const MAX_FAIL = 5;
const LOCK_MS = 10 * 60 * 1000;

const enc = new TextEncoder();

const b64 = (bytes) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};
const unb64 = (s) => {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, ITER);
  return `pbkdf2$${ITER}$${b64(salt)}$${b64(hash)}`;
}

export async function checkPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iter = Number(parts[1]);
  if (!iter || iter > 1e6) return false;
  const hash = await pbkdf2(password, unb64(parts[2]), iter);
  const want = unb64(parts[3]);
  if (hash.length !== want.length) return false;
  /* 定长比较，别用 === 提前退出泄露前缀匹配长度（这里 hash 是秘密，比的是"猜对几个字节"） */
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash[i] ^ want[i];
  return diff === 0;
}

export function newToken() {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

export function newCode() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  return String(n).padStart(6, '0');
}

/* ---------- 输入校验（后端是唯一权威，前端那份只是提前给提示） ---------- */
const NAME_RE = /^[\u4e00-\u9fa5A-Za-z0-9_]{2,12}$/;
const MAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normName(s) { return String(s || '').trim(); }
export function normMail(s) { return String(s || '').trim().toLowerCase(); }

export function validName(s) {
  if (!NAME_RE.test(s)) return '用户名 2–12 位，只能用中文、字母、数字、下划线';
  return '';
}
export function validPassword(s) {
  const p = String(s || '');
  if (p.length < 8) return '密码至少 8 位';
  if (p.length > 64) return '密码最多 64 位';
  if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) return '密码要同时包含字母和数字';
  return '';
}
export function validMail(s) {
  if (s.length > 100) return '邮箱太长';
  if (!MAIL_RE.test(s)) return '邮箱格式不对';
  return '';
}

const pub = (u) => ({
  username: u.u,
  email: u.email || '',
  emailOk: !!u.emailOk,
  createdAt: u.createdAt || 0,
});

export class Users {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  /* Worker 里统一用 POST + JSON body，op 从 path 取：
     stub.fetch('https://do/register', { method:'POST', body: JSON.stringify({...}) }) */
  async fetch(request) {
    const url = new URL(request.url);
    const op = url.pathname.replace(/^\/+/, '');
    let body = {};
    if (request.method === 'POST') {
      body = await request.json().catch(() => ({}));
    }
    try {
      const out = await this.handle(op, body || {});
      return Response.json(out);
    } catch (e) {
      // 内部错误不要原样回给前端（可能含存储细节），只记日志
      console.error('users do error:', op, e && e.stack || e);
      return Response.json({ error: '服务器开小差了，请稍后再试' }, { status: 500 });
    }
  }

  async handle(op, b) {
    switch (op) {
      case 'register': return this.register(b);
      case 'login': return this.login(b);
      case 'logout': return this.logout(b);
      case 'session': return this.session(b);
      case 'code': return this.sendCode(b);
      case 'bind': return this.bind(b);
      case 'reset': return this.reset(b);
      case 'password': return this.changePassword(b);
      default: return { error: '未知操作' };
    }
  }

  /* ---------- 基础读写 ---------- */
  async getUser(name) {
    return this.ctx.storage.get('user:' + normName(name).toLowerCase());
  }
  async putUser(u) {
    await this.ctx.storage.put('user:' + u.u.toLowerCase(), u);
  }
  async sessionOf(token) {
    if (!token) return null;
    const s = await this.ctx.storage.get('sess:' + token);
    if (!s) return null;
    if (s.exp < Date.now()) {
      await this.ctx.storage.delete('sess:' + token);
      return null;
    }
    return s;
  }

  /* ---------- 注册 ---------- */
  async register(b) {
    const name = normName(b.username);
    const pwd = String(b.password || '');
    const mail = normMail(b.email);

    let err = validName(name);
    if (err) return { error: err };
    err = validPassword(pwd);
    if (err) return { error: err };
    if (mail) {
      err = validMail(mail);
      if (err) return { error: err };
    }

    const key = name.toLowerCase();
    if (await this.ctx.storage.get('user:' + key)) return { error: '这个用户名已经被用了' };

    const u = {
      u: name,
      ph: await hashPassword(pwd),
      email: '',
      emailOk: false,
      createdAt: Date.now(),
      lastLoginAt: Date.now(),
      fail: 0,
      lockUntil: 0,
    };
    await this.putUser(u);

    const token = await this.openSession(key);
    const out = { token, user: pub(u) };

    /* 注册时填了邮箱就先发一封信，发不出去也不影响注册成功 */
    if (mail) {
      u.email = mail;
      await this.putUser(u);
      const sent = await this.trySendCode(mail, 'bind');
      out.user = pub(u);
      out.codeSent = !!sent.ok;
      if (!sent.ok) out.mailError = sent.error;
      /* 本地开发/测试（MAIL_MODE=console）把码一并回传，前端可以直接填上 */
      if (sent.devCode) out.devCode = sent.devCode;
    }
    return out;
  }

  /* ---------- 登录 ---------- */
  async login(b) {
    const name = normName(b.username);
    const pwd = String(b.password || '');
    if (!name || !pwd) return { error: '请填写用户名和密码' };

    const u = await this.getUser(name);
    /* 用户不存在时也要走一遍哈希，避免用响应时间探测用户是否存在 */
    if (!u) {
      await pbkdf2(pwd, new Uint8Array(16), 1000);
      return { error: '用户名或密码不对' };
    }
    if (u.lockUntil && u.lockUntil > Date.now()) {
      const min = Math.ceil((u.lockUntil - Date.now()) / 60000);
      return { error: `密码错太多次，${min} 分钟后再试` };
    }

    const okPwd = await checkPassword(pwd, u.ph);
    if (!okPwd) {
      u.fail = (u.fail || 0) + 1;
      if (u.fail >= MAX_FAIL) {
        u.lockUntil = Date.now() + LOCK_MS;
        u.fail = 0;
      }
      await this.putUser(u);
      return { error: '用户名或密码不对' };
    }

    u.fail = 0;
    u.lockUntil = 0;
    u.lastLoginAt = Date.now();
    await this.putUser(u);
    const token = await this.openSession(u.u.toLowerCase());
    return { token, user: pub(u) };
  }

  async openSession(key) {
    const token = newToken();
    await this.ctx.storage.put('sess:' + token, { u: key, exp: Date.now() + SESSION_TTL });
    /* 记一份会话集合，改密码/重置密码时才能把其它设备踢掉。
       只留最近 20 条；被挤出去的要把 sess: 一起删掉，否则 kickSessions 找不到它。 */
    const set = (await this.ctx.storage.get('sessions:' + key)) || [];
    set.push(token);
    while (set.length > 20) {
      const dead = set.shift();
      await this.ctx.storage.delete('sess:' + dead);
    }
    await this.ctx.storage.put('sessions:' + key, set);
    return token;
  }

  async logout(b) {
    if (b.token) {
      const s = await this.ctx.storage.get('sess:' + b.token);
      await this.ctx.storage.delete('sess:' + b.token);
      if (s) {
        const set = (await this.ctx.storage.get('sessions:' + s.u)) || [];
        await this.ctx.storage.put('sessions:' + s.u, set.filter((t) => t !== b.token));
      }
    }
    return { ok: true };
  }

  /* ---------- 会话校验（/ws 与 /api/auth/me 都走这里） ---------- */
  async session(b) {
    const s = await this.sessionOf(b.token);
    if (!s) return { ok: false };
    const u = await this.ctx.storage.get('user:' + s.u);
    if (!u) return { ok: false };
    return { ok: true, user: pub(u) };
  }

  /* ---------- 邮箱验证码 ---------- */
  async sendCode(b) {
    const mail = normMail(b.email);
    const purpose = b.purpose === 'reset' ? 'reset' : 'bind';
    const err = validMail(mail);
    if (err) return { error: err };

    if (purpose === 'bind') {
      const s = await this.sessionOf(b.token);
      if (!s) return { error: '登录状态已失效，请重新登录' };
      const me = await this.ctx.storage.get('user:' + s.u);
      if (me && me.emailOk && normMail(me.email) === mail) return { error: '这个邮箱已经绑在当前账号上了' };
    } else {
      // 重置密码：邮箱没绑定过就不发信，但对外仍回 ok，别让人拿这个接口探测邮箱是否注册
      const u = await this.findByEmail(mail);
      if (!u) return { ok: true, silent: true };
    }

    const r = await this.trySendCode(mail, purpose);
    if (!r.ok) return { error: r.error };
    return { ok: true, devCode: r.devCode };
  }

  async findByEmail(mail) {
    /* 没有邮箱索引表，就用「邮箱 → 用户名」的反查 key，绑定时一并写 */
    const key = await this.ctx.storage.get('mail:' + normMail(mail));
    if (!key) return null;
    return this.ctx.storage.get('user:' + key);
  }

  async trySendCode(mail, purpose) {
    const now = Date.now();
    const cool = await this.ctx.storage.get('cool:' + mail);
    if (cool && cool > now) {
      return { ok: false, error: `别点太快，${Math.ceil((cool - now) / 1000)} 秒后再试` };
    }
    const hour = (await this.ctx.storage.get('hour:' + mail)) || { n: 0, start: now };
    if (now - hour.start > 3600 * 1000) { hour.n = 0; hour.start = now; }
    if (hour.n >= CODE_PER_HOUR) {
      return { ok: false, error: '这个邮箱今天发得太频繁了，过一会儿再试' };
    }

    const code = newCode();
    await this.ctx.storage.put('code:' + mail, { c: code, exp: now + CODE_TTL, tries: 0, purpose });
    await this.ctx.storage.put('cool:' + mail, now + CODE_COOL);
    await this.ctx.storage.put('hour:' + mail, { n: hour.n + 1, start: hour.start });

    const title = purpose === 'reset' ? '重置密码' : '绑定邮箱';
    const sent = await sendMail(this.env, {
      to: mail,
      subject: `【黑暗森林】${title}验证码 ${code}`,
      text: `你的验证码是 ${code}，10 分钟内有效。\n\n如果不是你本人操作，忽略这封邮件即可，账号不会有任何变化。\n\n—— 黑暗森林 ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`,
    });
    if (!sent.ok) {
      // 发信失败要把码作废，否则用户拿不到码却占用了配额
      await this.ctx.storage.delete('code:' + mail);
      console.error('send code failed:', sent.error);
      /* 「没配邮箱」是部署问题，不是用户点错了。如实说出来——
         一律回"请稍后再试"会让人一直重试，而重试一万次也好不了。 */
      if (/未配置/.test(sent.error || '')) {
        return { ok: false, error: '这台服务器还没配置发信邮箱，暂时发不出验证码' };
      }
      return { ok: false, error: '验证码发送失败，请稍后再试' };
    }
    /* 本地开发/测试（MAIL_MODE=console）把码回给前端，方便不用真邮箱也能走通 */
    return { ok: true, devCode: sent.devCode };
  }

  async consumeCode(mail, code, purpose) {
    const rec = await this.ctx.storage.get('code:' + mail);
    if (!rec) return { error: '验证码无效或已过期' };
    if (rec.exp < Date.now()) {
      await this.ctx.storage.delete('code:' + mail);
      return { error: '验证码已过期，请重新获取' };
    }
    if (rec.purpose !== purpose) return { error: '验证码用途不符，请重新获取' };
    if (rec.tries >= 5) {
      await this.ctx.storage.delete('code:' + mail);
      return { error: '错误次数太多，请重新获取验证码' };
    }
    if (String(code || '').trim() !== rec.c) {
      rec.tries = (rec.tries || 0) + 1;
      await this.ctx.storage.put('code:' + mail, rec);
      return { error: '验证码不对' };
    }
    await this.ctx.storage.delete('code:' + mail);
    return { ok: true };
  }

  /* ---------- 绑定邮箱 ---------- */
  async bind(b) {
    const s = await this.sessionOf(b.token);
    if (!s) return { error: '登录状态已失效，请重新登录' };
    const mail = normMail(b.email);
    const err = validMail(mail);
    if (err) return { error: err };

    const owned = await this.ctx.storage.get('mail:' + mail);
    if (owned && owned !== s.u) return { error: '这个邮箱已经绑在别的账号上了' };

    const c = await this.consumeCode(mail, b.code, 'bind');
    if (c.error) return { error: c.error };

    const u = await this.ctx.storage.get('user:' + s.u);
    if (!u) return { error: '账号不存在' };
    if (u.email && u.email !== mail) await this.ctx.storage.delete('mail:' + normMail(u.email));
    u.email = mail;
    u.emailOk = true;
    await this.putUser(u);
    await this.ctx.storage.put('mail:' + mail, s.u);
    return { ok: true, user: pub(u) };
  }

  /* ---------- 重置密码 ---------- */
  async reset(b) {
    const mail = normMail(b.email);
    const pwd = String(b.password || '');
    const err = validPassword(pwd);
    if (err) return { error: err };

    const c = await this.consumeCode(mail, b.code, 'reset');
    if (c.error) return { error: c.error };

    const u = await this.findByEmail(mail);
    if (!u) return { error: '这个邮箱没有绑定账号' };

    u.ph = await hashPassword(pwd);
    u.fail = 0;
    u.lockUntil = 0;
    await this.putUser(u);
    await this.kickSessions(u.u.toLowerCase());
    const token = await this.openSession(u.u.toLowerCase());
    return { ok: true, token, user: pub(u) };
  }

  /* ---------- 改密码 ---------- */
  async changePassword(b) {
    const s = await this.sessionOf(b.token);
    if (!s) return { error: '登录状态已失效，请重新登录' };
    const u = await this.ctx.storage.get('user:' + s.u);
    if (!u) return { error: '账号不存在' };
    if (!(await checkPassword(String(b.old || ''), u.ph))) return { error: '原密码不对' };
    const err = validPassword(b.next);
    if (err) return { error: err };

    u.ph = await hashPassword(String(b.next));
    await this.putUser(u);
    await this.kickSessions(s.u, b.token);   // 其它设备下线，当前这条留着
    return { ok: true };
  }

  /* 把某用户的会话全删（可保留一个）。没有 list()，所以用「用户当前会话指针」没法做，
     这里退一步：只删调用方明确给出的 token 之外无法枚举——
     于是改为记一个会话集合 key，登录时写入、登出/踢人时按集合清。 */
  async kickSessions(key, keepToken) {
    const set = (await this.ctx.storage.get('sessions:' + key)) || [];
    const alive = [];
    for (const t of set) {
      if (t === keepToken) { alive.push(t); continue; }
      await this.ctx.storage.delete('sess:' + t);
    }
    await this.ctx.storage.put('sessions:' + key, alive);
  }
}
