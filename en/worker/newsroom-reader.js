// worker/newsroom-reader.js -- reader features: polls and live blogs. Additive (new tables, new switches, all off).
// Polls: one per article, 2-6 options, one vote per reader (a salted hash, never an address). Votes are never deleted.
// Live blogs: timestamped updates on an article; a mistake is hidden, never deleted. Text is plain text, escaped on output.

import { checkPermission } from './database/permissions.js';
import { logAudit } from './database/audit.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plain = (s, max) => String(s ?? '').replace(/<[^>]*>/g, '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
const parse = (v) => { const s = String(v || ''); const t = Date.parse(s.replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? '' : 'Z')); return Number.isNaN(t) ? null : t; };
const iso = (v) => { const t = parse(v); return t === null ? null : new Date(t).toISOString(); };
const toSql = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
const forbidden = { ok: false, status: 403, error: 'Forbidden' };
const STYLE = '<style>.news-reader{margin:28px 0;padding:18px;border:1px solid #e2e8f0;border-radius:12px;background:#fff;color:#0f172a}.news-reader h2,.news-reader h3{margin:0 0 12px;font-size:20px}.news-poll button{display:block;width:100%;margin:8px 0;padding:12px 14px;min-height:44px;text-align:left;font:inherit;border:1px solid #94a3b8;border-radius:8px;background:#f8fafc;color:#0f172a;cursor:pointer}.news-poll button:hover{background:#eef2ff}.news-poll__row{position:relative;margin:8px 0;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;overflow:hidden}.news-poll__bar{position:absolute;inset:0 auto 0 0;background:#dbeafe;z-index:0}.news-poll__row span{position:relative;z-index:1}.news-poll__meta{font-size:13px;color:#64748b}.news-live__badge{display:inline-block;padding:2px 8px;border-radius:999px;background:#dc2626;color:#fff;font-size:12px;font-weight:700;letter-spacing:.06em}.news-live__badge--ended{background:#64748b}.news-live__post{padding:12px 0;border-top:1px solid #e2e8f0}.news-live__post--pinned{background:#fffbeb;padding:12px}.news-live__time{display:block;font-size:13px;color:#64748b;margin-bottom:4px}</style>';

// ── polls ────────────────────────────────────────────────────
export async function getPoll(db, newsId, { now = Date.now() } = {}) {
  const p = await db.prepare(`SELECT id, news_id, question, closes_at, closed FROM news_polls WHERE news_id = ?`).bind(newsId).first().catch(() => null);
  if (!p) return null;
  const opts = (await db.prepare(`SELECT o.id, o.label, (SELECT COUNT(*) FROM news_poll_votes v WHERE v.option_id = o.id) AS votes FROM news_poll_options o WHERE o.poll_id = ? ORDER BY o.position, o.id`).bind(p.id).all()).results || [];
  const total = opts.reduce((n, o) => n + o.votes, 0);
  const closesMs = p.closes_at ? parse(p.closes_at) : null;
  return { id: p.id, news_id: p.news_id, question: p.question, closes_at: iso(p.closes_at), closed: !!p.closed || (closesMs !== null && closesMs <= now), total,
    options: opts.map((o) => ({ id: o.id, label: o.label, votes: o.votes, pct: total ? Math.round((o.votes * 100) / total) : 0 })) };
}

export async function savePoll(db, { newsId, question, options, closesAt, actor, perms }) {
  if (!checkPermission(perms, 'news', 'update')) return forbidden;
  const q = plain(question, 200);
  if (q.length < 5) return { ok: false, status: 400, error: 'Write the question (at least 5 characters)' };
  const labels = (Array.isArray(options) ? options : []).map((o) => plain(o, 120)).filter(Boolean);
  if (labels.length < 2 || labels.length > 6) return { ok: false, status: 400, error: 'A poll needs 2 to 6 options' };
  if (new Set(labels.map((l) => l.toLowerCase())).size !== labels.length) return { ok: false, status: 400, error: 'Options must be different from each other' };
  let closes = null;
  if (closesAt) { const t = Date.parse(String(closesAt)); if (Number.isNaN(t) || t <= Date.now()) return { ok: false, status: 400, error: 'The closing time must be in the future' }; closes = toSql(t); }
  const art = await db.prepare(`SELECT id FROM news WHERE id = ?`).bind(newsId).first();
  if (!art) return { ok: false, status: 404, error: 'Article not found' };
  const cur = await db.prepare(`SELECT id FROM news_polls WHERE news_id = ?`).bind(newsId).first();
  if (!cur) {
    const r = await db.prepare(`INSERT INTO news_polls (news_id, question, closes_at, created_by) VALUES (?, ?, ?, ?)`).bind(newsId, q, closes, actor?.user_id ?? null).run();
    const pid = r.meta?.last_row_id;
    for (let i = 0; i < labels.length; i++) await db.prepare(`INSERT INTO news_poll_options (poll_id, label, position) VALUES (?, ?, ?)`).bind(pid, labels[i], i).run();
  } else {
    const have = (await db.prepare(`SELECT label FROM news_poll_options WHERE poll_id = ? ORDER BY position, id`).bind(cur.id).all()).results.map((o) => o.label);
    const votes = (await db.prepare(`SELECT COUNT(*) c FROM news_poll_votes WHERE poll_id = ?`).bind(cur.id).first()).c;
    if (votes > 0 && JSON.stringify(have) !== JSON.stringify(labels)) return { ok: false, status: 409, error: 'The options cannot change once people have voted. You can still change the question or the closing time.' };
    await db.prepare(`UPDATE news_polls SET question = ?, closes_at = ?, closed = 0 WHERE id = ?`).bind(q, closes, cur.id).run();
    if (votes === 0) {
      await db.prepare(`DELETE FROM news_poll_options WHERE poll_id = ?`).bind(cur.id).run();   // no votes exist, so nothing is lost
      for (let i = 0; i < labels.length; i++) await db.prepare(`INSERT INTO news_poll_options (poll_id, label, position) VALUES (?, ?, ?)`).bind(cur.id, labels[i], i).run();
    }
  }
  await logAudit(db, { userId: actor?.user_id ?? null, action: 'article_updated', entityType: 'news', entityId: newsId, metadata: { poll: 'saved' } });
  return { ok: true };
}

