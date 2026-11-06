// test/support/preset-views.js (Phase 11 / T5)
//
// Renders what a visitor or an admin can actually see for one site configuration, using the real code paths:
//   header / footer / mobile menus   Renderer.loadNavData()            (real menu pruning)
//   sitemap index                    sitemapEngine.generateIndex()
//   every sitemap file               gate() then the real sitemap handler
//   robots.txt                       robots()
//   admin sidebar                    pruneAdminNavHtml() on templates/layout/admin-nav.html
//   Overview, Analytics, Reports     pruneCapBlocks() on the three dashboard templates
// into one plain text document per configuration. The document is stored under test/fixtures/preset-snapshots/ and a
// normal test run fails on any difference (UPDATE_SNAPSHOTS=1 rewrites the files).
//
// Nothing here is mocked except storage: the database is the real migrated schema in node:sqlite (see d1-shim.js).
// A passing run says the code and the stored snapshots agree. It does not say the snapshots are what you want:
// read the diff when you update them.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, applyMigrations } from './d1-shim.js';
import { getRoute } from '../../worker/routes.js';
import { PRESETS } from '../../worker/site-profile/registry.js';
import { applyPreset, defaultProfile, gate, pruneAdminNavHtml, pruneCapBlocks } from '../../worker/site-profile/profile.js';
import { saveProfile, invalidateProfile } from '../../worker/site-profile/store.js';
import { syncContentTypes } from '../../worker/site-profile/content-sync.js';
import { capsOf } from '../../worker/site-profile/cap-blocks.js';
import { clearContentTypeEnablementCache } from '../../worker/content-types.js';
import { sitemapEngine } from '../../worker/sitemap.js';
import { handleSitemaps } from '../../worker/app/routes/sitemaps.js';
import { robots } from '../../worker/controllers.js';
import { Renderer } from '../../worker/render.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SNAPSHOT_DIR = join(ROOT, 'test', 'fixtures', 'preset-snapshots');

// ---- the configurations we snapshot ----
// Every named preset, plus two that the presets alone never reach:
//   full+all-content     Full platform with the older content_types_enabled setting switched on for all types
//                        (otherwise sportsbook, partners and custom types never appear for Full).
//   full+custom-beta-off the same, with one custom type switched off (Phase 11B).
export const VARIANTS = {
  ...Object.fromEntries(Object.keys(PRESETS).map((id) => [id, () => applyPreset(id)])),
  'full+all-content': () => defaultProfile(),
  'full+custom-beta-off': () => { const p = defaultProfile(); p.pages['content.custom.beta'] = false; return p; },
};
const LEGACY_ALL = { 'full+all-content': true, 'full+custom-beta-off': true };

export const DASHBOARD_TEMPLATES = {
  overview: 'templates/pages/admin/dashboard.html',
  analytics: 'templates/pages/admin/analytics.html',
  reports: 'templates/pages/admin/reports.html',
};
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

// One link per public area, so every menu shows what the preset keeps and drops.
const MENU_PATHS = ['/en', '/en/casino', '/en/casino/snap-casino', '/en/review', '/en/news', '/en/news/snap-story', '/en/updates', '/en/author', '/en/category',
  '/en/country', '/en/research', '/en/sportsbook', '/en/affiliate-partner', '/en/custom/alpha', '/en/custom/beta', '/en/best/snap', '/en/search', '/en/register',
  '/en/user/bookmarks', '/en/payment-methods', '/en/about'];

