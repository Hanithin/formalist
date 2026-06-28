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

  const id = crypto.randomBytes(8).toString("hex");
  const safeName = id + ext;
  fs.writeFileSync(path.join(UPLOADS, safeName), filePart.data);

  return { parts, filePart, safeName, ext };
}

/** Get a form field value from parsed multipart parts */
function getField(parts, name) {
  const part = parts.find(p => p.name === name);
  return part ? part.data.toString() : null;
}

module.exports = { handleUpload, getField, UPLOADS, ALLOWED_EXTENSIONS };
