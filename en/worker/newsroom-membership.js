// ============================================================
// en/worker/newsroom-membership.js -- member-only and registered-only articles (additive, off until switched on)
//
//   news_membership   turns the feature on. Off: every article is free, exactly as before.
//
// Each article can be: free (default), registered (any confirmed newsletter subscriber or member) or members.
// Non-entitled readers see the first paragraphs and a sign-in box; the rest of the text is never sent to them
// (page, structured data, feeds). Readers sign in without a password: they ask for a one-time link by email.
// Members come from an editor (Newsroom > Membership) or from a payment provider through a signed webhook.
// Pages shown to a signed-in reader are never stored in the shared page cache.
// ============================================================

import { getOpsFlags } from './newsroom-ops.js';
import { logAudit } from './database/audit.js';

export const LEVELS = ['free', 'registered', 'members'];
export const COOKIE = 'nr_member';
const COOKIE_DAYS = 30;
const LOGIN_MINUTES = 15;
const EMAIL = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/;
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const normEmail = (e) => String(e || '').trim().toLowerCase().slice(0, 200);
const sqlTime = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');

async function getSetting(db, key) { const r = await db.prepare(`SELECT value FROM system_settings WHERE key = ?`).bind(key).first(); return r ? r.value : null; }
async function putSetting(db, key, value) { await db.prepare(`INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`).bind(key, value).run(); }
const randomToken = (n = 32) => b64u(crypto.getRandomValues(new Uint8Array(n)));
async function sha256(text) { return b64u(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))); }
async function hmacKey(secret) { return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']); }

// ── secrets ──────────────────────────────────────────────────
export async function setupMembership(db, { rotateWebhook = false } = {}) {
  let session = await getSetting(db, 'member_session_secret');
  if (!session) { session = randomToken(); await putSetting(db, 'member_session_secret', session); }
  let hook = await getSetting(db, 'member_webhook_secret');
  const created = !hook || rotateWebhook;
  if (created) { hook = randomToken(); await putSetting(db, 'member_webhook_secret', hook); }
  return { webhookSecret: created ? hook : null };   // shown to the editor once, when it is made
}

// ── cookie ───────────────────────────────────────────────────
export async function makeCookie(db, email, now = Date.now()) {
  const secret = await getSetting(db, 'member_session_secret'); if (!secret) throw new Error('membership is not set up');
  const payload = b64u(new TextEncoder().encode(JSON.stringify({ e: email, x: Math.floor(now / 1000) + COOKIE_DAYS * 86400 })));
  const sig = b64u(await crypto.subtle.sign('HMAC', await hmacKey(secret), new TextEncoder().encode(payload)));
  return `${COOKIE}=${payload}.${sig}; Path=/; Max-Age=${COOKIE_DAYS * 86400}; HttpOnly; Secure; SameSite=Lax`;
}
export const clearCookie = () => `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

export function cookieValue(request) {
  const m = (request.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return m ? m[1] : null;
}

export async function readCookie(db, request, now = Date.now()) {
  const v = cookieValue(request); if (!v) return null;
  const [payload, sig] = v.split('.'); if (!payload || !sig) return null;
  try {
    const secret = await getSetting(db, 'member_session_secret'); if (!secret) return null;
    if (!(await crypto.subtle.verify('HMAC', await hmacKey(secret), unb64u(sig), new TextEncoder().encode(payload)))) return null;
    const d = JSON.parse(new TextDecoder().decode(unb64u(payload)));
    return d && d.e && d.x * 1000 > now ? String(d.e) : null;
  } catch { return null; }
}

// ── who may read what ────────────────────────────────────────
export async function activeMember(db, email, now = Date.now()) {
  if (!email) return null;
  return await db.prepare(`SELECT id, email, tier FROM news_members WHERE email = ? AND status = 'active' AND (expires_at IS NULL OR datetime(expires_at) > datetime(?))`).bind(email, sqlTime(now)).first();
}
export async function isEntitled(db, email, level, now = Date.now()) {
  if (level === 'free') return true;
  if (!email) return false;
  if (await activeMember(db, email, now)) return true;
  if (level === 'registered') return !!(await db.prepare(`SELECT 1 AS x FROM newsletter_subscribers WHERE email = ? AND status = 'confirmed'`).bind(email).first());
  return false;
}

// First paragraphs only, and never the whole article: at least half is always held back.
export function buildPreview(html, wanted = 3) {
  const paras = String(html || '').match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) || [];
  if (paras.length >= 2) {
    const n = Math.max(1, Math.min(Math.trunc(Number(wanted)) || 3, Math.floor(paras.length / 2), 20));
    return paras.slice(0, n).join('\n');
  }
  const text = String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return text ? `<p>${esc(text.slice(0, Math.max(0, Math.min(300, Math.floor(text.length / 2)))).trim())}…</p>` : '';
}

export async function getAccess(db, newsId) {
  return await db.prepare(`SELECT level, preview_paragraphs FROM news_access WHERE news_id = ?`).bind(newsId).first();
}

function gateHtml(level, slug, signedIn) {
  const need = level === 'members' ? 'This story is for members.' : 'This story is free once you are signed up.';
  const help = level === 'members'
    ? 'Members: enter your email and we will send you a sign-in link.'
    : 'Subscribers and members: enter your email and we will send you a sign-in link. Not subscribed yet? Subscribe to the newsletter first, then come back.';
  return `<div class="nr-gate nr-paywalled" id="member-gate" style="margin:24px 0;padding:20px;border:1px solid var(--light-gray,#d9d9d9);border-radius:12px;background:var(--white,#fff)">
<h2 style="margin:0 0 8px;font-size:20px">${esc(need)}</h2>
<p style="margin:0 0 14px;color:var(--gray,#666)">${esc(signedIn ? 'Your account does not include this story. Ask the newsroom about membership.' : help)}</p>
${signedIn ? '<p><a href="/en/member/logout">Sign out</a></p>' : `<form id="nrMemberForm" data-next="/en/news/${esc(encodeURIComponent(slug))}" novalidate>
<label for="nrm-email" style="display:block;font-weight:600;margin-bottom:6px">Email</label>
<input id="nrm-email" name="email" type="email" maxlength="200" required autocomplete="email" style="width:100%;max-width:360px;margin-bottom:10px">
<div style="position:absolute;left:-9999px" aria-hidden="true"><input name="website" tabindex="-1" autocomplete="off"></div>
<div><button type="submit" class="btn btn--primary">Email me a sign-in link</button></div>
<p id="nrMemberStatus" role="status" aria-live="polite" style="margin-top:10px"></p></form>
<script src="/static/js/news-member.js" defer></script>`}</div>`;
}

// Decides what this reader gets for this article. null = nothing special (flag off, or a free article).
export async function resolveGate(db, request, article, now = Date.now()) {
  if (!(await getOpsFlags(db)).news_membership || !article || !article.id) return null;
  const acc = await getAccess(db, article.id);
  if (!acc || acc.level === 'free' || !LEVELS.includes(acc.level)) return null;
  const email = await readCookie(db, request, now);
  const entitled = await isEntitled(db, email, acc.level, now);
  const out = { level: acc.level, entitled, signedIn: !!email, email };
  if (!entitled) {
    out.previewHtml = buildPreview(article.content, acc.preview_paragraphs);
    out.html = gateHtml(acc.level, article.slug, !!email);
  }
  return out;
}

// ── sign-in links ────────────────────────────────────────────
async function ipHash(ip) { return (await sha256(`member|${ip || 'anon'}`)).slice(0, 16); }

export async function requestLogin(env, { email: rawEmail, website, ip, origin, next }, deps = {}) {
  const db = env.DB;
  if (!(await getOpsFlags(db)).news_membership || !(await getSetting(db, 'member_session_secret'))) return { ok: false, status: 404 };
  const email = normEmail(rawEmail);
  if (website) return { ok: true, status: 200 };            // honeypot: pretend it worked
  if (!EMAIL.test(email)) return { ok: false, status: 400, error: 'Please enter a valid email address' };
  const ih = await ipHash(ip);
  const perIp = await db.prepare(`SELECT COUNT(*) AS c FROM news_member_logins WHERE ip_hash = ? AND created_at >= datetime('now','-1 hour')`).bind(ih).first();
  const perMail = await db.prepare(`SELECT COUNT(*) AS c FROM news_member_logins WHERE email = ? AND created_at >= datetime('now','-1 hour')`).bind(email).first();
  if ((perIp?.c || 0) >= 8 || (perMail?.c || 0) >= 3) return { ok: false, status: 429, error: 'Too many requests. Please try again later.' };
  // The answer is identical whether or not the address is known, so this cannot be used to list members.
  const eligible = (await activeMember(db, email)) || (await db.prepare(`SELECT 1 AS x FROM newsletter_subscribers WHERE email = ? AND status = 'confirmed'`).bind(email).first());
  if (eligible) {
    const token = randomToken();
    await db.prepare(`INSERT INTO news_member_logins (token_hash, email, ip_hash, expires_at) VALUES (?, ?, ?, ?)`).bind(await sha256(token), email, ih, sqlTime(Date.now() + LOGIN_MINUTES * 60000)).run();
    const safeNext = /^\/en\/news\/[A-Za-z0-9%._~-]+$/.test(String(next || '')) ? next : '/en/news';
    const link = `${origin}/en/member/verify?token=${encodeURIComponent(token)}&next=${encodeURIComponent(safeNext)}`;
    const sendEmail = deps.sendEmail || (await import('./email.js')).sendEmail;
    const body = `<p>Use this link to sign in and keep reading. It works once and expires in ${LOGIN_MINUTES} minutes.</p><p><a href="${esc(link)}">Sign in</a></p><p style="color:#666;font-size:13px">If you did not ask for this, ignore this email.</p>`;
    try { await sendEmail(env, { to: email, subject: 'Your sign-in link', html: body, text: `Sign in: ${link}\nThis link works once and expires in ${LOGIN_MINUTES} minutes.` }); }
    catch (e) { console.error('member login email failed:', e && e.message); }
  } else {
    await db.prepare(`INSERT INTO news_member_logins (token_hash, email, ip_hash, expires_at, used_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`).bind(await sha256(randomToken()), email, ih, sqlTime(Date.now())).run();   // counts toward the limits
  }
  return { ok: true, status: 200 };
}

export async function verifyLogin(env, token, now = Date.now()) {
  const db = env.DB;
  if (!(await getOpsFlags(db)).news_membership) return null;
  const hash = await sha256(String(token || '').slice(0, 200));
  const row = await db.prepare(`SELECT id, email FROM news_member_logins WHERE token_hash = ? AND used_at IS NULL AND datetime(expires_at) > datetime(?)`).bind(hash, sqlTime(now)).first();
  if (!row) return null;
  const claim = await db.prepare(`UPDATE news_member_logins SET used_at = CURRENT_TIMESTAMP WHERE id = ? AND used_at IS NULL`).bind(row.id).run();
  if (claim?.meta?.changes === 0) return null;               // someone else used it first
  return { email: row.email, cookie: await makeCookie(db, row.email, now) };
}

// ── editors ──────────────────────────────────────────────────
export async function membershipStatus(db) {
  const members = (await db.prepare(`SELECT id, email, status, tier, source, expires_at, note, created_at FROM news_members ORDER BY id DESC LIMIT 200`).all()).results || [];
  const levels = (await db.prepare(`SELECT a.news_id, a.level, a.preview_paragraphs, n.title FROM news_access a JOIN news n ON n.id = a.news_id WHERE a.level != 'free' ORDER BY a.updated_at DESC LIMIT 100`).all()).results || [];
  const live = (await db.prepare(`SELECT n.id, n.title, COALESCE(a.level, 'free') AS level FROM news n LEFT JOIN news_access a ON a.news_id = n.id WHERE n.published = 1 ORDER BY COALESCE(n.published_at, n.created_at) DESC LIMIT 30`).all()).results || [];
  return { configured: !!(await getSetting(db, 'member_session_secret')), members, limited: levels, recent: live };
}

export async function setArticleAccess(db, { newsId, level, preview, actor }) {
  if (!LEVELS.includes(level)) return { ok: false, status: 400, error: 'unknown level' };
  const n = await db.prepare(`SELECT id FROM news WHERE id = ?`).bind(Number(newsId) || 0).first();
  if (!n) return { ok: false, status: 404, error: 'article not found' };
  const p = Math.min(Math.max(Math.trunc(Number(preview)) || 3, 1), 20);
  await db.prepare(`INSERT INTO news_access (news_id, level, preview_paragraphs, updated_by, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(news_id) DO UPDATE SET level = excluded.level, preview_paragraphs = excluded.preview_paragraphs, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP`).bind(n.id, level, p, actor?.user_id ?? null).run();
  await logAudit(db, { userId: actor?.user_id, action: 'article_access_changed', entityType: 'news', entityId: n.id, metadata: { level, preview: p } });
  return { ok: true };
}

export async function grantMember(db, { email: raw, tier, expiresAt, note, source = 'manual', externalId, actor }) {
  const email = normEmail(raw);
  if (!EMAIL.test(email)) return { ok: false, status: 400, error: 'Enter a valid email address' };
  let exp = null;
  if (expiresAt) { const d = new Date(String(expiresAt)); if (Number.isNaN(d.getTime())) return { ok: false, status: 400, error: 'Bad end date' }; exp = sqlTime(d.getTime()); }
  await db.prepare(`INSERT INTO news_members (email, status, tier, source, external_id, note, expires_at) VALUES (?, 'active', ?, ?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET status = 'active', tier = excluded.tier, source = excluded.source, external_id = COALESCE(excluded.external_id, external_id), note = COALESCE(excluded.note, note), expires_at = excluded.expires_at, updated_at = CURRENT_TIMESTAMP`)
    .bind(email, String(tier || '').slice(0, 60) || null, source, String(externalId || '').slice(0, 120) || null, String(note || '').slice(0, 300) || null, exp).run();
  await logAudit(db, { userId: actor?.user_id, action: 'member_changed', entityType: 'news_member', entityId: null, metadata: { email_hash: (await sha256(email)).slice(0, 10), granted: true, source } });
  return { ok: true };
}

export async function revokeMember(db, { id, email: raw, actor, source = 'manual' }) {
  const row = id ? await db.prepare(`SELECT id, email FROM news_members WHERE id = ?`).bind(Number(id) || 0).first() : await db.prepare(`SELECT id, email FROM news_members WHERE email = ?`).bind(normEmail(raw)).first();
  if (!row) return { ok: false, status: 404, error: 'member not found' };
  await db.prepare(`UPDATE news_members SET status = 'revoked', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(row.id).run();
  await logAudit(db, { userId: actor?.user_id, action: 'member_changed', entityType: 'news_member', entityId: row.id, metadata: { revoked: true, source } });
  return { ok: true };
}

// A payment provider (or an automation tool) calls this. The body is signed: X-Signature = hex HMAC-SHA256(secret, raw body).
// Body: { "event": "grant" | "revoke", "email": "...", "ts": <unix seconds>, "tier"?, "expires_at"?, "external_id"? }
export async function handleWebhook(env, rawBody, signature) {
  const db = env.DB;
  if (!(await getOpsFlags(db)).news_membership) return { ok: false, status: 404 };
  const secret = await getSetting(db, 'member_webhook_secret');
  if (!secret || !/^[0-9a-f]{64}$/i.test(String(signature || ''))) return { ok: false, status: 401 };
  const sig = Uint8Array.from(String(signature).match(/../g).map((h) => parseInt(h, 16)));
  if (!(await crypto.subtle.verify('HMAC', await hmacKey(secret), sig, new TextEncoder().encode(rawBody)))) return { ok: false, status: 401 };
  let b; try { b = JSON.parse(rawBody); } catch { return { ok: false, status: 400 }; }
  if (!b || typeof b !== 'object' || Math.abs(Date.now() / 1000 - Number(b.ts)) > 300) return { ok: false, status: 400 };   // replayed or stale
  if (b.event === 'grant') { const r = await grantMember(db, { email: b.email, tier: b.tier, expiresAt: b.expires_at, source: 'webhook', externalId: b.external_id }); return { ok: r.ok, status: r.ok ? 200 : r.status }; }
  if (b.event === 'revoke') { const r = await revokeMember(db, { email: b.email, source: 'webhook' }); return { ok: r.ok || r.status === 404, status: r.ok ? 200 : r.status === 404 ? 200 : r.status }; }
  return { ok: false, status: 400 };
}

// Feeds and other lists: which of these articles are limited (their full text must not leave the site).
export async function limitedIds(db, ids) {
  if (!ids.length) return new Set();
  try {
    if (!(await getOpsFlags(db)).news_membership) return new Set();
    const r = await db.prepare(`SELECT news_id FROM news_access WHERE level != 'free' AND news_id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();
    return new Set((r.results || []).map((x) => x.news_id));
  } catch { return new Set(); }
}