async function seed(db, legacyAll) {
  const run = (sql, ...b) => db.prepare(sql).bind(...b).run();
  await run(`INSERT INTO casinos (slug,name,website_url,affiliate_url,published,status) VALUES ('snap-casino','Snap Casino','https://c.example','https://a.example',1,'published')`);
  await run(`INSERT INTO reviews (casino_slug,slug,title,content,published) VALUES ('snap-casino','snap-review','Snap review','<p>x</p>',1)`);
  await run(`INSERT INTO news (slug,title,content,published,published_at) VALUES ('snap-story','Snap story','<p>x</p>',1,'2026-01-01 00:00:00')`);
  await run(`INSERT INTO platform_updates (slug,title,content,published,published_at) VALUES ('snap-update','Snap update','<p>x</p>',1,'2026-01-01 00:00:00')`);
  await run(`INSERT INTO authors (slug,name,published) VALUES ('snap-author','Snap Author',1)`);
  await run(`INSERT INTO categories (slug,name,published,status) VALUES ('snap-cat','Snap category',1,'published')`);
  await run(`INSERT INTO countries (code,name,published,status) VALUES ('GB','United Kingdom',1,'published')`);
  await run(`INSERT INTO pages (slug,type,template,title,published) VALUES ('snap-about','standard','standard','About snap',1)`);
  await run(`INSERT INTO research_items (type,slug,title,status,published) VALUES ('report','snap-study','Snap study','published',1)`);
  await run(`INSERT INTO comparisons (content_type,slug,title,status) VALUES ('casino','snap-vs','Snap vs','published')`);
  for (const t of ['alpha', 'beta']) await run(`INSERT INTO custom_content_types (slug,label,plural_label) VALUES (?,?,?)`, t, t, t + 's');
  const item = (type, slug, custom) => run(`INSERT INTO content_items (content_type,custom_type_slug,slug,name,status,published) VALUES (?,?,?,?, 'published',1)`, type, custom, slug, slug);
  await item('sportsbook', 'snap-book', null); await item('affiliate_partner', 'snap-partner', null);
  await item('custom', 'snap-alpha-item', 'alpha'); await item('custom', 'snap-beta-item', 'beta');
  // The sitemap pages are built from these; the Google News and news-sections files need their flags on.
  await run(`UPDATE system_settings SET value='true' WHERE key IN ('news_google_sitemap','news_new_taxonomy')`);
  let pos = 100;
  for (const loc of ['header', 'footer_casinos', 'mobile']) for (const p of MENU_PATHS) await run(`INSERT INTO nav_items (label,url,location,position,enabled) VALUES (?,?,?,?,1)`, 'L ' + p, p, loc, pos++);
  await run(`DELETE FROM nav_items WHERE position < 100`);
  if (legacyAll) await run(`INSERT OR REPLACE INTO settings(key,value) VALUES('content_types_enabled', ?)`, JSON.stringify({ casino: true, sportsbook: true, affiliate_partner: true, custom: true }));
}

async function makeEnv(variant) {
  const db = createTestDb(); applyMigrations(db);
  const env = { DB: db };
  const host = `${variant.replace(/[^a-z0-9]/g, '-')}.snap.test`;
  await seed(db, !!LEGACY_ALL[variant]);
  const profile = VARIANTS[variant]();
  // The same two writes the setup and publish paths make.
  await saveProfile(env, host, profile);
  await syncContentTypes(env, profile);
  await invalidateProfile(env, host);
  clearContentTypeEnablementCache();
  return { env, host, profile };
}

const linksOf = (html) => [...String(html || '').matchAll(/<a\b[^>]*?\shref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => `${m[1]}  ${m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()}`);
const locsOf = (xml) => [...String(xml).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/^https?:\/\/[^/]+/, ''));

// The route types of every sitemap file, in a stable order. /en/sitemap.xml and the index are core files.
export const SITEMAP_FILES = [
  ['sitemap', '/en/sitemap.xml'], ['sitemap-casinos', '/en/sitemap-casinos.xml'], ['sitemap-sportsbook', '/en/sitemap-sportsbook.xml'],
  ['sitemap-affiliate-partner', '/en/sitemap-affiliate-partner.xml'], ['sitemap-custom', '/en/sitemap-custom.xml'], ['sitemap-comparisons', '/en/sitemap-comparisons.xml'],
  ['sitemap-reviews', '/en/sitemap-reviews.xml'], ['sitemap-news', '/en/sitemap-news.xml'], ['sitemap-news-landing', '/en/sitemap-news-sections.xml'],
  ['sitemap-google-news', '/en/news-sitemap.xml'], ['sitemap-updates', '/en/sitemap-updates.xml'], ['sitemap-authors', '/en/sitemap-authors.xml'],
  ['sitemap-categories', '/en/sitemap-categories.xml'], ['sitemap-countries', '/en/sitemap-countries.xml'], ['sitemap-pages', '/en/sitemap-pages.xml'],
  ['sitemap-seo-pages', '/en/sitemap-seo-pages.xml'], ['sitemap-research', '/en/sitemap-research.xml'],
];

