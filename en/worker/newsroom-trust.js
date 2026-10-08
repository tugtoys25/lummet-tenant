// ============================================================
// en/worker/newsroom-trust.js  --  Stage F: Editorial Trust Center
//
// The trust pages are ordinary rows in the EXISTING `pages` table, served by
// the existing catch-all route (/en/<slug>, nested slugs allowed) and
// renderDynamicPage. This module only adds: default draft templates, a safe
// save path, and helpers that link articles to whichever trust pages are live.
//
// Rules this module enforces:
//  * No invented facts. Templates describe what the platform DOES (labels,
//    corrections, sources); every fact about the publisher is a
//    [[FILL IN: ...]] prompt. A page cannot be published while any prompt or
//    the draft-template notice is still in it.
//  * Templates are created UNPUBLISHED and never overwritten once they exist.
//  * Content is sanitized on save (sanitizeHtml) -- unlike generic pages,
//    which are stored as authored.
//  * {{site_name}} / {{site_url}} placeholders are resolved per tenant by the
//    template engine at render time; nothing tenant-specific is stored.
// ============================================================

import { sanitizeHtml } from './sanitize.js';
import { logAudit } from './database/audit.js';
import { checkPermission } from './database/permissions.js';
import { plainText, getNewsFlags, loadPublicNewsroom } from './database/newsroom.js';

export const DRAFT_NOTICE = 'DRAFT TEMPLATE';
const NOTICE_HTML = `<p><strong>${DRAFT_NOTICE}</strong> - review, complete every [[FILL IN]] item and delete this notice before publishing.</p>`;

const P = (s) => `<p>${s}</p>`;
export const TRUST_PAGES = [
  { slug: 'editorial', title: 'Editorial Policies', description: 'How the newsroom works and where to find its policies.',
    body: [P('This section explains how {{site_name}} produces and labels its news coverage. The individual policies are listed below.'),
      '<h2>What we publish</h2>',
      P('News reports, analysis, interviews, explainers, research and opinion. Each item carries a label that shows what kind of article it is, so readers can tell reporting from commentary.'),
      P('Press releases supplied by third parties are labelled as such and are not presented as independently reported journalism. Sponsored content is always labelled.')].join('') },
  { slug: 'editorial/about', title: 'About the Newsroom', description: 'Who publishes the news and how to reach them.',
    body: [P('{{site_name}} is published at {{site_url}}.'),
      '<h2>Who operates this publication</h2>', P('[[FILL IN: the legal name of the operating company, its registered address and country of registration]]'),
      '<h2>Newsroom</h2>', P('[[FILL IN: who leads the newsroom and how the editorial team is organised]]')].join('') },
  { slug: 'editorial/standards', title: 'Editorial Standards', description: 'How reporting is handled.',
    body: [P('These standards describe how the {{site_name}} newsroom approaches reporting.'),
      '<h2>Accuracy and sourcing</h2>', P('Articles can list their sources, including regulators, official statements, company filings and court documents. Where an article rests on a specific method or dataset, a Reporting and Methodology note explains it.'),
      '<h2>Verification</h2>', P('[[FILL IN: how articles are checked before publication and who is responsible for the check]]'),
      '<h2>Opinion and analysis</h2>', P('Opinion and analysis are labelled and kept distinct from news reporting.'),
      '<h2>Independence</h2>', P('[[FILL IN: how editorial decisions are kept separate from commercial and affiliate relationships]]')].join('') },
  { slug: 'editorial/corrections', title: 'Corrections Policy', description: 'How factual errors are corrected.',
    body: [P('When a published article contains a factual error, the correction is shown on the article itself rather than changed silently.'),
      '<h2>Types of notice</h2>',
      '<ul><li><strong>Correction</strong> - a factual error was fixed.</li><li><strong>Clarification</strong> - wording was made clearer without changing the facts.</li><li><strong>Update</strong> - new information was added.</li><li><strong>Retraction</strong> - the article is withdrawn.</li></ul>',
      P('Each notice is dated and appears at the top of the article.'),
      '<h2>Reporting an error</h2>', P('[[FILL IN: how readers should report a suspected error, for example an email address]]')].join('') },
  { slug: 'editorial/methodology', title: 'Sources and Methodology', description: 'How information is sourced and verified.',
    body: [P('Where an article draws on identifiable sources, they are listed under the article in a Sources section with their type, for example regulator, government, court document, company filing, press release, interview or research.'),
      P('Articles that rely on original data, documents or interviews may include a Reporting and Methodology section describing how the information was obtained.'),
      '<h2>Our approach to sources</h2>', P('[[FILL IN: how sources are assessed, and how confidential sources are handled]]')].join('') },
  { slug: 'editorial/affiliate-disclosure', title: 'Affiliate Disclosure', description: 'Relationship between editorial and commercial operations.',
    body: [P('{{site_name}} may have commercial relationships, such as affiliate arrangements, with some companies it writes about.'),
      '<h2>Our commercial relationships</h2>', P('[[FILL IN: what affiliate or commercial relationships exist and how the publisher earns revenue]]'),
      '<h2>How this relates to news coverage</h2>', P('[[FILL IN: how news coverage is kept independent of these relationships]]'),
      P('Content that is sponsored or otherwise commercial is labelled as such on the article.')].join('') },
  { slug: 'editorial/advertising', title: 'Advertising Policy', description: 'How advertising is handled.',
    body: [P('Pages on {{site_name}} may display advertising.'),
      '<h2>Advertising and editorial</h2>', P('[[FILL IN: the rules that keep advertising separate from editorial decisions]]')].join('') },
  { slug: 'editorial/ai-policy', title: 'AI Policy', description: 'How AI may assist production.',
    body: [P('This page explains whether and how artificial intelligence tools are used in producing {{site_name}} content.'),
      '<h2>Use of AI</h2>', P('[[FILL IN: whether AI tools are used, for which tasks, and how a human editor reviews the output]]'),
      P('Articles where AI tools assisted can carry an AI-assistance disclosure.')].join('') },
  { slug: 'editorial/contact', title: 'Contact the Newsroom', description: 'Newsroom contact information.',
    body: [P('You can reach the {{site_name}} newsroom using the details below.'),
      '<h2>Newsroom contact</h2>', P('[[FILL IN: newsroom email address and any other ways to reach the editorial team]]')].join('') }
];
export const TRUST_SLUGS = TRUST_PAGES.map((p) => p.slug);

