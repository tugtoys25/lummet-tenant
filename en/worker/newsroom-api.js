// ============================================================
// en/worker/newsroom-api.js  --  Stage C: newsroom admin API + save hooks
//
// Mounted from api.js AFTER authentication, so `user` is always a real
// session user. Every endpoint additionally:
//   * requires application/json + same-origin for writes (defence in depth
//     on top of SameSite=Lax session cookies)
//   * checks a specific news.<action> permission (checkPermission)
//   * applies item-level access (canAccessItem) for per-article endpoints;
//     an inaccessible article answers 404, same as the existing news API
//   * uses only bound parameters; never returns internal columns to callers
//     that lack news.read
//
// The coarse write gate in api.js (prefix /api/v1/news -> resource "news")
// also covers these paths, as an extra layer.
//
// Feature flags: workflow endpoints require `news_editorial_workflow`.
// Data-entry endpoints (taxonomy, meta, sources, corrections) are always
// available to authorised users: they only write additive tables and change
// nothing public until the public-rendering flags are switched on.
// ============================================================

import * as permDB from './database/permissions.js';
import * as itemAccess from './database/item-access.js';
import { logAudit } from './database/audit.js';
import { invalidateNews } from './cache.js';
import * as nr from './database/newsroom.js';
import { resetNewsFlagCache } from './database/newsroom.js';
import * as tx from './database/newsroom-taxonomy.js';
import * as trust from './newsroom-trust.js';
import * as stats from './newsroom-stats.js';
import * as analytics from './newsroom-analytics.js';
import * as search from './newsroom-search.js';

export const NEWSROOM_ROLES = ['Reporter', 'Senior Reporter', 'Editor', 'Senior Editor', 'Managing Editor',
  'Researcher', 'Data Editor', 'Correspondent', 'Contributor'];

// ── Feature flags (system_settings, key LIKE 'news_%') ────────
// Descriptions shown in the admin UI. A flag not listed here still shows up
// (labelled with its raw key) if it exists in the database -- this list is
// documentation, not an allow-list for reads. Writes ARE allow-listed below.
const FLAG_INFO = {
  news_editorial_workflow: { label: 'Editorial workflow', help: 'Draft -> review -> fact-check -> approve -> publish, with revision history. Off: legacy simple publishing.' },
  news_new_taxonomy: { label: 'Sections, regions, countries & topics', help: 'Section/region/country/topic/series pages, article badges & notices, discovery links. Needs sections/topics set up first.' },
  news_sources_display: { label: 'Public sources & methodology', help: 'Shows the Sources list and Reporting & Methodology on published articles.' },
  news_corrections_display: { label: 'Public corrections banner', help: 'Shows corrections, clarifications, updates and retractions on articles.' },
  news_entity_pages: { label: 'Entity pages', help: '/en/news/entity/<slug> pages and company/person chips on articles.' },
  news_v2_homepage: { label: 'News homepage v2', help: 'Replaces /en/news with the lead story, latest, most read, trending and section blocks.' },
  news_trending: { label: 'Trending block', help: 'Needs page-view data; shows a trending list on the homepage and in Most Read.' },
  news_analytics_enrichment: { label: 'Analytics enrichment', help: 'Records a bot flag, device type and UTM parameters on news page views from the moment this is turned on (not retroactive).' },
  news_google_sitemap: { label: 'Google News sitemap', help: 'Publishes /en/news-sitemap.xml. Only useful once the publication is accepted in Google Publisher Center.' },
  news_search_v2: { label: 'News search v2', help: 'Replaces /en/news?q= search. Rebuild the search index (Search tab) before turning this on.' },
};

const QUEUE_VIEWS = ['drafts', 'assigned_to_me', 'review', 'factcheck', 'approved', 'scheduled', 'published', 'corrections'];
const MAX_BODY = 512 * 1024;

