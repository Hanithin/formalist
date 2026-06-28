/**
 * routes/signature.js — Signature request management and signing flow
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { authGuard } = require("../middleware/auth-guard");
const { hasRole } = require("../auth");
const { matchRoute, jsonResponse, errorResponse } = require("../lib/router");
const { parseBody } = require("../lib/multipart");
const { stmts } = require("../db");

const PUBLIC = path.join(__dirname, "..", "public");

module.exports = function signatureRoutes(pathname, req, res, url) {
  let params;

  // POST — create signature requests for all associés
  if ((params = matchRoute(pathname, "/api/formalites/:id/signature-requests")) && req.method === "POST") {
    return (async () => {
      const user = authGuard(req, res, "user");
      if (!user) return;
      try {
        const formalite = stmts.getFormaliteById.get(params.id);
        if (!formalite) return errorResponse(res, 404, "Formalité introuvable");
        if (formalite.user_id !== user.id) return errorResponse(res, 403, "Accès refusé");

        const body = await parseBody(req);
        const associes = body.associes || [];
        if (associes.length === 0) return errorResponse(res, 400, "Aucun associé fourni");

        stmts.deleteSignatureRequestsByFormalite.run(params.id);

        const results = [];
        for (let i = 0; i < associes.length; i++) {
          const a = associes[i];
          const token = crypto.randomBytes(24).toString("hex");
          stmts.createSignatureRequest.run(params.id, i + 1, a.name, a.email || null, token, a.role || "Associé");
          results.push({ associe_index: i + 1, name: a.name, token, role: a.role || "Associé" });
        }
        return jsonResponse(res, 201, { ok: true, requests: results });
      } catch (e) {
        return errorResponse(res, 500, "Erreur serveur");
      }
    })();
  }

  // POST — persist creator signature
  if ((params = matchRoute(pathname, "/api/formalites/:id/signature-requests/creator")) && req.method === "POST") {
    return (async () => {
      const user = authGuard(req, res, "user");
      if (!user) return;
      try {
        const formalite = stmts.getFormaliteById.get(params.id);
        if (!formalite) return errorResponse(res, 404, "Formalité introuvable");
        if (formalite.user_id !== user.id) return errorResponse(res, 403, "Accès refusé");

        const body = await parseBody(req);
        const token = "creator-" + crypto.randomBytes(12).toString("hex");
        stmts.submitCreatorSignature.run(params.id, body.name || user.name, body.email || user.email, token, body.signature_data || null, body.paraphe_data || null);
        return jsonResponse(res, 201, { ok: true });
      } catch (e) {
        return errorResponse(res, 500, "Erreur serveur");
      }
    })();
  }

  // GET — signature tracking info
  if ((params = matchRoute(pathname, "/api/formalites/:id/signature-requests")) && req.method === "GET") {
    const user = authGuard(req, res);
    if (!user) return;
    const formalite = stmts.getFormaliteById.get(params.id);
    if (!formalite) return errorResponse(res, 404, "Formalité introuvable");
    if (!hasRole(user, "admin") && !hasRole(user, "avocat") && formalite.user_id !== user.id) return errorResponse(res, 403, "Accès refusé");
    const requests = stmts.getSignatureRequestsByFormalite.all(params.id);
    return jsonResponse(res, 200, { requests });
  }

  // GET /api/sign/:token — serve sign.html
  if ((params = matchRoute(pathname, "/api/sign/:token")) && req.method === "GET") {
    try {
      const sr = stmts.getSignatureRequestByToken.get(params.token);
      if (!sr) {
        res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
        return res.end("<h1>Lien invalide</h1><p>Ce lien de signature n'existe pas ou a expiré.</p>");
      }
      if (sr.status === "pending") {
        stmts.markSignatureOpened.run(params.token);
      }
      const signHtmlPath = path.join(PUBLIC, "sign.html");
      let html = fs.readFileSync(signHtmlPath, "utf-8");
      const signData = {
        token: sr.token,
        associeName: sr.associe_name,
        societe: sr.societe,
        forme: sr.forme,
        status: sr.status === "signed" ? "signed" : (sr.status === "pending" ? "opened" : sr.status)
      };
      html = html.replace("__SIGN_DATA__", JSON.stringify(signData));
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(html);
    } catch (e) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      return res.end("Erreur serveur");
    }
  }

  // PUT /api/sign/:token — submit signature
  if ((params = matchRoute(pathname, "/api/sign/:token")) && req.method === "PUT") {
    return (async () => {
      try {
        const sr = stmts.getSignatureRequestByToken.get(params.token);
        if (!sr) return errorResponse(res, 404, "Token invalide");
        if (sr.status === "signed") return errorResponse(res, 400, "Déjà signé");

        const body = await parseBody(req);
        if (!body.signature_data) return errorResponse(res, 400, "Signature requise");
        if (!body.paraphe_data) return errorResponse(res, 400, "Paraphe requis");

        stmts.submitSignature.run(body.signature_data, body.paraphe_data, params.token);

        const unsigned = stmts.countUnsignedRequests.get(sr.formalite_id);
        if (unsigned && unsigned.count === 0) {
          const formalite = stmts.getFormaliteById.get(sr.formalite_id);
          if (formalite && formalite.phase === 4) {
            const isBusiness = formalite.offer && formalite.offer !== "starter";
            stmts.updateFormalite.run(5, formalite.status, isBusiness ? "5a" : formalite.business_sub_phase, formalite.data_json, formalite.id);
          }
        }
        return jsonResponse(res, 200, { ok: true, all_signed: unsigned && unsigned.count === 0 });
      } catch (e) {
        return errorResponse(res, 500, "Erreur serveur");
      }
    })();
  }

  return false;
};
