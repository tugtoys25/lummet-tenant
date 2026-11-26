import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { validateBanner } from '../worker/live-banners/validate.js';
import { sliderConfig } from '../worker/live-banners/validate-slider.js';
import { renderOne, renderLiveBanners } from '../worker/live-banners/render.js';
import { resolveItems } from '../worker/live-banners/load.js';
import { recordEvents, _resetRate } from '../worker/live-banners/stats.js';
import { handleAPI } from '../worker/api.js';
import * as bdb from '../worker/database/live-banners.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const slide = (key, o = {}) => ({ source_type: 'slide', source_key: key, overrides: { image: '/media/' + key + '.jpg', url: '/en/casino/' + key, ...o } });
const home = (o = {}, items = [slide('a'), slide('b'), slide('c')]) => ({ name: 'Home', template_key: 'slider', placement_mode: 'inline', anchor: 'after_header', content: { headline: 'Top offers', slider: {} }, items, ...o });
const cardsOf = (v) => v.items.map((i) => ({ source: 'slide', key: i.source_key, title: i.overrides.label || '', subtitle: i.overrides.subtitle || '', image: i.overrides.image, image_mobile: i.overrides.image_mobile || '', alt: i.overrides.alt || '', url: i.overrides.url || '', cta_label: i.overrides.cta_label || '', new_tab: !!i.overrides.new_tab, duration: i.overrides.duration || 0, sponsored: !!i.overrides.sponsored, start_at: i.overrides.start_at || '', end_at: i.overrides.end_at || '', badge: i.overrides.badge || '', text_pos: i.overrides.text_pos || '' }));
const html = (input, id = 5) => { const v = validateBanner(input); assert.ok(v.ok, v.errors && v.errors.join()); return renderOne({ ...v.banner, id, cards: cardsOf(v) }); };

describe('slider settings and slides: validation', () => {
  test('missing settings get safe defaults; numbers are clamped; bad choices fall back', () => {
    const d = sliderConfig(undefined);
    assert.deepEqual([d.autoplay, d.interval, d.transition, d.ratio, d.nav], [true, 6, 'fade', '2:1', 'dots']);
    const c = sliderConfig({ interval: 999, speed: 1, transition: 'cube', ratio: '99:1', nav: 'x', autoplay: 'false' });
    assert.deepEqual([c.interval, c.speed, c.transition, c.ratio, c.nav], [30, 200, 'fade', '2:1', 'dots']);
  });
  test('unknown slider settings and unknown slide fields are rejected', () => {
    assert.match(validateBanner(home({ content: { slider: { evil: 1 } } })).errors.join('|'), /unknown field "evil"/);
    assert.match(validateBanner(home({}, [slide('a', { onclick: 'x' })])).errors.join('|'), /unknown field "onclick"/);
  });
  test('slide links and pictures follow the allow-lists; every slide needs a picture; at most 10', () => {
    const e = (it) => validateBanner(home({}, [it])).errors.join('|');
    assert.match(e(slide('a', { url: 'javascript:alert(1)' })), /slide link/);
    assert.match(e(slide('a', { image: 'http://insecure.example/x.jpg' })), /slide picture/);
    assert.match(e(slide('a', { image_mobile: 'data:image/png;base64,AA' })), /phone picture/);
    assert.match(e({ source_type: 'slide', source_key: 'a', overrides: { url: '/x' } }), /slide 1 needs a picture/);
    assert.match(e(slide('bad key!')), /invalid item key/);
    assert.match(validateBanner(home({}, Array.from({ length: 11 }, (_, i) => slide('s' + i)))).errors.join('|'), /at most 10/);
  });
  test('per-slide schedule and duration are validated and normalised', () => {
    const ok = validateBanner(home({}, [slide('a', { start_at: '2026-12-01T09:00', end_at: '2026-12-31', duration: 500, cta_label: 'Go', new_tab: true })]));
    assert.ok(ok.ok); const o = ok.items[0].overrides;
    assert.deepEqual([o.start_at, o.end_at, o.duration, o.new_tab], ['2026-12-01 09:00:00', '2026-12-31 00:00:00', 60, true]);
    assert.match(validateBanner(home({}, [slide('a', { start_at: '2026-12-31', end_at: '2026-12-01' })])).errors.join('|'), /must be after/);
    assert.match(validateBanner(home({}, [slide('a', { start_at: 'tomorrow' })])).errors.join('|'), /invalid date/);
  });
  test('older sliders without any new field still validate', () => {
    const v = validateBanner({ name: 'Old', template_key: 'slider', placement_mode: 'floating', anchor: 'bottom-right', content: {}, items: [{ source_type: 'slide', source_key: 's1', overrides: { label: 'L', image: '/media/x.jpg', url: '/en/x' } }] });
    assert.ok(v.ok, v.errors.join());
  });
});

