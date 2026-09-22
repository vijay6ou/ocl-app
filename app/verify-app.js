const fs = require('fs');
const path = 'D:\\deepseek harness\\_extract\\ocl-maintenance\\app\\app\\src\\main\\assets\\index.html';
const html = fs.readFileSync(path, 'utf8');
const problems = [];
const notes = [];

// ── 1. Extract and syntax-check the <script> block ──────────────────────────────
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
console.log('script blocks found: ' + scripts.length);
scripts.forEach((s, i) => {
  try {
    new Function(s);
    console.log('  script[' + i + '] (' + s.split('\n').length + ' lines): SYNTAX OK');
  } catch (e) {
    problems.push('script[' + i + '] SYNTAX ERROR: ' + e.message);
  }
});
const js = scripts.join('\n');

// ── 2. Duplicate top-level function declarations ────────────────────────────────
const fnNames = [...js.matchAll(/^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm)].map(m => m[1]);
const seenFn = {};
fnNames.forEach(n => { seenFn[n] = (seenFn[n] || 0) + 1; });
const dupFns = Object.entries(seenFn).filter(([, c]) => c > 1);
console.log('\nduplicate function declarations: ' + (dupFns.length ? dupFns.map(([n, c]) => n + ' x' + c).join(', ') : 'NONE'));
if (dupFns.length) problems.push('duplicate functions: ' + dupFns.map(([n, c]) => n + ' x' + c).join(', '));

