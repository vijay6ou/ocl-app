'use strict';
/**
 * OCL Maintenance server — Express + SQLite.
 *
 * Serves three things:
 *   /api/*        the JSON API used by the Android app
 *   /             the admin web page
 *   /releases/*   published APK files, for the in-app update check
 */
const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const routes = require('./src/routes');
const { Users, Releases, Audit } = require('./src/db');
const { hashPassword, requireAuth, requireAdmin } = require('./src/auth');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const RELEASES_DIR = process.env.RELEASES_DIR || path.join(__dirname, 'releases');
const ADMIN_DIR = path.join(__dirname, 'admin');

fs.mkdirSync(RELEASES_DIR, { recursive: true });

const app = express();
app.disable('x-powered-by');
// Behind Caddy: trust its proxy headers so req.ip and protocol are accurate.
app.set('trust proxy', true);
app.use(express.json({ limit: '8mb' }));

// ── first-run bootstrap ──────────────────────────────────────────────────────
// If there are no accounts at all, create one admin so the system is usable.
// The password comes from the environment; otherwise a random one is generated
// and printed once, which is far safer than shipping a default.
function bootstrapAdmin() {
  if (Users.count() > 0) return;
  const username = process.env.ADMIN_USERNAME || 'admin';
  let password = process.env.ADMIN_PASSWORD || '';
  let generated = false;
  if (!password) {
    password = require('crypto').randomBytes(9).toString('base64url');
    generated = true;
  }
  Users.create({ username, displayName: 'Administrator', role: 'admin', passwordHash: hashPassword(password) });
  Audit.add('system', 'admin-bootstrapped', username);
  console.log('\n──────────────────────────────────────────────────────────');
  console.log(' Created the first administrator account');
  console.log('   username: ' + username);
  if (generated) {
    console.log('   password: ' + password);
    console.log('  ^ SAVE THIS NOW — it is shown only once.');
    console.log('    Change it after signing in (Admin page → Change password).');
  } else {
    console.log('   password: (taken from ADMIN_PASSWORD)');
  }
  console.log('──────────────────────────────────────────────────────────\n');
}

// ── API ──────────────────────────────────────────────────────────────────────
app.use('/api', routes);

app.get('/healthz', (req, res) => {
  res.json({
    ok: true,
    service: 'ocl-maintenance',
    time: new Date().toISOString(),
    users: Users.count(),
  });
});

// ── admin web page ───────────────────────────────────────────────────────────
app.use('/', express.static(ADMIN_DIR, { extensions: ['html'] }));

// ── APK release channel ──────────────────────────────────────────────────────
app.use('/releases', express.static(RELEASES_DIR, {
  setHeaders(res) {
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  },
}));

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, RELEASES_DIR),
    filename: (req, file, cb) => {
      const safe = String(file.originalname || 'app.apk').replace(/[^A-Za-z0-9._-]/g, '_');
      cb(null, Date.now() + '-' + safe);
    },
  }),
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.apk$/i.test(file.originalname || '');
    cb(ok ? null : new Error('Only .apk files can be uploaded.'), ok);
  },
});

/** Upload a new APK and publish it as the latest release. */
app.post('/api/app/release', requireAuth, requireAdmin, upload.single('apk'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No APK file was uploaded.' });
    const versionCode = parseInt(req.body.versionCode, 10);
    const versionName = String(req.body.versionName || '').trim();
    if (!versionCode || versionCode < 1) return res.status(400).json({ error: 'A version code (number) is required.' });
    if (!versionName) return res.status(400).json({ error: 'A version name is required.' });

    const rel = Releases.add({
      versionCode,
      versionName,
      filename: req.file.filename,
      url: '/releases/' + req.file.filename,
      notes: String(req.body.notes || ''),
      mandatory: String(req.body.mandatory || '') === 'true',
    });
    Audit.add(req.user.username, 'release-published', versionName + ' (' + versionCode + ')');
    res.json({ ok: true, release: rel });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/app/releases', requireAuth, requireAdmin, (req, res) => {
  res.json({ releases: Releases.list(30) });
});

// ── error handling ───────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  if (status >= 500) console.error('[error]', err);
  res.status(status).json({ error: err.message || 'Server error' });
});

app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Unknown API endpoint.' });
  res.status(404).send('Not found');
});

// ── start ────────────────────────────────────────────────────────────────────
bootstrapAdmin();

const server = app.listen(PORT, HOST, () => {
  console.log('OCL Maintenance server listening on http://' + HOST + ':' + PORT);
  console.log('Data file: ' + require('./src/db').DB_FILE);
  console.log('Releases : ' + RELEASES_DIR);
});

// Shut down cleanly so SQLite flushes its write-ahead log.
['SIGINT', 'SIGTERM'].forEach(sig => {
  process.on(sig, () => {
    console.log('\nShutting down…');
    server.close(() => process.exit(0));
  });
});

module.exports = app;
