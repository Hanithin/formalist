/**
 * routes/formalites.js — Formalités CRUD + assignment/validation
 */

const { authGuard } = require("../middleware/auth-guard");
const { hasRole } = require("../auth");
const { matchRoute, jsonResponse, errorResponse } = require("../lib/router");
const { parseBody } = require("../lib/multipart");
const { handleUpload, getField } = require("../middleware/upload");
const { stmts } = require("../db");

module.exports = function formalitesRoutes(pathname, req, res, url) {
  let params;

  if (pathname === "/api/formalites" && req.method === "POST") {
    return (async () => {
      const user = authGuard(req, res);
      if (!user) return;
      if (!hasRole(user, "user", "avocat", "admin")) return errorResponse(res, 403, "Accès refusé");
      try {
        const body = await parseBody(req);
        // Auto-assign : si l'utilisateur a le rôle avocat (primaire OU dans roles[]),
        // il devient l'avocat assigné de la formalité qu'il crée.
        const userRoles = Array.isArray(user.roles) ? user.roles : (user.role ? [user.role] : []);
        const isAvocatCreator = userRoles.indexOf("avocat") !== -1;
        // Génère une référence 6 chars aléatoire (unique)
        const CHARS = 'ABCDEFGHIJKLMNPQRSTUVWXYZ23456789';
        function genRef() {
          let s = '';
          for (let i = 0; i < 6; i++) s += CHARS[Math.floor(Math.random() * CHARS.length)];
          return s;
        }
        let reference = genRef();
        // Très improbable mais on évite la collision
        const { db } = require("../db");
        let attempts = 0;
        while (db.prepare("SELECT id FROM formalites WHERE reference = ?").get(reference) && attempts < 5) {
          reference = genRef();
          attempts++;
        }
        const result = stmts.createFormalite.run(
          user.id, body.type || "Création", body.forme || "SAS",
          body.societe || "Sans nom", body.capital || 0,
          body.offer || "starter", body.phase || 1,
          JSON.stringify(body.data || {}),
          reference
        );
        const formaliteId = result.lastInsertRowid;
        const formalite = stmts.getFormaliteById.get(formaliteId);
        if (isAvocatCreator) {
          // Avocat-created: skip verification, start at 5c, assign to self
          db.prepare("UPDATE formalites SET created_by_avocat = 1, assigned_avocat_id = ?, business_sub_phase = '5c', offer = 'business' WHERE id = ?").run(user.id, formaliteId);
        } else if (body.offer && body.offer !== "starter") {
          stmts.updateFormalite.run(formalite.phase, formalite.status, "5a", formalite.data_json, formaliteId);
        }
        // Set sub_type for modifications
        if (body.type === "modification" && body.data) {
          try {
            const dataObj = typeof body.data === "string" ? JSON.parse(body.data) : body.data;
            if (dataObj.sub_type) {
              require("../db").db.prepare("UPDATE formalites SET sub_type = ? WHERE id = ?").run(dataObj.sub_type, formaliteId);
            }
          } catch (e) { /* ignore parse errors */ }
        }
        return jsonResponse(res, 201, { ok: true, id: formaliteId });
      } catch (e) {
        return errorResponse(res, 500, "Erreur serveur");
      }
    })();
  }

  if (pathname === "/api/formalites" && req.method === "GET") {
    const user = authGuard(req, res);
    if (!user) return;
    let formalites;
    if (hasRole(user, "admin")) {
      formalites = stmts.getAllFormalites.all();
    } else if (hasRole(user, "avocat")) {
      formalites = stmts.getFormalitesByAvocatWithClient.all(user.id, user.id);
    } else {
      formalites = stmts.getFormalitesByUser.all(user.id);
    }
    formalites = formalites.map(f => {
      const unread = stmts.countUnreadMessages.get(f.id, user.id);
      return { ...f, unread_messages: unread ? unread.count : 0 };
    });
    return jsonResponse(res, 200, { formalites });
  }

  if ((params = matchRoute(pathname, "/api/formalites/:id/assign")) && req.method === "PUT") {
    return (async () => {
      const user = authGuard(req, res, "admin");
      if (!user) return;
      try {
        const body = await parseBody(req);
        const prevFormalite = stmts.getFormaliteById.get(params.id);
        const prevAvocatId = prevFormalite ? prevFormalite.assigned_avocat_id : null;
        stmts.assignAvocat.run(body.avocat_id, params.id);
        const formalite = stmts.getFormaliteById.get(params.id);
        if (formalite) {
          const newAvocat = body.avocat_id ? stmts.getUserById.get(body.avocat_id) : null;
          const prevAvocat = prevAvocatId ? stmts.getUserById.get(prevAvocatId) : null;
          // Audit : trace la passation pour que le nouvel avocat sache qui était sur le dossier
          stmts.createAuditEntry.run(
            params.id, user.id, "admin",
            "avocat_assigned", "assigned_avocat_id",
            prevAvocat ? prevAvocat.name : null,
            newAvocat ? newAvocat.name : null,
            null
          );
          // Notifications
          stmts.createNotification.run(
            formalite.user_id, "avocat_assigned",
            `Un avocat (${newAvocat ? newAvocat.name : "Avocat"}) a été assigné à votre dossier "${formalite.societe}"`,
            formalite.id
          );
          if (newAvocat && body.avocat_id) {
            stmts.createNotification.run(
              body.avocat_id, "avocat_assigned_to_you",
              prevAvocat
                ? `Dossier "${formalite.societe}" repris de ${prevAvocat.name}`
                : `Nouveau dossier assigné : "${formalite.societe}"`,
              formalite.id
            );
          }
          if (prevAvocat && prevAvocatId && prevAvocatId !== body.avocat_id) {
            stmts.createNotification.run(
              prevAvocatId, "avocat_unassigned",
              `Le dossier "${formalite.societe}" a été réassigné${newAvocat ? " à " + newAvocat.name : ""}`,
              formalite.id
            );
          }
        }
        return jsonResponse(res, 200, { ok: true });
      } catch (e) {
        return errorResponse(res, 500, "Erreur serveur");
      }
    })();
  }

  if ((params = matchRoute(pathname, "/api/formalites/:id/upgrade")) && req.method === "PUT") {
    return (async () => {
      const user = authGuard(req, res, "user");
      if (!user) return;
      try {
        const body = await parseBody(req);
        const formalite = stmts.getFormaliteById.get(params.id);
        if (!formalite) return errorResponse(res, 404, "Formalité introuvable");
        if (formalite.user_id !== user.id) return errorResponse(res, 403, "Accès refusé");
        const rank = { starter: 1, business: 2, premium: 3 };
        const newOffer = body.offer;
        if (!rank[newOffer] || rank[newOffer] <= rank[formalite.offer]) {
          return errorResponse(res, 400, "Upgrade invalide");
        }
        stmts.upgradeOffer.run(newOffer, "5a", params.id);
        return jsonResponse(res, 200, { ok: true, offer: newOffer });
      } catch (e) {
        return errorResponse(res, 500, "Erreur serveur");
      }
    })();
  }

  if ((params = matchRoute(pathname, "/api/formalites/:id/validate")) && req.method === "PUT") {
    return (async () => {
      const user = authGuard(req, res, "avocat");
      if (!user) return;
      try {
        const body = await parseBody(req);
        const subPhase = body.sub_phase || "5c";
        stmts.validateFormalite.run(subPhase, params.id);
        const formalite = stmts.getFormaliteById.get(params.id);
        if (formalite) {
          const messages = { "5c": "Votre dossier a été vérifié par l'avocat", "5d": "Votre dossier est en cours de dépôt au guichet unique", "5e": "Votre KBIS est disponible !" };
          stmts.createNotification.run(formalite.user_id, "phase_update", messages[subPhase] || "Mise à jour de votre dossier", formalite.id);
        }
        return jsonResponse(res, 200, { ok: true });
      } catch (e) {
        return errorResponse(res, 500, "Erreur serveur");
      }
    })();
  }

  if ((params = matchRoute(pathname, "/api/formalites/:id/documents/:docId/verify")) && req.method === "PUT") {
    const user = authGuard(req, res, "avocat");
    if (!user) return;
    const doc = stmts.getDocumentById.get(params.docId);
    if (!doc) return errorResponse(res, 404, "Document introuvable");
    stmts.updateDocumentStatus.run("verified", params.docId);
    stmts.clearDocumentRejection.run(params.docId);
    const formalite = stmts.getFormaliteById.get(params.id);
    if (formalite) {
      stmts.createNotification.run(formalite.user_id, "doc_verified", `Le document "${doc.name}" a été vérifié par l'avocat`, formalite.id);
      stmts.createAuditEntry.run(params.id, user.id, "avocat", "doc_verified", doc.name, null, null, null);
    }
    return jsonResponse(res, 200, { ok: true });
  }

  // POST /api/formalites/:id/documents/:docId/reject — refuse un doc + raison
  if ((params = matchRoute(pathname, "/api/formalites/:id/documents/:docId/reject")) && req.method === "POST") {
    return (async () => {
      const user = authGuard(req, res, "avocat");
      if (!user) return;
      try {
        const body = await parseBody(req);
        const reason = (body.reason || "").trim();
        if (!reason) return errorResponse(res, 400, "Une raison est requise");
        const doc = stmts.getDocumentById.get(params.docId);
        if (!doc) return errorResponse(res, 404, "Document introuvable");
        stmts.rejectDocument.run(reason, params.docId);
        const formalite = stmts.getFormaliteById.get(params.id);
        if (formalite) {
          stmts.createNotification.run(
            formalite.user_id, "doc_rejected",
            `Document à renvoyer : "${doc.name}" — ${reason}`,
            formalite.id
          );
          stmts.createAuditEntry.run(
            params.id, user.id, "avocat", "doc_rejected",
            doc.name, null, null, reason
          );
        }
        return jsonResponse(res, 200, { ok: true });
      } catch (e) {
        return errorResponse(res, 500, "Erreur serveur");
      }
    })();
  }

  if ((params = matchRoute(pathname, "/api/formalites/:id/documents")) && req.method === "GET") {
    const user = authGuard(req, res);
    if (!user) return;
    const docs = stmts.getDocsByFormalite.all(params.id);
    return jsonResponse(res, 200, { documents: docs });
  }

  if ((params = matchRoute(pathname, "/api/formalites/:id/documents")) && req.method === "POST") {
    return (async () => {
      const user = authGuard(req, res);
      if (!user) return;
      try {
        const { parts, filePart, safeName, ext } = await handleUpload(req);
        const docName = getField(parts, "doc_name") || filePart.filename;
        const docStatus = getField(parts, "status") || "uploaded";
        const docType = getField(parts, "type") || ext.slice(1);
        const replacesDocId = getField(parts, "replaces_doc_id");
        const uploadedBy = hasRole(user, "avocat") || hasRole(user, "admin") ? "avocat" : "user";
        const result = stmts.createDocument.run(params.id, docName, docType, safeName, uploadedBy, docStatus);
        // Si c'est un re-upload qui remplace un doc rejeté, on clear la rejection
        if (replacesDocId) {
          stmts.clearDocumentRejection.run(replacesDocId);
        }
        // Audit log : upload par avocat ou par user (intéressant pour traçabilité)
        stmts.createAuditEntry.run(
          params.id, user.id, user.role, "doc_uploaded",
          docName, null, null,
          replacesDocId ? "Re-upload (remplace doc #" + replacesDocId + ")" : null
        );
        return jsonResponse(res, 200, { ok: true, filename: safeName, id: result.lastInsertRowid });
      } catch (e) {
        return errorResponse(res, e.statusCode || 500, e.message);
      }
    })();
  }

  if ((params = matchRoute(pathname, "/api/formalites/:id")) && req.method === "GET") {
    const user = authGuard(req, res);
    if (!user) return;
    const formalite = stmts.getFormaliteWithClient.get(params.id) || stmts.getFormaliteById.get(params.id);
    if (!formalite) return errorResponse(res, 404, "Formalité introuvable");
    // Multi-rôles aware : admin bypass, avocat assigné OK, owner OK
    if (!hasRole(user, "admin")) {
      if (hasRole(user, "avocat")) {
        if (formalite.assigned_avocat_id !== user.id && !(formalite.created_by_avocat && formalite.user_id === user.id) && formalite.user_id !== user.id) {
          return errorResponse(res, 403, "Accès refusé");
        }
      } else if (formalite.user_id !== user.id) {
        return errorResponse(res, 403, "Accès refusé");
      }
    }
    const docs = stmts.getDocsByFormalite.all(params.id);
    const unread = stmts.countUnreadMessages.get(params.id, user.id);
    return jsonResponse(res, 200, { formalite, documents: docs, unread_messages: unread ? unread.count : 0 });
  }

  if ((params = matchRoute(pathname, "/api/formalites/:id")) && req.method === "PUT") {
    return (async () => {
      const user = authGuard(req, res);
      if (!user) return;
      try {
        const body = await parseBody(req);
        const formalite = stmts.getFormaliteById.get(params.id);
        if (!formalite) return errorResponse(res, 404, "Formalité introuvable");

        // Autorisations : user owner / avocat assigné / admin (multi-rôles aware)
        const _isAdmin = hasRole(user, "admin");
        const _isAvocat = hasRole(user, "avocat");
        if (!_isAdmin) {
          if (!_isAvocat && formalite.user_id !== user.id) return errorResponse(res, 403, "Accès refusé");
          if (_isAvocat && formalite.assigned_avocat_id !== user.id && !(formalite.created_by_avocat && formalite.user_id === user.id) && formalite.user_id !== user.id) {
            return errorResponse(res, 403, "Accès refusé");
          }
        }

        // Diff sur data_json pour audit log (avocat surtout, mais on log tout)
        let oldData = {};
        try { oldData = JSON.parse(formalite.data_json || "{}"); } catch (e) {}
        const newData = body.data_json !== undefined
          ? (typeof body.data_json === "string" ? JSON.parse(body.data_json) : body.data_json)
          : oldData;

        const changedFields = computeDiff(oldData, newData);
        const auditEntries = [];
        if ((_isAvocat || _isAdmin) && changedFields.length > 0) {
          changedFields.forEach(f => {
            auditEntries.push({
              field: f.path,
              before: f.before,
              after: f.after
            });
          });
        }

        stmts.updateFormalite.run(
          body.phase !== undefined ? body.phase : formalite.phase,
          body.status || formalite.status,
          body.business_sub_phase !== undefined ? body.business_sub_phase : formalite.business_sub_phase,
          body.data_json !== undefined ? JSON.stringify(newData) : formalite.data_json,
          params.id
        );

        // Persistance audit log
        auditEntries.forEach(e => {
          stmts.createAuditEntry.run(
            params.id, user.id, user.role, "field_update",
            e.field,
            e.before === undefined ? null : String(e.before),
            e.after === undefined ? null : String(e.after),
            body.audit_comment || null
          );
        });

        // Notification user si l'avocat (ou un admin agissant en tant qu'avocat) a modifié
        if ((_isAvocat || _isAdmin) && auditEntries.length > 0 && formalite.user_id !== user.id) {
          const n = auditEntries.length;
          stmts.createNotification.run(
            formalite.user_id, "avocat_edited",
            `Votre avocat a modifié ${n} information${n > 1 ? "s" : ""} sur "${formalite.societe}"`,
            formalite.id
          );
        }

        return jsonResponse(res, 200, { ok: true, audit_entries: auditEntries.length, entries: auditEntries });
      } catch (e) {
        return errorResponse(res, 500, "Erreur serveur");
      }
    })();
  }

  // PUT /api/formalites/:id/transition — change le statut du dossier (avocat / admin)
  // body: { status: 'en_attente_validation'|'corrections_demandees'|'valide'|'rejete'|'en_cours', comment?: string }
  if ((params = matchRoute(pathname, "/api/formalites/:id/transition")) && req.method === "PUT") {
    return (async () => {
      const user = authGuard(req, res);
      if (!user) return;
      const _isAdmin = hasRole(user, "admin");
      const _isAvocat = hasRole(user, "avocat");
      if (!_isAdmin && !_isAvocat) return errorResponse(res, 403, "Réservé aux avocats");
      try {
        const body = await parseBody(req);
        const ALLOWED = ["en_cours", "en_attente_validation", "corrections_demandees", "valide", "rejete"];
        if (!body.status || !ALLOWED.includes(body.status)) {
          return errorResponse(res, 400, "Statut invalide");
        }
        const formalite = stmts.getFormaliteById.get(params.id);
        if (!formalite) return errorResponse(res, 404, "Formalité introuvable");
        if (!_isAdmin && _isAvocat && formalite.assigned_avocat_id !== user.id && formalite.user_id !== user.id) {
          return errorResponse(res, 403, "Accès refusé");
        }
        const prev = formalite.status;
        if (prev === body.status) {
          return jsonResponse(res, 200, { ok: true, unchanged: true });
        }
        stmts.updateFormaliteStatus.run(body.status, params.id);
        // Audit log
        stmts.createAuditEntry.run(
          params.id, user.id, _isAdmin ? "admin" : "avocat",
          "status_change", "status", prev || null, body.status, body.comment || null
        );
        // Si un commentaire est fourni, on l'ajoute aussi à la messagerie (visible côté user)
        // avec un "kind" sémantique pour que la UI affiche un badge approprié.
        if (body.comment && body.comment.trim()) {
          const kindMap = {
            corrections_demandees: "correction_request",
            rejete: "rejection",
            valide: "validation",
            en_attente_validation: "validation_pending",
          };
          const messageKind = kindMap[body.status] || "status_note";
          try {
            stmts.createTypedMessage.run(params.id, user.id, String(body.comment).trim(), messageKind);
          } catch (e) {
            try { stmts.createMessage.run(params.id, user.id, String(body.comment).trim()); } catch (_) {}
          }
        }
        // Notification user — message contextualisé selon le nouveau statut
        const statusMessages = {
          en_attente_validation: `Votre dossier "${formalite.societe}" est en attente de validation par votre avocat.`,
          corrections_demandees: `Votre avocat a demandé des corrections sur votre dossier "${formalite.societe}". Consultez la messagerie.`,
          valide: `Bonne nouvelle ! Votre dossier "${formalite.societe}" a été validé par votre avocat.`,
          rejete: `Votre dossier "${formalite.societe}" a été rejeté. Consultez la messagerie pour plus d'informations.`,
          en_cours: `Votre dossier "${formalite.societe}" a été remis en cours.`,
        };
        const msg = statusMessages[body.status];
        if (msg && formalite.user_id !== user.id) {
          try {
            stmts.createNotification.run(formalite.user_id, "status_change", msg, formalite.id);
          } catch (e) {}
        }
        return jsonResponse(res, 200, { ok: true, status: body.status, previous: prev });
      } catch (e) {
        return errorResponse(res, 500, "Erreur serveur");
      }
    })();
  }

  // GET /api/formalites/:id/audit — historique
  if ((params = matchRoute(pathname, "/api/formalites/:id/audit")) && req.method === "GET") {
    const user = authGuard(req, res);
    if (!user) return;
    const formalite = stmts.getFormaliteById.get(params.id);
    if (!formalite) return errorResponse(res, 404, "Formalité introuvable");
    const _isAdmin = hasRole(user, "admin");
    const _isAvocat = hasRole(user, "avocat");
    if (!_isAdmin) {
      if (!_isAvocat && formalite.user_id !== user.id) return errorResponse(res, 403, "Accès refusé");
      if (_isAvocat && formalite.assigned_avocat_id !== user.id && formalite.user_id !== user.id) return errorResponse(res, 403, "Accès refusé");
    }
    const entries = stmts.getAuditByFormalite.all(params.id);
    return jsonResponse(res, 200, { entries });
  }

  // POST /api/formalites/:id/finalize — finalise un dossier (avocat)
  if ((params = matchRoute(pathname, "/api/formalites/:id/finalize")) && req.method === "POST") {
    const user = authGuard(req, res, "avocat");
    if (!user) return;
    const formalite = stmts.getFormaliteById.get(params.id);
    if (!formalite) return errorResponse(res, 404, "Formalité introuvable");
    if (formalite.assigned_avocat_id !== user.id && !(formalite.created_by_avocat && formalite.user_id === user.id)) {
      return errorResponse(res, 403, "Accès refusé");
    }
    stmts.finalizeFormalite.run(params.id);
    stmts.createNotification.run(
      formalite.user_id, "finalized",
      `Votre société "${formalite.societe}" est immatriculée. Le K-bis et le RBE sont disponibles dans vos documents.`,
      formalite.id
    );
    stmts.createAuditEntry.run(params.id, user.id, "avocat", "finalized", null, null, null, null);
    return jsonResponse(res, 200, { ok: true });
  }

  // GET /api/formalites/:id/annonce-text — génère le texte JAL
  if ((params = matchRoute(pathname, "/api/formalites/:id/annonce-text")) && req.method === "GET") {
    const user = authGuard(req, res);
    if (!user) return;
    const formalite = stmts.getFormaliteById.get(params.id);
    if (!formalite) return errorResponse(res, 404, "Formalité introuvable");
    if (!hasRole(user, "admin") && !hasRole(user, "avocat") && formalite.user_id !== user.id) return errorResponse(res, 403, "Accès refusé");
    const text = formalite.annonce_text || generateAnnonceText(formalite);
    return jsonResponse(res, 200, { text, cached: !!formalite.annonce_text });
  }

  // PUT /api/formalites/:id/annonce-text — sauvegarde (avocat peut éditer)
  if ((params = matchRoute(pathname, "/api/formalites/:id/annonce-text")) && req.method === "PUT") {
    return (async () => {
      const user = authGuard(req, res, "avocat");
      if (!user) return;
      try {
        const body = await parseBody(req);
        const text = (body.text || "").trim();
        if (!text) return errorResponse(res, 400, "Texte vide");
        stmts.saveAnnonceText.run(text, params.id);
        stmts.createAuditEntry.run(params.id, user.id, "avocat", "annonce_edited", null, null, null, null);
        return jsonResponse(res, 200, { ok: true });
      } catch (e) {
        return errorResponse(res, 500, "Erreur serveur");
      }
    })();
  }

  // POST /api/formalites/:id/audit — ajouter une entrée manuelle
  if ((params = matchRoute(pathname, "/api/formalites/:id/audit")) && req.method === "POST") {
    return (async () => {
      const user = authGuard(req, res);
      if (!user) return;
      try {
        const body = await parseBody(req);
        stmts.createAuditEntry.run(
          params.id, user.id, user.role, body.action || "note",
          body.target_field || null,
          body.before_value || null,
          body.after_value || null,
          body.comment || null
        );
        return jsonResponse(res, 201, { ok: true });
      } catch (e) {
        return errorResponse(res, 500, "Erreur serveur");
      }
    })();
  }

  return false;
};

