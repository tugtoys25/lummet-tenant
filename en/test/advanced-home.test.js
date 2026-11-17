// Advanced Homepage: opt-in, geo-aware, escaped, honest. The default homepage must stay exactly as it was.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { renderAdvancedHomePage, advancedHomeIfOn, defaultConfig, cleanConfig, parseAdvancedHome } from '../worker/advanced-home/index.js';
import { cleanUrl, fill, SECTION_TYPES } from '../worker/advanced-home/schema.js';
import { renderAdvancedHome } from '../worker/advanced-home/render.js';
import { offerTerms } from '../worker/advanced-home/data.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf-8');

describe('schema', () => {
  test('the default config is valid, has every section once and keeps the recommended order', () => {
    const { config, errors } = cleanConfig(defaultConfig());
    assert.deepEqual(errors, []);
    assert.deepEqual(config.sections.map((s) => s.type), SECTION_TYPES);
    assert.equal(config.options.heroSource, 'auto'); assert.equal(config.options.builder, false);
  });
  test('junk input falls back to defaults and unknown or duplicate sections are dropped', () => {
    const c = cleanConfig({ sections: [{ type: 'faq' }, { type: 'faq', title: 'dup' }, { type: 'evil' }, 7, null] }).config;
    assert.equal(c.sections.filter((s) => s.type === 'faq').length, 1);
    assert.equal(c.sections[0].type, 'faq'); // order respected
    assert.equal(c.sections.length, SECTION_TYPES.length); // missing ones come back
    assert.deepEqual(cleanConfig('nope').config.sections.map((s) => s.type), SECTION_TYPES);
  });
  test('links accept this site, anchors and https only', () => {
    for (const ok of ['/en/casino', '#ah-faq', 'https://example.com/x', '']) assert.notEqual(cleanUrl(ok), null, ok);
    for (const bad of ['javascript:alert(1)', '//evil.com', 'http://x.com', 'data:text/html,x', '/a b', '/x"onclick=']) assert.equal(cleanUrl(bad), null, bad);
  });
  test('a bad link is reported and the previous value is kept', () => {
    const r = cleanConfig({ sections: [{ type: 'hero', primaryUrl: 'javascript:alert(1)' }] });
    assert.ok(r.errors.some((e) => /primaryUrl/.test(e)));
    assert.equal(r.config.sections[0].primaryUrl, '/en/casino');
  });
  test('numbers are clamped, picks are de-duplicated and capped', () => {
    const c = cleanConfig({ sections: [{ type: 'top_picks', count: 99, minRating: 9, picks: [{ casino_id: 1 }, { casino_id: 1 }, { casino_id: 'x' }, { casino_id: 2, reason: 'Best for crypto' }] }] }).config.sections[0];
    assert.equal(c.count, 12); assert.equal(c.minRating, 5); assert.deepEqual(c.picks.map((p) => p.casino_id), [1, 2]);
  });
  test('tokens are filled and unknown tokens stay visible', () => { assert.equal(fill('{country}: {casino_count} {nope}', { country: 'Kenya', casino_count: 5 }), 'Kenya: 5 {nope}'); });
  test('a missing mode means off', () => { assert.equal(parseAdvancedHome({}).mode, 'off'); assert.equal(parseAdvancedHome({ advhome_mode: 'on' }).mode, 'on'); assert.equal(parseAdvancedHome({ advhome_mode: 'x' }).mode, 'off'); });
});

