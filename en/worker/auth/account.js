import { getUserByEmail, getUserById, updateUserPassword, createPasswordReset, getPasswordResetByTokenHash, markPasswordResetUsed, invalidateUserPasswordResets } from "../database/users.js";
import { sendEmail } from "../email.js";
import { getSiteContext } from "../site-context.js";
import { upsertConfirmedSubscriberForUser } from "../database/newsletter.js";
import { checkRateLimit, generateToken, hashIPForAuth, logFailedAttempt, sha256Hex, verifyTurnstile } from "./security.js";
import { hashPassword, verifyPassword } from "./password.js";
import { getCurrentUser, json } from "./session.js";

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