// ── 3. Element IDs referenced by JS/onclick vs IDs present in HTML ──────────────
const bodyOnly = html.replace(/<script[\s\S]*?<\/script>/gi, '');
const presentIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const referenced = new Set([
  ...[...js.matchAll(/getElementById\(\s*'([^']+)'\s*\)/g)].map(m => m[1]),
  ...[...js.matchAll(/getElementById\(\s*"([^"]+)"\s*\)/g)].map(m => m[1]),
]);
const dynamicPrefixes = ['body-', 'card-', 'ci-', 'cnt-', 'tab-', 'pm-tab-', 'pm-panel-', 'prog-'];
// IDs that JS creates at runtime rather than embedding in the HTML
const runtimeIds = new Set(['ocl-toast', 'fm-i0', 'update-banner']);
const missing = [...referenced].filter(id => {
  if (presentIds.has(id)) return false;
  if (runtimeIds.has(id)) return false;
  // IDs built by concatenation (e.g. 'body-' + eid) cannot be resolved statically
  if (dynamicPrefixes.some(p => id.startsWith(p))) return false;
  if (/^ci-|^card-|^body-|^cnt-/.test(id)) return false;
  return true;
});
console.log('static getElementById targets missing from HTML: ' + (missing.length ? missing.join(', ') : 'NONE'));
if (missing.length) problems.push('missing element ids: ' + missing.join(', '));

// ── 4. Static getElementById keys that are concatenations, listed for review ────
const dynamicKeys = [...referenced].filter(id => dynamicPrefixes.some(p => id.startsWith(p)));
console.log('dynamically-built id keys (expected to be absent statically): ' + dynamicKeys.join(', '));

// ── 5. onclick handlers must resolve to a defined function ──────────────────────
const handlerNames = new Set([...html.matchAll(/on(?:click|change|input)\s*=\s*"([^"]*)"/g)]
  .flatMap(m => [...m[1].matchAll(/(?:^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g)].map(x => x[1])));
// Aliases declared as `const name = ...` rather than `function name()`
const constAliases = new Set([...js.matchAll(/^\s*const\s+([A-Za-z_$][\w$]*)\s*=/gm)].map(m => m[1]));
const defined = new Set([...fnNames, ...constAliases]);
const builtins = new Set(['if', 'event', 'alert', 'confirm', 'this', 'document', 'window', 'function', 'return', 'typeof', 'catch']);
const undefinedHandlers = [...handlerNames].filter(n => !defined.has(n) && !builtins.has(n));
console.log('\ninline-handler functions not defined in JS: ' + (undefinedHandlers.length ? undefinedHandlers.join(', ') : 'NONE'));
if (undefinedHandlers.length) problems.push('undefined inline handlers: ' + undefinedHandlers.join(', '));

// ── 6. Every function CALLED anywhere should exist (catches typos) ──────────────
const called = new Set([...js.matchAll(/(?<![.\w$])([a-z][\w$]*)\s*\(/g)].map(m => m[1]));
const jsBuiltins = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'function', 'await', 'new',
  'parseInt', 'parseFloat', 'isNaN', 'String', 'Number', 'Boolean', 'Array', 'Object', 'JSON', 'Math', 'Date',
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'confirm', 'alert', 'prompt', 'fetch', 'Blob',
  'URL', 'TextEncoder', 'Function', 'Error', 'Promise', 'RegExp', 'console', 'encodeURIComponent', 'decodeURIComponent']);
const declaredVars = new Set([...js.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)].map(m => m[1]));
const unknownCalls = [...called].filter(n => !defined.has(n) && !jsBuiltins.has(n) && !declaredVars.has(n));
console.log('unresolved function calls (review): ' + (unknownCalls.length ? unknownCalls.join(', ') : 'NONE'));

// ── 7. Forbidden leftovers ─────────────────────────────────────────────────────
// Strip comments with a quote-aware scanner so prose that *describes* a removed
// pattern is not mistaken for live code, and string literals are never corrupted.
function stripJsComments(src) {
  let prev = '';   // last significant char, to spot regex literals
  let out = '';
  let i = 0;
  let str = null;      // current quote char
  let tpl = 0;         // template-literal depth
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (str) {
      out += c;
      if (c === '\\') { out += (n || ''); i += 2; continue; }
      if (c === str) str = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'") { str = c; out += c; i++; continue; }
    if (c === '`') { tpl = tpl ? 0 : 1; out += c; i++; continue; }
    const regexOk = /[(,=:[!&|?{};+\-*%<>~^]/.test(prev) || prev === '';
    if (c === '/' && n === '/' && !regexOk) { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*' && !regexOk) { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '/' && regexOk) { out += c; i++;
      while (i < src.length && src[i] !== '/') { if (src[i] === '\\') { out += src[i]; i++; } if (i < src.length) { out += src[i]; i++; } }
      if (i < src.length) { out += src[i]; i++; prev = '/'; }
      continue; }
    out += c;
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return out;
}
const jsNoComments = stripJsComments(js);
const htmlNoComments = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/gi, '');
// sanity: the stripped script must still be valid JS
try {
  new Function(jsNoComments);
} catch (e) {
  problems.push('comment stripper produced invalid JS: ' + e.message);
}
const forbidden = [
  ['hardcoded Apps Script URL (live code)', /script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}/, jsNoComments],
  ['hardcoded Apps Script URL (anywhere)', /script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}/, htmlNoComments],
  ['mode: no-cors (live code)', /mode\s*:\s*['"]no-cors['"]/, jsNoComments],
  ['old openPwdModal element pm-cur', /\bpm-cur\b/, jsNoComments],
  ['hardcoded Monday PDF header', /Monday · Additive Section · Daily Routine/, htmlNoComments],
];
console.log('\nleftover checks:');
for (const [label, re, hay] of forbidden) {
  const hit = re.test(hay);
  console.log('  ' + (hit ? 'FAIL' : 'ok  ') + '  ' + label + (hit ? '  <-- still present' : ''));
  if (hit) problems.push('leftover: ' + label);
}

// ── 8. Feature presence assertions ─────────────────────────────────────────────
const required = {
  'Records tab button': /showTab\('records'/,
  'Records panel': /id="tab-records"/,
  'searchRecords()': /function searchRecords\(/,
  'filterRecords()': /function filterRecords\(/,
  'printRecord()': /function printRecord\(/,
  'viewRecord()': /function viewRecord\(/,
  'deleteRecord()': /function deleteRecord\(/,
  'exportRecords()': /function exportRecords\(/,
  'saveRecord()': /function saveRecord\(/,
  'queueAutosave()': /function queueAutosave\(/,
  'applySnapshot()': /function applySnapshot\(/,
  'escapeHtml/esc()': /function escapeHtml\(/,
  'requireAdmin()': /function requireAdmin\(/,
  'effectiveSheetsUrl()': /function effectiveSheetsUrl\(/,
  'draft banner html': /id="draft-banner"/,
  'done-saved element': /id="done-saved"/,
  'cfg-quiet checkbox': /id="cfg-quiet"/,
  'native print bridge': /function printDocument\(|OCLNative\.printHtml/,
  'durable storage mirror': /function lsSet\(|MIRRORED_KEYS/,
  'numeric input sanitizer': /function sanitizeNumeric\(|function setParamNumeric\(/,
  'numeric input markup': /type="number" inputmode="decimal"/,
  'delete policy': /function canDeleteRecords\(|function setDeletePolicy\(/,
  'delete policy radios': /id="dp-admin"[\s\S]{0,400}?id="dp-tech"/,
  'field config layer': /function effectiveDaysData\(|function applyFieldConfig\(/,
  'config validation': /function validateDays\(/,
  'field editor UI': /id="editor-screen"|function renderEditor\(/,
  'generic form modal': /function openFormModal\(/,
  'update checker': /function checkForUpdates\(/,
  'config publish/sync': /function edPublish\(|function syncConfigFromSheet\(/,
};
console.log('\nfeature presence:');
for (const [label, re] of Object.entries(required)) {
  const ok = re.test(html);
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + label);
  if (!ok) problems.push('missing feature: ' + label);
}

// ── 9. Escape coverage on user-supplied interpolations ─────────────────────────
// Look for unescaped ${...} of known user fields inside template literals.
const userFields = ['es.remarks', 'cs.remarks', 'meta.tech', 'meta.sup', 'e.remarks', 'f.issue', 'f.equipment'];
const unescaped = [];
for (const f of userFields) {
  const re = new RegExp('\\$\\{(?!esc\\()' + f.replace('.', '\\.') + '[^}]*\\}', 'g');
  // Only flag when it appears in an innerHTML/template context
  let m;
  while ((m = re.exec(js)) !== null) {
    const around = js.slice(Math.max(0, m.index - 260), m.index);
    if (/innerHTML|html \+=|`/.test(around)) unescaped.push(f + ' @offset ' + m.index);
  }
}
console.log('\nunescaped user-field interpolations: ' + (unescaped.length ? unescaped.join('; ') : 'NONE'));
if (unescaped.length) problems.push('unescaped interpolations: ' + unescaped.join('; '));

// ── Summary ────────────────────────────────────────────────────────────────────
console.log('\n================ RESULT ================');
if (problems.length) {
  console.log('PROBLEMS (' + problems.length + '):');
  problems.forEach(p => console.log(' - ' + p));
  process.exitCode = 1;
} else {
  console.log('ALL CHECKS PASSED');
}
