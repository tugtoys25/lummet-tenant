// worker/newsroom-translations.js -- translations (switch news_translations, off by default).
// Each translation is its own article (its own slug, text and page). Articles that translate each other share a group and each
// has one language. The normal page then declares the language, lists the others in <link rel="alternate" hreflang>, and shows a
// small "also available in" line. Only published, live translations are ever advertised. Nothing is merged or deleted.
import { checkPermission } from './database/permissions.js';
import { logAudit } from './database/audit.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const LANG_RE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;
export const normLang = (v) => { const s = String(v || '').trim(); const m = s.match(/^([a-zA-Z]{2,3})(?:[-_]([A-Za-z0-9]{2,8}))?$/); return m ? m[1].toLowerCase() + (m[2] ? '-' + (m[2].length === 2 ? m[2].toUpperCase() : m[2]) : '') : ''; };
export const langName = (code) => { try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) || code; } catch { return code; } };
const LIVE = `n.published = 1 AND (n.published_at IS NULL OR datetime(n.published_at) <= datetime('now'))`;

export async function getTranslations(db, newsId) {
  const me = await db.prepare(`SELECT group_id, lang FROM news_language WHERE news_id = ?`).bind(newsId).first().catch(() => null);
  if (!me) return { lang: null, group_id: null, siblings: [] };
  const sib = (await db.prepare(`SELECT l.news_id AS id, l.lang, n.slug, n.title, n.published FROM news_language l JOIN news n ON n.id = l.news_id WHERE l.group_id = ? AND l.news_id != ? ORDER BY l.lang`).bind(me.group_id, newsId).all()).results || [];
  return { lang: me.lang, group_id: me.group_id, siblings: sib.map((s) => ({ ...s, name: langName(s.lang) })) };
}

export async function setLanguage(db, { newsId, lang, actor, perms }) {
  if (!checkPermission(perms, 'news', 'update')) return { ok: false, status: 403, error: 'Forbidden' };
  const code = normLang(lang);
  if (!code || !LANG_RE.test(code.replace(/-[A-Z0-9]+$/, (m) => m.toLowerCase()))) return { ok: false, status: 400, error: 'Use a language code such as en, fr, rw or pt-BR' };
  const art = await db.prepare(`SELECT id FROM news WHERE id = ?`).bind(newsId).first();
  if (!art) return { ok: false, status: 404, error: 'Article not found' };
  const cur = await db.prepare(`SELECT group_id FROM news_language WHERE news_id = ?`).bind(newsId).first();
  if (cur) {
    const clash = await db.prepare(`SELECT 1 x FROM news_language WHERE group_id = ? AND lang = ? AND news_id != ?`).bind(cur.group_id, code, newsId).first();
    if (clash) return { ok: false, status: 409, error: 'Another article in this group already uses that language' };
    await db.prepare(`UPDATE news_language SET lang = ? WHERE news_id = ?`).bind(code, newsId).run();
  } else await db.prepare(`INSERT INTO news_language (news_id, group_id, lang) VALUES (?, ?, ?)`).bind(newsId, newsId, code).run();
  await logAudit(db, { userId: actor?.user_id ?? null, action: 'article_updated', entityType: 'news', entityId: newsId, metadata: { language: code } });
  return { ok: true };
}

// Make `otherId` a translation of `newsId`, in language `lang`. `newsId` must already have a language.
export async function linkTranslation(db, { newsId, otherId, lang, actor, perms }) {
  if (!checkPermission(perms, 'news', 'update')) return { ok: false, status: 403, error: 'Forbidden' };
  const oid = Number(otherId), code = normLang(lang);
  if (!Number.isInteger(oid) || oid === newsId) return { ok: false, status: 400, error: 'Choose a different article' };
  if (!code) return { ok: false, status: 400, error: 'Use a language code such as en, fr, rw or pt-BR' };
  const me = await db.prepare(`SELECT group_id FROM news_language WHERE news_id = ?`).bind(newsId).first();
  if (!me) return { ok: false, status: 409, error: 'Set the language of this article first' };
  const other = await db.prepare(`SELECT id FROM news WHERE id = ?`).bind(oid).first();
  if (!other) return { ok: false, status: 404, error: 'That article was not found' };
  const there = await db.prepare(`SELECT group_id FROM news_language WHERE news_id = ?`).bind(oid).first();
  if (there && there.group_id !== me.group_id) return { ok: false, status: 409, error: 'That article is already a translation of another story. Unlink it there first.' };
  const clash = await db.prepare(`SELECT 1 x FROM news_language WHERE group_id = ? AND lang = ? AND news_id != ?`).bind(me.group_id, code, oid).first();
  if (clash) return { ok: false, status: 409, error: 'This group already has an article in that language' };
  if (there) await db.prepare(`UPDATE news_language SET lang = ? WHERE news_id = ?`).bind(code, oid).run();
  else await db.prepare(`INSERT INTO news_language (news_id, group_id, lang) VALUES (?, ?, ?)`).bind(oid, me.group_id, code).run();
  await logAudit(db, { userId: actor?.user_id ?? null, action: 'article_updated', entityType: 'news', entityId: newsId, metadata: { translation_linked: oid, lang: code } });
  return { ok: true };
}

