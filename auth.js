const crypto = require("crypto");
const { stmts } = require("./db");

function verifyPassword(password, hash, salt) {
  const derived = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return derived === hash;
}

function createSession(userId, req) {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  stmts.createSession.run(token, userId, expires);
  // Tracking : create a user_sessions row + bump last_login_at
  try {
    const ip = req ? (req.headers["x-forwarded-for"] || req.socket.remoteAddress || null) : null;
    const ua = req ? (req.headers["user-agent"] || null) : null;
    stmts.createUserSession.run(userId, ip, ua, token);
    stmts.updateUserLastLogin.run(userId);
  } catch (e) { /* tracking best-effort */ }
  return token;
}

// Throttle last_seen updates to once per minute per token
const _lastTouch = new Map();
function _touchTracking(userId, token) {
  const now = Date.now();
  const last = _lastTouch.get(token) || 0;
  if (now - last < 60 * 1000) return;
  _lastTouch.set(token, now);
  try {
    stmts.touchUserSessionByToken.run(token);
    stmts.updateUserLastSeen.run(userId);
  } catch (e) { /* tracking best-effort */ }
}

function parseRoles(row) {
  let roles = [];
  if (row.roles) {
    try { roles = JSON.parse(row.roles); } catch (e) { roles = []; }
  }
  if (!Array.isArray(roles) || roles.length === 0) roles = [row.role];
  return roles;
}

function authenticate(req) {
  const cookieHeader = req.headers.cookie || "";
  const match = cookieHeader.match(/formalist_session=([^;]+)/);
  if (!match) return null;
  const token = match[1];
  const row = stmts.getSession.get(token);
  if (!row) return null;
  _touchTracking(row.uid, token);
  return { id: row.uid, email: row.email, name: row.name, role: row.role, roles: parseRoles(row), token };
}

function endTracking(token) {
  try { stmts.endUserSessionByToken.run(token); } catch (e) {}
  _lastTouch.delete(token);
}

function requireRole(user, ...required) {
  if (!user) return false;
  const userRoles = user.roles && user.roles.length ? user.roles : [user.role];
  return required.some(r => userRoles.includes(r));
}

// Helper unifié : retourne true si l'utilisateur a un des rôles donnés.
// Utilise user.roles[] (multi-rôles) avec fallback sur user.role legacy.
// Préfère `hasRole(user, 'admin')` plutôt que `user.role === 'admin'`.
function hasRole(user, ...required) {
  return requireRole(user, ...required);
}
function isAdmin(user) { return hasRole(user, 'admin'); }
function isAvocat(user) { return hasRole(user, 'avocat'); }
function isUser(user) { return hasRole(user, 'user'); }

function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `formalist_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400${secure}`);
}

function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `formalist_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`);
}

module.exports = { verifyPassword, createSession, authenticate, requireRole, hasRole, isAdmin, isAvocat, isUser, setSessionCookie, clearSessionCookie, endTracking };
