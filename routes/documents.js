/**
 * routes/documents.js — User document vault + file serving
 */

const fs = require("fs");
const path = require("path");
const { authGuard } = require("../middleware/auth-guard");
const { hasRole } = require("../auth");
const { jsonResponse, errorResponse } = require("../lib/router");
const { handleUpload, getField, UPLOADS } = require("../middleware/upload");
const { sanitizeFilename } = require("../lib/sanitize");
const { stmts } = require("../db");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "application/javascript; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".otf": "font/otf", ".ttf": "font/ttf",
  ".woff": "font/woff", ".woff2": "font/woff2", ".json": "application/json",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pdf": "application/pdf",
};

module.exports = function documentsRoutes(pathname, req, res, url) {

  if (pathname === "/api/documents" && req.method === "GET") {
    const user = authGuard(req, res);
    if (!user) return;
    const sourceType = url.searchParams.get("type");
    const { db } = require("../db");
    let docs;
    // Admin → tous les documents de toutes les sociétés (vue complète)
    const isAdmin = hasRole(user, "admin");
    if (isAdmin) {
      if (sourceType) {
        docs = db.prepare("SELECT * FROM user_documents WHERE source_type = ? ORDER BY created_at DESC").all(sourceType);
      } else {
        docs = db.prepare("SELECT * FROM user_documents ORDER BY created_at DESC").all();
      }
    } else {
      if (sourceType) docs = stmts.getUserDocumentsByType.all(user.id, sourceType);
      else docs = stmts.getUserDocuments.all(user.id);
    }
    return jsonResponse(res, 200, { documents: docs });
  }

  if (pathname === "/api/documents" && req.method === "POST") {
    return (async () => {
      const user = authGuard(req, res);
      if (!user) return;
      try {
        const { parts, filePart, safeName, ext } = await handleUpload(req);
        const docName = getField(parts, "name") || filePart.filename;
        const sourceType = getField(parts, "source_type") || "upload";
        const category = getField(parts, "category") || null;
        const sourceId = parseInt(getField(parts, "source_id"), 10) || null;
        stmts.createUserDocument.run(user.id, sourceType, sourceId, docName, ext.slice(1), safeName, category);
        return jsonResponse(res, 201, { ok: true, filename: safeName });
      } catch (e) {
        return errorResponse(res, e.statusCode || 500, e.message || "Erreur serveur");
      }
    })();
  }

  // Serve uploaded files — Fix #4: sanitize filename in Content-Disposition
  if (pathname === "/api/file" && req.method === "GET") {
    const filePath = url.searchParams.get("path") || "";
    const safeName = path.basename(filePath);
    const fullPath = path.join(UPLOADS, safeName);
    if (!fullPath.startsWith(UPLOADS) || safeName.includes("..")) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      return res.end("Forbidden");
    }
    try {
      const buf = fs.readFileSync(fullPath);
      const ext = path.extname(safeName);
      // Si ?download=Nom.pdf → force attachment + nom custom
      // Sinon → inline (visualiser dans onglet)
      const downloadName = url.searchParams.get("download");
      let disposition;
      if (downloadName) {
        const safeCustom = sanitizeFilename(downloadName);
        disposition = `attachment; filename="${safeCustom}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`;
      } else {
        const safeDisposition = sanitizeFilename(safeName);
        disposition = `inline; filename="${safeDisposition}"`;
      }
      res.writeHead(200, {
        "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
        "Content-Disposition": disposition,
        "Content-Length": buf.length,
      });
      res.end(buf);
    } catch (e) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    }
    return;
  }

  // Generic upload endpoint
  if (pathname === "/api/upload" && req.method === "POST") {
    return (async () => {
      try {
        const { filePart, safeName } = await handleUpload(req, {
          allowedExts: [".pdf", ".jpg", ".jpeg", ".png"]
        });
        const uploadDate = new Date().toISOString();
        return jsonResponse(res, 200, { ok: true, filename: safeName, originalName: filePart.filename, uploadDate });
      } catch (e) {
        return errorResponse(res, e.statusCode || 500, e.message || "Erreur serveur");
      }
    })();
  }

  return false;
};

module.exports.MIME_TYPES = MIME_TYPES;
