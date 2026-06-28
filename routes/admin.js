/**
 * routes/admin.js — Admin endpoints (stats, users, support management)
 */

const { authGuard } = require("../middleware/auth-guard");
const { matchRoute, jsonResponse, errorResponse } = require("../lib/router");
const { parseBody } = require("../lib/multipart");
const { sanitizeText } = require("../lib/sanitize");
const { broadcastSupportMessage } = require("../lib/sse");
const { stmts, hashPassword } = require("../db");

module.exports = function adminRoutes(pathname, req, res, url) {
  let params;

  if (pathname === "/api/admin/stats" && req.method === "GET") {
    const user = authGuard(req, res, "admin");
    if (!user) return;
    return jsonResponse(res, 200, {
      total: stmts.statsTotal.get().count,
      awaiting_assignment: stmts.statsAwaitingAssignment.get().count,
      in_progress: stmts.statsInProgress.get().count,
      completed: stmts.statsCompleted.get().count,
    });
  }

  if (pathname === "/api/admin/avocats" && req.method === "GET") {
    const user = authGuard(req, res, "admin");
    if (!user) return;
    return jsonResponse(res, 200, { avocats: stmts.getAvocats.all() });
  }

  // GET /api/admin/activity — feed unifié d'événements récents pour la vue admin
  // ?days=N  : fenêtre temporelle (défaut 7), ?limit=N : événements par catégorie (défaut 50)
  if (pathname === "/api/admin/activity" && req.method === "GET") {
    const user = authGuard(req, res, "admin");
    if (!user) return;
    const days = Math.max(1, Math.min(90, parseInt(url.searchParams.get("days") || "7", 10)));
    const limit = Math.max(10, Math.min(200, parseInt(url.searchParams.get("limit") || "50", 10)));
    const since = new Date(Date.now() - days * 86400 * 1000).toISOString().replace("T", " ").replace(/\.\d+Z$/, "");
    const events = [];
    try {
      stmts.getRecentAuditActivity.all(since, limit).forEach(e => {
        events.push({
          type: "audit",
          subtype: e.action,
          ts: e.created_at,
          actor_id: e.actor_id, actor_role: e.actor_role, actor_name: e.actor_name,
          formalite_id: e.formalite_id, formalite_societe: e.formalite_societe,
          target_field: e.target_field, before: e.before_value, after: e.after_value,
          comment: e.comment,
        });
      });
      stmts.getRecentPayments.all(since, limit).forEach(p => {
        events.push({
          type: "payment", subtype: p.status, ts: p.paid_at,
          actor_id: p.user_id, actor_role: "user", actor_name: p.user_name,
          formalite_id: p.formalite_id, formalite_societe: p.formalite_societe,
          amount_cents: p.amount_cents, currency: p.currency, description: p.description,
        });
      });
      stmts.getRecentConsultations.all(since, limit).forEach(c => {
        events.push({
          type: "consultation", subtype: c.status, ts: c.created_at,
          actor_id: c.user_id, actor_role: "user", actor_name: c.user_name,
          consultation_id: c.id, avocat_id: c.avocat_id, avocat_name: c.avocat_name,
          scheduled_at: c.scheduled_at, domain: c.domain,
        });
      });
      stmts.getRecentSignups.all(since, limit).forEach(u => {
        let userRoles = [];
        try { userRoles = u.roles ? JSON.parse(u.roles) : []; } catch (_) { userRoles = []; }
        const primaryRole = userRoles.length ? userRoles[0] : (u.role || "user");
        events.push({
          type: "signup", subtype: primaryRole, ts: u.created_at,
          actor_id: u.id, actor_role: primaryRole, actor_name: u.name,
          user_email: u.email,
        });
      });
      stmts.getRecentFormaliteCreations.all(since, limit).forEach(f => {
        events.push({
          type: "formalite_created", subtype: f.forme, ts: f.created_at,
          actor_id: f.user_id, actor_role: "user", actor_name: f.user_name,
          formalite_id: f.id, formalite_societe: f.societe,
        });
      });
    } catch (e) {
      return errorResponse(res, 500, "Erreur serveur");
    }
    events.sort((a, b) => String(b.ts || "").localeCompare(String(a.ts || "")));
    return jsonResponse(res, 200, { events: events.slice(0, limit * 2), days, total: events.length });
  }

  if (pathname === "/api/admin/users" && req.method === "POST") {
    return (async () => {
      const user = authGuard(req, res, "admin");
      if (!user) return;
      try {
        const body = await parseBody(req);
        if (!body.email || !body.password || !body.name) {
          return errorResponse(res, 400, "email, password et name requis");
        }
        const { hash, salt } = hashPassword(body.password);
        stmts.createUser.run(body.email, hash, salt, body.name, body.role || "avocat");
        return jsonResponse(res, 201, { ok: true });
      } catch (e) {
        if (e.message.includes("UNIQUE")) return errorResponse(res, 409, "Email déjà utilisé");
        return errorResponse(res, 500, "Erreur serveur");
      }
    })();
  }

  // Admin support
  if (pathname === "/api/admin/support" && req.method === "GET") {
    const user = authGuard(req, res, "admin");
    if (!user) return;
    const conversations = stmts.getAllSupportConversations.all();
    const active = conversations.filter(c => !c.archived);
    const archived = conversations.filter(c => c.archived);
    return jsonResponse(res, 200, { active, archived });
  }

  if ((params = matchRoute(pathname, "/api/admin/support/:userId/messages")) && req.method === "GET") {
    const user = authGuard(req, res, "admin");
    if (!user) return;
    const messages = stmts.getSupportMessages.all(params.userId);
    stmts.markSupportRead.run(params.userId, user.id);
    return jsonResponse(res, 200, { messages });
  }

  if ((params = matchRoute(pathname, "/api/admin/support/:userId/reply")) && req.method === "POST") {
    return (async () => {
      const user = authGuard(req, res, "admin");
      if (!user) return;
      try {
        const body = await parseBody(req);
        if (!body.content) return errorResponse(res, 400, "content requis");
        const content = sanitizeText(body.content);
        const userId = parseInt(params.userId);
        const result = stmts.createSupportMessage.run(userId, user.id, content, null);
        const msg = {
          id: result.lastInsertRowid,
          user_id: userId,
          sender_id: user.id,
          sender_name: user.name,
          sender_role: user.role,
          content,
          file_path: null,
          read: 0,
          created_at: new Date().toISOString()
        };
        broadcastSupportMessage(userId, msg);
        return jsonResponse(res, 201, { ok: true, message: msg });
      } catch (e) {
        return errorResponse(res, 500, "Erreur serveur");
      }
    })();
  }

  if ((params = matchRoute(pathname, "/api/admin/support/:userId/archive")) && req.method === "PUT") {
    return (async () => {
      const user = authGuard(req, res, "admin");
      if (!user) return;
      try {
        const body = await parseBody(req);
        const userId = parseInt(params.userId);
        if (body.archived) {
          stmts.archiveSupport.run(userId);
        } else {
          stmts.unarchiveSupport.run(userId);
        }
        return jsonResponse(res, 200, { ok: true });
      } catch (e) {
        return errorResponse(res, 500, "Erreur serveur");
      }
    })();
  }

  if (pathname === "/api/admin/contacts" && req.method === "GET") {
    const user = authGuard(req, res, "admin");
    if (!user) return;
    return jsonResponse(res, 200, { messages: stmts.getContactMessages.all() });
  }

  if (pathname === "/api/admin/api-usage" && req.method === "GET") {
    const user = authGuard(req, res, "admin");
    if (!user) return;
    try {
      const stats = stmts.getApiUsageStats.get();
      const today = stmts.getApiUsageToday.get();
      const week = stmts.getApiUsageWeek.get();
      const byDay = stmts.getApiUsageByDay.all();
      return jsonResponse(res, 200, { stats, today, week, byDay });
    } catch (e) {
      return errorResponse(res, 500, "Erreur serveur");
    }
  }

  // ----- Users (with stats) -----
  if (pathname === "/api/admin/users-stats" && req.method === "GET") {
    const user = authGuard(req, res, "admin");
    if (!user) return;
    return jsonResponse(res, 200, { users: stmts.getAllUsersWithStats.all() });
  }

  if ((params = matchRoute(pathname, "/api/admin/users/:id")) && req.method === "GET") {
    const user = authGuard(req, res, "admin");
    if (!user) return;
    const uid = parseInt(params.id);
    const target = stmts.getUserById.get(uid);
    if (!target) return errorResponse(res, 404, "Utilisateur introuvable");
    const fullRow = stmts.getAllUsersWithStats.all().find(u => u.id === uid) || target;
    // Si l'utilisateur a le rôle avocat, on retourne aussi les formalités où il est assigné
    let avocatFormalites = [];
    let roles = [];
    try { roles = target.roles ? JSON.parse(target.roles) : []; } catch (_) {}
    const isAvocat = target.role === "avocat" || roles.indexOf("avocat") !== -1;
    if (isAvocat) {
      avocatFormalites = stmts.getFormalitesByAvocat.all(uid);
    }
    return jsonResponse(res, 200, {
      user: fullRow,
      sessions: stmts.getUserSessions.all(uid),
      formalites: stmts.getFormalitesByUser.all(uid),
      avocat_formalites: avocatFormalites,
      payments: stmts.getPaymentsByUser.all(uid),
      consultations: stmts.getConsultationsByUser.all(uid),
    });
  }

  if ((params = matchRoute(pathname, "/api/admin/users/:id/role")) && req.method === "PUT") {
    return (async () => {
      const user = authGuard(req, res, "admin");
      if (!user) return;
      try {
        const body = await parseBody(req);
        const allowed = ["user", "avocat", "admin"];
        // Accept either { roles: [...] } or { role: '...' } (legacy single)
        let roles = Array.isArray(body.roles) ? body.roles : (body.role ? [body.role] : []);
        roles = roles.filter(r => allowed.includes(r));
        // dedupe
        roles = Array.from(new Set(roles));
        if (roles.length === 0) return errorResponse(res, 400, "Au moins un rôle requis");
        // Le rôle principal = celui avec le plus de droits si présent, sinon le premier
        const primary = roles.includes("admin") ? "admin" : roles.includes("avocat") ? "avocat" : roles[0];
        stmts.updateUserRoles.run(JSON.stringify(roles), primary, parseInt(params.id));
        return jsonResponse(res, 200, { ok: true, roles, role: primary });
      } catch (e) {
        return errorResponse(res, 500, "Erreur serveur");
      }
    })();
  }

  if ((params = matchRoute(pathname, "/api/admin/users/:id/suspend")) && req.method === "PUT") {
    return (async () => {
      const user = authGuard(req, res, "admin");
      if (!user) return;
      try {
        const body = await parseBody(req);
        stmts.updateUserSuspended.run(body.suspended ? 1 : 0, parseInt(params.id));
        return jsonResponse(res, 200, { ok: true });
      } catch (e) {
        return errorResponse(res, 500, "Erreur serveur");
      }
    })();
  }

  // ----- Formalités (all + assign) -----
  if (pathname === "/api/admin/formalites" && req.method === "GET") {
    const user = authGuard(req, res, "admin");
    if (!user) return;
    return jsonResponse(res, 200, { formalites: stmts.getAllFormalites.all() });
  }

  if ((params = matchRoute(pathname, "/api/admin/formalites/:id/assign")) && req.method === "PUT") {
    return (async () => {
      const user = authGuard(req, res, "admin");
      if (!user) return;
      try {
        const body = await parseBody(req);
        const avocatId = body.avocat_id === null || body.avocat_id === "" ? null : parseInt(body.avocat_id);
        if (avocatId != null) {
          const target = stmts.getUserById.get(avocatId);
          if (!target) return errorResponse(res, 400, "Utilisateur introuvable");
          let roles = [];
          try { roles = target.roles ? JSON.parse(target.roles) : []; } catch (_) { roles = []; }
          const hasAvocatRole = target.role === "avocat" || target.role === "admin" || roles.indexOf("avocat") !== -1 || roles.indexOf("admin") !== -1;
          if (!hasAvocatRole) return errorResponse(res, 400, "L'utilisateur doit être avocat ou admin");
        }
        const formaliteId = parseInt(params.id);
        const prevFormalite = stmts.getFormaliteById.get(formaliteId);
        const prevAvocatId = prevFormalite ? prevFormalite.assigned_avocat_id : null;
        stmts.assignFormaliteAvocat.run(avocatId, formaliteId);
        const formalite = stmts.getFormaliteById.get(formaliteId);
        if (formalite) {
          const newAvocat = avocatId ? stmts.getUserById.get(avocatId) : null;
          const prevAvocat = prevAvocatId ? stmts.getUserById.get(prevAvocatId) : null;
          stmts.createAuditEntry.run(
            formaliteId, user.id, "admin",
            "avocat_assigned", "assigned_avocat_id",
            prevAvocat ? prevAvocat.name : null,
            newAvocat ? newAvocat.name : null,
            null
          );
          if (newAvocat) {
            stmts.createNotification.run(
              formalite.user_id, "avocat_assigned",
              `Un avocat (${newAvocat.name}) a été assigné à votre dossier "${formalite.societe}"`,
              formaliteId
            );
            stmts.createNotification.run(
              avocatId, "avocat_assigned_to_you",
              prevAvocat
                ? `Dossier "${formalite.societe}" repris de ${prevAvocat.name}`
                : `Nouveau dossier assigné : "${formalite.societe}"`,
              formaliteId
            );
          }
          if (prevAvocat && prevAvocatId && prevAvocatId !== avocatId) {
            stmts.createNotification.run(
              prevAvocatId, "avocat_unassigned",
              `Le dossier "${formalite.societe}" a été réassigné${newAvocat ? " à " + newAvocat.name : ""}`,
              formaliteId
            );
          }
        }
        return jsonResponse(res, 200, { ok: true });
      } catch (e) {
        return errorResponse(res, 500, "Erreur serveur");
      }
    })();
  }

  // ----- Payments -----
  if (pathname === "/api/admin/payments" && req.method === "GET") {
    const user = authGuard(req, res, "admin");
    if (!user) return;
    return jsonResponse(res, 200, { payments: stmts.getAllPayments.all() });
  }

  if ((params = matchRoute(pathname, "/api/admin/payments/:id/refund")) && req.method === "POST") {
    const user = authGuard(req, res, "admin");
    if (!user) return;
    const p = stmts.getPaymentById.get(parseInt(params.id));
    if (!p) return errorResponse(res, 404, "Paiement introuvable");
    if (p.status !== "paid") return errorResponse(res, 400, "Seuls les paiements 'payés' peuvent être remboursés");
    stmts.refundPayment.run(parseInt(params.id));
    return jsonResponse(res, 200, { ok: true });
  }

  // ----- Consultations -----
  if (pathname === "/api/admin/consultations" && req.method === "GET") {
    const user = authGuard(req, res, "admin");
    if (!user) return;
    return jsonResponse(res, 200, { consultations: stmts.getAllConsultations.all() });
  }

  return false;
};
