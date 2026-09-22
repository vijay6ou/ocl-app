'use strict';
/**
 * API routes. Mounted under /api by server.js.
 *
 *   POST /api/login                  → token
 *   GET  /api/me                     → current account
 *   POST /api/me/password            → change own password
 *
 *   GET  /api/config                 → active checklist definition
 *   POST /api/config                 → publish a new definition (admin)
 *   GET  /api/config/history         → previous versions (admin)
 *   POST /api/config/activate        → roll back to a version (admin)
 *
 *   POST /api/records                → create/update a submission (idempotent)
 *   GET  /api/records                → list summaries
 *   GET  /api/records/dates          → date index with counts
 *   GET  /api/records/:id            → one submission in full
 *   DELETE /api/records/:id          → delete (admin)
 *
 *   GET  /api/users                  → list (admin)
 *   POST /api/users                  → create (admin)
 *   POST /api/users/:id/password     → reset (admin)
 *   POST /api/users/:id/active       → enable/disable (admin)
 *   POST /api/users/:id/role         → change role (admin)
 *
 *   GET  /api/app/version            → latest release (no auth: the app checks
 *                                      this before anyone signs in)
 */
const express = require('express');
const { Users, Records, Configs, Releases, Audit } = require('./db');
const {
  hashPassword, verifyPassword, issueToken, requireAuth, requireAdmin,
} = require('./auth');

const router = express.Router();

const isEmailish = s => typeof s === 'string' && s.trim().length >= 3;
const clampInt = (v, lo, hi, dflt) => {
  const n = parseInt(v, 10);
  if (isNaN(n)) return dflt;
  return Math.max(lo, Math.min(hi, n));
};

// ── auth ─────────────────────────────────────────────────────────────────────
router.post('/login', (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  if (!username || !password) {
    return res.status(400).json({ error: 'Enter your username and password.' });
  }

  const user = Users.byUsername(username);
  // Same message whether the account is missing, disabled or the password is
  // wrong, so the endpoint cannot be used to discover valid usernames.
  const ok = user && user.active && verifyPassword(password, user.password_hash);
  if (!ok) {
    Audit.add(username, 'login-failed', req.ip || '');
    return res.status(401).json({ error: 'Incorrect username or password.' });
  }

  Users.touchLogin(user.id);
  Audit.add(user.username, 'login', req.ip || '');
  res.json({
    token: issueToken(user),
    user: {
      id: user.id, username: user.username,
      displayName: user.display_name, role: user.role,
    },
  });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({
    user: {
      id: req.user.id, username: req.user.username,
      displayName: req.user.display_name, role: req.user.role,
    },
  });
});

router.post('/me/password', requireAuth, (req, res) => {
  const current = String(req.body.current || '');
  const next = String(req.body.next || '');
  if (next.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  if (!verifyPassword(current, req.user.password_hash)) {
    return res.status(400).json({ error: 'Your current password is incorrect.' });
  }
  Users.setPassword(req.user.id, hashPassword(next));
  Audit.add(req.user.username, 'password-changed', 'self');
  res.json({ ok: true });
});

// ── checklist configuration ──────────────────────────────────────────────────
router.get('/config', requireAuth, (req, res) => {
  const row = Configs.active();
  if (!row) return res.json({ config: null, note: 'No checklist has been published yet.' });
  let days = null;
  try { days = JSON.parse(row.days); } catch (e) { days = null; }
  res.json({ config: { version: row.version, updatedAt: row.created_at, note: row.note, days } });
});

router.post('/config', requireAuth, requireAdmin, (req, res) => {
  const days = req.body.days;
  const note = String(req.body.note || '');
  const version = String(req.body.version || new Date().toISOString());
  if (!days || typeof days !== 'object') {
    return res.status(400).json({ error: 'No checklist data supplied.' });
  }
  let json;
  try { json = JSON.stringify(days); } catch (e) { return res.status(400).json({ error: 'Checklist data is not valid.' }); }
  if (json.length > 4 * 1024 * 1024) {
    return res.status(413).json({ error: 'Checklist data is too large (over 4 MB).' });
  }
  const row = Configs.publish(version, json, note, req.user.username);
  Audit.add(req.user.username, 'config-published', version);
  res.json({ ok: true, version: row.version, updatedAt: row.created_at });
});

router.get('/config/history', requireAuth, requireAdmin, (req, res) => {
  res.json({ history: Configs.history(30) });
});

router.post('/config/activate', requireAuth, requireAdmin, (req, res) => {
  const version = String(req.body.version || '');
  if (!Configs.activate(version)) return res.status(404).json({ error: 'That version does not exist.' });
  Audit.add(req.user.username, 'config-activated', version);
  res.json({ ok: true, version });
});

// ── records ──────────────────────────────────────────────────────────────────
router.post('/records', requireAuth, (req, res) => {
  const b = req.body || {};
  const payload = b.payload || {};
  const meta = payload.meta || {};

  const id = String(b.id || meta.id || '').trim();
  if (!id) return res.status(400).json({ error: 'Submission id is required.' });

  const date = String(b.date || meta.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'A valid date (YYYY-MM-DD) is required.' });
  }

  const fails = Array.isArray(payload.fails) ? payload.fails : [];
  const rec = {
    id,
    date,
    shift: String(b.shift || meta.shift || ''),
    technician: String(b.technician || meta.tech || ''),
    supervisor: String(b.supervisor || meta.sup || ''),
    form: String(b.form || meta.form || ''),
    day: String(b.day || ''),
    pct: clampInt(b.pct != null ? b.pct : meta.pct, 0, 100, 0),
    done: clampInt(b.done != null ? b.done : meta.done, 0, 100000, 0),
    total: clampInt(b.total != null ? b.total : meta.total, 0, 100000, 0),
    failCount: fails.length,
    payload,
  };

  const result = Records.upsert(rec, req.user);
  Audit.add(req.user.username, result.created ? 'record-created' : 'record-updated', id);
  res.json({ ok: true, id, created: result.created });
});

