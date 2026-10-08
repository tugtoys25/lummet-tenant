// test/newsroom-landing.test.js -- Stage H: slug redirects + region / country / topic / entity / series pages.
// Real controllers + templates + schema (SQLite). Not covered: edge caching, browsers.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { renderNews, renderNewsTaxonomyPage } from '../worker/controllers.js';
import { getRoute } from '../worker/routes.js';
import { handleNewsroomApi, slugRedirectHook } from '../worker/newsroom-api.js';
import * as nr from '../worker/database/newsroom.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString().slice(0, 19).replace('T', ' ');

async function mkEnv() {
  const db = createTestDb(); applyMigrations(db);
  await db.prepare(`INSERT INTO users (id,email,password_hash,role) VALUES (1,'a@t.l','x','admin'),(2,'e@t.l','x','editor')`).run();
  await db.prepare(`INSERT INTO authors (id,slug,name) VALUES (1,'elie','Elie')`).run();
  await db.prepare(`INSERT INTO countries (code,name) VALUES ('GB','United Kingdom'),('DE','Germany'),('FR','France')`).run();
  return { DB: db, ASSETS: { fetch: async (r) => { const f = join(ROOT, new URL(r.url).pathname); return existsSync(f) ? new Response(readFileSync(f, 'utf-8')) : new Response('nf', { status: 404 }); } } };
}
let seq = 500;
const art = async (env, o = {}) => {
  const id = o.id ?? ++seq;
  await env.DB.prepare(`INSERT INTO news (id,slug,title,content,published,published_at,created_at,author_id,created_by,excerpt,primary_country,region_slug,section_id) VALUES (?,?,?,?,?,?,?,1,1,'ex',?,?,?)`)
    .bind(id, o.slug ?? `a-${id}`, o.title ?? `Title ${id}`, '<p>x</p>', o.published ?? 1, o.published_at ?? null, o.created_at ?? ago(o.age ?? 5), o.country ?? null, o.region ?? null, o.section ?? null).run();
  return id;
};
const on = async (env, ...keys) => {
  nr.resetCountryCache(); await env.DB.prepare(`UPDATE system_settings SET value='true' WHERE key IN (${keys.map(() => '?').join(',')})`).bind(...keys).run(); nr.resetNewsFlagCache(); };   // flags are cached ~30 s per DB handle
const news = async (env, slug, qs = '') => { const r = await renderNews(new Request(`https://site.test/en/news/${slug}${qs}`), env, slug, null); return { status: r.status, html: r.status === 301 ? '' : await r.text(), loc: r.headers.get('Location'), cc: r.headers.get('Cache-Control') }; };
const tax = async (env, kind, slug, qs = '') => { const r = await renderNewsTaxonomyPage(new Request(`https://site.test/en/news/${kind}/${slug}${qs}`), env, kind, slug); return { status: r.status, html: await r.text() }; };
const ld = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const cardTitles = (html) => [...html.matchAll(/<article class="nr-card">[\s\S]*?<h3>([^<]*)<\/h3>/g)].map((m) => m[1]);   // article cards only (the layout footer has its own h3s)
const rename = async (env, id, from, to) => { await env.DB.prepare(`UPDATE news SET slug=? WHERE id=?`).bind(to, id).run(); return slugRedirectHook(env, { old_slug: from, slug: to }); };