// Which live trust page each article notice links to.
export const POLICY_LINK_TARGETS = {
  editorial_independence: 'editorial/standards', affiliate: 'editorial/affiliate-disclosure', sponsored: 'editorial/affiliate-disclosure',
  advertising: 'editorial/advertising', ai_assistance: 'editorial/ai-policy', corrections: 'editorial/corrections', methodology: 'editorial/methodology'
};

export const templateContent = (slug) => {
  const t = TRUST_PAGES.find((p) => p.slug === slug);
  return t ? NOTICE_HTML + t.body : null;
};

const stillTemplate = (html) => /\[\[FILL IN/i.test(html) || html.includes(DRAFT_NOTICE);

// ── status ───────────────────────────────────────────────────
export async function listTrustPages(db) {
  const ph = TRUST_SLUGS.map(() => '?').join(',');
  const rows = (await db.prepare(`SELECT slug, title, published, updated_at FROM pages WHERE slug IN (${ph})`).bind(...TRUST_SLUGS).all()).results || [];
  const by = new Map(rows.map((r) => [r.slug, r]));
  return TRUST_PAGES.map((t) => {
    const r = by.get(t.slug);
    return { slug: t.slug, template_title: t.title, exists: !!r, title: r?.title || null, published: r ? Number(r.published) === 1 : false, updated_at: r?.updated_at || null };
  });
}

export async function getTrustPage(db, slug, perms) {
  if (!checkPermission(perms, 'news', 'manage_settings')) return null;
  if (!TRUST_SLUGS.includes(slug)) return null;
  return await db.prepare(`SELECT slug, title, content_json, seo_title, seo_description, published FROM pages WHERE slug = ?`).bind(slug).first();
}

// Public: which trust pages are live right now (1 small query).
export async function getPublishedTrustSlugs(db) {
  const ph = TRUST_SLUGS.map(() => '?').join(',');
  const r = await db.prepare(`SELECT slug FROM pages WHERE published = 1 AND slug IN (${ph})`).bind(...TRUST_SLUGS).all();
  return (r.results || []).map((x) => x.slug);
}

// Live trust pages with their current titles (hub index uses the editors' own titles).
export async function getPublishedTrustPages(db) {
  const ph = TRUST_SLUGS.map(() => '?').join(',');
  return (await db.prepare(`SELECT slug, title FROM pages WHERE published = 1 AND slug IN (${ph})`).bind(...TRUST_SLUGS).all()).results || [];
}

// { affiliate: '/en/editorial/...', corrections: ..., ... } for live pages only.
export function policyLinksFrom(publishedSlugs) {
  const live = new Set(publishedSlugs || []);
  const out = {};
  for (const [key, slug] of Object.entries(POLICY_LINK_TARGETS)) if (live.has(slug)) out[key] = `/en/${slug}`;
  return out;
}

// ── create draft from template (never overwrites) ────────────
export async function createTrustDraft(db, slug, { actor, perms }) {
  if (!checkPermission(perms, 'news', 'manage_settings')) return { ok: false, status: 403, error: 'forbidden' };
  const t = TRUST_PAGES.find((p) => p.slug === slug);
  if (!t) return { ok: false, status: 404, error: 'unknown trust page' };
  const exists = await db.prepare(`SELECT id FROM pages WHERE slug = ?`).bind(slug).first();
  if (exists) return { ok: false, status: 409, error: 'page already exists' };
  await db.prepare(`
    INSERT INTO pages (slug, type, template, title, content_json, seo_title, seo_description, published, created_by)
    VALUES (?, 'page', 'page.html', ?, ?, ?, ?, 0, ?)
  `).bind(slug, t.title, JSON.stringify(templateContent(slug)), t.title, t.description, actor?.user_id ?? null).run();
  await logAudit(db, { userId: actor?.user_id, action: 'taxonomy_changed', entityType: 'trust_page', entityId: null, metadata: { op: 'create_draft', slug } });
  return { ok: true };
}

// ── save (edit + publish/unpublish) ──────────────────────────
export async function saveTrustPage(db, input, { actor, perms }) {
  if (!checkPermission(perms, 'news', 'manage_settings')) return { ok: false, status: 403, error: 'forbidden' };
  const slug = input?.slug;
  if (!TRUST_SLUGS.includes(slug)) return { ok: false, status: 404, error: 'unknown trust page' };
  const cur = await db.prepare(`SELECT id, published FROM pages WHERE slug = ?`).bind(slug).first();
  if (!cur) return { ok: false, status: 404, error: 'page not created yet' };

  const title = plainText(input.title, 160);
  if (!title) return { ok: false, status: 400, error: 'title is required' };
  if (typeof input.content !== 'string' || input.content.length > 100000) return { ok: false, status: 400, error: 'content must be a string under 100 KB' };
  const html = sanitizeHtml(input.content).trim();
  if (!html) return { ok: false, status: 400, error: 'content is empty' };

  const publish = input.published === undefined ? Number(cur.published) === 1 : input.published === true;
  if (publish && stillTemplate(html)) {
    return { ok: false, status: 409, error: 'Complete every [[FILL IN]] item and remove the draft-template notice before publishing' };
  }

  await db.prepare(`
    UPDATE pages SET title = ?, content_json = ?, seo_title = ?, seo_description = ?, published = ?, updated_at = CURRENT_TIMESTAMP WHERE slug = ?
  `).bind(title, JSON.stringify(html), plainText(input.seo_title, 160) || title, plainText(input.seo_description, 320) || null, publish ? 1 : 0, slug).run();

  await logAudit(db, { userId: actor?.user_id, action: 'taxonomy_changed', entityType: 'trust_page', entityId: cur.id,
    metadata: { slug, published: publish, publish_changed: publish !== (Number(cur.published) === 1) } });
  return { ok: true, published: publish };
}

// Hub page (/en/editorial): links to whichever trust pages are live.
export function renderTrustIndex(publishedSlugs, titlesBySlug = {}) {
  const live = TRUST_PAGES.filter((t) => t.slug !== 'editorial' && (publishedSlugs || []).includes(t.slug));
  if (!live.length) return '';
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\{/g, '&#123;').replace(/\}/g, '&#125;');
  return `<nav aria-label="Editorial policies"><ul>${live.map((t) => `<li><a href="/en/${t.slug}">${esc(titlesBySlug[t.slug] || t.title)}</a> - ${esc(t.description)}</li>`).join('')}</ul></nav>`;
}

// One call for the article renderer: newsroom extras + links to LIVE trust pages.
// Returns { flags, extras: null, policyLinks: {} } (no extra queries beyond the
// cached flag read) when no newsroom feature is on. Never throws for optional parts.
export async function loadNewsroomForArticle(db, article) {
  const flags = await getNewsFlags(db);
  if (!(flags.news_new_taxonomy || flags.news_sources_display || flags.news_corrections_display)) return { flags, extras: null, policyLinks: {} };
  const [extras, live] = await Promise.all([
    loadPublicNewsroom(db, article, flags),
    getPublishedTrustSlugs(db).catch((e) => { console.error('trust slugs failed:', e.message); return []; })
  ]);
  return { flags, extras, policyLinks: policyLinksFrom(live) };
}
