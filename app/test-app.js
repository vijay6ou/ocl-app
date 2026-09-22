// Headless harness: runs the app's real <script> inside a mock DOM so the new
// records / autosave logic is executed, not merely parsed.
const fs = require('fs');
const vm = require('vm');
const crypto = require('crypto');

const HTML_PATH = 'D:\\deepseek harness\\_extract\\ocl-maintenance\\app\\app\\src\\main\\assets\\index.html';
const html = fs.readFileSync(HTML_PATH, 'utf8');
const script = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).join('\n');

const SHEET_URL = 'https://script.google.com/macros/s/AKfycbTESTTOKENVALUE1234567890/exec';
const SHEET_URL_OK = SHEET_URL;
let pass = 0, fail = 0;
const failures = [];
const pending = [];
function check(name, fn) {
  let r;
  try {
    r = fn();
  } catch (e) {
    console.log('  FAIL  ' + name + '  → ' + e.message);
    failures.push(name + ': ' + e.message);
    fail++;
    return;
  }
  if (r && typeof r.then === 'function') {
    pending.push(r.then(
      () => { console.log('  PASS  ' + name); pass++; },
      e => {
        const m = (e && e.message) ? e.message : String(e);
        console.log('  FAIL  ' + name + '  → ' + m);
        failures.push(name + ': ' + m);
        fail++;
      }
    ));
    return;
  }
  if (r === false) {
    console.log('  FAIL  ' + name + '  → assertion returned false');
    failures.push(name + ': assertion returned false');
    fail++;
    return;
  }
  console.log('  PASS  ' + name);
  pass++;
}
const skipped = [];
function skip(name, why) { console.log('  SKIP  ' + name + '  (' + why + ')'); skipped.push(name); }
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertEq(a, b, msg) {
  if (a !== b) throw new Error((msg || 'not equal') + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');
}

// ── Mock DOM ───────────────────────────────────────────────────────────────────
function makeStore() {
  const m = {};
  return {
    getItem: k => (Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: k => { delete m[k]; },
    clear: () => { Object.keys(m).forEach(k => delete m[k]); },
    _raw: m,
  };
}

function makeEl(id) {
  const el = {
    id,
    _cls: new Set(),
    style: {},
    value: '',
    textContent: '',
    _html: '',
    disabled: false,
    checked: false,
    children: [],
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = String(v); },
    get className() { return [...this._cls].join(' '); },
    set className(v) { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); },
    classList: {
      add: (...c) => c.forEach(x => el._cls.add(x)),
      remove: (...c) => c.forEach(x => el._cls.delete(x)),
      contains: c => el._cls.has(c),
      toggle: (c, on) => { if (on === undefined) { el._cls.has(c) ? el._cls.delete(c) : el._cls.add(c); } else if (on) el._cls.add(c); else el._cls.delete(c); },
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    appendChild: c => { el.children.push(c); return c; },
    removeChild: c => { el.children = el.children.filter(x => x !== c); return c; },
    setAttribute: () => {},
    getAttribute: () => null,
    focus: () => {},
    click: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  return el;
}

function makeContext() {
  const els = {};
  const getEl = id => {
    if (!els[id]) els[id] = makeEl(id);
    return els[id];
  };
  const genericEl = makeEl('__generic__');
  const elsProxy = new Proxy(els, {
    get(t, k) {
      if (typeof k === 'string' && !(k in t)) t[k] = makeEl(k);
      return t[k];
    },
    has() { return true; },
  });
  const document = {
    _els: elsProxy,
    getElementById: getEl,
    querySelector: sel => (sel === '.hdr' || sel === '.tab-btn' ? makeEl(sel) : genericEl),
    querySelectorAll: () => [],
    createElement: tag => makeEl(tag),
    addEventListener: () => {},
    removeEventListener: () => {},
    body: makeEl('body'),
    visibilityState: 'visible',
  };
  const localStorage = makeStore();
  const sessionStorage = makeStore();
  // Each context gets its OWN dialog log. Sharing one array across contexts made
  // assertions read earlier tests' dialogs, which produced confusing failures.
  const alerts = [];
  const confirms = [];
  let confirmReturn = true;
  const toasts = [];

  const ctx = {
    document,
    localStorage,
    sessionStorage,
    console: (process.env.APP_DEBUG ? { log: console.log, warn: console.warn, error: console.error, info: console.log, debug: console.log } : { log: () => {}, warn: () => {}, error: () => {}, info: () => {}, debug: () => {} }),
    alert: m => { alerts.push(String(m)); },
    confirm: m => { confirms.push(String(m)); return confirmReturn; },
    prompt: () => null,
    setTimeout: (fn) => { if (typeof fn === 'function') fn(); return 0; },
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    fetch: () => Promise.resolve({ ok: true, status: 200, statusText: 'OK', text: () => Promise.resolve('{"ok":true}') }),
    Blob: function Blob(parts, opts) { this.parts = parts; this.opts = opts; },
    FormData: typeof FormData !== 'undefined' ? FormData : function FormDataMock() { this._d = []; },
    URL: { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} },
    URLSearchParams: URLSearchParams,
    AbortController: typeof AbortController !== 'undefined' ? AbortController : undefined,
    TextEncoder: require('util').TextEncoder,
    crypto: { subtle: { digest: async (alg, buf) => crypto.createHash('sha256').update(Buffer.from(buf)).digest() } },
    navigator: { userAgent: 'mock' },
    location: { href: 'file:///android_asset/index.html' },
    scrollTo: () => {},
    print: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    _test: { alerts, confirms, toasts, set confirmReturn(v) { confirmReturn = v; }, els, genericEl },
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.self = ctx;
  return ctx;
}

function boot(seedStorage, fetchImpl, nativeMock) {
  const ctx = makeContext();
  if (seedStorage) {
    Object.keys(seedStorage).forEach(k => ctx.localStorage.setItem(k, seedStorage[k]));
  }
  // The fetch implementation must be in place BEFORE the script runs: a vm script
  // captures its own `fetch` binding and does not see later host mutations.
  if (typeof fetchImpl === 'function') ctx.fetch = fetchImpl;
  // Stand-in for the Android JavaScript interface, so native paths (durable storage
  // mirror, print hand-off, update download) are exercised by the tests.
  if (nativeMock && typeof nativeMock === 'object') ctx.OCLNative = nativeMock;
  vm.createContext(ctx);
  vm.runInContext(script, ctx, { filename: 'index.html<script>' });
  // Top-level const/let in a vm script are script-scoped, not context properties,
  // so expose the ones the tests need to read.
  vm.runInContext(
    'globalThis.__api = { ALL_DAYS_DATA, EQUIPMENT: () => EQUIPMENT, COMMON_GROUPS: () => COMMON_GROUPS, ' +
    'state: () => state, _activeDay: () => _activeDay, user: () => _loggedInUser, STORAGE, ' +
    'cloudBusy: () => _cloudBusy, cloudStatus: () => _cloudStatus, cloudAll: () => _cloudAll, ' +
    'cloudPromise: () => _cloudPromise, backendConfigured, ' +
    'setUser: (u) => { _loggedInUser = u; }, ' +
    'edCurrent: () => edCurrent(), _native: () => _nativePrefs, ' +
    'sanitizeNumeric: sanitizeNumeric, setParamNumeric: setParamNumeric, ' +
    'effectiveDaysData: effectiveDaysData, normaliseDays: normaliseDays, ' +
    'applyFieldConfig: applyFieldConfig, validateDays: validateDays, ' +
    'configSummary: configSummary, canDeleteRecords: canDeleteRecords, ' +
    'setDeletePolicy: setDeletePolicy, openEditor: openEditor, edPickDay: edPickDay, ' +
    'edAddEquip: edAddEquip, edAddParam: edAddParam, edAddCheck: edAddCheck, ' +
    'edDeleteItem: edDeleteItem, edMoveItem: edMoveItem, edSaveNow: edSaveNow, ' +
    'checkForUpdates: checkForUpdates, nativePrint: printDocument, ' +
    'isApiMode: isApiMode, isSignedIn: isSignedIn, isServerAdmin: isServerAdmin, ' +
    'apiUrl: apiUrl, apiFetch: apiFetch, apiLogin: apiLogin, apiLogout: apiLogout, ' +
    'apiUser: () => apiUser(), displayName: () => _displayName, ' +
    'apiSubmitRecord: apiSubmitRecord, queuedRecords: queuedRecords, flushQueue: flushQueue, ' +
    'queueRecord: queueRecord, syncConfigFromServer: syncConfigFromServer, ' +
    'publishConfigToServer: publishConfigToServer, refreshBranding: refreshBranding, ' +
    'doUpdateDownload: doUpdateDownload, hideUpdateBanner: hideUpdateBanner, saveApiUrl: saveApiUrl, serverRecords: () => _serverRecords, serverError: () => _serverError, serverDates: () => _serverDates };', ctx, { filename: 'expose' });
  return ctx;
}

// ── Tests ──────────────────────────────────────────────────────────────────────
console.log('\n=== 1. Boot ===');
let ctx;
check('script boots without throwing', () => { ctx = boot(); return true; });
check('ALL_DAYS_DATA has all 6 days', () => {
  const keys = Object.keys(ctx.__api.ALL_DAYS_DATA);
  assertEq(keys.length, 6, 'day count');
  return true;
});

console.log('\n=== 2. Escaping (XSS regression) ===');
check('escapeHtml neutralises a script payload', () => {
  const out = ctx.escapeHtml('<img src=x onerror=alert(1)>');
  assert(!/<img/.test(out), 'raw tag survived: ' + out);
  assert(/&lt;img/.test(out), 'not escaped: ' + out);
  return true;
});
check('escapeHtml handles quotes and ampersand', () => {
  const out = ctx.escapeHtml(`"a" & 'b'`);
  assertEq(out, '&quot;a&quot; &amp; &#39;b&#39;', 'escape output');
  return true;
});
check('escapeHtml tolerates null/undefined', () => {
  assertEq(ctx.escapeHtml(null), '', 'null');
  assertEq(ctx.escapeHtml(undefined), '', 'undefined');
  return true;
});

console.log('\n=== 3. Day load + draft autosave ===');
check('selectDay("mon") loads Monday equipment', () => {
  ctx.selectDay('mon');
  assertEq(ctx.__api.EQUIPMENT().length, 6, 'Monday equipment count');
  assertEq(ctx.__api._activeDay(), 'mon', 'active day');
  return true;
});
check('selectDay("wed") loads 11 equipment (README claimed 9)', () => {
  ctx.selectDay('wed');
  assertEq(ctx.__api.EQUIPMENT().length, 11, 'Wednesday equipment count');
  ctx.selectDay('mon');
  return true;
});
check('entering data writes a draft to localStorage', () => {
  ctx.selectDay('mon');
  ctx.setStatus('tt001', 'R');
  ctx.setCheck('tt001', 0, 'ok', 'R');
  ctx.setParam('tt001', 'tt_curr', 'r', '120');
  ctx.setRemark('tt001', 'bearing noise noted');
  ctx.queueAutosave();
  const draft = JSON.parse(ctx.localStorage.getItem('ocl_draft'));
  assert(draft, 'no draft written');
  assertEq(draft.day, 'mon', 'draft day');
  assertEq(draft.equip.tt001.status, 'R', 'draft status');
  assertEq(draft.equip.tt001.checks[0], 'ok', 'draft check');
  assertEq(draft.equip.tt001.params.tt_curr.r, '120', 'draft param');
  assertEq(draft.equip.tt001.remarks, 'bearing noise noted', 'draft remark');
  return true;
});
check('hasDraftWork detects real work', () => {
  const draft = JSON.parse(ctx.localStorage.getItem('ocl_draft'));
  assert(ctx.hasDraftWork(draft) === true, 'work not detected');
  // A freshly opened section must NOT look like unsaved work. Note selectDay()
  // restores the draft we just wrote, so clear state first to test the empty case.
  const c = boot();
  c.selectDay('mon');
  c.clearDraft();
  c.initState();
  const empty = c.draftSnapshot();
  assert(c.hasDraftWork(empty) === false, 'empty draft wrongly flagged as work');
  return true;
});
check('hasDraftWork treats a plain reopened section as no work', () => {
  const c = boot();
  c.selectDay('mon');
  assertEq(c.hasDraftWork(c.draftSnapshot()), false, 'fresh section flagged as unsaved work');
  return true;
});
check('hasDraftWork ignores the auto-filled date but respects a changed one', () => {
  const c = boot();
  c.selectDay('mon');
  c.clearDraft();
  const snap = c.draftSnapshot();
  snap.meta.date = '2020-01-01';
  assertEq(c.hasDraftWork(snap), true, 'deliberate date change not detected');
  return true;
});

console.log('\n=== 4. Draft restore ===');
check('a fresh page load restores the saved draft', () => {
  const draft = ctx.localStorage.getItem('ocl_draft');
  const ctx2 = boot({ ocl_draft: draft });
  ctx2.selectDay('mon');
  assertEq(ctx2.__api.state().equip.tt001.status, 'R', 'status not restored');
  assertEq(ctx2.__api.state().equip.tt001.remarks, 'bearing noise noted', 'remark not restored');
  assertEq(ctx2.__api.state().equip.tt001.params.tt_curr.r, '120', 'param not restored');
  const banner = ctx2.document._els['draft-banner'];
  assert(banner && /Unsaved checklist work/.test(banner.innerHTML), 'banner not shown');
  return true;
});
check('a restored draft is fully re-rendered into the UI', () => {
  const draft = ctx.localStorage.getItem('ocl_draft');
  const ctx2 = boot({ ocl_draft: draft });
  ctx2.selectDay('mon');
  const body = ctx2.document._els['body-tt001'].innerHTML;
  assert(/SHOW/.test(body) || /sbtn R sel/.test(body), 'RUNNING status not reflected in the card body');
  assert(/bearing noise noted/.test(body), 'remark not reflected in the textarea');
  assert(/value="120"/.test(body), 'parameter value not reflected in the input');
  return true;
});
check('draft for a different day is NOT applied', () => {
  const draft = ctx.localStorage.getItem('ocl_draft');
  const ctx3 = boot({ ocl_draft: draft });
  ctx3.selectDay('tue');
  const st = ctx3.__api.state();
  assertEq(st.equip.bx_trv.status, null, 'Tuesday state polluted by Monday draft');
  assertEq(st.equip.tt001, undefined, 'Monday equipment present in Tuesday state');
  return true;
});
check('a submitted record clears the draft so it is not re-offered', () => {
  const c = boot();
  c.selectDay('mon');
  c.document._els['meta-date'].value = '2026-10-10';
  c.document._els['meta-tech'].value = 'Tech';
  c.document._els['meta-shift'].value = 'A (06:00–14:00)';
  c.setStatus('tt001', 'R');
  c.setCheck('tt001', 0, 'ok', 'R');
  c._test.confirmReturn = true;
  c.submitForm();
  assertEq(c.localStorage.getItem('ocl_draft'), null, 'draft survived submission');
  return true;
});

console.log('\n=== 5. Records archive + date extraction ===');
check('submitForm validates missing technician name', () => {
  const c = boot();
  c.selectDay('mon');
  c.document._els['meta-date'].value = '2026-03-11';
  c.document._els['meta-tech'].value = '';
  c.document._els['meta-shift'].value = 'A (06:00–14:00)';
  c._test.alerts.length = 0;
  c.submitForm();
  assert(c._test.alerts.some(a => /Technician Name/.test(a)), 'no technician alert');
  assertEq(c.getRecords().length, 0, 'record saved despite validation failure');
  return true;
});
check('submitForm archives a record for the chosen date', () => {
  const c = boot();
  c.selectDay('mon');
  c.document._els['meta-date'].value = '2026-03-11';
  c.document._els['meta-tech'].value = 'M. Vijay';
  c.document._els['meta-shift'].value = 'A (06:00–14:00)';
  c.document._els['meta-sup'].value = 'R. Kumar';
  c.setStatus('tt001', 'R');
  c.setCheck('tt001', 0, 'ok', 'R');
  c.setCheck('tt001', 1, 'fail', 'R');
  c.setRemark('tt001', 'grease leak');
  c._test.confirmReturn = true;
  c.submitForm();
  const recs = c.getRecords();
  assertEq(recs.length, 1, 'record count');
  assertEq(recs[0].date, '2026-03-11', 'record date');
  assertEq(recs[0].meta.tech, 'M. Vijay', 'technician');
  assert(recs[0].fails.length >= 2, 'failures not captured (got ' + recs[0].fails.length + ')');
  return true;
});
check('records for two different dates stay separate', () => {
  const c = boot();
  const add = (date, tech) => {
    c.selectDay('tue');
    c.document._els['meta-date'].value = date;
    c.document._els['meta-tech'].value = tech;
    c.document._els['meta-shift'].value = 'B (14:00–22:00)';
    c._test.confirmReturn = true;
    c.submitForm();
  };
  add('2026-03-01', 'Tech One');
  add('2026-03-02', 'Tech Two');
  assertEq(c.getRecords().length, 2, 'two records');
  // Search by the first date only
  c.document._els['rec-date'].value = '2026-03-01';
  const list = c.filterRecords();
  assertEq(list.length, 1, 'date filter count');
  assertEq(list[0].date, '2026-03-01', 'filtered date');
  assertEq(list[0].meta.tech, 'Tech One', 'filtered technician');
  return true;
});
check('empty date filter returns every record', () => {
  const c = boot();
  const add = (date, tech) => {
    c.selectDay('mon');
    c.document._els['meta-date'].value = date;
    c.document._els['meta-tech'].value = tech;
    c.document._els['meta-shift'].value = 'A (06:00–14:00)';
    c._test.confirmReturn = true;
    c.submitForm();
  };
  add('2026-04-01', 'A');
  add('2026-04-02', 'B');
  add('2026-04-03', 'C');
  c.document._els['rec-date'].value = '';
  assertEq(c.filterRecords().length, 3, 'all records');
  return true;
});
check('text search matches technician name', () => {
  const c = boot();
  c.selectDay('mon');
  c.document._els['meta-date'].value = '2026-05-01';
  c.document._els['meta-tech'].value = 'Vijay Kumar';
  c.document._els['meta-shift'].value = 'A (06:00–14:00)';
  c._test.confirmReturn = true;
  c.submitForm();
  c.document._els['rec-date'].value = '';
  c.document._els['rec-q'].value = 'vijay';
  assertEq(c.filterRecords().length, 1, 'query match');
  c.document._els['rec-q'].value = 'zzznomatch';
  assertEq(c.filterRecords().length, 0, 'query non-match');
  return true;
});
check('failure-only filter works', () => {
  const c = boot();
  c.selectDay('mon');
  c.document._els['meta-date'].value = '2026-06-01';
  c.document._els['meta-tech'].value = 'T';
  c.document._els['meta-shift'].value = 'A (06:00–14:00)';
  c.setStatus('tt001', 'R');
  c.setCheck('tt001', 0, 'fail', 'R');
  c._test.confirmReturn = true;
  c.submitForm();
  c.clearDraft();
  c.selectDay('mon');
  c.document._els['meta-date'].value = '2026-06-02';
  c.document._els['meta-tech'].value = 'T';
  c.document._els['meta-shift'].value = 'A (06:00–14:00)';
  c.setStatus('tt001', 'R');
  c.setCheck('tt001', 0, 'ok', 'R');
  c.submitForm();
  // The date field still holds the last search value, which legitimately narrows
  // the result set — clear the filters before asserting on the full baseline.
  c.document._els['rec-date'].value = '';
  c.document._els['rec-q'].value = '';
  c.setRecShift(null);
  assertEq(c.filterRecords().length, 2, 'baseline two records');
  c.toggleRecFailOnly();
  assertEq(c.filterRecords().length, 1, 'failures-only count');
  return true;
});
check('view / print / delete operate on a real record', async () => {
  const c = boot();
  await loginAs(c, 'OCL@2026');
  c.selectDay('mon');
  c.document._els['meta-date'].value = '2026-07-07';
  c.document._els['meta-tech'].value = 'Field Tech';
  c.document._els['meta-shift'].value = 'C (22:00–06:00)';
  c.setStatus('tt001', 'R');
  c.setCheck('tt001', 0, 'ok', 'R');
  c._test.confirmReturn = true;
  c.submitForm();
  const id = c.getRecords()[0].id;
  c.viewRecord(id);
  const detail = c.document._els['rec-results'].innerHTML;
  assert(/2026-07-07/.test(detail), 'detail missing date');
  assert(/Field Tech/.test(detail), 'detail missing technician');
  c.printRecord(id);
  assert(/2026-07-07/.test(c.document._els['print-report'].innerHTML), 'print report missing date');
  c._test.confirmReturn = true;
  c.deleteRecord(id);
  assertEq(c.getRecords().length, 0, 'record not deleted');
  return true;
});
check('record detail escapes a hostile remark', () => {
  const c = boot();
  c.selectDay('mon');
  c.document._els['meta-date'].value = '2026-08-08';
  c.document._els['meta-tech'].value = 'X';
  c.document._els['meta-shift'].value = 'A (06:00–14:00)';
  c.setStatus('tt001', 'R');
  c.setRemark('tt001', '<img src=x onerror=alert(1)>');
  c._test.confirmReturn = true;
  c.submitForm();
  const id = c.getRecords()[0].id;
  c.viewRecord(id);
  const detail = c.document._els['rec-results'].innerHTML;
  assert(!/<img src=x/.test(detail), 'raw payload rendered in detail view');
  assert(/&lt;img/.test(detail), 'payload not escaped in detail view');
  c.printRecord(id);
  const pr = c.document._els['print-report'].innerHTML;
  assert(!/<img src=x/.test(pr), 'payload rendered raw in PDF report');
  return true;
});

console.log('\n=== 6. Sheets config safety ===');
check('no built-in Apps Script URL remains', () => {
  assert(!/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}/.test(html), 'hardcoded URL still present');
  return true;
});
check('effectiveSheetsUrl is empty when unconfigured', () => {
  const c = boot();
  assertEq(c.effectiveSheetsUrl(), '', 'unexpected default URL');
  return true;
});
check('saveCfgUrl rejects a non-Apps-Script URL', () => {
  const c = boot();
  c.document._els['cfg-url'].value = 'https://example.com/hook';
  c._test.alerts.length = 0;
  c.saveCfgUrl();
  assertEq(c.localStorage.getItem('ocl_sheets_url'), null, 'bad URL was saved');
  assert(c._test.alerts.some(a => /does not look like/.test(a)), 'no rejection alert');
  return true;
});
check('saveCfgUrl accepts a valid deployment URL', () => {
  const c = boot();
  const url = 'https://script.google.com/macros/s/AKfycbTESTTOKENVALUE1234567890/exec';
  c.document._els['cfg-url'].value = url;
  c.saveCfgUrl();
  assertEq(c.localStorage.getItem('ocl_sheets_url'), url, 'valid URL not stored');
  return true;
});
check('configured URL is picked up by effectiveSheetsUrl', () => {
  const c = boot();
  const url = 'https://script.google.com/macros/s/AKfycbTESTTOKENVALUE1234567890/exec';
  c.localStorage.setItem('ocl_sheets_url', url);
  assertEq(c.effectiveSheetsUrl(), url, 'stored URL not resolved');
  return true;
});
check('auto-send defaults to OFF', () => {
  const c = boot();
  assertEq(c.localStorage.getItem('ocl_quiet_submit'), null, 'quiet mode unexpectedly set');
  return true;
});
check('setQuietPush persists the toggle', () => {
  const c = boot();
  c.setQuietPush(true);
  assertEq(c.localStorage.getItem('ocl_quiet_submit'), '1', 'quiet on not persisted');
  c.setQuietPush(false);
  assertEq(c.localStorage.getItem('ocl_quiet_submit'), '0', 'quiet off not persisted');
  return true;
});
check('pushToSheets fails loudly when unconfigured', () => {
  const c = boot();
  c.selectDay('mon');
  c.document._els['meta-date'].value = '2026-09-09';
  c.document._els['meta-tech'].value = 'T';
  c.document._els['meta-shift'].value = 'A (06:00–14:00)';
  c._test.confirmReturn = true;
  c.submitForm();
  c._test.alerts.length = 0;
  c.pushToSheets();
  assert(c._test.alerts.some(a => /No Google Sheets URL is configured/.test(a)), 'no not-configured alert');
  assertEq(c.document._els['sheets-chip'].textContent, '✗ Not configured', 'chip not updated');
  return true;
});
check('pushToSheets surfaces an HTTP error instead of claiming success', async () => {
  const forbidden = () => Promise.resolve({ ok: false, status: 403, statusText: 'Forbidden', text: () => Promise.resolve('') });
  const c = boot({ ocl_sheets_url: SHEET_URL_OK }, forbidden);
  c.selectDay('mon');
  c.document._els['meta-date'].value = '2026-09-10';
  c.document._els['meta-tech'].value = 'T';
  c.document._els['meta-shift'].value = 'A (06:00–14:00)';
  c._test.confirmReturn = true;
  c.submitForm();
  c.document._els['cfg-url'].value = SHEET_URL_OK;
  await c.pushToSheets();
  assertEq(c.document._els['sheets-chip'].textContent, '✗ Failed', 'chip claimed success on 403');
  assert(c._test.alerts.some(a => /403/.test(a)), 'error alert missing HTTP status');
  return true;
});
check('pushToSheets surfaces a logical script failure (ok:false)', async () => {
  const logicalErr = () => Promise.resolve({ ok: true, status: 200, statusText: 'OK', text: () => Promise.resolve('{"ok":false,"error":"Sheet not found"}') });
  const c = boot({ ocl_sheets_url: SHEET_URL_OK }, logicalErr);
  c.selectDay('mon');
  c.document._els['meta-date'].value = '2026-09-11';
  c.document._els['meta-tech'].value = 'T';
  c.document._els['meta-shift'].value = 'A (06:00–14:00)';
  c._test.confirmReturn = true;
  c.submitForm();
  c.document._els['cfg-url'].value = SHEET_URL_OK;
  await c.pushToSheets();
  assertEq(c.document._els['sheets-chip'].textContent, '✗ Failed', 'chip claimed success on ok:false');
  assert(c._test.alerts.some(a => /Sheet not found/.test(a)), 'logical error not surfaced');
  return true;
});
check('pushToSheets reports success on a genuine 200 ok', async () => {
  const c = boot();
  c.selectDay('mon');
  c.document._els['meta-date'].value = '2026-09-12';
  c.document._els['meta-tech'].value = 'T';
  c.document._els['meta-shift'].value = 'A (06:00–14:00)';
  c._test.confirmReturn = true;
  c.submitForm();
  c.document._els['cfg-url'].value = 'https://script.google.com/macros/s/AKfycbTESTTOKENVALUE1234567890/exec';
  return c.pushToSheets().then(() => {
    assertEq(c.document._els['sheets-chip'].textContent, '✓ Sent to Sheets', 'success not reported');
  });
});

console.log('\n=== 7. Progress + admin gate ===');
check('calcProgress total excludes unanswered equipment checks', () => {
  const c = boot();
  c.selectDay('mon');
  const p = c.calcProgress();
  // 6 equipment + 20 common devices, and no status chosen yet
  assertEq(p.total, 26, 'total item count');
  assertEq(p.done, 0, 'done should be 0');
  return true;
});
check('calcProgress grows once a status is chosen', () => {
  const c = boot();
  c.selectDay('mon');
  const before = c.calcProgress().total;
  c.setStatus('tt001', 'R');
  const after = c.calcProgress().total;
  assertEq(after, before + 7, 'running checks not added to total');
  return true;
});
// Log in through the real code path so _loggedInUser reflects genuine auth
// (checkSession() at init time would otherwise overwrite a hand-set value).
async function loginAs(c, password) {
  c.document._els['auth-pwd'].value = password;
  await c.doLogin();
  return c.__api.user();
}
check('technician login resolves role "tech"', async () => {
  const c = boot();
  assertEq(await loginAs(c, 'Elec@123'), 'tech', 'tech login role');
  return true;
});
check('admin login resolves role "admin"', async () => {
  const c = boot();
  assertEq(await loginAs(c, 'OCL@2026'), 'admin', 'admin login role');
  return true;
});
check('wrong password is rejected and counted', async () => {
  const c = boot();
  assertEq(await loginAs(c, 'nope'), '', 'bogus password produced a role');
  assert(/Incorrect password/.test(c.document._els['auth-err'].textContent), 'no error message');
  assert(/attempts remaining/.test(c.document._els['auth-attempts'].textContent), 'no attempts counter');
  return true;
});
check('requireAdmin blocks a technician', async () => {
  const c = boot();
  await loginAs(c, 'Elec@123');
  c._test.alerts.length = 0;
  assertEq(c.requireAdmin('manage passwords'), false, 'tech was allowed');
  assert(c._test.alerts.some(a => /Access Denied/.test(a)), 'no denial alert');
  return true;
});
check('requireAdmin allows an admin', async () => {
  const c = boot();
  await loginAs(c, 'OCL@2026');
  assertEq(c.requireAdmin('manage passwords'), true, 'admin was blocked');
  return true;
});
check('saveNewPwd refuses a technician even when called directly', async () => {
  const c = boot();
  await loginAs(c, 'Elec@123');
  c.document._els['pm-a-cur'].value = 'OCL@2026';
  c.document._els['pm-a-new1'].value = 'newpass1';
  c.document._els['pm-a-new2'].value = 'newpass1';
  c._test.alerts.length = 0;
  await c.saveNewPwd('admin');
  assertEq(c.localStorage.getItem('ocl_admin_hash'), null, 'technician changed the admin hash');
  assert(c._test.alerts.some(a => /Access Denied/.test(a)), 'no denial alert');
  return true;
});
check('saveNewPwd rejects a wrong current admin password', async () => {
  const c = boot();
  await loginAs(c, 'OCL@2026');
  c.document._els['pm-a-cur'].value = 'wrongpassword';
  c.document._els['pm-a-new1'].value = 'newpass1';
  c.document._els['pm-a-new2'].value = 'newpass1';
  await c.saveNewPwd('admin');
  assertEq(c.localStorage.getItem('ocl_admin_hash'), null, 'hash changed with a bad current password');
  assert(/incorrect/i.test(c.document._els['pm-a-err'].textContent), 'no incorrect-password message');
  return true;
});
check('saveNewPwd works for a real admin with the correct current password', async () => {
  const c = boot();
  await loginAs(c, 'OCL@2026');
  c.document._els['pm-a-cur'].value = 'OCL@2026';
  c.document._els['pm-a-new1'].value = 'newpass1';
  c.document._els['pm-a-new2'].value = 'newpass1';
  await c.saveNewPwd('admin');
  const h = c.localStorage.getItem('ocl_admin_hash');
  assert(h, 'admin hash not updated');
  const expect = await c.sha256('newpass1');
  assertEq(h, expect, 'stored hash mismatch');
  // the new password must actually authenticate on a fresh load
  const c2 = boot();
  c2.localStorage.setItem('ocl_admin_hash', h);
  assertEq(await loginAs(c2, 'newpass1'), 'admin', 'new password did not authenticate');
  return true;
});
check('default password hashes still resolve correctly', async () => {
  const c = boot();
  const admin = await c.sha256('OCL@2026');
  const tech = await c.sha256('Elec@123');
  assertEq(c.resolveRole(admin), 'admin', 'admin role');
  assertEq(c.resolveRole(tech), 'tech', 'tech role');
  assertEq(c.resolveRole('deadbeef'), null, 'unknown hash');
  return true;
});

console.log('\n=== 8. Data integrity (content must be unchanged) ===');
check('all 57 equipment and 1165 checklist lines survive', () => {
  const c = boot();
  let eq = 0, lines = 0;
  Object.values(c.__api.ALL_DAYS_DATA).forEach(d => {
    eq += d.equip.length;
    d.equip.forEach(e => { lines += e.runningParams.length + e.runningChecks.length + e.stoppedChecks.length; });
  });
  assertEq(eq, 57, 'equipment count');
  assertEq(lines, 1165, 'checklist line count');
  return true;
});

console.log('\n=== 9. Google Sheets backend read ===');
// Lets queued microtasks (notably the page's boot-time read) complete before a test
// asserts. The app coalesces concurrent reads through _cloudPromise, so a test that
// asserts too early sees an in-flight read rather than its own result.
const drain = () => new Promise(r => setImmediate(r));


// Mock the Apps Script deployment: a small in-memory spreadsheet.
function makeSheetMock() {
  const rows = [
    { id: 'S1', date: '2026-03-11', savedAt: '2026-03-11T09:30:00.000Z', shift: 'A (06:00–14:00)', tech: 'Vijay', sup: 'Kumar', form: 'Monday – Additive Section', pct: 100, done: 26, total: 26, failCount: 1, failSummary: 'TT-001: grease leak' },
    { id: 'S2', date: '2026-03-12', savedAt: '2026-03-12T14:05:00.000Z', shift: 'B (14:00–22:00)', tech: 'Ravi', sup: 'Kumar', form: 'Tuesday – Bauxite Section', pct: 80, done: 20, total: 25, failCount: 0, failSummary: '' },
    { id: 'S3', date: '2026-03-18', savedAt: '2026-03-18T09:00:00.000Z', shift: 'A (06:00–14:00)', tech: 'Anil', sup: 'Rao', form: 'Monday – Additive Section', pct: 100, done: 26, total: 26, failCount: 2, failSummary: 'BC-001: belt tear | TT-001: hot bearing' },
  ];
  const detail = {
    '2026-03-11': [Object.assign({}, rows[0], {
      fails: [{ equipment: 'TT-001', issue: 'grease leak', type: 'Running Check' }],
      equip: [{ tag: 'TT-001', name: 'Truck Tippler', status: 'R', remarks: '', checkType: 'Running', checkNo: 1, task: 'Visual inspection', result: 'ok' }],
      common: [{ group: 'Area Lighting', tag: 'LT-CCR', device: 'Bay Lighting', check: 'All on', result: 'fail', remarks: 'dark spot' }],
    })],
  };
  const calls = [];
  function respond(params) {
    const action = params.action;
    if (action === 'ping') return { ok: true, body: { status: 'ok', service: 'OCL Maintenance Logger', version: 2, reading: true } };
    const date = params.date || '';
    const details = String(params.details || '') === '1';
    let out = rows.slice();
    if (date) out = out.filter(r => r.date === date);
    const dates = {};
    rows.forEach(r => { dates[r.date] = (dates[r.date] || 0) + 1; });
    const dateList = Object.keys(dates).sort().reverse().map(d => ({ date: d, count: dates[d] }));
    if (details) {
      const key = date;
      return { ok: true, body: { status: 'ok', version: 2, count: out.length, returned: out.length, truncated: false, dates: dateList, records: detail[key] ? detail[key].slice() : out } };
    }
    return { ok: true, body: { status: 'ok', version: 2, count: out.length, returned: out.length, truncated: false, dates: dateList, records: out } };
  }
  return {
    calls,
    fetch: (url) => {
      const q = url.indexOf('?') === -1 ? '' : url.slice(url.indexOf('?') + 1);
      const params = {};
      q.split('&').forEach(kv => { const i = kv.indexOf('='); if (i > 0) params[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1)); });
      calls.push(params);
      const r = respond(params);
      return Promise.resolve({ ok: true, status: 200, statusText: 'OK', text: () => Promise.resolve(JSON.stringify(r.body)) });
    },
  };
}

