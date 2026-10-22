// Guards the split of getRoute: a short entry that runs four ordered groups, first match wins.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRoute } from '../worker/routes.js';
import { routePublic } from '../worker/routing/public.js';
import { routeContent } from '../worker/routing/content.js';
import { routeDashboard } from '../worker/routing/dashboard.js';
import { routeSystem } from '../worker/routing/system.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const entry = readFileSync(join(ROOT, 'worker/routes.js'), 'utf-8');
const req = (p, method = 'GET') => new Request('https://site.test' + p, { method });

describe('getRoute split', () => {
  test('the entry runs the groups in the fixed order and ends with not_found', () => {
    const i = ['routePublic(path)', 'routeContent(path)', 'routeDashboard(path)', 'routeSystem(path, request)', 'not_found'].map((s) => entry.indexOf(s, entry.indexOf('return (')));
    assert.ok(i.every((x) => x > 0) && [...i].sort((a, b) => a - b).join() === i.join(), 'order');
    assert.ok(entry.split('\n').length < 60);
  });

  test('each group returns null when nothing matches, and a route object when it does', () => {
    assert.equal(routePublic('/nothing-here'), null);
    assert.equal(routeContent('/nothing-here'), null);
    assert.equal(routeDashboard('/nothing-here'), null);
    assert.equal(routeSystem('/nothing-here', req('/nothing-here')), null);
    assert.deepEqual(routePublic('/en/casino'), { type: 'casinoList' });
    assert.deepEqual(routeDashboard('/en/dashboard/seo'), { type: 'dashboardSeo' });
    assert.equal(routeSystem('/favicon.ico', req('/favicon.ico')).type, 'favicon');
  });

  test('earlier groups win over the catch-all page route, and unknown paths are not_found', () => {
    assert.equal(getRoute(req('/en/dashboard/seo')).type, 'dashboardSeo');
    assert.equal(getRoute(req('/en/casino')).type, 'casinoList');
    assert.equal(getRoute(req('/en/some-page')).type, 'page');
    assert.equal(getRoute(req('/zzz')).type, 'not_found');
    assert.deepEqual(getRoute(req('/')), { type: 'redirect', target: '/en' });
  });

  test('media is only a route for GET', () => {
    assert.equal(getRoute(req('/media/a.png')).type, 'media');
    assert.notEqual(getRoute(req('/media/a.png', 'POST')).type, 'media');
  });
});
