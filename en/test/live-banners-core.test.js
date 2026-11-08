import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { esc, safeUrl, safeColor, safeImage } from '../worker/live-banners/escape.js';
import { validateBanner } from '../worker/live-banners/validate.js';
import { TEMPLATES, TEMPLATE_KEYS } from '../worker/live-banners/templates.js';
import { renderOne, renderLiveBanners, pageInfo } from '../worker/live-banners/render.js';
import { countryOk, pageOk, inSchedule, casinoAllowed, forCountry } from '../worker/live-banners/target.js';
import { recordEvents, _resetRate } from '../worker/live-banners/stats.js';
import * as bdb from '../worker/database/live-banners.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = (o = {}) => ({ name: 'T', template_key: 'promo_card', placement_mode: 'floating', anchor: 'bottom-right', content: { headline: 'Hi', cta_label: 'Go', link: '/en/x' }, ...o });
const HOSTILE = '"><script>alert(1)</script><img src=x onerror=alert(2)>';

describe('migration 0016', () => {
  test('applies twice, creates tables, indexes and cascades', async () => {
    const db = createTestDb(); applyMigrations(db);
    const sql = readFileSync(join(ROOT, 'migrations/0016_live_banners.sql'), 'utf8');
    db._exec(sql); db._exec(sql);
    const names = db._raw.prepare("select name from sqlite_master").all().map((r) => r.name);
    for (const n of ['live_banners', 'live_banner_items', 'live_banner_stats', 'idx_live_banners_serve', 'idx_live_banner_items_banner']) assert.ok(names.includes(n), n);
    db._raw.exec('PRAGMA foreign_keys = ON');
    const v = validateBanner(base());
    const id = await bdb.createBanner(db, v.banner, [{ source_type: 'casino', source_key: 'a', overrides: {} }]);
    assert.equal((await bdb.getItems(db, id)).length, 1);
    db._raw.prepare('delete from live_banners where id = ?').run(id);
    assert.equal(db._raw.prepare('select count(*) c from live_banner_items').get().c, 0);
  });
});

describe('validation', () => {
  test('accepts a good banner', () => assert.ok(validateBanner(base()).ok));
  test('rejects bad colours, javascript: links, unknown keys, bad images', () => {
    const e = (o) => validateBanner(base(o)).errors.join('|');
    assert.match(e({ style: { bg: 'red;x' } }), /colour/);
    assert.match(e({ content: { headline: 'a', cta_label: 'b', link: 'javascript:alert(1)' } }), /link/);
    assert.match(e({ bogus: 1 }), /unknown field/);
    assert.match(e({ style: { evil: 1 } }), /unknown field/);
    assert.match(e({ content: { headline: 'a', cta_label: 'b', link: '/x', image: 'data:image/png;base64,AA' } }), /picture/);
  });
  test('rejects oversize JSON, too many items, wrong item sources', () => {
    const many = Array.from({ length: 13 }, (_, i) => ({ source_type: 'casino', source_key: 'c' + i }));
    assert.match(validateBanner(base({ template_key: 'casino_table', items: many })).errors.join(), /at most/);
    assert.match(validateBanner(base({ template_key: 'casino_spotlight', items: [{ source_type: 'news', source_key: 'x' }] })).errors.join(), /not allowed/);
    const big = validateBanner(base({ targeting: { slugs: Array.from({ length: 40 }, (_, i) => 'slug-' + i) } }));
    assert.ok(big.ok); assert.equal(big.banner.targeting.slugs.length, 30);
  });
  test('anchor must fit the mode; sizes are clamped', () => {
    assert.match(validateBanner(base({ anchor: 'left' })).errors.join(), /anchor/);
    assert.equal(validateBanner(base({ width: { value: 99999, unit: 'px' } })).banner.width.value, 1200);
  });
  test('url and colour helpers', () => {
    assert.equal(safeUrl('javascript:alert(1)'), ''); assert.equal(safeUrl('//evil.com'), ''); assert.equal(safeUrl('/en/ok'), '/en/ok');
    assert.equal(safeUrl('https://a.com/x'), 'https://a.com/x'); assert.equal(safeUrl('data:text/html,x'), '');
    assert.equal(safeColor('#fff'), '#fff'); assert.equal(safeColor('rgb(1,2,3)'), 'rgb(1,2,3)'); assert.equal(safeColor('url(x)'), '');
    assert.equal(safeImage('/en/x'), ''); assert.equal(safeImage('/media/a.png'), '/media/a.png');
  });
});