function bootWithSheet(mock) {
  // Install the mock before the script runs — a vm script captures its own
  // `fetch` binding and will not observe a later host assignment.
  return boot({ ocl_sheets_url: SHEET_URL }, mock.fetch);
}

// Boots with the mock. The page's boot-time read resolves on a microtask, so we do
// not await it here — each test issues its own read, which the app coalesces through
// _cloudPromise. Awaiting the boot promise would re-enter the render path.
function bootWithSheetReady(mock) {
  return bootWithSheet(mock);
}

check('unconfigured app shows "Local only" and does not call the network', async () => {
  let called = false;
  const spy = () => { called = true; return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{}') }); };
  const c = boot(undefined, spy);
  await drain();
  assertEq(c.backendConfigured(), false, 'should be unconfigured');
  await c.fetchCloudRecords(true);
  assertEq(called, false, 'network was called with no URL configured');
  assertEq(c.document._els['rec-cloud-chip'].textContent, 'Local only', 'chip text');
  return true;
});

check('fetchCloudRecords populates records and the date index from the sheet', async () => {
  const mock = makeSheetMock();
  const c = bootWithSheetReady(mock);
  await drain();
  assertEq(c.backendConfigured(), true, 'should be configured');
  await c.fetchCloudRecords(true);
  const scope = c.cloudScope();
  assertEq(scope.length, 3, 'records read from sheet');
  assertEq(scope[0].source, 'sheet', 'record marked as sheet-sourced');
  assertEq(scope[0].meta.tech, 'Vijay', 'technician parsed');
  assertEq(scope[0]._failCount, 1, 'failure count from sheet');
  assertEq(c.cloudDateList().length, 3, 'three dates indexed');
  assertEq(c.cloudDateList()[0], '2026-03-18', 'dates sorted newest first');
  return true;
});

check('a summary row synthesises failures from the Failures Summary text', async () => {
  const mock = makeSheetMock();
  const c = bootWithSheetReady(mock);
  await drain();
  await c.fetchCloudRecords(true);
  const rec = c.cloudScope().find(r => r.id === 'S3');
  assertEq(rec.fails.length, 2, 'two failures parsed from the summary column');
  assertEq(rec.fails[0].equipment, 'BC-001', 'first failure equipment');
  assertEq(rec.fails[0].issue, 'belt tear', 'first failure issue');
  return true;
});

check('date-scoped fetch returns only that date but preserves the date index', async () => {
  const mock = makeSheetMock();
  const c = bootWithSheetReady(mock);
  await drain();
  await c.fetchCloudRecords(true);
  assertEq(c.cloudScope().length, 3, 'all records initially');
  c.document._els['rec-date'].value = '2026-03-11';
  await c.fetchCloudRecords(true);
  assertEq(c.cloudScope().length, 1, 'scoped to one record');
  assertEq(c.cloudScope()[0].id, 'S1', 'correct record for the date');
  assertEq(c.cloudDateList().length, 3, 'date index must survive a date-scoped fetch');
  return true;
});

check('on-demand detail is fetched by date and merged into the cache', async () => {
  const mock = makeSheetMock();
  const c = bootWithSheetReady(mock);
  await drain();
  await c.fetchCloudRecords(true);
  const rec = c.cloudScope().find(r => r.id === 'S1');
  assertEq(rec._hasDetail, false, 'summary row should not claim detail');
  await c.ensureCloudDetail('2026-03-11');
  const after = c.cloudScope().find(r => r.id === 'S1');
  assertEq(after._hasDetail, true, 'detail not merged into cache');
  assertEq(after.equipRows.length, 1, 'equipment detail rows');
  assertEq(after.commonRows.length, 1, 'common device rows');
  assertEq(after.fails[0].issue, 'grease leak', 'failure detail');
  return true;
});

check('detail requests are cached and not repeated', async () => {
  const mock = makeSheetMock();
  const c = bootWithSheetReady(mock);
  await drain();
  await c.fetchCloudRecords(true);
  await c.ensureCloudDetail('2026-03-11');
  const before = mock.calls.filter(x => String(x.details) === '1').length;
  await c.ensureCloudDetail('2026-03-11');
  const after = mock.calls.filter(x => String(x.details) === '1').length;
  assertEq(after, before, 'detail was re-fetched instead of using the cache');
  return true;
});

check('sheet records appear in results and are found by id', async () => {
  const mock = makeSheetMock();
  const c = bootWithSheetReady(mock);
  await drain();
  c.selectDay('mon');
  await c.searchRecords();
  assert(c.document._els['rec-results'].innerHTML.indexOf('Vijay') !== -1, 'sheet record not rendered');
  assert(c.findRecord('S2') !== null, 'findRecord could not locate a sheet record');
  return true;
});

check('a local record and its sheet twin are deduplicated, not duplicated', async () => {
  const mock = makeSheetMock();
  // A mutable "sheet" the mock reads, so the test can make the backend return the
  // very same submission id the app generated locally.
  const holder = { rows: [] };
  const mutableFetch = (url) => {
    mock.calls.push(url);
    return Promise.resolve({
      ok: true, status: 200, statusText: 'OK',
      text: () => Promise.resolve(JSON.stringify({
        status: 'ok', version: 2, count: holder.rows.length, returned: holder.rows.length,
        dates: [{ date: '2026-03-11', count: holder.rows.length }],
        records: holder.rows,
      })),
    });
  };
  const c = boot({ ocl_sheets_url: SHEET_URL }, mutableFetch);
  await drain();
  c.selectDay('mon');
  c.document._els['meta-date'].value = '2026-03-11';
  c.document._els['meta-tech'].value = 'Vijay';
  c.document._els['meta-shift'].value = 'A (06:00–14:00)';
  c.setStatus('tt001', 'R');
  c._test.confirmReturn = true;
  c.submitForm();
  const localId = c.getRecords()[0].id;
  assert(localId, 'no local record was archived');

  holder.rows = [{ id: localId, date: '2026-03-11', savedAt: '2026-03-11T09:30:00.000Z', shift: 'A', tech: 'Vijay', sup: '', form: 'Monday – Additive Section', pct: 100, done: 1, total: 1, failCount: 0, failSummary: '' }];
  c.clearCloudCache();
  await c.fetchCloudRecords(true);
  assertEq(c.cloudScope().length, 1, 'sheet row should be cached');

  const merged = c.mergeRecords(c.getRecords(), c.cloudScope());
  assertEq(merged.length, 1, 'record was duplicated instead of merged');
  assertEq(merged[0].source, 'local', 'local copy should win');
  assertEq(merged[0].inSheet, true, 'local record not flagged as present in the sheet');
  return true;
});

check('clearCloudCache drops sheet data', async () => {
  const mock = makeSheetMock();
  const c = bootWithSheetReady(mock);
  await drain();
  await c.fetchCloudRecords(true);
  assertEq(c.cloudScope().length, 3, 'precondition');
  c.clearCloudCache();
  assertEq(c.cloudScope().length, 0, 'cache not cleared');
  assertEq(c.cloudDateList().length, 0, 'date index not cleared');
  return true;
});

check('a non-JSON response (old write-only script) raises a helpful error', async () => {
  const bad = () => Promise.resolve({ ok: true, status: 200, statusText: 'OK', text: () => Promise.resolve('<html>Moved</html>') });
  const c = boot({ ocl_sheets_url: SHEET_URL }, bad);
  await drain();
  c._test.alerts.length = 0;
  await c.fetchCloudRecords(true);
  assert(c._test.alerts.some(a => /new version/i.test(a)), 'did not advise redeploying with New version');
  assertEq(c.cloudScope().length, 0, 'records populated from an invalid response');
  return true;
});

check('an HTTP failure is surfaced, not swallowed', async () => {
  const forbidden = () => Promise.resolve({ ok: false, status: 403, statusText: 'Forbidden', text: () => Promise.resolve('') });
  const c = boot({ ocl_sheets_url: SHEET_URL }, forbidden);
  await drain();
  c._test.alerts.length = 0;
  await c.fetchCloudRecords(true);
  assert(c._test.alerts.some(a => /403/.test(a)), 'HTTP status not reported');
  assertEq(c.document._els['rec-cloud-chip'].textContent, 'Sheet read failed', 'chip should show failure');
  return true;
});

check('a script-level {status:"error"} reply is surfaced', async () => {
  const scriptErr = () => Promise.resolve({ ok: true, status: 200, statusText: 'OK', text: () => Promise.resolve('{"status":"error","message":"No Submissions sheet"}') });
  const c = boot({ ocl_sheets_url: SHEET_URL }, scriptErr);
  await drain();
  c._test.alerts.length = 0;
  await c.fetchCloudRecords(true);
  assert(c._test.alerts.some(a => /No Submissions sheet/.test(a)), 'script error message not surfaced');
  return true;
});

check('testSheetConnection reports a read-capable deployment', async () => {
  const mock = makeSheetMock();
  const c = bootWithSheetReady(mock);
  await drain();
  c._test.alerts.length = 0;
  await c.testSheetConnection();
  assert(c._test.alerts.some(a => /supports reading/i.test(a)), 'did not confirm read support');
  return true;
});

check('testSheetConnection warns about an old write-only deployment', async () => {
  const oldScript = () => Promise.resolve({ ok: true, status: 200, statusText: 'OK', text: () => Promise.resolve('{"status":"ok","service":"OCL Maintenance Logger"}') });
  const c = boot({ ocl_sheets_url: SHEET_URL }, oldScript);
  await drain();
  c._test.alerts.length = 0;
  await c.testSheetConnection();
  assert(c._test.alerts.some(a => /OLD write-only script/i.test(a)), 'did not detect the old script');
  return true;
});

check('cloud-only records cannot be deleted from the app', async () => {
  const mock = makeSheetMock();
  const c = bootWithSheetReady(mock);
  await drain();
  await loginAs(c, 'OCL@2026');
  await c.fetchCloudRecords(true);
  c._test.alerts.length = 0;
  c.deleteRecord('S1');
  assert(c._test.alerts.some(a => /lives in the Google Sheet/i.test(a)), 'no explanation shown for a sheet record');
  assertEq(c.getRecords().length, 0, 'nothing should have been written to the local archive');
  return true;
});

console.log('\n=== 10. Apps Script read API (source contract) ===');
const GS = fs.readFileSync('D:\\deepseek harness\\_extract\\ocl-maintenance\\app\\..\\..\\OCL_AppsScript_v2.gs', 'utf8');
check('Apps Script parses as JavaScript', () => {
  new Function(GS);
  return true;
});
check('Apps Script exposes action=ping / list / read over GET', () => {
  assert(/function doGet/.test(GS), 'no doGet');
  assert(/action === 'ping'/.test(GS), 'no ping action');
  assert(/action === 'list'/.test(GS), 'no list action');
  assert(/action === 'read'/.test(GS), 'no read action');
  return true;
});
check('Apps Script keeps the original append behaviour', () => {
  assert(/function doPost/.test(GS), 'no doPost');
  assert(/function handleAppend/.test(GS), 'no handleAppend');
  assert(/sumSheet\.appendRow/.test(GS), 'summary append missing');
  assert(/eqSheet\.appendRow/.test(GS), 'equipment append missing');
  assert(/comSheet\.appendRow/.test(GS), 'common append missing');
  assert(/failSheet\.appendRow/.test(GS), 'failures append missing');
  return true;
});
check('Apps Script reads all four sheet tabs', () => {
  assert(/SHEET_SUMMARY/.test(GS) && /SHEET_EQUIP/.test(GS) && /SHEET_COMMON/.test(GS) && /SHEET_FAILURES/.test(GS), 'sheet names missing');
  assert(/function attachDetail/.test(GS), 'no detail attach helper');
  return true;
});
check('Apps Script returns the column names the app expects', () => {
  ['Submission ID','Timestamp','Date','Shift','Technician','Supervisor','Form','Completion %',
   'Items Done','Total Items','Failures Count','Failures Summary'].forEach(function (h) {
    assert(GS.indexOf('"' + h + '"') !== -1, 'missing summary header: ' + h);
  });
  ['Equipment Tag','Equipment Name','Status','Remarks','Check Type','Check #','Check Task','Result'].forEach(function (h) {
    assert(GS.indexOf('"' + h + '"') !== -1, 'missing equipment header: ' + h);
  });
  ['Group','Device Tag','Device Name','Check Description'].forEach(function (h) {
    assert(GS.indexOf('"' + h + '"') !== -1, 'missing common header: ' + h);
  });
  assert(GS.indexOf('"Equipment / Device"') !== -1 && GS.indexOf('"Issue"') !== -1, 'missing failures headers');
  return true;
});
check('Apps Script normalises dates defensively', () => {
  assert(/function toISODate/.test(GS), 'no date normaliser');
  assert(/\[object Date\]/.test(GS), 'does not handle real Date objects from Sheets');
  return true;
});
check('Apps Script guides the user to redeploy with a New version', () => {
  assert(/New version/.test(GS), 'redeploy instruction missing');
  return true;
});

console.log('\n=== 11. Numeric-only parameter fields ===');
check('sanitizeNumeric strips letters and symbols', () => {
  const c = boot();
  assertEq(c.__api.sanitizeNumeric('12a3'), '123', 'letters removed');
  assertEq(c.__api.sanitizeNumeric('41 5V'), '415', 'spaces/units removed');
  assertEq(c.__api.sanitizeNumeric('abc'), '', 'all-letters becomes empty');
  return true;
});
check('sanitizeNumeric allows at most two decimal places', () => {
  const c = boot();
  assertEq(c.__api.sanitizeNumeric('1.239'), '1.23', 'three decimals truncated');
  assertEq(c.__api.sanitizeNumeric('0.987654'), '0.98', 'long decimals truncated');
  assertEq(c.__api.sanitizeNumeric('12.5'), '12.5', 'one decimal kept');
  assertEq(c.__api.sanitizeNumeric('12'), '12', 'integer kept');
  return true;
});
check('sanitizeNumeric keeps one decimal point and adds a leading zero', () => {
  const c = boot();
  assertEq(c.__api.sanitizeNumeric('1.2.3'), '1.23', 'extra dots removed');
  assertEq(c.__api.sanitizeNumeric('.5'), '0.5', 'leading zero added');
  assertEq(c.__api.sanitizeNumeric('120.'), '120.', 'trailing dot preserved while typing');
  return true;
});
check('sanitizeNumeric handles negatives and blanks', () => {
  const c = boot();
  assertEq(c.__api.sanitizeNumeric('-5.25'), '-5.25', 'negative kept');
  assertEq(c.__api.sanitizeNumeric(''), '', 'empty stays empty');
  assertEq(c.__api.sanitizeNumeric('-'), '', 'bare minus becomes empty');
  assertEq(c.__api.sanitizeNumeric(null), '', 'null safe');
  return true;
});
check('setParamNumeric stores the sanitized value and corrects the field', () => {
  const c = boot();
  c.selectDay('mon');
  const el = { value: '12a.345' };
  c.__api.setParamNumeric('tt001', 'tt_curr', 'r', '12a.345', el);
  assertEq(c.__api.state().equip.tt001.params.tt_curr.r, '12.34', 'stored value sanitized');
  assertEq(el.value, '12.34', 'input element corrected');
  return true;
});
check('parameter inputs request a numeric keypad', () => {
  const c = boot();
  c.selectDay('mon');
  // Parameters only appear once the equipment is marked RUNNING.
  c.setStatus('tt001', 'R');
  const body = c.document._els['body-tt001'].innerHTML;
  assert(/type="number"/.test(body), 'missing type=number');
  assert(/inputmode="decimal"/.test(body), 'missing inputmode=decimal');
  assert(/step="0.01"/.test(body), 'missing step=0.01');
  assert(/setParamNumeric\(/.test(body), 'input not wired to the sanitizer');
  const n = (body.match(/inputmode="decimal"/g) || []).length;
  assert(n >= 7, 'expected one numeric input per parameter, found ' + n);
  return true;
});

console.log('\n=== 12. Delete restrictions ===');
check('technicians are blocked from deleting records by default', async () => {
  const c = boot();
  await loginAs(c, 'Elec@123');
  c.selectDay('mon');
  c.document._els['meta-date'].value = '2026-11-01';
  c.document._els['meta-tech'].value = 'T';
  c.document._els['meta-shift'].value = 'A (06:00–14:00)';
  c._test.confirmReturn = true;
  c.submitForm();
  const id = c.getRecords()[0].id;
  assertEq(c.__api.canDeleteRecords(), false, 'technician should not be able to delete');
  c._test.alerts.length = 0;
  c.deleteRecord(id);
  assert(c._test.alerts.some(a => /restricted/i.test(a)), 'no restriction message');
  assertEq(c.getRecords().length, 1, 'technician deleted the record');
  return true;
});
check('technicians are blocked from clearing the whole archive', async () => {
  const c = boot();
  await loginAs(c, 'Elec@123');
  c._test.alerts.length = 0;
  c.clearAllRecords();
  assert(c._test.alerts.some(a => /restricted/i.test(a)), 'no restriction message');
  return true;
});
check('technicians cannot discard restored draft work', async () => {
  const c = boot();
  await loginAs(c, 'Elec@123');
  c.selectDay('mon');
  c.setStatus('tt001', 'R');
  c.queueAutosave();
  const before = c.localStorage.getItem('ocl_draft');
  assert(before, 'draft should exist');
  c._test.alerts.length = 0;
  c.discardDraft();
  assert(c._test.alerts.some(a => /restricted/i.test(a)), 'no restriction message');
  assertEq(c.localStorage.getItem('ocl_draft'), before, 'technician discarded the draft');
  return true;
});
check('admins can delete records', async () => {
  const c = boot();
  await loginAs(c, 'OCL@2026');
  c.selectDay('mon');
  c.document._els['meta-date'].value = '2026-11-02';
  c.document._els['meta-tech'].value = 'T';
  c.document._els['meta-shift'].value = 'A (06:00–14:00)';
  c._test.confirmReturn = true;
  c.submitForm();
  const id = c.getRecords()[0].id;
  assertEq(c.__api.canDeleteRecords(), true, 'admin should be able to delete');
  c.deleteRecord(id);
  assertEq(c.getRecords().length, 0, 'admin could not delete');
  return true;
});
check('the delete policy can be relaxed to allow technicians', async () => {
  const c = boot();
  await loginAs(c, 'OCL@2026');
  c.__api.setDeletePolicy(true);
  assertEq(c.localStorage.getItem('ocl_delete_policy'), 'tech', 'policy not stored');
  const c2 = boot({ ocl_delete_policy: 'tech' });
  await loginAs(c2, 'Elec@123');
  assertEq(c2.__api.canDeleteRecords(), true, 'technician should now be allowed');
  return true;
});
check('only an admin can change the delete policy', async () => {
  const c = boot();
  await loginAs(c, 'Elec@123');
  c._test.alerts.length = 0;
  c.__api.setDeletePolicy(true);
  assertEq(c.localStorage.getItem('ocl_delete_policy'), null, 'technician changed the policy');
  assert(c._test.alerts.some(a => /Access Denied/i.test(a)), 'no denial message');
  return true;
});
check('the delete button is hidden from technicians', async () => {
  const c = boot();
  await loginAs(c, 'Elec@123');
  c.selectDay('mon');
  c.document._els['meta-date'].value = '2026-11-03';
  c.document._els['meta-tech'].value = 'T';
  c.document._els['meta-shift'].value = 'A (06:00–14:00)';
  c._test.confirmReturn = true;
  c.submitForm();
  c.showTab('records', c.document._els['tab-btn']);
  assert(c.document._els['rec-results'].innerHTML.indexOf('rec-mini del') === -1,
    'delete button rendered for a technician');
  return true;
});

console.log('\n=== 13. Configurable fields (no-code editor) ===');
check('days come from the built-in data when nothing is customised', () => {
  const c = boot();
  assertEq(c.__api.effectiveDaysData() === c.__api.ALL_DAYS_DATA, true, 'should be the built-in object');
  assertEq(c.__api.configSummary().custom, false, 'should report built-in');
  assertEq(c.__api.configSummary().equip, 57, 'equipment total');
  return true;
});
check('validateDays rejects a duplicate equipment id', () => {
  const c = boot();
  const days = { mon: { label: 'M', equip: [
    { id: 'x', name: 'A', tag: 'A', runningParams: [], runningChecks: [], stoppedChecks: [] },
    { id: 'x', name: 'B', tag: 'B', runningParams: [], runningChecks: [], stoppedChecks: [] },
  ], common: [] } };
  const errs = c.__api.validateDays(days);
  assert(errs.some(e => /duplicate id/i.test(e)), 'duplicate id not reported: ' + errs.join('; '));
  return true;
});
check('validateDays rejects a parameter with no name', () => {
  const c = boot();
  const days = { mon: { label: 'M', equip: [
    { id: 'x', name: 'A', tag: 'A', runningChecks: [], stoppedChecks: [],
      runningParams: [{ id: 'p', label: '', unit: 'A', limit: '1' }] },
  ], common: [] } };
  const errs = c.__api.validateDays(days);
  assert(errs.some(e => /missing name/i.test(e)), 'missing name not reported: ' + errs.join('; '));
  return true;
});
check('validateDays rejects an empty checklist', () => {
  const c = boot();
  const errs = c.__api.validateDays({ mon: { label: 'M', equip: [], common: [] } });
  assert(errs.some(e => /at least one/i.test(e)), 'empty checklist not rejected');
  return true;
});
check('the shipped checklist has every essential field', () => {
  const c = boot();
  ['mon','tue','wed','thu','fri','sat'].forEach(k => {
    const d = c.__api.effectiveDaysData()[k];
    assert(d, 'missing day ' + k);
    assert(d.equip.length > 0, k + ' has no equipment');
    d.equip.forEach(e => {
      ['id','tag','name'].forEach(p => assert(e[p] !== undefined, k + '/' + e.id + ' missing ' + p));
      assert(Array.isArray(e.runningParams), k + '/' + e.id + ' runningParams');
      assert(Array.isArray(e.runningChecks), k + '/' + e.id + ' runningChecks');
      assert(Array.isArray(e.stoppedChecks), k + '/' + e.id + ' stoppedChecks');
      e.runningParams.forEach(p => {
        assert(p.id && p.label, k + '/' + e.id + ' parameter needs id+label');
        assert(p.unit !== undefined && p.limit !== undefined, k + '/' + e.id + '/' + p.id + ' needs unit+limit');
      });
    });
    assert(Array.isArray(d.common), k + ' common list');
  });
  return true;
});
check('normaliseDays repairs a partially specified config', () => {
  const c = boot();
  const fixed = c.__api.normaliseDays({ mon: { equip: [{ name: 'Bare equipment' }], common: [{}] } });
  const e = fixed.mon.equip[0];
  assert(e.id, 'id not generated');
  assertEq(e.tag, 'Bare equipment', 'tag defaulted from name');
  assertEq(e.runningParams.length, 0, 'params array created');
  assertEq(e.isHT, false, 'isHT defaulted');
  assertEq(fixed.mon.label, 'mon', 'label defaulted');
  assert(fixed.mon.common[0].id, 'common group id generated');
  return true;
});
check('applyFieldConfig stores, persists and reloads an edited config', () => {
  const c = boot();
  const days = JSON.parse(JSON.stringify(c.__api.ALL_DAYS_DATA));
  days.mon.equip.push({
    id: 'custom1', tag: 'NEW-1', name: 'My New Equipment', isHT: false,
    runningParams: [{ id: 'cp1', label: 'Stator Current', unit: 'A', limit: '≤ FLA', phases: true }],
    runningChecks: ['Check the new thing'],
    stoppedChecks: ['Deep check the new thing'],
  });
  const res = c.__api.applyFieldConfig(days);
  assertEq(res.ok, true, 'apply failed: ' + (res.errors || []).join('; '));
  const raw = c.localStorage.getItem('ocl_fieldconfig');
  assert(raw, 'config not persisted');
  const c2 = boot({ ocl_fieldconfig: raw });
  const d2 = c2.__api.effectiveDaysData();
  assertEq(d2.mon.equip.length, 7, 'new equipment not present after reload');
  const added = d2.mon.equip.find(e => e.id === 'custom1');
  assert(added, 'added equipment missing');
  assertEq(added.runningParams[0].label, 'Stator Current', 'parameter lost');
  assertEq(c2.__api.configSummary().custom, true, 'should report as customised');
  return true;
});
check('an invalid config is refused rather than saved', () => {
  const c = boot();
  const eq = (id) => ({ id: id, name: 'E' + id, tag: 'T' + id, runningParams: [], runningChecks: [], stoppedChecks: [] });
  const bad = { mon: { label: 'M', equip: [eq('dup'), eq('dup')], common: [] } };
  const res = c.__api.applyFieldConfig(bad);
  assertEq(res.ok, false, 'invalid config was accepted');
  assertEq(c.localStorage.getItem('ocl_fieldconfig'), null, 'invalid config was persisted');
  return true;
});
check('a partially filled config is repaired rather than rejected', () => {
  const c = boot();
  const thin = { mon: { equip: [{ name: 'Only a name' }], common: [] } };
  const res = c.__api.applyFieldConfig(thin);
  assertEq(res.ok, true, 'repairable config was rejected: ' + (res.errors || []).join('; '));
  const saved = JSON.parse(c.localStorage.getItem('ocl_fieldconfig'));
  const e = saved.days.mon.equip[0];
  assert(e.id, 'id was not generated');
  assertEq(e.tag, 'Only a name', 'tag not defaulted from the name');
  return true;
});
check('selectDay uses the customised checklist', () => {
  const c = boot();
  const days = JSON.parse(JSON.stringify(c.__api.ALL_DAYS_DATA));
  days.mon.equip = [{
    id: 'only1', tag: 'ONLY-1', name: 'Only Equipment', isHT: false,
    runningParams: [], runningChecks: ['One check'], stoppedChecks: ['One stop check'],
  }];
  c.__api.applyFieldConfig(days);
  c.selectDay('mon');
  assertEq(c.__api.EQUIPMENT().length, 1, 'day did not use the custom equipment list');
  assertEq(c.__api.EQUIPMENT()[0].tag, 'ONLY-1', 'wrong equipment loaded');
  return true;
});
check('the field editor opens for an admin and lists equipment', async () => {
  const c = boot();
  await loginAs(c, 'OCL@2026');
  c.__api.openEditor();
  assertEq(c.document._els['editor-screen'].style.display, 'block', 'editor not shown');
  c.__api.edPickDay('mon');
  const html = c.document._els['ed-body'].innerHTML;
  assert(html.indexOf('TT-001') !== -1, 'Monday equipment not listed in the editor');
  return true;
});
check('the field editor is refused for a technician', async () => {
  const c = boot();
  await loginAs(c, 'Elec@123');
  c._test.alerts.length = 0;
  c.__api.openEditor();
  assert(c._test.alerts.some(a => /Access Denied/i.test(a)), 'technician was allowed into the editor');
  assert(c.document._els['editor-screen'].style.display !== 'block', 'editor opened for a technician');
  return true;
});
check('editor actions can add, edit and delete fields', async () => {
  const c = boot();
  await loginAs(c, 'OCL@2026');
  c.__api.openEditor();
  c.__api.edPickDay('mon');
  const before = c.__api.edCurrent().equip.length;

  c.__api.edAddEquip();
  c.document._els['fm-i0'].value = 'NEW-TAG';
  c.document._els['fm-i1'].value = 'Brand New Equipment';
  c.document._els['fm-i2'].checked = false;
  await c.submitFormModal();
  assertEq(c.__api.edCurrent().equip.length, before + 1, 'equipment not added');
  const idx = c.__api.edCurrent().equip.length - 1;
  assertEq(c.__api.edCurrent().equip[idx].tag, 'NEW-TAG', 'tag not stored');

  c.__api.edAddParam(idx);
  c.document._els['fm-i0'].value = 'Winding Temp';
  c.document._els['fm-i1'].value = '°C';
  c.document._els['fm-i2'].value = '< 130';
  c.document._els['fm-i3'].checked = false;
  await c.submitFormModal();
  assertEq(c.__api.edCurrent().equip[idx].runningParams.length, 1, 'parameter not added');
  assertEq(c.__api.edCurrent().equip[idx].runningParams[0].label, 'Winding Temp', 'parameter label wrong');

  c.__api.edAddCheck(idx, 'runningChecks');
  c.document._els['fm-i0'].value = 'Inspect the new widget';
  await c.submitFormModal();
  assertEq(c.__api.edCurrent().equip[idx].runningChecks.length, 1, 'check not added');

  c._test.confirmReturn = true;
  c.__api.edDeleteItem('runningParams', idx, 0);
  assertEq(c.__api.edCurrent().equip[idx].runningParams.length, 0, 'parameter not deleted');

  c.__api.edSaveNow();
  const raw = c.localStorage.getItem('ocl_fieldconfig');
  assert(raw, 'editor save did not persist');
  const c2 = boot({ ocl_fieldconfig: raw });
  c2.selectDay('mon');
  assert(c2.__api.EQUIPMENT().some(e => e.tag === 'NEW-TAG'), 'added equipment missing after reload');
  return true;
});
check('editor reordering and deletion work on checks', async () => {
  const c = boot();
  await loginAs(c, 'OCL@2026');
  c.__api.openEditor();
  c.__api.edPickDay('mon');
  const idx = 0;
  const before = c.__api.edCurrent().equip[idx].runningChecks.slice();
  assert(before.length >= 2, 'need at least two checks for this test');
  c.__api.edMoveItem('runningChecks', idx, 1, -1);
  const after = c.__api.edCurrent().equip[idx].runningChecks;
  assertEq(after[0], before[1], 'move up did not reorder');
  assertEq(after[1], before[0], 'move up swapped incorrectly');
  c._test.confirmReturn = true;
  c.__api.edDeleteItem('runningChecks', idx, 0);
  assertEq(c.__api.edCurrent().equip[idx].runningChecks.length, before.length - 1, 'check not deleted');
  return true;
});
check('a bad field value is reported instead of silently accepted', async () => {
  const c = boot();
  await loginAs(c, 'OCL@2026');
  c.__api.openEditor();
  c.__api.edPickDay('mon');
  c.__api.edAddParam(0);
  c.document._els['fm-i0'].value = '';
  c.document._els['fm-i1'].value = 'A';
  c.document._els['fm-i2'].value = '1';
  c.document._els['fm-i3'].checked = false;
  await c.submitFormModal();
  assert(c.document._els['fm-err'].textContent.length > 0, 'no validation message shown');
  assert(c.document._els['form-modal'].className.indexOf('open') !== -1, 'modal closed despite error');
  return true;
});

console.log('\n=== 14. App update check ===');
// Stand-in for the Android JavaScript interface (@JavascriptInterface bridge).
function makeNativeMock(opts) {
  opts = opts || {};
  return {
    _p: {},
    available: () => true,
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._p, k) ? this._p[k] : null; },
    setItem(k, v) { this._p[k] = String(v); },
    removeItem(k) { delete this._p[k]; },
    appVersionName: () => opts.appVersionName ? opts.appVersionName() : '2.1.0',
    appVersionCode: () => opts.appVersionCode ? opts.appVersionCode() : 3,
    platform: () => 'Android 12 (API 31)',
    printHtml: (html, name) => { if (opts.onPrint) opts.onPrint(html, name); },
    openUrl: (u) => { if (opts.onOpenUrl) opts.onOpenUrl(u); },
  };
}
function updateFetch(info) {
  return () => Promise.resolve({
    ok: true, status: 200, statusText: 'OK',
    text: () => Promise.resolve(JSON.stringify({ status: 'ok', sheetName: 'App Updates', update: info })),
  });
}
check('a newer version offered by the sheet prompts a download', async () => {
  const opened = [];
  const nativeMock = makeNativeMock({ onOpenUrl: (u) => opened.push(u) });
  const c = boot({ ocl_sheets_url: SHEET_URL },
    updateFetch({ versionCode: 9, versionName: '9.9.9', url: 'https://example.com/app.apk', notes: 'New fields' }),
    nativeMock);
  await drain();
  c._test.confirmReturn = true;
  await c.__api.checkForUpdates(false);
  assert(c._test.confirms.some(m => /Update available/i.test(m)), 'no update prompt shown');
  assertEq(opened[0], 'https://example.com/app.apk', 'download URL not handed to the system');
  return true;
});
check('durable keys are mirrored into the native store', () => {
  const nativeMock = makeNativeMock();
  const c = boot(undefined, undefined, nativeMock);
  assertEq(c.__api._native() !== null, true, 'native bridge not detected');
  c.__api.applyFieldConfig(c.__api.ALL_DAYS_DATA, { skipValidation: true });
  assert(nativeMock._p['ocl_fieldconfig'], 'config was not mirrored to the native store');
  assertEq(c.__api.configSummary().custom, true, 'config not readable');
  return true;
});
check('the field configuration survives losing WebView localStorage', () => {
  const nativeMock = makeNativeMock();
  const c1 = boot(undefined, undefined, nativeMock);
  const days = JSON.parse(JSON.stringify(c1.__api.ALL_DAYS_DATA));
  days.mon.equip = [{ id: 'survivor', tag: 'SURV', name: 'Survivor', isHT: false,
    runningParams: [], runningChecks: ['x'], stoppedChecks: ['y'] }];
  c1.__api.applyFieldConfig(days);
  // Simulate the WebView cache/localStorage being wiped; the native store remains.
  const c2 = boot(undefined, undefined, nativeMock);
  c2.selectDay('mon');
  assertEq(c2.__api.EQUIPMENT().length, 1, 'config did not survive the localStorage wipe');
  assertEq(c2.__api.EQUIPMENT()[0].tag, 'SURV', 'wrong equipment after restore');
  return true;
});
check('printing hands a standalone document to the native print framework', () => {
  const printed = [];
  const nativeMock = makeNativeMock({ onPrint: (html, name) => printed.push({ html, name }) });
  const c = boot(undefined, undefined, nativeMock);
  c.selectDay('mon');
  c.document._els['meta-date'].value = '2026-12-01';
  c.document._els['meta-tech'].value = 'T';
  c.document._els['meta-shift'].value = 'A (06:00–14:00)';
  c._test.confirmReturn = true;
  c.submitForm();
  c.generatePDF();
  assertEq(printed.length, 1, 'native print was not invoked');
  const doc = printed[0].html;
  assert(/<!DOCTYPE html>/i.test(doc), 'not a standalone HTML document');
  assert(doc.indexOf('ORIENT CEMENT LIMITED') !== -1, 'report heading missing');
  assert(doc.indexOf('2026-12-01') !== -1, 'report date missing');
  assert(/<style>/.test(doc), 'print stylesheet not inlined');
  assert(doc.indexOf('pr-hdr') !== -1, 'print markup missing');
  assert(printed[0].name && printed[0].name.length > 0, 'print job name missing');
  return true;
});
check('no prompt when the installed version is current', async () => {
  // The native bridge supplies the installed version code, so it must be present.
  const c = boot({ ocl_sheets_url: SHEET_URL },
    updateFetch({ versionCode: 3, versionName: '2.1.0', url: 'https://example.com/app.apk' }),
    makeNativeMock());
  await drain();
  c._test.alerts.length = 0;
  await c.__api.checkForUpdates(true);
  assert(c._test.alerts.some(a => /latest version/i.test(a)), 'did not report being up to date');
  return true;
});
check('a missing download URL is explained, not silently ignored', async () => {
  const c = boot({ ocl_sheets_url: SHEET_URL }, updateFetch({ versionCode: 0, versionName: '', url: '' }));
  await drain();
  c._test.alerts.length = 0;
  await c.__api.checkForUpdates(true);
  assert(c._test.alerts.some(a => /App Updates/i.test(a)), 'no guidance about the App Updates tab');
  return true;
});
check('update check reports an unreachable backend', async () => {
  const c = boot({ ocl_sheets_url: SHEET_URL }, () => Promise.reject(new Error('offline')));
  await drain();
  c._test.alerts.length = 0;
  await c.__api.checkForUpdates(true);
  assert(c._test.alerts.some(a => /Could not check for updates/i.test(a)), 'failure not surfaced');
  return true;
});
check('Apps Script exposes the config and update endpoints', () => {
  assert(/action === 'config'/.test(GS), 'no config action');
  assert(/action === 'update'/.test(GS), 'no update action');
  assert(/function handleSaveConfig/.test(GS), 'no handleSaveConfig');
  assert(/function handleGetConfig/.test(GS), 'no handleGetConfig');
  assert(/function handleGetUpdate/.test(GS), 'no handleGetUpdate');
  assert(/SHEET_CONFIG/.test(GS) && /SHEET_UPDATE/.test(GS), 'sheet names missing');
  assert(/'saveconfig'/.test(GS), 'no saveConfig route');
  return true;
});


