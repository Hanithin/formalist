/**
 * routes/auth.js - Authentication & profile endpoints
 * POST /api/auth/login, POST /api/auth/logout, GET /api/auth/me
 * POST /api/auth/register, GET /api/auth/verify, POST /api/auth/resend-verification
 * PUT /api/auth/profile, PUT /api/auth/password
 */

const crypto = require("crypto");
const { verifyPassword, createSession, setSessionCookie, clearSessionCookie, endTracking } = require("../auth");
const { authGuard } = require("../middleware/auth-guard");
const { jsonResponse, errorResponse } = require("../lib/router");
const { parseBody } = require("../lib/multipart");
const { stmts, hashPassword } = require("../db");
const { sendVerificationEmail } = require("../lib/mail");

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MIN_PASSWORD = 8;
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

// Crée un jeton de confirmation à usage unique et envoie l'email correspondant.
// Les jetons précédents du même utilisateur sont invalidés.
async function issueVerification(user) {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  stmts.deleteEmailTokens.run(user.id, "verify");
  stmts.createEmailToken.run(token, user.id, "verify", expires);
  return sendVerificationEmail(user, token);
}

module.exports = function authRoutes(pathname, req, res, url) {

  if (pathname === "/api/auth/login" && req.method === "POST") {
    return (async () => {
      try {
        const body = await parseBody(req);
        const email = (body.email || "").trim().toLowerCase();
        const user = stmts.getUserByEmail.get(email);
        if (!user || !verifyPassword(body.password || "", user.password_hash, user.salt)) {
          return jsonResponse(res, 401, { error: "Email ou mot de passe incorrect" });
        }
        if (user.suspended) {
          return jsonResponse(res, 403, { error: "Ce compte est désactivé. Contactez le support." });
        }
        if (!user.email_verified) {
          return jsonResponse(res, 403, {
            error: "Votre adresse email n'est pas encore confirmée. Ouvrez le lien reçu par email.",
            needsVerification: true,
          });
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
        const firstName = (body.firstName || "").trim();
        const lastName = (body.lastName || "").trim();
        const email = (body.email || "").trim().toLowerCase();
        const password = body.password || "";

        if (!firstName || !lastName || !email || !password) {
          return jsonResponse(res, 400, { error: "Prénom, nom, email et mot de passe requis" });
        }
        if (firstName.length > 60 || lastName.length > 60) {
          return jsonResponse(res, 400, { error: "Prénom ou nom trop long" });
        }
        if (!EMAIL_RE.test(email)) {
          return jsonResponse(res, 400, { error: "Adresse email invalide" });
        }
        if (password.length < MIN_PASSWORD) {
          return jsonResponse(res, 400, { error: "Le mot de passe doit faire au moins " + MIN_PASSWORD + " caractères" });
        }
        if (stmts.getUserByEmail.get(email)) {
          return jsonResponse(res, 409, { error: "Un compte existe déjà avec cet email" });
        }

        // L'adresse administrateur est fournie par l'environnement, jamais en dur
        const adminEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
        const role = adminEmail && email === adminEmail ? "admin" : "user";

        const name = firstName + " " + lastName;
        const { hash, salt } = hashPassword(password);
        const info = stmts.createUserFull.run(
          email, hash, salt, name, firstName, lastName, role, JSON.stringify([role])
        );

        // Pas de session : le compte n'est utilisable qu'une fois l'adresse confirmée
        const sent = await issueVerification({ id: info.lastInsertRowid, email, first_name: firstName, name });
        return jsonResponse(res, 201, { ok: true, email, mailSent: sent.ok });
      } catch (e) {
        if (e.message && e.message.includes("UNIQUE")) {
          return jsonResponse(res, 409, { error: "Un compte existe déjà avec cet email" });
        }
        return errorResponse(res, 400, "Requête invalide");
      }
    })();
  }

  // Confirmation d'adresse : lien cliqué depuis l'email, donc réponse par redirection
  if (pathname === "/api/auth/verify" && req.method === "GET") {
    const token = url.searchParams.get("token") || "";
    const redirect = (status) => {
      res.writeHead(302, { Location: "/connexion.html?verif=" + status });
      res.end();
      return true;
    };
    const row = stmts.getEmailToken.get(token);
    if (!row || row.type !== "verify") return redirect("invalide");
    if (row.used_at) return redirect("deja");
    if (new Date(row.expires_at).getTime() < Date.now()) return redirect("expire");
    stmts.useEmailToken.run(token);
    stmts.setEmailVerified.run(row.user_id);
    return redirect("ok");
  }

  // Renvoi du lien de confirmation. Réponse volontairement identique que le compte
  // existe ou non, pour ne pas révéler quelles adresses sont inscrites.
  if (pathname === "/api/auth/resend-verification" && req.method === "POST") {
    return (async () => {
      try {
        const body = await parseBody(req);
        const email = (body.email || "").trim().toLowerCase();
        const user = EMAIL_RE.test(email) ? stmts.getUserByEmail.get(email) : null;
        if (user && !user.email_verified) await issueVerification(user);
        return jsonResponse(res, 200, { ok: true });
      } catch (e) {
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
        // Le profil peut arriver soit en prénom/nom séparés, soit en nom complet (écrans existants)
        const firstName = (body.firstName || "").trim();
        const lastName = (body.lastName || "").trim();
        const name = firstName || lastName ? (firstName + " " + lastName).trim() : (body.name || "").trim();
        const email = (body.email || "").trim().toLowerCase();
        if (!name || !email) return errorResponse(res, 400, "Nom et email requis");
        if (!EMAIL_RE.test(email)) return errorResponse(res, 400, "Adresse email invalide");
        const parts = name.split(/\s+/);
        stmts.updateUserProfile.run(name, email, user.id);
        stmts.updateUserNames.run(firstName || parts[0], lastName || parts.slice(1).join(" "), user.id);
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
        if (body.password.length < MIN_PASSWORD) return errorResponse(res, 400, "Le mot de passe doit faire au moins " + MIN_PASSWORD + " caractères");
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