describe('escaping in every template', () => {
  const hostile = { headline: HOSTILE, text: HOSTILE, cta_label: HOSTILE, link: 'javascript:alert(1)', alt: HOSTILE, disclaimer: HOSTILE, image: 'javascript:alert(1)', marquee_text: HOSTILE,
    messages: [HOSTILE], chips: [{ label: HOSTILE, url: 'javascript:1' }], rows: [{ k: HOSTILE, v: HOSTILE }], countdown_end: '2030-01-01 00:00:00' };
  const cards = [{ source: 'casino', key: 'k', title: HOSTILE, image: 'javascript:1', url: '/en/casino/k', cta_url: '/en/go/k', bonus: HOSTILE, badge: HOSTILE, rating: 4, sponsored: true }];
  for (const key of TEMPLATE_KEYS) test(key, () => {
    const html = TEMPLATES[key].render({ c: hostile, items: cards, b: { end_at: '2030-01-01 00:00:00' } });
    assert.ok(!/<script/i.test(html) && !/<img[^>]+onerror/i.test(html) && !/javascript:/i.test(html), html.slice(0, 200));
  });
  test('banner attributes are escaped', () => {
    const html = renderOne({ id: 1, name: HOSTILE, template_key: 'promo_card', placement_mode: 'floating', anchor: 'bottom-right', style: { bg: 'red;}' }, content: { headline: 'a' }, targeting: {}, cards: [] });
    assert.ok(!html.includes('<script') && !html.includes('red;}'));
  });
});

describe('targeting', () => {
  test('exact country match (US is not AUS, no LIKE)', () => {
    const t = { countries: ['AU'], countries_mode: 'include' };
    assert.equal(countryOk(t, 'US'), false); assert.equal(countryOk(t, 'AU'), true);
    assert.equal(countryOk({ countries: ['US'], countries_mode: 'exclude' }, 'US'), false);
    assert.equal(countryOk({ countries: ['US'], countries_mode: 'exclude' }, 'AU'), true);
    assert.equal(countryOk({ countries: [] }, null), true); assert.equal(countryOk({ countries: ['US'], countries_mode: 'include' }, null), false);
  });
  test('page type, slug, schedule, status', () => {
    assert.equal(pageOk({ page_types: ['casino'], slugs: [], pages_mode: 'include' }, 'news', 'x'), false);
    assert.equal(pageOk({ page_types: [], slugs: ['x'], pages_mode: 'include' }, 'news', 'x'), true);
    assert.equal(pageOk({ page_types: ['home'], slugs: [], pages_mode: 'exclude' }, 'home', ''), false);
    const now = Date.parse('2026-06-01T00:00:00Z');
    assert.equal(inSchedule({ start_at: '2026-07-01 00:00:00' }, now), false); assert.equal(inSchedule({ end_at: '2026-05-01 00:00:00' }, now), false);
    assert.equal(inSchedule({ start_at: '2026-05-01 00:00:00', end_at: '2026-07-01 00:00:00' }, now), true);
    assert.equal(forCountry([{ status: 'draft', targeting: {} }, { status: 'live', targeting: {} }], 'US').length, 1);
  });
  test('casino geo rule matches /geo/check inference', () => {
    assert.equal(casinoAllowed([], 'US'), false);
    assert.equal(casinoAllowed([{ country_code: 'US', status: 'allowed' }], 'US'), true);
    assert.equal(casinoAllowed([{ country_code: 'GB', status: 'allowed' }], 'US'), false);
    assert.equal(casinoAllowed([{ country_code: 'GB', status: 'blocked' }], 'US'), true);
  });
  test('page info from the URL', () => { assert.deepEqual(pageInfo('/en'), { pageType: 'home', slug: '' }); assert.deepEqual(pageInfo('/en/casino/foo'), { pageType: 'casino', slug: 'foo' }); });
});

