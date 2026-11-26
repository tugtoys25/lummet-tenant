// test/news-focus-translations.test.js -- image focal point and translations / hreflang. Real migrated schema, real API handlers.
// Not covered: the admin click-to-set UI in a browser.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import * as focus from '../worker/newsroom-focus.js';
import * as trans from '../worker/newsroom-translations.js';
import { renderNews } from '../worker/controllers.js';
import { handleNewsroomApi } from '../worker/newsroom-api.js';
import { resetNewsFlagCache } from '../worker/database/newsroom.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://news.example.com';
const ADMIN = { user_id: 1, role: 'admin' };
const NO_PERMS = { news: { read: true } };

async function mkEnv() {
  const db = createTestDb(); applyMigrations(db);
  await db.prepare(`INSERT INTO users (id,email,password_hash,role) VALUES (1,'a@t.l','x','admin')`).run();
  await db.prepare(`INSERT INTO authors (id,slug,name,role) VALUES (1,'elie','Elie','Editor')`).run();
  await db.prepare(`INSERT INTO media_library (id,filename,url,alt_text) VALUES (5,'a.jpg','https://x.test/a.jpg','pic')`).run();
  const ins = `INSERT INTO news (id,slug,title,content,published,published_at,author_id,created_by,excerpt,featured_image) VALUES (?,?,?,?,?,?,1,1,?,?)`;
  await db.prepare(ins).bind(10, 'story-en', 'Story', '<p>Hello</p>', 1, '2026-02-01 10:00:00', 'ex', 5).run();
  await db.prepare(ins).bind(11, 'story-fr', 'Histoire', '<p>Bonjour</p>', 1, '2026-02-01 10:00:00', 'ex', null).run();
  await db.prepare(ins).bind(12, 'story-rw', 'Inkuru', '<p>Muraho</p>', 0, null, 'ex', null).run();
  resetNewsFlagCache();
  return { DB: db, SITE_URL: BASE, ASSETS: { fetch: async (r) => { const f = join(ROOT, new URL(r.url).pathname); return existsSync(f) ? new Response(readFileSync(f, 'utf-8')) : new Response('nf', { status: 404 }); } } };
}
const flag = async (env, ...k) => { await env.DB.prepare(`UPDATE system_settings SET value='true' WHERE key IN (${k.map(() => '?').join(',')})`).bind(...k).run(); resetNewsFlagCache(); };
const admin = async (env, method, route, body) => {
  const init = { method, headers: method === 'POST' ? { 'Content-Type': 'application/json' } : {} }; if (method === 'POST') init.body = JSON.stringify(body);
  const res = await handleNewsroomApi(new Request(`${BASE}/api/v1/newsroom/${route}`, init), env, ADMIN);
  return { status: res.status, json: await res.json() };
};
const page = async (env, slug) => (await renderNews(new Request(`${BASE}/en/news/${slug}`), env, slug)).text();

describe('image focal point', () => {
  test('off by default: no routes, no style on the page', async () => {
    const env = await mkEnv();
    assert.equal((await admin(env, 'GET', 'focus/get?id=10')).json.enabled, false);
    assert.equal((await admin(env, 'POST', 'focus/save', { id: 10, x: 20, y: 30 })).status, 404);
    assert.ok(!(await page(env, 'story-en')).includes('object-position'));
  });
  test('saves, clamps, resets, needs permission, and shows on the article page', async () => {
    const env = await mkEnv(); await flag(env, 'news_image_focus');
    assert.deepEqual((await admin(env, 'GET', 'focus/get?id=10')).json.focus, null);
    assert.equal((await admin(env, 'POST', 'focus/save', { id: 10, x: 20, y: 30 })).status, 200);
    assert.deepEqual(await focus.getFocus(env.DB, 5), { x: 20, y: 30 });
    assert.equal((await admin(env, 'POST', 'focus/save', { id: 10, x: 500, y: -4 })).json.focus.x, 100);
    assert.equal((await admin(env, 'POST', 'focus/save', { id: 10, x: 20, y: 30 })).status, 200);
    assert.ok((await page(env, 'story-en')).includes('object-position:20% 30%;'));
    assert.equal((await admin(env, 'POST', 'focus/save', { id: 11, x: 1, y: 1 })).status, 400);
    assert.equal((await focus.setFocus(env.DB, { mediaId: 5, x: 1, y: 1, actor: ADMIN, perms: NO_PERMS })).status, 403);
    assert.equal((await admin(env, 'POST', 'focus/save', { id: 10, x: null, y: null })).status, 200);
    assert.equal(await focus.getFocus(env.DB, 5), null);
    assert.ok(!(await page(env, 'story-en')).includes('object-position'));
  });
  test('attachFocus and focusCss', async () => {
    const env = await mkEnv();
    await focus.setFocus(env.DB, { mediaId: 5, x: 10, y: 90, actor: ADMIN, perms: { media: { create: true } } });
    const rows = [{ featured_image: 5 }, { featured_image: null }];
    await focus.attachFocus(env.DB, rows);
    assert.equal(focus.focusCss(rows[0]), 'object-position:10% 90%;');
    assert.equal(focus.focusCss(rows[1]), '');
  });
});

