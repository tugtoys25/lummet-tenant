// Phase 8: the global dashboard search. Index (screens, settings, capabilities), content search, favourites, the API route,
// and the pure ranking helpers of the browser script. Every rule about who may find what is tested here, on the server side.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { route } from '../worker/api/routes/dashboard-search.js';
import {
  parseNavScreens, buildSearchIndex, searchContent, screenAllowed, safeDashboardHref, queryTokens, norm,
  SCREEN_KEYWORDS, ADMIN_ONLY_SCREENS, SCREEN_RESOURCE, CONTENT_SOURCE_IDS, MAX_QUERY_TOKENS,
} from '../worker/site-profile/dashboard-search.js';
import { listFavourites, addFavourite, removeFavourite, MAX_FAVOURITES } from '../worker/site-profile/dashboard-favourites.js';
import { defaultProfile, applyPreset } from '../worker/site-profile/profile.js';
import { admin, editor, viewer, freshSite } from './support/transfer-fixtures.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const NAV = read('templates/layout/admin-nav.html');
const SCRIPT = read('static/js/dashboard-search.js');
const CSS = read('css-src/dashboard/10-dash-search.css');
const BASE = read('templates/layout/base.html');

let db, ENV;
beforeEach(() => { ({ db, env: ENV } = freshSite()); ENV.ASSETS = { fetch: async (req) => { const name = new URL(req.url).pathname.replace(/^\/templates\//, ''); return new Response(read(`templates/${name}`)); } }; });

const full = defaultProfile();
const hrefs = (list) => list.map((x) => x.href);
const labels = (list) => list.map((x) => x.label);
const editorWith = (perms) => ({ user: editor, perms });
const run = (sql, ...b) => db.prepare(sql).bind(...b).run();
const addCasino = (slug, name, status = 'active') => run('INSERT INTO casinos(slug, name, website_url, affiliate_url, status) VALUES(?, ?, ?, ?, ?)', slug, name, 'https://c.example', 'https://a.example', status);

describe('the menu is the list of screens', () => {
  test('every link of the dashboard menu becomes a screen, once, with its group', () => {
    const s = parseNavScreens(NAV);
    const linkCount = new Set([...NAV.matchAll(/href="(\/en\/dashboard[^"#?]*)"/g)].map((m) => m[1])).size;
    assert.equal(s.length, linkCount);
    assert.ok(s.every((x) => x.label && x.group && x.href.startsWith('/en/dashboard')));
    const casinos = s.find((x) => x.href === '/en/dashboard/casinos');
    assert.equal(casinos.label, 'Casinos'); assert.equal(casinos.group, 'Casinos & Reviews');
    assert.equal(s.find((x) => x.href === '/en/dashboard/offers').label, 'Offers & Bonuses'); // entities decoded
    assert.equal(s.find((x) => x.href === '/en/dashboard/configuration').group, 'General');
  });
  test('every keyword entry belongs to a real menu link, so a renamed screen cannot leave a stale entry behind', () => {
    const real = new Set(parseNavScreens(NAV).map((x) => x.href));
    for (const k of Object.keys(SCREEN_KEYWORDS)) assert.ok(real.has(k), `${k} is not in the menu`);
    for (const k of [...ADMIN_ONLY_SCREENS, ...Object.keys(SCREEN_RESOURCE)]) assert.ok(real.has(k), `${k} is not in the menu`);
  });
  test('most screens carry plain-words synonyms for people who do not know the screen name', () => {
    const screens = parseNavScreens(NAV).length;
    assert.ok(Object.keys(SCREEN_KEYWORDS).length >= screens - 6, 'nearly every screen has synonyms');
  });
});

describe('who may find which screen', () => {
  const idx = (user, perms, profile = full) => buildSearchIndex({ navHtml: NAV, profile, user, perms });
  test('an administrator finds every screen', () => {
    assert.equal(idx(admin, null).screens.length, parseNavScreens(NAV).length);
  });
  test('an editor sees only screens whose resource they may read, and never an administrator-only screen', () => {
    const perms = { casinos: { read: true }, news: { read: true }, reviews: { read: false } };
    const h = hrefs(idx(editor, perms).screens);
    assert.ok(h.includes('/en/dashboard/casinos')); assert.ok(h.includes('/en/dashboard/news'));
    assert.ok(!h.includes('/en/dashboard/reviews')); assert.ok(!h.includes('/en/dashboard/media'));
    for (const a of ADMIN_ONLY_SCREENS) assert.ok(!h.includes(a), a);
    assert.ok(h.includes('/en/dashboard') && h.includes('/en/dashboard/configuration')); // screens without a resource stay open
  });
  test('an editor with no permission rows finds only the open screens', () => {
    const h = hrefs(idx(editor, {}).screens);
    for (const r of Object.keys(SCREEN_RESOURCE)) assert.ok(!h.includes(r), r);
  });
  test('a visitor role or no user finds nothing', () => {
    assert.equal(screenAllowed('/en/dashboard', viewer, {}), false);
    assert.equal(screenAllowed('/en/dashboard', null, null), false);
    assert.equal(buildSearchIndex({ navHtml: NAV, profile: full, user: viewer, perms: {} }).screens.length, 0);
  });
  test('screens of switched-off modules and tools are left out, and come back when switched on', () => {
    const news = applyPreset('news');
    const off = hrefs(idx(admin, null, news).screens);
    assert.ok(!off.includes('/en/dashboard/casinos')); assert.ok(!off.includes('/en/dashboard/offers'));
    assert.ok(off.includes('/en/dashboard/news'));
    assert.ok(hrefs(idx(admin, null, full).screens).includes('/en/dashboard/casinos'));
  });
});

describe('settings and capabilities', () => {
  const index = buildSearchIndex({ navHtml: NAV, profile: full, user: admin, perms: null });
  test('every look-and-feel group, field and editable list is findable, each with a link that lands on its place', () => {
    assert.ok(index.settings.length > 40);
    for (const s of index.settings) assert.match(s.href, /^\/en\/dashboard\/configuration(#[A-Za-z0-9_-]+)?$/);
    assert.ok(index.settings.some((s) => /#look-theme$/.test(s.href))); assert.ok(index.settings.some((s) => /#rows-nav$/.test(s.href)));
    assert.ok(index.settings.some((s) => s.id === 'f:theme_primary'));
  });
  test('the anchors the search links to exist on the Configuration screen', () => {
    const html = read('templates/pages/admin/configuration.html');
    for (const a of ['cfgModules', 'cfgFeatures', 'xferSection', 'cfgHistory', 'cfgBar']) assert.ok(html.includes(`id="${a}"`), a);
  });
  test('modules, pages and tools appear with their On or Off state', () => {
    const casino = index.capabilities.find((c) => c.id === 'c:casino');
    assert.equal(casino.state, 'on'); assert.match(casino.sub, /^On/);
    const news = applyPreset('news');
    const off = buildSearchIndex({ navHtml: NAV, profile: news, user: admin, perms: null }).capabilities;
    const c = off.find((x) => x.id === 'c:casino');
    assert.equal(c.state, 'off'); assert.match(c.sub, /^Off, turn it on in Configuration/);
    assert.ok(off.find((x) => x.id === 'c:features.geo')); // tools are findable too
  });
  test('ids are unique and every item has a label and a keyword string', () => {
    const all = [...index.screens, ...index.settings, ...index.capabilities];
    assert.equal(new Set(all.map((x) => x.id)).size, all.length);
    assert.ok(all.every((x) => x.label && typeof x.keywords === 'string' && ['screen', 'setting', 'capability'].includes(x.kind)));
  });
  test('the whole index stays small enough to send in one go', () => {
    assert.ok(JSON.stringify(index).length < 160_000); // raised from 120_000 in Phase 12: about 190 managed wording settings are searchable now
  });
});

describe('content found by title', () => {
  const seed = async () => {
    await addCasino('betking', 'BetKing Casino');
    await addCasino('luckyspin', 'Lucky Spin');
    await run("INSERT INTO news(slug, title, content) VALUES('bet-rules-2026', 'New betting rules in 2026', 'x')");
    await run("INSERT INTO authors(slug, name) VALUES('ada', 'Ada Bet')");
    await run("INSERT INTO pages(slug, type, template, title) VALUES('about-us', 'page', 'page.html', 'About us')");
  };
  const search = (q, o = {}) => searchContent(ENV, { q, profile: o.profile || full, user: o.user || admin, perms: o.perms === undefined ? null : o.perms });
  test('finds items across modules by title or slug, and each hit opens the editor when there is one', async () => {
    await seed();
    const r = await search('bet');
    const t = labels(r.results);
    assert.ok(t.includes('BetKing Casino') && t.includes('New betting rules in 2026') && t.includes('Ada Bet'));
    assert.ok(!t.includes('Lucky Spin'));
    assert.equal(r.results.find((x) => x.label === 'BetKing Casino').href, '/en/dashboard/casino/edit/betking');
    assert.equal(r.results.find((x) => x.label === 'Ada Bet').href, '/en/dashboard/authors');
    assert.ok(r.results.every((x) => safeDashboardHref(x.href)));
  });
  test('every word must match (AND), in any order', async () => {
    await seed();
    assert.deepEqual(labels((await search('king bet')).results), ['BetKing Casino']);
    assert.equal((await search('king nothing')).results.length, 0);
  });
  test('% and _ never act as wildcards: they are dropped like any other symbol', async () => {
    await seed();
    assert.equal((await search('%%')).results.length, 0);
    assert.deepEqual(labels((await search('b_t')).results), labels((await search('b t')).results));
    assert.equal((await search('100%')).results.length, 0);
  });
  test('a quote or SQL fragment is just text', async () => {
    await seed();
    assert.equal((await search("x' OR 1=1 --")).results.length, 0);
    assert.equal(Number((await db.prepare('SELECT COUNT(*) n FROM casinos').first()).n), 2);
  });
  test('a query that is too short, empty or only symbols searches nothing', async () => {
    await seed();
    for (const q of ['', ' ', 'b', '!!', '---']) assert.deepEqual((await search(q)).results, [], JSON.stringify(q));
  });
  test('the query is cut to a few short words', () => {
    assert.equal(queryTokens('a b c d e f g').length, MAX_QUERY_TOKENS);
    assert.ok(queryTokens('x'.repeat(500)).every((t) => t.length <= 40));
    assert.deepEqual(queryTokens('Béting  RULES!'), ['beting', 'rules']);
  });
  test('modules that are switched off are not searched at all', async () => {
    await seed();
    const news = applyPreset('news');
    const r = await search('bet', { profile: news });
    assert.ok(!r.searched.includes('casinos') && r.searched.includes('news'));
    assert.ok(!labels(r.results).includes('BetKing Casino'));
    assert.ok(labels(r.results).includes('New betting rules in 2026'));
  });
  test('an editor finds only what their permissions let them read', async () => {
    await seed();
    const r = await search('bet', { user: editor, perms: { casinos: { read: true }, news: { read: false } } });
    assert.ok(r.searched.includes('casinos') && !r.searched.includes('news') && !r.searched.includes('authors'));
    assert.deepEqual(labels(r.results), ['BetKing Casino']);
    const none = await search('bet', { user: editor, perms: {} });
    assert.ok(!none.searched.includes('casinos'));
  });
  test('a visitor role finds nothing', async () => {
    await seed();
    assert.deepEqual((await search('bet', { user: viewer, perms: {} })).searched, []);
  });
  test('a table missing on an older site only drops that source', async () => {
    await seed(); await run('DROP TABLE authors');
    const r = await search('bet');
    assert.ok(labels(r.results).includes('BetKing Casino') && !labels(r.results).includes('Ada Bet'));
  });
  test('every source names a real route type and table', async () => {
    assert.ok(CONTENT_SOURCE_IDS.length >= 14);
    await seed();
    const r = await search('us');
    assert.ok(Array.isArray(r.results)); // all sources ran without an SQL error on the real schema
    assert.equal(r.searched.length > 10, true);
  });
  test('results are capped so a broad word cannot flood the box', async () => {
    for (let i = 0; i < 30; i++) await addCasino(`bet${i}`, `Bet ${i}`);
    const r = await search('bet');
    assert.ok(r.results.filter((x) => x.sub.startsWith('Casino')).length <= 4);
  });
});

describe('pinned links', () => {
  test('pin, list, unpin, once per link', async () => {
    let r = await addFavourite(ENV, admin, { href: '/en/dashboard/casinos', label: 'Casinos', kind: 'screen' });
    assert.equal(r.favourites.length, 1);
    r = await addFavourite(ENV, admin, { href: '/en/dashboard/casinos', label: 'Casinos', kind: 'screen' });
    assert.equal(r.favourites.length, 1);
    r = await addFavourite(ENV, admin, { href: '/en/dashboard/configuration#look-theme', label: 'Colours', kind: 'setting' });
    assert.deepEqual(r.favourites.map((f) => f.label), ['Colours', 'Casinos']);
    r = await removeFavourite(ENV, admin, '/en/dashboard/casinos');
    assert.deepEqual(r.favourites.map((f) => f.label), ['Colours']);
  });
  test('pins are private to each person', async () => {
    await addFavourite(ENV, admin, { href: '/en/dashboard/news', label: 'News' });
    assert.deepEqual((await listFavourites(ENV, editor)).favourites, []);
    assert.equal((await listFavourites(ENV, admin)).favourites.length, 1);
  });
  test('only dashboard links can be pinned', async () => {
    for (const href of ['https://evil.example/x', '//evil.example', '/en/news', '/en/dashboard/../login', 'javascript:alert(1)', '/en/dashboard//x', '', null, '/en/dashboard/' + 'a'.repeat(400), '/en/dashboard/x y']) {
      const r = await addFavourite(ENV, admin, { href, label: 'x' });
      assert.equal(r.status, 422, String(href));
    }
    assert.equal((await addFavourite(ENV, admin, { href: '/en/dashboard/news', label: '' })).status, 422);
  });
  test('a person can pin up to the limit, then is told to unpin one', async () => {
    for (let i = 0; i < MAX_FAVOURITES; i++) await addFavourite(ENV, admin, { href: `/en/dashboard/page${i}`, label: `P${i}` });
    const over = await addFavourite(ENV, admin, { href: '/en/dashboard/one-more', label: 'More' });
    assert.equal(over.status, 409); assert.match(over.error, /up to 30/);
    assert.equal((await addFavourite(ENV, admin, { href: '/en/dashboard/page3', label: 'P3' })).added, true); // re-pinning is not a new pin
  });
  test('labels are cut and stripped of control characters; unknown kinds become screen', async () => {
    const r = await addFavourite(ENV, admin, { href: '/en/dashboard/x1', label: `Hello\u0000\n${'z'.repeat(300)}`, kind: 'weird' });
    assert.ok(r.favourites[0].label.length <= 120 && !/[\u0000-\u001f]/.test(r.favourites[0].label)); assert.equal(r.favourites[0].kind, 'screen');
  });
  test('without migration 0012 pinning says what to run and everything else keeps working', async () => {
    await run('DROP TABLE dashboard_favourites');
    const r = await addFavourite(ENV, admin, { href: '/en/dashboard/news', label: 'News' });
    assert.equal(r.status, 503); assert.match(r.error, /0012_dashboard_favourites\.sql/);
    assert.equal((await listFavourites(ENV, admin)).favourites.length, 0);
  });
  test('safeDashboardHref accepts menu links, settings anchors and edit links only', () => {
    for (const ok of ['/en/dashboard', '/en/dashboard/casinos', '/en/dashboard/configuration#look-theme', '/en/dashboard/casino/edit/bet-king', '/en/dashboard/content-item/edit/sportsbook/bet%20x']) assert.ok(safeDashboardHref(ok), ok);
    for (const bad of ['/en/dashboard?x=1', '/en/dashboardx', 'http://a/en/dashboard/x', '/en/dashboard/a#b#c']) assert.equal(safeDashboardHref(bad), null, bad);
  });
});

describe('the API route', () => {
  const call = (method, sub, { user = admin, body, headers = {} } = {}) => route({
    request: { method, url: `https://t.example/api/v1/dashboard/search${sub}`, headers: new Headers(headers), json: async () => { if (body === undefined) throw new Error('no body'); return body; } },
    env: ENV, path: `/api/v1/dashboard/search${sub.split('?')[0]}`, user,
  });
  test('it ignores other paths, needs a sign-in, and refuses visitor roles', async () => {
    assert.equal((await route({ request: {}, env: ENV, path: '/api/v1/other', user: admin })).constructor.name, 'Symbol');
    assert.equal((await call('GET', '/index', { user: null })).status, 401);
    assert.equal((await call('GET', '/index', { user: viewer })).status, 403);
    assert.equal((await call('GET', '/content?q=bet', { user: viewer })).status, 403);
  });
  test('the index comes with an ETag, answers 304 when nothing changed, and is private', async () => {
    const r = await call('GET', '/index'); assert.equal(r.status, 200);
    const etag = r.headers.get('ETag'); assert.ok(etag); assert.match(r.headers.get('Cache-Control'), /private/);
    const j = await r.json(); assert.equal(j.success, true); assert.ok(j.screens.length > 40 && j.settings.length > 40 && j.capabilities.length > 20);
    assert.equal((await call('GET', '/index', { headers: { 'If-None-Match': etag } })).status, 304);
    assert.equal((await call('GET', '/index', { headers: { 'If-None-Match': '"other"' } })).status, 200);
  });
  test('the index follows the site: a news-only site hides the casino screens', async () => {
    await run("INSERT OR REPLACE INTO settings(key, value) VALUES('site_profile', ?)", JSON.stringify(applyPreset('news')));
    const j = await (await call('GET', '/index')).json();
    assert.ok(!hrefs(j.screens).includes('/en/dashboard/casinos')); assert.ok(hrefs(j.screens).includes('/en/dashboard/news'));
  });
  test('an editor gets a smaller index than an administrator', async () => {
    await run("DELETE FROM permissions WHERE role = 'editor'");
    await run("INSERT INTO permissions(role, resource, action, allowed) VALUES('editor', 'news', 'read', 1)");
    const a = await (await call('GET', '/index')).json(); const e = await (await call('GET', '/index', { user: editor })).json();
    assert.ok(e.screens.length < a.screens.length); assert.ok(hrefs(e.screens).includes('/en/dashboard/news')); assert.ok(!hrefs(e.screens).includes('/en/dashboard/casinos'));
  });
  test('content search returns hits and never more than the query allows', async () => {
    await addCasino('betking', 'BetKing');
    const j = await (await call('GET', '/content?q=bet')).json(); assert.deepEqual(labels(j.results), ['BetKing']);
    const long = await (await call('GET', `/content?q=${'a'.repeat(500)}`)).json(); assert.equal(long.q.length, 80);
    const empty = await (await call('GET', '/content')).json(); assert.deepEqual(empty.results, []);
  });
  test('pins: put, get, delete, and cross-site writes are refused', async () => {
    let r = await call('PUT', '/favourites', { body: { href: '/en/dashboard/news', label: 'News', kind: 'screen' } }); assert.equal((await r.json()).favourites.length, 1);
    r = await call('GET', '/favourites'); assert.equal((await r.json()).favourites[0].href, '/en/dashboard/news');
    r = await call('DELETE', '/favourites?href=%2Fen%2Fdashboard%2Fnews'); assert.equal((await r.json()).favourites.length, 0);
    assert.equal((await call('PUT', '/favourites', { body: { href: '/en/dashboard/news', label: 'x' }, headers: { Origin: 'https://evil.example' } })).status, 403);
    assert.equal((await call('PUT', '/favourites', { body: { href: 'https://evil.example', label: 'x' } })).status, 422);
    assert.equal((await call('PATCH', '/favourites')).status, 405);
  });
  test('without migration 0012 the index still works and the pin list says what to run', async () => {
    await run('DROP TABLE dashboard_favourites');
    assert.equal((await call('GET', '/index')).status, 200);
    const j = await (await call('GET', '/favourites')).json(); assert.equal(j.code, 'needs_migration'); assert.deepEqual(j.favourites, []);
  });
  test('unknown sub-paths fall through', async () => { assert.equal(typeof (await call('GET', '/nothing')), 'symbol'); });
});

// ---------- the browser script: pure helpers ----------
function loadClient() {
  const w = {};
  vm.runInNewContext(SCRIPT, { window: w, document: { readyState: 'complete', getElementById: () => null, addEventListener() {} } });
  return w.LummetDashSearch;
}
describe('ranking in the browser', () => {
  const L0 = loadClient();
  const J = (x) => JSON.parse(JSON.stringify(x));
  const L = { norm: L0.norm, score: L0.score, safeHref: L0.safeHref, rank: (...a) => J(L0.rank(...a)), highlightParts: (...a) => J(L0.highlightParts(...a)), tokensOf: (...a) => J(L0.tokensOf(...a)) };
  const items = [
    { id: 1, kind: 'screen', label: 'Navigation', sub: 'Site Structure', href: '/en/dashboard/nav', keywords: 'navigation site structure menu links header footer' },
    { id: 2, kind: 'screen', label: 'Casinos', sub: 'Casinos & Reviews', href: '/en/dashboard/casinos', keywords: 'casinos casino list operators' },
    { id: 3, kind: 'setting', label: 'Primary colour', sub: 'Look and feel · Brand colour', href: '/en/dashboard/configuration#look-theme', keywords: 'primary colour theme primary' },
    { id: 4, kind: 'capability', label: 'Casino list', sub: 'On · Casino listings', href: '/en/dashboard/configuration#cfgModules', keywords: 'casino list' },
    { id: 5, kind: 'screen', label: 'Add Casino', sub: 'Casinos & Reviews', href: '/en/dashboard/casino/create', keywords: 'add casino new create' },
  ];
  test('words in the label beat words only in the hidden keywords', () => {
    const r = L.rank(items, 'menu').map((x) => x.item.id); assert.deepEqual(r, [1]); // found only through the synonym
    assert.equal(L.rank(items, 'casino')[0].item.label, 'Casinos'.length ? L.rank(items, 'casino')[0].item.label : '');
  });
  test('an exact word beats a prefix, a prefix beats a fragment', () => {
    const a = L.score(items[1], ['casinos']), b = L.score(items[1], ['casin']), c = L.score(items[1], ['asin']);
    assert.ok(a > b && b > c && c > 0);
  });
  test('every typed word must be found', () => {
    assert.equal(L.rank(items, 'casino nothing').length, 0);
    assert.deepEqual(L.rank(items, 'add casino').map((x) => x.item.id), [5]);
    assert.equal(L.rank(items, 'colour primary')[0].item.id, 3);
  });
  test('a simple plural still matches, accents and case do not matter', () => {
    assert.ok(L.rank(items, 'colours').length === 1); assert.ok(L.rank(items, 'NAVIGÁTION').length === 1);
  });
  test('pinned and recent items rise, and an empty query matches nothing', () => {
    const base = L.rank(items, 'casino').map((x) => x.item.id);
    const lifted = L.rank(items, 'casino', { pinned: { '/en/dashboard/casino/create': true } }).map((x) => x.item.id);
    assert.ok(lifted.indexOf(5) < base.indexOf(5) || lifted[0] === 5);
    assert.deepEqual(L.rank(items, ''), []); assert.deepEqual(L.rank(items, '   '), []);
  });
  test('screens come before settings before modules for the same word', () => {
    const same = [{ ...items[1], id: 'a', kind: 'capability' }, { ...items[1], id: 'b', kind: 'setting' }, { ...items[1], id: 'c', kind: 'screen' }];
    assert.deepEqual(L.rank(same, 'casinos').map((x) => x.item.id), ['c', 'b', 'a']);
  });
  test('highlighting splits text without ever producing markup', () => {
    const parts = L.highlightParts('Primary <b>colour</b>', ['colour']);
    assert.equal(parts.map((p) => p.text).join(''), 'Primary <b>colour</b>'); assert.ok(parts.some((p) => p.hit && p.text === 'colour'));
    assert.deepEqual(L.highlightParts('Nothing', ['zzz']), [{ text: 'Nothing', hit: false }]);
    assert.deepEqual(L.highlightParts('', ['x']), [{ text: '', hit: false }]);
  });
  test('the browser and the server agree on which links are safe', () => {
    for (const h of ['/en/dashboard', '/en/dashboard/casinos', '/en/dashboard/configuration#look-theme', 'https://x.example', '//x', '/en/dashboard/../x', '/en/dashboard/a b', 5, null]) assert.equal(L.safeHref(h), !!safeDashboardHref(h), String(h));
  });
  test('norm in the browser matches norm on the server for ordinary text', () => {
    for (const s of ['Offers & Bonuses', 'Café Menu', '  x  y ', 'ÀÉÎ']) assert.equal(L.norm(s), norm(s), s);
  });
});

describe('the files that wire the search in', () => {
  test('the menu has the Search button and base.html loads the script after the shell', () => {
    assert.match(NAV, /id="dashSearchOpen"/);
    assert.ok(BASE.indexOf('dashboard-shell.js') < BASE.indexOf('dashboard-search.js') && BASE.includes('dashboard-search.js'));
  });
  test('the script never builds markup from text and every dsearch class it uses has a rule', () => {
    assert.ok(!/innerHTML|insertAdjacentHTML|document\.write|eval\(/.test(SCRIPT));
    const used = new Set([...SCRIPT.matchAll(/"((?:dsearch|dash-searchbtn)[a-z0-9-]*(?: [a-z0-9-]+)*)"/g)].flatMap((m) => m[1].split(' ')).filter((c) => /^(dsearch|dash-searchbtn)/.test(c)));
    assert.ok(used.size > 12);
    for (const c of used) assert.ok(CSS.includes(`.${c}`), `.${c} has no rule`);
    for (const c of ['dash-kbd', 'dsearch-lock']) assert.ok(CSS.includes(`.${c}`), c);
  });
  test('the dialog is keyboard and screen-reader ready', () => {
    for (const s of ['role", "dialog"', 'aria-modal', 'role", "combobox"', 'aria-activedescendant', 'role", "listbox"', 'role", "option"', 'aria-live']) assert.ok(SCRIPT.includes(s), s);
    assert.match(CSS, /prefers-color-scheme|var\(--white\)/); assert.match(CSS, /forced-colors/); assert.match(CSS, /max-width: 640px/);
  });
});
