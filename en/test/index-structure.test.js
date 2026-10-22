// Guards the split of worker/index.js: the wrapper stays small, every route type belongs to exactly one group,
// and every route type that getRoute() can return is handled.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTE_GROUPS } from '../worker/app/routes/index.js';
import { NOT_HANDLED } from '../worker/app/routes/not-handled.js';
import { readRoutesSource } from './support/routes-source.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf-8');
const groupFiles = readdirSync(join(ROOT, 'worker/app/routes')).filter((f) => !['index.js', 'not-handled.js'].includes(f) && f.endsWith('.js'));
const cases = (f) => [...read(`worker/app/routes/${f}`).matchAll(/^\s*case "([^"]+)":/gm)].map((m) => m[1]);

describe('worker/index.js layout', () => {
  test('index.js is only the cache/maintenance wrapper', () => {
    const s = read('worker/index.js');
    assert.ok(s.split('\n').length < 80);
    assert.ok(!/case "/.test(s), 'no route cases in index.js');
    assert.match(s, /export default \{/);
  });

  test('the registry lists every group file, in an order that is tried first to last', () => {
    assert.equal(ROUTE_GROUPS.length, groupFiles.length);
    const reg = read('worker/app/routes/index.js');
    for (const f of groupFiles) assert.ok(reg.includes(`"./${f}"`), `${f} registered`);
  });

  test('every route type is owned by exactly one group', () => {
    const seen = new Map();
    for (const f of groupFiles) for (const c of cases(f)) { assert.ok(!seen.has(c), `${c} in ${seen.get(c)} and ${f}`); seen.set(c, f); }
    assert.ok(seen.size >= 140, `cases: ${seen.size}`);
  });

  test('every route type returned by getRoute() has a case', () => {
    const all = new Set(groupFiles.flatMap(cases));
    const types = new Set([...readRoutesSource().matchAll(/type:\s*["']([A-Za-z-]+)["']/g)].map((m) => m[1]));
    const missing = [...types].filter((t) => !all.has(t));
    assert.deepEqual(missing, [], 'route types without a case would fall to the 404 page');
  });

  test('a group returns NOT_HANDLED for a type it does not own', async () => {
    for (const handle of ROUTE_GROUPS) assert.equal(await handle({ type: '__no_such_route__' }, {}, {}, {}, new URL('https://x.test/')), NOT_HANDLED);
  });
});
