// ============================================================
// en/worker/newsroom-push.js -- web push "new story" notifications (additive, off until switched on)
//
//   news_web_push   readers can opt in from an article; editors announce a story from Newsroom > Push
//   news_push_auto  also announce newly live stories automatically (at most MAX_AUTO_PER_DAY a day)
//
// How it works: the push message carries no text (no payload encryption to get wrong). The browser wakes the
// service worker, which asks /en/api/v1/news/push/latest what to show. Messages are signed with VAPID (ES256)
// using a key pair created in Newsroom > Push; the private key stays in system_settings, the public key is shared.
// Sending is done in batches by the scheduled job; dead subscriptions (404/410) are retired, never deleted.
// ============================================================

import { getOpsFlags } from './newsroom-ops.js';
import { logAudit } from './database/audit.js';

export const MAX_AUTO_PER_DAY = 3;
const BATCH = 40;
const FAIL_LIMIT = 5;
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = (s) => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const clip = (v, n) => String(v ?? '').replace(/[\u0000-\u001F]/g, ' ').trim().slice(0, n);

async function getSetting(db, key) { const r = await db.prepare(`SELECT value FROM system_settings WHERE key = ?`).bind(key).first(); return r ? r.value : null; }
async function putSetting(db, key, value) { await db.prepare(`INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`).bind(key, value).run(); }

// ── keys ─────────────────────────────────────────────────────
export async function getPublicKey(db) { return (await getSetting(db, 'push_vapid_public')) || null; }

export async function setupVapid(db, { contact, regenerate = false } = {}) {
  const existing = await getPublicKey(db);
  if (existing && !regenerate) { if (contact) await putSetting(db, 'push_contact', clip(contact, 200)); return { created: false, publicKey: existing }; }
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub = b64u(await crypto.subtle.exportKey('raw', pair.publicKey));
  const priv = JSON.stringify(await crypto.subtle.exportKey('jwk', pair.privateKey));
  await putSetting(db, 'push_vapid_private', priv);
  await putSetting(db, 'push_vapid_public', pub);
  if (contact) await putSetting(db, 'push_contact', clip(contact, 200));
  // A new key invalidates every old subscription (browsers bind them to the key), so they are retired, not deleted.
  if (existing) await db.prepare(`UPDATE news_push_subscriptions SET status = 'gone' WHERE status = 'active'`).run();
  return { created: true, publicKey: pub };
}