export async function buildView(variant) {
  const { env, host, profile } = await makeEnv(variant);
  const at = (p) => new Request(`https://${host}${p}`);
  const out = { variant, sections: {} };

  const nav = await new Renderer(env, at('/en')).loadNavData();
  out.sections['header menu'] = linksOf(nav.header_nav);
  out.sections['footer menu'] = linksOf(nav.footer_casinos);
  out.sections['mobile menu'] = linksOf(nav.mobile_nav);

  out.sections['sitemap index'] = locsOf(await (await sitemapEngine.generateIndex(at('/en/sitemap-index.xml'), env, env.DB)).text());
  out.sitemapIndexLinks = out.sections['sitemap index'];

  const files = [];
  for (const [type, path] of SITEMAP_FILES) {
    const route = getRoute({ url: `https://${host}${path}` });
    const d = gate(route, profile);
    if (route.type !== type) { files.push(`${path}  ROUTE TYPE MISMATCH (${route.type})`); continue; }
    if (d.action !== 'pass') { files.push(`${path}  -> ${d.status || d.action}`); continue; }
    const res = await handleSitemaps(route, at(path), env, {}, new URL(at(path).url));
    const urls = locsOf(await res.text());
    files.push(`${path}  -> ${res.status}`, ...urls.map((u) => `    ${u}`));
  }
  out.sections['sitemap files'] = files;

  out.sections['robots.txt'] = (await (await robots(at('/robots.txt'), env)).text()).split('\n');

  const side = pruneAdminNavHtml(read('templates/layout/admin-nav.html'), profile);
  out.sections['admin sidebar'] = [...side.matchAll(/<a\b[^>]*?\shref="(\/en\/dashboard[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => `${m[1]}  ${m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()}`);

  const blocks = [];
  for (const [name, rel] of Object.entries(DASHBOARD_TEMPLATES)) for (const t of capTags(pruneCapBlocks(read(rel), profile))) blocks.push(`${name}: ${t}`);
  out.sections['dashboard blocks kept'] = blocks;
  out.profile = profile;
  return out;
}

// Every tag that still carries data-cap, as "<tag> id-or-value  [caps]".
export function capTags(html) {
  const found = [];
  for (const m of String(html).matchAll(/<([a-zA-Z][\w:-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g)) {
    const attrs = m[2];
    const c = capsOf(attrs);
    if (!c) continue;
    const id = /\sid\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] || /\svalue\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] || '';
    found.push(`<${m[1].toLowerCase()}> ${id}  [${c.join('|')}]`);
  }
  return found;
}

export function renderSnapshot(view) {
  const lines = [`# Preset snapshot: ${view.variant}`, '# Generated by test/preset-snapshots.test.js. Update with UPDATE_SNAPSHOTS=1 and read the diff first.', ''];
  for (const [title, rows] of Object.entries(view.sections)) {
    lines.push(`## ${title} (${rows.length})`, ...(rows.length ? rows : ['(none)']), '');
  }
  return lines.join('\n');
}

// ---- small line diff (longest common subsequence), enough for files of a few hundred lines ----
export function lineDiff(expected, actual, context = 2) {
  const a = expected.split('\n'), b = actual.split('\n');
  const n = a.length, m = b.length;
  const L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const ops = []; let i = 0, j = 0;
  while (i < n && j < m) { if (a[i] === b[j]) { ops.push([' ', a[i]]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) ops.push(['-', a[i++]]); else ops.push(['+', b[j++]]); }
  while (i < n) ops.push(['-', a[i++]]); while (j < m) ops.push(['+', b[j++]]);
  const keep = new Set();
  ops.forEach(([t], k) => { if (t !== ' ') for (let x = Math.max(0, k - context); x <= Math.min(ops.length - 1, k + context); x++) keep.add(x); });
  const out = []; let gap = false;
  ops.forEach(([t, s], k) => { if (keep.has(k)) { out.push(`${t} ${s}`); gap = false; } else if (!gap) { out.push('  ...'); gap = true; } });
  return out.join('\n');
}

export const wantUpdate = () => process.env.UPDATE_SNAPSHOTS === '1';
export const snapshotPath = (variant) => join(SNAPSHOT_DIR, `${variant}.txt`);
export function writeSnapshot(variant, text) { mkdirSync(SNAPSHOT_DIR, { recursive: true }); writeFileSync(snapshotPath(variant), text); }
export const readSnapshot = (variant) => (existsSync(snapshotPath(variant)) ? readFileSync(snapshotPath(variant), 'utf8') : null);
export const snapshotFiles = () => (existsSync(SNAPSHOT_DIR) ? readdirSync(SNAPSHOT_DIR).filter((f) => f.endsWith('.txt')) : []);
export const removeSnapshot = (file) => unlinkSync(join(SNAPSHOT_DIR, file));
