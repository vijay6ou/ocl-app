'use strict';
/**
 * App update-check integration test.
 *
 * Why this file exists separately: in the main app suite the page's own start-up
 * check runs before a test can install its native mock, so the version comparison
 * sees code 0 and the update path never triggers. Here the bridge is supplied
 * BEFORE the script is evaluated, which is the situation on a real phone.
 *
 *   node app/test/update-check.js
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const crypto = require('crypto');

const HTML = path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'index.html');
const API_BASE = 'https://ocl-plant.duckdns.org';

let pass = 0, fail = 0;
const failures = [];
function check(name, fn) {
  return Promise.resolve().then(fn)
    .then(() => { console.log('  PASS  ' + name); pass++; })
    .catch(e => {
      const m = e && e.message ? e.message : String(e);
      console.log('  FAIL  ' + name + '  → ' + m);
      failures.push(name + ': ' + m);
      fail++;
    });
}
const assert = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
const assertEq = (a, b, m) => { if (a !== b) throw new Error((m || 'not equal') + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); };

// ── minimal DOM ──────────────────────────────────────────────────────────────
function makeEl(id) {
  const el = { id, _c: new Set(), style: {}, value: '', textContent: '', _h: '', disabled: false, checked: false, children: [] };
  Object.defineProperty(el, 'innerHTML', { get() { return el._h; }, set(v) { el._h = String(v); } });
  Object.defineProperty(el, 'className', { get() { return [...el._c].join(' '); }, set(v) { el._c = new Set(String(v).split(/\s+/).filter(Boolean)); } });
  el.classList = {
    add: (...a) => a.forEach(x => el._c.add(x)),
    remove: (...a) => a.forEach(x => el._c.delete(x)),
    contains: c => el._c.has(c),
    toggle: (c, on) => { if (on) el._c.add(c); else el._c.delete(c); },
  };
  el.querySelector = () => null;
  el.querySelectorAll = () => [];
  el.appendChild = x => x;
  el.removeChild = x => x;
  el.insertBefore = x => x;
  el.setAttribute = () => {};
  el.focus = () => {};
  el.click = () => {};
  el.addEventListener = () => {};
  return el;
}
const store = () => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; };

function boot({ release, nativeVersionCode, nativeVersionName }) {
  const html = fs.readFileSync(HTML, 'utf8');
  const script = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).join('\n');

  const els = {};
  const proxy = new Proxy(els, { get(t, k) { if (typeof k === 'string' && !(k in t)) t[k] = makeEl(k); return t[k]; } });
  const opened = [];
  const confirms = [];
  let confirmReturn = true;

  const ctx = {
    document: {
      _els: proxy,
      getElementById: id => { if (!els[id]) els[id] = makeEl(id); return els[id]; },
      querySelector: () => makeEl('q'),
      querySelectorAll: () => [],
      createElement: t => makeEl(t),
      addEventListener: () => {},
      body: makeEl('body'),
      visibilityState: 'visible',
    },
    localStorage: store(),
    sessionStorage: store(),
    console: { log: () => {}, warn: () => {}, error: () => {}, info: () => {}, debug: () => {} },
    alert: () => {},
    confirm: m => { confirms.push(String(m)); return confirmReturn; },
    prompt: () => null,
    setTimeout: fn => { if (typeof fn === 'function') fn(); return 0; },
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
    URLSearchParams,
    AbortController,
    FormData: function () {},
    Blob: function () {},
    TextEncoder: require('util').TextEncoder,
    crypto: { subtle: { digest: async (a, b) => crypto.createHash('sha256').update(Buffer.from(b)).digest() } },
    scrollTo: () => {},
    print: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    // The native bridge is present BEFORE the page runs, exactly as on a device.
    OCLNative: {
      _p: {},
      available: () => true,
      getItem(k) { return k in this._p ? this._p[k] : null; },
      setItem(k, v) { this._p[k] = String(v); },
      removeItem(k) { delete this._p[k]; },
      appVersionName: () => nativeVersionName,
      appVersionCode: () => nativeVersionCode,
      platform: () => 'Android 13 (API 33)',
      printHtml: () => {},
      openUrl: u => opened.push(u),
    },
    fetch: (url, init) => {
      const p = url.replace(API_BASE, '');
      const route = p.split('?')[0];
      const j = b => Promise.resolve({ ok: true, status: 200, statusText: 'OK', text: () => Promise.resolve(JSON.stringify(b)) });
      if (route === '/api/app/version') return j({ update: release });
      if (route === '/api/config') return j({ config: null });
      if (route === '/api/records') return j({ total: 0, count: 0, records: [] });
      if (route === '/api/records/dates') return j({ dates: [], total: 0 });
      return j({});
    },
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;

  ctx.localStorage.setItem('ocl_api_url', API_BASE);
  ctx.localStorage.setItem('ocl_api_token', 'tok');
  ctx.localStorage.setItem('ocl_api_user', JSON.stringify({ id: 1, username: 'v', role: 'admin' }));

  vm.createContext(ctx);
  vm.runInContext(script, ctx, { filename: 'app' });
  vm.runInContext(
    'globalThis.__api = { checkForUpdates, nativeVersion, doUpdateDownload, hideUpdateBanner };',
    ctx, { filename: 'expose' });
  ctx._opened = opened;
  ctx._confirms = confirms;
  ctx._setConfirm = v => { confirmReturn = v; };
  return ctx;
}

const drain = () => new Promise(r => setImmediate(r));

(async () => {
  console.log('=== App update check (native bridge installed before page load) ===\n');
  const newer = { versionCode: 9, versionName: '9.9.9', url: '/releases/app.apk', notes: 'Faster' };

  await check('the app reads its own version from the native bridge', () => {
    const c = boot({ release: newer, nativeVersionCode: 3, nativeVersionName: '2.1.0' });
    const v = c.__api.nativeVersion();
    assertEq(v.code, 3, 'version code');
    assertEq(v.name, '2.1.0', 'version name');
    return true;
  });

  await check('a newer release is detected and named', async () => {
    const c = boot({ release: newer, nativeVersionCode: 3, nativeVersionName: '2.1.0' });
    await drain();
    c.__api.checkForUpdates(true);
    await drain(); await drain(); await drain();
    assert(c._confirms.some(m => /Update available/i.test(m)), 'no update dialog');
    assert(c._confirms.some(m => /9\.9\.9/.test(m)), 'available version not named');
    assert(c._confirms.some(m => /Faster/.test(m)), 'release notes not shown');
    return true;
  });

  await check('confirming the update hands the absolute URL to the system', async () => {
    const c = boot({ release: newer, nativeVersionCode: 3, nativeVersionName: '2.1.0' });
    await drain();
    c._setConfirm(true);
    c.__api.checkForUpdates(true);
    await drain(); await drain(); await drain();
    assertEq(c._opened[0], API_BASE + '/releases/app.apk', 'download URL not resolved against the server');
    return true;
  });

  await check('declining the update does not open anything', async () => {
    const c = boot({ release: newer, nativeVersionCode: 3, nativeVersionName: '2.1.0' });
    await drain();
    c._setConfirm(false);
    c.__api.checkForUpdates(true);
    await drain(); await drain(); await drain();
    assertEq(c._opened.length, 0, 'a download started even though the user declined');
    return true;
  });

  await check('being up to date does not offer an update', async () => {
    const c = boot({ release: { versionCode: 3, versionName: '2.1.0', url: '/releases/app.apk' }, nativeVersionCode: 3, nativeVersionName: '2.1.0' });
    await drain();
    c._setConfirm(true);
    c.__api.checkForUpdates(true);
    await drain(); await drain(); await drain();
    assert(!c._confirms.some(m => /Update available/i.test(m)), 'offered an update when already current');
    assertEq(c._opened.length, 0, 'opened a download when already current');
    return true;
  });

  await check('an installed build NEWER than the server is left alone', async () => {
    const c = boot({ release: { versionCode: 2, versionName: '1.9.0', url: '/releases/old.apk' }, nativeVersionCode: 7, nativeVersionName: '2.5.0' });
    await drain();
    c._setConfirm(true);
    c.__api.checkForUpdates(true);
    await drain(); await drain(); await drain();
    assert(!c._confirms.some(m => /Update available/i.test(m)), 'offered a downgrade');
    return true;
  });

  await check('the silent start-up check shows a notice, not a dialog', async () => {
    const c = boot({ release: newer, nativeVersionCode: 3, nativeVersionName: '2.1.0' });
    await drain();
    const before = c._confirms.length;
    c.__api.checkForUpdates(false);
    await drain(); await drain(); await drain();
    assertEq(c._confirms.length, before, 'the background check interrupted the user with a dialog');
    const bar = c.document._els['update-banner'];
    assert(bar && /Update available/i.test(bar.innerHTML), 'no notice shown for a background check');
    return true;
  });

  await check('the notice can be dismissed', async () => {
    const c = boot({ release: newer, nativeVersionCode: 3, nativeVersionName: '2.1.0' });
    await drain();
    c.__api.checkForUpdates(false);
    await drain(); await drain(); await drain();
    c.__api.hideUpdateBanner();
    assert(!c.document._els['update-banner'].classList.contains('show'), 'notice did not hide');
    return true;
  });

  await check('no published release is reported clearly, not silently', async () => {
    const c = boot({ release: null, nativeVersionCode: 3, nativeVersionName: '2.1.0' });
    await drain();
    c.__api.checkForUpdates(true);
    await drain(); await drain(); await drain();
    assertEq(c._confirms.length, 0, 'unexpected dialog');
    assertEq(c._opened.length, 0, 'unexpected download');
    return true;
  });

  console.log('\n================ TEST RESULT ================');
  console.log('passed: ' + pass + '   failed: ' + fail);
  if (failures.length) {
    console.log('\nFAILURES:');
    failures.forEach(f => console.log(' - ' + f));
    process.exitCode = 1;
  } else {
    console.log('ALL UPDATE-CHECK TESTS PASSED');
  }
})();
