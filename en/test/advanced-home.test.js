// Advanced Homepage: opt-in, geo-aware, escaped, honest. The default homepage must stay exactly as it was.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { renderAdvancedHomePage, advancedHomeIfOn, defaultConfig, cleanConfig, parseAdvancedHome } from '../worker/advanced-home/index.js';
import { cleanUrl, fill, SECTION_TYPES, CUSTOM_TYPES, MAX_CUSTOM, LABEL_KEYS, newCustomSection } from '../worker/advanced-home/schema.js';
import { renderAdvancedHome } from '../worker/advanced-home/render.js';
import { offerTerms } from '../worker/advanced-home/data.js';
import { buildCasinoCards } from '../worker/controllers/casino-cards.js';
import { starterTemplates } from '../worker/advanced-home/templates.js';
const casinoConfig = () => JSON.parse(JSON.stringify(starterTemplates().find((t) => t.id === 'casino').config));

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
    assert.equal(r.config.sections[0].primaryUrl, '');
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
    pickCardsHtml: buildCasinoCards([{ id: 1, slug: 'alpha', name: 'Alpha <script>x</script>', logo: '', rating: 4.6, bonus_title: 'Welcome', bonus_value: '100%' }], null, {}, {}, { 1: { reason: 'Crypto Casinos', terms: ['35x wagering', 'min. deposit 20 EUR'], score: 4.6 } }),
    picks: [{ id: 1, slug: 'alpha', name: 'Alpha <script>x</script>', logo: '', rating: 4.6, bonusTitle: 'Welcome', bonusValue: '100%', terms: ['35x wagering', 'min. deposit 20 EUR'], reason: 'Crypto Casinos' }] };
  const cfg = () => casinoConfig();
  test('everything from the config and database is escaped', () => {
    const c = cfg(); c.sections.find((s) => s.type === 'hero').title = '<img src=x onerror=alert(1)>';
    const { main } = renderAdvancedHome(c, data, { siteName: 'S' });
    assert.ok(!main.includes('<img src=x onerror'));
    assert.ok(!main.includes('<script>x</script>'));
    assert.ok(!main.includes('Crypto <b>'));
  });
  test('top picks reuse the site card: reason, bonus terms, score, one Visit button, then disclosure and View all', () => {
    const { main } = renderAdvancedHome(cfg(), data, {});
    assert.match(main, /class="casino-card" data-casino-slug="alpha"/);
    assert.match(main, /casino-card__reason">Crypto Casinos/); assert.match(main, /35x wagering · min\. deposit 20 EUR/);
    assert.match(main, /casino-card__score"[^>]*><b>4\.6<\/b>/);
    assert.equal((main.match(/class="btn btn--primary" rel|href="\/en\/go\/alpha" class="btn btn--primary"/g) || []).length, 1);
    assert.ok(main.indexOf('id="ah-casino-grid"') < main.indexOf('class="ah-disclosure') && main.indexOf('class="ah-disclosure') < main.indexOf('>View all casinos<'));
    assert.match(main, /Showing casinos available in United Kingdom/);
  });
  test('the site card is unchanged unless extras are passed (nothing else on the site is affected)', () => {
    const list = [{ id: 1, slug: 'a', name: 'A', logo: '', rating: 4, bonus_title: 'T', bonus_value: 'V' }];
    const plain = buildCasinoCards(list, null, {}, {});
    assert.equal(plain, buildCasinoCards(list, null, {}, {}, {})); assert.equal(plain, buildCasinoCards(list, null, {}, {}, undefined));
    for (const cls of ['casino-card__reason', 'casino-card__score', 'casino-card__terms']) assert.ok(!plain.includes(cls));
    const withEx = buildCasinoCards(list, null, {}, {}, { 1: { reason: 'R<b>', terms: ['t'], score: 4 } });
    assert.ok(withEx.includes('R&lt;b&gt;') && !withEx.includes('R<b>'));
    // the extras are only additions: everything the plain card had is still there
    for (const part of ['casino-card__number', 'casino-card__bookmark', 'casino-card__compliance', 'bonus-row__toggle', 'class="btn btn--secondary">Review']) assert.ok(withEx.includes(part), part);
  });
  test('reviews and news reuse the default homepage card markup', () => {
    const d = { ...data, reviews: [{ slug: 'r', title: 'R <i>', casino_name: 'C', casino_logo: '', rating: 4 }], news: [{ slug: 'n', title: 'N', excerpt: 'x', created_at: '2026-01-02' }] };
    const { main } = renderAdvancedHome(cfg(), d, {});
    assert.match(main, /<div class="casino-card">[^]*?casino-card__name"><a href="\/en\/review\/r">R &lt;i&gt;/); assert.match(main, /<a href="\/en\/news\/n" class="news-card">/);
  });
  test('latest reviews come first and latest news follow, one block under the other, each in two columns', () => {
    const d = { ...data, reviews: [{ slug: 'r', title: 'R', casino_name: 'C', casino_logo: '', rating: 4 }], news: [{ slug: 'n', title: 'N', created_at: '2026-01-02' }] };
    const { main } = renderAdvancedHome(cfg(), d, {});
    const block = main.split('class="ah-rn"')[1];
    assert.ok(block && block.indexOf('casino-grid') < block.indexOf('news-grid'));
    assert.ok(!main.includes('class="ah-two"'));
    const css = read('worker/advanced-home/css.js');
    assert.match(css, /\.ah-rn \.casino-grid,\.ah-rn \.news-grid\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
    assert.match(css, /max-width:760px\)\{\.ah-rn \.casino-grid,\.ah-rn \.news-grid\{grid-template-columns:1fr/);
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
  test('an empty list shows a friendly message, not a blank gap', () => { assert.match(renderAdvancedHome(cfg(), { ...data, picks: [], pickCardsHtml: '' }, {}).main, /No casinos match right now\./); });
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
  const page = (geo, cfg = casinoConfig()) => renderAdvancedHomePage(new Request(`https://level.casino/en?geo=${geo}`), env, cfg);

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
    await env.DB.prepare(`INSERT INTO settings (key,value) VALUES ('advhome_mode','on'),('advhome_config',?)`).bind(JSON.stringify(casinoConfig())).run();
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
    for (const sel of ['.casino-card', '.news-card', '.ah-card']) assert.ok(css.includes('body.dsp-cards ' + sel), sel); // the site cards, plus the new icon cards
    const t = read('templates/pages/home-advanced.html'); assert.ok(read('templates/layout/base.html').includes('{{hh_body_class}}') && !/<html|<body/.test(t));
  });
  test('dark themes stay readable: panels use the theme surface and headings and labels use the theme text colour', () => {
    const css = read('worker/advanced-home/css.js');
    assert.match(css, /body\.dsp-on\{--ah-surface:var\(--sf,var\(--white\)\)\}/);
    assert.match(css, /\.ah-section h2,\.ah-section h3,\.ah-hero h1,\.ah-criteria b,\.ah-faq summary[^{]*\{color:var\(--dark\)\}/);
    assert.ok(!/background:var\(--white\)/.test(css), 'panels must not hard-code white');
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
    const built = new Set(['ahsTplSel', 'ahsTplHint', 'ahsTplGo', 'ahsAddSel', 'ahsAddGo']); // created by the script itself
    for (const m of js.matchAll(/\$\("([^"]+)"\)/g)) assert.ok(ids.has(m[1]) || built.has(m[1]), `missing #${m[1]}`);
    for (const id of ['ahsTpl', 'ahsWording', 'ahsAdd']) assert.ok(ids.has(id), id);
  });
  test('every section has a guide and field hints in the admin script', () => {
    const js = read('static/js/advanced-home-admin.js');
    for (const t of SECTION_TYPES) assert.match(js, new RegExp(`\\b${t}: \\{ guide:`), t);
  });
});


describe('Advanced Homepage is fully manageable: nothing is built into the code', () => {
  const noop = { casinoCount: 0, categories: [{ name: 'Crypto', slug: 'crypto' }], countries: [], payments: [], reviews: [], news: [], country: '', countryName: '', picks: [], pickCardsHtml: '' };
  const tpl = (id) => JSON.parse(JSON.stringify(starterTemplates().find((t) => t.id === id).config));

  test('the shipped default is neutral: no casino wording, no hardcoded FAQ, links or criteria', () => {
    const d = JSON.stringify(defaultConfig());
    for (const needle of ['casino', 'Casino', 'gambl', 'Gambl', 'GAMSTOP', 'BetBlocker', 'wagering requirement', '/en/casino', '18+']) assert.ok(!d.includes(needle) || /wagering"|\{value\}x wagering/.test(needle), `default contains ${needle}`);
    const sec = (t) => defaultConfig().sections.find((s) => s.type === t);
    assert.deepEqual(sec('faq').items, []); assert.deepEqual(sec('how_we_rate').criteria, []); assert.deepEqual(sec('trust').links, []); assert.equal(sec('trust').ageBadge, '');
  });
  test('a neutral page renders no casino text, no empty headings and no stray sections', () => {
    const c = cleanConfig(defaultConfig()).config;
    const { main, newsletter } = renderAdvancedHome(c, noop, { siteName: 'Acme' });
    const html = (main + newsletter).replace(/<style>[^]*?<\/style>/g, '');
    assert.ok(!/casino|Casino|18\+|Read review|Frequently|GAMSTOP/.test(html), 'no built-in wording');
    assert.ok(!/<h[23]><\/h[23]>/.test(main), 'no empty headings');
    for (const t of ['how_we_rate', 'faq', 'trust', 'seo_prose', 'top_picks']) assert.ok(!main.includes(`data-ah-section="${t}"`) || t === 'top_picks', t);
    assert.equal(newsletter, '');
  });
  test('every starter template passes the same validation as a save and still has all 11 built-in sections', () => {
    const list = starterTemplates(); assert.deepEqual(list.map((t) => t.id), ['casino', 'sportsbook', 'publisher', 'blank']);
    for (const t of list) { const r = cleanConfig(t.config); assert.deepEqual(r.errors, [], t.id); assert.deepEqual(r.config.sections.filter((s) => !s.id).map((s) => s.type).sort(), [...SECTION_TYPES].sort()); assert.ok(t.label && t.description, t.id); }
  });
  test('the casino template carries the content that used to be hardcoded, and it renders', () => {
    const c = tpl('casino'); const { main } = renderAdvancedHome(c, { ...noop, casinoCount: 5 }, { siteName: 'S' });
    assert.match(main, /Frequently asked questions/); assert.match(main, /GAMSTOP/); assert.match(main, /aria-label="18\+"/); assert.match(main, /🎲|₿/);
  });
  test('wording is editable: chip labels, geo line, empty message, review button, offer terms and icons', () => {
    const c = tpl('blank'); c.options.labels = { ...c.options.labels, categories: 'Kinds', geoNote: 'Offers in {country}', emptyText: 'Nada for {country}', readReview: 'Open', wagering: 'WR {value}x', minDeposit: 'from {value}{currency}', maxBonus: '' };
    c.options.defaultIcon = '🧩'; c.options.iconRules = [{ match: 'crypto, coin', icon: '🪙' }];
    const cc = cleanConfig(c).config; const { main } = renderAdvancedHome(cc, { ...noop, countryName: 'France', country: 'FR', reviews: [{ slug: 'r', title: 'T', rating: 4 }] }, {});
    assert.match(main, />Kinds</); assert.match(main, /Offers in France/); assert.match(main, /Nada for France/); assert.match(main, />Open</); assert.match(main, /🪙/);
    assert.deepEqual(offerTerms({ wagering_multiplier: 20, min_deposit: 10, max_bonus: 99, currency: 'EUR' }, '', cc.options.labels), ['WR 20x', 'from 10EUR']);
    assert.match(renderAdvancedHome(cc, { ...noop, categories: [{ name: 'Other', slug: 'o' }] }, {}).main, />Kinds</);
  });
  test('a homepage saved before wording was editable keeps exactly its old wording and icons', () => {
    const legacy = { sections: [{ type: 'hero', title: 'T' }] };
    const p = parseAdvancedHome({ advhome_mode: 'on', advhome_config: JSON.stringify(legacy) });
    assert.equal(p.config.options.labels.geoNote, 'Showing casinos available in {country}'); assert.equal(p.config.options.defaultIcon, '🎲'); assert.ok(p.config.options.iconRules.length > 5);
    assert.equal(cleanConfig({ sections: [{ type: 'trust', showAge: true }] }).config.sections.find((s) => s.type === 'trust').ageBadge, '18+');
  });
  test('custom sections: added, escaped, validated, uniquely identified and capped', () => {
    const c = tpl('blank');
    const ids = ['text_block', 'link_cards', 'text_block'].map((type) => ({ ...newCustomSection(type), id: 'custom-dup1' }));
    ids[0].title = '<b>Hi</b>'; ids[0].body = 'One\n\n## Two\n\nThree'; ids[0].buttonLabel = 'Go'; ids[0].buttonUrl = '/en/x';
    ids[1].title = 'Cards'; ids[1].items = [{ title: 'A', text: 't', url: '/en/a', icon: '🔥' }, { title: 'Bad', url: 'javascript:alert(1)' }, { title: '', url: '/en/z' }];
    c.sections.push(...ids);
    const r = cleanConfig(c); const custom = r.config.sections.filter((s) => s.id);
    assert.equal(custom.length, 3); assert.equal(new Set(custom.map((s) => s.id)).size, 3, 'ids are unique'); assert.ok(r.errors.some((m) => /not valid/.test(m)));
    assert.equal(custom[1].items.length, 1);
    const { main } = renderAdvancedHome(r.config, noop, {});
    assert.ok(main.includes('&lt;b&gt;Hi&lt;/b&gt;') && !main.includes('<b>Hi</b>')); assert.match(main, /<h3>Two<\/h3>/); assert.match(main, /id="ah-custom-dup1"/); assert.match(main, /href="\/en\/a"/); assert.ok(!main.includes('javascript:'));
    const many = tpl('blank'); for (let i = 0; i < 12; i++) many.sections.push(newCustomSection('text_block'));
    const capped = cleanConfig(many); assert.equal(capped.config.sections.filter((s) => s.id).length, MAX_CUSTOM); assert.ok(capped.errors.some((m) => /up to 8/.test(m)));
  });
  test('built-in sections stay unique; custom ones can be reordered with them', () => {
    const c = tpl('blank'); c.sections.push({ type: 'hero', title: 'Second' }); c.sections.unshift({ ...newCustomSection('text_block'), title: 'First', body: 'x' });
    const r = cleanConfig(c).config; assert.equal(r.sections[0].title, 'First'); assert.equal(r.sections.filter((s) => s.type === 'hero').length, 1);
  });
  test('the admin script exposes templates, wording and custom sections, and the API sends them', () => {
    const js = read('static/js/advanced-home-admin.js'); const api = read('worker/api/routes/advanced-home.js');
    for (const t of CUSTOM_TYPES) assert.match(js, new RegExp(`\\b${t}: \\{ guide:`), t);
    for (const k of ['templates', 'labelDefaults', 'customDefaults', 'maxCustom']) { assert.match(api, new RegExp(k)); assert.match(js, new RegExp(k)); }
    for (const k of LABEL_KEYS) assert.match(js, new RegExp(`\\["${k}",`), `wording field ${k}`);
  });
  test('no visitor-facing wording is hardcoded in the renderer or the data loader', () => {
    const r = read('worker/advanced-home/render.js') + read('worker/advanced-home/data.js');
    for (const needle of ['Showing casinos', 'No casinos match', 'Read review', 'Email address', 'your location', 'x wagering', 'min. deposit', 'max. bonus', '"18+"', 'Read more', '🎲']) assert.ok(!r.includes(needle), needle);
  });
});