router.get('/records', requireAuth, (req, res) => {
  const { rows, total } = Records.list({
    from: req.query.from,
    to: req.query.to,
    date: req.query.date,
    shift: req.query.shift,
    q: req.query.q,
    limit: req.query.limit,
    offset: req.query.offset,
  });
  res.json({ total, count: rows.length, records: rows });
});

router.get('/records/dates', requireAuth, (req, res) => {
  res.json({ dates: Records.dates(), total: Records.count() });
});

router.get('/records/:id', requireAuth, (req, res) => {
  const row = Records.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'That record does not exist.' });
  res.json({ record: row });
});

router.delete('/records/:id', requireAuth, requireAdmin, (req, res) => {
  if (!Records.remove(req.params.id)) return res.status(404).json({ error: 'That record does not exist.' });
  Audit.add(req.user.username, 'record-deleted', req.params.id);
  res.json({ ok: true });
});

// ── users ────────────────────────────────────────────────────────────────────
router.get('/users', requireAuth, requireAdmin, (req, res) => {
  res.json({ users: Users.list() });
});

router.post('/users', requireAuth, requireAdmin, (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const role = req.body.role === 'admin' ? 'admin' : 'technician';
  const displayName = String(req.body.displayName || '').trim();

  if (!isEmailish(username)) return res.status(400).json({ error: 'Enter a username of at least 3 characters.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  if (Users.byUsername(username)) return res.status(409).json({ error: 'That username is already taken.' });

  const user = Users.create({ username, displayName: displayName || username, role, passwordHash: hashPassword(password) });
  Audit.add(req.user.username, 'user-created', username + ' (' + role + ')');
  res.json({ ok: true, user: { id: user.id, username: user.username, role: user.role } });
});

router.post('/users/:id/password', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const target = Users.byId(id);
  if (!target) return res.status(404).json({ error: 'That account does not exist.' });
  const password = String(req.body.password || '');
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  Users.setPassword(id, hashPassword(password));
  Audit.add(req.user.username, 'user-password-reset', target.username);
  res.json({ ok: true });
});

router.post('/users/:id/active', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const target = Users.byId(id);
  if (!target) return res.status(404).json({ error: 'That account does not exist.' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'You cannot disable your own account.' });
  const active = !!req.body.active;
  Users.setActive(id, active);
  Audit.add(req.user.username, active ? 'user-enabled' : 'user-disabled', target.username);
  res.json({ ok: true, active });
});

router.post('/users/:id/role', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const target = Users.byId(id);
  if (!target) return res.status(404).json({ error: 'That account does not exist.' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'You cannot change your own role.' });
  const role = req.body.role === 'admin' ? 'admin' : 'technician';
  Users.setRole(id, role);
  Audit.add(req.user.username, 'user-role-changed', target.username + ' → ' + role);
  res.json({ ok: true, role });
});

// ── audit ────────────────────────────────────────────────────────────────────
router.get('/audit', requireAuth, requireAdmin, (req, res) => {
  res.json({ entries: Audit.recent(clampInt(req.query.limit, 1, 500, 100)) });
});

// ── app release channel ──────────────────────────────────────────────────────
// Deliberately unauthenticated: the Android app must be able to ask "is there a
// newer version?" before anyone has signed in.
router.get('/app/version', (req, res) => {
  const rel = Releases.latest();
  if (!rel) {
    return res.json({ update: null, note: 'No release has been published yet.' });
  }
  res.json({
    update: {
      versionCode: rel.version_code,
      versionName: rel.version_name,
      url: rel.url,
      notes: rel.notes,
      mandatory: !!rel.mandatory,
      publishedAt: rel.created_at,
    },
  });
});

module.exports = router;