const respond = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const ok = (data = {}) => respond({ success: true, ...data });
const fail = (error, status = 400) => respond({ success: false, error }, status);
const fromResult = (r, extra = {}) => (r.ok ? ok({ ...extra, ...(r.id !== undefined ? { id: r.id } : {}), ...(r.changed ? { changed: r.changed } : {}) }) : fail(r.error, r.status || 400));

function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return true; // non-browser / same-origin navigations omit it
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

async function readJson(request) {
  const ct = request.headers.get('Content-Type') || '';
  if (!ct.toLowerCase().includes('application/json')) return { error: fail('Content-Type must be application/json', 415) };
  const len = Number(request.headers.get('Content-Length') || 0);
  if (len > MAX_BODY) return { error: fail('Request too large', 413) };
  const text = await request.text();
  if (text.length > MAX_BODY) return { error: fail('Request too large', 413) };
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: fail('Invalid JSON body') };
    return { body };
  } catch { return { error: fail('Invalid JSON') }; }
}

// Load one article the caller may access for `action` (read|update), else null.
async function accessibleArticle(env, user, id, action) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return null;
  const item = await itemAccess.getItemById(env.DB, 'news', n);
  if (!item) return null;
  return (await itemAccess.canAccessItem(env.DB, user, 'news', action, item)) ? item : null;
}