describe('slider markup', () => {
  test('accessible carousel: roles, labels, controls, one picture per slide, others hidden until the script runs', () => {
    const out = html(home());
    assert.match(out, /role="region" aria-roledescription="carousel" aria-label="Top offers"/);
    assert.equal((out.match(/aria-roledescription="slide"/g) || []).length, 3);
    assert.match(out, /aria-label="2 of 3: Slide 2"/);
    assert.match(out, /data-lb-play[^>]*aria-label="Pause automatic slide show"/);
    assert.match(out, /data-lb-prev[^>]*aria-label="Previous slide"/); assert.match(out, /data-lb-next[^>]*aria-label="Next slide"/);
    assert.equal((out.match(/data-lb-dot=/g) || []).length, 3);
    assert.equal((out.match(/ hidden>/g) || []).length, 2); // slides 2 and 3
    assert.match(out, /aria-live="off"/);
  });
  test('every slide is one big link, tracked; external and paid links are sponsored + noopener', () => {
    const out = html(home({}, [slide('a', { url: 'https://partner.example/x' }), slide('b', { sponsored: true }), slide('c', { new_tab: true })]));
    assert.equal((out.match(/class="lb-sl__link"/g) || []).length, 3); assert.equal((out.match(/data-lb-click/g) || []).length, 3);
    assert.match(out, /href="https:\/\/partner\.example\/x" target="_blank" rel="sponsored noopener"/);
    assert.match(out, /href="\/en\/casino\/b" rel="sponsored noopener"/);
    assert.match(out, /href="\/en\/casino\/c" target="_blank"/);
  });
  test('a slide without its own link uses the banner link; with neither it is not a link', () => {
    const a = html(home({ content: { slider: {}, link: '/en/offers', cta_label: 'See all' } }, [{ ...slide('a'), overrides: { image: '/media/a.jpg' } }]));
    assert.match(a, /href="\/en\/offers"/); assert.match(a, /lb-sl__cta">See all/);
    const b = html(home({}, [{ ...slide('a'), overrides: { image: '/media/a.jpg' } }]));
    assert.ok(!/<a class="lb-sl__link"/.test(b)); assert.match(b, /<div class="lb-sl__link">/);
  });
  test('performance: first picture of an above-the-fold banner is eager and high priority, the rest lazy and low; floating banners are all lazy', () => {
    const out = html(home());
    assert.match(out, /src="\/media\/a\.jpg"[^>]*fetchpriority="high"/); assert.ok(!/fetchpriority="high"[^>]*loading="lazy"/.test(out));
    assert.equal((out.match(/loading="lazy" fetchpriority="low"/g) || []).length, 2);
    const fl = html(home({ placement_mode: 'floating', anchor: 'bottom-right' }));
    assert.ok(!fl.includes('fetchpriority="high"')); assert.equal((fl.match(/loading="lazy"/g) || []).length, 3);
    const wide = html(home({ content: { slider: { ratio: '3:1', mobile_ratio: '4:3' } } }));
    assert.match(wide, /width="1600" height="533"/); assert.match(wide, /--lb-ratio:3 \/ 1;--lb-ratio-m:4 \/ 3/); // space is reserved: no layout shift
  });
  test('phone picture becomes a <source>, text only when there is some, everything is escaped', () => {
    const out = html(home({}, [slide('a', { image_mobile: '/media/a-m.jpg', label: '<img src=x onerror=alert(1)>', subtitle: '"quoted"', badge: 'NEW', cta_label: 'Play' }), slide('b')]));
    assert.match(out, /<source media="\(max-width: 640px\)" srcset="\/media\/a-m\.jpg"/);
    assert.ok(!out.includes('<img src=x')); assert.match(out, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.equal((out.match(/class="lb-sl__text /g) || []).length, 1); // slide b has no text, so no shade or text box
    assert.match(out, /lb-sl__badge">NEW/);
  });
  test('settings reach the markup: timing, transition, autoplay off, ad label, one slide has no controls', () => {
    const out = html(home({ content: { slider: { interval: 4, speed: 800, transition: 'kenburns', progress: false, ad_label: true, ad_text: 'Sponsored' } } }));
    assert.match(out, /data-interval="4000" data-speed="800"/); assert.match(out, /lb-sl--kenburns/); assert.ok(!out.includes('lb-sl--prog')); assert.match(out, /lb-sl__ad">Sponsored/);
    const off = html(home({ content: { slider: { autoplay: false } } }));
    assert.match(off, /data-auto="0"/); assert.ok(!off.includes('data-lb-play')); assert.ok(!off.includes('data-lb-bar'));
    const one = html(home({}, [slide('a')]));
    for (const k of ['data-lb-play', 'data-lb-prev', 'data-lb-dot', 'data-lb-bar']) assert.ok(!one.includes(k), k);
  });
  test('slide window and duration are exposed for the browser to re-check', () => {
    const out = html(home({}, [slide('a', { start_at: '2026-01-01 00:00', end_at: '2099-01-01 00:00', duration: 9 }), slide('b')]));
    assert.match(out, /data-dur="9000" data-start="1767225600000" data-end="4070908800000"/);
  });
  test('the slider script is added once, and only when a slider is on the page', () => {
    const v = validateBanner(home()); const b = { ...v.banner, id: 1, cards: cardsOf(v) };
    assert.equal((renderLiveBanners([b]).slots.after_header + renderLiveBanners([b]).overlay).split('live-banners-slider.js').length - 1, 1);
    const promo = { ...validateBanner({ name: 'P', template_key: 'promo_card', placement_mode: 'floating', anchor: 'bottom-right', content: { headline: 'H', cta_label: 'G', link: '/x' } }).banner, id: 2, cards: [] };
    assert.ok(!renderLiveBanners([promo]).overlay.includes('live-banners-slider.js'));
  });
});

describe('slides in the database: schedule, stats, API', () => {
  let db;
  beforeEach(() => { db = createTestDb(); applyMigrations(db); _resetRate(); });
  test('migration 0039 is idempotent', () => {
    const sql = readFileSync(join(ROOT, 'migrations/0039_live_banner_slide_stats.sql'), 'utf8'); db._exec(sql); db._exec(sql);
    assert.ok(db._raw.prepare("select name from sqlite_master where name = 'live_banner_slide_stats'").get());
  });
  test('resolveItems keeps every field and drops slides outside their window (not in the admin preview)', async () => {
    const b = { template_key: 'slider', items: [slide('now', { label: 'Now', subtitle: 'S', start_at: '2020-01-01 00:00:00', end_at: '2099-01-01 00:00:00' }), slide('past', { end_at: '2020-02-01 00:00:00' }), slide('future', { start_at: '2098-01-01 00:00:00' })].map((i) => ({ ...i, overrides: { ...i.overrides } })) };
    const live = await resolveItems(db, b, null);
    assert.deepEqual(live.map((c) => c.key), ['now']); assert.equal(live[0].subtitle, 'S');
    assert.deepEqual((await resolveItems(db, b, null, { geo: false, schedule: false })).map((c) => c.key), ['now', 'past', 'future']);
  });
  async function liveSlider() { const v = validateBanner(home({ status: 'live' })); return { id: await bdb.createBanner(db, v.banner, v.items), v }; }
  test('slide events are counted per slide and day, only for real slides of live banners', async () => {
    const { id } = await liveSlider(); const e = { DB: db }; const now = new Date('2026-06-01T10:00:00Z');
    const r = await recordEvents(e, { events: [{ id, type: 'view' }, { id, type: 'view', s: 'a' }, { id, type: 'view', s: 'a' }, { id, type: 'click', s: 'b' }, { id, type: 'view', s: 'ghost' }] }, { clientKey: 'k', now });
    assert.equal(r.status, 200); assert.equal(r.accepted, 4); // the made-up slide is ignored
    assert.deepEqual(await bdb.slideStats(db, id), { a: { views: 2, clicks: 0 }, b: { views: 0, clicks: 1 } });
    assert.equal(db._raw.prepare('select views v from live_banner_stats where banner_id = ?').get(id).v, 1); // slide events do not inflate banner totals
    assert.equal(db._raw.prepare('select count(*) c from live_banner_slide_stats').get().c, 2);
    assert.equal((await recordEvents(e, { id, type: 'view', s: 'ghost' }, { clientKey: 'k', now })).status, 404);
    assert.equal((await recordEvents(e, { id, type: 'view', s: '<script>' }, { clientKey: 'k', now })).status, 400);
  });
  test('API: get returns per-slide numbers, preview shows scheduled slides, delete cleans slide stats', async () => {
    const admin = { user_id: 1, role: 'admin' };
    const call = (path, method, body) => handleAPI(new Request('https://t.example' + path, { method, body: body ? JSON.stringify(body) : undefined }), { DB: db }, path.split('?')[0], admin).then(async (r) => ({ status: r.status, body: await r.json() }));
    const c = await call('/api/v1/live-banner/create', 'POST', home({ status: 'live' }, [slide('a'), slide('b', { start_at: '2098-01-01 00:00:00' })])); assert.equal(c.status, 200);
    await recordEvents({ DB: db }, { id: c.body.id, type: 'click', s: 'a' }, { clientKey: 'api' });
    const g = await call('/api/v1/live-banner/get?id=' + c.body.id, 'GET'); assert.deepEqual(g.body.slide_stats, { a: { views: 0, clicks: 1 } });
    assert.equal(g.body.banner.items[0].overrides.url, '/en/casino/a');
    const pv = await call('/api/v1/live-banner/preview', 'POST', home({}, [slide('a'), slide('b', { start_at: '2098-01-01 00:00:00' })])); assert.equal((pv.body.html.match(/data-lb-slide /g) || []).length, 2);
    const bad = await call('/api/v1/live-banner/create', 'POST', home({}, [slide('a', { url: 'javascript:1' })])); assert.equal(bad.status, 422);
    assert.equal((await call('/api/v1/live-banner/delete', 'POST', { id: c.body.id })).status, 200);
    assert.equal(db._raw.prepare('select count(*) c from live_banner_slide_stats').get().c, 0);
  });
});

describe('browser files', () => {
  const read = (f) => readFileSync(join(ROOT, f), 'utf8');
  test('slider script and admin files: small, no innerHTML or inline handlers, reduced motion respected', () => {
    const files = ['static/js/live-banners-slider.js', 'worker/live-banners/tpl-slider.js', 'worker/live-banners/validate-slider.js', 'worker/live-banners/validate-util.js', ...readdirSync(join(ROOT, 'static/js/live-banner-admin')).map((f) => 'static/js/live-banner-admin/' + f)];
    for (const f of files) { const s = read(f); assert.ok(s.split('\n').length <= 250, f); if (f.startsWith('static/')) assert.ok(!/\.innerHTML\s*=|onclick\s*=|insertAdjacentHTML|eval\(/.test(s), f); }
    const js = read('static/js/live-banners-slider.js');
    assert.match(js, /prefers-reduced-motion: reduce/); assert.match(js, /visibilitychange/); assert.match(js, /IntersectionObserver/);
    assert.match(read('static/js/live-banners.js'), /window\.LiveBanners = \{ track: track/);
  });
  test('CSS: reserved height, composited-only animation, reduced-motion switch, 24px dot targets', () => {
    const css = read('css-src/main/15-live-banner-slider.css');
    assert.match(css, /aspect-ratio: var\(--lb-ratio\)/); assert.match(css, /prefers-reduced-motion: reduce/); assert.match(css, /touch-action: pan-y/); assert.match(css, /width: 24px; height: 24px/);
    assert.ok(!/@keyframes[^{]*\{[^}]*\{[^}]*(left|top|width|height|margin)\s*:/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), 'keyframes may only change transform/opacity');
  });
  test('the admin pages load the two new admin scripts', () => {
    const base = read('templates/layout/base.html'); assert.match(base, /live-banner-admin\/07-slider\.js/); assert.match(base, /live-banner-admin\/08-slides\.js/);
  });
});