describe('rendering', () => {
  const data = { casinoCount: 3, country: 'GB', countryName: 'United Kingdom', categories: [{ name: 'Crypto <b>Casinos</b>', slug: 'crypto' }], countries: [{ code: 'GB', name: 'United Kingdom' }], payments: [{ name: 'Visa', slug: 'visa' }], reviews: [], news: [],
    picks: [{ id: 1, slug: 'alpha', name: 'Alpha <script>x</script>', logo: '', rating: 4.6, bonusTitle: 'Welcome', bonusValue: '100%', terms: ['35x wagering', 'min. deposit 20 EUR'], reason: 'Crypto Casinos' }] };
  const cfg = () => cleanConfig(defaultConfig()).config;
  test('everything from the config and database is escaped', () => {
    const c = cfg(); c.sections.find((s) => s.type === 'hero').title = '<img src=x onerror=alert(1)>';
    const { main } = renderAdvancedHome(c, data, { siteName: 'S' });
    assert.ok(!main.includes('<img src=x onerror'));
    assert.ok(!main.includes('<script>x</script>'));
    assert.ok(!main.includes('Crypto <b>'));
  });
  test('top picks show reason, bonus with terms, score, one Visit button and the disclosure under the list', () => {
    const { main } = renderAdvancedHome(cfg(), data, {});
    assert.match(main, /ah-reason">Crypto Casinos/); assert.match(main, /35x wagering · min\. deposit 20 EUR/);
    assert.match(main, /<b>4\.6<\/b>/); assert.equal((main.match(/class="btn btn--primary" href="\/en\/go\/alpha"/g) || []).length, 1);
    assert.match(main, /rel="nofollow sponsored"/);
    assert.ok(main.indexOf('ah-picks') < main.indexOf('ah-disclosure') && main.indexOf('ah-disclosure') < main.indexOf('View all casinos'));
    assert.match(main, /Showing casinos available in United Kingdom/);
  });
  test('the FAQ is sent as FAQPage structured data and cannot break out of the script tag', () => {
    const c = cfg(); c.sections.find((s) => s.type === 'faq').items = [{ q: 'Q</script><b>', a: 'A' }];
    const { main } = renderAdvancedHome(c, data, {});
    const m = main.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
    assert.ok(m); const ld = JSON.parse(m[1]); assert.equal(ld['@type'], 'FAQPage'); assert.equal(ld.mainEntity[0].name, 'Q</script><b>');
    assert.ok(!m[1].includes('</script'));
  });
  test('rating weights are hidden until the owner confirms them, so no invented numbers appear', () => {
    const c = cfg(); assert.ok(!/ah-criteria[^]*?\d+%/.test(renderAdvancedHome(c, data, {}).main.split('id="ah-how_we_rate"')[1].split('</section>')[0]));
    const s = c.sections.find((x) => x.type === 'how_we_rate'); s.weightsConfirmed = true; s.criteria[0].weight = 25;
    assert.match(renderAdvancedHome(c, data, {}).main, /<span>25%<\/span>/);
  });
  test('the methodology link is omitted while its address is empty', () => { assert.ok(!/Read our methodology/.test(renderAdvancedHome(cfg(), data, {}).main)); });
  test('the newsletter is returned separately, uses the site form class, and disabled sections are not rendered', () => {
    const c = cfg(); c.sections.find((s) => s.type === 'payments').enabled = false;
    const out = renderAdvancedHome(c, data, {});
    assert.match(out.newsletter, /class="newsletter-form"/); assert.ok(!out.main.includes('id="ah-payments"'));
  });
  test('the site hero option hides the built-in hero so the page has one H1', () => {
    assert.ok(!renderAdvancedHome(cfg(), data, { siteHero: true }).main.includes('<h1>'));
    assert.equal((renderAdvancedHome(cfg(), data, {}).main.match(/<h1>/g) || []).length, 1);
  });
  test('hero source: bad values fall back to automatic and the old siteHero flag still means the site hero', () => {
    assert.equal(cleanConfig({ options: { heroSource: 'x' } }).config.options.heroSource, 'auto');
    assert.equal(cleanConfig({ options: { siteHero: true } }).config.options.heroSource, 'site');
    assert.equal(cleanConfig({ options: { heroSource: 'own' } }).config.options.heroSource, 'own');
  });
  test('an empty list shows a friendly message, not a blank gap', () => { assert.match(renderAdvancedHome(cfg(), { ...data, picks: [] }, {}).main, /No casinos match right now for United Kingdom/); });
  test('offer terms are built from the offer and the manual note', () => {
    assert.deepEqual(offerTerms({ wagering_multiplier: 35, min_deposit: 20, max_bonus: 500, currency: 'EUR' }, 'New players'), ['35x wagering', 'min. deposit 20 EUR', 'max. bonus 500 EUR', 'New players']);
    assert.deepEqual(offerTerms(null, ''), []);
  });
});

describe('page behaviour with a database', () => {
  let env;
  beforeEach(async () => {
    const db = createTestDb(); applyMigrations(db);
    await db.prepare(`INSERT INTO users (id,email,password_hash,role) VALUES (1,'a@t.l','x','admin')`).run();
    await db.prepare(`INSERT INTO casinos (id,name,slug,website_url,affiliate_url,rating,bonus_title,bonus_value,published,status,created_by) VALUES (1,'Alpha','alpha','https://a.example','https://a.example/r',4.6,'Welcome','100% up to 500',1,'published',1),(2,'Beta','beta','https://b.example','https://b.example/r',3.2,'','',1,'published',1),(3,'Gamma','gamma','https://g.example','https://g.example/r',4.9,'Bonus','50 spins',1,'published',1)`).run();
    await db.prepare(`INSERT INTO geo_rules (casino_slug,country_code,status) VALUES ('alpha','GB','allowed'),('beta','GB','allowed'),('gamma','DE','allowed')`).run();
    env = { DB: db, ASSETS: { fetch: async (req) => { const f = join(ROOT, new URL(req.url).pathname); return existsSync(f) ? new Response(readFileSync(f, 'utf8')) : new Response('', { status: 404 }); } } };
  });
  const page = (geo, cfg = cleanConfig(defaultConfig()).config) => renderAdvancedHomePage(new Request(`https://level.casino/en?geo=${geo}`), env, cfg);

  test('geo rules decide which casinos are listed, and casinos without a bonus are skipped', async () => {
    const gb = await page('GB'); assert.ok(gb.includes('Alpha')); assert.ok(!gb.includes('Gamma')); assert.ok(!gb.includes('>Beta<'));
    const de = await page('DE'); assert.ok(de.includes('Gamma')); assert.ok(!de.includes('Alpha'));
  });
  test('manual picks keep your order and still respect geo rules', async () => {
    const cfg = cleanConfig({ sections: [{ type: 'top_picks', mode: 'manual', picks: [{ casino_id: 2, reason: 'Best for crypto' }, { casino_id: 1 }, { casino_id: 3 }] }] }).config;
    const html = await page('GB', cfg);
    assert.ok(html.indexOf('>Beta<') < html.indexOf('>Alpha<')); assert.ok(html.includes('Best for crypto')); assert.ok(!html.includes('Gamma'));
  });
  test('it is off unless the mode is on, and a failure falls back to the default homepage', async () => {
    const req = new Request('https://level.casino/en?geo=GB');
    assert.equal(await advancedHomeIfOn(req, env), null);
    await env.DB.prepare(`INSERT INTO settings (key,value) VALUES ('advhome_mode','on')`).run();
    const withDefaults = await advancedHomeIfOn(req, env); // on, never saved: recommended defaults render
    assert.ok(withDefaults && withDefaults.includes('data-ah-section="top_picks"'));
  });
  test('turned on with a saved config it renders the advanced page', async () => {
    await env.DB.prepare(`INSERT INTO settings (key,value) VALUES ('advhome_mode','on'),('advhome_config',?)`).bind(JSON.stringify(defaultConfig())).run();
    const html = await advancedHomeIfOn(new Request('https://level.casino/en?geo=GB'), env);
    assert.ok(html && html.includes('data-ah-section="top_picks"'));
    const broken = { ...env, ASSETS: { fetch: async () => new Response('', { status: 500 }) } };
    assert.equal(await advancedHomeIfOn(new Request('https://level.casino/en?geo=GB'), broken), null);
  });
  test('the site hero (Header & Hero, restyled by Hero Studio) is used automatically when the site has one', async () => {
    const auto = await page('GB'); const own = await page('GB', cleanConfig({ options: { heroSource: 'own' } }).config);
    assert.ok(auto.includes('id="siteHero"') && !auto.includes('class="ah-hero')); // hero is on by default in Header & Hero
    assert.ok(own.includes('class="ah-hero') && !own.includes('id="siteHero"'));
    await env.DB.prepare(`INSERT INTO settings (key,value) VALUES ('site_hero_enabled','false')`).run();
    const off = await page('GB'); assert.ok(off.includes('class="ah-hero') && !off.includes('id="siteHero"')); // no site hero: the section hero fills in
  });
  test('Card Studio styles reach the new cards, and the studio theme/header variables come from the shared renderer', async () => {
    const { cardsCss } = await import('../worker/studio-pro/cards.js');
    const css = cardsCss({ id: 'dark-premium', custom: {} });
    for (const sel of ['.ah-pick', '.ah-card', '.ah-item']) assert.ok(css.includes('body.dsp-cards ' + sel), sel);
    assert.ok(css.includes('.ah-pick .btn--primary'));
    const t = read('templates/pages/home-advanced.html'); assert.ok(read('templates/layout/base.html').includes('{{hh_body_class}}') && !/<html|<body/.test(t));
  });
  test('the page keeps the site banner and component slots', async () => {
    const t = read('templates/pages/home-advanced.html');
    for (const slot of ['components_top', 'components_content_top', 'components_content_bottom', 'components_bottom']) assert.ok(t.includes(slot), slot);
  });
});

describe('the default homepage and the dashboard wiring', () => {
  test('the default homepage template is untouched and the controller only gains an early, null-safe hook', () => {
    const home = read('worker/controllers/home.js');
    assert.match(home, /const advancedHtml = await advancedHomeIfOn\(request, env\);\s*if \(advancedHtml\) return advancedHtml;/);
    assert.ok(read('templates/pages/home.html').includes('{{{hh_hero_html}}}'));
  });
  test('the studio page, its script, the API route and the nav link exist', () => {
    assert.ok(read('templates/layout/admin-nav.html').includes('/en/dashboard/studio-pro/advanced-home'));
    assert.match(read('worker/api/routes/index.js'), /advancedHome,\s*\n\s*studioPro/);
    const page = read('templates/pages/admin/advanced-home.html');
    for (const id of ['ahsList', 'ahsFrame', 'ahsCountry', 'ahsSave', 'ahsMode', 'ahsUndo', 'ahsReset', 'ahsGuide']) assert.ok(page.includes(`id="${id}"`), id);
    assert.ok(page.includes('sandbox=""'));
  });
  test('every element id the admin script looks up exists on the page', () => {
    const page = read('templates/pages/admin/advanced-home.html'); const js = read('static/js/advanced-home-admin.js');
    const ids = new Set([...page.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
    for (const m of js.matchAll(/\$\("([^"]+)"\)/g)) assert.ok(ids.has(m[1]), `missing #${m[1]}`);
  });
  test('every section has a guide and field hints in the admin script', () => {
    const js = read('static/js/advanced-home-admin.js');
    for (const t of SECTION_TYPES) assert.match(js, new RegExp(`\\b${t}: \\{ guide:`), t);
  });
});
