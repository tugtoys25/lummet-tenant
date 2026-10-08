// test/newsroom-home.test.js -- Stage G: most-read, trending, pins, and the v2 News homepage.
// Real analytics tables, real controllers/templates, real migrated schema.
// Not covered: real KV semantics (a Map stands in), D1 latency, browsers/CSS.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { renderNewsList } from '../worker/controllers.js';
import { handleNewsroomApi } from '../worker/newsroom-api.js';
import * as S from '../worker/newsroom-stats.js';
import * as H from '../worker/newsroom-home.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString().slice(0, 19).replace('T', ' ');
const day = (d) => new Date(Date.now() - d * 86400e3).toISOString().slice(0, 10);

async function mkEnv({ withCache = false } = {}) {
  const db = createTestDb(); applyMigrations(db);
  await db.prepare(`INSERT INTO users (id,email,password_hash,role) VALUES (1,'a@t.l','x','admin'),(2,'e@t.l','x','editor')`).run();
  await db.prepare(`INSERT INTO authors (id,slug,name) VALUES (1,'elie','Elie')`).run();
  const kv = new Map();
  const env = { DB: db, ASSETS: { fetch: async (r) => { const f = join(ROOT, new URL(r.url).pathname); return existsSync(f) ? new Response(readFileSync(f, 'utf-8')) : new Response('nf', { status: 404 }); } } };
  if (withCache) { env.CACHE = { get: async (k) => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } }; env._kv = kv; }
  return env;
}
let seq = 100;
const art = (env, o = {}) => {
  const id = o.id ?? ++seq;
  return env.DB.prepare(`INSERT INTO news (id,slug,title,content,published,published_at,created_at,author_id,created_by,excerpt,article_type,content_class,section_id) VALUES (?,?,?,?,?,?,?,1,1,?,?,?,?)`)
    .bind(id, o.slug ?? `a-${id}`, o.title ?? `Title ${id}`, '<p>x</p>', o.published ?? 1, o.published_at ?? null, o.created_at ?? ago(o.age ?? 5), o.excerpt ?? 'ex', o.type ?? null, o.cls ?? null, o.section ?? null).run().then(() => id);
};
const view = (env, newsId, { at = ago(1), type = 'PAGE_VIEW', bot = 0, dup = 0, n = 1 } = {}) => {
  const sql = `INSERT INTO analytics_events (event_type, news_id, occurred_at, is_bot, is_duplicate) VALUES (?,?,?,?,?)`;
  return Promise.all(Array.from({ length: n }, () => env.DB.prepare(sql).bind(type, newsId, at, bot, dup).run()));
};
const flags = (env, keys) => env.DB.prepare(`UPDATE system_settings SET value='true' WHERE key IN (${keys.map(() => '?').join(',')})`).bind(...keys).run();
const home = async (env, qs = '') => { const r = await renderNewsList(new Request('https://site.test/en/news' + qs), env); return { status: r.status, html: await r.text() }; };
const ids = (arr) => arr.map((a) => a.id);

describe('trendScore', () => {
  test('rewards recent views, growth and freshness', () => {
    assert.ok(S.trendScore({ v6: 20, v24: 30, ageHours: 5 }) > S.trendScore({ v6: 10, v24: 30, ageHours: 5 }), 'more recent views');
    assert.ok(S.trendScore({ v6: 20, v24: 20, ageHours: 5 }) > S.trendScore({ v6: 20, v24: 80, ageHours: 5 }), 'a surge beats a steady stream with the same last-6h count');
    assert.ok(S.trendScore({ v6: 20, v24: 30, ageHours: 5 }) > S.trendScore({ v6: 20, v24: 30, ageHours: 96 }), 'newer wins');
    assert.equal(S.trendScore({ v6: 0, v24: 40, ageHours: 1 }), 0);
    assert.ok(Number.isFinite(S.trendScore({ v6: 5, v24: 5, ageHours: -3 })));
  });
});