// ── Main dispatcher ──────────────────────────────────────────
export async function handleNewsroomApi(request, env, user) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/en(?=\/)/, '');    // normalize, same as routes.js
  if (!path.startsWith('/api/v1/newsroom/')) return null;
  if (!user) return fail('Unauthorized', 401);

  const route = path.slice('/api/v1/newsroom/'.length);
  const isWrite = request.method === 'POST';
  if (request.method !== 'GET' && !isWrite) return fail('Method not allowed', 405);
  if (isWrite && !sameOrigin(request)) return fail('Cross-origin request refused', 403);

  const perms = await permDB.getPermissionsForUser(env.DB, user);
  const can = (a) => permDB.checkPermission(perms, 'news', a);
  const actor = { user_id: user.user_id };

  try {
    // ---------- reads ----------
    if (!isWrite) {
      if (!can('read')) return fail('Forbidden', 403);

      if (route === 'article') {
        const item = await accessibleArticle(env, user, url.searchParams.get('id'), 'read');
        if (!item) return fail('News article not found', 404);
        return ok(await loadBundle(env.DB, item.id, perms));
      }
      if (route === 'revisions') {
        const item = await accessibleArticle(env, user, url.searchParams.get('id'), 'read');
        if (!item) return fail('News article not found', 404);
        return ok({ revisions: await nr.listRevisions(env.DB, item.id, perms) });
      }
      if (route === 'revision') {
        const item = await accessibleArticle(env, user, url.searchParams.get('id'), 'read');
        if (!item) return fail('News article not found', 404);
        const rev = await nr.getRevision(env.DB, item.id, Number(url.searchParams.get('v')), perms);
        return rev ? ok({ revision: rev }) : fail('Revision not found', 404);
      }
      if (route === 'queue') return listQueue(env, user, url, actor);
      if (route === 'trust-pages/list') return can('manage_settings') ? ok({ pages: await trust.listTrustPages(env.DB) }) : fail('Forbidden', 403);
      if (route === 'trust-pages/get') {
        const p = await trust.getTrustPage(env.DB, url.searchParams.get('slug'), perms);
        return p ? ok({ page: { ...p, content: safeParse(p.content_json, p.content_json) } }) : fail('Trust page not found', 404);
      }
      if (route === 'pins/list') {
        const slot = url.searchParams.get('slot');
        if (!stats.PIN_SLOTS.includes(slot)) return fail('invalid slot');
        const r = await env.DB.prepare(`SELECT p.news_id, p.position, p.starts_at, p.ends_at, n.slug, n.title FROM news_pins p JOIN news n ON n.id = p.news_id WHERE p.slot = ? ORDER BY p.position, p.id`).bind(slot).all();
        return ok({ slot, pins: r.results || [] });
      }
      if (route === 'regions/countries') {
        const region = url.searchParams.get('region');
        const r = await env.DB.prepare(`SELECT country_code FROM news_region_countries WHERE region_slug = ? ORDER BY country_code`).bind(region).all();
        return ok({ region, country_codes: (r.results || []).map((x) => x.country_code) });
      }
      if (route === 'authors/list') {
        if (!can('manage_authors')) return fail('Forbidden', 403);
        const r = await env.DB.prepare(`SELECT id, slug, name, role, job_title, expertise, location, website_url, published FROM authors ORDER BY name`).all();   // no email / private columns
        return ok({ authors: r.results || [] });
      }
      if (route === 'analytics/overview') {
        if (!can('view_analytics')) return fail('Forbidden', 403);
        const days = Number(url.searchParams.get('days') || 30);
        const r = await analytics.getOverview(env.DB, env, user, { days, siteHost: url.hostname });
        if (!r.ok) return fail(r.error, r.status);
        const [trending] = await Promise.all([stats.getTrending(env.DB, env, 5)]);
        const { ok: _ok, ...rest } = r;
        return ok({ ...rest, trending: trending.map((a) => ({ id: a.id, slug: a.slug, title: a.title })) });
      }
      if (route === 'analytics/article') {
        if (!can('view_analytics')) return fail('Forbidden', 403);
        const item = await accessibleArticle(env, user, url.searchParams.get('id'), 'read');
        if (!item) return fail('News article not found', 404);
        const r = await analytics.getArticlePerformance(env.DB, item.id, { days: Number(url.searchParams.get('days') || 30), siteHost: url.hostname });
        if (!r.ok) return fail(r.error, r.status);
        const { ok: _ok, ...rest } = r;
        return ok(rest);
      }
      if (route === 'search') {
        const p = search.parseSearchParams(url.searchParams);
        const r = await search.searchNews(env.DB, p, { mode: 'admin', user, pageSize: 25 });
        if (!r.ok) return fail(r.error, r.status);
        return ok({ articles: r.articles, total: r.total, page: r.page, page_size: r.page_size, invalid_filters: r.invalid_filters });
      }
      if (route === 'search/status') {
        if (!can('manage_settings')) return fail('Forbidden', 403);
        return ok({ ...(await search.indexStatus(env.DB)), enabled: await nr.isNewsFlagEnabled(env.DB, 'news_search_v2') });
      }
      if (route === 'slug-conflicts') return ok({ conflicts: await nr.findSlugCollisions(env.DB) }); // articles shadowing a section page
      if (route === 'taxonomy/list') {
        const list = await tx.listTaxonomy(env.DB, url.searchParams.get('kind'), { includeInactive: url.searchParams.get('all') === '1' && can('manage_taxonomy') });
        return list ? ok({ items: list }) : fail('Unknown taxonomy kind', 404);
      }
      if (route === 'flags') {
        if (!can('manage_settings')) return fail('Forbidden', 403);
        const rows = (await env.DB.prepare(`SELECT key, value FROM system_settings WHERE key LIKE 'news_%' ORDER BY key`).all()).results || [];
        return ok({ flags: rows.map((r) => ({ key: r.key, value: String(r.value).toLowerCase() === 'true', ...(FLAG_INFO[r.key] || { label: r.key, help: '' }) })) });
      }
      if (route === 'meta') return ok({
        article_types: nr.ARTICLE_TYPES, content_classes: nr.CONTENT_CLASSES, labels: nr.LABELS, source_types: nr.SOURCE_TYPES,
        correction_types: nr.CORRECTION_TYPES, relation_types: nr.RELATION_TYPES, workflow_statuses: nr.WORKFLOW_STATUSES,
        fact_check_statuses: nr.FACT_CHECK_STATUSES, entity_types: tx.ENTITY_TYPES, author_roles: NEWSROOM_ROLES,
        workflow_enabled: await nr.isNewsFlagEnabled(env.DB, 'news_editorial_workflow'),
        regions: (await env.DB.prepare(`SELECT slug, name FROM news_regions WHERE active = 1 ORDER BY display_order`).all()).results || [],
        permissions: {   // lets the UI hide controls the server would refuse; the server still enforces everything
          manage_taxonomy: can('manage_taxonomy'), manage_sources: can('manage_sources'), correct: can('correct'),
          retract: can('retract'), manage_settings: can('manage_settings'), manage_authors: can('manage_authors'), view_analytics: can('view_analytics'), factcheck: can('factcheck'), review: can('review'), publish: can('publish'), schedule: can('schedule'), update: can('update')
        }
      });
      return fail('Not found', 404);
    }

    // ---------- writes ----------
    const parsed = await readJson(request);
    if (parsed.error) return parsed.error;
    const body = parsed.body;

    if (route === 'flags/save') {
      if (!can('manage_settings')) return fail('Forbidden', 403);
      const updates = body && typeof body === 'object' && body.flags && typeof body.flags === 'object' ? body.flags : { [body?.key]: body?.value };
      const entries = Object.entries(updates).filter(([, v]) => v !== undefined);
      if (!entries.length) return fail('No flags given');
      // Allow-list: only keys that already exist as news_* rows can be written -- this can never
      // create a new arbitrary system_settings row or touch a non-newsroom setting.
      const existing = new Set(((await env.DB.prepare(`SELECT key FROM system_settings WHERE key LIKE 'news_%'`).all()).results || []).map((r) => r.key));
      for (const [key] of entries) if (!existing.has(key)) return fail(`Unknown flag: ${key}`, 400);
      for (const [key, value] of entries) {
        await env.DB.prepare(`UPDATE system_settings SET value = ? WHERE key = ?`).bind(value ? 'true' : 'false', key).run();
      }
      resetNewsFlagCache();   // takes effect immediately instead of waiting out the 30s cache
      await logAudit(env.DB, { userId: user.user_id, action: 'taxonomy_changed', entityType: 'news_flag', entityId: null, metadata: { updated: Object.fromEntries(entries.map(([k, v]) => [k, !!v])) } });
      return ok({ updated: entries.length });
    }
    if (route === 'taxonomy/save') {
      const r = await tx.saveTaxonomyItem(env.DB, body.kind, body, { actor, perms });
      if (r.ok) await invalidateNews(env);
      return fromResult(r, { slug: r.slug });
    }
    if (route === 'taxonomy/archive') {
      const r = await tx.archiveTaxonomyItem(env.DB, body.kind, body.id, { actor, perms, active: body.active === true });
      if (r.ok) await invalidateNews(env);
      return fromResult(r);
    }
    if (route === 'trust-pages/create') {
      const r = await trust.createTrustDraft(env.DB, body.slug, { actor, perms });
      return fromResult(r);
    }
    if (route === 'trust-pages/save') {
      const r = await trust.saveTrustPage(env.DB, body, { actor, perms });
      if (r.ok) await invalidateNews(env);
      return r.ok ? ok({ published: r.published }) : fail(r.error, r.status);
    }
    if (route === 'pins/save') {
      if (!can('review')) return fail('Forbidden', 403);   // editors' lead / above; grantable from the Permissions page
      const r = await stats.savePins(env.DB, body.slot, body.items, { actor });
      if (!r.ok) return fail(r.error, r.status);
      await logAudit(env.DB, { userId: user.user_id, action: 'article_updated', entityType: 'news_pins', entityId: null, metadata: { slot: body.slot, count: r.count } });
      return ok({ count: r.count });
    }
    if (route === 'search/reindex') {
      if (!can('manage_settings')) return fail('Forbidden', 403);
      const r = await search.reindexBatch(env.DB, { cursor: Number(body.cursor) || 0, limit: Number(body.limit) || 25, force: body.force === true });
      return ok(r);
    }
    if (route === 'regions/countries/save') {
      const r = await nr.setRegionCountries(env.DB, body.region_slug, body.country_codes, { actor, perms });
      if (r.ok) await invalidateNews(env);
      return r.ok ? ok({ count: r.count }) : fail(r.error, r.status);
    }
    if (route === 'authors/profile/save') return saveAuthorProfile(env, body, actor, perms);
    if (route === 'media/credit/save') return saveMediaCredit(env, body, actor, perms);

    // per-article writes: item access first (404 hides existence), then permission
    const item = await accessibleArticle(env, user, body.id, route === 'workflow/assign' || route.startsWith('corrections') ? 'read' : 'update');
    if (!item) return fail('News article not found', 404);

    if (route === 'article/meta/save') {
      if (!can('update')) return fail('Forbidden', 403);
      const before = await snapshot(env.DB, item.id);
      const meta = await tx.setArticleMeta(env.DB, item.id, body.meta || {}, { actor, perms });
      if (!meta.ok) return fromResult(meta);
      let rel = { ok: true, changed: [] };
      if (body.relations && typeof body.relations === 'object') {
        rel = await tx.setArticleRelations(env.DB, item.id, body.relations, { actor, perms });
        if (!rel.ok) return fromResult(rel); // meta already saved; relations validated-before-write so nothing partial in rel
      }
      const after = await snapshot(env.DB, item.id);
      const version = await safeRevision(env.DB, item.id, actor, before, after, body.change_summary);
      await search.reindexArticle(env.DB, item.id);   // section / entity / topic names are searchable
      await invalidateNews(env);
      return ok({ changed: [...meta.changed, ...rel.changed], revision: version });
    }
    if (route === 'sources/save') {
      const r = await nr.replaceArticleSources(env.DB, { newsId: item.id, sources: body.sources, actor, perms });
      if (r.ok) await invalidateNews(env);
      return r.ok ? ok({ count: r.count }) : fail(r.error, r.status);
    }
    if (route === 'corrections/add') {
      const r = await nr.addCorrection(env.DB, { newsId: item.id, type: body.type, message: body.public_message, actor, perms });
      if (!r.ok) return fromResult(r);
      // Keep internal workflow status in step, when the workflow is on. Best-effort.
      if (await nr.isNewsFlagEnabled(env.DB, 'news_editorial_workflow')) {
        const to = body.type === 'retraction' ? 'retracted' : body.type === 'correction' ? 'corrected' : null;
        if (to) await nr.transitionWorkflow(env.DB, { newsId: item.id, to, actor, perms }).catch(() => {});
      }
      await invalidateNews(env);
      return ok({ id: r.id });
    }
    if (route === 'timeline/add') {
      if (!can('update')) return fail('Forbidden', 403);
      const text = nr.plainText(body.body, 2000);
      if (!text) return fail('body is required');
      const cur = await env.DB.prepare(`SELECT article_type FROM news WHERE id = ?`).bind(item.id).first();
      if (cur?.article_type !== 'live') return fail('Timeline updates are only available on Live / Developing articles', 409);
      const editor = body.editor_author_id == null ? null : Number(body.editor_author_id);
      if (editor !== null && !Number.isInteger(editor)) return fail('invalid editor_author_id');
      await env.DB.prepare(`INSERT INTO news_timeline_updates (news_id, body, editor_id) VALUES (?, ?, ?)`).bind(item.id, text, editor).run();
      await logAudit(env.DB, { userId: user.user_id, action: 'article_updated', entityType: 'news', entityId: item.id, metadata: { timeline: true } });
      await invalidateNews(env);
      return ok();
    }

    // workflow endpoints: behind the feature flag
    if (route === 'workflow/transition' || route === 'workflow/assign' || route === 'factcheck/save') {
      if (!(await nr.isNewsFlagEnabled(env.DB, 'news_editorial_workflow'))) return fail('Editorial workflow is not enabled', 404);

      if (route === 'workflow/transition') {
        const r = await nr.transitionWorkflow(env.DB, { newsId: item.id, to: body.to, actor, perms, scheduledAt: body.scheduled_at });
        if (r.ok) await invalidateNews(env);
        return r.ok ? ok({ from: r.from, to: r.to }) : fail(r.error, r.status);
      }
      if (route === 'factcheck/save') {
        const r = await nr.setFactCheck(env.DB, { newsId: item.id, status: body.status, notes: body.notes, actor, perms });
        return fromResult(r);
      }
      if (route === 'workflow/assign') {
        if (!can('review')) return fail('Forbidden', 403);
        const assignee = body.assigned_to == null ? null : Number(body.assigned_to);
        if (assignee !== null) {
          const u = Number.isInteger(assignee) ? await env.DB.prepare(`SELECT id FROM users WHERE id = ?`).bind(assignee).first() : null;
          if (!u) return fail('Unknown user');
        }
        await env.DB.prepare(`INSERT OR IGNORE INTO news_editorial (news_id) VALUES (?)`).bind(item.id).run();
        await env.DB.prepare(`UPDATE news_editorial SET assigned_to = ?, assignment_notes = COALESCE(?, assignment_notes), updated_at = CURRENT_TIMESTAMP WHERE news_id = ?`)
          .bind(assignee, body.assignment_notes ? nr.plainText(body.assignment_notes, 2000) : null, item.id).run();
        await logAudit(env.DB, { userId: user.user_id, action: 'article_updated', entityType: 'news', entityId: item.id, metadata: { assigned_to: assignee } });
        return ok();
      }
    }
    return fail('Not found', 404);
  } catch (e) {
    console.error('newsroom api error:', route, e.message);
    return fail('Internal error', 500);
  }
}

