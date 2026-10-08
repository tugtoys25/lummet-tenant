// test/dashboard-shell.test.js -- grouped dashboard navigation with a menu toggle.
// No browser runs here, so this checks the markup contract, link coverage, wiring and
// the client script's safety rules. Layout was checked by hand in a real browser at
// 390px and 1280px widths; this suite does not prove visual layout.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf-8');
const hrefs = (html) => [...html.matchAll(/<a\s+href="([^"]+)"/g)].map((m) => m[1]);

// Every link the flat admin sidebar offered before the redesign.
const PREVIOUS_ADMIN_HREFS = [
  '/en/dashboard', '/en/dashboard/casinos', '/en/dashboard/casino/create', '/en/dashboard/content-items',
  '/en/dashboard/content-item/create', '/en/dashboard/custom-types', '/en/dashboard/comparisons',
  '/en/dashboard/comparison/create', '/en/dashboard/reviews/generic', '/en/dashboard/content-landing-pages',
  '/en/dashboard/settings/content-types', '/en/dashboard/reviews', '/en/dashboard/news', '/en/dashboard/newsroom',
  '/en/dashboard/updates', '/en/dashboard/country-pages', '/en/dashboard/category-countries', '/en/dashboard/pages',
  '/en/dashboard/categories', '/en/dashboard/countries', '/en/dashboard/research', '/en/dashboard/research/review-queue',
  '/en/dashboard/research/datasets', '/en/dashboard/payment-methods', '/en/dashboard/authors', '/en/dashboard/components',
  '/en/dashboard/seo', '/en/dashboard/media', '/en/dashboard/nav', '/en/dashboard/permissions', '/en/dashboard/item-access',
  '/en/dashboard/users', '/en/dashboard/subscriptions', '/en/dashboard/emails', '/en/dashboard/inquiries',
  '/en/dashboard/submissions', '/en/dashboard/notifications', '/en/dashboard/banners', '/en/dashboard/affiliate-partners',
  '/en/dashboard/affiliate-programs', '/en/dashboard/affiliate-accounts', '/en/dashboard/commercial-terms',
  '/en/dashboard/postback-configs', '/en/dashboard/import-history', '/en/dashboard/provider-adapters',
  '/en/dashboard/offers', '/en/dashboard/tracking-links', '/en/dashboard/analytics', '/en/dashboard/campaigns',
  '/en/dashboard/reports', '/en/dashboard/settings', '/en/dashboard/ai', '/en/user/notifications',
  '/en/api/v1/auth/logout'
];
// Pages added to the menu after the redesign (each addition is deliberate and listed here).
const ADDED_ADMIN_HREFS = ['/en/dashboard/header-hero'];
const USER_HREFS = [
  '/en/user/dashboard', '/en/user/bookmarks', '/en/user/submit-casino', '/en/user/inquiries',
  '/en/user/profile', '/en/user/notifications', '/en/api/v1/auth/logout'
];

describe('admin navigation', () => {
  const nav = read('templates/layout/admin-nav.html');

  test('offers every link it offered before plus the deliberate additions, each once', () => {
    const now = hrefs(nav);
    assert.equal(new Set(now).size, now.length, 'duplicate link');
    assert.deepEqual([...now].sort(), [...PREVIOUS_ADMIN_HREFS, ...ADDED_ADMIN_HREFS].sort());
  });

  test('is grouped into collapsible sections instead of one flat list', () => {
    const groups = [...nav.matchAll(/<details class="dash-group" data-group="([a-z-]+)"/g)].map((m) => m[1]);
    assert.ok(groups.length >= 6, 'expected several groups');
    assert.equal(new Set(groups).size, groups.length);
    for (const block of nav.split('<details').slice(1)) {
      assert.ok((block.match(/<a /g) || []).length <= 12, 'group is too large to scan');
    }
  });

  test('has the menu toggle, close button, backdrop and page filter wired by id', () => {
    for (const id of ['dashToggle', 'dashClose', 'dashBackdrop', 'dashFilter', 'dashNav', 'dashCrumb']) {
      assert.match(nav, new RegExp(`id="${id}"`), id);
    }
    assert.match(nav, /id="dashToggle" aria-controls="dashNav" aria-expanded=/);
  });

  test('keeps the permission hints and the logout hook that existing scripts rely on', () => {
    assert.match(nav, /<a href="\/en\/dashboard\/research" data-perm="research">/);
    assert.match(nav, /<a href="\/en\/dashboard\/research\/datasets" data-perm="research_datasets">/);
    assert.match(nav, /<a href="\/en\/dashboard\/item-access" data-perm="users">/);
    assert.match(nav, /class="admin-logout"/);
    assert.match(nav, /<nav class="admin-nav"/);
  });

  test('every admin page still embeds the shared nav', () => {
    const dir = new URL('../templates/pages/admin/', import.meta.url);
    const missing = readdirSync(dir).filter((f) => f.endsWith('.html') && !read(`templates/pages/admin/${f}`).includes('{{admin_nav}}'));
    assert.deepEqual(missing, []);
  });
});

