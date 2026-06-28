/**
 * routes/support.js — User support chat
 */

const { authGuard } = require("../middleware/auth-guard");
const { jsonResponse, errorResponse } = require("../lib/router");
const { parseBody } = require("../lib/multipart");
const { handleUpload } = require("../middleware/upload");
const { sanitizeText } = require("../lib/sanitize");
const { addSupportSSEClient, broadcastSupportMessage } = require("../lib/sse");
const { stmts } = require("../db");

module.exports = function supportRoutes(pathname, req, res, url) {

  if (pathname === "/api/support" && req.method === "GET") {
    const user = authGuard(req, res);
    if (!user) return;
    const messages = stmts.getSupportMessages.all(user.id);
    stmts.markSupportRead.run(user.id, user.id);
    return jsonResponse(res, 200, { messages });
  }

  if (pathname === "/api/support" && req.method === "POST") {
    return (async () => {
      const user = authGuard(req, res);
      if (!user) return;
      try {
        const ct = req.headers["content-type"] || "";
        let content = null;
        let filePath = null;

        if (ct.includes("multipart/form-data")) {
          const { parts, filePart, safeName } = await handleUpload(req);
          const contentPart = parts.find(p => p.name === "content");
          if (contentPart) content = sanitizeText(contentPart.data.toString());
          filePath = safeName;
          if (!content) content = filePart.filename;
        } else {
          const body = await parseBody(req);
          content = sanitizeText(body.content);
        }

        if (!content && !filePath) return errorResponse(res, 400, "content requis");
        stmts.ensureSupportConversation.run(user.id);
        stmts.reactivateSupportConversation.run(user.id);
        const result = stmts.createSupportMessage.run(user.id, user.id, content, filePath);
        const msg = {
          id: result.lastInsertRowid,
          user_id: user.id,
          sender_id: user.id,
          sender_name: user.name,
          sender_role: user.role,
          content,
          file_path: filePath,
          read: 0,
          created_at: new Date().toISOString()
        };
        broadcastSupportMessage(user.id, msg);
        // Notifie tous les admins qu'un message support vient d'arriver
        try {
          const admins = stmts.getAdmins.all();
          const notif = `Nouveau message support de ${user.name}`;
          admins.forEach(a => stmts.createNotification.run(a.id, "support_message", notif, null));
        } catch (e) { /* notification best-effort */ }
        return jsonResponse(res, 201, { ok: true, message: msg });
      } catch (e) {
        return errorResponse(res, e.statusCode || 500, e.message || "Erreur serveur");
      }
    })();
  }

  if (pathname === "/api/support/stream" && req.method === "GET") {
    const user = authGuard(req, res);
    if (!user) return;
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(":ok\n\n");
    addSupportSSEClient(user.id, res);
    return;
  }

  if (pathname === "/api/support/unread" && req.method === "GET") {
    const user = authGuard(req, res);
    if (!user) return;
    const result = stmts.countUnreadSupport.get(user.id, user.id);
    return jsonResponse(res, 200, { count: result ? result.count : 0 });
  }

  return false;
};
