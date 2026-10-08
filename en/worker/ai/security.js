// =====================================================
// LUMMET AI — Security Layer
// =====================================================

const MAX_MESSAGE_LENGTH = 500;
const RATE_LIMIT_WINDOW_MINUTES = 15;
const RATE_LIMIT_MAX_REQUESTS = 30;

// Public (anonymous, not logged in) visitors get this many free
// Lummet AI messages before they're asked to register/login.
// Logged-in users (any session with a user_id) are never gated.
export const FREE_MESSAGE_LIMIT = 3;

// Patterns that indicate prompt injection attempts
const INJECTION_PATTERNS = [
  /ignore (all |previous |prior )?(instructions|prompts|rules)/i,
  /disregard (all |previous |prior )?(instructions|prompts|rules)/i,
  /you are (now )?(not )?(an? )?(AI|assistant|chatbot|language model)/i,
  /pretend (you are|to be)/i,
  /act as (if you are|a)/i,
  /reveal (your|the) (system )?prompt/i,
  /show (me )?(your|the) (system )?prompt/i,
  /what (is|are) (your|the) (system )?(prompt|instructions|rules)/i,
  /repeat (everything|all|the text) (above|before)/i,
  /output (your|the) (system )?(prompt|instructions)/i,
  /print (your|the) (system )?(prompt|instructions)/i,
  /what (is|are) (your|the) (database|sql|query|schema)/i,
  /show (me )?(your|the) (database|sql|schema|raw json)/i,
  /expose (the )?(database|schema|implementation)/i,
  /\b(DROP|DELETE|INSERT|UPDATE|SELECT|CREATE|ALTER)\b.*\b(FROM|INTO|TABLE|SET|WHERE)\b/i,
];

/**
 * Sanitize and validate user input
 * Returns { valid, sanitized, error }
 */
export function validateInput(message) {
  if (!message || typeof message !== 'string') {
    return { valid: false, error: 'Message is required' };
  }

  const trimmed = message.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: 'Message cannot be empty' };
  }

  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return { valid: false, error: `Message too long (max ${MAX_MESSAGE_LENGTH} characters)` };
  }

  // Remove null bytes and control characters
  const sanitized = trimmed.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  return { valid: true, sanitized };
}

/**
 * Detect prompt injection attempts
 * Returns { isInjection, patterns }
 */
export function detectInjection(message) {
  const detected = [];
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(message)) {
      detected.push(pattern.source);
    }
  }
  return {
    isInjection: detected.length > 0,
    patterns: detected
  };
}

/**
 * Hash IP for rate limiting (SHA-256)
 */
export async function hashIP(ip) {
  if (!ip) return '';
  const data = new TextEncoder().encode(ip);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Check rate limit for AI chat
 * Uses D1 to track requests per IP within time window
 */
export async function checkRateLimit(db, ipHash) {
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000).toISOString();

  // Clean old entries
  await db.prepare(`
    DELETE FROM ai_rate_limits WHERE created_at < ?
  `).bind(windowStart).run();

  // Count recent requests
  const row = await db.prepare(`
    SELECT COUNT(*) as c FROM ai_rate_limits
    WHERE ip_hash = ? AND created_at >= ?
  `).bind(ipHash, windowStart).first();

  return (row?.c || 0) < RATE_LIMIT_MAX_REQUESTS;
}

/**
 * Log a request for rate limiting
 */
export async function logRequest(db, ipHash) {
  await db.prepare(`
    INSERT INTO ai_rate_limits (ip_hash, created_at) VALUES (?, ?)
  `).bind(ipHash, new Date().toISOString()).run();
}

/**
 * ── Free-tier (anonymous, pre-registration) usage quota ──
 *
 * Tracked by hashed IP rather than the client-supplied session_id so
 * clearing localStorage / opening a new tab doesn't reset the count.
 * Logged-in users (userId present) are never checked against this —
 * callers should skip calling these when a userId exists.
 */

/**
 * Returns { used, remaining, exceeded } for this IP, without
 * consuming a message. Use before deciding whether to answer.
 */
export async function getFreeMessageUsage(db, ipHash) {
  if (!ipHash) return { used: 0, remaining: FREE_MESSAGE_LIMIT, exceeded: false };

  const row = await db.prepare(`
    SELECT message_count FROM ai_free_tier_usage WHERE ip_hash = ?
  `).bind(ipHash).first();

  const used = row?.message_count || 0;
  const remaining = Math.max(0, FREE_MESSAGE_LIMIT - used);

  return { used, remaining, exceeded: used >= FREE_MESSAGE_LIMIT };
}

/**
 * Records that one free message was answered for this IP.
 * Call only after deciding to actually answer (not on a blocked request).
 */
export async function consumeFreeMessage(db, ipHash) {
  if (!ipHash) return;

  await db.prepare(`
    INSERT INTO ai_free_tier_usage (ip_hash, message_count, first_message_at, last_message_at)
    VALUES (?, 1, datetime('now'), datetime('now'))
    ON CONFLICT(ip_hash) DO UPDATE SET
      message_count = message_count + 1,
      last_message_at = datetime('now')
  `).bind(ipHash).run();
}
