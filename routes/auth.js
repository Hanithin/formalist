/**
 * routes/auth.js — Authentication & profile endpoints
 * POST /api/auth/login, POST /api/auth/logout, GET /api/auth/me
 * PUT /api/auth/profile, PUT /api/auth/password
 */

const { verifyPassword, createSession, setSessionCookie, clearSessionCookie, endTracking } = require("../auth");
const { authGuard } = require("../middleware/auth-guard");
const { jsonResponse, errorResponse } = require("../lib/router");
const { parseBody } = require("../lib/multipart");
const { stmts, hashPassword } = require("../db");

module.exports = function authRoutes(pathname, req, res, url) {

  if (pathname === "/api/auth/login" && req.method === "POST") {
    return (async () => {
      try {
        const body = await parseBody(req);
        const user = stmts.getUserByEmail.get(body.email);
        if (!user || !verifyPassword(body.password, user.password_hash, user.salt)) {
          return jsonResponse(res, 401, { error: "Email ou mot de passe incorrect" });
        }
        const token = createSession(user.id, req);
        setSessionCookie(res, token);
        return jsonResponse(res, 200, { ok: true, user: { name: user.name, email: user.email, role: user.role } });
      } catch (e) {
        return errorResponse(res, 400, "Requête invalide");
      }
    })();
  }

  if (pathname === "/api/auth/register" && req.method === "POST") {
    return (async () => {
      try {
        const body = await parseBody(req);
        const name = (body.name || "").trim();
        const email = (body.email || "").trim().toLowerCase();
        const password = body.password || "";
        if (!name || !email || !password) {
          return jsonResponse(res, 400, { error: "Nom, email et mot de passe requis" });
        }
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
          return jsonResponse(res, 400, { error: "Adresse email invalide" });
        }
        if (password.length < 6) {
          return jsonResponse(res, 400, { error: "Le mot de passe doit faire au moins 6 caractères" });
        }
        if (stmts.getUserByEmail.get(email)) {
          return jsonResponse(res, 409, { error: "Un compte existe déjà avec cet email" });
        }
        const { hash, salt } = hashPassword(password);
        const info = stmts.createUser.run(email, hash, salt, name, "user");
        const token = createSession(info.lastInsertRowid, req);
        setSessionCookie(res, token);
        return jsonResponse(res, 201, { ok: true, user: { name, email, role: "user" } });
      } catch (e) {
        if (e.message && e.message.includes("UNIQUE")) {
          return jsonResponse(res, 409, { error: "Un compte existe déjà avec cet email" });
        }
        return errorResponse(res, 400, "Requête invalide");
      }
    })();
  }

  if (pathname === "/api/auth/logout" && req.method === "POST") {
    const { authenticate } = require("../auth");
    const user = authenticate(req);
    if (user) {
      endTracking(user.token);
      stmts.deleteSession.run(user.token);
    }
    clearSessionCookie(res);
    return jsonResponse(res, 200, { ok: true });
  }

  if (pathname === "/api/auth/me" && req.method === "GET") {
    const user = authGuard(req, res);
    if (!user) return;
    const notifs = stmts.getUnreadNotifications.all(user.id);
    return jsonResponse(res, 200, { user: { id: user.id, name: user.name, email: user.email, role: user.role, roles: user.roles }, notifications: notifs.length });
  }

  if (pathname === "/api/auth/profile" && req.method === "PUT") {
    return (async () => {
      const user = authGuard(req, res);
      if (!user) return;
      try {
        const body = await parseBody(req);
        if (!body.name || !body.email) return errorResponse(res, 400, "Nom et email requis");
        stmts.updateUserProfile.run(body.name, body.email, user.id);
        return jsonResponse(res, 200, { ok: true });
      } catch (e) {
        if (e.message && e.message.includes("UNIQUE")) {
          return errorResponse(res, 409, "Cet email est déjà utilisé");
        }
        return errorResponse(res, 500, "Erreur serveur");
      }
    })();
  }

  if (pathname === "/api/auth/password" && req.method === "PUT") {
    return (async () => {
      const user = authGuard(req, res);
      if (!user) return;
      try {
        const body = await parseBody(req);
        if (!body.current || !body.password) return errorResponse(res, 400, "Mots de passe requis");
        if (body.password.length < 6) return errorResponse(res, 400, "Le mot de passe doit faire au moins 6 caractères");
        const fullUser = stmts.getUserByEmail.get(user.email);
        if (!fullUser || !verifyPassword(body.current, fullUser.password_hash, fullUser.salt)) {
          return errorResponse(res, 403, "Mot de passe actuel incorrect");
        }
        const { hash, salt } = hashPassword(body.password);
        stmts.updateUserPassword.run(hash, salt, user.id);
        return jsonResponse(res, 200, { ok: true });
      } catch (e) {
        return errorResponse(res, 500, "Erreur serveur");
      }
    })();
  }

  return false; // not handled
};