describe('user navigation', () => {
  const nav = read('templates/layout/user-nav.html');

  test('is one shared partial with every user link', () => {
    assert.deepEqual([...hrefs(nav).filter((h) => !h.startsWith('/en/casino'))].sort(), [...USER_HREFS].sort());
    assert.match(nav, /id="dashToggle"/);
    assert.match(nav, /<nav class="admin-nav" id="dashNav"/);
  });

  test('all six user pages use the partial and no longer carry their own copy', () => {
    for (const page of ['dashboard', 'bookmarks', 'inquiries', 'notifications', 'profile', 'submit-casino']) {
      const t = read(`templates/pages/users/${page}.html`);
      assert.match(t, /\{\{user_nav\}\}/, page);
      assert.doesNotMatch(t, /<nav class="admin-nav">/, page);
    }
  });

  test('both user-page renderers supply user_nav', () => {
    const src = read('worker/controllers.js');
    assert.equal((src.match(/user_nav: userNav/g) || []).length, 2);
    assert.equal((src.match(/loadTemplate\("layout\/user-nav\.html"\)/g) || []).length, 2);
  });
});

describe('shell assets', () => {
  test('base.html loads the stylesheet last of the dashboard styles and the script deferred', () => {
    const base = read('templates/layout/base.html');
    assert.match(base, /<link rel="stylesheet" href="\/static\/css\/dashboard-shell\.css">/);
    assert.ok(base.indexOf('dashboard-shell.css') > base.indexOf('supportive.css'), 'must load after supportive.css');
    assert.match(base, /<script defer src="\/static\/js\/dashboard-shell\.js"><\/script>/);
  });

  test('stylesheet replaces the horizontal mobile bar with an off-canvas drawer', () => {
    const css = read('static/css/dashboard-shell.css');
    assert.match(css, /@media \(max-width: 900px\)/);
    assert.match(css, /translateX\(-102%\)/);
    assert.match(css, /\.dash-open > \.admin-nav/);
    assert.doesNotMatch(css, /flex-direction:\s*row[^}]*overflow-x:\s*auto/);
    assert.match(css, /prefers-reduced-motion/);
  });

  test('stylesheet only touches dashboard selectors, so public pages are unaffected', () => {
    const css = read('static/css/dashboard-shell.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const selectors = [...css.matchAll(/(?:^|})\s*([^{}@]+)\{/g)].map((m) => m[1].trim()).filter(Boolean);
    for (const sel of selectors) {
      for (const part of sel.split(',').map((s) => s.trim())) {
        assert.match(part, /admin-wrapper|dash-|\.dash|body\.dash-lock|body:has\(\.admin-wrapper\)|^\d+%|^from$|^to$|^\.layout-wrapper:has\(\.admin-wrapper\)/, `unscoped selector: ${part}`);
      }
    }
  });

  test('script never uses HTML-injecting or dynamic-code sinks and stays same-origin', () => {
    const src = read('static/js/dashboard-shell.js');
    const code = src.replace(/\/\/.*$/gm, '');
    for (const sink of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function', 'srcdoc', 'fetch(', 'XMLHttpRequest']) {
      assert.ok(!code.includes(sink), `forbidden: ${sink}`);
    }
  });

  test('script guards storage access and supports keyboard dismissal', () => {
    const src = read('static/js/dashboard-shell.js');
    assert.match(src, /try \{ return window\.localStorage/);
    assert.match(src, /e\.key === "Escape"/);
    assert.match(src, /aria-expanded/);
    assert.match(src, /aria-current/);
  });

  test('permission script is unchanged in how it finds and hides links', () => {
    const src = read('static/js/admin-permissions.js');
    assert.match(src, /document\.querySelectorAll\("\.admin-nav a"\)/);
    assert.match(src, /link\.style\.display = "none"/);
  });
});
