/**
 * Publish the built-in checklist to the live server, so a freshly installed app
 * has something to show instead of an empty list.
 *
 *   node publish-default-config.js
 */
const fs = require('fs');
const path = require('path');

const BASE = 'https://ocl.vishryfarms.com';
const USER = 'admin';
const PASS = process.env.OCL_ADMIN_PASSWORD || 'OclAdmin2026!';
const HTML = path.join(__dirname, 'app', 'app', 'src', 'main', 'assets', 'index.html');

function extractDays() {
  const html = fs.readFileSync(HTML, 'utf8');
  const s = html.indexOf('const ALL_DAYS_DATA = {');
  const e = html.indexOf('let EQUIPMENT = [];');
  if (s < 0 || e < 0) throw new Error('could not locate ALL_DAYS_DATA in the app bundle');
  const src = html.slice(s + 'const ALL_DAYS_DATA = '.length, e).trim().replace(/;\s*$/, '');
  // The block is a plain object literal; evaluate it in isolation.
  return eval('(' + src + ')');
}

(async () => {
  console.log('=== extracting the built-in checklist ===');
  const days = extractDays();
  let eq = 0, fields = 0;
  Object.values(days).forEach(d => d.equip.forEach(x => {
    eq++;
    fields += (x.runningParams || []).length + (x.runningChecks || []).length + (x.stoppedChecks || []).length;
  }));
  console.log('  days=' + Object.keys(days).length + '  equipment=' + eq + '  checklist lines=' + fields);
  if (eq !== 57) console.log('  note: expected 57 equipment, found ' + eq);
  if (fields !== 1165) console.log('  note: expected 1165 lines, found ' + fields);

  console.log('\n=== signing in to ' + BASE + ' ===');
  const lr = await fetch(BASE + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS }),
  });
  const lbody = await lr.json();
  if (!lr.ok || !lbody.token) throw new Error('login failed: ' + JSON.stringify(lbody));
  const token = lbody.token;
  console.log('  signed in as ' + lbody.user.username + ' (' + lbody.user.role + ')');

  console.log('\n=== publishing ===');
  const version = 'initial-' + new Date().toISOString().replace(/[:.]/g, '-');
  const pr = await fetch(BASE + '/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ days, note: 'Built-in default checklist (initial publish)', version }),
  });
  const pbody = await pr.json();
  if (!pr.ok) throw new Error('publish failed: ' + JSON.stringify(pbody));
  console.log('  published version: ' + pbody.version);

  console.log('\n=== verifying a client can read it back ===');
  const gr = await fetch(BASE + '/api/config', { headers: { Authorization: 'Bearer ' + token } });
  const gbody = await gr.json();
  if (!gbody.config || !gbody.config.days) throw new Error('published config not readable');
  let eq2 = 0, f2 = 0;
  Object.values(gbody.config.days).forEach(d => d.equip.forEach(x => {
    eq2++;
    f2 += (x.runningParams || []).length + (x.runningChecks || []).length + (x.stoppedChecks || []).length;
  }));
  console.log('  read back: equipment=' + eq2 + '  lines=' + f2 + '  version=' + gbody.config.version);

  console.log('\n=== confirming it is protected without a token ===');
  const nr = await fetch(BASE + '/api/config');
  console.log('  unauthenticated request -> HTTP ' + nr.status + (nr.status === 401 ? ' (correctly refused)' : ' (UNEXPECTED)'));

  const ok = eq2 === eq && f2 === fields && nr.status === 401;
  console.log('\n' + (ok ? 'SUCCESS — the app will now show the full checklist on first run.'
                        : 'WARNING — numbers did not round-trip as expected.'));
  process.exit(ok ? 0 : 1);
})().catch(e => {
  console.error('\nFAILED: ' + (e && e.message ? e.message : e));
  process.exit(1);
});
