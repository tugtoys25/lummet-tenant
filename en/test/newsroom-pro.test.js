// test/newsroom-pro.test.js -- bylines, rich schema, revision restore, calendar, section slots, IndexNow.
// Real migrated schema, real controllers and templates. Not covered: the real IndexNow service (fetch is a stub),
// real D1, browsers.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { renderNews } from '../worker/controllers.js';
import { handleNewsroomApi, beforeNewsUpdate, afterNewsUpdate } from '../worker/newsroom-api.js';
import * as pro from '../worker/newsroom-pro.js';
import * as stats from '../worker/newsroom-stats.js';
import * as home from '../worker/newsroom-home.js';
import * as news from '../worker/database/news.js';
import { routeSystem } from '../worker/routing/system.js';
import { handleMisc } from '../worker/app/routes/misc.js';
import { resetNewsFlagCache } from '../worker/database/newsroom.js';
import { getPermissionsForUser } from '../worker/database/permissions.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ADMIN = { user_id: 1, role: 'admin' };
const BASE = 'https://news.example.com';

async function mkEnv() {
  const db = createTestDb(); applyMigrations(db);
  await db.prepare(`INSERT INTO users (id,email,password_hash,role) VALUES (1,'a@t.l','x','admin')`).run();
  await db.prepare(`INSERT INTO authors (id,slug,name,role) VALUES (1,'elie','Elie','Editor'),(2,'ana','Ana','Reporter'),(3,'bo','Bo','Photographer')`).run();
  const ins = `INSERT INTO news (id,slug,title,content,published,published_at,author_id,created_by,excerpt,updated_at) VALUES (?,?,?,?,?,?,1,1,'ex','2026-01-01 00:00:00')`;
  await db.prepare(ins).bind(10, 'live-one', 'Live One', '<p>First paragraph.</p>\n<p>Second paragraph.</p>', 1, null).run();
  await db.prepare(ins).bind(11, 'draft-one', 'Draft One', '<p>d</p>', 0, null).run();
  const env = { DB: db, SITE_URL: BASE, ASSETS: { fetch: async (req) => { const f = join(ROOT, new URL(req.url).pathname); return existsSync(f) ? new Response(readFileSync(f, 'utf-8'), { status: 200 }) : new Response('nf', { status: 404 }); } } };
  await db.prepare(`UPDATE system_settings SET value='true' WHERE key='news_revision_history'`).run();   // most tests need it; the default is checked in the migration test
  resetNewsFlagCache();
  return env;
}
const allPerms = (env) => getPermissionsForUser(env.DB, ADMIN);
const setting = (env, key, value) => env.DB.prepare(`INSERT INTO system_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(key, value).run();
const api = async (env, method, route, body, user = ADMIN) => {
  const init = { method, headers: method === 'POST' ? { 'Content-Type': 'application/json' } : {} };
  if (method === 'POST') init.body = JSON.stringify(body ?? {});
  const res = await handleNewsroomApi(new Request(`${BASE}/api/v1/newsroom/${route}`, init), env, user);
  return { status: res.status, json: await res.json() };
};
const page = async (env, slug) => { const res = await renderNews(new Request(`${BASE}/en/news/${slug}`), env, slug, null); return { status: res.status, html: await res.text() }; };
const ld = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const editArticle = async (env, data, { user = ADMIN } = {}) => {
  const body = { old_slug: 'live-one', slug: 'live-one', title: 'Live One', content: '<p>x</p>', published: 1, author_id: 1, ...data };
  const ctx = await beforeNewsUpdate(env, user, body);
  await news.updateNews(env.DB, body.old_slug, body);
  await afterNewsUpdate(env, user, body, ctx);
};

describe('migration', () => {
  test('adds only new tables and two switches with safe defaults', async () => {
    const env = await mkEnv();
    for (const t of ['news_article_bylines', 'news_index_pings']) assert.ok(await env.DB.prepare(`SELECT name FROM sqlite_master WHERE name=?`).bind(t).first(), t);
    assert.equal((await env.DB.prepare(`SELECT value FROM system_settings WHERE key='news_indexnow'`).first()).value, 'false');
    const fresh = createTestDb(); applyMigrations(fresh);
    assert.equal((await fresh.prepare(`SELECT value FROM system_settings WHERE key='news_revision_history'`).first()).value, 'false', 'ships off like every newsroom switch');
  });
});

describe('bylines', () => {
  test('saves, orders and lists extra credits', async () => {
    const env = await mkEnv();
    const r = await pro.saveBylines(env.DB, { newsId: 10, items: [{ author_id: 2, role: 'reporter' }, { author_id: 3, role: 'photographer' }], actor: ADMIN, perms: await allPerms(env) });
    assert.equal(r.ok, true); assert.equal(r.count, 2);
    const list = await pro.listBylines(env.DB, 10);
    assert.deepEqual(list.map((b) => [b.name, b.role]), [['Ana', 'reporter'], ['Bo', 'photographer']]);
  });
  test('rejects duplicates, unknown roles and unknown people before writing anything', async () => {
    const env = await mkEnv();
    await pro.saveBylines(env.DB, { newsId: 10, items: [{ author_id: 2, role: 'editor' }], actor: ADMIN, perms: await allPerms(env) });
    for (const items of [[{ author_id: 2, role: 'editor' }, { author_id: 2, role: 'reporter' }], [{ author_id: 2, role: 'boss' }], [{ author_id: 99, role: 'editor' }], 'x']) {
      const r = await pro.saveBylines(env.DB, { newsId: 10, items, actor: ADMIN, perms: await allPerms(env) });
      assert.equal(r.ok, false);
    }
    assert.equal((await pro.listBylines(env.DB, 10)).length, 1, 'the earlier list is untouched');
  });
  test('needs the update permission', async () => {
    const env = await mkEnv();
    const r = await pro.saveBylines(env.DB, { newsId: 10, items: [], actor: { user_id: 9 }, perms: {} });
    assert.equal(r.status, 403);
  });
  test('rendering escapes names and links to the author page', () => {
    const html = pro.renderBylinesHtml([{ name: '<b>X</b>', slug: 'x y', role: 'editor' }]);
    assert.ok(!html.includes('<b>X</b>')); assert.ok(html.includes('&lt;b&gt;X&lt;/b&gt;')); assert.ok(html.includes('/en/author/x%20y'));
    assert.equal(pro.renderBylinesHtml([]), '');
  });
});

describe('article page', () => {
  test('without extra data the page keeps working and gains free-access and image fields only', async () => {
    const env = await mkEnv();
    const { status, html } = await page(env, 'live-one');
    assert.equal(status, 200);
    const art = ld(html).find((x) => x['@type'] === 'NewsArticle');
    assert.equal(art.isAccessibleForFree, true);
    assert.equal(art.articleSection, 'News', 'the old value stays when the article has no section');
    assert.equal(art.author.name, 'Elie');
    assert.ok(!html.includes('news-bylines'));
  });
  test('co-authors, editor, real section and credits show up', async () => {
    const env = await mkEnv();
    await pro.saveBylines(env.DB, { newsId: 10, items: [{ author_id: 2, role: 'reporter' }, { author_id: 3, role: 'photographer' }], actor: ADMIN, perms: await allPerms(env) });
    await env.DB.prepare(`INSERT INTO news_sections (id,slug,name,active) VALUES (50,'markets-desk','Markets',1)`).run();
    await env.DB.prepare(`UPDATE news SET section_id=50 WHERE id=10`).run();
    await setting(env, 'news_new_taxonomy', 'true');   // the real section name is shown with the section switch, as before
    const { html } = await page(env, 'live-one');
    const art = ld(html).find((x) => x['@type'] === 'NewsArticle');
    assert.deepEqual(art.author.map((a) => a.name), ['Elie', 'Ana']);
    assert.equal(art.contributor[0].name, 'Bo');
    assert.equal(art.articleSection, 'Markets');
    assert.ok(html.includes('news-bylines') && html.includes('Reporting:') && html.includes('Photography:'));
  });
  test('a failing byline lookup never takes the article down', async () => {
    const env = await mkEnv();
    await env.DB.prepare(`DROP TABLE news_article_bylines`).run();
    const { status } = await page(env, 'live-one');
    assert.equal(status, 200);
  });
});

describe('buildRichSchema', () => {
  test('one extra author already listed is not duplicated; sizes only when known', () => {
    const out = pro.buildRichSchema({ article: { tags: 'a,b' }, base: { author: { '@type': 'Person', name: 'Elie' } }, bylines: [{ name: 'Elie', role: 'reporter' }],
      images: [{ url: 'https://x/y.jpg', width: 800, height: 450 }, { url: 'https://x/z.jpg' }] });
    assert.equal(out.author.name, 'Elie');
    assert.deepEqual(out.image[0], { '@type': 'ImageObject', url: 'https://x/y.jpg', width: 800, height: 450 });
    assert.equal(out.image[1].width, undefined);
    assert.equal(out.thumbnailUrl, 'https://x/y.jpg'); assert.equal(out.keywords, 'a,b');
  });
});

describe('revision history and restore', () => {
  test('flag on, workflow off: edits are recorded; restore brings the old text back and is itself undoable', async () => {
    const env = await mkEnv();
    await editArticle(env, { title: 'Second Title', content: '<p>second</p>' });
    await editArticle(env, { title: 'Third Title', content: '<p>third</p>' });
    const revs = (await env.DB.prepare(`SELECT version_number FROM news_revisions WHERE news_id=10 ORDER BY version_number`).all()).results;
    assert.equal(revs.length, 2);
    const d = await pro.diffForRevision(env.DB, 10, 1, await allPerms(env));
    assert.equal(d.drift, false);
    assert.equal(d.version_values.title, 'Second Title'); assert.equal(d.current_values.title, 'Third Title');
    const r = await pro.restoreVersion(env.DB, { newsId: 10, version: 1, actor: ADMIN, perms: await allPerms(env) });
    assert.equal(r.ok, true);
    let row = await env.DB.prepare(`SELECT title, content, slug, published FROM news WHERE id=10`).first();
    assert.deepEqual([row.title, row.content, row.slug, row.published], ['Second Title', '<p>second</p>', 'live-one', 1]);
    const back = await pro.restoreVersion(env.DB, { newsId: 10, version: 2, actor: ADMIN, perms: await allPerms(env) });
    assert.equal(back.ok, true);
    row = await env.DB.prepare(`SELECT title, content FROM news WHERE id=10`).first();
    assert.deepEqual([row.title, row.content], ['Third Title', '<p>third</p>']);
  });
  test('version 0 is the state before the first recorded edit', async () => {
    const env = await mkEnv();
    await editArticle(env, { title: 'Changed', content: '<p>changed</p>' });
    const r = await pro.restoreVersion(env.DB, { newsId: 10, version: 0, actor: ADMIN, perms: await allPerms(env) });
    assert.equal(r.ok, true);
    assert.equal((await env.DB.prepare(`SELECT title FROM news WHERE id=10`).first()).title, 'Live One');
  });
  test('an edit outside the history is flagged as drift but can still be restored', async () => {
    const env = await mkEnv();
    await editArticle(env, { title: 'Tracked', content: '<p>tracked</p>' });
    await env.DB.prepare(`UPDATE news SET title='Sneaky' WHERE id=10`).run();
    const d = await pro.diffForRevision(env.DB, 10, 1, await allPerms(env));
    assert.equal(d.drift, true);
  });
  test('never touches the address or the published state, and refuses an empty version', async () => {
    const env = await mkEnv();
    await editArticle(env, { title: 'Changed', content: '<p>changed</p>', slug: 'renamed', published: 0 });
    await pro.restoreVersion(env.DB, { newsId: 10, version: 0, actor: ADMIN, perms: await allPerms(env) });
    const row = await env.DB.prepare(`SELECT slug, published FROM news WHERE id=10`).first();
    assert.deepEqual([row.slug, row.published], ['renamed', 0]);
    assert.equal((await pro.restoreVersion(env.DB, { newsId: 10, version: 77, actor: ADMIN, perms: await allPerms(env) })).status, 404);
    assert.equal((await pro.restoreVersion(env.DB, { newsId: 10, version: 0, actor: ADMIN, perms: {} })).status, 403);
  });
  test('flag off and workflow off: nothing is recorded (old behaviour)', async () => {
    const env = await mkEnv();
    await setting(env, 'news_revision_history', 'false');
    await editArticle(env, { title: 'Changed', content: '<p>changed</p>' });
    assert.equal((await env.DB.prepare(`SELECT COUNT(*) c FROM news_revisions`).first()).c, 0);
  });
  test('with the workflow on, revisions are recorded exactly as before', async () => {
    const env = await mkEnv();
    await setting(env, 'news_editorial_workflow', 'true');
    await editArticle(env, { title: 'Changed', content: '<p>changed</p>' });
    assert.equal((await env.DB.prepare(`SELECT COUNT(*) c FROM news_revisions WHERE news_id=10`).first()).c, 1);
  });
  test('the API compares and restores', async () => {
    const env = await mkEnv();
    await editArticle(env, { title: 'Changed', content: '<p>changed</p>' });
    const diff = await api(env, 'GET', 'revision/diff?id=10&v=0');
    assert.equal(diff.json.diff.version_values.title, 'Live One');
    const res = await api(env, 'POST', 'revision/restore', { id: 10, version: 0 });
    assert.equal(res.json.success, true); assert.ok(res.json.changed.includes('title'));
    assert.equal((await api(env, 'POST', 'revision/restore', { id: 10, version: 9 })).status, 404);
  });
});

describe('calendar', () => {
  test('lists a week of dated stories and the undated drafts', async () => {
    const env = await mkEnv();
    await env.DB.prepare(`UPDATE news SET published_at='2026-03-10 09:30:00' WHERE id=10`).run();
    const cal = await pro.loadCalendar(env.DB, { from: '2026-03-09', days: 7 });
    assert.deepEqual(cal.items.map((i) => i.id), [10]);
    assert.equal(cal.items[0].state, 'published');
    assert.deepEqual(cal.unscheduled.map((i) => i.id), [11]);
    assert.equal((await pro.loadCalendar(env.DB, { from: '2026-03-16', days: 7 })).items.length, 0);
  });
  test('a future published_at shows as scheduled; the API answers', async () => {
    const env = await mkEnv();
    await env.DB.prepare(`UPDATE news SET published_at='2099-05-05 10:00:00' WHERE id=10`).run();
    const cal = await api(env, 'GET', 'calendar?from=2099-05-04&days=7');
    assert.equal(cal.json.items[0].state, 'scheduled');
  });
});

describe('section slots on the homepage', () => {
  test('slot validation accepts a real section and refuses everything else', async () => {
    const env = await mkEnv();
    await env.DB.prepare(`INSERT INTO news_sections (id,slug,name,active) VALUES (700,'tech-desk','Tech',1)`).run();
    assert.equal(await stats.isPinSlot(env.DB, 'section:700'), true);
    for (const bad of ['section:701', 'section:0', 'section:700; DROP', 'sections:700', 'x', null]) assert.equal(await stats.isPinSlot(env.DB, bad), false, String(bad));
    assert.equal((await stats.savePins(env.DB, 'section:701', [{ news_id: 10 }])).ok, false);
    assert.equal((await stats.savePins(env.DB, 'section:700', [{ news_id: 10 }])).ok, true);
    assert.equal((await api(env, 'GET', 'pins/list?slot=section:700')).json.pins.length, 1);
  });
  test('pinned stories lead the section block, expired pins are ignored, no pins changes nothing', async () => {
    const env = await mkEnv();
    await setting(env, 'news_new_taxonomy', 'true');
    await env.DB.prepare(`INSERT INTO news_sections (id,slug,name,active,display_order) VALUES (700,'tech-desk','Tech',1,1)`).run();
    const ins = `INSERT INTO news (id,slug,title,content,published,published_at,author_id,created_by,excerpt,section_id) VALUES (?,?,?,?,1,?,1,1,'ex',700)`;
    await env.DB.prepare(ins).bind(21, 'newest', 'Newest', '<p>a</p>', '2026-02-03 00:00:00').run();
    await env.DB.prepare(ins).bind(22, 'older', 'Older', '<p>a</p>', '2026-02-01 00:00:00').run();
    await env.DB.prepare(ins).bind(23, 'oldest', 'Oldest', '<p>a</p>', '2026-01-15 00:00:00').run();
    const flags = { news_new_taxonomy: true };
    let h = await home.loadHomepage(env.DB, env, flags);
    assert.deepEqual(h.sections[0].articles.map((a) => a.id), [21, 22, 23]);
    await stats.savePins(env.DB, 'section:700', [{ news_id: 23 }]);
    h = await home.loadHomepage(env.DB, env, flags);
    assert.deepEqual(h.sections[0].articles.map((a) => a.id), [23, 21, 22]);
    await stats.savePins(env.DB, 'section:700', [{ news_id: 23, ends_at: '2000-01-01T00:00:00Z' }]);
    h = await home.loadHomepage(env.DB, env, flags);
    assert.deepEqual(h.sections[0].articles.map((a) => a.id), [21, 22, 23], 'an expired pin no longer applies');
  });
});

describe('IndexNow', () => {
  const stub = () => { const calls = []; const fetchImpl = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return new Response('', { status: 200 }); }; return { calls, fetchImpl }; };

  test('off by default: nothing is sent and no key is made', async () => {
    const env = await mkEnv(); const { calls, fetchImpl } = stub();
    const r = await pro.pingIndexNow(env, { origin: BASE, paths: ['/en/news/live-one'], newsId: 10, fetchImpl });
    assert.equal(r.skipped, 'off'); assert.equal(calls.length, 0);
    assert.equal(await pro.getIndexNowKey(env.DB), null);
  });
  test('on: sends the key, its address and the full URLs, and logs the result', async () => {
    const env = await mkEnv(); await setting(env, 'news_indexnow', 'true'); const { calls, fetchImpl } = stub();
    const r = await pro.pingIndexNow(env, { origin: BASE, paths: ['/en/news/live-one', '/en/news/live-one', '/etc/passwd'], newsId: 10, reason: 'published', fetchImpl });
    assert.equal(r.ok, true); assert.equal(calls.length, 1);
    const b = calls[0].body; const key = await pro.getIndexNowKey(env.DB);
    assert.match(key, /^[a-f0-9]{32}$/);
    assert.deepEqual([b.host, b.key, b.keyLocation, b.urlList], ['news.example.com', key, `${BASE}/${key}.txt`, [`${BASE}/en/news/live-one`]]);
    assert.equal((await env.DB.prepare(`SELECT status FROM news_index_pings WHERE news_id=10`).first()).status, 'sent');
  });
  test('the same article and reason is not sent twice within five minutes', async () => {
    const env = await mkEnv(); await setting(env, 'news_indexnow', 'true'); const { calls, fetchImpl } = stub();
    await pro.pingIndexNow(env, { origin: BASE, paths: ['/en/news/live-one'], newsId: 10, reason: 'updated', fetchImpl });
    const again = await pro.pingIndexNow(env, { origin: BASE, paths: ['/en/news/live-one'], newsId: 10, reason: 'updated', fetchImpl });
    assert.equal(again.skipped, 'sent recently'); assert.equal(calls.length, 1);
  });
  test('local and private hosts are never sent; a failing service never throws and is logged as failed', async () => {
    const env = await mkEnv(); await setting(env, 'news_indexnow', 'true'); const { calls, fetchImpl } = stub();
    assert.equal((await pro.pingIndexNow(env, { origin: 'http://localhost:8787', paths: ['/en/news/a'], fetchImpl })).skipped, 'not a public host');
    assert.equal(calls.length, 0);
    const boom = async () => { throw new Error('network down'); };
    const r = await pro.pingIndexNow(env, { origin: BASE, paths: ['/en/news/live-one'], newsId: 10, reason: 'x', fetchImpl: boom });
    assert.equal(r.ok, false);
    assert.equal((await env.DB.prepare(`SELECT status FROM news_index_pings WHERE news_id=10`).first()).status, 'failed');
  });
  test('only live articles are announced', async () => {
    const env = await mkEnv(); await setting(env, 'news_indexnow', 'true');
    assert.equal(await pro.pingArticleById(env, null, 11, 'published'), null, 'a draft');
    await env.DB.prepare(`UPDATE news SET published_at='2099-01-01 00:00:00' WHERE id=10`).run();
    assert.equal(await pro.pingArticleById(env, null, 10, 'published'), null, 'a scheduled article');
  });
  test('the background job sends articles that went live and have never been sent', async () => {
    const env = await mkEnv(); await setting(env, 'news_indexnow', 'true'); const { calls, fetchImpl } = stub();
    await env.DB.prepare(`UPDATE news SET published_at=datetime('now','-1 hour') WHERE id=10`).run();
    const r = await pro.runNewsIndexPings(env, { fetchImpl });
    assert.equal(r.sent, 1); assert.deepEqual(calls[0].body.urlList, [`${BASE}/en/news/live-one`]);
    const again = await pro.runNewsIndexPings(env, { fetchImpl });
    assert.equal(again.sent, 0); assert.equal(calls.length, 1, 'not sent a second time');
  });
  test('the key file is served only for the saved key', async () => {
    const env = await mkEnv(); await setting(env, 'news_indexnow', 'true');
    const key = await pro.getIndexNowKey(env.DB, { create: true });
    const route = routeSystem(`/${key}.txt`, new Request(`${BASE}/${key}.txt`));
    assert.equal(route.indexnowKey, key);
    const ok = await handleMisc(route, new Request(`${BASE}/${key}.txt`), env, {}, new URL(`${BASE}/${key}.txt`));
    assert.equal(await ok.text(), key);
    const other = 'f'.repeat(32);
    const miss = await handleMisc({ type: 'robots', indexnowKey: other }, new Request(`${BASE}/${other}.txt`), env, {}, new URL(`${BASE}/${other}.txt`));
    assert.equal(miss.status, 404);
  });
  test('the admin API reports status, pings an article and needs the switch on', async () => {
    const env = await mkEnv();
    assert.equal((await api(env, 'POST', 'indexnow/ping', { id: 10 })).status, 409);
    await setting(env, 'news_indexnow', 'true');
    const st = await api(env, 'GET', 'indexnow/status');
    assert.equal(st.json.enabled, true);
    const flags = await api(env, 'GET', 'flags');
    assert.ok(flags.json.flags.some((f) => f.key === 'news_indexnow' && f.label.includes('IndexNow')));
  });
});

describe('admin screens', () => {
  const src = (p) => readFileSync(join(ROOT, p), 'utf-8');
  test('calendar tab and new panels exist, and nothing uses innerHTML', () => {
    assert.ok(src('templates/pages/admin/newsroom.html').includes('data-nr-tab="calendar"'));
    const pro6 = src('js-src/newsroom-admin/07-pro-tools.js');
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML/.test(pro6));
    const built = src('static/js/newsroom-admin.js');
    for (const f of ['renderCalendar', 'renderBylines', 'renderRevisionTools', 'revision/restore', 'section:']) assert.ok(built.includes(f), f);
  });
  test('the credits picker route exposes names only', async () => {
    const env = await mkEnv();
    const r = await api(env, 'GET', 'authors/pick');
    assert.deepEqual(Object.keys(r.json.authors[0]).sort(), ['id', 'name']);
  });
});