// ── helpers ──────────────────────────────────────────────────
async function snapshot(db, id) {
  return await db.prepare(`SELECT ${nr.TRACKED_FIELDS.join(', ')} FROM news WHERE id = ?`).bind(id).first(); // columns from fixed constant
}
async function safeRevision(db, newsId, actor, before, after, summary) {
  try { return await nr.recordRevision(db, { newsId, changedBy: actor.user_id, before, after, summary }); }
  catch (e) { console.error('revision failed:', e.message); return null; }
}

async function loadBundle(db, id, perms) {
  const q = (sql, ...p) => db.prepare(sql).bind(...p).all().then(r => r.results || []);
  const [article, sources, corrections, timeline, topics, countries, entities, series, related, editorial, revisions] = await Promise.all([
    db.prepare(`SELECT id, slug, title, published, published_at, article_type, section_id, primary_country, region_slug, content_class, labels,
                       methodology, pr_provided_by, pr_original_source_url, pr_original_date, disclosure_json, updated_at
                FROM news WHERE id = ?`).bind(id).first(),
    nr.getPublicSources(db, id), nr.getPublicCorrections(db, id), nr.getPublicTimeline(db, id),
    q(`SELECT t.id, t.slug, t.name FROM news_article_topics x JOIN news_topics t ON t.id = x.topic_id WHERE x.news_id = ?`, id),
    q(`SELECT country_code, is_primary FROM news_article_countries WHERE news_id = ?`, id),
    q(`SELECT e.id, e.slug, e.name, e.entity_type, x.role FROM news_article_entities x JOIN news_entities e ON e.id = x.entity_id WHERE x.news_id = ? ORDER BY x.display_order`, id),
    q(`SELECT s.id, s.slug, s.name, x.position FROM news_series_articles x JOIN news_series s ON s.id = x.series_id WHERE x.news_id = ?`, id),
    q(`SELECT r.related_news_id AS news_id, r.relation_type, n.slug, n.title FROM news_related r JOIN news n ON n.id = r.related_news_id WHERE r.news_id = ? ORDER BY r.display_order`, id),
    nr.getEditorialState(db, id, perms),
    nr.listRevisions(db, id, perms)
  ]);
  return { article: { ...article, labels: safeParse(article?.labels, []), disclosure: safeParse(article?.disclosure_json, {}) }, sources, corrections, timeline, topics, countries, entities, series, related, editorial, revisions };
}
const safeParse = (s, f) => { try { return s ? JSON.parse(s) : f; } catch { return f; } };

