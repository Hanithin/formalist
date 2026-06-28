/**
 * auth-guard.js — Unified authentication check middleware
 * Replaces 20+ inline auth checks across routes
 */

const { authenticate, requireRole } = require("../auth");
const { errorResponse } = require("../lib/router");

/**
 * Guard a route handler with authentication and optional role check.
 * Returns the authenticated user or sends an error response.
 * @param {object} req
 * @param {object} res
 * @param {...string} roles - Required roles (if empty, any authenticated user)
 * @returns {object|null} - User object or null if unauthorized
 */
function authGuard(req, res, ...roles) {
  const user = authenticate(req);
  if (!user) {
    errorResponse(res, 401, "Non authentifié");
    return null;
  }
  if (roles.length > 0 && !requireRole(user, ...roles)) {
    errorResponse(res, 403, "Accès refusé");
    return null;
  }
  return user;
}

module.exports = { authGuard };
