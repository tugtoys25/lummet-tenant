// ── Turnstile verification ──

export async function verifyTurnstile(token, env) {
  // No secret configured = Turnstile is not enabled for this site (the default for a newly provisioned one; the control
  // plane forwards one when the operator sets it). The attempt limiter still applies. With a secret set, a valid
  // token is always required.
  if (!env.TURNSTILE_SECRET) return true;
  if (!token) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: env.TURNSTILE_SECRET || "",
        response: token
      })
    });
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}

// ── Brute-force rate limiter (D1-based, IP hashed) ──
export async function checkRateLimit(env, ipHash, action) {
  const windowMinutes = 15;
  const maxAttempts = 5;
  const now = Date.now();
  const windowStart = new Date(now - windowMinutes * 60 * 1000).toISOString();

  // Clean old entries
  await env.DB.prepare(`
    DELETE FROM auth_attempts WHERE created_at < ?
  `).bind(windowStart).run();

  // Count recent failures
  const row = await env.DB.prepare(`
    SELECT COUNT(*) as c FROM auth_attempts
    WHERE ip_hash = ? AND action = ? AND created_at >= ?
  `).bind(ipHash, action, windowStart).first();

  return (row?.c || 0) < maxAttempts;
}

export async function logFailedAttempt(env, ipHash, action) {
  await env.DB.prepare(`
    INSERT INTO auth_attempts (ip_hash, action, created_at)
    VALUES (?, ?, ?)
  `).bind(ipHash, action, new Date().toISOString()).run();
}

export async function hashIPForAuth(ip) {
  if (!ip) return "";
  const data = new TextEncoder().encode(ip);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * SHA-256 hex digest of an arbitrary string. Used to store password
 * reset tokens as a hash (same principle as password_hash on `users`)
 * so a leaked password_resets row isn't itself usable to reset an
 * account -- the raw token only ever exists in the emailed link.
 */
export async function sha256Hex(value) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generates a random URL-safe token for one-time links (password
 * reset, newsletter confirm/unsubscribe).
 */
export function generateToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Session cookie domain — so the login cookie set on the main tenant
 * domain (e.g. freewin.xyz) is also readable on its `lummet.` chat
 * subdomain (lummet.freewin.xyz), letting Lummet AI recognize a
 * logged-in visitor and continue their conversation into the account.
 *
 * Returns null (host-only cookie, previous behavior) for localhost,
 * bare IPs, or any hostname with no dot -- Domain= is invalid/rejected
 * by browsers there (local dev / wrangler dev).
 */
export function getCookieDomain(request) {
  try {
    let hostname = new URL(request.url).hostname;
    if (!hostname || hostname === "localhost" || !hostname.includes(".") ||
        /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
      return null;
    }
    if (hostname.startsWith("www.")) hostname = hostname.slice(4);
    return `.${hostname}`;
  } catch {
    return null;
  }
}

export function sessionCookieHeader(token, request) {
  const domain = getCookieDomain(request);
  return `session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax${domain ? `; Domain=${domain}` : ""}`;
}
