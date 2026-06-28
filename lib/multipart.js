/**
 * multipart.js — Body parsing utilities (JSON, raw, multipart)
 */

const MAX_JSON_SIZE = 1 * 1024 * 1024; // 1MB limit for JSON bodies

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_JSON_SIZE) {
        req.destroy();
        return reject(new Error("Request body too large"));
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

function parseRawBody(req, maxSize = 10 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxSize) { req.destroy(); return reject(new Error("File too large")); }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function parseMultipart(buf, contentType) {
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^\s;]+))/);
  if (!boundaryMatch) throw new Error("No boundary in content-type");
  const boundary = boundaryMatch[1] || boundaryMatch[2];
  const boundaryBuf = Buffer.from("--" + boundary);

  const parts = [];
  let start = bufferIndexOf(buf, boundaryBuf, 0);
  if (start === -1) return parts;

  while (true) {
    start += boundaryBuf.length;
    if (buf[start] === 0x2d && buf[start + 1] === 0x2d) break;
    start += 2;

    const headerEnd = bufferIndexOf(buf, Buffer.from("\r\n\r\n"), start);
    if (headerEnd === -1) break;
    const headerStr = buf.slice(start, headerEnd).toString();

    const bodyStart = headerEnd + 4;
    const bodyEnd = bufferIndexOf(buf, boundaryBuf, bodyStart);
    if (bodyEnd === -1) break;

    const body = buf.slice(bodyStart, bodyEnd - 2);
    const nameMatch = headerStr.match(/name="([^"]+)"/);
    const filenameMatch = headerStr.match(/filename="([^"]+)"/);
    const ctMatch = headerStr.match(/Content-Type:\s*(.+)/i);

    parts.push({
      name: nameMatch ? nameMatch[1] : "",
      filename: filenameMatch ? filenameMatch[1] : null,
      contentType: ctMatch ? ctMatch[1].trim() : null,
      data: body,
    });

    start = bodyEnd;
  }
  return parts;
}

function bufferIndexOf(buf, search, fromIndex) {
  for (let i = fromIndex; i <= buf.length - search.length; i++) {
    let found = true;
    for (let j = 0; j < search.length; j++) {
      if (buf[i + j] !== search[j]) { found = false; break; }
    }
    if (found) return i;
  }
  return -1;
}

module.exports = { parseBody, parseRawBody, parseMultipart };
