/**
 * upload.js — Unified file upload handler
 * Replaces 5 duplicate upload implementations
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { parseRawBody, parseMultipart } = require("../lib/multipart");

const UPLOADS = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS, { recursive: true });

const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".docx"];

// Signature de début de fichier attendue pour chaque format accepté.
// L'extension est déclarée par le navigateur : elle se renomme, pas le contenu.
// Sans ce contrôle, un .html renommé en .pdf est stocké puis servi dans le domaine.
const SIGNATURES = {
  ".pdf": [[0x25, 0x50, 0x44, 0x46]],                    // %PDF
  ".jpg": [[0xff, 0xd8, 0xff]],
  ".jpeg": [[0xff, 0xd8, 0xff]],
  ".png": [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  ".docx": [[0x50, 0x4b, 0x03, 0x04], [0x50, 0x4b, 0x05, 0x06]], // conteneur ZIP
};

/** Le contenu correspond-il vraiment à l'extension annoncée ? */
function signatureValide(buffer, ext) {
  const attendues = SIGNATURES[ext];
  if (!attendues) return false; // format non listé : on refuse plutôt que de supposer
  return attendues.some(sig => sig.every((octet, i) => buffer[i] === octet));
}

/**
 * Parse a multipart upload and save the file.
 * @param {object} req - HTTP request
 * @param {object} options
 * @param {string[]} [options.allowedExts] - Override default allowed extensions
 * @param {number} [options.maxSize] - Max file size (default 10MB)
 * @returns {{ parts, filePart, safeName, ext }} - Parsed upload info
 */
async function handleUpload(req, options = {}) {
  const ct = req.headers["content-type"] || "";
  if (!ct.includes("multipart/form-data")) {
    throw Object.assign(new Error("multipart/form-data required"), { statusCode: 400 });
  }

  const rawBody = await parseRawBody(req, options.maxSize);
  const parts = parseMultipart(rawBody, ct);
  const filePart = parts.find(p => p.filename);

  if (!filePart) {
    throw Object.assign(new Error("No file provided"), { statusCode: 400 });
  }

  const ext = path.extname(filePart.filename).toLowerCase();
  const allowedExts = options.allowedExts || ALLOWED_EXTENSIONS;
  if (!allowedExts.includes(ext)) {
    throw Object.assign(new Error("Format non accepté"), { statusCode: 400 });
  }

  if (!signatureValide(filePart.data, ext)) {
    throw Object.assign(
      new Error("Le contenu du fichier ne correspond pas à son format"),
      { statusCode: 400 }
    );
  }

  const id = crypto.randomBytes(16).toString("hex");
  const safeName = id + ext;
  fs.writeFileSync(path.join(UPLOADS, safeName), filePart.data);

  return { parts, filePart, safeName, ext };
}

/** Get a form field value from parsed multipart parts */
function getField(parts, name) {
  const part = parts.find(p => p.name === name);
  return part ? part.data.toString() : null;
}

module.exports = { handleUpload, getField, UPLOADS, ALLOWED_EXTENSIONS, signatureValide };
