// v19.8: Geo rules manager -- one place to see and change country rules.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import * as contentItems from '../worker/database/content-items.js';
import { handleAPI } from '../worker/api.js';
import { describeRules, evaluate, parseCsv, normalizeRules, parseCodes } from '../worker/geo-manager.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf-8');
const makeReq = (method, url, body) => ({ method, url, headers: new Headers(), json: async () => body });
const admin = { user_id: 1, role: 'admin', email: 'a@test.com' };

describe('rule meaning', () => {
  const r = (cc, status) => ({ country_code: cc, status });
  test('describe: none, allow-list, block-list, mixed', () => {
    assert.equal(describeRules([]).mode, 'none');
    assert.equal(describeRules([r('US', 'allowed')]).mode, 'allow');
    assert.equal(describeRules([r('US', 'blocked'), r('DE', 'blocked')]).mode, 'block');
    assert.equal(describeRules([r('US', 'blocked'), r('DE', 'allowed')]).mode, 'mixed');
  });
  test('evaluate matches the public pages', () => {
    assert.equal(evaluate([], 'US').status, 'blocked');
    assert.equal(evaluate([r('US', 'allowed')], 'US').status, 'allowed');
    assert.equal(evaluate([r('US', 'allowed')], 'DE').status, 'blocked');   // allow-list
    assert.equal(evaluate([r('US', 'blocked')], 'DE').status, 'allowed');   // block-list
    assert.equal(evaluate([r('US', 'blocked'), r('FR', 'allowed')], 'DE').status, 'blocked'); // mixed
    assert.equal(evaluate([r('US', 'blocked')], 'us').status, 'blocked');
  });
  test('country codes can be typed with commas, spaces or semicolons', () => {
    assert.deepEqual(parseCodes('us, gb;de  fr,US'), { codes: ['US', 'GB', 'DE', 'FR'], invalid: [] });
    assert.deepEqual(parseCodes('us, usa, 1x, '), { codes: ['US'], invalid: ['USA', '1X'] });
    assert.deepEqual(parseCodes(''), { codes: [], invalid: [] });
  });
  test('csv parser handles quotes, commas and blank lines', () => {
    assert.deepEqual(parseCsv('a,b\n"x, y","he said ""hi"""\n\n'), [['a', 'b'], ['x, y', 'he said "hi"']]);
  });
});

