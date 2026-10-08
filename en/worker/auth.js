// =====================================================
// LEVELCASINO AUTH SYSTEM
// Cloudflare Worker + D1
// =====================================================

import {
    getUserByEmail,
    getUserById,
    updateUserPassword,
    createSession,
    getSession,
    deleteSession,
    createPasswordReset,
    getPasswordResetByTokenHash,
    markPasswordResetUsed,
    invalidateUserPasswordResets
} from "./database/users.js";
import { sendEmail } from "./email.js";
import { getSiteContext } from "./site-context.js";
import { upsertConfirmedSubscriberForUser } from "./database/newsletter.js";

// ── Turnstile verification ──

async function verifyTurnstile(token, env) {
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
async function checkRateLimit(env, ipHash, action) {
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

async function logFailedAttempt(env, ipHash, action) {
  await env.DB.prepare(`
    INSERT INTO auth_attempts (ip_hash, action, created_at)
    VALUES (?, ?, ?)
  `).bind(ipHash, action, new Date().toISOString()).run();
}

async function hashIPForAuth(ip) {
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
async function sha256Hex(value) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generates a random URL-safe token for one-time links (password
 * reset, newsletter confirm/unsubscribe).
 */
function generateToken() {
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
function getCookieDomain(request) {
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

function sessionCookieHeader(token, request) {
  const domain = getCookieDomain(request);
  return `session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax${domain ? `; Domain=${domain}` : ""}`;
}


/**
 * Hash password using PBKDF2 (100k iterations)
 * Returns "salt:hash" format
 */
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const encoder = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    256
  );

  const saltHex = Array.from(salt)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");

  const hashHex = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");

  return `${saltHex}:${hashHex}`;
}

/**
 * Verify password against stored PBKDF2 hash
 * Also supports legacy SHA-256 hashes (no colon = old format)
 */
export async function verifyPassword(password, storedHash) {
  // Legacy SHA-256 fallback (no colon in string)
  if (!storedHash.includes(":")) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const legacyHash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");

    if (legacyHash === storedHash) {
      // TODO: Re-hash with PBKDF2 on next login
      return true;
    }
    return false;
  }

  // PBKDF2 verification
  const [saltHex, hashHex] = storedHash.split(":");
  if (!saltHex || !hashHex) return false;

  const salt = new Uint8Array(
    saltHex.match(/.{2}/g).map(b => parseInt(b, 16))
  );

  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    256
  );

  const computedHash = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");

  return computedHash === hashHex;
}


/**
 * Generate random session token
 */
export function generateSessionToken() {

    return crypto.randomUUID();
}

/**
 * Login user
 */
export async function login(request, env) {
  const body = await request.json();
  const email = body.email?.trim();
  const password = body.password;
  const turnstileToken = body["cf-turnstile-response"];

  if (!email || !password) {
    return json({ success: false, error: "Email and password required" }, 400);
  }

  // ── Turnstile check ──
  const turnstileOk = await verifyTurnstile(turnstileToken, env);
  if (!turnstileOk) {
    return json({ success: false, error: "Security verification failed. Please try again." }, 403);
  }

   // ── Brute-force check ──
  const ipHash = await hashIPForAuth(request.headers.get("CF-Connecting-IP"));
  const allowed = await checkRateLimit(env, ipHash, "login");
  if (!allowed) {
    return json({ success: false, error: "Too many attempts. Try again in 15 minutes." }, 429);
  }

  const user = await getUserByEmail(env.DB, email);

  if (!user) {
    await logFailedAttempt(env, ipHash, "login");
    return json({ success: false, error: "Invalid credentials" }, 401);
  }

  const valid = await verifyPassword(password, user.password_hash);

  if (!valid) {
    await logFailedAttempt(env, ipHash, "login");
    return json({ success: false, error: "Invalid credentials" }, 401);
  }

  const token = generateSessionToken();
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);

  await createSession(env.DB, token, user.id, expires.toISOString());

  return new Response(JSON.stringify({ success: true }), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": sessionCookieHeader(token, request)
    }
  });
}


/**
 * Logout
 */