describe('most read', () => {
  let env; beforeEach(async () => { env = await mkEnv(); });

  test('24h: counts PAGE_VIEW/CONTENT_VIEW only; excludes bots, duplicates, old, non-news events; ranks by views', async () => {
    const a = await art(env), b = await art(env), c = await art(env);
    await view(env, a, { n: 3 }); await view(env, b, { n: 5 }); await view(env, b, { n: 2, type: 'CONTENT_VIEW' });
    await view(env, c, { n: 9, bot: 1 }); await view(env, c, { n: 9, dup: 1 }); await view(env, c, { n: 9, at: ago(30) }); await view(env, c, { n: 9, type: 'CASINO_VIEW' });
    const r = await S.getMostRead(env.DB, env, '24h', 10);
    assert.deepEqual(r.map((x) => [x.id, x.views]), [[b, 7], [a, 3]]);
  });

  test('only live promotable articles: drafts, scheduled, sponsored, commercial, press releases never listed', async () => {
    const ok = await art(env), draft = await art(env, { published: 0 }), sched = await art(env, { published_at: '2099-01-01 00:00:00' });
    const sp = await art(env, { cls: 'sponsored' }), co = await art(env, { cls: 'commercial' }), pr = await art(env, { type: 'press_release' }), pr2 = await art(env, { cls: 'press_release' });
    for (const id of [ok, draft, sched, sp, co, pr, pr2]) await view(env, id, { n: 5 });
    assert.deepEqual(ids(await S.getMostRead(env.DB, env, '24h', 10)), [ok]);
  });

  test('limit is honoured; unknown window is empty; a stats failure returns [] instead of throwing', async () => {
    for (let i = 0; i < 7; i++) await view(env, await art(env), { n: i + 1 });
    assert.equal((await S.getMostRead(env.DB, env, '24h', 5)).length, 5);
    assert.deepEqual(await S.getMostRead(env.DB, env, '99d', 5), []);
    env.DB._raw.exec('ALTER TABLE analytics_events RENAME TO ae_gone');
    const orig = console.error; console.error = () => {};
    try { assert.deepEqual(await S.getMostRead(env.DB, env, '24h', 5), []); } finally { console.error = orig; }
  });

  test('7d/30d: prefer the daily rollup (+ today raw); fall back to raw events when no rollup exists', async () => {
    const a = await art(env), b = await art(env);
    // no rollup rows yet -> raw fallback
    await view(env, a, { n: 2, at: ago(24 * 3) }); await view(env, b, { n: 1, at: ago(24 * 3) }); await view(env, b, { n: 5, at: ago(24 * 20) });
    assert.deepEqual((await S.getMostRead(env.DB, env, '7d', 5)).map((x) => [x.id, x.views]), [[a, 2], [b, 1]]);
    assert.deepEqual((await S.getMostRead(env.DB, env, '30d', 5)).map((x) => [x.id, x.views]), [[b, 6], [a, 2]]);
    // rollup present -> uses it (and ignores old raw rows outside its days)
    await env.DB.prepare(`INSERT INTO analytics_daily (date, dimension_type, dimension_id, page_views) VALUES (?, 'news', ?, 50)`).bind(day(2), a).run();
    await env.DB.prepare(`INSERT INTO analytics_daily (date, dimension_type, dimension_id, page_views) VALUES (?, 'news', ?, 10)`).bind(day(3), b).run();
    await env.DB.prepare(`INSERT INTO analytics_daily (date, dimension_type, dimension_id, page_views) VALUES (?, 'news', ?, 999)`).bind(day(40), b).run();   // outside 30d
    const r7 = await S.getMostRead(env.DB, env, '7d', 5);
    assert.deepEqual(r7.map((x) => [x.id, x.views]), [[a, 50], [b, 10]]);
    await view(env, b, { n: 60, at: ago(0.01) });                                    // today's partial day is added from raw
    assert.equal((await S.getMostRead(env.DB, env, '7d', 5))[0].id, b);
  });

  test('ranking is cached in KV, but articles are re-checked live: an unpublished article vanishes at once', async () => {
    const e2 = await mkEnv({ withCache: true });
    const a = await art(e2), b = await art(e2);
    await view(e2, a, { n: 5 }); await view(e2, b, { n: 3 });
    assert.deepEqual(ids(await S.getMostRead(e2.DB, e2, '24h', 5)), [a, b]);
    assert.ok(e2._kv.has('news:mostread:24h'));
    e2.DB._raw.exec('DELETE FROM analytics_events');                                 // if the cache were ignored the list would now be empty
    assert.deepEqual(ids(await S.getMostRead(e2.DB, e2, '24h', 5)), [a, b], 'served from cache');
    await e2.DB.prepare(`UPDATE news SET published = 0 WHERE id = ?`).bind(a).run();
    assert.deepEqual(ids(await S.getMostRead(e2.DB, e2, '24h', 5)), [b], 'unpublished article gone immediately');
  });
});