describe('translations', () => {
  test('language codes are normalised and checked', async () => {
    assert.equal(trans.normLang('FR'), 'fr'); assert.equal(trans.normLang('pt_br'), 'pt-BR'); assert.equal(trans.normLang('english!'), '');
    const env = await mkEnv(); await flag(env, 'news_translations');
    assert.equal((await admin(env, 'POST', 'lang/set', { id: 10, lang: 'nonsense!' })).status, 400);
    assert.equal((await admin(env, 'POST', 'lang/set', { id: 10, lang: 'en' })).status, 200);
  });
  test('link rules: language first, one article per language, no stealing from another group, unlink keeps articles', async () => {
    const env = await mkEnv(); await flag(env, 'news_translations');
    assert.equal((await admin(env, 'POST', 'lang/link', { id: 10, other_id: 11, lang: 'fr' })).status, 409);
    await admin(env, 'POST', 'lang/set', { id: 10, lang: 'en' });
    assert.equal((await admin(env, 'POST', 'lang/link', { id: 10, other_id: 11, lang: 'en' })).status, 409);
    assert.equal((await admin(env, 'POST', 'lang/link', { id: 10, other_id: 11, lang: 'fr' })).status, 200);
    assert.equal((await admin(env, 'POST', 'lang/link', { id: 10, other_id: 10, lang: 'fr' })).status, 400);
    const g = (await admin(env, 'GET', 'lang/get?id=10')).json;
    assert.equal(g.lang, 'en'); assert.equal(g.siblings.length, 1); assert.equal(g.siblings[0].lang, 'fr');
    await admin(env, 'POST', 'lang/set', { id: 12, lang: 'rw' });
    assert.equal((await admin(env, 'POST', 'lang/link', { id: 12, other_id: 11, lang: 'rw' })).status, 409);
    assert.equal((await trans.linkTranslation(env.DB, { newsId: 10, otherId: 12, lang: 'rw', actor: ADMIN, perms: NO_PERMS })).status, 403);
    assert.equal((await admin(env, 'POST', 'lang/unlink', { id: 11 })).status, 200);
    assert.equal((await admin(env, 'GET', 'lang/get?id=10')).json.siblings.length, 0);
    assert.equal((await env.DB.prepare(`SELECT COUNT(*) c FROM news`).first()).c, 3);
  });
  test('page declares language, hreflang and switcher; unpublished translations are never advertised', async () => {
    const env = await mkEnv(); await flag(env, 'news_translations');
    const plain = await page(env, 'story-en');
    assert.ok(!plain.includes('hreflang'));
    await admin(env, 'POST', 'lang/set', { id: 10, lang: 'en' });
    await admin(env, 'POST', 'lang/link', { id: 10, other_id: 11, lang: 'fr' });
    await admin(env, 'POST', 'lang/link', { id: 10, other_id: 12, lang: 'rw' });
    const html = await page(env, 'story-en');
    assert.ok(html.includes('hreflang="fr"') && html.includes('hreflang="x-default"') && html.includes('hreflang="en"'));
    assert.ok(!html.includes('hreflang="rw"') && !html.includes('story-rw'));
    assert.ok(html.includes('Also available in'));
    assert.ok((await page(env, 'story-fr')).includes('<html lang="fr"'));
  });
});