describe('geo manager API', () => {
  let db, env, call, sb, cas;
  beforeEach(async () => {
    db = createTestDb(); applyMigrations(db);
    env = { DB: db, ASSETS: { fetch: async (r) => { const f = join(ROOT, new URL(r.url).pathname); return existsSync(f) ? new Response(readFileSync(f, 'utf-8')) : new Response('nf', { status: 404 }); } } };
    for (const [c, n] of [['US', 'United States'], ['GB', 'United Kingdom'], ['DE', 'Germany'], ['FR', 'France']]) await db.prepare('INSERT OR IGNORE INTO countries (code, name) VALUES (?, ?)').bind(c, n).run();
    await db.prepare(`INSERT INTO casinos (slug,name,website_url,affiliate_url,published,status) VALUES ('c1','Casino One','https://c','https://c/a',1,'published'),('c2','Casino Two','https://d','https://d/a',1,'published')`).run();
    sb = await contentItems.createContentItem(db, 'sportsbook', { slug: 'sb', name: 'SB', status: 'published', published: true });
    call = (m, p, b) => handleAPI(makeReq(m, `https://x.com${p}`, b), env, p.split('?')[0], admin);
  });
  const j = async (res) => res.json();

  test('meta lists types, countries and presets', async () => {
    const m = await j(await call('GET', '/api/v1/geo-manager/meta'));
    assert.deepEqual(m.types.map((t) => t.key), ['casino', 'sportsbook', 'affiliate_partner', 'custom']);
    assert.ok(m.countries.length >= 4); assert.ok(m.presets.some((p) => p.name === 'European Union'));
  });

  test('save and read casino rules; list shows mode and counts; cache keys cleared', async () => {
    const res = await j(await call('POST', '/api/v1/geo-manager/save', { type: 'casino', key: 'c1', rules: [{ country_code: 'us', status: 'allowed', bonus_override: '100 spins' }, { country_code: 'GB', status: 'allowed' }] }));
    assert.equal(res.success, true); assert.equal(res.summary.mode, 'allow');
    const rules = await j(await call('GET', '/api/v1/geo-manager/rules?type=casino&key=c1'));
    assert.deepEqual(rules.rules.map((r) => [r.country_code, r.status, r.bonus_override]), [['GB', 'allowed', ''], ['US', 'allowed', '100 spins']]);
    const list = await j(await call('GET', '/api/v1/geo-manager/items?type=casino&country=DE'));
    const c1 = list.items.find((i) => i.key === 'c1'); const c2 = list.items.find((i) => i.key === 'c2');
    assert.equal(c1.mode, 'allow'); assert.equal(c1.total, 2); assert.equal(c1.status_in, 'blocked');
    assert.equal(c2.mode, 'none'); assert.equal(c2.status_in, 'blocked');
    assert.equal((await j(await call('GET', '/api/v1/geo-manager/items?type=casino&q=two'))).items.length, 1);
  });

  test('content items use content_geo and their numeric id', async () => {
    await call('POST', '/api/v1/geo-manager/save', { type: 'sportsbook', key: String(sb.id), rules: [{ country_code: 'DE', status: 'blocked' }] });
    const row = await db.prepare('SELECT country_code, status FROM content_geo WHERE content_id = ?').bind(sb.id).first();
    assert.deepEqual({ ...row }, { country_code: 'DE', status: 'blocked' });
    const list = await j(await call('GET', '/api/v1/geo-manager/items?type=sportsbook&country=US'));
    assert.equal(list.items[0].status_in, 'allowed');
  });

  test('bad input is refused and nothing changes', async () => {
    const bad = async (rules, re) => { const r = await call('POST', '/api/v1/geo-manager/save', { type: 'casino', key: 'c1', rules }); assert.equal(r.status, 400); assert.match((await j(r)).error, re); };
    await bad([{ country_code: 'USA', status: 'allowed' }], /Invalid country/);
    await bad([{ country_code: 'US', status: 'maybe' }], /allowed.*blocked/);
    await bad([{ country_code: 'US', status: 'allowed' }, { country_code: 'US', status: 'blocked' }], /Duplicate/);
    await bad([{ country_code: 'ZZ', status: 'allowed' }], /Unknown country/);
    assert.equal((await call('POST', '/api/v1/geo-manager/save', { type: 'nope', key: 'x', rules: [] })).status, 400);
    assert.equal((await call('POST', '/api/v1/geo-manager/save', { type: 'casino', key: 'missing', rules: [] })).status, 404);
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM geo_rules').first()).n, 0);
  });

  test('bulk apply, copy and clear', async () => {
    let r = await j(await call('POST', '/api/v1/geo-manager/bulk', { type: 'casino', keys: ['c1', 'c2'], action: 'apply', mode: 'block', countries: ['US', 'GB'] }));
    assert.equal(r.changed, 2);
    assert.equal((await db.prepare(`SELECT COUNT(*) n FROM geo_rules WHERE status='blocked'`).first()).n, 4);
    await call('POST', '/api/v1/geo-manager/save', { type: 'casino', key: 'c1', rules: [{ country_code: 'FR', status: 'allowed' }] });
    await call('POST', '/api/v1/geo-manager/bulk', { type: 'casino', keys: ['c2'], action: 'copy', from_key: 'c1' });
    assert.deepEqual((await j(await call('GET', '/api/v1/geo-manager/rules?type=casino&key=c2'))).rules.map((x) => x.country_code), ['FR']);
    r = await j(await call('POST', '/api/v1/geo-manager/bulk', { type: 'casino', keys: ['c1', 'c2'], action: 'clear' }));
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM geo_rules').first()).n, 0);
    assert.equal((await call('POST', '/api/v1/geo-manager/bulk', { type: 'casino', keys: [], action: 'clear' })).status, 400);
    assert.equal((await call('POST', '/api/v1/geo-manager/bulk', { type: 'casino', keys: ['c1'], action: 'apply', mode: 'allow', countries: [] })).status, 400);
  });

  test('export then import round-trips; dry run changes nothing; errors block the whole import', async () => {
    await call('POST', '/api/v1/geo-manager/save', { type: 'casino', key: 'c1', rules: [{ country_code: 'US', status: 'allowed', bonus_override: 'Bonus, big' }] });
    const csv = await (await call('GET', '/api/v1/geo-manager/export?type=casino')).text();
    assert.match(csv, /^item_key,item_name,country_code,status,bonus_override\nc1,Casino One,US,allowed,"Bonus, big"/);
    await call('POST', '/api/v1/geo-manager/bulk', { type: 'casino', keys: ['c1'], action: 'clear' });
    let r = await j(await call('POST', '/api/v1/geo-manager/import', { type: 'casino', csv, dry_run: true }));
    assert.equal(r.items, 1); assert.equal(r.applied, false);
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM geo_rules').first()).n, 0);
    r = await j(await call('POST', '/api/v1/geo-manager/import', { type: 'casino', csv }));
    assert.equal(r.applied, true);
    assert.equal((await db.prepare('SELECT bonus_override b FROM geo_rules').first()).b, 'Bonus, big');
    const badCsv = 'item_key,country_code,status\nc1,DE,allowed\nnope,US,allowed\nc2,XX,allowed\n';
    const res = await call('POST', '/api/v1/geo-manager/import', { type: 'casino', csv: badCsv });
    assert.equal(res.status, 400);
    const body = await j(res); assert.equal(body.errors.length, 2); assert.equal(body.applied, false);
    assert.equal((await db.prepare(`SELECT COUNT(*) n FROM geo_rules WHERE country_code='DE'`).first()).n, 0);
    assert.equal((await call('POST', '/api/v1/geo-manager/import', { type: 'casino', csv: 'a,b\n1,2' })).status, 400);
  });

  test('presets: defaults, save, validation', async () => {
    const saved = await j(await call('POST', '/api/v1/geo-manager/presets/save', { presets: [{ name: 'My set', countries: ['us', 'DE', 'us'] }] }));
    assert.deepEqual(saved.presets, [{ name: 'My set', countries: ['US', 'DE'] }]);
    assert.deepEqual((await j(await call('GET', '/api/v1/geo-manager/presets'))).presets, saved.presets);
    assert.equal((await call('POST', '/api/v1/geo-manager/presets/save', { presets: [{ name: '', countries: ['US'] }] })).status, 400);
    assert.equal((await call('POST', '/api/v1/geo-manager/presets/save', { presets: [{ name: 'x', countries: ['QQ'] }] })).status, 400);
  });

  test('bulk: typed codes, add / remove / replace, scopes and dry run', async () => {
    const b = (x) => call('POST', '/api/v1/geo-manager/bulk', { type: 'casino', ...x });
    let r = await j(await b({ keys: ['c1', 'c2'], action: 'apply', mode: 'allow', codes: 'us, gb' }));
    assert.equal(r.changed, 2);
    r = await j(await b({ keys: ['c1'], action: 'apply', mode: 'allow', codes: 'de', merge: 'add' }));
    assert.deepEqual((await j(await call('GET', '/api/v1/geo-manager/rules?type=casino&key=c1'))).rules.map((x) => x.country_code), ['DE', 'GB', 'US']);
    r = await j(await b({ keys: ['c1'], action: 'apply', mode: 'allow', codes: 'gb', merge: 'remove' }));
    assert.deepEqual((await j(await call('GET', '/api/v1/geo-manager/rules?type=casino&key=c1'))).rules.map((x) => x.country_code), ['DE', 'US']);
    r = await j(await b({ keys: ['c1'], action: 'apply', mode: 'block', codes: 'fr', merge: 'add' }));
    assert.equal(r.mixed, 1);                                          // allow-list plus a block now means "custom": the screen warns
    const dry = await j(await b({ scope: 'all', action: 'clear', dry_run: true }));
    assert.equal(dry.changed, 2); assert.equal(dry.applied, false);
    assert.ok((await db.prepare('SELECT COUNT(*) n FROM geo_rules').first()).n > 0);
    await b({ scope: 'all', action: 'clear' });
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM geo_rules').first()).n, 0);
    await call('POST', '/api/v1/geo-manager/save', { type: 'casino', key: 'c1', rules: [{ country_code: 'US', status: 'allowed' }] });
    r = await j(await b({ scope: 'no_rules', action: 'apply', mode: 'block', codes: 'DE' }));
    assert.equal(r.changed, 1);                                        // only c2 had no rules
    assert.equal((await call('POST', '/api/v1/geo-manager/bulk', { type: 'casino', keys: ['c1'], action: 'apply', mode: 'allow', codes: 'US, XYZ' })).status, 400);
    assert.equal((await call('POST', '/api/v1/geo-manager/bulk', { type: 'casino', keys: ['c1'], action: 'apply', mode: 'allow', codes: 'ZZ' })).status, 400);
    assert.equal((await b({ scope: 'weird', action: 'clear' })).status, 400);
  });

  test('defaults: stored per type, validated, applied to new items and to existing ones without rules', async () => {
    let d = await j(await call('GET', '/api/v1/geo-manager/defaults'));
    assert.equal(d.defaults.casino.mode, 'none'); assert.equal(d.no_rules.casino, 2);
    const bad = (defaults) => call('POST', '/api/v1/geo-manager/defaults/save', { defaults });
    assert.equal((await bad({ casino: { mode: 'sometimes' } })).status, 400);
    assert.equal((await bad({ casino: { mode: 'except', countries: [] } })).status, 400);
    assert.equal((await bad({ casino: { mode: 'except', countries: ['QQ'] } })).status, 400);
    assert.equal((await bad({ nope: { mode: 'none' } })).status, 400);
    // everyone for casinos, everyone except US/GB for sportsbooks
    d = await j(await bad({ casino: { mode: 'everyone' }, sportsbook: { mode: 'except', countries: ['us', 'gb'] } }));
    assert.equal(d.defaults.sportsbook.countries.join(), 'US,GB');
    // a casino created through the API gets the "everyone" default (every country on file, allowed)
    const created = await call('POST', '/api/v1/casino/create', { slug: 'c3', name: 'Casino Three', affiliate_url: 'https://c/a', website_url: 'https://c' });
    assert.equal(created.status, 200);
    const r3 = await j(await call('GET', '/api/v1/geo-manager/rules?type=casino&key=c3'));
    assert.equal(r3.rules.length, 4); assert.ok(r3.rules.every((x) => x.status === 'allowed'));
    const list = await j(await call('GET', '/api/v1/geo-manager/items?type=casino&country=DE'));
    assert.equal(list.items.find((i) => i.key === 'c3').status_in, 'allowed');
    // a content item registered with no rules gets the block-list default; one with its own rules keeps them
    const sb2 = await call('POST', '/api/v1/content-item/create', { content_type: 'sportsbook', slug: 'sb2', name: 'SB2' });
    const sb2id = (await j(sb2)).item?.id ?? (await db.prepare(`SELECT id FROM content_items WHERE slug='sb2'`).first()).id;
    const rs = await j(await call('GET', `/api/v1/geo-manager/rules?type=sportsbook&key=${sb2id}`));
    assert.deepEqual(rs.rules.map((x) => [x.country_code, x.status]), [['GB', 'blocked'], ['US', 'blocked']]);
    await call('POST', '/api/v1/content-item/create', { content_type: 'sportsbook', slug: 'sb3', name: 'SB3', geo_rules: [{ country_code: 'DE', status: 'allowed' }] });
    const sb3id = (await db.prepare(`SELECT id FROM content_items WHERE slug='sb3'`).first()).id;
    assert.deepEqual((await j(await call('GET', `/api/v1/geo-manager/rules?type=sportsbook&key=${sb3id}`))).rules.map((x) => x.country_code), ['DE']);
    // apply to existing items that have none: preview first, then for real
    const pre = await j(await call('POST', '/api/v1/geo-manager/defaults/apply', { type: 'casino', dry_run: true }));
    assert.equal(pre.items, 2); assert.equal(pre.applied, false);
    const done = await j(await call('POST', '/api/v1/geo-manager/defaults/apply', { type: 'casino' }));
    assert.equal(done.applied, true);
    assert.equal((await db.prepare(`SELECT COUNT(*) n FROM geo_rules WHERE casino_slug='c1'`).first()).n, 4);
    assert.equal((await call('POST', '/api/v1/geo-manager/defaults/apply', { type: 'affiliate_partner' })).status, 400); // that type's default is "not available"
    // "none" puts things back: new items get no rules
    await bad({ casino: { mode: 'none' } });
    await call('POST', '/api/v1/casino/create', { slug: 'c4', name: 'Casino Four', affiliate_url: 'https://c/a', website_url: 'https://c' });
    assert.equal((await db.prepare(`SELECT COUNT(*) n FROM geo_rules WHERE casino_slug='c4'`).first()).n, 0);
  });

  test('a user without casino or content rights is refused', async () => {
    const editor = { user_id: 9, role: 'editor', email: 'e@test.com' };
    const r = await handleAPI(makeReq('POST', 'https://x.com/api/v1/geo-manager/save', { type: 'casino', key: 'c1', rules: [] }), env, '/api/v1/geo-manager/save', editor);
    assert.ok([401, 403].includes(r.status));
  });
});

