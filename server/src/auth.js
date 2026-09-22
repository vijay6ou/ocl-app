'use strict';
/**
 * Authentication — bcrypt password hashes + signed JWT bearer tokens.
 *
 * This replaces the previous design, where password hashes shipped inside the APK
 * and "logging out" was impossible. Here the server owns the credentials, tokens
 * expire, and an admin can disable an account remotely.
 */
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Users, Audit } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || '';
const TOKEN_TTL = process.env.TOKEN_TTL || '30d';
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 10);

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  // Fail loudly at start-up rather than shipping a guessable signing key.
  console.error('\n✗ JWT_SECRET is missing or too short (need at least 32 characters).');
  console.error('  Generate one with:  openssl rand -hex 32\n');
  if (process.env.NODE_ENV === 'production') process.exit(1);
}

function hashPassword(plain) {
  return bcrypt.hashSync(String(plain), BCRYPT_ROUNDS);
}

function verifyPassword(plain, hash) {
  try { return bcrypt.compareSync(String(plain), String(hash)); }
  catch (e) { return false; }
}

function issueToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    JWT_SECRET || 'dev-only-insecure-secret-change-me-please-32+',
    { expiresIn: TOKEN_TTL }
  );
}

function verifyToken(token) {
  try {
    const payload = jwt.verify(token, JWT_SECRET || 'dev-only-insecure-secret-change-me-please-32+');
    const user = Users.byId(payload.sub);
    if (!user || !user.active) return null;
    return user;
  } catch (e) {
    return null;
  }
}

/** Express middleware: requires a valid token. */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const user = token ? verifyToken(token) : null;
  if (!user) return res.status(401).json({ error: 'Not signed in, or the session has expired.' });
  req.user = user;
  next();
}

/** Express middleware: requires an admin account. */
function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not signed in.' });
  if (req.user.role !== 'admin') {
    Audit.add(req.user.username, 'denied', req.method + ' ' + req.originalUrl);
    return res.status(403).json({ error: 'Administrator access is required for this action.' });
  }
  next();
}

module.exports = {
  hashPassword, verifyPassword, issueToken, verifyToken,
  requireAuth, requireAdmin, JWT_SECRET,
};
