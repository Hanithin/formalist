/**
 * router.js — URL routing and JSON response helpers
 */

function matchRoute(pathname, pattern) {
  const patternParts = pattern.split("/");
  const pathParts = pathname.split("/");
  if (patternParts.length !== pathParts.length) return null;
  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(":")) {
      params[patternParts[i].slice(1)] = pathParts[i];
    } else if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

function jsonResponse(res, statusCode, data) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function errorResponse(res, statusCode, message) {
  jsonResponse(res, statusCode, { error: message });
}

module.exports = { matchRoute, jsonResponse, errorResponse };