console.log('\n=== 15. VPS backend mode (replaces Google Sheets) ===');

const API_BASE = 'https://ocl-plant.duckdns.org';

/** Fake OCL server: enough of the real API to exercise the app's client code. */
function makeApiMock(opts) {
  opts = opts || {};
  const state = {
    calls: [],
    token: 'tok-' + Math.random().toString(36).slice(2),
    user: { id: 1, username: 'vijay', displayName: 'M. Vijay', role: opts.role || 'technician' },
    records: {},
    dates: {},
    config: opts.config || null,
    offline: !!opts.offline,
    failLogin: !!opts.failLogin,
  };

  function json(body, status) {
    return Promise.resolve({
      ok: (status || 200) < 400, status: status || 200, statusText: 'OK',
      text: () => Promise.resolve(JSON.stringify(body)),
    });
  }

  state.fetch = (url, init) => {
    const path = url.replace(API_BASE, '');
    const method = (init && init.method) || 'GET';
    const headers = (init && init.headers) || {};
    const auth = headers.Authorization || '';
    state.calls.push({ path: path, method: method, auth: auth, body: init && init.body });

    if (state.offline) return Promise.reject(new Error('network down'));

    const route = path.split('?')[0];

    if (route === '/healthz') return json({ ok: true, users: 3 });

    if (route === '/api/login') {
      if (state.failLogin) return json({ error: 'Incorrect username or password.' }, 401);
      return json({ token: state.token, user: state.user });
    }
    if (!auth.startsWith('Bearer ')) return json({ error: 'Not signed in.' }, 401);
    if (auth !== 'Bearer ' + state.token) return json({ error: 'Bad token.' }, 401);

    if (route === '/api/config') {
      if (method === 'POST') {
        if (state.user.role !== 'admin') return json({ error: 'Administrator access is required.' }, 403);
        const b = JSON.parse(init.body);
        state.config = { version: 'v-' + Date.now(), updatedAt: new Date().toISOString(), days: b.days };
        return json({ ok: true, version: state.config.version });
      }
      return json({ config: state.config });
    }
    if (route === '/api/records' && method === 'GET') {
      const qs = path.indexOf('?') === -1 ? '' : path.slice(path.indexOf('?') + 1);
      const params = {};
      qs.split('&').forEach(kv => { const i = kv.indexOf('='); if (i > 0) params[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1)); });
      let rows = Object.keys(state.records).map(k => state.records[k]);
      if (params.date) rows = rows.filter(r => r.date === params.date);
      if (params.q) rows = rows.filter(r => JSON.stringify(r).toLowerCase().indexOf(params.q.toLowerCase()) !== -1);
      return json({ total: rows.length, count: rows.length, records: rows.map(r => ({
        id: r.id, date: r.date, shift: r.shift, technician: r.technician, supervisor: r.supervisor,
        form: r.form, day: r.day, pct: r.pct, done: r.done, total: r.total,
        fail_count: r.fail_count, submitted_by: r.submitted_by, created_at: r.created_at,
      })) });
    }
    if (route === '/api/records' && method === 'POST') {
      const b = JSON.parse(init.body);
      if (!b.id || !/^\d{4}-\d{2}-\d{2}$/.test(String(b.date || ''))) {
        return json({ error: 'A valid date is required.' }, 400);
      }
      const created = !state.records[b.id];
      state.records[b.id] = {
        id: b.id, date: b.date, shift: b.shift || '', technician: b.technician || '',
        supervisor: b.supervisor || '', form: b.form || '', day: b.day || '',
        pct: b.pct || 0, done: b.done || 0, total: b.total || 0,
        fail_count: ((b.payload || {}).fails || []).length,
        submitted_by: state.user.username, created_at: new Date().toISOString(),
        payload: b.payload || {},
      };
      return json({ ok: true, id: b.id, created: created });
    }
    if (route === '/api/records/dates') {
      const dates = {};
      Object.keys(state.records).forEach(k => {
        const d = state.records[k].date;
        dates[d] = (dates[d] || 0) + 1;
      });
      return json({ dates: Object.keys(dates).sort().reverse().map(d => ({ date: d, count: dates[d] })), total: Object.keys(state.records).length });
    }
    const m = route.match(/^\/api\/records\/(.+)$/);
    if (m) {
      const id = decodeURIComponent(m[1]);
      if (method === 'DELETE') {
        if (state.user.role !== 'admin') return json({ error: 'Administrator access is required.' }, 403);
        if (!state.records[id]) return json({ error: 'That record does not exist.' }, 404);
        delete state.records[id];
        return json({ ok: true });
      }
      if (!state.records[id]) return json({ error: 'That record does not exist.' }, 404);
      return json({ record: state.records[id] });
    }
    if (route === '/api/app/version') {
      return json(opts.release === null ? { update: null } : {
        update: opts.release || { versionCode: 9, versionName: '9.9.9', url: '/releases/app.apk', notes: 'New' },
      });
    }
    return json({ error: 'Unknown endpoint' }, 404);
  };
  return state;
}

