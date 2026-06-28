/**
 * routes/contrats.js — Contract management CRUD
 */

const { authGuard } = require("../middleware/auth-guard");
const { hasRole } = require("../auth");
const { matchRoute, jsonResponse, errorResponse } = require("../lib/router");
const { parseBody } = require("../lib/multipart");
const { stmts } = require("../db");

module.exports = function contratsRoutes(pathname, req, res, url) {
  let params;

  if (pathname === "/api/contrats" && req.method === "POST") {
    return (async () => {
      const user = authGuard(req, res, "user");
      if (!user) return;
      try {
        const body = await parseBody(req);
        const result = stmts.createContrat.run(user.id, body.type || "bail_commercial", body.titre || "Sans titre", JSON.stringify(body.data || {}));
        return jsonResponse(res, 201, { ok: true, id: result.lastInsertRowid });
      } catch (e) {
        return errorResponse(res, 500, "Erreur serveur");
      }
    })();
  }

  if (pathname === "/api/contrats" && req.method === "GET") {
    const user = authGuard(req, res);
    if (!user) return;
    let contrats;
    if (hasRole(user, "admin")) {
      contrats = stmts.getAllContrats.all();
    } else {
      contrats = stmts.getContratsByUser.all(user.id);
    }
    return jsonResponse(res, 200, { contrats });
  }

  if ((params = matchRoute(pathname, "/api/contrats/:id")) && req.method === "GET") {
    const user = authGuard(req, res);
    if (!user) return;
    const contrat = stmts.getContratById.get(params.id);
    if (!contrat) return errorResponse(res, 404, "Contrat introuvable");
    // Admin/avocat peuvent voir tout ; user voit ses propres contrats uniquement
    if (!hasRole(user, "admin") && !hasRole(user, "avocat") && contrat.user_id !== user.id) {
      return errorResponse(res, 403, "Accès refusé");
    }
    return jsonResponse(res, 200, { contrat });
  }

  if ((params = matchRoute(pathname, "/api/contrats/:id")) && req.method === "PUT") {
    return (async () => {
      const user = authGuard(req, res);
      if (!user) return;
      try {
        const body = await parseBody(req);
        const contrat = stmts.getContratById.get(params.id);
        if (!contrat) return errorResponse(res, 404, "Contrat introuvable");
        stmts.updateContrat.run(
          body.titre || contrat.titre,
          body.status || contrat.status,
          body.data_json !== undefined ? JSON.stringify(body.data_json) : contrat.data_json,
          body.file_path || contrat.file_path,
          params.id
        );
        return jsonResponse(res, 200, { ok: true });
      } catch (e) {
        return errorResponse(res, 500, "Erreur serveur");
      }
    })();
  }

  return false;
};