export async function logout(
    request,
    env
) {

    const token =
        getCookie(
            request,
            "session"
        );

    if (token) {

        await deleteSession(
            env.DB,
            token
        );
    }

    return new Response(null, {
  status: 302,
  headers: {
    "Location": "/en/login",
    "Set-Cookie": `session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax${getCookieDomain(request) ? `; Domain=${getCookieDomain(request)}` : ""}`
  }
});

}

/**
 * Get authenticated user
 */
export async function getCurrentUser(
    request,
    env
) {

    const token =
        getCookie(
            request,
            "session"
        );

    if (!token) {
        return null;
    }

    const session =
        await getSession(
            env.DB,
            token
        );

    if (!session) {
        return null;
    }

    if (
        new Date(session.expires_at)
        < new Date()
    ) {

        return null;
    }

    return session;
}

/**
 * Require authentication
 */
export async function requireAuth(
    request,
    env
) {

    const session = await getCurrentUser(request, env);

let user = null;
if (session?.user_id) {
  user = await env.DB.prepare(
    "SELECT id, email, role FROM users WHERE id = ?"
  ).bind(session.user_id).first();
}

    if (!user) {

        return new Response(
            "Unauthorized",
            {
                status: 401
            }
        );
    }

    return user;
}

/**
 * Require role
 */
export function requireRole(
    user,
    role
) {

    const hierarchy = {
        viewer: 1,
        editor: 2,
        admin: 3
    };

    return (
        hierarchy[user.role] >=
        hierarchy[role]
    );
}

/**
 * Cookie parser
 */
export function getCookie(
    request,
    name
) {

    const cookie =
        request.headers.get("Cookie");

    if (!cookie) {
        return null;
    }

    const parts =
        cookie.split(";");

    for (const part of parts) {

        const [key, value] =
            part.trim().split("=");

        if (key === name) {

            return value;
        }
    }

    return null;
}

/**
 * JSON helper
 */
function json(
    data,
    status = 200
) {

    return new Response(
        JSON.stringify(data),
        {
            status,
            headers: {
                "Content-Type":
                    "application/json"
            }
        }
    );
}

export async function register(request, env) {
  const body = await request.json();
  const email = body.email?.trim();
  const password = body.password;
  const turnstileToken = body["cf-turnstile-response"];

  if (!email || !password) {
    return json({ success: false, error: "Missing fields" }, 400);
  }

  if (password.length < 8) {
    return json({ success: false, error: "Password must be at least 8 characters" }, 400);
  }

  // ── Turnstile check ──
  const turnstileOk = await verifyTurnstile(turnstileToken, env);
  if (!turnstileOk) {
    return json({ success: false, error: "Security verification failed. Please try again." }, 403);
  }

   // ── Brute-force check ──
  const ipHash = await hashIPForAuth(request.headers.get("CF-Connecting-IP"));
  const allowed = await checkRateLimit(env, ipHash, "register");
  if (!allowed) {
    return json({ success: false, error: "Too many attempts. Try again in 15 minutes." }, 429);
  }

  const existing = await getUserByEmail(env.DB, email);
  if (existing) {
    await logFailedAttempt(env, ipHash, "register");
    return json({ success: false, error: "User already exists" }, 409);
  }

  const passwordHash = await hashPassword(password);
  const insertResult = await env.DB.prepare(`
    INSERT INTO users(email, password_hash, role)
    VALUES (?, ?, 'viewer')
  `).bind(email, passwordHash).run();

  // Auto-subscribe every new account to the newsletter (confirmed
  // immediately -- a registered account is already a verified email,
  // no double opt-in needed; see upsertConfirmedSubscriberForUser).
  // Best-effort: registration must succeed even if this fails.
  try {
    const newUserId = insertResult.meta.last_row_id;
    await upsertConfirmedSubscriberForUser(env.DB, newUserId, email);
  } catch (err) {
    console.error("register: auto-subscribe failed", err.message);
  }

  return json({ success: true });
}

/**
 * Forgot password — request a reset link.
 * Always returns success (whether or not the email is registered) so
 * this endpoint can't be used to enumerate which emails have
 * accounts. The reset link is emailed via Resend; see ./email.js.
 */
