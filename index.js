/**
 * index.js — Formalist server entry point
 * HTTP server, route wiring, static file serving
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const { stmts } = require("./db");
const { authenticate, requireRole } = require("./auth");
const { securityHeaders } = require("./middleware/security");
const { createRateLimiter } = require("./middleware/rate-limit");
const { loadAllTemplates, templateCache } = require("./lib/docx");
const { warmup } = require("./lib/pdf");

// Route modules
const authRoutes = require("./routes/auth");
const formalitesRoutes = require("./routes/formalites");
const messagesRoutes = require("./routes/messages");
const supportRoutes = require("./routes/support");
const adminRoutes = require("./routes/admin");
const contratsRoutes = require("./routes/contrats");
const documentsRoutes = require("./routes/documents");
const signatureRoutes = require("./routes/signature");
const aiRoutes = require("./routes/ai");
const contactRoutes = require("./routes/contact");
const docgenRoutes = require("./routes/docgen");
const consultationsRoutes = require("./routes/consultations");

const { MIME_TYPES } = require("./routes/documents");
const PUBLIC = path.join(__dirname, "public");

// Rate limiter for login
const loginRateLimit = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10 });

// Protected pages
const PROTECTED_PAGES = {
  "/dashboard.html": ["user", "avocat", "admin"],
  "/creation.html": ["user", "avocat", "admin"],
  "/auto-entrepreneur.html": ["user", "avocat", "admin"],
  "/modification.html": ["user", "avocat", "admin"],
  "/contrats.html": ["user", "avocat", "admin"],
  "/documents.html": ["user", "avocat", "admin"],
  "/messagerie.html": ["user", "avocat", "admin"],
  "/formalites.html": ["user", "avocat", "admin"],
  "/consultations.html": ["user", "avocat", "admin"],
  "/admin.html": ["admin"],
  "/avocat.html": ["avocat", "admin"],
};

const server = http.createServer(async (req, res) => {
  // Security headers on every response (fix #3, #6)
  if (securityHeaders(req, res)) return; // CORS preflight handled

  const url = new URL(req.url, "http://localhost");
  const pathname = url.pathname;

  // Rate limit login endpoint (fix #7)
  if (pathname === "/api/auth/login" && req.method === "POST") {
    if (loginRateLimit(req, res)) return;
  }

  // Route through all API handlers
  const handled =
    await authRoutes(pathname, req, res, url) ||
    await signatureRoutes(pathname, req, res, url) ||
    await formalitesRoutes(pathname, req, res, url) ||
    await messagesRoutes(pathname, req, res, url) ||
    await supportRoutes(pathname, req, res, url) ||
    await adminRoutes(pathname, req, res, url) ||
    await contratsRoutes(pathname, req, res, url) ||
    await documentsRoutes(pathname, req, res, url) ||
    await aiRoutes(pathname, req, res, url) ||
    await contactRoutes(pathname, req, res, url) ||
    await docgenRoutes(pathname, req, res, url) ||
    await consultationsRoutes(pathname, req, res, url);

  if (handled !== false || res.writableEnded) return;

  // Guard: if response already sent by a route handler, stop
  if (res.writableEnded || res.headersSent) return;

  // Protected pages
  if (PROTECTED_PAGES[pathname]) {
    const user = authenticate(req);
    if (!user) {
      res.writeHead(302, { Location: "/connexion.html" });
      return res.end();
    }
    if (!requireRole(user, ...PROTECTED_PAGES[pathname])) {
      res.writeHead(302, { Location: "/connexion.html" });
      return res.end();
    }
  }

  // Sur le sous-domaine app, l'entree est la page de connexion (la vitrine
  // reste sur formalist.fr / Squarespace).
  if (pathname === "/" || pathname === "/index.html") {
    res.writeHead(302, { Location: "/connexion.html" });
    return res.end();
  }

  // Static files
  const filePath = path.join(PUBLIC, pathname === "/" ? "index.html" : pathname);
  if (!filePath.startsWith(PUBLIC)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    return res.end("Forbidden");
  }

  try {
    const buf = fs.readFileSync(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(buf);
  } catch (e) {
    if (!res.headersSent) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    }
  }
});

/* Startup */
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Server running on port " + PORT);

  const templates = loadAllTemplates();
  console.log("Templates loaded:", templates.length);

  stmts.cleanSessions.run();

  console.log("Warming up LibreOffice...");
  warmup(templateCache[templates[0]]);
});
