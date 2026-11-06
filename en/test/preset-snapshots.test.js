// Phase 11 / T5 (blueprint section 10): per-preset snapshots of what a site shows and advertises.
//
// For every named preset (and two extra content configurations) this renders the header, footer and mobile menus, the
// sitemap index, the URL list of every sitemap file, robots.txt, the admin sidebar and the module-specific blocks on
// Overview, Analytics and Reports, then compares them with test/fixtures/preset-snapshots/<name>.txt.
//
//   Normal run:        fails on any difference and prints a readable diff.
//   UPDATE_SNAPSHOTS=1 rewrites the files. Read the diff in git before you commit it.
//
// The tests that do NOT use the stored files (the "invariants" block) are the ones that catch a real inconsistency
// even when someone regenerates the snapshots without looking.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRoute } from '../worker/routes.js';
import { gate, pathAllowed, isEnabled } from '../worker/site-profile/profile.js';
import { PRESETS } from '../worker/site-profile/registry.js';
import { capsOf } from '../worker/site-profile/cap-blocks.js';
import {
  VARIANTS, SITEMAP_FILES, DASHBOARD_TEMPLATES, buildView, renderSnapshot, lineDiff, wantUpdate, readSnapshot, writeSnapshot,
  snapshotFiles, removeSnapshot, snapshotPath,
} from './support/preset-views.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAMES = Object.keys(VARIANTS);
const views = new Map();
const view = async (name) => { if (!views.has(name)) views.set(name, await buildView(name)); return views.get(name); };
const pathOf = (row) => row.split(/\s{2}/)[0];

describe('snapshots', () => {
  for (const name of NAMES) {
    test(`${name}: menus, sitemaps, robots, admin sidebar and dashboard blocks match the stored snapshot`, async () => {
      const text = renderSnapshot(await view(name));
      if (wantUpdate()) { writeSnapshot(name, text); return; }
      const stored = readSnapshot(name);
      assert.notEqual(stored, null, `No snapshot for "${name}". Run: UPDATE_SNAPSHOTS=1 node --test test/preset-snapshots.test.js  then read and commit ${snapshotPath(name)}`);
      if (stored !== text) assert.fail(`Snapshot "${name}" changed.\n${lineDiff(stored, text)}\n\nIf this change is intended: UPDATE_SNAPSHOTS=1 node --test test/preset-snapshots.test.js, then read the diff in git.`);
    });
  }

  test('no stored snapshot belongs to a preset that no longer exists', () => {
    const stale = snapshotFiles().filter((f) => !NAMES.includes(f.replace(/\.txt$/, '')));
    if (wantUpdate()) { stale.forEach(removeSnapshot); return; }
    assert.deepEqual(stale, [], 'Delete these files (or run with UPDATE_SNAPSHOTS=1): a preset was renamed or removed');
  });
});

