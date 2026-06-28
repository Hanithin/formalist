/**
 * sanitize.js — Input sanitization utilities
 * Prevents XSS, path traversal, and prompt injection
 */

const path = require("path");

/** Strip HTML tags from text to prevent stored XSS */
function sanitizeText(str) {
  if (typeof str !== "string") return "";
  return str.replace(/<[^>]*>/g, "").trim();
}

/** Strip HTML and truncate */
function stripHtml(str, maxLen = 5000) {
  return sanitizeText(str).slice(0, maxLen);
}

/**
 * Sanitize a filename for Content-Disposition headers.
 * Removes path components and dangerous characters.
 */
function sanitizeFilename(filename) {
  if (typeof filename !== "string") return "file";
  // Remove path components
  let safe = path.basename(filename);
  // Remove non-printable and dangerous chars
  safe = safe.replace(/[^\w.\-() ]/g, "_");
  // Prevent empty or dot-only filenames
  if (!safe || /^\.+$/.test(safe)) safe = "file";
  return safe;
}

/**
 * Sanitize AI prompt input.
 * Limits length and strips prompt injection attempts.
 */
function sanitizePrompt(str, maxLen = 500) {
  if (typeof str !== "string") return "";
  // Strip control characters and common injection patterns
  let clean = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
  // Remove attempts to override system prompts
  clean = clean.replace(/(?:ignore|oublie|forget)\s+(?:previous|précédent|all|tout|les)\s+(?:instructions?|règles?|consignes?)/gi, "");
  return clean.slice(0, maxLen).trim();
}

module.exports = { sanitizeText, stripHtml, sanitizeFilename, sanitizePrompt };