export async function vapidHeaders(db, endpoint, now = Date.now()) {
  const [priv, pub, contact] = await Promise.all([getSetting(db, 'push_vapid_private'), getSetting(db, 'push_vapid_public'), getSetting(db, 'push_contact')]);
  if (!priv || !pub) throw new Error('push keys are not set up');
  const key = await crypto.subtle.importKey('jwk', JSON.parse(priv), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const enc = (o) => b64u(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = `${enc({ typ: 'JWT', alg: 'ES256' })}.${enc({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: /^(mailto:|https:)/.test(contact || '') ? contact : 'mailto:noreply@example.com' })}`;
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(unsigned));   // raw r||s, as JWT needs
  return { Authorization: `vapid t=${unsigned}.${b64u(sig)}, k=${pub}`, TTL: '3600', Urgency: 'normal', 'Content-Length': '0' };
}

// ── readers ──────────────────────────────────────────────────
export async function subscribe(env, body) {
  const db = env.DB;
  if (!(await getOpsFlags(db)).news_web_push || !(await getPublicKey(db))) return { ok: false, status: 404, error: 'Not found' };
  const sub = body && body.subscription;
  const endpoint = clip(sub && sub.endpoint, 1000);
  let u; try { u = new URL(endpoint); } catch { return { ok: false, status: 400, error: 'Invalid subscription' }; }
  if (u.protocol !== 'https:') return { ok: false, status: 400, error: 'Invalid subscription' };
  const total = await db.prepare(`SELECT COUNT(*) AS c FROM news_push_subscriptions WHERE status = 'active'`).first();
  if ((total?.c || 0) >= 200000) return { ok: false, status: 503, error: 'Unavailable' };
  await db.prepare(`INSERT INTO news_push_subscriptions (endpoint, p256dh, auth, status) VALUES (?, ?, ?, 'active')
    ON CONFLICT(endpoint) DO UPDATE SET status = 'active', failures = 0, p256dh = excluded.p256dh, auth = excluded.auth`)
    .bind(endpoint, clip(sub.keys && sub.keys.p256dh, 200) || null, clip(sub.keys && sub.keys.auth, 100) || null).run();
  return { ok: true, status: 200 };
}

export async function unsubscribe(env, body) {
  const endpoint = clip(body && body.endpoint, 1000);
  if (!endpoint) return { ok: false, status: 400, error: 'Invalid request' };
  await env.DB.prepare(`UPDATE news_push_subscriptions SET status = 'unsubscribed' WHERE endpoint = ?`).bind(endpoint).run();
  return { ok: true, status: 200 };
}

export async function latestAnnouncement(db) {
  const r = await db.prepare(`SELECT title, url FROM news_push_sends ORDER BY id DESC LIMIT 1`).first();
  return r || null;
}

// The "Get notifications" button under each article. Empty unless the switch is on AND keys exist.
export async function renderPushButton(db) {
  try {
    if (!(await getOpsFlags(db)).news_web_push || !(await getPublicKey(db))) return '';
    return `<div class="nr-push" style="margin:20px 0"><button type="button" id="nrPushBtn" hidden style="padding:6px 12px;border:1px solid var(--light-gray,#d9d9d9);border-radius:999px;font-size:13px;background:transparent;color:inherit;cursor:pointer;font-family:inherit">Get notifications for new stories</button> <span id="nrPushNote" role="status" aria-live="polite" style="font-size:13px;color:var(--gray,#666)"></span></div><script src="/static/js/news-push.js" defer></script>`;
  } catch (e) { console.error('push button skipped:', e && e.message); return ''; }
}

// The service worker. Served from /news-push-sw.js so it can control the whole site. Fetches what to show, never trusts push data.
export const SERVICE_WORKER_JS = `self.addEventListener('install',function(){self.skipWaiting();});
self.addEventListener('activate',function(e){e.waitUntil(self.clients.claim());});
self.addEventListener('push',function(e){e.waitUntil(fetch('/en/api/v1/news/push/latest',{credentials:'omit',cache:'no-store'}).then(function(r){return r.json();}).then(function(d){
if(!d||!d.success||!d.title)return;return self.registration.showNotification(d.title,{body:d.body||'',data:{url:d.url||'/'},icon:d.icon||undefined,tag:'news-latest'});
}).catch(function(){}));});
self.addEventListener('notificationclick',function(e){e.notification.close();var u=(e.notification.data&&e.notification.data.url)||'/';
e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(function(l){for(var i=0;i<l.length;i++){if(l[i].url===u&&'focus' in l[i])return l[i].focus();}return self.clients.openWindow(u);}));});
`;

// ── editors ──────────────────────────────────────────────────
export async function pushStatus(db) {
  const subs = (await db.prepare(`SELECT status, COUNT(*) AS c FROM news_push_subscriptions GROUP BY status`).all()).results || [];
  const recent = (await db.prepare(`SELECT id, title, url, trigger, sent, gone, failed, done, created_at FROM news_push_sends ORDER BY id DESC LIMIT 15`).all()).results || [];
  const contact = await getSetting(db, 'push_contact');
  return { configured: !!(await getPublicKey(db)), contact: contact || '', subscribers: Object.fromEntries(subs.map((s) => [s.status, s.c])), recent };
}

export async function announce(env, { newsId, actor, trigger = 'manual', origin }) {
  const db = env.DB;
  if (!(await getOpsFlags(db)).news_web_push) return { ok: false, status: 403, error: 'Web push is switched off (Newsroom > Flags)' };
  if (!(await getPublicKey(db))) return { ok: false, status: 400, error: 'Set up push keys first' };
  const a = await db.prepare(`SELECT id, slug, title FROM news WHERE id = ? AND published = 1 AND (published_at IS NULL OR datetime(published_at) <= datetime('now'))`).bind(Number(newsId) || 0).first();
  if (!a) return { ok: false, status: 404, error: 'Article is not live' };
  const dupe = await db.prepare(`SELECT id FROM news_push_sends WHERE news_id = ? AND created_at >= datetime('now','-1 day')`).bind(a.id).first();
  if (dupe && trigger === 'manual') return { ok: false, status: 409, error: 'This story was already announced in the last 24 hours' };
  const url = `${origin || ''}/en/news/${encodeURIComponent(a.slug)}`;
  try {
    const r = await db.prepare(`INSERT INTO news_push_sends (news_id, title, url, trigger, created_by) VALUES (?, ?, ?, ?, ?)`).bind(a.id, clip(a.title, 200), url, trigger, actor?.user_id ?? null).run();
    if (actor) await logAudit(db, { userId: actor.user_id, action: 'push_announced', entityType: 'news', entityId: a.id, metadata: { send_id: r?.meta?.last_row_id } });
    return { ok: true, status: 200, id: r?.meta?.last_row_id ?? null };
  } catch (e) { return { ok: false, status: 409, error: 'Already announced' }; }   // unique index: an auto announcement exists
}

async function sendOne(db, endpoint, fetchImpl) {
  const res = await fetchImpl(endpoint, { method: 'POST', headers: await vapidHeaders(db, endpoint), redirect: 'manual' });
  return res.status;
}

// Sends one batch of the oldest open announcement. Called from the scheduled job (and once right after an editor announces).
export async function runPushQueue(env, { fetchImpl = fetch } = {}) {
  const db = env.DB;
  try {
    if (!(await getOpsFlags(db)).news_web_push || !(await getPublicKey(db))) return { skipped: true, reason: 'off' };
    const job = await db.prepare(`SELECT id, cursor FROM news_push_sends WHERE done = 0 ORDER BY id LIMIT 1`).first();
    if (!job) return { skipped: false, sent: 0 };
    const subs = (await db.prepare(`SELECT id, endpoint FROM news_push_subscriptions WHERE status = 'active' AND id > ? ORDER BY id LIMIT ?`).bind(job.cursor, BATCH).all()).results || [];
    let sent = 0, gone = 0, failed = 0;
    const results = await Promise.all(subs.map(async (s) => { try { return [s, await sendOne(db, s.endpoint, fetchImpl)]; } catch { return [s, 0]; } }));
    const stmts = [];
    for (const [s, code] of results) {
      if (code >= 200 && code < 300) { sent++; stmts.push(db.prepare(`UPDATE news_push_subscriptions SET last_ok_at = CURRENT_TIMESTAMP, failures = 0 WHERE id = ?`).bind(s.id)); }
      else if (code === 404 || code === 410) { gone++; stmts.push(db.prepare(`UPDATE news_push_subscriptions SET status = 'gone' WHERE id = ?`).bind(s.id)); }
      else { failed++; stmts.push(db.prepare(`UPDATE news_push_subscriptions SET failures = failures + 1, status = CASE WHEN failures + 1 >= ? THEN 'gone' ELSE status END WHERE id = ?`).bind(FAIL_LIMIT, s.id)); }
    }
    const last = subs.length ? subs[subs.length - 1].id : job.cursor;
    stmts.push(db.prepare(`UPDATE news_push_sends SET cursor = ?, sent = sent + ?, gone = gone + ?, failed = failed + ?, done = ? WHERE id = ?`).bind(last, sent, gone, failed, subs.length < BATCH ? 1 : 0, job.id));
    await db.batch(stmts);
    return { skipped: false, job: job.id, sent, gone, failed, done: subs.length < BATCH };
  } catch (e) { console.error('push queue failed:', e && e.message); return { skipped: true, reason: 'error' }; }
}

// Auto mode: announce stories that went live in the last 2 hours, up to MAX_AUTO_PER_DAY a day.
export async function runAutoAnnounce(env, { origin } = {}) {
  const db = env.DB;
  try {
    const f = await getOpsFlags(db);
    if (!f.news_web_push || !f.news_push_auto || !(await getPublicKey(db))) return { skipped: true, reason: 'off' };
    const today = await db.prepare(`SELECT COUNT(*) AS c FROM news_push_sends WHERE trigger = 'auto' AND created_at >= datetime('now','-1 day')`).first();
    let room = MAX_AUTO_PER_DAY - (today?.c || 0);
    if (room <= 0) return { skipped: false, announced: 0 };
    const rows = (await db.prepare(`SELECT n.id FROM news n WHERE n.published = 1 AND n.published_at IS NOT NULL AND datetime(n.published_at) <= datetime('now') AND datetime(n.published_at) >= datetime('now','-2 hours')
      AND NOT EXISTS (SELECT 1 FROM news_push_sends s WHERE s.news_id = n.id) ORDER BY n.published_at LIMIT ?`).bind(room).all()).results || [];
    let announced = 0;
    for (const r of rows) { if ((await announce(env, { newsId: r.id, actor: null, trigger: 'auto', origin })).ok) announced++; }
    return { skipped: false, announced };
  } catch (e) { console.error('auto announce failed:', e && e.message); return { skipped: true, reason: 'error' }; }
}