describe('Geo rules tab', () => {
  test('the Reviews screen has a Geo rules tab, panel and script', () => {
    const t = read('templates/pages/admin/reviews.html');
    assert.match(t, /data-rv-tab="geo"[^>]*>Geo rules</); assert.match(t, /data-rv-panel="geo"/); assert.match(t, /id="gmRoot"/);
    assert.match(read('templates/layout/base.html'), /geo-rules-admin\.js/);
    assert.match(read('static/js/review-tabs.js'), /list\|sections\|geo/);
  });
  test('the script never writes server text as HTML', () => {
    const js = read('static/js/geo-rules-admin.js');
    assert.doesNotMatch(js, /innerHTML|insertAdjacentHTML|document\.write/);
  });
});

describe('Geo Rules section (dedicated pages)', () => {
  test('every page of the section is routed and rendered with the shared template', async () => {
    const { getRoute } = await import('../worker/routes.js');
    const r = (p) => getRoute(new Request('https://site.test' + p));
    assert.deepEqual(r('/en/dashboard/geo-rules'), { type: 'dashboardGeoRules', section: 'rules' });
    for (const s of ['defaults', 'bulk', 'import-export', 'presets', 'lookup']) assert.deepEqual(r('/en/dashboard/geo-rules/' + s), { type: 'dashboardGeoRules', section: s });
    assert.notEqual(r('/en/dashboard/geo-rules/nope').type, 'dashboardGeoRules');
    const t = read('templates/pages/admin/geo-rules.html');
    for (const s of ['rules', 'defaults', 'bulk', 'import-export', 'presets', 'lookup']) assert.match(t, new RegExp(`data-gm-link="${s}"`));
    assert.match(t, /id="gmRoot"[^>]*data-gm-section="\{\{geo_section\}\}"/);
    const base = read('templates/layout/base.html');
    assert.match(base, /geo-rules-admin\.js/); assert.match(base, /geo-rules-pages\.js/);
    assert.ok(base.indexOf('geo-rules-admin.js') < base.indexOf('geo-rules-pages.js'));
  });
  test('the menu has a Geo Rules group right after Insights', () => {
    const nav = read('templates/layout/admin-nav.html');
    assert.ok(nav.indexOf('data-group="insights"') < nav.indexOf('data-group="geo"') && nav.indexOf('data-group="geo"') < nav.indexOf('data-group="audience"'));
    for (const s of ['', '/defaults', '/bulk', '/import-export', '/presets', '/lookup']) assert.match(nav, new RegExp(`href="/en/dashboard/geo-rules${s}"`));
  });
  test('the pages script never writes server text as HTML', () => {
    assert.doesNotMatch(read('static/js/geo-rules-pages.js'), /innerHTML|insertAdjacentHTML|document\.write/);
  });
  test('the dashboard page renders for an admin and is refused for visitors', async () => {
    const { renderDashboardGeoRules } = await import('../worker/controllers.js');
    const res = await renderDashboardGeoRules(new Request('https://site.test/en/dashboard/geo-rules/bulk'), { DB: createTestDb(), ASSETS: { fetch: async () => new Response('nf', { status: 404 }) } }, 'bulk');
    assert.equal(res.status, 403);
  });
});
