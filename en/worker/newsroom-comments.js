// ============================================================
// en/worker/newsroom-comments.js -- reader comments on news articles (additive, off until switched on)
//
//   news_comments               shows the comments block and form under each article
//   news_comments_open_posting  off (default): every comment waits for an editor. on: comments show at once,
//                               except ones that look like spam (several links, repeats), which still wait.
//
// Plain text only (escaped when shown), one level of replies, honeypot + per-connection limits, no third-party scripts.
// Editors approve, reject or mark spam in Newsroom > Comments, and can close the discussion on one article.
// Nothing is ever hard-deleted from the UI: rejected and spam comments stay in the table.
// ============================================================

import { getOpsFlags } from './newsroom-ops.js';
import { logAudit } from './database/audit.js';

export const COMMENT_STATUSES = ['pending', 'approved', 'rejected', 'spam'];
const EMAIL = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/;
const clip = (v, n) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/\r\n?/g, '\n').trim().slice(0, n);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MAX_BODY = 2000;

async function hashIp(ip) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`comment|${ip || 'anon'}`));
  return Array.from(new Uint8Array(buf).slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function looksLikeSpam(body) {
  const links = (body.match(/https?:\/\/|www\.|<a\s|\[url/gi) || []).length;
  return links > 2 || /(.)\1{14,}/.test(body) || /\b(viagra|casino bonus|crypto giveaway|click here to win)\b/i.test(body);
}

async function liveArticle(db, slug) {
  return await db.prepare(`SELECT id, slug, title FROM news WHERE slug = ? AND published = 1 AND (published_at IS NULL OR datetime(published_at) <= datetime('now'))`).bind(String(slug || '').slice(0, 300)).first();
}

export async function submitComment(env, { body, ip }) {
  const db = env.DB;
  const flags = await getOpsFlags(db);
  if (!flags.news_comments) return { ok: false, status: 404, error: 'Not found' };
  if (!body || typeof body !== 'object') return { ok: false, status: 400, error: 'Invalid request' };
  if (clip(body.website, 200)) return { ok: true, status: 200, state: 'pending' };   // hidden field: bots fill it
  const name = clip(body.name, 60), email = clip(body.email, 200).toLowerCase(), text = clip(body.body, MAX_BODY + 1);
  if (!name) return { ok: false, status: 400, error: 'Please enter your name' };
  if (email && !EMAIL.test(email)) return { ok: false, status: 400, error: 'That email address does not look right' };
  if (text.length < 2) return { ok: false, status: 400, error: 'Please write a comment' };
  if (text.length > MAX_BODY) return { ok: false, status: 400, error: `Comments can be up to ${MAX_BODY} characters` };
  const art = await liveArticle(db, body.slug);
  if (!art) return { ok: false, status: 404, error: 'Article not found' };
  if (await db.prepare(`SELECT 1 AS x FROM news_comments_closed WHERE news_id = ?`).bind(art.id).first()) return { ok: false, status: 403, error: 'Comments are closed on this article' };
  let parentId = null;
  if (body.parent_id != null && body.parent_id !== '') {
    const p = await db.prepare(`SELECT id, parent_id FROM news_comments WHERE id = ? AND news_id = ? AND status = 'approved'`).bind(Number(body.parent_id) || 0, art.id).first();
    if (!p || p.parent_id) return { ok: false, status: 400, error: 'You can reply only to a published top-level comment' };
    parentId = p.id;
  }
  const ipHash = await hashIp(ip);
  const hourly = await db.prepare(`SELECT COUNT(*) AS c, MAX(created_at) AS last FROM news_comments WHERE ip_hash = ? AND created_at >= datetime('now','-1 hour')`).bind(ipHash).first();
  if ((hourly?.c || 0) >= 5) return { ok: false, status: 429, error: 'You are commenting very fast. Please try again later.' };
  const dupe = await db.prepare(`SELECT 1 AS x FROM news_comments WHERE news_id = ? AND body = ? AND created_at >= datetime('now','-1 day')`).bind(art.id, text).first();
  if (dupe) return { ok: true, status: 200, state: 'pending' };   // same words again: do not store a second copy
  const spam = looksLikeSpam(text);
  const status = spam ? 'spam' : flags.news_comments_open_posting ? 'approved' : 'pending';
  await db.prepare(`INSERT INTO news_comments (news_id, parent_id, author_name, author_email, body, status, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(art.id, parentId, name, email || null, text, status, ipHash).run();
  // A comment held back as spam is reported as "awaiting review" so spammers learn nothing.
  return { ok: true, status: 200, state: status === 'approved' ? 'approved' : 'pending' };
}

export async function listApproved(db, newsId) {
  const rows = (await db.prepare(`SELECT id, parent_id, author_name, body, created_at FROM news_comments WHERE news_id = ? AND status = 'approved' ORDER BY id ASC LIMIT 300`).bind(newsId).all()).results || [];
  const tops = rows.filter((r) => !r.parent_id).map((r) => ({ ...r, replies: [] }));
  const byId = new Map(tops.map((t) => [t.id, t]));
  for (const r of rows) if (r.parent_id && byId.has(r.parent_id)) byId.get(r.parent_id).replies.push(r);
  return tops;
}

const day = (v) => String(v || '').slice(0, 10);
function commentHtml(c, canReply) {
  return `<li class="nr-comment" id="comment-${c.id}" style="margin:0 0 18px;list-style:none">
<div style="font-size:14px"><strong>${esc(c.author_name)}</strong> <span style="color:var(--gray,#666)">· ${esc(day(c.created_at))}</span></div>
<div style="white-space:pre-wrap;word-wrap:break-word;margin:4px 0">${esc(c.body)}</div>${canReply ? `<button type="button" class="nr-comment-reply" data-id="${c.id}" data-name="${esc(c.author_name)}" style="background:none;border:0;padding:0;color:inherit;text-decoration:underline;cursor:pointer;font-size:13px">Reply</button>` : ''}
${c.replies && c.replies.length ? `<ul style="margin:12px 0 0 20px;padding:0">${c.replies.map((r) => commentHtml({ ...r, replies: [] }, false)).join('')}</ul>` : ''}</li>`;
}

// The block under the article. Empty (and no extra query beyond the shared cached flag read) when comments are off.
export async function renderCommentsBlock(db, article) {
  try {
    const flags = await getOpsFlags(db);
    if (!flags.news_comments || !article || !article.id) return '';
    const [list, closed] = await Promise.all([listApproved(db, article.id), db.prepare(`SELECT 1 AS x FROM news_comments_closed WHERE news_id = ?`).bind(article.id).first()]);
    const count = list.reduce((n, c) => n + 1 + c.replies.length, 0);
    const form = closed ? `<p style="color:var(--gray,#666)">Comments are closed on this article.</p>` : `<form id="nrCommentForm" data-slug="${esc(article.slug)}" novalidate style="margin-top:20px;max-width:640px">
<h3 style="font-size:17px;margin:0 0 10px">Leave a comment</h3>
<input type="hidden" name="parent_id" value="">
<p id="nrCommentReplying" hidden style="font-size:13px;margin:0 0 8px"></p>
<div class="form-group"><label for="nrc-name">Name</label><input id="nrc-name" name="name" type="text" maxlength="60" required autocomplete="name"></div>
<div class="form-group"><label for="nrc-email">Email (optional, never shown)</label><input id="nrc-email" name="email" type="email" maxlength="200" autocomplete="email"></div>
<div class="form-group"><label for="nrc-body">Comment</label><textarea id="nrc-body" name="body" rows="5" maxlength="${MAX_BODY}" required></textarea></div>
<div style="position:absolute;left:-9999px" aria-hidden="true"><label>Leave this empty <input name="website" tabindex="-1" autocomplete="off"></label></div>
<button type="submit" class="btn btn--primary">Post comment</button>
<p id="nrCommentStatus" role="status" aria-live="polite" style="margin-top:10px"></p></form>
<script src="/static/js/news-comments.js" defer></script>`;
    return `<section class="nr-comments" id="comments" aria-label="Comments" style="margin:36px 0">
<h2 style="font-size:20px;margin:0 0 16px">${count ? `${count} comment${count === 1 ? '' : 's'}` : 'Comments'}</h2>
${list.length ? `<ul style="margin:0;padding:0">${list.map((c) => commentHtml(c, !closed)).join('')}</ul>` : '<p style="color:var(--gray,#666)">No comments yet.</p>'}
${form}</section>`;
  } catch (e) { console.error('comments block skipped:', e && e.message); return ''; }
}

// ── moderation ───────────────────────────────────────────────
export async function listComments(db, { status = 'pending', limit = 100 } = {}) {
  const st = COMMENT_STATUSES.includes(status) ? status : 'pending';
  const rows = (await db.prepare(`SELECT c.id, c.news_id, c.parent_id, c.author_name, c.author_email, c.body, c.status, c.created_at, c.moderated_at,
      n.title AS article_title, n.slug AS article_slug, (SELECT COUNT(*) FROM news_comments_closed x WHERE x.news_id = c.news_id) AS closed
    FROM news_comments c JOIN news n ON n.id = c.news_id WHERE c.status = ? ORDER BY c.id DESC LIMIT ?`).bind(st, Math.min(Math.max(Number(limit) || 100, 1), 300)).all()).results || [];
  const counts = (await db.prepare(`SELECT status, COUNT(*) AS c FROM news_comments GROUP BY status`).all()).results || [];
  return { comments: rows, counts: Object.fromEntries(counts.map((c) => [c.status, c.c])) };
}

export async function moderateComment(db, { id, status, actor }) {
  if (!COMMENT_STATUSES.includes(status)) return { ok: false, status: 400, error: 'unknown status' };
  const c = await db.prepare(`SELECT id, news_id, status FROM news_comments WHERE id = ?`).bind(Number(id) || 0).first();
  if (!c) return { ok: false, status: 404, error: 'comment not found' };
  await db.prepare(`UPDATE news_comments SET status = ?, moderated_by = ?, moderated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(status, actor?.user_id ?? null, c.id).run();
  await logAudit(db, { userId: actor?.user_id, action: 'comment_moderated', entityType: 'news_comment', entityId: c.id, metadata: { news_id: c.news_id, from: c.status, to: status } });
  return { ok: true };
}

export async function setDiscussionClosed(db, { newsId, closed, actor }) {
  const n = await db.prepare(`SELECT id FROM news WHERE id = ?`).bind(Number(newsId) || 0).first();
  if (!n) return { ok: false, status: 404, error: 'article not found' };
  if (closed) await db.prepare(`INSERT OR REPLACE INTO news_comments_closed (news_id, closed_by) VALUES (?, ?)`).bind(n.id, actor?.user_id ?? null).run();
  else await db.prepare(`DELETE FROM news_comments_closed WHERE news_id = ?`).bind(n.id).run();
  await logAudit(db, { userId: actor?.user_id, action: 'comment_moderated', entityType: 'news', entityId: n.id, metadata: { discussion_closed: !!closed } });
  return { ok: true };
}
