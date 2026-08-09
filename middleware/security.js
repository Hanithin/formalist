/**
 * security.js — Security headers middleware
 * Fixes: #3 (CSP, X-Frame-Options, X-Content-Type-Options), #6 (CORS)
 */

const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || "").split(",").filter(Boolean);

const METHODES_MUTANTES = ["POST", "PUT", "PATCH", "DELETE"];

/**
 * Refuse une requête modifiante venue d'un autre site.
 *
 * Le cookie est en SameSite=Lax, ce qui écarte déjà l'essentiel des requêtes
 * inter-sites, mais pas toutes. On exige donc que l'origine annoncée soit la nôtre.
 *
 * Une requête sans en-tête Origin est acceptée : les navigateurs en envoient un sur
 * toute requête modifiante, mais les appels serveur à serveur et les anciens clients
 * n'en ont pas, et les refuser casserait des usages légitimes sans rien protéger de
 * plus - une attaque inter-sites passe forcément par un navigateur.
 */
function origineAcceptee(req) {
  if (!METHODES_MUTANTES.includes(req.method)) return true;

  const origin = req.headers.origin;
  if (!origin) return true;

  if (ALLOWED_ORIGINS.includes(origin)) return true;

  // En développement, l'origine attendue est celle de l'hôte appelé
  const host = req.headers.host;
  if (host && (origin === "http://" + host || origin === "https://" + host)) return true;

  return false;
}

function securityHeaders(req, res) {
  // CSP — prevent inline script injection (except unsafe-inline for legacy)
  res.setHeader("Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net; img-src 'self' data: blob:; connect-src 'self' https://api-adresse.data.gouv.fr https://geo.api.gouv.fr https://recherche-entreprises.api.gouv.fr; frame-src 'self' blob:; frame-ancestors 'self'"
  );
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // CORS
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.length > 0) {
    if (ALLOWED_ORIGINS.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
  }

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return true; // signal: request handled
  }

  if (!origineAcceptee(req)) {
    res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Origine non autorisée" }));
    return true; // signal: request handled
  }

  return false; // signal: continue processing
}

module.exports = { securityHeaders, origineAcceptee };
