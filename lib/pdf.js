/**
 * pdf.js — PDF conversion queue and cache
 * Uses LibreOffice headless for DOCX→PDF conversion
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");

const TEMPLATES = path.join(__dirname, "..", "templates");

// Use /dev/shm (RAM disk) if available, else fallback to ./tmp
const TMP = fs.existsSync("/dev/shm") ? "/dev/shm/formalist" : path.join(__dirname, "..", "tmp");
if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true });

/* Conversion queue — prevents concurrent LibreOffice processes (they crash) */
let conversionBusy = false;
const conversionQueue = [];

function enqueueConversion(docxBuffer) {
  return new Promise((resolve, reject) => {
    conversionQueue.push({ docxBuffer, resolve, reject });
    processQueue();
  });
}

function processQueue() {
  if (conversionBusy || conversionQueue.length === 0) return;
  conversionBusy = true;
  const { docxBuffer, resolve, reject } = conversionQueue.shift();

  convertToPdfAsync(docxBuffer)
    .then(resolve)
    .catch(reject)
    .finally(() => {
      conversionBusy = false;
      processQueue();
    });
}

function convertToPdfAsync(docxBuffer) {
  return new Promise((resolve, reject) => {
    const id = crypto.randomBytes(6).toString("hex");
    const docxPath = path.join(TMP, id + ".docx");
    const pdfPath = path.join(TMP, id + ".pdf");

    fs.writeFileSync(docxPath, docxBuffer);

    execFile(
      "soffice",
      ["--headless", "--norestore", "--convert-to", "pdf", "--outdir", TMP, docxPath],
      { timeout: 20000 },
      (err) => {
        if (err) {
          cleanup(docxPath, pdfPath);
          return reject(new Error("PDF conversion failed: " + err.message));
        }
        try {
          const pdfBuffer = fs.readFileSync(pdfPath);
          cleanup(docxPath, pdfPath);
          resolve(pdfBuffer);
        } catch (e) {
          cleanup(docxPath, pdfPath);
          reject(new Error("PDF read failed: " + e.message));
        }
      }
    );
  });
}

function cleanup(...files) {
  for (const f of files) {
    try { fs.unlinkSync(f); } catch (e) {}
  }
}

/* PDF cache — hash(template + data) → { buffer, timestamp } */
const pdfCache = new Map();
const PDF_CACHE_TTL = 5 * 60 * 1000;
const PDF_CACHE_MAX = 50;

const DOCX_LIB_PATH = path.join(__dirname, "docx.js");
function getPdfCacheKey(template, data) {
  const templatePath = path.join(TEMPLATES, path.basename(template));
  let mtime = "";
  try { mtime = fs.statSync(templatePath).mtimeMs.toString(); } catch (e) {}
  let libMtime = "";
  try { libMtime = fs.statSync(DOCX_LIB_PATH).mtimeMs.toString(); } catch (e) {}
  const raw = template + mtime + libMtime + JSON.stringify(data);
  return crypto.createHash("md5").update(raw).digest("hex");
}

function getCachedPdf(key) {
  const entry = pdfCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > PDF_CACHE_TTL) {
    pdfCache.delete(key);
    return null;
  }
  return entry.buffer;
}

function setCachedPdf(key, buffer) {
  if (pdfCache.size >= PDF_CACHE_MAX) {
    const oldest = pdfCache.keys().next().value;
    pdfCache.delete(oldest);
  }
  pdfCache.set(key, { buffer, timestamp: Date.now() });
}

/** Warm up LibreOffice (first call is slow ~3-5s) */
function warmup(templateBuf) {
  if (!templateBuf) return;
  const warmupDocx = path.join(TMP, "warmup.docx");
  fs.writeFileSync(warmupDocx, templateBuf);
  execFile(
    "soffice",
    ["--headless", "--norestore", "--convert-to", "pdf", "--outdir", TMP, warmupDocx],
    { timeout: 30000 },
    (err) => {
      cleanup(warmupDocx, path.join(TMP, "warmup.pdf"));
      if (err) {
        console.log("LibreOffice warmup failed (non-critical):", err.message);
      } else {
        console.log("LibreOffice warmed up and ready");
      }
    }
  );
}

module.exports = { enqueueConversion, getPdfCacheKey, getCachedPdf, setCachedPdf, warmup, TMP };