describe('trending and pins', () => {
  let env; beforeEach(async () => { env = await mkEnv(); });

  test('surging fresh story beats a steady older one; stories older than 14 days never trend', async () => {
    const surge = await art(env, { age: 3 }), steady = await art(env, { age: 3 }), stale = await art(env, { age: 24 * 20 });
    await view(env, surge, { n: 20, at: ago(1) });
    await view(env, steady, { n: 20, at: ago(1) }); await view(env, steady, { n: 60, at: ago(12) });
    await view(env, stale, { n: 500, at: ago(1) });
    assert.deepEqual(ids(await S.getTrending(env.DB, env, 5)), [surge, steady]);
  });

  test('needs activity in the last 6 hours', async () => {
    const a = await art(env); await view(env, a, { n: 30, at: ago(10) });
    assert.deepEqual(await S.getTrending(env.DB, env, 5), []);
  });

  test('pins come first, only while active, and drop out if the article is not live; sponsored can be pinned but never auto-trends', async () => {
    const hot = await art(env), pinned = await art(env), draft = await art(env, { published: 0 }), spons = await art(env, { cls: 'sponsored' });
    await view(env, hot, { n: 10 }); await view(env, spons, { n: 50 });
    await env.DB.prepare(`INSERT INTO news_pins (news_id, slot, position) VALUES (?, 'trending', 0), (?, 'trending', 1)`).bind(pinned, draft).run();
    const expired = await art(env), notYet = await art(env);                         // no views: they could only appear through their pins
    await env.DB.prepare(`INSERT INTO news_pins (news_id, slot, position, ends_at) VALUES (?, 'trending', 2, '2000-01-01 00:00:00')`).bind(expired).run();   // expired
    await env.DB.prepare(`INSERT INTO news_pins (news_id, slot, position, starts_at) VALUES (?, 'trending', 3, '2099-01-01 00:00:00')`).bind(notYet).run();   // not started
    assert.deepEqual(ids(await S.getTrending(env.DB, env, 5)), [pinned, hot]);
    await env.DB.prepare(`INSERT INTO news_pins (news_id, slot, position) VALUES (?, 'lead', 0)`).bind(spons).run();
    assert.deepEqual(ids(await S.getPinned(env.DB, 'lead')), [spons], 'an editor may pin any live article as the lead');
  });

  test('savePins: validates before writing, replaces the slot, caps at 10', async () => {
    const a = await art(env), b = await art(env);
    assert.equal((await S.savePins(env.DB, 'nope', [])).status, 400);
    assert.equal((await S.savePins(env.DB, 'lead', 'x')).status, 400);
    assert.equal((await S.savePins(env.DB, 'lead', new Array(11).fill({ news_id: a }))).status, 400);
    assert.equal((await S.savePins(env.DB, 'lead', [{ news_id: 999999 }])).status, 400);
    assert.equal((await S.savePins(env.DB, 'lead', [{ news_id: a, starts_at: 'garbage' }])).status, 400);
    assert.equal((await S.savePins(env.DB, 'lead', [{ news_id: a }, { news_id: b }])).count, 2);
    assert.equal((await S.savePins(env.DB, 'lead', [{ news_id: b }])).count, 1);
    assert.deepEqual(ids(await S.getPinned(env.DB, 'lead')), [b]);
    assert.equal((await S.savePins(env.DB, 'lead', [{ news_id: a }, { news_id: 999999 }])).status, 400);
    assert.deepEqual(ids(await S.getPinned(env.DB, 'lead')), [b], 'a rejected save leaves existing pins intact');
  });

  test('pins API: needs news.review, validates, is audited', async () => {
    const a = await art(env);
    const call = async (method, route, user, body) => { const init = { method, headers: method === 'POST' ? { 'Content-Type': 'application/json' } : {} }; if (body) init.body = JSON.stringify(body); const r = await handleNewsroomApi(new Request(`https://site.test/api/v1/newsroom/${route}`, init), env, user); return { status: r.status, json: await r.json() }; };
    const admin = { user_id: 1, role: 'admin' }, editor = { user_id: 2, role: 'editor' };
    assert.equal((await call('POST', 'pins/save', editor, { slot: 'lead', items: [{ news_id: a }] })).status, 403);
    assert.equal((await call('POST', 'pins/save', admin, { slot: 'lead', items: [{ news_id: 424242 }] })).status, 400);
    assert.equal((await call('POST', 'pins/save', admin, { slot: 'lead', items: [{ news_id: a }] })).status, 200);
    const l = await call('GET', 'pins/list?slot=lead', editor); assert.equal(l.json.pins[0].news_id, a);
    assert.equal((await call('GET', 'pins/list?slot=zzz', editor)).status, 400);
    assert.equal((await env.DB.prepare(`SELECT COUNT(*) c FROM audit_logs WHERE entity_type='news_pins'`).first()).c, 1);
  });
});