describe('invariants (independent of the stored files)', () => {
  test('the seed worked: Full platform with every content type on lists every kind of page', async () => {
    const v = await view('full+all-content');
    const all = v.sections['sitemap files'].join('\n');
    for (const u of ['/en/casino/snap-casino', '/en/review/snap-review', '/en/news/snap-story', '/en/updates/snap-update', '/en/author/snap-author', '/en/category/snap-cat',
      '/en/country/gb', '/en/sportsbook/snap-book', '/en/affiliate-partner/snap-partner', '/en/custom/alpha/snap-alpha-item', '/en/custom/beta/snap-beta-item']) {
      assert.ok(all.toLowerCase().includes(u), `seed or sitemap lost ${u}`);
    }
  });

  for (const name of NAMES) {
    test(`${name}: every link in every menu leads to a page the site serves`, async () => {
      const v = await view(name);
      for (const sec of ['header menu', 'footer menu', 'mobile menu']) for (const row of v.sections[sec]) {
        const p = pathOf(row);
        if (!p.startsWith('/en')) continue;
        const d = gate(getRoute({ url: 'https://s.test' + p }), v.profile);
        assert.equal(d.action, 'pass', `${name} ${sec}: ${p} -> ${JSON.stringify(d)}. A menu link points at a page that is switched off.`);
      }
    });

    test(`${name}: the sitemap index lists exactly the sitemap files that answer, and every listed address is a live page`, async () => {
      const v = await view(name);
      const answering = new Set(SITEMAP_FILES.filter(([type, path]) => gate(getRoute({ url: 'https://s.test' + path }), v.profile).action === 'pass').map(([, p]) => p));
      for (const loc of v.sitemapIndexLinks) assert.ok(answering.has(loc), `${name}: the sitemap index advertises ${loc} but fetching it is refused`);
      for (const row of v.sections['sitemap files']) {
        if (!row.startsWith('    ')) continue;
        const p = row.trim();
        assert.equal(gate(getRoute({ url: 'https://s.test' + p }), v.profile).action, 'pass', `${name}: a sitemap file lists ${p}, which is switched off`);
        assert.ok(pathAllowed(p, v.profile), `${name}: ${p} is not allowed by pathAllowed`);
      }
    });

    test(`${name}: robots.txt only advertises sitemaps that answer`, async () => {
      const v = await view(name);
      for (const line of v.sections['robots.txt']) {
        const m = /^Sitemap:\s*https?:\/\/[^/]+(\/\S+)$/.exec(line);
        if (!m) continue;
        const d = gate(getRoute({ url: 'https://s.test' + m[1] }), v.profile);
        assert.equal(d.action, 'pass', `${name}: robots.txt advertises ${m[1]} -> ${JSON.stringify(d)}`);
      }
    });

    test(`${name}: the admin sidebar links only to screens that open`, async () => {
      const v = await view(name);
      for (const row of v.sections['admin sidebar']) {
        const p = pathOf(row);
        const route = getRoute({ url: 'https://s.test' + p.split(/[?#]/)[0] });
        // An unknown /en/dashboard/... path routes to the public 'page' type, which is core and always passes the gate,
        // so the route type itself must be a dashboard screen.
        assert.ok(/^dashboard/.test(route.type), `${name}: sidebar link ${p} is not a dashboard screen (route type ${route.type})`);
        const d = gate(route, v.profile);
        assert.equal(d.action, 'pass', `${name}: sidebar link ${p} -> ${JSON.stringify(d)}`);
      }
    });

    test(`${name}: Overview, Analytics and Reports keep no block or option of a switched-off module`, async () => {
      const v = await view(name);
      for (const row of v.sections['dashboard blocks kept']) {
        const caps = /\[([^\]]+)\]$/.exec(row)[1].split('|');
        assert.ok(caps.some((c) => isEnabled(v.profile, c)), `${name}: ${row} is still shown although ${caps.join(' and ')} is off`);
      }
    });
  }

  test('every data-cap id on the dashboard templates is a real capability', async () => {
    const { MODULES, PAGE_IDS, FEATURE_IDS } = await import('../worker/site-profile/registry.js');
    const known = (id) => MODULES[id] || PAGE_IDS.has(id) || (id.startsWith('features.') && FEATURE_IDS.has(id.slice(9)));
    for (const [name, rel] of Object.entries(DASHBOARD_TEMPLATES)) {
      for (const m of readFileSync(join(ROOT, rel), 'utf8').matchAll(/<([a-zA-Z][\w:-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g)) {
        for (const c of capsOf(m[2]) || []) assert.ok(known(c), `${rel}: data-cap="${c}" is not a capability id. Typo, or register the capability in site-profile/registry.js`);
      }
    }
  });

  test('presets that drop a module really remove its sitemap file, menu links and sidebar entries', async () => {
    const news = await view('news');
    assert.ok(!news.sections['sitemap index'].some((l) => /casinos|sportsbook|research/.test(l)));
    assert.ok(!news.sections['header menu'].some((r) => /\/en\/casino|\/en\/sportsbook/.test(r)));
    assert.ok(news.sections['header menu'].some((r) => r.startsWith('/en/news')));
    assert.ok(!news.sections['admin sidebar'].some((r) => r.startsWith('/en/dashboard/casinos')));
    assert.ok(Object.keys(PRESETS).includes('news'));
  });

  test('custom type switched off: its sitemap entries and menu links are gone, the other type is untouched', async () => {
    const v = await view('full+custom-beta-off');
    const files = v.sections['sitemap files'].join('\n');
    assert.ok(files.includes('/en/custom/alpha/snap-alpha-item') && !files.includes('/en/custom/beta'));
    assert.ok(v.sections['header menu'].some((r) => r.startsWith('/en/custom/alpha')) && !v.sections['header menu'].some((r) => r.startsWith('/en/custom/beta')));
  });
});
