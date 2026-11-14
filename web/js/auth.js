/* ============================================================
 * web/js/auth.js — 登录 / 注册 / 绑定邮箱 / 改密码
 *
 * 只在联机页（index.html → 各壳的 online.html）加载。
 * 单机页（local.html）与局域网页（lan.html）不需要账号，也不加载它，
 * 所以 ui.js 里一律用 typeof Auth !== 'undefined' 判过再用。
 *
 * 服务端有两种形态，靠 /api/auth/me 返回的 authRequired 区分：
 *   · 线上 Worker        → authRequired: true，没登录不让联机
 *   · 本地 / 局域网服务器 → authRequired: false，游客照样能开局
 * 这样同一份前端不用分叉，也不会因为本地没配 SMTP 就玩不了。
 * ============================================================ */
const Auth = (() => {
  const KEY = 'df_auth';
  const BASE = (typeof window !== 'undefined' && window.DF_SERVER)
    ? String(window.DF_SERVER).replace(/\/+$/, '')
    : '';

  const state = {
    token: '',        // 会话 token
    user: null,       // { username, email, emailOk, createdAt }
    required: false,  // 服务端是否强制登录
    known: false,     // 是否已经问过服务端
  };
  let probing = null;
  const subs = [];

  const ls = {
    get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
    del: k => { try { localStorage.removeItem(k); } catch (e) {} },
  };

  state.token = ls.get(KEY) || '';

  const emit = () => subs.forEach(fn => { try { fn(state.user, state); } catch (e) {} });

  async function call(path, body, method) {
    const opt = { method: method || (body ? 'POST' : 'GET'), headers: {} };
    if (state.token) opt.headers.Authorization = 'Bearer ' + state.token;
    if (body) {
      opt.headers['Content-Type'] = 'application/json';
      opt.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch(BASE + path, opt);
    } catch (e) {
      return { error: '连不上服务器，检查一下网络' };
    }
    let data = {};
    try { data = await res.json(); } catch (e) {}
    if (res.status === 401 && data && data.user === undefined && !data.error) data.error = '登录状态已失效';
    return data || {};
  }

  /** 问服务端：我是谁、这部署要不要登录。结果缓存，失败不记 */
  function probe(force) {
    if (probing && !force) return probing;
    if (state.known && !force) return Promise.resolve({ authRequired: state.required, user: state.user });
    probing = call('/api/auth/me').then(d => {
      /* 拿不到这个接口（老版本服务器 / 局域网服务器）就当游客模式：宁可放行，
         也不要让一个 404 把所有人锁在登录面板外面。 */
      state.required = !!d.authRequired;
      state.known = true;
      if (d.user) {
        state.user = d.user;
      } else if (!state.required) {
        state.user = null;
      } else if (state.token) {
        state.token = '';      // token 过期了，别一直拿它去撞 401
        ls.del(KEY);
      }
      emit();
      return { authRequired: state.required, user: state.user };
    }).finally(() => { probing = null; });
    return probing;
  }

  function applySession(d) {
    if (d.token) { state.token = d.token; ls.set(KEY, d.token); }
    if (d.user) state.user = d.user;
    state.known = true;
    emit();
  }

  async function login(username, password) {
    const d = await call('/api/auth/login', { username, password });
    if (d.error) return d;
    applySession(d);
    return d;
  }

  async function register(username, password, email) {
    const body = { username, password };
    if (email) body.email = email;
    const d = await call('/api/auth/register', body);
    if (d.error) return d;
    applySession(d);
    return d;
  }

  async function logout() {
    if (state.token) await call('/api/auth/logout', { token: state.token });
    state.token = '';
    state.user = null;
    ls.del(KEY);
    emit();
  }

  const sendCode = (email, purpose) =>
    call('/api/auth/email/code', { email, purpose: purpose || 'bind' });
  const bindEmail = (email, code) => call('/api/auth/email/bind', { email, code }).then(d => {
    if (d.user) { state.user = d.user; emit(); }
    return d;
  });
  const resetPassword = (email, code, password) =>
    call('/api/auth/reset', { email, code, password }).then(d => { if (!d.error) applySession(d); return d; });
  const changePassword = (old, next) => call('/api/auth/password', { old, next });

  /* ============================================================
   * 面板
   * ============================================================ */
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  let modal = null;
  let tab = 'login';
  let busy = false;
  let after = null;      // 登录成功后要做的事（比如继续建房）

  function close() {
    if (!modal) return;
    modal.remove();
    modal = null;
    document.removeEventListener('keydown', onKey);
  }
  const onKey = e => { if (e.key === 'Escape') close(); };

  /** 登录后的「我的账号」：绑邮箱 / 改密码 / 退出 */
  function accountHtml(u) {
    return `
      <div class="auth-me">
        <div class="auth-who"><b>${esc(u.username)}</b></div>
        <div class="auth-sub">${u.emailOk
          ? `邮箱 ${esc(u.email)} 已验证`
          : '还没有绑定邮箱 · 忘了密码就找不回来'}</div>
      </div>
      <div class="auth-acts">
        ${u.emailOk ? '' : '<button class="btn small" id="auBind">绑定邮箱</button>'}
        <button class="btn small" id="auPwd">改密码</button>
        <button class="btn small danger" id="auOut">退出登录</button>
      </div>`;
  }

  function formHtml() {
    const reg = tab === 'reg';
    return `
      <div class="auth-tabs">
        <button data-tab="login" class="${reg ? '' : 'on'}">登录</button>
        <button data-tab="reg" class="${reg ? 'on' : ''}">注册</button>
      </div>
      <div class="field">
        <label>用户名</label>
        <input id="auName" maxlength="12" autocomplete="username" placeholder="2–12 位，中文/字母/数字/下划线" />
      </div>
      <div class="field">
        <label>密码</label>
        <input id="auPwdInput" type="password" maxlength="64" autocomplete="${reg ? 'new-password' : 'current-password'}" placeholder="${reg ? '至少 8 位，含字母和数字' : '输入密码'}" />
      </div>
      ${reg ? `
      <div class="field">
        <label>邮箱（可选）</label>
        <input id="auMail" type="email" maxlength="100" autocomplete="email" placeholder="绑了才能找回密码" />
      </div>` : ''}
      <p class="auth-err" id="auErr"></p>
      <button class="btn primary auth-submit" id="auGo">${reg ? '注册并进入' : '登录'}</button>
      <p class="auth-note">${reg
        ? '注册后用户名就是你在对局里显示的名字。'
        : '没有账号？点上面的「注册」，只要用户名和密码就能开。'}</p>`;
  }

  function bindHtml() {
    /* 注册时填过邮箱的话，验证码已经发出去了：直接预填地址并说明，
       不用再让人点一次「发验证码」 */
    const pre = state.user && state.user.email ? state.user.email : '';
    return `
      <p class="auth-lead">${pre
        ? `验证码已发到 <b>${esc(pre)}</b>，收到后填进下面完成绑定。`
        : '验证码会发到下面的邮箱，收到后填进来完成绑定。'}</p>
      <div class="field">
        <label>邮箱</label>
        <input id="auMail" type="email" maxlength="100" value="${esc(pre)}" placeholder="you@example.com" />
      </div>
      <div class="field">
        <label>验证码</label>
        <div class="auth-row">
          <input id="auCode" maxlength="6" inputmode="numeric" placeholder="6 位数字" />
          <button class="btn small" id="auSend">${pre ? '重新发送' : '发验证码'}</button>
        </div>
      </div>
      <p class="auth-err" id="auErr"></p>
      <button class="btn primary auth-submit" id="auGo">完成绑定</button>
      <button class="btn ghost auth-submit" id="auBack">返回</button>`;
  }

  function pwdHtml() {
    return `
      <p class="auth-lead">改完密码，其它设备上的登录会全部失效。</p>
      <div class="field"><label>原密码</label><input id="auOld" type="password" maxlength="64" autocomplete="current-password" /></div>
      <div class="field"><label>新密码</label><input id="auNew" type="password" maxlength="64" autocomplete="new-password" placeholder="至少 8 位，含字母和数字" /></div>
      <p class="auth-err" id="auErr"></p>
      <button class="btn primary auth-submit" id="auGo">保存</button>
      <button class="btn ghost auth-submit" id="auBack">返回</button>`;
  }

  function setErr(msg) {
    const n = modal && modal.querySelector('#auErr');
    if (n) n.textContent = msg || '';
  }

  /* 每个视图的按钮行为。重画之后重新绑一遍，逻辑集中在这里 */
  let view = 'form';     // form | account | bind | pwd

  function paint() {
    if (!modal) return;
    const box = modal.querySelector('.auth');
    let body = '';
    let title = '登录';
    if (view === 'account' && state.user) { body = accountHtml(state.user); title = '我的账号'; }
    else if (view === 'bind') { body = bindHtml(); title = '绑定邮箱'; }
    else if (view === 'pwd') { body = pwdHtml(); title = '修改密码'; }
    else { body = formHtml(); title = tab === 'reg' ? '注册' : '登录'; }

    box.innerHTML = `
      <div class="set-head"><b>${title}</b><button class="mini-x" id="auClose" aria-label="关闭">×</button></div>
      <div class="auth-body">${body}</div>`;
    box.querySelector('#auClose').addEventListener('click', close);

    box.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
      tab = b.dataset.tab;
      paint();
    }));

    const back = box.querySelector('#auBack');
    if (back) back.addEventListener('click', () => { view = 'account'; paint(); });

    const go = box.querySelector('#auGo');
    if (go) go.addEventListener('click', () => submit(go));

    const out = box.querySelector('#auOut');
    if (out) out.addEventListener('click', async () => {
      await logout();
      view = 'form';
      tab = 'login';
      paint();
    });
    const bind = box.querySelector('#auBind');
    if (bind) bind.addEventListener('click', () => { view = 'bind'; paint(); });
    const pw = box.querySelector('#auPwd');
    if (pw) pw.addEventListener('click', () => { view = 'pwd'; paint(); });

    const send = box.querySelector('#auSend');
    if (send) send.addEventListener('click', async () => {
      const mail = (box.querySelector('#auMail').value || '').trim();
      if (!mail) return setErr('先填邮箱');
      send.disabled = true;
      send.textContent = '发送中…';
      const d = await sendCode(mail, 'bind');
      send.disabled = false;
      send.textContent = '重新发送';
      if (d.error) return setErr(d.error);
      /* 本地服务器不真发信，把验证码直接告诉我们，省得去翻终端 */
      if (d.devCode) {
        const c = box.querySelector('#auCode');
        if (c) c.value = d.devCode;
        setErr('本地模式：验证码已自动填入');
      } else {
        setErr('验证码已发出，请查收（含垃圾箱）');
      }
    });

    // 回车直接提交
    box.querySelectorAll('input').forEach(inp => inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { const b = box.querySelector('#auGo'); if (b) b.click(); }
    }));
    const first = box.querySelector('input');
    if (first && view === 'form') setTimeout(() => { try { first.focus(); } catch (e) {} }, 60);
  }

  async function submit(btn) {
    if (busy) return;
    const box = modal && modal.querySelector('.auth');
    if (!box) return;
    const val = sel => { const n = box.querySelector(sel); return n ? n.value : ''; };
    setErr('');

    busy = true;
    const fromForm = view === 'form';    // 是「登录/注册」进来的，还是面板内的二次操作
    const old = btn.textContent;
    btn.textContent = '请稍候…';
    btn.disabled = true;

    let d = {};
    try {
      if (view === 'bind') {
        d = await bindEmail((val('#auMail') || '').trim(), (val('#auCode') || '').trim());
        if (!d.error) { view = 'account'; }
      } else if (view === 'pwd') {
        d = await changePassword(val('#auOld'), val('#auNew'));
        if (!d.error) { view = 'account'; setErr(''); }
      } else if (tab === 'reg') {
        d = await register((val('#auName') || '').trim(), val('#auPwdInput'), (val('#auMail') || '').trim());
        if (!d.error && d.user) {
          /* 注册时填了邮箱：服务端已经发了绑定验证码，直接进绑定页省一步 */
          if (d.user.email && !d.user.emailOk) { view = 'bind'; }
          else view = 'account';
        }
      } else {
        d = await login((val('#auName') || '').trim(), val('#auPwdInput'));
        if (!d.error) view = 'account';
      }
    } finally {
      busy = false;
      if (btn.isConnected) { btn.textContent = old; btn.disabled = false; }
    }

    if (d.error) { setErr(d.error); return; }
    if (view === 'account') {
      paint();
      const fn = after; after = null;
      if (fn) {
        /* 是被联机入口拦下来的：续上那一击，面板立刻收起 */
        try { if (typeof toast === 'function') toast('已登录：' + (state.user ? state.user.username : '')); } catch (e) {}
        close();
        fn();
        return;
      }
      /* 刚登录/注册：停一下让人看清自己的名字，然后自己收起。
         绑定邮箱、改密码是面板里的二次操作，完成后要留在原地看到结果。 */
      if (fromForm) {
        try { if (typeof toast === 'function') toast('已登录：' + (state.user ? state.user.username : '')); } catch (e) {}
        setTimeout(close, 1100);
      }
      return;
    }
    paint();
    if (d.devCode) {
      const c = box.querySelector('#auCode');
      if (c) c.value = d.devCode;
    }
  }

  function open(opts) {
    const o = opts || {};
    after = typeof o.after === 'function' ? o.after : null;
    tab = o.tab || 'login';
    view = state.user ? 'account' : 'form';
    if (modal) { paint(); return modal; }

    const box = document.createElement('div');
    box.className = 'settings-mask';
    box.id = 'authModal';
    box.innerHTML = '<div class="settings auth"></div>';
    box.addEventListener('click', e => { if (e.target === box) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(box);
    modal = box;
    paint();
    return box;
  }

  /**
   * 联机入口的闸门。已登录 / 服务端不要求登录 → 直接放行。
   * 未登录 → 弹面板，登录成功后自动执行 fn（把刚才被拦下的动作续上）。
   * 返回 Promise<boolean>，调用方 await 一下就知道该不该继续。
   */
  async function requireLogin(fn) {
    await probe();
    if (!state.required) return true;
    if (state.user && state.token) return true;
    open({ after: fn || null });
    return false;
  }

  return {
    get user() { return state.user; },
    get token() { return state.token; },
    get required() { return state.required; },
    /* 是否已经问过服务端。没问过之前 required 不可信（默认值是 false） */
    get known() { return state.known; },
    probe,
    login, register, logout,
    sendCode, bindEmail, resetPassword, changePassword,
    openPanel: open,
    closePanel: close,
    requireLogin,
    onChange(fn) { subs.push(fn); fn(state.user, state); },
    /* 启动时探一次，UI 才能知道该显示「登录」还是用户名 */
    init() { return probe(); },
  };
})();
