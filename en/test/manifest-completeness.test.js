// Phase 11 / T5 (blueprint section 10): "adding a route, screen, API prefix or setting without an owner fails a test".
//
// site-profile-manifest.test.js already proves that every ROUTE TYPE is claimed once. This file proves the same for the
// things route types do not cover:
//   - every dashboard screen (sidebar link, controller, template)
//   - every /api/v1/* path in worker/api/
//   - every sitemap file
//   - every setting key the code reads or the screens post
//   - every row set of the configuration document
// Each failure message says which file to edit.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRoute } from '../worker/routes.js';
import { MODULES, PAGE_IDS, FEATURE_IDS, CORE_PUBLIC, SITEMAP_CAP, allClaims, capabilityForApiPath } from '../worker/site-profile/registry.js';
import { ROW_SETS, SET_IDS, NAV_LOCATIONS } from '../worker/site-profile/rows.js';
import { ownedKeys, OWNED_ELSEWHERE } from '../worker/site-profile/settings-groups.js';
import { API_AREAS, areaForApiPath, ROW_SET_OWNERS, OTHER_SETTING_OWNERS, NOT_SETTING_KEYS, KNOWN_UNUSED_ADMIN_TEMPLATES, UNGATED_MODULE_AREAS, isCapabilityOwner } from '../worker/site-profile/ownership.js';
import { SITEMAP_FILES } from './support/preset-views.js';
import { sitemapRouteType } from '../worker/sitemap.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const walk = (dir, exts, out = []) => {
  for (const f of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${f.name}`;
    if (f.isDirectory()) walk(rel, exts, out); else if (exts.some((e) => f.name.endsWith(e))) out.push(rel);
  }
  return out;
};
const claims = allClaims();
const validOwner = (o) => ['core', 'public', 'system'].includes(o) || MODULES[o] || PAGE_IDS.has(o) || o === 'content.custom' || (o.startsWith('features.') && FEATURE_IDS.has(o.slice(9)));
const routeTypes = () => {
  const types = new Set();
  for (const f of ['worker/routes.js', ...fs.readdirSync(path.join(ROOT, 'worker/routing')).map((n) => `worker/routing/${n}`)]) for (const m of rd(f).matchAll(/type:\s*["']([A-Za-z0-9_-]+)["']/g)) types.add(m[1]);
  return types;
};

describe('dashboard screens', () => {
  const nav = rd('templates/layout/admin-nav.html');
  const links = [...new Set([...nav.matchAll(/href="(\/en\/dashboard[^"#?]*)/g)].map((m) => m[1]))];

  test('every sidebar link opens a known screen that the manifest claims exactly once', () => {
    assert.ok(links.length > 30, 'the sidebar scan found too few links');
    for (const l of links) {
      const type = getRoute({ url: 'https://s.test' + l }).type;
      assert.notEqual(type, 'not_found', `${l} is in templates/layout/admin-nav.html but no route serves it`);
      assert.equal((claims.get(type) || []).length, 1, `${l} (${type}) must be claimed exactly once in site-profile/registry.js (module dashboard list, FEATURES.dashboard or CORE_DASHBOARD)`);
    }
  });

  // controller function -> route type by naming convention (renderDashboardFoo -> dashboardFoo)
  const fns = [];
  for (const f of walk('worker/controllers', ['.js'])) {
    const parts = rd(f).split(/export async function /).slice(1);
    for (const part of parts) {
      const name = /^(\w+)/.exec(part)[1];
      const body = part.split(/\nexport /)[0];
      fns.push({ file: f, name, templates: [...body.matchAll(/["'](admin\/[a-z0-9/_-]+\.html)["']/g)].map((m) => m[1]) });
    }
  }
  const screenFns = fns.filter((f) => f.templates.length && /^render(Dashboard|Admin)?[A-Z]/.test(f.name) && f.name !== 'renderAdminPage');

  // The Overview screen is rendered by renderDashboardPage (route type "dashboard").
  const SCREEN_ALIAS = { renderDashboardPage: 'dashboard' };

  test('every controller that renders an admin template belongs to a claimed route type', () => {
    assert.ok(screenFns.length > 50, 'the controller scan found too few screens');
    const real = routeTypes();
    for (const fn of screenFns) {
      const t = fn.name.replace(/^render/, ''); const type = SCREEN_ALIAS[fn.name] || t[0].toLowerCase() + t.slice(1);
      assert.ok(real.has(type), `${fn.file}: ${fn.name} renders ${fn.templates.join(', ')} but there is no route type "${type}". Name the function after its route type, or route it.`);
      assert.equal((claims.get(type) || []).length, 1, `${fn.name} -> route type "${type}" is not claimed exactly once in site-profile/registry.js`);
    }
  });

  test('every admin template is rendered by a screen, except the ones listed as known unused', () => {
    const rendered = new Set(screenFns.flatMap((f) => f.templates));
    const files = fs.readdirSync(path.join(ROOT, 'templates/pages/admin')).filter((f) => f.endsWith('.html')).map((f) => `admin/${f}`);
    const unused = files.filter((t) => !rendered.has(t) && !KNOWN_UNUSED_ADMIN_TEMPLATES.includes(t));
    assert.deepEqual(unused, [], 'These admin templates have no screen. Render them from worker/controllers/dashboard.js (and claim the route in registry.js) or add them to KNOWN_UNUSED_ADMIN_TEMPLATES in site-profile/ownership.js');
    for (const t of KNOWN_UNUSED_ADMIN_TEMPLATES) assert.ok(!rendered.has(t), `${t} is rendered now: remove it from KNOWN_UNUSED_ADMIN_TEMPLATES`);
    for (const t of KNOWN_UNUSED_ADMIN_TEMPLATES) assert.ok(fs.existsSync(path.join(ROOT, 'templates/pages', t)), `${t} no longer exists: remove it from KNOWN_UNUSED_ADMIN_TEMPLATES`);
    for (const t of rendered) assert.ok(fs.existsSync(path.join(ROOT, 'templates/pages', t)), `a controller renders ${t} but the file does not exist`);
  });
});

describe('admin API paths', () => {
  const found = new Set();
  for (const f of walk('worker/api', ['.js'])) for (const m of rd(f).matchAll(/["'`](\/api\/v1\/[a-z0-9/_-]+)/g)) found.add(m[1].replace(/\/+$/, ''));
  // A bare "/api/v1/geo" in source is the prefix "/api/v1/geo/" written without its slash.
  const gatedBy = (p) => capabilityForApiPath(p) || capabilityForApiPath(p + '/');

  test('every /api/v1 path is refused by apiGate when its capability is off, or has an owner in site-profile/ownership.js', () => {
    assert.ok(found.size > 300, 'the API scan found too few paths');
    const unowned = [...found].filter((p) => !gatedBy(p) && !areaForApiPath(p));
    assert.deepEqual(unowned.sort(), [], 'These API paths have no owner. Gate them with a prefix in registry.js (FEATURES[x].api or a page "api" list) or give their prefix an owner in API_AREAS (site-profile/ownership.js)');
  });

  test('API_AREAS has no stale entries and only valid owners', () => {
    for (const [prefix, owner] of Object.entries(API_AREAS)) {
      assert.ok(validOwner(owner), `${prefix}: "${owner}" is not core, public, system or a capability id`);
      // A gated prefix in registry.js wins over a broader API_AREAS prefix (/api/v1/stats/top-casinos is gated, /api/v1/stats is core).
      assert.ok([...found].some((p) => (p === prefix || p.startsWith(prefix + '/')) && areaForApiPath(p)?.prefix === prefix && !gatedBy(p)),
        `${prefix} owns no ungated path in worker/api any more (removed, or now gated in registry.js): delete it from API_AREAS`);
    }
  });

  test('the module areas that apiGate does not refuse are exactly the ones listed (a finding, kept visible)', () => {
    // If you start gating one of these, move its prefix into registry.js, delete it from API_AREAS and this list shrinks.
    assert.ok(UNGATED_MODULE_AREAS.length > 30);
    for (const prefix of UNGATED_MODULE_AREAS) {
      assert.equal(gatedBy(prefix), null, `${prefix} is now gated: remove it from API_AREAS`);
      assert.ok(isCapabilityOwner(API_AREAS[prefix]));
    }
  });
});

