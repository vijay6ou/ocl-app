'use strict';
/**
 * Database layer — SQLite via better-sqlite3.
 *
 * Chosen deliberately over Postgres: a single file, no second service to run,
 * trivial to back up (copy one file), and comfortably enough for a plant's
 * maintenance register (tens of thousands of rows).
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'ocl.db');

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');     // safe concurrent reads
db.pragma('foreign_keys = ON');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  display_name  TEXT    NOT NULL DEFAULT '',
  role          TEXT    NOT NULL CHECK (role IN ('admin','technician')),
  password_hash TEXT    NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT    NOT NULL,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS records (
  id          TEXT    PRIMARY KEY,             -- client-generated submission id
  date        TEXT    NOT NULL,                -- YYYY-MM-DD
  shift       TEXT    NOT NULL DEFAULT '',
  technician  TEXT    NOT NULL DEFAULT '',
  supervisor  TEXT    NOT NULL DEFAULT '',
  form        TEXT    NOT NULL DEFAULT '',
  day         TEXT    NOT NULL DEFAULT '',
  pct         INTEGER NOT NULL DEFAULT 0,
  done        INTEGER NOT NULL DEFAULT 0,
  total       INTEGER NOT NULL DEFAULT 0,
  payload     TEXT    NOT NULL,                -- full JSON submission
  fail_count  INTEGER NOT NULL DEFAULT 0,
  submitted_by TEXT,                           -- users.username
  user_id     INTEGER REFERENCES users(id),
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL,
  UNIQUE (id)
);
CREATE INDEX IF NOT EXISTS idx_records_date ON records(date DESC);
CREATE INDEX IF NOT EXISTS idx_records_created ON records(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_records_user ON records(user_id);

-- The checklist definition ("field configuration"). Kept as history so an admin
-- can see what changed and roll back to a previous version.
CREATE TABLE IF NOT EXISTS configs (
  version    TEXT    PRIMARY KEY,
  days       TEXT    NOT NULL,                -- JSON
  note       TEXT    NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TEXT    NOT NULL,
  active     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_configs_active ON configs(active);

-- App release channel: what the phones are told to download.
CREATE TABLE IF NOT EXISTS releases (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  version_code INTEGER NOT NULL,
  version_name TEXT    NOT NULL,
  filename     TEXT    NOT NULL,
  url          TEXT    NOT NULL,
  notes        TEXT    NOT NULL DEFAULT '',
  mandatory    INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT    NOT NULL
);

-- Simple append-only audit log for anything security-relevant.
CREATE TABLE IF NOT EXISTS audit (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  at      TEXT NOT NULL,
  actor   TEXT,
  action  TEXT NOT NULL,
  detail  TEXT NOT NULL DEFAULT ''
);
`;

db.exec(SCHEMA);

const now = () => new Date().toISOString();

// ── users ────────────────────────────────────────────────────────────────────
const Users = {
  byUsername(username) {
    return db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(String(username || ''));
  },
  byId(id) {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  },
  list() {
    return db.prepare(
      'SELECT id, username, display_name, role, active, created_at, last_login_at FROM users ORDER BY username'
    ).all();
  },
  create({ username, displayName, role, passwordHash }) {
    const info = db.prepare(
      `INSERT INTO users (username, display_name, role, password_hash, active, created_at)
       VALUES (?, ?, ?, ?, 1, ?)`
    ).run(username, displayName || '', role, passwordHash, now());
    return Users.byId(info.lastInsertRowid);
  },
  setPassword(id, passwordHash) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, id);
  },
  setActive(id, active) {
    db.prepare('UPDATE users SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
  },
  setRole(id, role) {
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
  },
  touchLogin(id) {
    db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now(), id);
  },
  count() {
    return db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  },
};

// ── records ──────────────────────────────────────────────────────────────────
const Records = {
  upsert(rec, user) {
    const payload = JSON.stringify(rec.payload || {});
    const existing = db.prepare('SELECT id FROM records WHERE id = ?').get(rec.id);
    if (existing) {
      db.prepare(
        `UPDATE records SET date=?, shift=?, technician=?, supervisor=?, form=?, day=?,
                pct=?, done=?, total=?, payload=?, fail_count=?, updated_at=?
         WHERE id = ?`
      ).run(rec.date, rec.shift, rec.technician, rec.supervisor, rec.form, rec.day,
            rec.pct, rec.done, rec.total, payload, rec.failCount, now(), rec.id);
      return { id: rec.id, created: false };
    }
    db.prepare(
      `INSERT INTO records (id, date, shift, technician, supervisor, form, day, pct, done, total,
                            payload, fail_count, submitted_by, user_id, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(rec.id, rec.date, rec.shift, rec.technician, rec.supervisor, rec.form, rec.day,
          rec.pct, rec.done, rec.total, payload, rec.failCount,
          user ? user.username : null, user ? user.id : null, now(), now());
    return { id: rec.id, created: true };
  },

  // Summary rows only — the heavy checklist payload is fetched per record.
  list({ from, to, date, shift, q, limit = 200, offset = 0 }) {
    const where = [];
    const args = [];
    if (date) { where.push('date = ?'); args.push(date); }
    if (from) { where.push('date >= ?'); args.push(from); }
    if (to) { where.push('date <= ?'); args.push(to); }
    if (shift) { where.push('shift LIKE ?'); args.push(shift + '%'); }
    if (q) {
      where.push('(technician LIKE ? OR supervisor LIKE ? OR form LIKE ? OR payload LIKE ?)');
      const like = '%' + q + '%';
      args.push(like, like, like, like);
    }
    const sql = 'SELECT id, date, shift, technician, supervisor, form, day, pct, done, total,' +
      ' fail_count, submitted_by, created_at' +
      ' FROM records' + (where.length ? ' WHERE ' + where.join(' AND ') : '') +
      ' ORDER BY date DESC, created_at DESC LIMIT ? OFFSET ?';
    const rows = db.prepare(sql).all(...args, Math.min(Number(limit) || 200, 1000), Number(offset) || 0);
    const countSql = 'SELECT COUNT(*) AS n FROM records' +
      (where.length ? ' WHERE ' + where.join(' AND ') : '');
    const total = db.prepare(countSql).get(...args).n;
    return { rows, total };
  },

  get(id) {
    const row = db.prepare('SELECT * FROM records WHERE id = ?').get(id);
    if (!row) return null;
    let payload = null;
    try { payload = JSON.parse(row.payload); } catch (e) { payload = null; }
    return Object.assign({}, row, { payload });
  },

  dates() {
    return db.prepare(
      'SELECT date, COUNT(*) AS count FROM records GROUP BY date ORDER BY date DESC'
    ).all();
  },

  remove(id) {
    return db.prepare('DELETE FROM records WHERE id = ?').run(id).changes > 0;
  },

  count() {
    return db.prepare('SELECT COUNT(*) AS n FROM records').get().n;
  },
};

// ── configs ──────────────────────────────────────────────────────────────────
const Configs = {
  active() {
    return db.prepare('SELECT * FROM configs WHERE active = 1 ORDER BY created_at DESC LIMIT 1').get() || null;
  },
  byVersion(version) {
    return db.prepare('SELECT * FROM configs WHERE version = ?').get(version) || null;
  },
  history(limit = 20) {
    return db.prepare(
      'SELECT version, note, created_by, created_at, active FROM configs ORDER BY created_at DESC LIMIT ?'
    ).all(limit);
  },
  publish(version, daysJson, note, actor) {
    const tx = db.transaction(() => {
      db.prepare('UPDATE configs SET active = 0 WHERE active = 1').run();
      db.prepare(
        `INSERT INTO configs (version, days, note, created_by, created_at, active)
         VALUES (?, ?, ?, ?, ?, 1)
         ON CONFLICT(version) DO UPDATE SET days=excluded.days, note=excluded.note,
           created_by=excluded.created_by, created_at=excluded.created_at, active=1`
      ).run(version, daysJson, note || '', actor || null, now());
    });
    tx();
    return Configs.byVersion(version);
  },
  activate(version) {
    const row = Configs.byVersion(version);
    if (!row) return false;
    const tx = db.transaction(() => {
      db.prepare('UPDATE configs SET active = 0 WHERE active = 1').run();
      db.prepare('UPDATE configs SET active = 1 WHERE version = ?').run(version);
    });
    tx();
    return true;
  },
};

// ── releases ─────────────────────────────────────────────────────────────────
const Releases = {
  latest() {
    return db.prepare('SELECT * FROM releases ORDER BY version_code DESC LIMIT 1').get() || null;
  },
  add({ versionCode, versionName, filename, url, notes, mandatory }) {
    const info = db.prepare(
      `INSERT INTO releases (version_code, version_name, filename, url, notes, mandatory, created_at)
       VALUES (?,?,?,?,?,?,?)`
    ).run(versionCode, versionName, filename, url, notes || '', mandatory ? 1 : 0, now());
    return db.prepare('SELECT * FROM releases WHERE id = ?').get(info.lastInsertRowid);
  },
  list(limit = 20) {
    return db.prepare('SELECT * FROM releases ORDER BY version_code DESC LIMIT ?').all(limit);
  },
};

// ── audit ────────────────────────────────────────────────────────────────────
const Audit = {
  add(actor, action, detail) {
    try {
      db.prepare('INSERT INTO audit (at, actor, action, detail) VALUES (?,?,?,?)')
        .run(now(), actor || null, action, detail || '');
    } catch (e) { /* auditing must never break a request */ }
  },
  recent(limit = 100) {
    return db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT ?').all(limit);
  },
};

module.exports = {
  db, DB_FILE, DATA_DIR,
  Users, Records, Configs, Releases, Audit,
  now,
};