// Take an article out of its group (the article itself is untouched).
export async function unlinkTranslation(db, { newsId, actor, perms }) {
  if (!checkPermission(perms, 'news', 'update')) return { ok: false, status: 403, error: 'Forbidden' };
  await db.prepare(`DELETE FROM news_language WHERE news_id = ?`).bind(newsId).run();
  await logAudit(db, { userId: actor?.user_id ?? null, action: 'article_updated', entityType: 'news', entityId: newsId, metadata: { translation_unlinked: true } });
  return { ok: true };
}

// What the public page may advertise: this article plus its live translations. Empty when there is nothing to link.
export async function publicAlternates(db, newsId) {
  const me = await db.prepare(`SELECT group_id, lang FROM news_language WHERE news_id = ?`).bind(newsId).first().catch(() => null);
  if (!me) return { lang: null, alternates: [] };
  const rows = (await db.prepare(`SELECT l.lang, n.slug, n.title FROM news_language l JOIN news n ON n.id = l.news_id WHERE l.group_id = ? AND l.news_id != ? AND ${LIVE} ORDER BY l.lang`).bind(me.group_id, newsId).all()).results || [];
  return { lang: me.lang, alternates: rows.map((r) => ({ lang: r.lang, slug: r.slug, title: r.title, name: langName(r.lang) })) };
}

export function hreflangLinks({ lang, selfSlug, alternates }, origin) {
  if (!alternates.length) return '';
  const all = [{ lang, slug: selfSlug }, ...alternates];
  const url = (s) => `${origin}/en/news/${encodeURIComponent(s)}`;
  const def = all.find((a) => a.lang === 'en') || all[0];
  return all.map((a) => `<link rel="alternate" hreflang="${esc(a.lang)}" href="${esc(url(a.slug))}">`).join('\n') + `\n<link rel="alternate" hreflang="x-default" href="${esc(url(def.slug))}">`;
}

export function renderLangSwitcher({ alternates }) {
  if (!alternates.length) return '';
  return `<p class="news-translations" style="margin:0 0 16px;font-size:14px;color:#64748b">Also available in: ${alternates.map((a) => `<a href="/en/news/${encodeURIComponent(a.slug)}" hreflang="${esc(a.lang)}" lang="${esc(a.lang)}" title="${esc(a.title)}">${esc(a.name)}</a>`).join(' · ')}</p>`;
}

// For the sitemap: slug -> [{lang, slug}] of every live article in a group that has at least two live articles, INCLUDING the
// article itself (Google wants each page to list the whole set, itself too). Never throws; empty when nothing is linked.
export async function sitemapAlternates(db) {
  const out = new Map();
  try {
    const rows = (await db.prepare(`SELECT l.group_id, l.lang, n.slug FROM news_language l JOIN news n ON n.id = l.news_id WHERE ${LIVE} ORDER BY l.group_id, l.lang`).all()).results || [];
    const groups = new Map();
    for (const r of rows) { if (!groups.has(r.group_id)) groups.set(r.group_id, []); groups.get(r.group_id).push({ lang: r.lang, slug: r.slug }); }
    for (const g of groups.values()) if (g.length > 1) for (const m of g) out.set(m.slug, g);
  } catch (e) { console.error('sitemap alternates failed:', e.message); }
  return out;
}
