/**
 * routes/contact.js — Public contact form
 */

const { jsonResponse, errorResponse } = require("../lib/router");
const { parseBody } = require("../lib/multipart");
const { stripHtml } = require("../lib/sanitize");
const { createRateLimiter } = require("../middleware/rate-limit");
const { stmts } = require("../db");

const contactRateLimit = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 3 });

module.exports = function contactRoutes(pathname, req, res, url) {

  if (pathname === "/api/contact" && req.method === "POST") {
    return (async () => {
      // Rate limit: 3 per IP per hour
      if (contactRateLimit(req, res)) return;

      try {
        const body = await parseBody(req);

        // Honeypot
        if (body.website) return jsonResponse(res, 200, { ok: true });
        // Time check
        if (body._t && body._t < 2000) return jsonResponse(res, 200, { ok: true });

        if (!body.nom || !body.prenom || !body.email || !body.sujet || !body.message) {
          return errorResponse(res, 400, "Tous les champs sont requis");
        }

        const nom = stripHtml(body.nom, 80);
        const prenom = stripHtml(body.prenom, 80);
        const email = stripHtml(body.email, 200).toLowerCase();
        const sujet = stripHtml(body.sujet, 50);
        const message = stripHtml(body.message, 5000);

        if (nom.length < 2 || prenom.length < 2 || message.length < 10) {
          return errorResponse(res, 400, "Champs trop courts");
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
          return errorResponse(res, 400, "Email invalide");
        }
        const allowedSujets = ["creation", "contrat", "facturation", "technique", "partenariat", "autre"];
        if (!allowedSujets.includes(sujet)) {
          return errorResponse(res, 400, "Sujet invalide");
        }

        stmts.createContactMessage.run(nom, prenom, email, sujet, message);
        return jsonResponse(res, 201, { ok: true });
      } catch (e) {
        return errorResponse(res, 500, "Erreur serveur");
      }
    })();
  }

  return false;
};
