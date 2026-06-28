/**
 * routes/messages.js — Chat messages between user and avocat
 * Fixes: #10 (XSS stored — sanitize content before DB insert)
 */

const { authGuard } = require("../middleware/auth-guard");
const { hasRole } = require("../auth");
const { jsonResponse, errorResponse } = require("../lib/router");
const { parseBody } = require("../lib/multipart");
const { handleUpload, getField } = require("../middleware/upload");
const { sanitizeText } = require("../lib/sanitize");
const { addSSEClient, broadcastMessage } = require("../lib/sse");
const { stmts } = require("../db");

module.exports = function messagesRoutes(pathname, req, res, url) {

  if (pathname === "/api/messages/conversations" && req.method === "GET") {
    const user = authGuard(req, res, "avocat");
    if (!user) return;
    const conversations = stmts.getConversationsList.all(user.id, user.id);
    return jsonResponse(res, 200, { conversations });
  }

  if (pathname === "/api/messages" && req.method === "POST") {
    return (async () => {
      const user = authGuard(req, res);
      if (!user) return;
      try {
        const contentType = req.headers["content-type"] || "";
        const ALLOWED_KINDS = ["text", "correction_request", "rejection", "validation", "validation_pending", "document_request", "status_note"];
        let formaliteId, content, filePath = null, replyToId = null;
        // Kind: depuis header (X-Message-Kind) ou body
        let kind = sanitizeText(req.headers["x-message-kind"] || "").trim();

        if (contentType.includes("multipart/form-data")) {
          const { parts, filePart, safeName } = await handleUpload(req);
          formaliteId = getField(parts, "formalite_id");
          content = sanitizeText(getField(parts, "content") || filePart.filename).slice(0, 5000);
          filePath = safeName;
          const rid = getField(parts, "reply_to_id");
          if (rid && /^\d+$/.test(String(rid))) replyToId = parseInt(rid, 10);
          const bodyKind = getField(parts, "kind");
          if (bodyKind) kind = sanitizeText(bodyKind).trim();
        } else {
          const body = await parseBody(req);
          formaliteId = body.formalite_id;
          content = sanitizeText(body.content || "").slice(0, 5000);
          if (body.reply_to_id && /^\d+$/.test(String(body.reply_to_id))) replyToId = parseInt(body.reply_to_id, 10);
          if (body.kind) kind = sanitizeText(body.kind).trim();
        }

        if (!formaliteId || !content) return errorResponse(res, 400, "formalite_id et content requis");
        if (kind && !ALLOWED_KINDS.includes(kind)) kind = "text";
        let result;
        if (filePath) {
          result = stmts.createMessageWithFile.run(formaliteId, user.id, content, filePath);
        } else if (replyToId && kind && kind !== "text") {
          // Cas combiné kind + reply : créé message simple puis update colonnes
          result = stmts.createMessage.run(formaliteId, user.id, content);
          stmts.updateMessageKindAndReply.run(kind, replyToId, result.lastInsertRowid);
        } else if (replyToId) {
          result = stmts.createMessageWithReply.run(formaliteId, user.id, content, replyToId);
        } else if (kind && kind !== "text") {
          result = stmts.createTypedMessage.run(formaliteId, user.id, content, kind);
        } else {
          result = stmts.createMessage.run(formaliteId, user.id, content);
        }
        const msg = {
          id: result.lastInsertRowid,
          formalite_id: formaliteId,
          sender_id: user.id,
          sender_name: user.name,
          sender_role: user.role,
          content,
          file_path: filePath,
          reply_to_id: replyToId,
          kind: kind || "text",
          read: 0,
          created_at: new Date().toISOString()
        };
        broadcastMessage(formaliteId, msg);
        const formalite = stmts.getFormaliteById.get(formaliteId);
        if (formalite) {
          const targetId = (hasRole(user, "avocat") || hasRole(user, "admin")) ? formalite.user_id : formalite.assigned_avocat_id;
          if (targetId) {
            stmts.createNotification.run(targetId, "new_message", `Nouveau message de ${user.name}`, formaliteId);
          }
        }
        return jsonResponse(res, 201, { ok: true, message: msg });
      } catch (e) {
        return errorResponse(res, 500, "Erreur serveur");
      }
    })();
  }

  if (pathname === "/api/messages" && req.method === "GET") {
    const user = authGuard(req, res);
    if (!user) return;
    const formaliteId = url.searchParams.get("formalite_id");
    if (!formaliteId) return errorResponse(res, 400, "formalite_id requis");
    const messages = stmts.getMessagesByFormalite.all(formaliteId);
    return jsonResponse(res, 200, { messages });
  }

  if (pathname === "/api/messages/stream" && req.method === "GET") {
    const user = authGuard(req, res);
    if (!user) return;
    const formaliteId = url.searchParams.get("formalite_id");
    if (!formaliteId) return errorResponse(res, 400, "formalite_id requis");
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(":ok\n\n");
    addSSEClient(formaliteId, res, user.id);
    return;
  }

  if (pathname === "/api/messages/read" && req.method === "PUT") {
    const user = authGuard(req, res);
    if (!user) return;
    const formaliteId = url.searchParams.get("formalite_id");
    if (!formaliteId) return errorResponse(res, 400, "formalite_id requis");
    stmts.markMessagesRead.run(formaliteId, user.id);
    return jsonResponse(res, 200, { ok: true });
  }

  return false;
};