export async function closePoll(db, { newsId, actor, perms }) {
  if (!checkPermission(perms, 'news', 'update')) return forbidden;
  await db.prepare(`UPDATE news_polls SET closed = 1 WHERE news_id = ?`).bind(newsId).run();
  await logAudit(db, { userId: actor?.user_id ?? null, action: 'article_updated', entityType: 'news', entityId: newsId, metadata: { poll: 'closed' } });
  return { ok: true };
}

async function voterHash(pollId, ip, ua) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`poll|${pollId}|${ip || 'anon'}|${String(ua || '').slice(0, 120)}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Public vote. The poll must be open and its article live. A second vote from the same reader just returns the results.
export async function votePoll(env, { pollId, optionId, ip, ua }) {
  const pid = Number(pollId), oid = Number(optionId);
  if (!Number.isInteger(pid) || !Number.isInteger(oid)) return { ok: false, status: 400, error: 'Invalid vote' };
  const row = await env.DB.prepare(`SELECT p.id, p.news_id FROM news_polls p JOIN news n ON n.id = p.news_id WHERE p.id = ? AND n.published = 1 AND (n.published_at IS NULL OR datetime(n.published_at) <= datetime('now'))`).bind(pid).first();
  if (!row) return { ok: false, status: 404, error: 'Poll not found' };
  const poll = await getPoll(env.DB, row.news_id);
  if (poll.closed) return { ok: true, status: 200, poll, already: true };
  if (!poll.options.some((o) => o.id === oid)) return { ok: false, status: 400, error: 'Invalid option' };
  const h = await voterHash(pid, ip, ua);
  const r = await env.DB.prepare(`INSERT OR IGNORE INTO news_poll_votes (poll_id, voter_hash, option_id) VALUES (?, ?, ?)`).bind(pid, h, oid).run();
  return { ok: true, status: 200, poll: await getPoll(env.DB, row.news_id), already: !(r.meta?.changes > 0) };
}

export function renderPollHtml(poll) {
  if (!poll) return '';
  const results = (p) => `<div class="news-poll__results">${p.options.map((o) => `<div class="news-poll__row"><div class="news-poll__bar" style="width:${o.pct}%"></div><span>${esc(o.label)} — <strong>${o.pct}%</strong></span></div>`).join('')}<p class="news-poll__meta">${p.total} vote${p.total === 1 ? '' : 's'}${p.closed ? ' · poll closed' : ''}</p></div>`;
  const body = poll.closed ? results(poll)
    : `<div class="news-poll__choices">${poll.options.map((o) => `<button type="button" data-poll-option="${o.id}">${esc(o.label)}</button>`).join('')}</div><p class="news-poll__meta">${poll.closes_at ? `Closes <time datetime="${esc(poll.closes_at)}" data-news-time="card">${esc(poll.closes_at.slice(0, 16).replace('T', ' '))} UTC</time>` : 'Pick one to see the results'}</p>`;
  return `${STYLE}<section class="news-reader news-poll" data-poll="${poll.id}" data-article="${poll.news_id}" aria-label="Poll"><h2>${esc(poll.question)}</h2>${body}<p class="news-poll__meta" role="status" aria-live="polite"></p></section>`;
}

// ── live blogs ───────────────────────────────────────────────
export async function getLive(db, newsId, { sinceId = 0, includeHidden = false, limit = 200 } = {}) {
  const l = await db.prepare(`SELECT status, started_at, ended_at FROM news_live WHERE news_id = ?`).bind(newsId).first().catch(() => null);
  if (!l) return null;
  const posts = (await db.prepare(`SELECT id, body, pinned, hidden, posted_at, edited_at FROM news_live_posts WHERE news_id = ? AND id > ?${includeHidden ? '' : ' AND hidden = 0'} ORDER BY pinned DESC, id DESC LIMIT ?`).bind(newsId, Number(sinceId) || 0, limit).all()).results || [];
  return { status: l.status, started_at: iso(l.started_at), ended_at: iso(l.ended_at), posts: posts.map((p) => ({ id: p.id, body: p.body, html: esc(p.body).replace(/\r?\n/g, '<br>'), pinned: !!p.pinned, hidden: !!p.hidden, at: iso(p.posted_at), edited: !!p.edited_at })) };
}

export async function liveAct(db, { newsId, op, body, postId, actor, perms }) {
  if (!checkPermission(perms, 'news', 'update')) return forbidden;
  const audit = (m) => logAudit(db, { userId: actor?.user_id ?? null, action: 'article_updated', entityType: 'news', entityId: newsId, metadata: { live: m } });
  const cur = await db.prepare(`SELECT status FROM news_live WHERE news_id = ?`).bind(newsId).first();
  if (op === 'start') {
    if (cur) await db.prepare(`UPDATE news_live SET status = 'live', ended_at = NULL WHERE news_id = ?`).bind(newsId).run();
    else await db.prepare(`INSERT INTO news_live (news_id, created_by) VALUES (?, ?)`).bind(newsId, actor?.user_id ?? null).run();
    await audit('started'); return { ok: true };
  }
  if (!cur) return { ok: false, status: 409, error: 'Start the live blog first' };
  if (op === 'end') { await db.prepare(`UPDATE news_live SET status = 'ended', ended_at = CURRENT_TIMESTAMP WHERE news_id = ?`).bind(newsId).run(); await audit('ended'); return { ok: true }; }
  if (op === 'post') {
    const text = plain(body, 2000); if (text.length < 2) return { ok: false, status: 400, error: 'Write the update' };
    const r = await db.prepare(`INSERT INTO news_live_posts (news_id, body, created_by) VALUES (?, ?, ?)`).bind(newsId, text, actor?.user_id ?? null).run();
    await audit('post'); return { ok: true, id: r.meta?.last_row_id };
  }
  const pid = Number(postId);
  const own = Number.isInteger(pid) ? await db.prepare(`SELECT id FROM news_live_posts WHERE id = ? AND news_id = ?`).bind(pid, newsId).first() : null;
  if (!own) return { ok: false, status: 404, error: 'Update not found' };
  if (op === 'edit') { const text = plain(body, 2000); if (text.length < 2) return { ok: false, status: 400, error: 'Write the update' }; await db.prepare(`UPDATE news_live_posts SET body = ?, edited_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(text, pid).run(); }
  else if (op === 'hide' || op === 'unhide') await db.prepare(`UPDATE news_live_posts SET hidden = ? WHERE id = ?`).bind(op === 'hide' ? 1 : 0, pid).run();
  else if (op === 'pin' || op === 'unpin') await db.prepare(`UPDATE news_live_posts SET pinned = ? WHERE id = ?`).bind(op === 'pin' ? 1 : 0, pid).run();
  else return { ok: false, status: 400, error: 'Unknown action' };
  await audit(op); return { ok: true };
}