describe('News homepage v2 (news_v2_homepage)', () => {
  let env; beforeEach(async () => { env = await mkEnv(); });

  test('flag OFF: the existing page is served untouched', async () => {
    await art(env);
    const { status, html } = await home(env);
    assert.equal(status, 200); assert.ok(html.includes('class="news-grid"') && !html.includes('nr-home') && !html.includes('newsroom.css'));
  });

  test('flag ON: lead, latest, sections, analysis, most read, trending, newsletter, trust links; nothing empty', async () => {
    await flags(env, ['news_v2_homepage', 'news_new_taxonomy', 'news_trending']);
    const reg = await env.DB.prepare(`SELECT id FROM news_sections WHERE slug='regulation'`).first();
    const a1 = await art(env, { title: 'Lead Story', age: 1, section: reg.id }), a2 = await art(env, { title: 'Second', age: 2, section: reg.id }), a3 = await art(env, { title: 'An Analysis Piece', age: 3, type: 'analysis' });
    await view(env, a2, { n: 9 });
    await view(env, a3, { n: 4, at: ago(24 * 3) });                                   // only inside the 7-day window
    await env.DB.prepare(`INSERT INTO pages (slug,type,template,title,content_json,published) VALUES ('editorial/standards','page','page.html','Our Standards','"<p>x</p>"',1),('editorial/ai-policy','page','page.html','AI','"<p>x</p>"',0)`).run();
    const { status, html } = await home(env);
    assert.equal(status, 200);
    assert.match(html, /<h3>Lead Story<\/h3>/);
    assert.match(html, /<h2 id="nr-latest-h">Latest news<\/h2>/);
    assert.match(html, /<h2 id="nr-sec-\d+"><a href="\/en\/news\/regulation">Regulation<\/a><\/h2>/);
    assert.match(html, /Analysis &amp; research/);
    assert.match(html, /<h2 id="nr-mostread-h">Most read<\/h2>[\s\S]*<details class="nr-ranked-group" open><summary>Last 24 hours<\/summary>[\s\S]*Second/);
    assert.match(html, /<h2 id="nr-trending-h">Trending<\/h2>/);
    assert.match(html, /<form class="newsletter-form"/);
    assert.match(html, /<nav class="nr-block nr-trust" aria-label="Editorial policies"><h2>How we work<\/h2><ul><li><a href="\/en\/editorial\/standards">Our Standards<\/a><\/li><\/ul>/);
    assert.ok(!html.includes('/en/editorial/ai-policy'), 'draft policy page not linked');
    // no empty blocks: only the Regulation section has articles
    assert.equal((html.match(/id="nr-sec-\d+"/g) || []).length, 1);
    assert.match(html, /<details class="nr-ranked-group"><summary>Last 7 days<\/summary>[\s\S]*An Analysis Piece/, 'a window with data renders (collapsed)');
    assert.ok(!html.includes('Last 30 days') || /Last 30 days<\/summary>/.test(html));
  });

  test('a fresh site (no analytics, no sections) renders only the blocks that have content', async () => {
    await flags(env, ['news_v2_homepage', 'news_new_taxonomy', 'news_trending']);
    await art(env, { title: 'Only Story' });
    const { status, html } = await home(env);
    assert.equal(status, 200);
    for (const empty of ['nr-mostread-h', 'nr-trending-h', 'nr-sec-', 'nr-analysis-h', 'nr-trust']) assert.ok(!html.includes(empty), `${empty} must not render when empty`);
    assert.match(html, /Only Story/);
  });

  test('no articles at all: friendly message, noindex, still 200', async () => {
    await flags(env, ['news_v2_homepage']);
    const { status, html } = await home(env);
    assert.equal(status, 200);
    assert.match(html, /No articles have been published yet/);
    assert.match(html, /name="robots" content="noindex, follow"/);
  });

  test('only live articles; lead pin overrides; featured pins lead the latest list; sponsored is labelled and never in most read', async () => {
    await flags(env, ['news_v2_homepage']);
    const newest = await art(env, { title: 'Newest', age: 1 }), pinnedLead = await art(env, { title: 'Pinned Lead', age: 50 }), feat = await art(env, { title: 'Featured Pick', age: 60 });
    const spons = await art(env, { title: 'Sponsored Thing', age: 2, cls: 'sponsored' });
    await art(env, { title: 'HIDDEN DRAFT', published: 0 }); await art(env, { title: 'HIDDEN SCHEDULED', published_at: '2099-01-01 00:00:00' });
    await view(env, spons, { n: 50 });
    await S.savePins(env.DB, 'lead', [{ news_id: pinnedLead }]); await S.savePins(env.DB, 'featured', [{ news_id: feat }]);
    const { html } = await home(env);
    assert.ok(!html.includes('HIDDEN'));
    assert.match(html, /<section class="nr-lead"[\s\S]*<h3>Pinned Lead<\/h3>/);
    assert.ok(html.indexOf('Featured Pick') < html.indexOf('Newest'), 'featured pin first in latest');
    assert.match(html, /Sponsored Thing[\s\S]{0,400}/);
    assert.match(html, /<span class="nr-badge nr-badge--class-sponsored">Sponsored<\/span>/);
    assert.ok(!html.includes('nr-mostread-h'), 'sponsored content is not promoted as most read');
  });

  test('performance/CLS hygiene: lead image is eager + high priority with dimensions; card images lazy with dimensions', async () => {
    await flags(env, ['news_v2_homepage']);
    await env.DB.prepare(`INSERT INTO media_library (id, filename, url, alt_text, width, height) VALUES (1,'a.jpg','/m/a.jpg','Lead alt',1600,900), (2,'b.jpg','/m/b.jpg','B alt',800,450)`).run();
    const a = await art(env, { age: 1 }), b = await art(env, { age: 2 });
    await env.DB.prepare(`UPDATE news SET featured_image = 1 WHERE id = ?`).bind(a).run(); await env.DB.prepare(`UPDATE news SET featured_image = 2 WHERE id = ?`).bind(b).run();
    const { html } = await home(env);
    assert.match(html, /<img src="\/m\/a\.jpg" alt="Lead alt" width="1600" height="900" fetchpriority="high" decoding="async">/);
    assert.match(html, /<img src="\/m\/b\.jpg" alt="B alt" loading="lazy" decoding="async" width="640" height="360">/);
    assert.equal((html.match(/fetchpriority="high"/g) || []).length, 1, 'exactly one prioritised image');
  });

  test('search and tag views keep the existing page; canonical ignores query noise; JSON-LD lists the items', async () => {
    await flags(env, ['news_v2_homepage']); await art(env, { title: 'Findable' });
    assert.ok((await home(env, '?q=find')).html.includes('class="news-grid"'));
    assert.ok((await home(env, '?tag=x')).html.includes('class="news-grid"'));
    const { html } = await home(env, '?utm_source=x&page=9');
    assert.equal((html.match(/<link rel="canonical"/g) || []).length, 1);
    assert.match(html, /<link rel="canonical" href="https:\/\/site\.test\/en\/news">/);
    const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    assert.equal(ld.find((j) => j['@type'] === 'CollectionPage').mainEntity.itemListElement[0].name, 'Findable');
    assert.match(html, /role="search"/);
  });

  test('editor strings are escaped; template braces are not expanded', async () => {
    await flags(env, ['news_v2_homepage']);
    await art(env, { title: '<img src=x onerror=alert(1)> {{site_name}}', excerpt: '"><svg onload=alert(2)> {{title}}' });
    const { html } = await home(env);
    assert.ok(!html.includes('<img src=x onerror') && !html.includes('<svg onload'));
    assert.ok(html.includes('&#123;&#123;site_name&#125;&#125;'));
  });

  test('graceful degradation: broken analytics or pins tables still serve the page (200)', async () => {
    await flags(env, ['news_v2_homepage', 'news_trending']); await art(env, { title: 'Survivor' });
    env.DB._raw.exec('ALTER TABLE analytics_events RENAME TO ae_gone'); env.DB._raw.exec('ALTER TABLE news_pins RENAME TO np_gone');
    const orig = console.error; console.error = () => {};
    try { const { status, html } = await home(env); assert.equal(status, 200); assert.match(html, /Survivor/); assert.ok(!html.includes('nr-mostread-h')); }
    finally { console.error = orig; }
  });

  test('if the core article query fails, the request falls back to the EXISTING page (never a misleading "no articles" page)', async () => {
    await flags(env, ['news_v2_homepage']); await art(env, { title: 'Still Here' });
    env.DB._raw.exec('ALTER TABLE media_library DROP COLUMN width');                  // v2 cards need it; the existing list page does not
    const orig = console.error; console.error = () => {};
    try {
      const { status, html } = await home(env);
      assert.equal(status, 200);
      assert.ok(html.includes('class="news-grid"') && html.includes('Still Here'), 'legacy page served');
      assert.ok(!html.includes('nr-home') && !html.includes('No articles have been published yet'));
    } finally { console.error = orig; }
  });

  test('loadHomepage is exported pure-data and renderHomepage is deterministic', async () => {
    const d = { lead: null, latest: [], sections: [], analysis: [], mostRead: {}, trending: [], trust: [] };
    assert.match(H.renderHomepage(d), /No articles have been published yet/);
    assert.equal(H.renderHomepage(d), H.renderHomepage(d));
  });
});
