// test/newsroom-media.test.js -- video embeds, podcast feed, photo galleries: switches, safety, feed content, members-only exclusion.
// Real migrated schema and article controller. Not covered: real podcast directories, real browsers (click-to-play and lightbox scripts are not executed).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import * as media from '../worker/newsroom-media.js';
import * as ops from '../worker/newsroom-ops.js';
import { handleNewsroomApi } from '../worker/newsroom-api.js';
import { renderNews } from '../worker/controllers.js';
import { routeContent } from '../worker/routing/content.js';
import { resetNewsFlagCache } from '../worker/database/newsroom.js';
import { setArticleAccess } from '../worker/newsroom-membership.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://news.example.com';
const ADMIN = { user_id: 1, role: 'admin' };
const YT = 'dQw4w9WgXcQ';

async function mkEnv() {
  const db = createTestDb(); applyMigrations(db);
  await db.prepare(`INSERT INTO users (id,email,password_hash,role) VALUES (1,'a@t.l','x','admin')`).run();
  await db.prepare(`INSERT INTO authors (id,slug,name,role) VALUES (1,'elie','Elie','Editor')`).run();
  const ins = `INSERT INTO news (id,slug,title,content,published,published_at,author_id,created_by,excerpt,tags) VALUES (?,?,?,?,1,'2026-02-01 10:00:00',1,1,?,?)`;
  await db.prepare(ins).bind(1, 'vid', 'Video story', `<p>Intro</p><p>https://www.youtube.com/watch?v=${YT}</p><p>After <a href="https://www.youtube.com/watch?v=${YT}">link in text</a> stays</p>`, 'x', '').run();
  await db.prepare(ins).bind(2, 'gal', 'Gallery story', '<div class="nr-gallery"><img src="https://img.example.com/a.jpg" alt="A"><img src="https://img.example.com/b.jpg" alt="B"></div>', 'x', '').run();
  await db.prepare(ins).bind(3, 'ep1', 'Episode one', '<p>Notes</p><audio controls src="https://cdn.example.com/ep1.mp3"></audio>', 'Episode summary', 'podcast, news').run();
  await db.prepare(ins).bind(4, 'ep2', 'Members episode', '<audio controls src="https://cdn.example.com/ep2.mp3"></audio>', 's', 'podcast').run();
  await db.prepare(ins).bind(5, 'noaudio', 'Tagged without audio', '<p>text</p>', 's', 'podcast').run();
  await db.prepare(ins).bind(6, 'other', 'Other tag', '<audio src="https://cdn.example.com/o.mp3"></audio>', 's', 'podcasting').run();
  await db.prepare(`INSERT INTO media_library (filename, url, type, size, duration, mime_type) VALUES ('ep1.mp3','https://cdn.example.com/ep1.mp3','audio',1234567,3725,'audio/mpeg')`).run();
  const env = { DB: db, SITE_URL: BASE, ASSETS: { fetch: async (req) => { const f = join(ROOT, new URL(req.url).pathname); return existsSync(f) ? new Response(readFileSync(f, 'utf-8'), { status: 200 }) : new Response('', { status: 404 }); } } };
  resetNewsFlagCache(); ops.forgetOpsFlags(db);
  return env;
}
const flag = async (env, key, value = 'true') => { await env.DB.prepare(`INSERT INTO system_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(key, value).run(); resetNewsFlagCache(); ops.forgetOpsFlags(env.DB); };
const page = async (env, slug) => { const r = await renderNews(new Request(`${BASE}/en/news/${slug}`), env, slug, null); return r.text(); };
const feed = async (env) => media.handlePodcastFeed(new Request(`${BASE}/en/podcast.xml`), env, {});
const api = async (env, method, route, body) => {
  const init = { method, headers: method === 'POST' ? { 'Content-Type': 'application/json' } : {} }; if (method === 'POST') init.body = JSON.stringify(body);
  const res = await handleNewsroomApi(new Request(`${BASE}/api/v1/newsroom/${route}`, init), env, ADMIN);
  return { status: res.status, json: await res.json() };
};

describe('unit', () => {
  test('youtubeId accepts real forms and rejects look-alikes', () => {
    for (const u of [`https://www.youtube.com/watch?v=${YT}`, `https://youtu.be/${YT}`, `https://m.youtube.com/watch?v=${YT}&t=3`, `https://www.youtube.com/embed/${YT}`, `https://www.youtube.com/shorts/${YT}`]) assert.equal(media.youtubeId(u), YT, u);
    for (const u of ['https://evil.com/watch?v=' + YT, 'https://youtube.com.evil.com/watch?v=' + YT, 'javascript:alert(1)', 'https://www.youtube.com/watch?v=short', 'https://www.youtube.com/watch?v="><script>', 'not a url']) assert.equal(media.youtubeId(u), null, u);
  });
  test('transform turns only a lone link into a player; text links and off-switch are untouched', () => {
    const src = `<p>https://youtu.be/${YT}</p><p>See <a href="https://youtu.be/${YT}">this</a> clip</p>`;
    const r = media.transformContent(src, { videos: true });
    assert.deepEqual(r.videos, [YT]); assert.match(r.html, /class="nr-video" data-yt="dQw4w9WgXcQ"/); assert.match(r.html, /See <a href/);
    assert.equal(media.transformContent(src, { videos: false }).html, src);
    assert.ok(!/<iframe/.test(r.html), 'no third-party frame until the reader presses play');
  });
  test('gallery detection', () => {
    assert.equal(media.transformContent('<div class="nr-gallery"><img src="a"></div>', { galleries: true }).hasGallery, true);
    assert.equal(media.transformContent('<div class="nr-gallery"></div>', { galleries: false }).hasGallery, false);
  });
  test('firstAudio finds the player and refuses odd sources', () => {
    assert.deepEqual(media.firstAudio('<audio src="https://c.x/a.m4a"></audio>'), { src: 'https://c.x/a.m4a', type: 'audio/x-m4a' });
    assert.equal(media.firstAudio('<audio src="javascript:x"></audio>'), null);
    assert.equal(media.firstAudio('<p>none</p>'), null);
  });
});