async function listQueue(env, user, url, actor) {
  const view = url.searchParams.get('view') || 'drafts';
  if (!QUEUE_VIEWS.includes(view)) return fail('Unknown view');
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 100);
  const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);
  const cond = {
    drafts: `n.published = 0`,
    assigned_to_me: `e.assigned_to = ?`,
    review: `e.workflow_status = 'editorial_review'`,
    factcheck: `e.workflow_status = 'fact_check'`,
    approved: `e.workflow_status = 'approved'`,
    scheduled: `n.published = 1 AND n.published_at IS NOT NULL AND datetime(n.published_at) > datetime('now')`,
    published: `n.published = 1 AND (n.published_at IS NULL OR datetime(n.published_at) <= datetime('now'))`,
    corrections: `EXISTS (SELECT 1 FROM news_corrections c WHERE c.news_id = n.id)`
  }[view]; // fixed strings only
  const params = view === 'assigned_to_me' ? [actor.user_id] : [];
  const scope = await itemAccess.getAccessibleWhereClause(env.DB, user, 'news', 'read', 'n');
  const where = [cond, scope.condition].filter(Boolean).join(' AND ');
  const r = await env.DB.prepare(`
    SELECT n.id, n.slug, n.title, n.published, n.published_at, n.updated_at, n.article_type,
           e.workflow_status, e.assigned_to, e.fact_check_status
    FROM news n LEFT JOIN news_editorial e ON e.news_id = n.id
    WHERE ${where} ORDER BY n.updated_at DESC, n.id DESC LIMIT ? OFFSET ?
  `).bind(...params, ...scope.params, limit, offset).all();
  return ok({ view, items: r.results || [] });
}

