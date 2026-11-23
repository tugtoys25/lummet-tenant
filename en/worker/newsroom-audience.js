// ============================================================
// en/worker/newsroom-audience.js -- audience and trust tools for the newsroom (additive, every one off until switched on)
//
//   share bar          news_share_bar            share / copy link / email / WhatsApp / X / Facebook / LinkedIn, no tracking
//   lazy images        news_lazy_images          loading="lazy" + decoding="async" on images inside article text
//   footer trust links news_trust_footer_links   published policy pages linked from every page's footer
//   copyright reports  news_copyright_reports    public form + queue for editors (new, reviewing, actioned, rejected, withdrawn)
//
// Everything public fails soft: a broken lookup yields "nothing extra" and never takes a page down.
// ============================================================

import { checkPermission } from './database/permissions.js';
import { logAudit } from './database/audit.js';
import { TRUST_PAGES } from './newsroom-trust.js';

const KEYS = ['news_share_bar', 'news_lazy_images', 'news_trust_footer_links', 'news_copyright_reports'];
const memo = new WeakMap();   // db handle -> { at, flags }
const TTL = 30000;

export async function getAudienceFlags(db, now = Date.now()) {
  const hit = memo.get(db);
  if (hit && now - hit.at < TTL) return hit.flags;
  const flags = Object.fromEntries(KEYS.map((k) => [k, false]));
  try {
    const r = await db.prepare(`SELECT key, value FROM system_settings WHERE key IN (${KEYS.map(() => '?').join(',')})`).bind(...KEYS).all();
    for (const row of r.results || []) flags[row.key] = String(row.value).toLowerCase() === 'true';
  } catch (e) { console.error('audience flags read failed (all off):', e && e.message); }
  memo.set(db, { at: now, flags });
  return flags;
}
export function forgetAudienceFlags(db) { memo.delete(db); }

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const enc = encodeURIComponent;

