// Guards the split of worker/super/router.js (v22.59): the route table is written in worker/super/routes/*.js and joined
// by the router in a fixed order. The fixture is the table as it was before the split (227 routes), so a route can't be
// lost, reordered inside a group, or pointed at another handler without this test saying so.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CORE_ROUTES } from '../worker/super/routes/core.js';
import { AFFILIATE_ROUTES } from '../worker/super/routes/affiliate.js';
import { ANALYTICS_ROUTES } from '../worker/super/routes/analytics.js';
import { AI_NEWSROOM_ROUTES } from '../worker/super/routes/ai-newsroom.js';
import { RESEARCH_ROUTES } from '../worker/super/routes/research.js';
import { SITE_SETUP_ROUTES } from '../worker/super/routes/site-setup.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'worker/super/routes');
const read = (p) => readFileSync(join(ROOT, p), 'utf-8');
const GROUPS = [['CORE_ROUTES', CORE_ROUTES], ['AFFILIATE_ROUTES', AFFILIATE_ROUTES], ['ANALYTICS_ROUTES', ANALYTICS_ROUTES], ['AI_NEWSROOM_ROUTES', AI_NEWSROOM_ROUTES], ['RESEARCH_ROUTES', RESEARCH_ROUTES], ['SITE_SETUP_ROUTES', SITE_SETUP_ROUTES]];

describe('super router layout', () => {
  test('the route groups joined in the router\'s order are exactly the 230 routes of the table including the v2.3.4 site-access state route', () => {
    // The 230-route fixture is the table as it was before Phase 9; the Phase 9 group (site setup) is checked on its own below.
    const joined = GROUPS.filter(([n]) => n !== 'SITE_SETUP_ROUTES').flatMap(([, g]) => g).map(([m, p, h, r]) => [m, p, h.name, r]);
    const expected = JSON.parse(read('test/fixtures/super-routes-v2.3.4.json'));
    assert.equal(expected.length, 230);
    assert.deepEqual(joined, expected);
  });
  test('the Phase 9 and 10 group adds exactly the four site-setup routes, after the original groups', () => {
    assert.deepEqual(SITE_SETUP_ROUTES.map(([m, p, h, r]) => [m, p, h.name, r]), [
      ['GET', '/en/api/super/site-setup', 'handleGetSiteSetup', 'site_setup'],
      ['POST', '/en/api/super/site-setup', 'handleProvisionSiteSetup', 'site_setup'],
      ['GET', '/en/api/super/site-config-export', 'handleExportSiteConfig', 'site_config_export'],
      ['GET', '/en/api/super/site-system', 'handleGetSiteSystem', 'site_system']
    ]);
  });
  test('router.js joins the groups in that order and still holds the dispatcher', () => {
    const src = read('worker/super/router.js');
    const used = [...src.matchAll(/^\s+\.\.\.([A-Z_]+),?$/gm)].map((m) => m[1]);
    assert.deepEqual(used, GROUPS.map(([n]) => n));
    for (const fn of ['function matchRoute(', 'function actionForMethod(', 'export async function handleSuperApi(']) assert.ok(src.includes(fn), fn);
    assert.ok(!/\["(GET|POST|PUT|DELETE)", "\/en\/api\/super/.test(src), 'route entries belong in routes/*.js');
  });
  test('six route files, each an array of [METHOD, path, handler, resource]; no route is defined twice', () => {
    assert.deepEqual(readdirSync(DIR).filter((f) => f.endsWith('.js')).sort(), ['affiliate.js', 'ai-newsroom.js', 'analytics.js', 'core.js', 'research.js', 'site-setup.js']);
    const seen = new Set();
    for (const [, g] of GROUPS) for (const [m, p, h, r] of g) {
      assert.ok(['GET', 'POST', 'PUT', 'DELETE'].includes(m), `${m} ${p}`);
      assert.match(p, /^\/en\/api\/super\//);
      assert.equal(typeof h, 'function', `${m} ${p}`);
      assert.ok(r === null || typeof r === 'string');
      assert.ok(!seen.has(m + ' ' + p), `duplicate ${m} ${p}`);
      seen.add(m + ' ' + p);
    }
  });
  test('each route file imports only handler modules, and every handler namespace used is imported', () => {
    for (const f of readdirSync(DIR).filter((x) => x.endsWith('.js'))) {
      const src = readFileSync(join(DIR, f), 'utf-8');
      for (const m of src.matchAll(/^import \* as (\w+) from "(\.\.\/[a-z-]+\.js)";$/gm)) assert.ok(existsSync(join(DIR, m[2])), `${f}: ${m[2]}`);
      const imported = new Set([...src.matchAll(/^import \* as (\w+) from/gm)].map((m) => m[1]));
      const used = new Set([...src.matchAll(/\b(\w+)\.handle[A-Z]\w+/g)].map((m) => m[1]));
      assert.deepEqual([...used].sort(), [...imported].sort(), f);
      assert.equal(/^import (?!\* as)/m.test(src), false, `${f} has an import that is not a handler namespace`);
    }
  });
  test('each file stays under 250 lines', () => {
    for (const f of readdirSync(DIR).filter((x) => x.endsWith('.js'))) assert.ok(read(`worker/super/routes/${f}`).split('\n').length < 250, f);
    assert.ok(read('worker/super/router.js').split('\n').length < 250);
  });
});