describe('slug redirects (always on)', () => {
  let env; beforeEach(async () => { env = await mkEnv(); });

  test('a renamed article: the old URL answers 301 to the new one; the new URL serves', async () => {
    const id = await art(env, { slug: 'old-name' });
    assert.equal(await rename(env, id, 'old-name', 'new-name'), true);
    const r = await news(env, 'old-name', '?utm=x');
    assert.equal(r.status, 301); assert.equal(r.loc, '/en/news/new-name'); assert.match(r.cc, /public/);
    assert.equal((await news(env, 'new-name')).status, 200);
  });

  test('chains resolve in ONE hop to the current slug (a -> b -> c)', async () => {
    const id = await art(env, { slug: 'a' });
    await rename(env, id, 'a', 'b'); await rename(env, id, 'b', 'c');
    assert.equal((await news(env, 'a')).loc, '/en/news/c'); assert.equal((await news(env, 'b')).loc, '/en/news/c');
  });

  test('renaming back: the article\'s own slug wins and the stale redirect row is removed', async () => {
    const id = await art(env, { slug: 'a' });
    await rename(env, id, 'a', 'b'); await rename(env, id, 'b', 'a');
    assert.equal((await news(env, 'a')).status, 200);
    assert.equal((await news(env, 'b')).loc, '/en/news/a');
    assert.equal((await env.DB.prepare(`SELECT COUNT(*) c FROM news_redirects WHERE old_slug='a'`).first()).c, 0);
  });

  test('never redirects to something the public cannot see: draft, scheduled, deleted targets are 404', async () => {
    const id = await art(env, { slug: 'x1' }); await rename(env, id, 'x1', 'x2');
    await env.DB.prepare(`UPDATE news SET published=0 WHERE id=?`).bind(id).run();
    assert.equal((await news(env, 'x1')).status, 404);
    await env.DB.prepare(`UPDATE news SET published=1, published_at='2099-01-01 00:00:00' WHERE id=?`).bind(id).run();
    assert.equal((await news(env, 'x1')).status, 404);
    await env.DB.prepare(`UPDATE news SET published_at=NULL WHERE id=?`).bind(id).run();
    assert.equal((await news(env, 'x1')).status, 301);
    env.DB._raw.exec('PRAGMA foreign_keys = ON'); await env.DB.prepare(`DELETE FROM news WHERE id=?`).bind(id).run();
    assert.equal((await news(env, 'x1')).status, 404);
    assert.equal((await env.DB.prepare(`SELECT COUNT(*) c FROM news_redirects`).first()).c, 0, 'cascade removed the redirect');
  });

  test('a new article that takes an old slug wins over the redirect', async () => {
    const id = await art(env, { slug: 'topic-a' }); await rename(env, id, 'topic-a', 'topic-a-v2');
    await art(env, { slug: 'topic-a', title: 'Brand New' });
    const r = await news(env, 'topic-a'); assert.equal(r.status, 200); assert.match(r.html, /<h1>Brand New<\/h1>/);
  });

  test('nothing recorded for unchanged/empty slugs; failures never throw; a missing table degrades to a normal 404', async () => {
    const id = await art(env, { slug: 'same' });
    assert.equal(await slugRedirectHook(env, { old_slug: 'same', slug: 'same' }), false);
    assert.equal(await slugRedirectHook(env, { old_slug: '', slug: 'same' }), false);
    assert.equal(await slugRedirectHook(env, { old_slug: 'gone', slug: 'not-an-article' }), false);
    env.DB._raw.exec('ALTER TABLE news_redirects RENAME TO nr_gone');
    const orig = console.error; console.error = () => {};
    try {
      assert.equal(await rename(env, id, 'same', 'other'), false);
      assert.equal((await news(env, 'same')).status, 404);
    } finally { console.error = orig; }
  });

  test('works with every newsroom flag off (fires only for URLs that would 404 anyway)', async () => {
    const id = await art(env, { slug: 'p' }); await rename(env, id, 'p', 'q');
    assert.equal((await news(env, 'p')).status, 301);
    assert.equal((await news(env, 'never-existed')).status, 404);
  });
});

