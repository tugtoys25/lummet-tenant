import { getUserByEmail, createSession, getSession, deleteSession } from "../database/users.js";
import { checkRateLimit, getCookieDomain, hashIPForAuth, logFailedAttempt, sessionCookieHeader, verifyTurnstile } from "./security.js";
import { hashPassword, verifyPassword } from "./password.js";

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

  // Old accounts may still hold an unsalted SHA-256 hash (no ":" in it). Now that the password
  // is known to be right, replace it with a salted PBKDF2 hash. Best effort: a failure here
  // must never stop the login.
  if (!user.password_hash.includes(":")) {
    try {
      await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?")
        .bind(await hashPassword(password), user.id).run();
    } catch (e) {
      console.error("password hash upgrade failed:", e.message);
    }
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
export function json(
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
