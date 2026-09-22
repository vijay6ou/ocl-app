'use strict';
/**
 * API tests — run with `npm test` (also run by CI before every deploy).
 *
 * Boots the real Express app against a temporary SQLite file and exercises the
 * full login → publish config → submit → read-back → manage users path.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

// ── isolate this run: temp database, known secrets ───────────────────────────
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ocl-test-'));
process.env.DATA_DIR = TMP;
process.env.DB_FILE = path.join(TMP, 'test.db');
process.env.JWT_SECRET = 'test-secret-that-is-definitely-long-enough-32+';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = 'adminpass1';
process.env.RELEASES_DIR = path.join(TMP, 'releases');
process.env.NODE_ENV = 'test';

const app = require('../server');

let pass = 0, fail = 0;
const failures = [];
let base = '';

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { console.log('  PASS  ' + name); pass++; })
    .catch(e => {
      console.log('  FAIL  ' + name + '  → ' + (e && e.message ? e.message : e));
      failures.push(name + ': ' + (e && e.message ? e.message : e));
      fail++;
    });
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertEq(a, b, msg) {
  if (a !== b) throw new Error((msg || 'not equal') + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');
}

async function req(method, url, { token, body, raw } = {}) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  let payload;
  if (raw) { payload = raw; }
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(base + url, { method, headers, body: payload });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
  return { status: res.status, data, text };
}

(async () => {
  const server = http.createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + server.address().port;
  console.log('test server: ' + base + '\n');

  let adminToken = '';
  let techToken = '';

  console.log('=== 1. Health and first-run bootstrap ===');
  await check('health endpoint reports ok', async () => {
    const r = await req('GET', '/healthz');
    assertEq(r.status, 200, 'status');
    assertEq(r.data.ok, true, 'ok flag');
  });
  await check('a first admin account was created', async () => {
    const r = await req('GET', '/healthz');
    assert(r.data.users >= 1, 'expected at least one user, got ' + r.data.users);
  });

  console.log('\n=== 2. Authentication ===');
  await check('login succeeds with the bootstrapped admin', async () => {
    const r = await req('POST', '/api/login', { body: { username: 'admin', password: 'adminpass1' } });
    assertEq(r.status, 200, 'status');
    assert(r.data.token, 'no token returned');
    assertEq(r.data.user.role, 'admin', 'role');
    adminToken = r.data.token;
  });
  await check('login rejects a wrong password', async () => {
    const r = await req('POST', '/api/login', { body: { username: 'admin', password: 'nope' } });
    assertEq(r.status, 401, 'status');
    assertEq(r.data.token, undefined, 'token leaked');
  });
  await check('login rejects an unknown user with the same message', async () => {
    const r = await req('POST', '/api/login', { body: { username: 'ghost', password: 'whatever' } });
    assertEq(r.status, 401, 'status');
    assertEq(r.data.error, 'Incorrect username or password.', 'message differs from wrong-password case');
  });
  await check('protected routes reject a missing token', async () => {
    const r = await req('GET', '/api/records');
    assertEq(r.status, 401, 'status');
  });
  await check('protected routes reject a forged token', async () => {
    const r = await req('GET', '/api/records', { token: 'not.a.real.token' });
    assertEq(r.status, 401, 'status');
  });
  await check('/api/me returns the signed-in account', async () => {
    const r = await req('GET', '/api/me', { token: adminToken });
    assertEq(r.status, 200, 'status');
    assertEq(r.data.user.username, 'admin', 'username');
  });

  console.log('\n=== 3. User management ===');
  await check('admin can create a technician account', async () => {
    const r = await req('POST', '/api/users', {
      token: adminToken,
      body: { username: 'vijay', displayName: 'M. Vijay', password: 'elec123', role: 'technician' },
    });
    assertEq(r.status, 200, 'status');
    assertEq(r.data.user.role, 'technician', 'role');
  });
  await check('duplicate usernames are refused', async () => {
    const r = await req('POST', '/api/users', {
      token: adminToken, body: { username: 'vijay', password: 'elec123', role: 'technician' },
    });
    assertEq(r.status, 409, 'status');
  });
  await check('short passwords are refused', async () => {
    const r = await req('POST', '/api/users', {
      token: adminToken, body: { username: 'shorty', password: '123', role: 'technician' },
    });
    assertEq(r.status, 400, 'status');
  });
  await check('the technician can sign in', async () => {
    const r = await req('POST', '/api/login', { body: { username: 'vijay', password: 'elec123' } });
    assertEq(r.status, 200, 'status');
    techToken = r.data.token;
  });
  await check('a technician cannot list users', async () => {
    const r = await req('GET', '/api/users', { token: techToken });
    assertEq(r.status, 403, 'status');
  });
  await check('a technician cannot delete records', async () => {
    const r = await req('DELETE', '/api/records/anything', { token: techToken });
    assertEq(r.status, 403, 'status');
  });
  await check('an admin cannot disable their own account', async () => {
    const me = (await req('GET', '/api/me', { token: adminToken })).data.user;
    const r = await req('POST', '/api/users/' + me.id + '/active', { token: adminToken, body: { active: false } });
    assertEq(r.status, 400, 'status');
  });
  await check('a disabled account can no longer sign in', async () => {
    const users = (await req('GET', '/api/users', { token: adminToken })).data.users;
    const v = users.find(u => u.username === 'vijay');
    await req('POST', '/api/users/' + v.id + '/active', { token: adminToken, body: { active: false } });
    const r = await req('POST', '/api/login', { body: { username: 'vijay', password: 'elec123' } });
    assertEq(r.status, 401, 'disabled account was allowed in');
    await req('POST', '/api/users/' + v.id + '/active', { token: adminToken, body: { active: true } });
    techToken = (await req('POST', '/api/login', { body: { username: 'vijay', password: 'elec123' } })).data.token;
  });
  await check('an existing token stops working once the account is disabled', async () => {
    const users = (await req('GET', '/api/users', { token: adminToken })).data.users;
    const v = users.find(u => u.username === 'vijay');
    await req('POST', '/api/users/' + v.id + '/active', { token: adminToken, body: { active: false } });
    const r = await req('GET', '/api/records', { token: techToken });
    assertEq(r.status, 401, 'token still accepted for a disabled account');
    await req('POST', '/api/users/' + v.id + '/active', { token: adminToken, body: { active: true } });
    techToken = (await req('POST', '/api/login', { body: { username: 'vijay', password: 'elec123' } })).data.token;
  });
  await check('a user can change their own password', async () => {
    const r = await req('POST', '/api/me/password', { token: techToken, body: { current: 'elec123', next: 'newpass9' } });
    assertEq(r.status, 200, 'status');
    const again = await req('POST', '/api/login', { body: { username: 'vijay', password: 'newpass9' } });
    assertEq(again.status, 200, 'new password did not work');
    techToken = again.data.token;
  });
  await check('changing password with a wrong current one is refused', async () => {
    const r = await req('POST', '/api/me/password', { token: techToken, body: { current: 'wrong', next: 'whatever1' } });
    assertEq(r.status, 400, 'status');
  });

  console.log('\n=== 4. Checklist configuration ===');
  const days = {
    mon: {
      label: 'Monday · Additive Section', formLabel: 'Monday – Additive',
      equip: [{
        id: 'eq1', tag: 'TT-001', name: 'Truck Tippler', isHT: false,
        runningParams: [{ id: 'p1', label: 'Stator Current', unit: 'A', limit: '≤ FLA', phases: true }],
        runningChecks: ['Visual inspection'],
        stoppedChecks: ['Megger test'],
      }],
      common: [{ id: 'g1', name: 'Lighting', color: '#1565c0', icon: '💡', items: [
        { id: 'i1', tag: 'LT-1', device: 'Bay', check: 'All on' },
      ] }],
    },
  };
  await check('initially no config is published', async () => {
    const r = await req('GET', '/api/config', { token: adminToken });
    assertEq(r.status, 200, 'status');
    assertEq(r.data.config, null, 'expected no config');
  });
  await check('an admin can publish a checklist', async () => {
    const r = await req('POST', '/api/config', { token: adminToken, body: { days, note: 'initial' } });
    assertEq(r.status, 200, 'status');
    assert(r.data.version, 'no version returned');
  });
  await check('the app can read the published checklist', async () => {
    const r = await req('GET', '/api/config', { token: techToken });
    assertEq(r.status, 200, 'status');
    assertEq(r.data.config.days.mon.equip[0].tag, 'TT-001', 'equipment tag');
    assertEq(r.data.config.days.mon.equip[0].runningParams[0].label, 'Stator Current', 'parameter');
  });
  await check('a technician cannot publish a checklist', async () => {
    const r = await req('POST', '/api/config', { token: techToken, body: { days } });
    assertEq(r.status, 403, 'status');
  });
  await check('publishing without days is refused', async () => {
    const r = await req('POST', '/api/config', { token: adminToken, body: { note: 'nothing' } });
    assertEq(r.status, 400, 'status');
  });
  await check('a second publish becomes the active version and keeps history', async () => {
    const days2 = JSON.parse(JSON.stringify(days));
    days2.mon.equip[0].name = 'Truck Tippler (revised)';
    await req('POST', '/api/config', { token: adminToken, body: { days: days2, note: 'revised' } });
    const active = await req('GET', '/api/config', { token: techToken });
    assertEq(active.data.config.days.mon.equip[0].name, 'Truck Tippler (revised)', 'active config not updated');
    const hist = await req('GET', '/api/config/history', { token: adminToken });
    assert(hist.data.history.length >= 2, 'history should hold both versions');
  });
  await check('an admin can roll back to an earlier version', async () => {
    const hist = (await req('GET', '/api/config/history', { token: adminToken })).data.history;
    const older = hist[hist.length - 1];
    const r = await req('POST', '/api/config/activate', { token: adminToken, body: { version: older.version } });
    assertEq(r.status, 200, 'status');
    const active = await req('GET', '/api/config', { token: techToken });
    assertEq(active.data.config.version, older.version, 'rollback did not take effect');
  });

  console.log('\n=== 5. Records ===');
  const payload = {
    meta: { id: 'R-1001', date: '2026-03-11', shift: 'A (06:00–14:00)', tech: 'M. Vijay', sup: 'R. Kumar', form: 'Monday – Additive', pct: 100, done: 26, total: 26 },
    equipRows: [{ id: 'eq1', tag: 'TT-001', name: 'Truck Tippler', status: 'R', remarks: 'grease leak', runChecks: [{ task: 'Visual inspection', result: 'fail' }], stopChecks: [] }],
    commonRows: [{ group: 'Lighting', tag: 'LT-1', device: 'Bay', check: 'All on', result: 'ok', remarks: '' }],
    fails: [{ equipment: 'Truck Tippler', issue: 'grease leak', type: 'Running Check' }],
  };
  await check('a technician can submit a record', async () => {
    const r = await req('POST', '/api/records', {
      token: techToken,
      body: { id: 'R-1001', date: '2026-03-11', shift: 'A (06:00–14:00)', technician: 'M. Vijay', supervisor: 'R. Kumar', form: 'Monday – Additive', pct: 100, done: 26, total: 26, payload },
    });
    assertEq(r.status, 200, 'status');
    assertEq(r.data.created, true, 'should be a new record');
  });
  await check('a record without an id is refused', async () => {
    const r = await req('POST', '/api/records', { token: techToken, body: { date: '2026-03-11', payload: {} } });
    assertEq(r.status, 400, 'status');
  });
  await check('a record with a bad date is refused', async () => {
    const r = await req('POST', '/api/records', { token: techToken, body: { id: 'X1', date: '11-03-2026', payload: {} } });
    assertEq(r.status, 400, 'status');
  });
  await check('re-submitting the same id updates instead of duplicating', async () => {
    const r = await req('POST', '/api/records', {
      token: techToken,
      body: { id: 'R-1001', date: '2026-03-11', technician: 'M. Vijay', pct: 100, payload },
    });
    assertEq(r.status, 200, 'status');
    assertEq(r.data.created, false, 'should have updated the existing record');
    const list = await req('GET', '/api/records', { token: techToken });
    assertEq(list.data.total, 1, 'record was duplicated');
  });
  await check('the record can be listed and read back in full', async () => {
    const list = await req('GET', '/api/records', { token: techToken });
    assertEq(list.data.count, 1, 'list count');
    assertEq(list.data.records[0].technician, 'M. Vijay', 'technician');
    assertEq(list.data.records[0].fail_count, 1, 'failure count');
    const one = await req('GET', '/api/records/R-1001', { token: techToken });
    assertEq(one.status, 200, 'status');
    assertEq(one.data.record.payload.equipRows[0].tag, 'TT-001', 'payload not round-tripped');
    assertEq(one.data.record.submitted_by, 'vijay', 'submitting user not recorded');
  });
  await check('the date index reports counts', async () => {
    const r = await req('GET', '/api/records/dates', { token: techToken });
    assertEq(r.data.dates.length, 1, 'date count');
    assertEq(r.data.dates[0].date, '2026-03-11', 'date');
    assertEq(r.data.dates[0].count, 1, 'per-date count');
  });
  await check('records can be filtered by date', async () => {
    await req('POST', '/api/records', {
      token: techToken,
      body: { id: 'R-2002', date: '2026-03-12', technician: 'Ravi', payload: Object.assign({}, payload, { meta: Object.assign({}, payload.meta, { id: 'R-2002', date: '2026-03-12' }) }) },
    });
    const hit = await req('GET', '/api/records?date=2026-03-11', { token: techToken });
    assertEq(hit.data.count, 1, 'date filter');
    assertEq(hit.data.records[0].id, 'R-1001', 'wrong record returned');
    const range = await req('GET', '/api/records?from=2026-03-12&to=2026-03-12', { token: techToken });
    assertEq(range.data.count, 1, 'range filter');
    const all = await req('GET', '/api/records', { token: techToken });
    assertEq(all.data.total, 2, 'unfiltered total');
  });
  await check('records can be filtered by text', async () => {
    const r = await req('GET', '/api/records?q=Ravi', { token: techToken });
    assertEq(r.data.count, 1, 'text filter');
    assertEq(r.data.records[0].id, 'R-2002', 'wrong record');
  });
  await check('a technician cannot delete a record', async () => {
    const r = await req('DELETE', '/api/records/R-1001', { token: techToken });
    assertEq(r.status, 403, 'status');
  });
  await check('an admin can delete a record', async () => {
    const r = await req('DELETE', '/api/records/R-1001', { token: adminToken });
    assertEq(r.status, 200, 'status');
    const after = await req('GET', '/api/records', { token: techToken });
    assertEq(after.data.total, 1, 'record not removed');
  });
  await check('deleting a missing record reports 404', async () => {
    const r = await req('DELETE', '/api/records/R-1001', { token: adminToken });
    assertEq(r.status, 404, 'status');
  });

  console.log('\n=== 6. App release channel ===');
  await check('the version endpoint is reachable without signing in', async () => {
    const r = await req('GET', '/api/app/version');
    assertEq(r.status, 200, 'status');
    assertEq(r.data.update, null, 'should report no release yet');
  });
  await check('only an admin can publish a release', async () => {
    const r = await req('POST', '/api/app/release', { token: techToken, body: { versionCode: 5, versionName: '9.9' } });
    assert(r.status === 403 || r.status === 400, 'expected refusal, got ' + r.status);
  });

  console.log('\n=== 7. Audit log ===');
  await check('security-relevant actions are recorded', async () => {
    const r = await req('GET', '/api/audit?limit=200', { token: adminToken });
    assertEq(r.status, 200, 'status');
    const actions = r.data.entries.map(e => e.action);
    ['login', 'user-created', 'config-published', 'record-created', 'record-deleted']
      .forEach(a => assert(actions.includes(a), 'missing audit action: ' + a));
  });
  await check('a failed login is recorded without the password', async () => {
    const r = await req('GET', '/api/audit?limit=200', { token: adminToken });
    const failed = r.data.entries.filter(e => e.action === 'login-failed');
    assert(failed.length > 0, 'no login-failed entry');
    assert(!JSON.stringify(failed).includes('nope'), 'a password leaked into the audit log');
  });

  console.log('\n=== 8. Input hardening ===');
  await check('a huge display name does not break the API', async () => {
    const r = await req('POST', '/api/users', {
      token: adminToken,
      body: { username: 'big', displayName: 'x'.repeat(5000), password: 'password1', role: 'technician' },
    });
    assertEq(r.status, 200, 'status');
  });
  await check('SQL metacharacters are treated as plain text', async () => {
    const r = await req('GET', "/api/records?q=' OR 1=1 --", { token: techToken });
    assertEq(r.status, 200, 'status');
    assertEq(r.data.count, 0, 'injection attempt returned rows');
  });
  await check('a JSON body that is too large is rejected', async () => {
    const r = await req('POST', '/api/config', {
      token: adminToken, raw: JSON.stringify({ days: { big: 'x'.repeat(9 * 1024 * 1024) } }),
    });
    assert(r.status === 413 || r.status === 400, 'expected rejection, got ' + r.status);
  });
  await check('unknown API endpoints return JSON, not HTML', async () => {
    const r = await req('GET', '/api/nope', { token: adminToken });
    assertEq(r.status, 404, 'status');
    assert(r.data && r.data.error, 'no JSON error body');
  });

  console.log('\n================ TEST RESULT ================');
  console.log('passed: ' + pass + '   failed: ' + fail);
  if (failures.length) {
    console.log('\nFAILURES:');
    failures.forEach(f => console.log(' - ' + f));
  } else {
    console.log('ALL API TESTS PASSED');
  }

  server.close();
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  process.exit(fail ? 1 : 0);
})().catch(e => {
  console.error('Test harness crashed:', e);
  process.exit(1);
});