describe('article page', () => {
  test('ships OFF: no player, no script', async () => {
    const env = await mkEnv();
    for (const k of ['news_video_embeds', 'news_podcast', 'news_galleries']) assert.equal((await env.DB.prepare(`SELECT value FROM system_settings WHERE key=?`).bind(k).first()).value, 'false');
    const html = await page(env, 'vid');
    assert.ok(!html.includes('nr-video-play') && !html.includes('news-media.js'));
  });
  test('video on: click-to-play, VideoObject, no iframe, script and style present', async () => {
    const env = await mkEnv(); await flag(env, 'news_video_embeds');
    const html = await page(env, 'vid');
    assert.match(html, /nr-video-play/); assert.match(html, /news-media\.js/); assert.match(html, /"VideoObject"/); assert.ok(!/<iframe[^>]*youtube/i.test(html));
    assert.match(html, /link in text/);
  });
  test('gallery on: script loaded; off: not', async () => {
    const env = await mkEnv(); await flag(env, 'news_galleries');
    assert.match(await page(env, 'gal'), /news-media\.js/);
    assert.ok(!(await page(env, 'ep1')).includes('news-media.js'), 'pages without media carry nothing extra');
  });
});

describe('podcast feed', () => {
  test('route exists', () => { assert.deepEqual(routeContent('/en/podcast.xml'), { type: 'podcastFeed' }); });
  test('404 while off', async () => { const env = await mkEnv(); assert.equal((await feed(env)).status, 404); });
  test('on: only exact tag with audio, enclosure, duration and length from media library, escaped', async () => {
    const env = await mkEnv(); await flag(env, 'news_podcast');
    assert.equal((await api(env, 'POST', 'media/podcast', { podcast_title: 'My <Show> & more', podcast_author: 'Elie', podcast_email: 'o@example.com', podcast_image: 'https://img.example.com/c.jpg', podcast_tag: 'Podcast' })).status, 200);
    const res = await feed(env); assert.equal(res.status, 200); assert.match(res.headers.get('Content-Type'), /rss\+xml/);
    const xml = await res.text();
    assert.match(xml, /<title>My &lt;Show&gt; &amp; more<\/title>/);
    assert.match(xml, /<enclosure url="https:\/\/cdn\.example\.com\/ep1\.mp3" length="1234567" type="audio\/mpeg"\/>/);
    assert.match(xml, /<itunes:duration>1:02:05<\/itunes:duration>/);
    assert.match(xml, /itunes:image href="https:\/\/img\.example\.com\/c\.jpg"/);
    assert.ok(xml.includes('Episode one') && xml.includes('Members episode'));
    assert.ok(!xml.includes('Tagged without audio') && !xml.includes('Other tag'));
  });
  test('members-only episodes never appear in the public feed', async () => {
    const env = await mkEnv(); await flag(env, 'news_podcast'); await flag(env, 'news_membership');
    await setArticleAccess(env.DB, { newsId: 4, level: 'members', preview: 1, actor: ADMIN }).catch(() => {});
    const xml = await (await feed(env)).text();
    assert.ok(xml.includes('Episode one') && !xml.includes('Members episode'));
  });
});

describe('admin API', () => {
  test('status, validation, flags listed with help', async () => {
    const env = await mkEnv();
    const s = await api(env, 'GET', 'media/status'); assert.equal(s.status, 200); assert.match(s.json.feed_url, /podcast\.xml$/);
    assert.equal((await api(env, 'POST', 'media/podcast', { podcast_email: 'bad' })).status, 400);
    assert.equal((await api(env, 'POST', 'media/podcast', { podcast_image: 'http://x/y.jpg' })).status, 400);
    const flags = (await api(env, 'GET', 'flags')).json.flags;
    for (const k of ['news_video_embeds', 'news_podcast', 'news_galleries']) assert.ok(flags.find((f) => f.key === k)?.help, k);
  });
});