const VALID_HTTP = (v) => nr.validatePublicUrl(v);

async function saveAuthorProfile(env, body, actor, perms) {
  if (!permDB.checkPermission(perms, 'news', 'manage_authors')) return fail('Forbidden', 403);
  const id = Number(body.id);
  if (!Number.isInteger(id)) return fail('invalid id');
  const sets = {};
  if (body.job_title !== undefined) sets.job_title = nr.plainText(body.job_title, 120) || null;
  if (body.expertise !== undefined) sets.expertise = nr.plainText(body.expertise, 500) || null;
  if (body.location !== undefined) sets.location = nr.plainText(body.location, 120) || null;
  if (body.website_url !== undefined) { const u = VALID_HTTP(body.website_url); if (!u.ok) return fail(`website_url: ${u.error}`); sets.website_url = u.value; }
  if (body.role !== undefined) {
    if (body.role !== null && !NEWSROOM_ROLES.includes(body.role)) return fail('invalid role');
    sets.role = body.role; // displayed as plain text on author pages already
  }
  const cols = Object.keys(sets);
  if (!cols.length) return fail('nothing to update');
  const r = await env.DB.prepare(`UPDATE authors SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE id = ?`).bind(...cols.map(c => sets[c]), id).run(); // columns from fixed set above
  if (!r.meta?.changes) return fail('Author not found', 404);
  await logAudit(env.DB, { userId: actor.user_id, action: 'author_changed', entityType: 'author', entityId: id, metadata: { fields: cols } });
  await invalidateNews(env);
  return ok();
}

