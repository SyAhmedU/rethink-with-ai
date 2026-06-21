// Minimal fail-open abuse guard for the Rethink endpoint.
// In-memory only (best-effort across warm instances) — size cap + per-IP & global rate limits.
// Returns true if the request was blocked (response already sent), false to continue.
const PER_MIN = Number(process.env.RETHINK_RL_PER_MIN || 12);
const GLOBAL_PER_MIN = Number(process.env.RETHINK_RL_GLOBAL_PER_MIN || 240);
const MAX_BYTES = Number(process.env.RETHINK_MAX_BYTES || 24000);

const hits = new Map();      // ip -> [timestamps]
let globalHits = [];

function recent(arr, windowMs) {
  const cut = Date.now() - windowMs;
  return arr.filter(t => t > cut);
}

export function guard(req, res) {
  try {
    const len = Number(req.headers["content-length"] || 0);
    if (len && len > MAX_BYTES) {
      res.status(413).json({ error: "TOO_LARGE", message: "That request is too large." });
      return true;
    }

    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress || "anon";
    const mine = recent(hits.get(ip) || [], 60000);
    globalHits = recent(globalHits, 60000);

    if (mine.length >= PER_MIN) {
      res.status(429).json({ error: "RATE_LIMITED", message: "Take a breath — too many requests in a row. Try again shortly." });
      return true;
    }
    if (globalHits.length >= GLOBAL_PER_MIN) {
      res.status(429).json({ error: "BUSY", message: "Lots of people are reflecting right now — please try again in a minute." });
      return true;
    }

    mine.push(Date.now());
    hits.set(ip, mine);
    globalHits.push(Date.now());

    if (hits.size > 5000) hits.clear(); // crude memory bound
    return false;
  } catch {
    return false; // fail open
  }
}