// Génère le texte d'annonce légale standard à partir des données d'une formalité.
// Couvre les cas les plus fréquents : création SAS/SASU/SARL/EURL/SCI, transferts,
// changements de dénomination, modifications de capital.
function generateAnnonceText(formalite) {
  let data = {};
  try { data = JSON.parse(formalite.data_json || "{}"); } catch (e) {}

  // Helper qui essaie plusieurs clés et renvoie la première non-vide
  function pick(...keys) {
    for (const k of keys) {
      const v = data[k];
      if (v !== undefined && v !== null && v !== false && v !== "") return v;
    }
    return null;
  }
  // Helper pour extraire une partie d'une adresse complète (au cas où on n'a que ADRESSE_SIEGE)
  function extractCpVille(addr) {
    if (!addr) return { cp: null, ville: null };
    const m = String(addr).match(/(\d{5})\s+([^,\n]+)/);
    if (m) return { cp: m[1].trim(), ville: m[2].trim() };
    return { cp: null, ville: null };
  }

  const today = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  const forme = (formalite.forme || pick("FORME_JURIDIQUE", "forme_juridique") || "SAS").toUpperCase();
  const societe = formalite.societe || pick("NOM_SOCIETE", "denomination") || "[DÉNOMINATION]";
  const capital = formalite.capital || pick("CAPITAL_CHIFFRES", "CAPITAL", "capital", "nouveau_capital") || 0;
  const capitalStr = typeof capital === "number" ? capital.toLocaleString("fr-FR") : String(capital);

  // Adresse : on essaie d'abord les champs split, sinon on parse l'adresse complète
  const adresseComplete = pick("ADRESSE_SIEGE", "SIEGE_SOCIAL", "adresse_siege", "adresse");
  let adresse = adresseComplete || "[ADRESSE]";
  let cp = pick("code_postal", "CODE_POSTAL") || "";
  let ville = pick("VILLE_SOCIETE", "ville") || "";
  if ((!cp || !ville) && adresseComplete) {
    const parsed = extractCpVille(adresseComplete);
    if (!cp) cp = parsed.cp || "";
    if (!ville) ville = parsed.ville || "";
    // Si on a une adresse complète qui contient déjà CP+ville, on n'affiche plus séparément
    if (parsed.cp && parsed.ville) {
      // Garde l'adresse complète telle quelle pour le bloc Siège
    }
  }
  if (!cp) cp = "[CP]";
  if (!ville) ville = "[VILLE]";

  const objet = pick("OBJET_SOCIAL_1", "OBJET_SOCIAL", "objet_social", "objet", "activite") || "[OBJET SOCIAL]";
  const duree = pick("DUREE", "duree") || 99;
  const dirigeantComplet = pick("PRESIDENT_NOM", "GERANT_CIVILITE_NOM_PRENOM", "dirigeant_nom_complet");
  const dirigeantPrenom = pick("dirigeant_prenom") || "";
  const dirigeantNom = pick("dirigeant_nom") || "";
  const dirigeantAdresse = pick("GERANT_ADRESSE", "ADRESSE_DIRIGEANT", "dirigeant_adresse") || "[ADRESSE DU DIRIGEANT]";
  const titreDirigeant = ["SAS", "SASU"].includes(forme) ? "Président"
    : ["SARL", "EURL"].includes(forme) ? "Gérant"
    : ["SCI"].includes(forme) ? "Gérant"
    : "Représentant légal";

  // Construction du nom du dirigeant : on prend le "complet" en priorité, sinon prenom+nom
  const dirigeantStr = dirigeantComplet || (dirigeantPrenom + " " + dirigeantNom).trim() || "[NOM DU DIRIGEANT]";

  // Normalize type detection (créa avec accent OU sans, en minuscules)
  const typeLower = (formalite.type || "").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, ""); // strip accents
  const isCreation = typeLower.includes("creation");
  const isModif = typeLower.includes("modif");

  // Construit l'adresse pour le bloc Siège social en évitant les doublons CP/ville
  const siegeStr = adresseComplete
    ? adresseComplete
    : `${adresse}, ${cp} ${ville}`;
  // RCS résolu depuis le code postal (Tribunal de Commerce du département) —
  // évite d'imprimer une commune sans tribunal (ex: Sainte-Foy-lès-Lyon → Lyon).
  const { resolveRcsCity } = require("../lib/rcs");
  const rcsExplicit = pick("RCS_VILLE", "rcs_ville");
  const resolved = resolveRcsCity(cp, rcsExplicit || ville);
  const rcsVille = resolved || rcsExplicit || ville;

  if (isCreation) {
    return [
      `Aux termes d'un acte sous seing privé en date du ${today}, il a été constitué une société présentant les caractéristiques suivantes :`,
      ``,
      `Dénomination sociale : ${societe}`,
      `Forme : ${forme}`,
      `Capital social : ${capitalStr} euros`,
      `Siège social : ${siegeStr}`,
      `Objet : ${objet}`,
      `Durée : ${duree} années à compter de son immatriculation au RCS`,
      `${titreDirigeant} : ${dirigeantStr}, demeurant ${dirigeantAdresse}`,
      ``,
      `La société sera immatriculée au Registre du Commerce et des Sociétés de ${rcsVille}.`
    ].join("\n");
  }

  // Détecte le type de modif. "fermeture" / "dissolution" / "liquidation" est
  // un sous-flux distinct qu'on gère via le même générateur pour éviter de
  // dupliquer la résolution RCS et la mise en forme.
  const typeIsFermeture = typeLower.includes("fermeture") || typeLower.includes("dissolution") || typeLower.includes("liquidation") || typeLower.includes("cessation");

  if (isModif) {
    const subType = formalite.sub_type || data.sub_type || "";
    if (subType.includes("transfert") || data.nouvelle_adresse) {
      // RCS du nouveau siège résolu depuis le nouveau code postal
      const nouveauRcs = resolveRcsCity(data.nouveau_cp, data.nouvelle_ville) || data.nouvelle_ville || rcsVille;
      return [
        `Aux termes d'une décision en date du ${data.date_effet || today}, l'associé unique / les associés de la société ${societe}, ${forme} au capital de ${capitalStr} euros, a (ont) décidé de transférer le siège social :`,
        ``,
        `De : ${siegeStr}`,
        `À : ${data.nouvelle_adresse || "[NOUVELLE ADRESSE]"}, ${data.nouveau_cp || "[CP]"} ${data.nouvelle_ville || "[VILLE]"}`,
        ``,
        `Les statuts ont été modifiés en conséquence.`,
        `Mention en sera faite au RCS de ${nouveauRcs}.`
      ].join("\n");
    }
    if (subType.includes("denom") || data.nouveau_nom) {
      return [
        `Aux termes d'une décision en date du ${data.date_effet || today}, la société ${societe}, ${forme} au capital de ${capitalStr} euros, ayant son siège ${siegeStr}, a modifié sa dénomination sociale.`,
        ``,
        `Ancienne dénomination : ${societe}`,
        `Nouvelle dénomination : ${data.nouveau_nom || "[NOUVEAU NOM]"}`,
        ``,
        `Les statuts ont été modifiés en conséquence. Mention en sera faite au RCS de ${rcsVille}.`
      ].join("\n");
    }
    if (subType.includes("capital") || data.nouveau_capital) {
      const ancien = data.ancien_capital || capital;
      const nouveau = data.nouveau_capital || capital;
      return [
        `Aux termes d'une décision en date du ${data.date_effet || today}, la société ${societe}, ${forme} ayant son siège ${siegeStr}, a modifié son capital social.`,
        ``,
        `Ancien capital : ${Number(ancien).toLocaleString("fr-FR")} euros`,
        `Nouveau capital : ${Number(nouveau).toLocaleString("fr-FR")} euros`,
        ``,
        `Les statuts ont été modifiés en conséquence. Mention en sera faite au RCS de ${rcsVille}.`
      ].join("\n");
    }
  }

  // ── Fermeture / Dissolution / Liquidation ──
  if (typeIsFermeture) {
    const subTypeF = (formalite.sub_type || data.sub_type || "").toLowerCase();
    const liquidateurNom = data.liquidateur_nom || data.liquidateur || dirigeantStr;
    const liquidateurAdresse = data.liquidateur_adresse || dirigeantAdresse;
    const adresseLiq = data.adresse_liquidation || siegeStr;
    const dateEffet = data.date_effet || data.date_dissolution || today;
    // Liquidation (clôture)
    if (subTypeF.includes("liqui") && !subTypeF.includes("dissol")) {
      return [
        `Aux termes d'une décision en date du ${dateEffet}, l'associé unique / les associés de la société ${societe}, ${forme} au capital de ${capitalStr} euros, ayant son siège ${siegeStr}, a (ont) approuvé les comptes définitifs de liquidation, donné quitus au liquidateur ${liquidateurNom} et constaté la clôture de la liquidation.`,
        ``,
        `La société sera radiée du Registre du Commerce et des Sociétés de ${rcsVille}.`
      ].join("\n");
    }
    // Dissolution anticipée (ouverture de liquidation amiable)
    return [
      `Aux termes d'une décision en date du ${dateEffet}, l'associé unique / les associés de la société ${societe}, ${forme} au capital de ${capitalStr} euros, ayant son siège ${siegeStr}, a (ont) décidé la dissolution anticipée de la société, à compter du ${dateEffet}, et sa mise en liquidation amiable.`,
      ``,
      `Liquidateur : ${liquidateurNom}, demeurant ${liquidateurAdresse}.`,
      `Le siège de la liquidation est fixé à ${adresseLiq}, adresse où la correspondance devra être adressée et les actes notifiés.`,
      ``,
      `Le dépôt des actes et pièces relatifs à la liquidation sera effectué au greffe du Tribunal de Commerce de ${rcsVille}.`,
      `Mention en sera faite au RCS de ${rcsVille}.`
    ].join("\n");
  }

  // Fallback générique
  return [
    `Aux termes d'un acte en date du ${today}, modification a été apportée à la société :`,
    ``,
    `Dénomination : ${societe}`,
    `Forme : ${forme}`,
    `Capital social : ${capitalStr} euros`,
    `Siège social : ${siegeStr}`,
    ``,
    `Mention en sera faite au RCS de ${rcsVille}.`
  ].join("\n");
}

// Helpers
function computeDiff(oldObj, newObj, prefix = "") {
  const out = [];
  const keys = new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})]);
  for (const k of keys) {
    const a = oldObj ? oldObj[k] : undefined;
    const b = newObj ? newObj[k] : undefined;
    const path = prefix ? `${prefix}.${k}` : k;
    if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
      out.push(...computeDiff(a, b, path));
    } else {
      const aStr = a === undefined || a === null ? "" : (typeof a === "object" ? JSON.stringify(a) : String(a));
      const bStr = b === undefined || b === null ? "" : (typeof b === "object" ? JSON.stringify(b) : String(b));
      if (aStr !== bStr) out.push({ path, before: aStr, after: bStr });
    }
  }
  return out;
}