export function renderLiveHtml(live, { title = '', url = '', articleId = '' } = {}) {
  if (!live) return '';
  const ended = live.status !== 'live';
  const posts = live.posts.map((p) => `<article class="news-live__post${p.pinned ? ' news-live__post--pinned' : ''}" data-live-post="${p.id}"><time class="news-live__time" datetime="${esc(p.at)}" data-news-time="card">${esc((p.at || '').slice(0, 16).replace('T', ' '))} UTC</time>${p.pinned ? '<strong>Pinned · </strong>' : ''}${p.html}${p.edited ? ' <span class="news-poll__meta">(edited)</span>' : ''}</article>`).join('');
  const ld = { '@context': 'https://schema.org', '@type': 'LiveBlogPosting', headline: String(title).slice(0, 110), url, coverageStartTime: live.started_at, ...(ended && live.ended_at ? { coverageEndTime: live.ended_at } : {}),
    liveBlogUpdate: live.posts.slice(0, 20).map((p) => ({ '@type': 'BlogPosting', datePublished: p.at, articleBody: p.body.slice(0, 500) })) };
  return `${STYLE}<section class="news-reader news-live" data-live="${ended ? 'ended' : 'live'}" data-article="${esc(articleId)}" aria-label="Live updates"><h2><span class="news-live__badge${ended ? ' news-live__badge--ended' : ''}">${ended ? 'ENDED' : '● LIVE'}</span> Live updates</h2><div class="news-live__list" aria-live="polite">${posts || '<p class="news-poll__meta">No updates yet.</p>'}</div></section><script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`;
}