describe('sitemap files', () => {
  const real = [...routeTypes()].filter((t) => t.startsWith('sitemap') || t === 'robots');

  test('every sitemap route type is claimed exactly once, as a gated file or as core', () => {
    for (const t of real) {
      const who = claims.get(t) || [];
      assert.equal(who.length, 1, `${t} must be claimed exactly once (SITEMAP_CAP or CORE_PUBLIC in site-profile/registry.js), found: ${who.join(', ') || 'nothing'}`);
      assert.ok(who[0] === 'sitemap' || who[0] === 'core', `${t} is claimed as "${who[0]}"`);
    }
    for (const t of Object.keys(SITEMAP_CAP)) assert.ok(real.includes(t), `SITEMAP_CAP lists ${t} but no such route type exists`);
  });

  test('every sitemap route type is covered by the per-preset snapshots', () => {
    const covered = new Set(SITEMAP_FILES.map(([t]) => t));
    const missing = real.filter((t) => t.startsWith('sitemap') && !['sitemap-index', 'sitemap-page'].includes(t) && !covered.has(t));
    assert.deepEqual(missing, [], 'Add these to SITEMAP_FILES in test/support/preset-views.js so the preset snapshots list their URLs');
    for (const [t, p] of SITEMAP_FILES) assert.equal(getRoute({ url: 'https://s.test' + p }).type, t, `SITEMAP_FILES: ${p} is not route type ${t}`);
  });

  test('every file the sitemap index can list resolves to a claimed route type', () => {
    const src = rd('worker/sitemap.js');
    const locs = [...src.matchAll(/loc:\s*["'](\/en\/[a-z0-9-]+\.xml)["']/g)].map((m) => m[1]);
    assert.ok(locs.length >= 15);
    for (const loc of locs) {
      const type = sitemapRouteType(loc);
      assert.ok(claims.has(type), `${loc} resolves to "${type}", which registry.js does not claim. Add the file to SITEMAP_CAP or CORE_PUBLIC.`);
      assert.ok(CORE_PUBLIC.has(type) || SITEMAP_CAP[type], `${loc} (${type}) is neither core nor in SITEMAP_CAP`);
    }
  });
});

describe('settings keys', () => {
  const owned = ownedKeys();
  const known = (k) => owned.has(k) || Object.prototype.hasOwnProperty.call(OTHER_SETTING_OWNERS, k) || Object.prototype.hasOwnProperty.call(NOT_SETTING_KEYS, k);

  test('owner tables do not overlap and only name real owners', () => {
    for (const k of Object.keys(OTHER_SETTING_OWNERS)) {
      assert.ok(!owned.has(k), `${k} is owned by a settings group AND listed in OTHER_SETTING_OWNERS: keep one`);
      assert.ok(validOwner(OTHER_SETTING_OWNERS[k].owner), `${k}: bad owner ${OTHER_SETTING_OWNERS[k].owner}`);
      assert.ok(OTHER_SETTING_OWNERS[k].why, `${k}: say why`);
    }
    for (const k of Object.keys(NOT_SETTING_KEYS)) assert.ok(!owned.has(k) && !(k in OTHER_SETTING_OWNERS), `${k} is a real setting: remove it from NOT_SETTING_KEYS`);
    for (const k of Object.keys(OWNED_ELSEWHERE)) assert.ok(!(k in OTHER_SETTING_OWNERS), `${k} is in two owner tables`);
  });

  test('every setting key in any template, admin script or worker file has exactly one owner', () => {
    const files = [...walk('worker', ['.js']), ...walk('templates', ['.html']), ...walk('static/js', ['.js'])].filter((f) => !f.endsWith('site-profile/ownership.js'));
    const PREFIXED = /["'`]((?:site|theme|footer|ga|gpwa|contact|country_directory|news_inline)_[a-z0-9_]+|default_country)["'`]/g;
    const CALLED = /(?:getSetting|getSettingForRequest|getSettingValue|readSetting)\(\s*[A-Za-z_.]+(?:\.DB)?\s*,\s*["'`]([a-z0-9_]+)["'`]/g;
    const SQL = /FROM settings WHERE key\s*=\s*['"]([a-z0-9_]+)['"]|settings[^;]{0,80}?VALUES\s*\(\s*['"]([a-z0-9_]+)['"]/gi;
    const orphans = new Map();
    for (const f of files) {
      const s = rd(f);
      for (const re of [PREFIXED, CALLED, SQL]) for (const m of s.matchAll(re)) { const k = m[1] || m[2]; if (k && !known(k)) orphans.set(k, f); }
    }
    assert.deepEqual([...orphans].map(([k, f]) => `${k} (${f})`), [], 'These keys have no owner. Add a field to settings-groups.js (look and feel), or OTHER_SETTING_OWNERS / NOT_SETTING_KEYS in site-profile/ownership.js');
  });

  test('OTHER_SETTING_OWNERS has no stale keys', () => {
    const all = [...walk('worker', ['.js'])].filter((f) => !f.endsWith('site-profile/ownership.js')).map(rd).join('\n');
    for (const k of Object.keys(OTHER_SETTING_OWNERS)) assert.ok(all.includes(k), `${k} appears nowhere in worker/: delete it from OTHER_SETTING_OWNERS`);
  });
});

describe('configuration row sets', () => {
  test('every row set has exactly one owner, and every owner entry is a real row set', () => {
    assert.deepEqual([...SET_IDS].sort(), Object.keys(ROW_SET_OWNERS).sort(), 'Add the new row set to ROW_SET_OWNERS in site-profile/ownership.js (or remove the stale one)');
    for (const [id, owner] of Object.entries(ROW_SET_OWNERS)) assert.ok(validOwner(owner), `${id}: bad owner ${owner}`);
  });

  test('every row set is explained for the Configuration screen and every field has a label', () => {
    for (const id of SET_IDS) {
      const d = ROW_SETS[id];
      assert.ok(d.label && d.area && d.help, `${id}: label, area and help are required`);
      for (const f of d.fields) assert.ok(f.label, `${id}.${f.k}: label is required`);
      assert.equal(new Set(d.fields.map((f) => f.k)).size, d.fields.length, `${id}: duplicate field key`);
    }
  });

  test('every menu location is one the renderer or a subnav reads', () => {
    const nav = rd('worker/render/navigation.js') + rd('worker/database/nav.js');
    const readers = walk('worker', ['.js']).map(rd).join('\n');
    for (const loc of NAV_LOCATIONS) assert.ok(nav.includes(`"${loc}"`) || readers.includes(`"${loc}"`) || readers.includes(`'${loc}'`), `menu location "${loc}" is stored but nothing reads it`);
  });

  test('every page layout offered is one the renderer knows', async () => {
    const { PAGE_TEMPLATES } = await import('../worker/page-templates.js');
    const field = ROW_SETS.pages.fields.find((f) => f.k === 'template');
    assert.deepEqual([...field.values].sort(), Object.keys(PAGE_TEMPLATES).sort());
  });
});
