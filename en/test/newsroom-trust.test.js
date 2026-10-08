// test/newsroom-trust.test.js -- Stage F: Editorial Trust Center on the existing `pages` system.
// Real controllers/templates/schema; the admin API is driven with real Requests.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { renderDynamicPage, renderNews } from '../worker/controllers.js';
import { getRoute } from '../worker/routes.js';
import { handleNewsroomApi } from '../worker/newsroom-api.js';
import * as T from '../worker/newsroom-trust.js';
import { safeLocalHref, renderDisclosures, renderCorrections } from '../worker/newsroom-render.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ADMIN = null, EDITOR = { news: { create: true, read: true, update: true } };
const actor = { user_id: 1 };
const COMPLETE = (extra = '') => `<h2>Done</h2><p>Operated by {{site_name}}.</p>${extra}`;

async function mkEnv() {
  const db = createTestDb(); applyMigrations(db);
  await db.prepare(`INSERT INTO users (id,email,password_hash,role) VALUES (1,'a@t.l','x','admin'),(2,'e@t.l','x','editor'),(4,'n@t.l','x','nobody')`).run();
  await db.prepare(`INSERT INTO authors (id,slug,name) VALUES (1,'elie','Elie')`).run();
  await db.prepare(`INSERT INTO news (id,slug,title,content,published,author_id,created_by,excerpt) VALUES (10,'live-one','Live One','<p>Body text.</p>',1,1,1,'ex')`).run();
  return { DB: db, ASSETS: { fetch: async (r) => { const f = join(ROOT, new URL(r.url).pathname); return existsSync(f) ? new Response(readFileSync(f, 'utf-8')) : new Response('nf', { status: 404 }); } } };
}
const page = async (env, slug) => { const r = await renderDynamicPage(new Request(`https://site.test/en/${slug}`), env, slug, null); return { status: r.status, html: await r.text() }; };
const article = async (env) => (await renderNews(new Request('https://site.test/en/news/live-one'), env, 'live-one', null)).text();
const publish = async (env, slug, content = COMPLETE()) => {
  await T.createTrustDraft(env.DB, slug, { actor, perms: ADMIN });
  const r = await T.saveTrustPage(env.DB, { slug, title: 'T ' + slug, content, published: true }, { actor, perms: ADMIN });
  assert.equal(r.ok, true, JSON.stringify(r)); return r;
};