describe('region pages /en/news/<region>', () => {
  let env; beforeEach(async () => { env = await mkEnv(); });

  test('404 while news_new_taxonomy is off', async () => assert.equal((await news(env, 'europe')).status, 404));

  test('lists articles by region tag, by primary country in the region, and by additional countries; live only', async () => {
    await on(env, 'news_new_taxonomy');
    await nr.setRegionCountries(env.DB, 'europe', ['DE', 'FR'], { actor: { user_id: 1 }, perms: null });
    const byRegion = await art(env, { title: 'By Region', region: 'europe' });
    const byPrimary = await art(env, { title: 'By Primary', country: 'DE' });
    const byExtra = await art(env, { title: 'By Extra' }); await env.DB.prepare(`INSERT INTO news_article_countries (news_id,country_code) VALUES (?, 'FR')`).bind(byExtra).run();
    await art(env, { title: 'Other Region', region: 'asia' }); await art(env, { title: 'UK only', country: 'GB' });
    await art(env, { title: 'HIDDEN DRAFT', region: 'europe', published: 0 }); await art(env, { title: 'HIDDEN SCHEDULED', region: 'europe', published_at: '2099-01-01 00:00:00' });
    const { status, html } = await news(env, 'europe');
    assert.equal(status, 200);
    assert.deepEqual(cardTitles(html).sort(), ['By Extra', 'By Primary', 'By Region']);
    assert.match(html, /<h1[^>]*>Europe<\/h1>/);
    assert.match(html, /<link rel="canonical" href="https:\/\/site\.test\/en\/news\/europe">/);
    assert.deepEqual(ld(html).find((j) => j['@type'] === 'BreadcrumbList').itemListElement.map((i) => i.name), ['Home', 'News', 'Europe']);
  });

  test('region-country mapping API: permission, validation, replace semantics, audit', async () => {
    const call = async (method, route, user, body) => { const init = { method, headers: method === 'POST' ? { 'Content-Type': 'application/json' } : {} }; if (body) init.body = JSON.stringify(body); const r = await handleNewsroomApi(new Request(`https://site.test/api/v1/newsroom/${route}`, init), env, user); return { status: r.status, json: await r.json() }; };
    const admin = { user_id: 1, role: 'admin' }, editor = { user_id: 2, role: 'editor' };
    const save = (user, body) => call('POST', 'regions/countries/save', user, body);
    assert.equal((await save(editor, { region_slug: 'europe', country_codes: ['DE'] })).status, 403);
    assert.equal((await save(admin, { region_slug: 'atlantis', country_codes: [] })).status, 404);
    assert.equal((await save(admin, { region_slug: 'europe', country_codes: ['DEU'] })).status, 400);
    assert.equal((await save(admin, { region_slug: 'europe', country_codes: ['ZZ'] })).status, 400);
    assert.equal((await save(admin, { region_slug: 'europe', country_codes: 'DE' })).status, 400);
    assert.equal((await save(admin, { region_slug: 'europe', country_codes: ['de', 'FR', 'DE'] })).json.count, 2);
    assert.deepEqual((await call('GET', 'regions/countries?region=europe', editor)).json.country_codes, ['DE', 'FR']);
    assert.equal((await save(admin, { region_slug: 'europe', country_codes: ['GB', 'XX'] })).status, 400);
    assert.deepEqual((await call('GET', 'regions/countries?region=europe', editor)).json.country_codes, ['DE', 'FR'], 'rejected save changes nothing');
    assert.equal((await env.DB.prepare(`SELECT COUNT(*) c FROM audit_logs WHERE entity_type='news_region'`).first()).c, 1);
  });
});

describe('country pages /en/news/<country-name-slug>', () => {
  let env; beforeEach(async () => { env = await mkEnv(); await on(env, 'news_new_taxonomy'); });

  test('slug derives from the existing countries table; lists primary + additional country articles; live only', async () => {
    await art(env, { title: 'UK Primary', country: 'GB' });
    const extra = await art(env, { title: 'UK Extra' }); await env.DB.prepare(`INSERT INTO news_article_countries (news_id,country_code) VALUES (?, 'GB')`).bind(extra).run();
    await art(env, { title: 'Germany', country: 'DE' }); await art(env, { title: 'HIDDEN', country: 'GB', published: 0 });
    const { status, html } = await news(env, 'united-kingdom');
    assert.equal(status, 200);
    assert.deepEqual(cardTitles(html).sort(), ['UK Extra', 'UK Primary']);
    assert.match(html, /<h1[^>]*>United Kingdom<\/h1>/);
  });

  test('a country whose table name is not the standard name (production has "UK"): canonical is the ISO name, aliases 301', async () => {
    await env.DB.prepare(`UPDATE countries SET name='UK' WHERE code='GB'`).run(); nr.resetCountryCache();
    await art(env, { title: 'UK Story', country: 'GB' });
    const canon = await news(env, 'united-kingdom');
    assert.equal(canon.status, 200); assert.match(canon.html, /<h1[^>]*>UK<\/h1>/);
    assert.match(canon.html, /<link rel="canonical" href="https:\/\/site\.test\/en\/news\/united-kingdom">/);
    for (const alias of ['uk', 'gb']) { const r = await news(env, alias); assert.equal(r.status, 301, alias); assert.equal(r.loc, '/en/news/united-kingdom'); }
    assert.equal((await nr.assertSectionSlugFree(env.DB, 'uk')).ok, false, 'aliases are reserved too');
  });

  test('unpublished / unknown countries 404; country SEO title and robots are respected', async () => {
    await env.DB.prepare(`UPDATE countries SET published=0 WHERE code='FR'`).run();
    assert.equal((await news(env, 'france')).status, 404); assert.equal((await news(env, 'atlantis')).status, 404);
    await art(env, { country: 'DE' });
    await env.DB.prepare(`UPDATE countries SET seo_title='German Gambling News', robots='noindex,follow' WHERE code='DE'`).run();
    nr.resetCountryCache();   // (production: an edit shows up within 60 s)
    const { html } = await news(env, 'germany');
    assert.match(html, /<title>German Gambling News<\/title>/);
    assert.match(html, /name="robots" content="noindex, follow"/);
  });

  test('the country slug map is cached per DB handle (bots probing unknown URLs do not re-read the table each time)', async () => {
    nr.resetCountryCache();
    let reads = 0; const db = new Proxy(env.DB, { get: (t, k) => (k === 'prepare' ? (sql) => { if (/FROM countries/.test(sql)) reads++; return t.prepare(sql); } : (typeof t[k] === 'function' ? t[k].bind(t) : t[k])) });
    for (let i = 0; i < 5; i++) await nr.getCountryBySlug(db, 'nothing-' + i);
    assert.equal(reads, 1);
    assert.equal((await nr.getCountryBySlug(db, 'germany')).code, 'DE');
    assert.equal((await nr.getCountryBySlug(db, 'germany', Date.now() + 61000)).code, 'DE'); assert.equal(reads, 2, 'refreshed after the TTL');
  });

  test('precedence: article > section > region > country; slug guards stop new collisions', async () => {
    await art(env, { slug: 'germany', title: 'An Article Named Germany' });
    assert.match((await news(env, 'germany')).html, /<h1>An Article Named Germany<\/h1>/);
    await env.DB.prepare(`INSERT INTO news_sections (slug,name) VALUES ('france','France Section')`).run();
    assert.match((await news(env, 'france')).html, /France Section/);
    assert.equal((await nr.assertSectionSlugFree(env.DB, 'united-kingdom')).ok, false, 'country slug is taken');
    assert.equal((await nr.assertSectionSlugFree(env.DB, 'entity')).ok, false, 'reserved');
    assert.equal((await nr.assertSectionSlugFree(env.DB, 'fresh-section')).ok, true);
  });
});

