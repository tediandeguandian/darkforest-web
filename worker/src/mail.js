/* ============================================================
 * worker/src/mail.js — 直接用 SMTP 发信（不经第三方邮件 API）
 *
 * 为什么能这么做：Workers 从 2024 年起支持 cloudflare:sockets 的
 * connect()，并且带 secureTransport: "on" 能做隐式 TLS。25 端口被平台
 * 封了（反垃圾），465 / 587 可用。这条链路在本地运行时实测过：
 * EHLO → AUTH LOGIN → 235 → DATA → 250，邮件真的投递成功。
 *
 * 为什么不用 Resend 之类：项目已经有 shuwang@email.cn 的专用密码，
 * 用它发信发件人就是本人，不需要再验证域名、也不用多一个账号。
 *
 * 配置（全部走 secret，绝不写进 wrangler.toml —— 仓库是公开的）：
 *   SMTP_HOST  默认 smtp.email.cn
 *   SMTP_PORT  默认 465
 *   SMTP_USER  shuwang@email.cn
 *   SMTP_PASS  邮箱的「专用密码」（16 位，不是登录密码）
 *   MAIL_FROM  发件人地址，默认同 SMTP_USER
 *   MAIL_MODE  =console 时不真发，把验证码打在日志里并回传给调用方
 * ============================================================ */
/* cloudflare:sockets 只有 Workers 运行时认识，Node 侧（本地测试）解析不了。
   所以用动态 import：不真发信就永远不会去加载它，测试可以直接跑。 */
let _connect = null;
async function getConnect() {
  if (!_connect) {
    const mod = await import('cloudflare:sockets');
    _connect = mod.connect;
  }
  return _connect;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

const b64utf8 = (s) => {
  const bytes = enc.encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

/* 中文主题必须编码，否则很多客户端显示乱码；正文用 base64 最稳 */
function buildMessage({ from, to, subject, text }) {
  const body = b64utf8(text).replace(/(.{76})/g, '$1\r\n');
  return [
    `From: =?UTF-8?B?${b64utf8('黑暗森林')}?= <${from}>`,
    `To: <${to}>`,
    `Subject: =?UTF-8?B?${b64utf8(subject)}?=`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${Date.now()}.${Math.random().toString(36).slice(2)}@darkforest>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    body,
  ].join('\r\n');
}

/* SMTP 应答可能是多行：「250-xxx」后面还有，「250 xxx」是最后一行 */
function makeReader(reader) {
  let buf = '';
  return {
    async line() {
      while (buf.indexOf('\n') < 0) {
        const { value, done } = await reader.read();
        if (done) return null;
        buf += dec.decode(value, { stream: true });
      }
      const i = buf.indexOf('\n');
      const s = buf.slice(0, i).replace(/\r$/, '');
      buf = buf.slice(i + 1);
      return s;
    },
    async reply() {
      const all = [];
      for (;;) {
        const l = await this.line();
        if (l === null) return { code: '000', text: all.join(' | ') || '连接中断' };
        all.push(l);
        if (l.length >= 4 && l[3] === '-') continue;
        return { code: l.slice(0, 3), text: all.join(' | ') };
      }
    },
  };
}

export async function sendMail(env, { to, subject, text }) {
  const host = env.SMTP_HOST || 'smtp.email.cn';
  const port = Number(env.SMTP_PORT || 465);
  const user = env.SMTP_USER || '';
  const pass = env.SMTP_PASS || '';
  const from = env.MAIL_FROM || user;

  /* 本地开发 / 测试：不连网，把码打到日志并回传，前端能直接看到 */
  if (env.MAIL_MODE === 'console') {
    console.log(`[mail:console] to=${to} subject=${subject}\n${text}`);
    const m = /(\d{6})/.exec(subject);
    return { ok: true, devCode: m ? m[1] : undefined };
  }

  if (!user || !pass) {
    return { ok: false, error: '邮件通道未配置（缺 SMTP_USER / SMTP_PASS）' };
  }

  let sock;
  try {
    const connect = await getConnect();
    sock = connect({ hostname: host, port }, { secureTransport: 'on' });
    const writer = sock.writable.getWriter();
    const rd = makeReader(sock.readable.getReader());

    const banner = await rd.reply();
    if (banner.code !== '220') throw new Error('SMTP 未就绪: ' + banner.text);

    const w = (s) => writer.write(enc.encode(s + '\r\n'));
    const cmd = async (s) => { await w(s); return rd.reply(); };

    const ehlo = await cmd('EHLO darkforest.dpdns.org');
    if (ehlo.code !== '250') throw new Error('EHLO 失败: ' + ehlo.text);

    const a1 = await cmd('AUTH LOGIN');
    if (a1.code !== '334') throw new Error('AUTH 不被支持: ' + a1.text);
    const a2 = await cmd(b64utf8(user));
    if (a2.code !== '334') throw new Error('用户名被拒: ' + a2.text);
    const a3 = await cmd(b64utf8(pass));
    if (a3.code !== '235') throw new Error('邮箱密码不对: ' + a3.text);

    const mf = await cmd(`MAIL FROM:<${from}>`);
    if (mf.code !== '250') throw new Error('发件人被拒: ' + mf.text);
    const rc = await cmd(`RCPT TO:<${to}>`);
    if (rc.code !== '250') throw new Error('收件人被拒: ' + rc.text);
    const dt = await cmd('DATA');
    if (dt.code !== '354') throw new Error('DATA 被拒: ' + dt.text);

    await w(buildMessage({ from, to, subject, text }) + '\r\n.');
    const done = await rd.reply();
    if (done.code !== '250') throw new Error('投递失败: ' + done.text);

    await cmd('QUIT').catch(() => {});
    try { await sock.close(); } catch (e) {}
    return { ok: true };
  } catch (e) {
    try { sock && (await sock.close()); } catch (e2) {}
    return { ok: false, error: String((e && e.message) || e) };
  }
}