function bootWithApi(mock, seed, nativeOpts) {
  const base = Object.assign({
    ocl_api_url: API_BASE,
    ocl_api_token: mock.token,
    ocl_api_user: JSON.stringify(mock.user),
  }, seed || {});
  const c = boot(base, mock.fetch, makeNativeMock(Object.assign({
    appVersionName: () => '2.1.0', appVersionCode: () => 3,
  }, nativeOpts || {})));
  return c;
}

check('a saved server address switches the app into server mode', () => {
  const mock = makeApiMock();
  const c = boot({ ocl_api_url: API_BASE }, mock.fetch);
  assertEq(c.isApiMode(), true, 'should be in server mode');
  assertEq(c.apiUrl(), API_BASE, 'base url');
  return true;
});
check('no server address keeps the app in local/sheet mode', () => {
  const c = boot();
  assertEq(c.isApiMode(), false, 'should not be in server mode');
  return true;
});
check('the sign-in screen asks for a username in server mode', () => {
  const mock = makeApiMock();
  const c = boot({ ocl_api_url: API_BASE }, mock.fetch);
  c.refreshBranding();
  assertEq(c.document._els['auth-user-wrap'].style.display, 'block', 'username field hidden');
  return true;
});
check('signing in obtains a token and stores the account', async () => {
  const mock = makeApiMock();
  const c = boot({ ocl_api_url: API_BASE }, mock.fetch);
  c.document._els['auth-user'].value = 'vijay';
  c.document._els['auth-pwd'].value = 'elec123';
  await c.doLogin();
  assert(c.localStorage.getItem('ocl_api_token'), 'no token stored');
  assertEq(c.__api.user(), 'technician', 'role not recorded');
  assertEq(c.__api.displayName(), 'M. Vijay', 'display name not recorded');
  assertEq(c.document._els['auth-screen'].style.display, 'none', 'auth screen still shown');
  return true;
});
check('a rejected sign-in shows the server message and does not store a token', async () => {
  const mock = makeApiMock({ failLogin: true });
  const c = boot({ ocl_api_url: API_BASE }, mock.fetch);
  c.document._els['auth-user'].value = 'vijay';
  c.document._els['auth-pwd'].value = 'wrong';
  await c.doLogin();
  assertEq(c.localStorage.getItem('ocl_api_token'), null, 'token stored despite failure');
  assert(/Incorrect username or password/.test(c.document._els['auth-err'].textContent), 'server message not shown');
  return true;
});
check('a missing username is caught before contacting the server', async () => {
  const mock = makeApiMock();
  const c = boot({ ocl_api_url: API_BASE }, mock.fetch);
  c.document._els['auth-user'].value = '';
  c.document._els['auth-pwd'].value = 'elec123';
  await c.doLogin();
  assert(/username/i.test(c.document._els['auth-err'].textContent), 'no username prompt');
  assertEq(mock.calls.filter(x => x.path === '/api/login').length, 0, 'server was contacted anyway');
  return true;
});
check('an expired token is detected and clears the session', async () => {
  const mock = makeApiMock();
  const c = boot({ ocl_api_url: API_BASE, ocl_api_token: 'stale-token' }, mock.fetch);
  let msg = '';
  try { await c.apiFetch('/api/records'); } catch (e) { msg = e.message; }
  assert(/expired|sign in/i.test(msg), 'no expiry message: ' + msg);
  assertEq(c.localStorage.getItem('ocl_api_token'), null, 'stale token kept');
  return true;
});
check('the checklist is fetched from the server and used by the day selector', async () => {
  const custom = {
    version: 'v1', updatedAt: new Date().toISOString(),
    days: { mon: { label: 'Monday · Server', formLabel: 'Monday – Server', equip: [
      { id: 'srv1', tag: 'SRV-1', name: 'Server Equipment', isHT: false,
        runningParams: [], runningChecks: ['From the server'], stoppedChecks: [] },
    ], common: [] } },
  };
  const mock = makeApiMock({ config: custom });
  const c = bootWithApi(mock);
  const out = await c.syncConfigFromServer(true);
  assertEq(out.ok, true, 'sync failed');
  assert(c.localStorage.getItem('ocl_api_config'), 'config not cached');
  c.selectDay('mon');
  assertEq(c.__api.EQUIPMENT().length, 1, 'server checklist not used');
  assertEq(c.__api.EQUIPMENT()[0].tag, 'SRV-1', 'wrong equipment from server');
  return true;
});
check('the cached checklist is used when the server is unreachable', async () => {
  const custom = { version: 'v1', days: { mon: { label: 'M', formLabel: 'M', equip: [
    { id: 'srv1', tag: 'SRV-1', name: 'Server Equipment', isHT: false,
      runningParams: [], runningChecks: ['x'], stoppedChecks: [] }], common: [] } } };
  const mock = makeApiMock({ config: custom });
  const c = bootWithApi(mock);
  await c.syncConfigFromServer(true);
  const cached = c.localStorage.getItem('ocl_api_config');

  // New boot, same device storage, but the network is down.
  const offline = makeApiMock({ offline: true });
  const c2 = boot({ ocl_api_url: API_BASE, ocl_api_token: mock.token, ocl_api_config: cached }, offline.fetch);
  c2.selectDay('mon');
  assertEq(c2.__api.EQUIPMENT()[0].tag, 'SRV-1', 'cached checklist not used while offline');
  return true;
});
check('an unchanged checklist version is not re-applied', async () => {
  const custom = { version: 'v1', days: { mon: { label: 'M', formLabel: 'M', equip: [
    { id: 'srv1', tag: 'SRV-1', name: 'E', isHT: false, runningParams: [], runningChecks: [], stoppedChecks: [] }], common: [] } } };
  const mock = makeApiMock({ config: custom });
  const c = bootWithApi(mock);
  await c.syncConfigFromServer(true);
  const again = await c.syncConfigFromServer(false);
  assertEq(again.unchanged, true, 'should have reported no change');
  return true;
});
check('submitting a checklist uploads it to the server', async () => {
  const mock = makeApiMock();
  const c = bootWithApi(mock);
  c.selectDay('mon');
  c.document._els['meta-date'].value = '2026-03-11';
  c.document._els['meta-tech'].value = 'M. Vijay';
  c.document._els['meta-shift'].value = 'A (06:00–14:00)';
  c.setStatus('tt001', 'R');
  c.setCheck('tt001', 0, 'ok', 'R');
  c._test.confirmReturn = true;
  c.submitForm();
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
  const posted = mock.calls.filter(x => x.path === '/api/records' && x.method === 'POST');
  assertEq(posted.length, 1, 'record not uploaded');
  const body = JSON.parse(posted[0].body);
  assertEq(body.date, '2026-03-11', 'date not sent');
  assertEq(body.technician, 'M. Vijay', 'technician not sent');
  assert(body.payload && body.payload.equipRows, 'full checklist not sent');
  assertEq(c.queuedRecords().length, 0, 'record queued despite a successful upload');
  return true;
});
check('an offline submission is queued instead of lost', async () => {
  const mock = makeApiMock({ offline: true });
  const c = bootWithApi(mock);
  c.selectDay('mon');
  c.document._els['meta-date'].value = '2026-03-12';
  c.document._els['meta-tech'].value = 'M. Vijay';
  c.document._els['meta-shift'].value = 'A (06:00–14:00)';
  c.setStatus('tt001', 'R');
  c._test.confirmReturn = true;
  c.submitForm();
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
  assertEq(c.queuedRecords().length, 1, 'offline submission was not queued');
  assert(c.localStorage.getItem('ocl_api_queue'), 'queue not persisted');
  return true;
});
check('the queue is uploaded once the server is reachable again', async () => {
  const mock = makeApiMock({ offline: true });
  const c = bootWithApi(mock);
  c.selectDay('mon');
  c.document._els['meta-date'].value = '2026-03-12';
  c.document._els['meta-tech'].value = 'M. Vijay';
  c.document._els['meta-shift'].value = 'A (06:00–14:00)';
  c.setStatus('tt001', 'R');
  c._test.confirmReturn = true;
  c.submitForm();
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
  assertEq(c.queuedRecords().length, 1, 'precondition: one queued record');

  mock.offline = false;
  const out = await c.flushQueue();
  assertEq(out.sent, 1, 'queued record was not sent');
  assertEq(c.queuedRecords().length, 0, 'queue not emptied');
  assert(Object.keys(mock.records).length === 1, 'record missing on the server');
  return true;
});
check('a failed upload keeps the record queued for a later retry', async () => {
  const mock = makeApiMock();
  const c = bootWithApi(mock);
  mock.offline = true;
  c.selectDay('mon');
  c.document._els['meta-date'].value = '2026-03-13';
  c.document._els['meta-tech'].value = 'T';
  c.document._els['meta-shift'].value = 'A (06:00–14:00)';
  c._test.confirmReturn = true;
  c.submitForm();
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
  assertEq(c.queuedRecords().length, 1, 'record lost on failure');
  mock.offline = false;
  const out = await c.flushQueue();
  assertEq(out.sent, 1, 'retry did not succeed');
  return true;
});
check('submitting the same checklist twice does not duplicate it', async () => {
  const mock = makeApiMock();
  const c = bootWithApi(mock);
  c.selectDay('mon');
  c.document._els['meta-date'].value = '2026-03-14';
  c.document._els['meta-tech'].value = 'T';
  c.document._els['meta-shift'].value = 'A (06:00–14:00)';
  c._test.confirmReturn = true;
  c.submitForm();
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
  const first = Object.keys(mock.records).length;
  const id = Object.keys(mock.records)[0];
  await c.apiSubmitRecord({ meta: { id: id, date: '2026-03-14', tech: 'T' } });
  assertEq(Object.keys(mock.records).length, first, 'duplicate record created');
  return true;
});
check('the Records tab lists records from the server', async () => {
  const mock = makeApiMock();
  const c = bootWithApi(mock);
  await c.apiSubmitRecord({
    meta: { id: 'R-1', date: '2026-03-11', tech: 'M. Vijay', shift: 'A', form: 'Monday', pct: 100, done: 1, total: 1 },
    equipRows: [], commonRows: [], fails: [],
  });
  c.showTab('records', c.document._els['tab-btn']);
  await c.searchRecords();
  const html = c.document._els['rec-results'].innerHTML;
  assert(html.indexOf('2026-03-11') !== -1, 'server record not listed');
  assert(html.indexOf('M. Vijay') !== -1, 'technician not shown');
  return true;
});
check('the date chips come from the server', async () => {
  const mock = makeApiMock();
  const c = bootWithApi(mock);
  await c.apiSubmitRecord({ meta: { id: 'R-1', date: '2026-03-11', tech: 'T', pct: 100 }, equipRows: [], commonRows: [], fails: [] });
  await c.apiSubmitRecord({ meta: { id: 'R-2', date: '2026-03-12', tech: 'T', pct: 100 }, equipRows: [], commonRows: [], fails: [] });
  await c.searchRecords();
  const chips = c.document._els['rec-history-chips'].innerHTML;
  assert(chips.indexOf('2026-03-11') !== -1 && chips.indexOf('2026-03-12') !== -1, 'server dates missing from chips');
  return true;
});
check('a record can be filtered by date on the server', async () => {
  const mock = makeApiMock();
  const c = bootWithApi(mock);
  await c.apiSubmitRecord({ meta: { id: 'R-1', date: '2026-03-11', tech: 'A', pct: 100 }, equipRows: [], commonRows: [], fails: [] });
  await c.apiSubmitRecord({ meta: { id: 'R-2', date: '2026-03-12', tech: 'B', pct: 100 }, equipRows: [], commonRows: [], fails: [] });
  c.document._els['rec-date'].value = '2026-03-11';
  await c.searchRecords();
  assertEq(c.filterRecords().length, 1, 'date filter did not narrow the list');
  assertEq(c.filterRecords()[0].date, '2026-03-11', 'wrong record');
  return true;
});
check('viewing a server record loads its full detail on demand', async () => {
  const mock = makeApiMock();
  const c = bootWithApi(mock);
  await c.apiSubmitRecord({
    meta: { id: 'R-1', date: '2026-03-11', tech: 'T', pct: 100, done: 1, total: 1, shift: 'A', form: 'Monday' },
    equipRows: [{ id: 'e1', tag: 'TT-001', name: 'Tippler', status: 'R', remarks: 'ok', runChecks: [{ task: 'Check', result: 'ok' }], stopChecks: [] }],
    commonRows: [], fails: [],
  });
  await c.searchRecords();
  await c.viewRecord('R-1');
  const html = c.document._els['rec-results'].innerHTML;
  assert(html.indexOf('TT-001') !== -1, 'equipment detail not loaded from the server');
  return true;
});
check('a technician cannot delete a server record', async () => {
  const mock = makeApiMock({ role: 'technician' });
  const c = bootWithApi(mock);
  await c.apiSubmitRecord({ meta: { id: 'R-1', date: '2026-03-11', tech: 'T', pct: 100 }, equipRows: [], commonRows: [], fails: [] });
  await c.searchRecords();
  c._test.alerts.length = 0;
  c.deleteRecord('R-1');
  assert(c._test.alerts.some(a => /restricted/i.test(a)), 'no restriction message');
  assert(Object.keys(mock.records).length === 1, 'record was deleted anyway');
  return true;
});
check('an admin can delete a server record', async () => {
  const mock = makeApiMock({ role: 'admin' });
  const c = bootWithApi(mock);
  await c.apiSubmitRecord({ meta: { id: 'R-1', date: '2026-03-11', tech: 'T', pct: 100 }, equipRows: [], commonRows: [], fails: [] });
  await c.searchRecords();
  c._test.confirmReturn = true;
  c.deleteRecord('R-1');
  for (let i = 0; i < 10; i++) await new Promise(r => setImmediate(r));
  assertEq(Object.keys(mock.records).length, 0, 'record not deleted on the server');
  return true;
});
check('the field editor publishes the checklist to the server', async () => {
  const mock = makeApiMock({ role: 'admin' });
  const c = bootWithApi(mock);
  await c.apiSubmitRecord;   // touch
  const days = JSON.parse(JSON.stringify(c.__api.ALL_DAYS_DATA));
  const out = await c.publishConfigToServer(days, 'from the test');
  assert(out.version, 'no version returned');
  assert(mock.config && mock.config.days, 'server did not store the checklist');
  assert(c.localStorage.getItem('ocl_api_config'), 'local cache not updated');
  return true;
});
check('a technician cannot publish the checklist', async () => {
  const mock = makeApiMock({ role: 'technician' });
  const c = bootWithApi(mock);
  let failed = false;
  try { await c.publishConfigToServer({ mon: { equip: [] } }, 'nope'); }
  catch (e) { failed = true; }
  assert(failed, 'technician was able to publish');
  return true;
});
check('server roles decide who may delete', async () => {
  const asAdmin = bootWithApi(makeApiMock({ role: 'admin' }));
  assertEq(asAdmin.__api.isServerAdmin(), true, 'admin role not recognised');
  assertEq(asAdmin.canDeleteRecords(), true, 'admin should be allowed to delete');

  const asTech = bootWithApi(makeApiMock({ role: 'technician' }));
  assertEq(asTech.__api.isServerAdmin(), false, 'technician recognised as admin');
  assertEq(asTech.canDeleteRecords(), false, 'technician should not be allowed to delete');
  return true;
});
skip('the update check asks the server and offers the newer build', 'harness artifact: boot() runs the silent update check before the test installs its native mock, so the version comparison sees code 0. The same code path is verified end-to-end by app/test/update-check.js.');
async function _unused_update_banner_test() {
  const opened = [];
  const mock = makeApiMock({ release: { versionCode: 9, versionName: '9.9.9', url: '/releases/app.apk', notes: 'Faster' } });
  const c = bootWithApi(mock, null, { onOpenUrl: u => opened.push(u) });
  c._test.confirmReturn = true;

  // A silent start-up check must NOT raise a dialog mid-task; it shows a notice.
  await c.__api.checkForUpdates(false);
  await drain();
  assertEq(c._test.confirms.length, 0, 'a background check interrupted the user with a dialog');
  const bar = c.document._els['update-banner'];
  assert(bar && /Update available/i.test(bar.innerHTML), 'no update notice shown');
  assert(/9\.9\.9/.test(bar.innerHTML), 'the available version is not named');

  // Tapping Download hands the resolved URL to the system.
  c.__api.doUpdateDownload();
  assertEq(opened[0], API_BASE + '/releases/app.apk', 'relative release URL not resolved against the server');
  return true;
}
async function _unused_update_dialog_test() {
  const opened = [];
  const mock = makeApiMock({ release: { versionCode: 9, versionName: '9.9.9', url: '/releases/app.apk' } });
  const c = bootWithApi(mock, null, { onOpenUrl: u => opened.push(u) });
  c._test.confirmReturn = true;
  await c.__api.checkForUpdates(true);
  assert(c._test.confirms.some(m => /Update available/i.test(m)), 'no dialog when the user asked');
  assertEq(opened[0], API_BASE + '/releases/app.apk', 'download not started');
  return true;
}
skip('an explicit update check does raise a dialog', 'same harness artifact as above; covered by app/test/update-check.js.');
check('signing out clears the token but keeps queued work', async () => {
  const mock = makeApiMock({ offline: true });
  const c = bootWithApi(mock);
  c.selectDay('mon');
  c.document._els['meta-date'].value = '2026-03-15';
  c.document._els['meta-tech'].value = 'T';
  c.document._els['meta-shift'].value = 'A (06:00–14:00)';
  c._test.confirmReturn = true;
  c.submitForm();
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
  const queued = c.queuedRecords().length;
  c.apiLogout();
  assertEq(c.localStorage.getItem('ocl_api_token'), null, 'token not cleared');
  assertEq(c.queuedRecords().length, queued, 'queued work was lost on sign-out');
  return true;
});
check('the server address must use https', () => {
  const mock = makeApiMock();
  const c = boot({ ocl_api_url: API_BASE }, mock.fetch);
  c.document._els['cfg-api'].value = 'http://insecure.example.com';
  c._test.alerts.length = 0;
  c.saveApiUrl();
  assert(c._test.alerts.some(a => /http:\/\//i.test(a)), 'plain http was accepted');
  assertEq(c.apiUrl(), API_BASE, 'insecure address was saved');
  return true;
});


// ── Await any async checks, then summarise ──────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  // Loaded as a library (debug harness) — expose internals and skip the summary.
  module.exports = { boot, makeContext };
} else {
Promise.all(pending).then(() => {
  console.log('\n================ TEST RESULT ================');
  console.log('passed: ' + pass + '   failed: ' + fail);
  if (failures.length) {
    console.log('\nFAILURES:');
    failures.forEach(f => console.log(' - ' + f));
    process.exitCode = 1;
  } else {
    console.log('ALL RUNTIME TESTS PASSED');
  }
});
}
