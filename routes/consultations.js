/**
 * routes/consultations.js — Booking + availability for legal consultations
 */

const { authGuard } = require("../middleware/auth-guard");
const { matchRoute, jsonResponse, errorResponse } = require("../lib/router");
const { parseBody } = require("../lib/multipart");
const { stmts, db } = require("../db");

const VALID_DOMAINS = [
  "droit_societes", "fiscalite", "contrats", "droit_travail",
  "propriete_intellectuelle", "immobilier", "litige", "autre",
];

const DEFAULT_PRICE_CENTS = 9900;

// hasRole importé depuis ../auth (helper unifié multi-rôles)
const { hasRole } = require("../auth");

module.exports = function consultationsRoutes(pathname, req, res, url) {
  let params;

  // ============================================================
  // USER : list mine
  // ============================================================
  if (pathname === "/api/consultations" && req.method === "GET") {
    const user = authGuard(req, res);
    if (!user) return;
    const list = stmts.getConsultationsByUser.all(user.id);
    return jsonResponse(res, 200, { consultations: list });
  }

  // ============================================================
  // USER : create booking (payment is mocked → 'paid')
  // ============================================================
  if (pathname === "/api/consultations" && req.method === "POST") {
    return (async () => {
      const user = authGuard(req, res);
      if (!user) return;
      try {
        const body = await parseBody(req);
        const avocatId = parseInt(body.avocat_id);
        const scheduledAt = String(body.scheduled_at || "").trim();
        const domain = String(body.domain || "").trim();
        const description = String(body.description || "").trim();
        const documentsJson = body.documents_json ? JSON.stringify(body.documents_json) : null;
        const duration = parseInt(body.duration_minutes) || 30;

        if (!avocatId) return errorResponse(res, 400, "Avocat requis");
        if (!scheduledAt) return errorResponse(res, 400, "Créneau requis");
        if (!domain || VALID_DOMAINS.indexOf(domain) === -1) return errorResponse(res, 400, "Matière invalide");
        if (!description || description.length < 10) return errorResponse(res, 400, "Description trop courte (min 10 caractères)");

        const avocat = stmts.getUserById.get(avocatId);
        if (!avocat) return errorResponse(res, 400, "Avocat introuvable");
        let avocatRoles = [];
        try { avocatRoles = avocat.roles ? JSON.parse(avocat.roles) : []; } catch (_) {}
        if (avocat.role !== "avocat" && avocatRoles.indexOf("avocat") === -1 && avocat.role !== "admin" && avocatRoles.indexOf("admin") === -1) {
          return errorResponse(res, 400, "L'utilisateur ciblé n'est pas avocat");
        }

        const slotStart = new Date(scheduledAt);
        if (isNaN(slotStart.getTime())) return errorResponse(res, 400, "Date invalide");
        const slotEnd = new Date(slotStart.getTime() + duration * 60000);

        const conflicts = stmts.getConsultationsInRange.all(
          avocatId,
          new Date(slotStart.getTime() - 60 * 60000).toISOString(),
          slotEnd.toISOString(),
        );
        const conflict = conflicts.find((c) => {
          const cStart = new Date(c.scheduled_at);
          const cEnd = new Date(cStart.getTime() + (c.duration_minutes || 30) * 60000);
          return cStart < slotEnd && cEnd > slotStart;
        });
        if (conflict) return errorResponse(res, 409, "Ce créneau n'est plus disponible");

        const isBlocked = stmts.getBlockedDatesInRange.all(
          avocatId,
          slotStart.toISOString().slice(0, 10),
          slotEnd.toISOString().slice(0, 10),
        );
        if (isBlocked.length > 0) return errorResponse(res, 409, "L'avocat est indisponible à cette date");

        const result = stmts.createConsultation.run(
          user.id, avocatId,
          slotStart.toISOString(),
          duration,
          "scheduled",
          DEFAULT_PRICE_CENTS,
          description.slice(0, 100),
          null,
          domain,
          description,
          documentsJson,
          "paid",
        );

        stmts.createPayment.run(
          user.id,
          null,
          DEFAULT_PRICE_CENTS,
          "EUR",
          "Consultation juridique — " + domain,
          "paid",
          null,
          new Date().toISOString(),
        );

        return jsonResponse(res, 201, { ok: true, id: result.lastInsertRowid });
      } catch (e) {
        console.error(e);
        return errorResponse(res, 500, "Erreur lors de la réservation");
      }
    })();
  }

  // ============================================================
  // PUBLIC (auth) : list active avocats
  // ============================================================
  if (pathname === "/api/consultations/avocats" && req.method === "GET") {
    const user = authGuard(req, res);
    if (!user) return;
    const avocats = stmts.getAvocats.all();
    return jsonResponse(res, 200, { avocats: avocats });
  }

  // ============================================================
  // PUBLIC (auth) : get availability + busy slots for an avocat
  //   /api/consultations/avocats/:id/slots?from=YYYY-MM-DD&to=YYYY-MM-DD
  // ============================================================
  if ((params = matchRoute(pathname, "/api/consultations/avocats/:id/slots")) && req.method === "GET") {
    const user = authGuard(req, res);
    if (!user) return;
    const avocatId = parseInt(params.id);
    const fromStr = url.searchParams.get("from");
    const toStr = url.searchParams.get("to");
    if (!fromStr || !toStr) return errorResponse(res, 400, "Paramètres from/to requis");

    const availability = stmts.getAvailabilityByAvocat.all(avocatId);
    const blocked = stmts.getBlockedDatesInRange.all(avocatId, fromStr, toStr);
    const fromIso = new Date(fromStr + "T00:00:00Z").toISOString();
    const toIso = new Date(toStr + "T23:59:59Z").toISOString();
    const busy = stmts.getConsultationsInRange.all(avocatId, fromIso, toIso);

    return jsonResponse(res, 200, {
      availability: availability,
      blocked: blocked,
      busy: busy,
    });
  }

  // ============================================================
  // AVOCAT : list mine
  // ============================================================
  if (pathname === "/api/avocat/consultations" && req.method === "GET") {
    const user = authGuard(req, res);
    if (!user) return;
    if (!hasRole(user, "avocat") && !hasRole(user, "admin")) return errorResponse(res, 403, "Réservé aux avocats");
    const list = stmts.getConsultationsByAvocat.all(user.id);
    return jsonResponse(res, 200, { consultations: list });
  }

  // ============================================================
  // AVOCAT : accept (set meeting link)
  // ============================================================
  if ((params = matchRoute(pathname, "/api/avocat/consultations/:id/accept")) && req.method === "PUT") {
    return (async () => {
      const user = authGuard(req, res);
      if (!user) return;
      if (!hasRole(user, "avocat") && !hasRole(user, "admin")) return errorResponse(res, 403);
      try {
        const body = await parseBody(req);
        const meetingLink = String(body.meeting_link || "").trim();
        if (!meetingLink) return errorResponse(res, 400, "Lien de visio requis");
        if (!/^https?:\/\//i.test(meetingLink)) return errorResponse(res, 400, "Lien invalide");
        const c = stmts.getConsultationById.get(parseInt(params.id));
        if (!c) return errorResponse(res, 404, "Consultation introuvable");
        if (c.avocat_id !== user.id && !hasRole(user, "admin")) return errorResponse(res, 403);
        stmts.acceptConsultation.run(meetingLink, parseInt(params.id));
        return jsonResponse(res, 200, { ok: true });
      } catch (e) {
        return errorResponse(res, 500, "Erreur serveur");
      }
    })();
  }

  // ============================================================
  // AVOCAT : mark done (with notes)
  // ============================================================
  if ((params = matchRoute(pathname, "/api/avocat/consultations/:id/done")) && req.method === "PUT") {
    return (async () => {
      const user = authGuard(req, res);
      if (!user) return;
      if (!hasRole(user, "avocat") && !hasRole(user, "admin")) return errorResponse(res, 403);
      try {
        const body = await parseBody(req);
        const notes = String(body.notes || "").trim();
        const c = stmts.getConsultationById.get(parseInt(params.id));
        if (!c) return errorResponse(res, 404);
        if (c.avocat_id !== user.id && !hasRole(user, "admin")) return errorResponse(res, 403);
        stmts.markConsultationDone.run(notes, parseInt(params.id));
        return jsonResponse(res, 200, { ok: true });
      } catch (e) {
        return errorResponse(res, 500);
      }
    })();
  }

  // ============================================================
  // AVOCAT / USER : cancel (auto-refunds if avocat cancels paid)
  // ============================================================
  if ((params = matchRoute(pathname, "/api/avocat/consultations/:id/cancel")) && req.method === "PUT") {
    const user = authGuard(req, res);
    if (!user) return;
    const c = stmts.getConsultationById.get(parseInt(params.id));
    if (!c) return errorResponse(res, 404);
    const isOwner = c.user_id === user.id || c.avocat_id === user.id;
    if (!isOwner && !hasRole(user, "admin")) return errorResponse(res, 403);
    stmts.cancelConsultation.run(parseInt(params.id));
    return jsonResponse(res, 200, { ok: true });
  }

  // ============================================================
  // AVOCAT : availability CRUD
  // ============================================================
  if (pathname === "/api/avocat/availability" && req.method === "GET") {
    const user = authGuard(req, res);
    if (!user) return;
    if (!hasRole(user, "avocat") && !hasRole(user, "admin")) return errorResponse(res, 403);
    return jsonResponse(res, 200, {
      availability: stmts.getAvailabilityByAvocat.all(user.id),
      blocked: stmts.getBlockedDatesByAvocat.all(user.id),
    });
  }

  if (pathname === "/api/avocat/availability" && req.method === "POST") {
    return (async () => {
      const user = authGuard(req, res);
      if (!user) return;
      if (!hasRole(user, "avocat") && !hasRole(user, "admin")) return errorResponse(res, 403);
      try {
        const body = await parseBody(req);
        const dow = parseInt(body.day_of_week);
        const startTime = String(body.start_time || "").trim();
        const endTime = String(body.end_time || "").trim();
        const slot = parseInt(body.slot_duration_minutes) || 30;
        if (dow < 0 || dow > 6) return errorResponse(res, 400, "Jour invalide");
        if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) return errorResponse(res, 400, "Format horaire HH:MM requis");
        if (startTime >= endTime) return errorResponse(res, 400, "Heure de fin avant heure de début");
        const result = stmts.createAvailability.run(user.id, dow, startTime, endTime, slot);
        return jsonResponse(res, 201, { ok: true, id: result.lastInsertRowid });
      } catch (e) {
        return errorResponse(res, 500);
      }
    })();
  }

  if ((params = matchRoute(pathname, "/api/avocat/availability/:id")) && req.method === "DELETE") {
    const user = authGuard(req, res);
    if (!user) return;
    if (!hasRole(user, "avocat") && !hasRole(user, "admin")) return errorResponse(res, 403);
    stmts.deleteAvailability.run(parseInt(params.id), user.id);
    return jsonResponse(res, 200, { ok: true });
  }

  // ============================================================
  // AVOCAT : blocked dates (vacations) CRUD
  // ============================================================
  if (pathname === "/api/avocat/vacations" && req.method === "POST") {
    return (async () => {
      const user = authGuard(req, res);
      if (!user) return;
      if (!hasRole(user, "avocat") && !hasRole(user, "admin")) return errorResponse(res, 403);
      try {
        const body = await parseBody(req);
        const startDate = String(body.start_date || "").trim();
        const endDate = String(body.end_date || "").trim();
        const reason = String(body.reason || "").trim() || null;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return errorResponse(res, 400, "Format YYYY-MM-DD requis");
        if (startDate > endDate) return errorResponse(res, 400, "Date de fin avant date de début");
        const result = stmts.createBlockedDate.run(user.id, startDate, endDate, reason);
        return jsonResponse(res, 201, { ok: true, id: result.lastInsertRowid });
      } catch (e) {
        return errorResponse(res, 500);
      }
    })();
  }

  if ((params = matchRoute(pathname, "/api/avocat/vacations/:id")) && req.method === "DELETE") {
    const user = authGuard(req, res);
    if (!user) return;
    if (!hasRole(user, "avocat") && !hasRole(user, "admin")) return errorResponse(res, 403);
    stmts.deleteBlockedDate.run(parseInt(params.id), user.id);
    return jsonResponse(res, 200, { ok: true });
  }

  return false;
};