async function saveMediaCredit(env, body, actor, perms) {
  if (!permDB.checkPermission(perms, 'media', 'create')) return fail('Forbidden', 403);
  const id = Number(body.id);
  if (!Number.isInteger(id)) return fail('invalid id');
  const sets = {};
  for (const [k, max] of [['credit', 200], ['photographer', 200], ['credit_source', 300], ['license', 200], ['caption', 500], ['alt_text', 300]]) {
    if (body[k] !== undefined) sets[k] = nr.plainText(body[k], max) || null;
  }
  const cols = Object.keys(sets);
  if (!cols.length) return fail('nothing to update');
  const r = await env.DB.prepare(`UPDATE media_library SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE id = ?`).bind(...cols.map(c => sets[c]), id).run(); // columns from fixed list above
  if (!r.meta?.changes) return fail('Media not found', 404);
  await logAudit(env.DB, { userId: actor.user_id, action: 'article_updated', entityType: 'media', entityId: id, metadata: { credit_fields: cols } });
  return ok();
}

// Called by the existing update handler after a successful save. Independent of
// the workflow flag: a renamed article must keep answering on its old URL.
// Keeps the search index in step with saves. Best-effort, never throws.
export async function searchReindexHook(env, slug) {
  try { return await search.reindexBySlug(env.DB, slug); } catch { return null; }
}

