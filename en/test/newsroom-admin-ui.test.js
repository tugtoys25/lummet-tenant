// test/newsroom-admin-ui.test.js -- Stage C admin UI wiring + client-side safety.
// No browser is available here, so this checks: routing, template/nav wiring,
// static XSS-safety rules for the new script, and executes the extended
// permissions-admin.js in a stubbed VM. It does NOT prove visual layout or
// real-browser behaviour of newsroom-admin.js -- that needs manual QA.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { getRoute } from '../worker/routes.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf-8');
const route = (p) => getRoute(new Request(`https://site.test${p}`));

describe('routing & wiring', () => {
  test('/en/dashboard/newsroom routes to the new page; neighbours unchanged', () => {
    assert.deepEqual(route('/en/dashboard/newsroom'), { type: 'dashboardNewsroom' });
    assert.deepEqual(route('/en/dashboard/news'), { type: 'dashboardNews' });
    assert.deepEqual(route('/en/news'), { type: 'newsList' });
    assert.deepEqual(route('/en/news/some-article'), { type: 'news', slug: 'some-article' });
  });
  test('index.js dispatches it and the controller uses the shared admin gate', () => {
    assert.match(read('worker/index.js'), /case "dashboardNewsroom":\s*return renderDashboardNewsroom\(request, env\)/);
    assert.match(read('worker/controllers.js'), /renderDashboardNewsroom[\s\S]{0,80}renderAdminPage\(request, env, "admin\/newsroom\.html"\)/);
  });
  test('template embeds the admin nav and loads ONLY its own script (no global base.html change)', () => {
    const t = read('templates/pages/admin/newsroom.html');
    assert.match(t, /\{\{admin_nav\}\}/);
    assert.match(t, /<script defer src="\/static\/js\/newsroom-admin\.js"><\/script>/);
    assert.ok(!read('templates/layout/base.html').includes('newsroom-admin.js'), 'public pages must not load the admin script');
    assert.match(read('templates/layout/admin-nav.html'), /href="\/en\/dashboard\/newsroom"/);
  });
});

describe('newsroom-admin.js safety rules', () => {
  const src = read('static/js/newsroom-admin.js');
  const code = src.replace(/\/\/.*$/gm, ''); // ignore comments
  test('never uses HTML-injecting or dynamic-code sinks', () => {
    for (const sink of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function', 'srcdoc'])
      assert.ok(!code.includes(sink), `forbidden sink: ${sink}`);
  });
  test('talks only to the newsroom API on the same origin', () => {
    assert.match(src, /const API = "\/en\/api\/v1\/newsroom\/"/);
    assert.ok(!/https?:\/\//.test(code.replace(/placeholder: "https:\/\/…"/g, '')), 'no absolute URLs in code');
  });
});

describe('permissions admin page exposes the newsroom actions', () => {
  function load(rolePerms) {
    const tbody = { innerHTML: '' };
    const ctx = vm.createContext({
      document: { getElementById: (id) => (id === 'permTableBody' ? tbody : id === 'permRoleSelect' ? { value: 'editor' } : null), addEventListener() {}, querySelectorAll: () => [] },
      fetch: async () => ({ json: async () => ({ permissions: { editor: rolePerms } }) }),
      console
    });
    vm.runInContext(readFileSync(new URL('../static/js/permissions-admin.js', import.meta.url), 'utf-8'), ctx);
    return { ctx, tbody };
  }
  const ALL = ['review', 'factcheck', 'publish', 'schedule', 'correct', 'retract', 'manage_authors', 'manage_taxonomy', 'manage_sources', 'manage_settings', 'view_analytics'];

  test('renders one checkbox per newsroom action for resource "news"; existing rows still render', async () => {
    const { ctx, tbody } = load({ news: { create: true, read: true, update: true } });
    await vm.runInContext('loadPermissionMatrix()', ctx);
    for (const a of ALL) assert.match(tbody.innerHTML, new RegExp(`data-resource="news"\\s+data-action="${a}"`), `missing ${a}`);
    for (const a of ['create', 'read', 'update', 'delete']) assert.match(tbody.innerHTML, new RegExp(`data-resource="casinos"\\s+data-action="${a}"`));
    assert.ok(!/data-action="publish"[^>]*checked/.test(tbody.innerHTML), 'editor is not granted publish by default');
  });
  test('reflects granted newsroom permissions as checked', async () => {
    const { ctx, tbody } = load({ news: { publish: true, review: true } });
    await vm.runInContext('loadPermissionMatrix()', ctx);
    assert.match(tbody.innerHTML, /data-action="publish"\s+checked/);
    assert.match(tbody.innerHTML, /data-action="review"\s+checked/);
    assert.ok(!/data-action="retract"\s+checked/.test(tbody.innerHTML));
  });
  test('the save selector still picks up the new rows (same tbody, same checkbox shape)', () => {
    assert.match(readFileSync(new URL('../static/js/permissions-admin.js', import.meta.url), 'utf-8'), /querySelectorAll\("#permTableBody input\[type=checkbox\]"\)/);
  });
});
