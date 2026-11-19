// Advanced Homepage Themes: a dedicated library that only restyles the Advanced Homepage content and never touches the other themes.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { renderAdvancedHomePage, defaultConfig, cleanConfig } from '../worker/advanced-home/index.js';
import { ADVANCED_THEMES, THEME_IDS } from '../worker/advanced-home/themes.js';
import { themeCss, themeClass } from '../worker/advanced-home/theme-css.js';
import { SKIN_IDS, skinCss } from '../worker/advanced-home/theme-skins.js';
import { THEMES } from '../worker/studio-pro/themes.js';
import { starterTemplates } from '../worker/advanced-home/templates.js';
const casinoConfig = () => JSON.parse(JSON.stringify(starterTemplates().find((t) => t.id === 'casino').config));

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf-8');
const ch = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = (h) => { const n = parseInt(h.slice(1), 16); return 0.2126 * ch(n >> 16) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255); };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

describe('the library', () => {
  test('twelve themes with unique ids, real colours and a known skin', () => {
    assert.equal(ADVANCED_THEMES.length, 12); assert.equal(new Set(THEME_IDS).size, 12);
    for (const t of ADVANCED_THEMES) {
      assert.match(t.id, /^[a-z]+(-[a-z]+)*$/, t.id); assert.ok(SKIN_IDS.includes(t.skin), t.id);
      for (const [k, v] of Object.entries(t.pal)) assert.match(v, /^#[0-9a-f]{6}$/i, `${t.id} ${k}`);
      assert.ok(t.label && t.category && t.style && t.desc);
    }
    assert.equal(new Set(ADVANCED_THEMES.map((t) => t.skin)).size, 12);
    const dark = ADVANCED_THEMES.filter((t) => t.dark).length; assert.ok(dark >= 4 && dark <= 8, `dark ${dark}`);
  });
  test('colours are readable: text on page and panels, muted text, button text on the accent', () => {
    for (const { id, pal: p } of ADVANCED_THEMES) {
      assert.ok(contrast(p.tx, p.bg) >= 7, `${id} text/page`); assert.ok(contrast(p.tx, p.sf) >= 7, `${id} text/panel`);
      assert.ok(contrast(p.mu, p.bg) >= 4.5, `${id} muted`); assert.ok(contrast(p.btn, p.p) >= 4.5, `${id} button`);
    }
  });
  test('they are NOT in Premium Themes: that library is unchanged and has no skins or Advanced Homepage ids', () => {
    assert.equal(THEMES.length, 32);
    for (const t of THEMES) { assert.equal(t.skin, undefined, t.id); assert.ok(!THEME_IDS.includes(t.id.replace(/^dsp-/, '')), t.id); }
    assert.ok(!/skinCss|theme-skins/.test(read('worker/studio-pro/compose.js'))); assert.ok(!read('worker/studio-pro/themes.js').includes('themes-extra'));
    assert.ok(!existsSync(join(ROOT, 'worker/studio-pro/themes-extra.js')));
  });
});

describe('scoped css', () => {
  test('every rule starts with the theme wrapper, so nothing outside the homepage content can change', () => {
    for (const t of ADVANCED_THEMES) {
      const css = themeCss(t.id), S = `.ahx-${t.id}`;
      assert.equal((css.match(/\{/g) || []).length, (css.match(/\}/g) || []).length, `${t.id} braces`);
      const flat = css.replace(/@media[^{]*\{/g, '').replace(/\}\}/g, '}');
      for (const rule of flat.split('}').map((r) => r.trim()).filter(Boolean)) for (const sel of rule.split('{')[0].split(',')) assert.ok(sel.trim().startsWith(S), `${t.id}: ${sel.trim()}`);
      assert.ok(!/<|javascript:|url\(|@import|:root/i.test(css), `${t.id} leaks`);
      assert.ok(css.includes('--primary:') && css.includes('.section') && css.includes('.ah-section'), t.id);
    }
    assert.equal(themeCss('nope'), ''); assert.equal(themeClass('nope'), ''); assert.equal(skinCss('aurora', ''), '');
  });
  test('skins never restyle cards, so Card Studio keeps control of card looks', () => {
    for (const id of SKIN_IDS) assert.ok(!/\.casino-card|\.news-card|\.rv-card/.test(skinCss(id, '.x')), id);
  });
});

describe('config', () => {
  test('options.theme is validated: only known ids are kept', () => {
    assert.equal(casinoConfig().options.theme, '');
    assert.equal(cleanConfig({ options: { theme: 'gold-vault' } }).config.options.theme, 'gold-vault');
    for (const bad of ['dsp-gold-vault', 'x', 5, null, '<b>']) assert.equal(cleanConfig({ options: { theme: bad } }).config.options.theme, '', String(bad));
  });
});

describe('the public page', () => {
  let env;
  beforeEach(async () => {
    const db = createTestDb(); applyMigrations(db);
    await db.prepare(`INSERT INTO users (id,email,password_hash,role) VALUES (1,'a@t.l','x','admin')`).run();
    await db.prepare(`INSERT INTO casinos (id,name,slug,website_url,affiliate_url,rating,bonus_title,bonus_value,published,status,created_by) VALUES (1,'Alpha','alpha','https://a.example','https://a.example/r',4.6,'Welcome','100%',1,'published',1)`).run();
    await db.prepare(`INSERT INTO geo_rules (casino_slug,country_code,status) VALUES ('alpha','GB','allowed')`).run();
    env = { DB: db, ASSETS: { fetch: async (req) => { const f = join(ROOT, new URL(req.url).pathname); return existsSync(f) ? new Response(readFileSync(f, 'utf8')) : new Response('', { status: 404 }); } } };
  });
  const page = (theme) => { const c = casinoConfig(); if (theme !== undefined) c.options.theme = theme; return renderAdvancedHomePage(new Request('https://level.casino/en?geo=GB'), env, c); };

  test('a theme wraps the Advanced Homepage content only: header and footer stay outside it', async () => {
    const html = await page('gold-vault');
    const start = html.indexOf('<div class="ahx ahx-gold-vault">'); assert.ok(start > 0);
    const end = html.indexOf('</div>', html.lastIndexOf('ah-newsletter') > 0 ? html.lastIndexOf('ah-newsletter') : start);
    const inside = html.slice(start, html.indexOf('<footer', start) > 0 ? html.indexOf('<footer', start) : undefined);
    assert.ok(inside.includes('data-ah-section="top_picks"'));
    assert.ok(html.indexOf('<header') < start, 'site header comes before the wrapper');
    assert.ok(html.indexOf('<footer') > start, 'site footer comes after the wrapper');
    const wrapped = html.slice(start, html.indexOf('<footer'));
    assert.ok(!wrapped.includes('<header') && !wrapped.includes('<footer'));
    assert.ok(html.includes('.ahx-gold-vault{--primary:'));
    assert.ok(end > start);
  });
  test('with no theme the page has no wrapper and no theme css, exactly as before', async () => {
    const none = await page(''); const unset = await page(undefined);
    assert.ok(!none.includes('class="ahx') && !none.includes('--ah-surface:#') && !none.includes('.ahx-'));
    assert.equal(none, unset);
  });
  test('every theme renders a complete page with its own scope', async () => {
    for (const t of ADVANCED_THEMES) { const html = await page(t.id); assert.ok(html.includes(`class="ahx ahx-${t.id}"`) && html.includes('data-ah-section="faq"'), t.id); }
  });
  test('an unknown saved theme is ignored, not an error', async () => { assert.ok(!(await page('does-not-exist')).includes('class="ahx')); });
});

describe('the dashboard tab', () => {
  const page = read('templates/pages/admin/advanced-home-themes.html'), js = read('static/js/advanced-home-themes-admin.js');
  test('it is in the Design Studio Pro menu, reachable and searchable', () => {
    assert.ok(read('templates/layout/admin-nav.html').includes('/en/dashboard/studio-pro/advanced-home-themes'));
    assert.match(read('worker/controllers/dashboard.js'), /lib === "advanced-home-themes"\) return renderAdminPage\(request, env, "admin\/advanced-home-themes\.html"\)/);
    assert.ok(read('worker/site-profile/dashboard-search.js').includes('/en/dashboard/studio-pro/advanced-home-themes'));
    assert.match(read('worker/api/routes/advanced-home.js'), /themes: ADVANCED_THEMES\.map/);
  });
  test('every element id the script uses exists, the preview is sandboxed and the guide starts closed with a Done reading button', () => {
    const ids = new Set([...page.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
    for (const m of js.matchAll(/\$\("([^"]+)"\)/g)) assert.ok(ids.has(m[1]), `missing #${m[1]}`);
    assert.ok(page.includes('sandbox=""')); assert.match(page, /<details class="ahs-guide" id="ahthGuide">/); assert.ok(page.includes('data-guide-close'));
  });
  test('the script escapes everything it writes and never uses unsafe sinks', () => {
    assert.ok(!/eval\(|new Function|document\.write|outerHTML/.test(js));
    assert.ok(js.includes('const esc =') && js.includes('const hex ='));
  });
  test('the main Advanced Homepage editor keeps the theme when it saves, because it sends the whole config', () => {
    assert.ok(!read('static/js/advanced-home-admin.js').includes('options = {'));
  });
});