describe('templates never invent facts', () => {
  test('nine pages, unique nested slugs under /en/editorial', () => {
    assert.equal(T.TRUST_PAGES.length, 9);
    assert.equal(new Set(T.TRUST_SLUGS).size, 9);
    assert.ok(T.TRUST_SLUGS.every((s) => s === 'editorial' || s.startsWith('editorial/')));
    for (const s of ['editorial', 'editorial/about', 'editorial/standards', 'editorial/corrections', 'editorial/methodology', 'editorial/affiliate-disclosure', 'editorial/advertising', 'editorial/ai-policy', 'editorial/contact']) assert.ok(T.TRUST_SLUGS.includes(s), s);
  });
  test('no tenant names, emails, URLs, phone numbers or company suffixes are baked in', () => {
    for (const p of T.TRUST_PAGES) {
      const txt = p.body + p.title + p.description;
      assert.ok(!/level|freewin|cluster|neuroodds|legendodds|brilliantodds/i.test(txt), `${p.slug}: tenant name`);
      assert.ok(!/@|https?:\/\/|\b\d{3,}\b|\b(ltd|llc|inc|gmbh|limited)\b/i.test(txt), `${p.slug}: looks like an invented fact`);
    }
  });
  test('every page that states facts about the publisher carries [[FILL IN]] prompts; drafts start with the notice', () => {
    for (const p of T.TRUST_PAGES.filter((x) => x.slug !== 'editorial')) assert.match(p.body, /\[\[FILL IN/, p.slug);
    assert.ok(T.templateContent('editorial/about').startsWith('<p><strong>DRAFT TEMPLATE</strong>'));
    assert.equal(T.templateContent('nope'), null);
  });
});

describe('create + save (service)', () => {
  let env; beforeEach(async () => { env = await mkEnv(); });

  test('creating needs manage_settings; makes an UNPUBLISHED draft; never overwrites', async () => {
    assert.equal((await T.createTrustDraft(env.DB, 'editorial/about', { actor, perms: EDITOR })).status, 403);
    assert.equal((await T.createTrustDraft(env.DB, 'not-a-trust-page', { actor, perms: ADMIN })).status, 404);
    assert.equal((await T.createTrustDraft(env.DB, 'editorial/about', { actor, perms: ADMIN })).ok, true);
    const row = await env.DB.prepare(`SELECT published, template, type, content_json FROM pages WHERE slug='editorial/about'`).first();
    assert.equal(row.published, 0); assert.equal(row.template, 'page.html');
    assert.match(JSON.parse(row.content_json), /DRAFT TEMPLATE/);
    assert.equal((await T.createTrustDraft(env.DB, 'editorial/about', { actor, perms: ADMIN })).status, 409);
  });

  test('a pre-existing page with a trust slug is left untouched', async () => {
    await env.DB.prepare(`INSERT INTO pages (slug,type,template,title,content_json,published) VALUES ('editorial/contact','page','page.html','Mine','"<p>Hand written</p>"',1)`).run();
    assert.equal((await T.createTrustDraft(env.DB, 'editorial/contact', { actor, perms: ADMIN })).status, 409);
    assert.equal((await env.DB.prepare(`SELECT title, content_json, published FROM pages WHERE slug='editorial/contact'`).first()).content_json, '"<p>Hand written</p>"');
  });

  test('publishing is refused while [[FILL IN]] items or the draft notice remain; allowed once complete', async () => {
    await T.createTrustDraft(env.DB, 'editorial/standards', { actor, perms: ADMIN });
    const s = (o) => T.saveTrustPage(env.DB, { slug: 'editorial/standards', title: 'Standards', ...o }, { actor, perms: ADMIN });
    assert.equal((await s({ content: T.templateContent('editorial/standards'), published: true })).status, 409);
    assert.equal((await s({ content: '<p>ok</p><p>[[FILL IN: x]]</p>', published: true })).status, 409);
    assert.equal((await s({ content: '<p>DRAFT TEMPLATE</p>', published: true })).status, 409);
    assert.equal((await s({ content: T.templateContent('editorial/standards') })).ok, true, 'saving as draft is always allowed');
    assert.equal((await env.DB.prepare(`SELECT published p FROM pages WHERE slug='editorial/standards'`).first()).p, 0);
    assert.equal((await s({ content: COMPLETE(), published: true })).published, true);
    assert.equal((await env.DB.prepare(`SELECT published p FROM pages WHERE slug='editorial/standards'`).first()).p, 1);
    assert.equal((await s({ content: COMPLETE(), published: false })).published, false, 'unpublish works');
  });

  test('validation: permission, unknown slug, not created, title, content type/size/empty', async () => {
    const s = (o, perms = ADMIN) => T.saveTrustPage(env.DB, { slug: 'editorial/about', title: 'A', content: COMPLETE(), ...o }, { actor, perms });
    assert.equal((await s({}, EDITOR)).status, 403);
    assert.equal((await s({ slug: 'random' })).status, 404);
    assert.equal((await s({})).status, 404, 'not created yet');
    await T.createTrustDraft(env.DB, 'editorial/about', { actor, perms: ADMIN });
    assert.equal((await s({ title: '  ' })).status, 400);
    assert.equal((await s({ content: 123 })).status, 400);
    assert.equal((await s({ content: 'x'.repeat(100001) })).status, 400);
    assert.equal((await s({ content: '<script>alert(1)</script>' })).status, 400, 'empty after sanitising');
    assert.equal((await s({})).ok, true);
  });

  test('content is sanitized on save; placeholders survive; audit rows written', async () => {
    await T.createTrustDraft(env.DB, 'editorial/about', { actor, perms: ADMIN });
    await T.saveTrustPage(env.DB, { slug: 'editorial/about', title: 'A', content: '<p onclick="x()">Hi {{site_name}}<script>alert(1)</script><a href="javascript:alert(1)">bad</a><a href="/en/x">ok</a></p>' }, { actor, perms: ADMIN });
    const html = JSON.parse((await env.DB.prepare(`SELECT content_json FROM pages WHERE slug='editorial/about'`).first()).content_json);
    assert.ok(!/script|onclick|javascript:/i.test(html), html);
    assert.ok(html.includes('{{site_name}}') && html.includes('href="/en/x"'));
    const audits = (await env.DB.prepare(`SELECT action, entity_type FROM audit_logs WHERE entity_type='trust_page'`).all()).results;
    assert.equal(audits.length, 2);
  });

  test('live-slug helpers only report published pages', async () => {
    await T.createTrustDraft(env.DB, 'editorial/corrections', { actor, perms: ADMIN });
    assert.deepEqual(await T.getPublishedTrustSlugs(env.DB), []);
    await publish(env, 'editorial/standards');
    assert.deepEqual(await T.getPublishedTrustSlugs(env.DB), ['editorial/standards']);
    assert.deepEqual(T.policyLinksFrom(['editorial/standards', 'editorial/corrections']), { editorial_independence: '/en/editorial/standards', corrections: '/en/editorial/corrections' });
    assert.deepEqual(T.policyLinksFrom([]), {});
    assert.equal((await T.listTrustPages(env.DB)).find((p) => p.slug === 'editorial/corrections').published, false);
  });
});

describe('public serving through the existing page route', () => {
  let env; beforeEach(async () => { env = await mkEnv(); });

  test('nested slugs route to the page renderer', () => {
    assert.deepEqual(getRoute(new Request('https://site.test/en/editorial/standards')), { type: 'page', slug: 'editorial/standards' });
    assert.deepEqual(getRoute(new Request('https://site.test/en/editorial')), { type: 'page', slug: 'editorial' });
  });

  test('draft pages 404; published pages serve with the tenant site name resolved from settings, not hardcoded', async () => {
    await env.DB.prepare(`INSERT INTO settings (key, value) VALUES ('site_name', 'Acme Gaming News')`).run();
    await T.createTrustDraft(env.DB, 'editorial/standards', { actor, perms: ADMIN });
    assert.equal((await page(env, 'editorial/standards')).status, 404);
    await T.saveTrustPage(env.DB, { slug: 'editorial/standards', title: 'Our Standards', content: COMPLETE(), published: true }, { actor, perms: ADMIN });
    const { status, html } = await page(env, 'editorial/standards');
    assert.equal(status, 200);
    assert.match(html, /<h1>Our Standards<\/h1>/);
    assert.ok(!html.includes('{{site_name}}'), 'placeholder resolved');
    assert.ok(html.includes('Operated by Acme Gaming News.'), 'tenant name comes from settings');
    assert.match(html, /<link rel="canonical" href="https:\/\/site\.test\/en\/editorial\/standards">/);
    assert.match(html, /<li aria-current="page">Our Standards<\/li>/);
  });

  test('hub page lists only LIVE policy pages', async () => {
    await publish(env, 'editorial', COMPLETE());
    await publish(env, 'editorial/standards');
    await T.createTrustDraft(env.DB, 'editorial/corrections', { actor, perms: ADMIN });   // draft: must not be linked
    const { html } = await page(env, 'editorial');
    assert.match(html, /<nav aria-label="Editorial policies"><ul><li><a href="\/en\/editorial\/standards">T editorial\/standards<\/a>/);
    assert.ok(!html.includes('/en/editorial/corrections"'));
  });

  test('a hostile page title / author name is escaped (template engine does not escape)', async () => {
    await publish(env, 'editorial/contact');
    await env.DB.prepare(`UPDATE pages SET title=?, author_id=1 WHERE slug='editorial/contact'`).bind('<img src=x onerror=alert(1)>').run();
    await env.DB.prepare(`UPDATE authors SET name=? WHERE id=1`).bind('"><svg onload=alert(2)>').run();
    const { html } = await page(env, 'editorial/contact');
    assert.ok(!html.includes('<img src=x onerror') && !html.includes('<svg onload'));
    assert.match(html, /<h1>&lt;img src=x onerror=alert\(1\)&gt;<\/h1>/);
  });
});

describe('articles link to LIVE trust pages only', () => {
  let env; beforeEach(async () => {
    env = await mkEnv();
    await env.DB.prepare(`UPDATE system_settings SET value='true' WHERE key IN ('news_new_taxonomy','news_sources_display','news_corrections_display')`).run();
    await env.DB.prepare(`INSERT INTO news_corrections (news_id,type,public_message) VALUES (10,'correction','Fixed.')`).run();
    await env.DB.prepare(`INSERT INTO news_article_sources (news_id,source_name) VALUES (10,'Src')`).run();
    await env.DB.prepare(`UPDATE news SET content_class='sponsored', disclosure_json='{"ai_assistance":true,"advertising":true}' WHERE id=10`).run();
  });

  test('no links while the policy pages are drafts', async () => {
    await T.createTrustDraft(env.DB, 'editorial/corrections', { actor, perms: ADMIN });
    const html = await article(env);
    assert.ok(!html.includes('Corrections policy') && !html.includes('/en/editorial/') && !html.includes('Learn more'));
  });

  test('once published: corrections, sources, and each disclosure link to the right page', async () => {
    for (const s of ['editorial/corrections', 'editorial/methodology', 'editorial/ai-policy', 'editorial/advertising', 'editorial/affiliate-disclosure']) await publish(env, s);
    const a = await article(env); const vis = a.slice(a.indexOf('<article class="news-detail"'), a.indexOf('</article>', a.indexOf('<article class="news-detail"')));
    assert.match(vis, /<a href="\/en\/editorial\/corrections">Corrections policy<\/a>/);
    assert.match(vis, /<a href="\/en\/editorial\/methodology">How we use sources<\/a>/);
    assert.match(vis, /preparing this article\. <a href="\/en\/editorial\/ai-policy">Learn more<\/a>/);
    assert.match(vis, /display advertising\. <a href="\/en\/editorial\/advertising">Learn more<\/a>/);
    assert.match(vis, /sponsored and labelled as such\. <a href="\/en\/editorial\/affiliate-disclosure">Learn more<\/a>/);
  });

  test('flags off: article pages ignore trust pages entirely', async () => {
    await publish(env, 'editorial/corrections');
    await env.DB.prepare(`UPDATE system_settings SET value='false' WHERE key LIKE 'news_%'`).run();
    const env2 = { ...env, DB: env.DB };
    const html = await article(env2);
    assert.ok(!html.includes('Corrections policy'));
  });


  test('renderDisclosures/renderCorrections only emit safe links even if handed hostile ones', () => {
    const art = { content_class: null };
    const html = (links) => renderDisclosures({ flags: { ai_assistance: true }, article: art, siteName: 'S', links });
    for (const bad of ['javascript:alert(1)', '//evil.com/x', 'data:text/html,x', '/x" onmouseover="y', 'ftp://x.com']) assert.ok(!/<a /.test(html({ ai_assistance: bad })), bad);
    assert.match(html({ ai_assistance: '/en/editorial/ai-policy' }), /<a href="\/en\/editorial\/ai-policy">Learn more<\/a>/);
    assert.match(html({ ai_assistance: 'https://ok.example/policy' }), /<a href="https:\/\/ok\.example\/policy">Learn more<\/a>/);
    assert.ok(!/<a /.test(renderCorrections([{ type: 'correction', public_message: 'x', created_at: '2026-09-19 10:00:00' }], String, 'javascript:alert(1)')));
  });

  test('safeLocalHref accepts only same-site absolute paths', () => {
    for (const bad of ['//evil.com/x', 'javascript:alert(1)', 'https://evil.com', '/a b', '', null, undefined, '/../x?y=1', '/x"onmouseover="y']) assert.equal(safeLocalHref(bad), false, String(bad));
    assert.equal(safeLocalHref('/en/editorial/ai-policy'), true);
  });
});

describe('admin API for policies', () => {
  let env; beforeEach(async () => { env = await mkEnv(); });
  const call = async (method, route, { user = { user_id: 1, role: 'admin' }, body } = {}) => {
    const init = { method, headers: method === 'POST' ? { 'Content-Type': 'application/json' } : {} }; if (method === 'POST') init.body = JSON.stringify(body ?? {});
    const res = await handleNewsroomApi(new Request(`https://site.test/api/v1/newsroom/${route}`, init), env, user);
    return { status: res.status, json: await res.json() };
  };
  test('list/create/get/save flow; publishing gate enforced over HTTP', async () => {
    const l = await call('GET', 'trust-pages/list'); assert.equal(l.json.pages.length, 9); assert.ok(l.json.pages.every((p) => !p.exists));
    assert.equal((await call('POST', 'trust-pages/create', { body: { slug: 'editorial/ai-policy' } })).status, 200);
    assert.equal((await call('POST', 'trust-pages/create', { body: { slug: 'editorial/ai-policy' } })).status, 409);
    const g = await call('GET', 'trust-pages/get?slug=editorial%2Fai-policy'); assert.match(g.json.page.content, /DRAFT TEMPLATE/); assert.equal(g.json.page.published, 0);
    assert.equal((await call('POST', 'trust-pages/save', { body: { slug: 'editorial/ai-policy', title: 'AI', content: g.json.page.content, published: true } })).status, 409);
    assert.equal((await call('POST', 'trust-pages/save', { body: { slug: 'editorial/ai-policy', title: 'AI', content: '<p>We use no AI.</p>', published: true } })).json.published, true);
    assert.equal((await page(env, 'editorial/ai-policy')).status, 200);
  });
  test('editors and roles without news.manage_settings are refused everywhere', async () => {
    const editor = { user_id: 2, role: 'editor' }, nobody = { user_id: 4, role: 'nobody' };
    for (const u of [editor, nobody]) {
      assert.equal((await call('GET', 'trust-pages/list', { user: u })).status, 403);
      assert.equal((await call('POST', 'trust-pages/create', { user: u, body: { slug: 'editorial/about' } })).status, 403);
      assert.equal((await call('POST', 'trust-pages/save', { user: u, body: { slug: 'editorial/about', title: 'x', content: '<p>x</p>' } })).status, 403);
    }
    assert.equal((await call('GET', 'trust-pages/get?slug=editorial%2Fabout', { user: editor })).status, 404, 'no content leaks to unprivileged users');
  });
  test('slugs outside the trust set cannot be created or overwritten through this API (no arbitrary page write)', async () => {
    await env.DB.prepare(`INSERT INTO pages (slug,type,template,title,content_json,published) VALUES ('privacy','page','page.html','Privacy','"<p>keep</p>"',1)`).run();
    assert.equal((await call('POST', 'trust-pages/create', { body: { slug: 'privacy' } })).status, 404);
    assert.equal((await call('POST', 'trust-pages/save', { body: { slug: 'privacy', title: 'x', content: '<p>x</p>' } })).status, 404);
    assert.equal((await env.DB.prepare(`SELECT content_json FROM pages WHERE slug='privacy'`).first()).content_json, '"<p>keep</p>"');
  });
});
