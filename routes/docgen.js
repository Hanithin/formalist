/**
 * routes/docgen.js — Document generation (DOCX, PDF, signed PDF)
 * Fixes: #4 (path traversal in Content-Disposition)
 */

const path = require("path");
const { authGuard } = require("../middleware/auth-guard");
const { hasRole } = require("../auth");
const { matchRoute, jsonResponse, errorResponse } = require("../lib/router");
const { parseBody } = require("../lib/multipart");
const { sanitizeFilename } = require("../lib/sanitize");
const { templateCache, generateDocx, generateDocxFromBuffer, injectSignature } = require("../lib/docx");
const { enqueueConversion } = require("../lib/pdf");
const { stmts } = require("../db");

const MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

module.exports = function docgenRoutes(pathname, req, res, url) {
  let params;

  // Generate DOCX
  if (pathname === "/api/generate-doc" && req.method === "POST") {
    return (async () => {
      try {
        const body = await parseBody(req);
        if (!body.template || !body.data) return errorResponse(res, 400, "template and data required");

        const safeName = path.basename(body.template);
        if (!templateCache[safeName]) return errorResponse(res, 404, "template not found");

        const docBuffer = generateDocx(safeName, body.data);
        // Fix #4: sanitize filename
        const filename = sanitizeFilename(body.filename || safeName);

        res.writeHead(200, {
          "Content-Type": MIME_DOCX,
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Content-Length": docBuffer.length,
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache",
          "Expires": "0",
        });
        res.end(docBuffer);
      } catch (e) {
        return errorResponse(res, 500, "Erreur de génération");
      }
    })();
  }

  // Generate PDF (always fresh, queued)
  if (pathname === "/api/generate-pdf" && req.method === "POST") {
    return (async () => {
      try {
        const body = await parseBody(req);
        if (!body.template || !body.data) return errorResponse(res, 400, "template and data required");

        const safeName = path.basename(body.template);
        if (!templateCache[safeName]) return errorResponse(res, 404, "template not found");

        const docBuffer = generateDocx(safeName, body.data);
        const pdfBuffer = await enqueueConversion(docBuffer);

        const filename = sanitizeFilename((body.filename || safeName).replace(/\.docx$/i, ".pdf"));
        const disposition = body.preview ? "inline" : "attachment";

        res.writeHead(200, {
          "Content-Type": "application/pdf",
          "Content-Disposition": `${disposition}; filename="${filename}"`,
          "Content-Length": pdfBuffer.length,
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache",
          "Expires": "0",
        });
        res.end(pdfBuffer);
      } catch (e) {
        return errorResponse(res, 500, "Erreur de conversion PDF");
      }
    })();
  }

  // List templates
  if (pathname === "/api/templates" && req.method === "GET") {
    return jsonResponse(res, 200, { templates: Object.keys(templateCache) });
  }

  // Generate signed PDF (all DB signatures)
  if ((params = matchRoute(pathname, "/api/formalites/:id/generate-signed-pdf")) && req.method === "POST") {
    return (async () => {
      const user = authGuard(req, res);
      if (!user) return;
      try {
        const formalite = stmts.getFormaliteById.get(params.id);
        if (!formalite) return errorResponse(res, 404, "Formalité introuvable");
        if (!hasRole(user, "admin") && !hasRole(user, "avocat") && formalite.user_id !== user.id) return errorResponse(res, 403, "Accès refusé");

        const body = await parseBody(req);
        if (!body.template || !body.data) return errorResponse(res, 400, "template and data required");

        const safeName = path.basename(body.template);
        if (!templateCache[safeName]) return errorResponse(res, 404, "template not found");

        let docBuffer = generateDocxFromBuffer(templateCache[safeName], body.data);

        const signatures = stmts.getSignedSignatures.all(params.id);
        for (let si = 0; si < signatures.length; si++) {
          docBuffer = injectSignature(docBuffer, signatures[si].signature_data, signatures[si].associe_name, si + 1);
        }

        const pdfBuffer = await enqueueConversion(docBuffer);
        const filename = sanitizeFilename((body.filename || safeName).replace(/\.docx$/i, ".pdf"));

        res.writeHead(200, {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Content-Length": pdfBuffer.length,
        });
        res.end(pdfBuffer);
      } catch (e) {
        return errorResponse(res, 500, "Erreur de génération PDF signé");
      }
    })();
  }

  // Sign document (single signature)
  if (pathname === "/api/sign-document" && req.method === "POST") {
    return (async () => {
      try {
        const body = await parseBody(req);
        if (!body.template || !body.data) return errorResponse(res, 400, "template and data required");

        const safeName = path.basename(body.template);
        if (!templateCache[safeName]) return errorResponse(res, 404, "template not found");

        let docBuffer = generateDocxFromBuffer(templateCache[safeName], body.data);

        if (body.signatureBase64) {
          docBuffer = injectSignature(docBuffer, body.signatureBase64, body.signerName || "");
        }

        const pdfBuffer = await enqueueConversion(docBuffer);
        const filename = sanitizeFilename((body.filename || safeName).replace(/\.docx$/i, ".pdf"));

        res.writeHead(200, {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Content-Length": pdfBuffer.length,
        });
        res.end(pdfBuffer);
      } catch (e) {
        return errorResponse(res, 500, "Erreur de signature");
      }
    })();
  }

  return false;
};