export async function slugRedirectHook(env, body) {
  return nr.recordSlugRedirect(env.DB, { oldSlug: body?.old_slug, newSlug: body?.slug });
}

// ── Save-path hooks for the EXISTING /api/v1/news/update ─────
// Inert unless news_editorial_workflow is on. Never throws into the save:
// on any internal error the existing behaviour proceeds unchanged.
export async function beforeNewsUpdate(env, user, body) {
  try {
    if (!(await nr.isNewsFlagEnabled(env.DB, 'news_editorial_workflow'))) return { enabled: false };
    const beforeRow = await env.DB.prepare(`SELECT id, ${nr.TRACKED_FIELDS.join(', ')} FROM news WHERE slug = ?`).bind(body.old_slug).first();
    if (!beforeRow) return { enabled: false };
    const ed = await env.DB.prepare(`SELECT workflow_status FROM news_editorial WHERE news_id = ?`).bind(beforeRow.id).first();

    // Articles that have entered the workflow (have an editorial row) may not
    // be published/unpublished through plain "update" by users lacking publish.
    // Legacy articles (no editorial row) keep today's simple publishing.
    if (ed) {
      const perms = await permDB.getPermissionsForUser(env.DB, user);
      const wouldPublish = body.published === undefined ? true : !!body.published;   // mirrors news.updateNews default
      const isPublished = beforeRow.published === 1;
      if (wouldPublish !== isPublished && !permDB.checkPermission(perms, 'news', 'publish')) {
        return { enabled: true, denied: { status: 403, error: 'Changing publication state requires the news.publish permission for articles in the editorial workflow' } };
      }
    }
    return { enabled: true, before: beforeRow };
  } catch (e) {
    console.error('newsroom beforeNewsUpdate failed (proceeding with legacy behaviour):', e.message);
    return { enabled: false };
  }
}

export async function afterNewsUpdate(env, user, body, ctx) {
  if (!ctx?.enabled || !ctx.before) return;
  try {
    const before = ctx.before;
    // Protect schedules: the legacy update writes published_at = NULL when the
    // form omits it, which would silently publish a scheduled article now.
    const wasFuture = before.published_at && Date.parse(String(before.published_at).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(before.published_at)) ? '' : 'Z')) > Date.now();
    if (wasFuture && !body.published_at) {
      await env.DB.prepare(`UPDATE news SET published_at = ? WHERE id = ?`).bind(before.published_at, before.id).run();
    }
    const after = await snapshot(env.DB, before.id);
    const version = await safeRevision(env.DB, before.id, { user_id: user.user_id }, before, after, body.change_summary);
    await logAudit(env.DB, { userId: user.user_id, action: 'article_updated', entityType: 'news', entityId: before.id, metadata: { revision: version } });
  } catch (e) {
    console.error('newsroom afterNewsUpdate failed (save already applied):', e.message);
  }
}
