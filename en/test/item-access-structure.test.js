// Guards the split of worker/database/item-access.js (v22.51): the facade keeps the public API, parts stay small,
// no import cycle, and the security-relevant rules stay in one place each.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as facade from '../worker/database/item-access.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'worker/database/item-access');
const parts = readdirSync(DIR).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3)).sort();
const read = (n) => readFileSync(join(DIR, `${n}.js`), 'utf-8');

describe('item-access layout', () => {
  test('the facade exports the same 20 names as before, and nothing internal', () => {
    assert.deepEqual(Object.keys(facade).sort(), ['assignItem', 'canAccessItem', 'deleteUserItemAccess', 'getAccessibleIdCondition', 'getAccessibleItemIds', 'getAccessibleWhereClause', 'getAllUserItemAccess', 'getItemAccessCondition', 'getItemAssignees', 'getItemById', 'getItemBySlug', 'getItemScope', 'getRegisteredResources', 'getResourceConfig', 'getSystemDefaultScope', 'isItemAssigned', 'setSystemDefaultScope', 'setUserItemAccess', 'unassignItem', 'getUserItemAccess'].sort());
  });
  test('the old aliases are still the same functions', () => {
    assert.equal(facade.getUserItemAccess, facade.getItemScope);
    assert.equal(facade.getItemAccessCondition, facade.getAccessibleWhereClause);
  });
  test('the facade only re-exports from item-access/', () => {
    const body = readFileSync(join(ROOT, 'worker/database/item-access.js'), 'utf-8').split('\n').filter((l) => l.trim() && !l.trim().startsWith('//'));
    assert.equal(body.length, 5);
    for (const l of body) assert.match(l, /^export \{ [A-Za-z_, ]+ \} from "\.\/item-access\/[a-z-]+\.js";$/);
  });
  test('five parts, imports resolve, no cycle: registry <- policy, assignments <- access', () => {
    assert.deepEqual(parts, ['access', 'assignments', 'items', 'policy', 'registry']);
    const local = { registry: [], assignments: [], policy: ['registry'], items: ['registry'], access: ['assignments', 'policy', 'registry'] };
    for (const n of parts) {
      const found = [];
      for (const m of read(n).matchAll(/from\s+"(\.[^"]+)"/g)) {
        assert.ok(existsSync(join(DIR, m[1])), `${n} imports missing ${m[1]}`);
        found.push(m[1].slice(2, -3));
      }
      assert.deepEqual(found.sort(), local[n].sort(), n);
    }
  });
  test('scopes, actions and the fallback default sit in the registry only; the admin bypass sits in access only', () => {
    assert.match(read('registry'), /VALID_SCOPES = \['none', 'own', 'all', 'assigned'\]/);
    assert.match(read('registry'), /FALLBACK_DEFAULT_SCOPE = 'all'/);
    for (const n of parts.filter((p) => p !== 'registry')) assert.doesNotMatch(read(n), /VALID_SCOPES = |FALLBACK_DEFAULT_SCOPE = /, n);
    for (const n of parts) assert.equal(/role === 'admin'/.test(read(n)), n === 'access', n);
  });
  test('each part stays under 250 lines', () => { for (const n of parts) assert.ok(read(n).split('\n').length < 250, n); });
});