describe('topic, entity and series pages', () => {
  let env; beforeEach(async () => { env = await mkEnv(); });

  test('routing: two-segment news URLs; single "entity" stays an article slug; extra segments are not matched', () => {
    const r = (p) => getRoute(new Request('https://site.test' + p));
    assert.deepEqual(r('/en/news/topic/licensing'), { type: 'newsTaxonomy', kind: 'topic', slug: 'licensing' });
    assert.deepEqual(r('/en/news/entity/ukgc'), { type: 'newsTaxonomy', kind: 'entity', slug: 'ukgc' });
    assert.deepEqual(r('/en/news/series/eu-reg'), { type: 'newsTaxonomy', kind: 'series', slug: 'eu-reg' });
    assert.deepEqual(r('/en/news/entity'), { type: 'news', slug: 'entity' });
    assert.notEqual(r('/en/news/topic/a/b').type, 'newsTaxonomy');
    assert.deepEqual(r('/en/news/some-article'), { type: 'news', slug: 'some-article' });
  });

  test('topics: flag-gated, only active topics, live articles only', async () => {
    const t = (await env.DB.prepare(`INSERT INTO news_topics (slug,name,description) VALUES ('licensing','Licensing','All about licences')`).run()).meta.last_row_id;
    const a = await art(env, { title: 'Licence News' }); const d = await art(env, { title: 'HIDDEN', published: 0 });
    await env.DB.prepare(`INSERT INTO news_article_topics (news_id,topic_id) VALUES (?,?),(?,?)`).bind(a, t, d, t).run();
    assert.equal((await tax(env, 'topic', 'licensing')).status, 404, 'flag off');
    await on(env, 'news_new_taxonomy');
    const { status, html } = await tax(env, 'topic', 'licensing');
    assert.equal(status, 200); assert.deepEqual(cardTitles(html), ['Licence News']); assert.match(html, /All about licences/);
    await env.DB.prepare(`UPDATE news_topics SET active=0`).run();
    assert.equal((await tax(env, 'topic', 'licensing')).status, 404);
    assert.equal((await tax(env, 'topic', 'nope')).status, 404);
  });

  test('entities: gated by news_entity_pages (not the taxonomy flag); about block, safe website link, typed JSON-LD', async () => {
    await env.DB.prepare(`INSERT INTO media_library (id,filename,url) VALUES (7,'l.png','/m/logo.png')`).run();
    const e = (await env.DB.prepare(`INSERT INTO news_entities (slug,name,entity_type,description,website_url,country_code,logo_media_id) VALUES ('ukgc','UK Gambling Commission','regulator','The regulator','https://www.gamblingcommission.gov.uk','GB',7)`).run()).meta.last_row_id;
    const a = await art(env, { title: 'Ruling' }); await art(env, { title: 'Unrelated' }); const d = await art(env, { title: 'HIDDEN', published: 0 });
    await env.DB.prepare(`INSERT INTO news_article_entities (news_id,entity_id) VALUES (?,?),(?,?)`).bind(a, e, d, e).run();
    await on(env, 'news_new_taxonomy');
    assert.equal((await tax(env, 'entity', 'ukgc')).status, 404, 'taxonomy flag alone does not enable entity pages');
    await on(env, 'news_entity_pages');
    const { status, html } = await tax(env, 'entity', 'ukgc');
    assert.equal(status, 200); assert.deepEqual(cardTitles(html), ['Ruling']);
    assert.match(html, /<section class="nr-entity" aria-label="About UK Gambling Commission"><img class="nr-entity__logo" src="\/m\/logo\.png"/);
    assert.match(html, /Regulator · United Kingdom/);
    assert.match(html, /<a href="https:\/\/www\.gamblingcommission\.gov\.uk\/" rel="noopener noreferrer nofollow">Official website<\/a>/);
    const about = ld(html).find((j) => j['@type'] === 'CollectionPage').about;
    assert.equal(about['@type'], 'GovernmentOrganization'); assert.equal(about.name, 'UK Gambling Commission');
    assert.deepEqual(ld(html).find((j) => j['@type'] === 'BreadcrumbList').itemListElement.map((i) => i.name), ['Home', 'News', 'UK Gambling Commission']);
  });

  test('entity types map to the right schema.org type; hostile website/name values are inert', async () => {
    await on(env, 'news_entity_pages');
    await env.DB.prepare(`INSERT INTO news_entities (slug,name,entity_type,website_url) VALUES ('p1','Jane <b>Doe</b>','person','javascript:alert(1)'), ('c1','Acme "Corp" {{title}}','company',NULL)`).run();
    const p = await tax(env, 'entity', 'p1');
    assert.equal(ld(p.html).find((j) => j['@type'] === 'CollectionPage').about['@type'], 'Person');
    assert.ok(!p.html.includes('javascript:') && !p.html.includes('Jane <b>'));
    const c = await tax(env, 'entity', 'c1');
    assert.equal(ld(c.html).find((j) => j['@type'] === 'CollectionPage').about['@type'], 'Organization');
    assert.ok(!c.html.includes('{{title}}') && c.html.includes('&#123;&#123;title&#125;&#125;'));
  });

  test('series: editorial order with Part numbers that continue across pages; drafts hidden', async () => {
    await on(env, 'news_new_taxonomy');
    const s = (await env.DB.prepare(`INSERT INTO news_series (slug,name,description) VALUES ('eu-reg','The Future of EU Regulation','A series')`).run()).meta.last_row_id;
    const ids = []; for (let i = 0; i < 14; i++) ids.push(await art(env, { title: `Part title ${i + 1}`, age: 100 - i }));
    const hidden = await art(env, { title: 'HIDDEN', published: 0 });
    // insert in shuffled position order to prove positions (not ids/dates) drive the order
    const order = [...ids].reverse();
    for (const [pos, id] of order.entries()) await env.DB.prepare(`INSERT INTO news_series_articles (series_id,news_id,position) VALUES (?,?,?)`).bind(s, id, pos + 1).run();
    await env.DB.prepare(`INSERT INTO news_series_articles (series_id,news_id,position) VALUES (?,?,0)`).bind(s, hidden).run();
    const p1 = await tax(env, 'series', 'eu-reg');
    assert.equal(p1.status, 200);
    assert.deepEqual(cardTitles(p1.html).slice(0, 3), ['Part title 14', 'Part title 13', 'Part title 12']);
    assert.match(p1.html, /<p class="nr-part">Part 1<\/p>[\s\S]*<p class="nr-part">Part 12<\/p>/);
    assert.ok(!p1.html.includes('HIDDEN'));
    const p2 = await tax(env, 'series', 'eu-reg', '?page=2');
    assert.equal(p2.status, 200); assert.match(p2.html, /<p class="nr-part">Part 13<\/p>/); assert.deepEqual(cardTitles(p2.html), ['Part title 2', 'Part title 1']);
  });

  test('malformed slug, inactive/unknown items and DB failure all end in a clean 404', async () => {
    await on(env, 'news_new_taxonomy', 'news_entity_pages');
    for (const kind of ['topic', 'entity', 'series']) assert.equal((await tax(env, kind, '%E0%A4%A')).status, 404, kind);
    env.DB._raw.exec('ALTER TABLE news_series RENAME TO ns_gone');
    const orig = console.error; console.error = () => {};
    try { assert.equal((await tax(env, 'series', 'x')).status, 404); } finally { console.error = orig; }
  });
});