describe('placement output', () => {
  const mk = (id, anchor, prio, extra = {}) => ({ id, name: 'n' + id, template_key: 'promo_card', placement_mode: 'floating', anchor, priority: prio, style: { max_per_anchor: 2 }, content: { headline: 'h' }, targeting: { devices: ['desktop'] }, cards: [], ...extra });
  test('priority order, data attributes, one container, script only when needed', () => {
    const out = renderLiveBanners([mk(2, 'bottom-right', 20), mk(1, 'bottom-right', 10)]);
    assert.ok(out.overlay.indexOf('data-lb-id="1"') < out.overlay.indexOf('data-lb-id="2"'));
    assert.match(out.overlay, /data-max="2"/); assert.match(out.overlay, /data-hide="tablet mobile"/);
    assert.equal((out.overlay.match(/id="live-banners"/g) || []).length, 1);
    assert.equal(renderLiveBanners([]).overlay, ''); assert.equal(renderLiveBanners([]).count, 0);
  });
  test('inline banners go to their slot, not the overlay', () => {
    const out = renderLiveBanners([mk(3, 'after_header', 1, { placement_mode: 'inline' })]);
    assert.match(out.slots.after_header, /data-lb-id="3"/); assert.ok(!out.overlay.includes('id="live-banners"'));
  });
  test('CSS has mobile rules and reduced-motion off-switch', () => {
    const css = readFileSync(join(ROOT, 'css-src/main/12-live-banners.css'), 'utf8') + readFileSync(join(ROOT, 'css-src/main/13-live-banners-templates.css'), 'utf8');
    assert.match(css, /safe-area-inset/); assert.match(css, /prefers-reduced-motion: reduce/); assert.match(css, /--lb-nav/);
  });
});

describe('stats beacon', () => {
  async function env() { const db = createTestDb(); applyMigrations(db); db._exec(readFileSync(join(ROOT, 'migrations/0016_live_banners.sql'), 'utf8')); const id = await bdb.createBanner(db, validateBanner(base({ status: 'live' })).banner, []); return { DB: db, id }; }
  test('aggregates into one row per banner/day, rejects unknown ids and bad bodies', async () => {
    _resetRate(); const e = await env(); const now = new Date('2026-06-01T10:00:00Z');
    const r = await recordEvents(e, { events: [{ id: e.id, type: 'view' }, { id: e.id, type: 'view' }, { id: e.id, type: 'click' }] }, { clientKey: 'a', now });
    assert.equal(r.status, 200);
    const rows = e.DB._raw.prepare('select * from live_banner_stats').all(); assert.equal(rows.length, 1); assert.equal(rows[0].views, 2); assert.equal(rows[0].clicks, 1);
    await recordEvents(e, { id: e.id, type: 'view' }, { clientKey: 'a', now }); assert.equal(e.DB._raw.prepare('select views v from live_banner_stats').get().v, 3);
    assert.equal((await recordEvents(e, { id: 9999, type: 'view' }, { clientKey: 'a', now })).status, 404);
    assert.equal((await recordEvents(e, { id: e.id, type: 'hack' }, { clientKey: 'a', now })).status, 400);
    assert.equal((await recordEvents(e, null, { clientKey: 'a', now })).status, 400);
  });
  test('rate limit', async () => {
    _resetRate(); const e = await env(); let last;
    for (let i = 0; i < 62; i++) last = await recordEvents(e, { id: e.id, type: 'view' }, { clientKey: 'spam', now: new Date() });
    assert.equal(last.status, 429);
  });
});

describe('structure of the new directories', () => {
  test('files stay under 250 lines, imports resolve', async () => {
    const { readdirSync, existsSync } = await import('node:fs');
    const dirs = ['worker/live-banners', 'static/js/live-banner-admin']; const files = [];
    for (const d of dirs) for (const f of readdirSync(join(ROOT, d))) files.push(join(d, f));
    files.push('worker/database/live-banners.js', 'worker/api/routes/live-banners.js', 'static/js/live-banners.js');
    for (const f of files) {
      const s = readFileSync(join(ROOT, f), 'utf8'); assert.ok(s.split('\n').length <= 250, f);
      if (f.startsWith('static/')) { assert.ok(!/\.innerHTML\s*=|onclick\s*=|insertAdjacentHTML/.test(s), f + ' uses innerHTML/inline handlers'); continue; }
      for (const m of s.matchAll(/from "(\.[^"]+)"/g)) assert.ok(existsSync(join(ROOT, dirname(f), m[1])), `${f} -> ${m[1]}`);
    }
  });
});