export async function forgotPassword(request, env) {
  const body = await request.json();
  const email = body.email?.trim();

  if (!email) {
    return json({ success: false, error: "Email is required" }, 400);
  }

  // ── Brute-force / abuse check ──
  const ipHash = await hashIPForAuth(request.headers.get("CF-Connecting-IP"));
  const allowed = await checkRateLimit(env, ipHash, "forgot-password");
  if (!allowed) {
    return json({ success: false, error: "Too many attempts. Try again in 15 minutes." }, 429);
  }
  await logFailedAttempt(env, ipHash, "forgot-password");

  const user = await getUserByEmail(env.DB, email);

  // Same response either way -- don't reveal account existence.
  if (user) {
    const token = generateToken();
    const tokenHash = await sha256Hex(token);
    const expires = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

    await createPasswordReset(env.DB, user.id, tokenHash, expires.toISOString());

    const site = await getSiteContext(request, env);
    const resetUrl = `${site.origin}/en/reset-password?token=${token}`;

    try {
      await sendEmail(env, {
        to: user.email,
        subject: `Reset your ${site.siteName} password`,
        text:
          `We received a request to reset your ${site.siteName} password.\n\n` +
          `Reset it here (link expires in 1 hour):\n${resetUrl}\n\n` +
          `If you didn't request this, you can safely ignore this email.`,
        html:
          `<p>We received a request to reset your ${site.siteName} password.</p>` +
          `<p><a href="${resetUrl}">Click here to reset your password</a> (link expires in 1 hour).</p>` +
          `<p>If you didn't request this, you can safely ignore this email.</p>`
      });
    } catch (err) {
      // Email delivery failure shouldn't reveal account existence or
      // block the response, but it should be visible in logs.
      console.error("forgotPassword: email send failed", err.message);
    }
  }

  return json({
    success: true,
    message: "If an account exists for that email, a reset link has been sent."
  });
}

/**
 * Reset password — consume a token from a forgot-password email.
 */
export async function resetPassword(request, env) {
  const body = await request.json();
  const token = body.token?.trim();
  const password = body.password;

  if (!token || !password) {
    return json({ success: false, error: "Token and new password are required" }, 400);
  }
  if (password.length < 8) {
    return json({ success: false, error: "Password must be at least 8 characters" }, 400);
  }

  const tokenHash = await sha256Hex(token);
  const reset = await getPasswordResetByTokenHash(env.DB, tokenHash);

  if (!reset || reset.used_at || new Date(reset.expires_at) < new Date()) {
    return json({ success: false, error: "This reset link is invalid or has expired." }, 400);
  }

  const passwordHash = await hashPassword(password);
  await updateUserPassword(env.DB, reset.user_id, passwordHash);
  await markPasswordResetUsed(env.DB, reset.id);
  // Invalidate any other outstanding reset links for this user.
  await invalidateUserPasswordResets(env.DB, reset.user_id);

  return json({ success: true });
}

/**
 * Change password — for an already-logged-in user, requires their
 * current password.
 */
export async function changePassword(request, env) {
  const session = await getCurrentUser(request, env);
  if (!session?.user_id) {
    return json({ success: false, error: "Unauthorized" }, 401);
  }

  const body = await request.json();
  const currentPassword = body.currentPassword;
  const newPassword = body.newPassword;

  if (!currentPassword || !newPassword) {
    return json({ success: false, error: "Current and new password are required" }, 400);
  }
  if (newPassword.length < 8) {
    return json({ success: false, error: "New password must be at least 8 characters" }, 400);
  }

  const user = await getUserById(env.DB, session.user_id);
  if (!user) {
    return json({ success: false, error: "Unauthorized" }, 401);
  }

  const valid = await verifyPassword(currentPassword, user.password_hash);
  if (!valid) {
    return json({ success: false, error: "Current password is incorrect" }, 401);
  }

  const passwordHash = await hashPassword(newPassword);
  await updateUserPassword(env.DB, user.id, passwordHash);
  await invalidateUserPasswordResets(env.DB, user.id);

  return json({ success: true });
}
