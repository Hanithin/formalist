/**
 * rate-limit.js — Configurable rate limiter
 * Fixes: #7 (rate limit on login/upload)
 */

/**
 * Create a rate limiter.
 * @param {object} options
 * @param {number} options.windowMs - Window duration in ms (default: 15min)
 * @param {number} options.max - Max requests per window (default: 100)
 * @returns {function} - Rate limit checker: (req, res) => boolean (true = blocked)
 */
function createRateLimiter({ windowMs = 15 * 60 * 1000, max = 100 } = {}) {
  const store = new Map();

  // Cleanup old entries periodically
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.reset) store.delete(key);
    }
  }, windowMs).unref();

  return function rateLimitCheck(req, res) {
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    const now = Date.now();
    let entry = store.get(ip);

    if (!entry || now > entry.reset) {
      entry = { count: 0, reset: now + windowMs };
      store.set(ip, entry);
    }

    entry.count++;

    if (entry.count > max) {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Trop de requêtes. Réessayez plus tard." }));
      return true; // blocked
    }

    return false; // allowed
  };
}

module.exports = { createRateLimiter };
