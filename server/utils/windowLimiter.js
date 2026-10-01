/** Fixed-window in-memory request counter, keyed by e.g. IP, email or user id. */
function createWindowLimiter({ windowMs, max }) {
  const hits = new Map();
  return {
    hit(key) {
      const now = Date.now();
      if (hits.size > 10000) {
        for (const [k, entry] of hits) if (entry.resetAt <= now) hits.delete(k);
      }
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= now) {
        hits.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, retryAfterSec: 0 };
      }
      entry.count += 1;
      return { allowed: entry.count <= max, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
    },
  };
}

module.exports = { createWindowLimiter };