// ── share bar ────────────────────────────────────────────────
export function renderShareBar({ url, title }) {
  if (!url) return '';
  const u = enc(url), t = enc(title || '');
  const link = (href, label, extra = '') => `<a class="nr-share-link" href="${esc(href)}" target="_blank" rel="noopener noreferrer nofollow"${extra}>${esc(label)}</a>`;
  const btn = 'padding:6px 12px;border:1px solid var(--light-gray,#d9d9d9);border-radius:999px;font-size:13px;text-decoration:none;color:inherit;background:transparent;cursor:pointer;font-family:inherit';
  return `<section class="nr-share" aria-label="Share this article" style="margin:28px 0;display:flex;flex-wrap:wrap;gap:8px;align-items:center">
<strong style="font-size:14px;margin-right:4px">Share</strong>
<button type="button" class="nr-share-native" hidden style="${btn}">Share…</button>
<button type="button" class="nr-share-copy" data-url="${esc(url)}" style="${btn}">Copy link</button>
${link(`mailto:?subject=${t}&body=${u}`, 'Email').replace('target="_blank" rel="noopener noreferrer nofollow"', '')}
${link(`https://wa.me/?text=${t}%20${u}`, 'WhatsApp')}
${link(`https://twitter.com/intent/tweet?text=${t}&url=${u}`, 'X')}
${link(`https://www.facebook.com/sharer/sharer.php?u=${u}`, 'Facebook')}
${link(`https://www.linkedin.com/sharing/share-offsite/?url=${u}`, 'LinkedIn')}
<span class="nr-share-note" role="status" aria-live="polite" style="font-size:13px;color:var(--gray,#666)"></span>
<style>.nr-share-link{${btn}}.nr-share-link:hover,.nr-share button:hover{background:var(--light-gray,#f2f2f2)}</style>
<script>(function(){var s=document.currentScript.parentNode,n=s.querySelector('.nr-share-note'),c=s.querySelector('.nr-share-copy'),h=s.querySelector('.nr-share-native');
function say(m){n.textContent=m;setTimeout(function(){n.textContent='';},2500);}
if(navigator.share){h.hidden=false;h.addEventListener('click',function(){navigator.share({title:document.title,url:c.getAttribute('data-url')}).catch(function(){});});}
c.addEventListener('click',function(){var u=c.getAttribute('data-url');
if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(u).then(function(){say('Link copied');},function(){say('Copy failed');});}
else{var i=document.createElement('input');i.value=u;document.body.appendChild(i);i.select();try{document.execCommand('copy');say('Link copied');}catch(e){say('Copy failed');}document.body.removeChild(i);}});})();</script>
</section>`;
}

// ── lazy images ──────────────────────────────────────────────
// Adds loading="lazy" decoding="async" to <img> tags that do not already say anything about loading.
export function lazyImages(html) {
  return String(html ?? '').replace(/<img\b([^>]*?)(\/?)>/gi, (m, attrs, slash) => {
    if (/\bloading\s*=/i.test(attrs)) return m;
    const extra = /\bdecoding\s*=/i.test(attrs) ? ' loading="lazy"' : ' loading="lazy" decoding="async"';
    return `<img${attrs}${extra}${slash}>`;
  });
}

// ── footer trust links ───────────────────────────────────────
const trustMemo = new WeakMap();
export async function loadFooterTrustHtml(db, now = Date.now()) {
  try {
    const flags = await getAudienceFlags(db, now);
    if (!flags.news_trust_footer_links) return '';
    const hit = trustMemo.get(db);
    if (hit && now - hit.at < 60000) return hit.html;
    const slugs = TRUST_PAGES.map((p) => p.slug);
    const r = await db.prepare(`SELECT slug, title FROM pages WHERE published = 1 AND slug IN (${slugs.map(() => '?').join(',')})`).bind(...slugs).all();
    const live = new Map((r.results || []).map((p) => [p.slug, p.title]));
    const items = TRUST_PAGES.filter((t) => live.has(t.slug)).map((t) => `<li style="display:inline-block;margin:0 14px 6px 0"><a href="/en/${esc(t.slug)}">${esc(live.get(t.slug) || t.title)}</a></li>`);
    if (flags.news_copyright_reports) items.push(`<li style="display:inline-block;margin:0 14px 6px 0"><a href="/en/copyright-report">Report a copyright issue</a></li>`);
    const html = items.length ? `<nav class="footer-trust" aria-label="Editorial policies" style="margin:18px 0;font-size:14px"><ul style="list-style:none;padding:0;margin:0">${items.join('')}</ul></nav>` : '';
    trustMemo.set(db, { at: now, html });
    return html;
  } catch (e) { console.error('footer trust links skipped:', e && e.message); return ''; }
}
export function forgetFooterTrust(db) { trustMemo.delete(db); }

// The block under each article: the share bar and the copyright link. Empty when both are off.
export async function renderArticleAfterHtml(db, { url, title }) {
  const flags = await getAudienceFlags(db);
  let out = '';
  if (flags.news_share_bar) out += renderShareBar({ url, title });
  if (flags.news_copyright_reports) out += `<p class="nr-report-link" style="font-size:13px;color:var(--gray,#666)"><a href="/en/copyright-report?url=${enc(url)}">Report a copyright issue with this article</a></p>`;
  return out;
}

// ── copyright / takedown reports ─────────────────────────────
export const REPORT_STATUSES = ['new', 'reviewing', 'actioned', 'rejected', 'withdrawn'];
const EMAIL = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/;
const clip = (v, n) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, n);

async function hashIp(ip) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`copyright-report|${ip || 'anon'}`));
  return Array.from(new Uint8Array(buf).slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function submitCopyrightReport(env, { body, ip, origin }) {
  const db = env.DB;
  if (!(await getAudienceFlags(db)).news_copyright_reports) return { ok: false, status: 404, error: 'Not found' };
  if (!body || typeof body !== 'object') return { ok: false, status: 400, error: 'Invalid request' };
  if (clip(body.website, 200)) return { ok: true, status: 200, id: null };   // hidden "website" field: bots fill it, people do not
  const r = {
    page_url: clip(body.page_url, 500), reporter_name: clip(body.reporter_name, 120), reporter_email: clip(body.reporter_email, 200).toLowerCase(),
    organisation: clip(body.organisation, 160), original_work: clip(body.original_work, 800), details: clip(body.details, 4000), signature: clip(body.signature, 120)
  };
  const errors = [];
  if (!r.reporter_name) errors.push('Your name is required');
  if (!EMAIL.test(r.reporter_email)) errors.push('A valid email address is required');
  if (!r.page_url) errors.push('The address of the page is required');
  if (r.original_work.length < 5) errors.push('Say where the original work can be found');
  if (r.details.length < 20) errors.push('Describe the problem in at least 20 characters');
  if (body.good_faith !== true) errors.push('You must confirm you believe in good faith that the use is not authorised');
  if (body.accuracy_confirmed !== true) errors.push('You must confirm the information is accurate');
  if (!r.signature) errors.push('Type your full name as a signature');
  let pageUrl = null;
  try { pageUrl = new URL(r.page_url, origin); } catch { errors.push('The page address is not valid'); }
  if (pageUrl && origin && pageUrl.origin !== new URL(origin).origin) errors.push('The page must be on this website');
  if (errors.length) return { ok: false, status: 400, error: errors[0], errors };

  const ipHash = await hashIp(ip);
  const recent = await db.prepare(`SELECT COUNT(*) AS c FROM news_copyright_reports WHERE ip_hash = ? AND created_at >= datetime('now','-1 hour')`).bind(ipHash).first();
  if ((recent?.c || 0) >= 5) return { ok: false, status: 429, error: 'Too many reports from this connection. Please try again later.' };

  let newsId = null;
  const m = pageUrl.pathname.match(/^\/en\/news\/([^/]+)\/?$/);
  if (m) { const a = await db.prepare(`SELECT id FROM news WHERE slug = ?`).bind(decodeURIComponent(m[1])).first(); newsId = a?.id ?? null; }
  const ins = await db.prepare(`INSERT INTO news_copyright_reports
      (news_id, page_url, reporter_name, reporter_email, organisation, original_work, details, good_faith, accuracy_confirmed, signature, ip_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)`)
    .bind(newsId, pageUrl.origin + pageUrl.pathname, r.reporter_name, r.reporter_email, r.organisation || null, r.original_work, r.details, r.signature, ipHash).run();
  return { ok: true, status: 200, id: ins?.meta?.last_row_id ?? null };
}

export async function listCopyrightReports(db, { status = '', limit = 100 } = {}) {
  const where = REPORT_STATUSES.includes(status) ? `WHERE r.status = ?` : '';
  const stmt = db.prepare(`SELECT r.*, n.title AS article_title, n.slug AS article_slug, n.published AS article_published
    FROM news_copyright_reports r LEFT JOIN news n ON n.id = r.news_id ${where}
    ORDER BY CASE r.status WHEN 'new' THEN 0 WHEN 'reviewing' THEN 1 ELSE 2 END, r.id DESC LIMIT ?`);
  const rows = (await (where ? stmt.bind(status, limit) : stmt.bind(limit)).all()).results || [];
  const counts = (await db.prepare(`SELECT status, COUNT(*) AS c FROM news_copyright_reports GROUP BY status`).all()).results || [];
  return { reports: rows.map(({ ip_hash, ...rest }) => rest), counts: Object.fromEntries(counts.map((c) => [c.status, c.c])) };
}

// Moves a report along. `unpublish: true` also takes the article offline (it can be published again; nothing is deleted).
export async function updateCopyrightReport(db, { id, status, resolution, unpublish, actor, perms }) {
  if (!checkPermission(perms, 'news', 'retract')) return { ok: false, status: 403, error: 'forbidden' };
  if (!REPORT_STATUSES.includes(status)) return { ok: false, status: 400, error: 'unknown status' };
  const rep = await db.prepare(`SELECT id, news_id, status FROM news_copyright_reports WHERE id = ?`).bind(id).first();
  if (!rep) return { ok: false, status: 404, error: 'report not found' };
  const closed = ['actioned', 'rejected', 'withdrawn'].includes(status);
  await db.prepare(`UPDATE news_copyright_reports SET status = ?, resolution = ?, handled_by = ?, updated_at = CURRENT_TIMESTAMP,
      resolved_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id = ?`)
    .bind(status, clip(resolution, 2000) || null, actor?.user_id ?? null, closed ? 1 : 0, id).run();
  let unpublished = false;
  if (unpublish && rep.news_id) {
    await db.prepare(`UPDATE news SET published = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(rep.news_id).run();
    unpublished = true;
  }
  await logAudit(db, { userId: actor?.user_id, action: 'article_updated', entityType: 'news', entityId: rep.news_id, metadata: { copyright_report: id, status, unpublished } });
  return { ok: true, unpublished };
}
