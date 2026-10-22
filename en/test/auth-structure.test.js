// Guards the split of worker/auth.js (v22.47): the facade keeps the public API, parts stay small, no import cycle,
// and the security-relevant constants are where the documentation says they are.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as facade from '../worker/auth.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'worker/auth');
const parts = readdirSync(DIR).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3)).sort();
const read = (n) => readFileSync(join(DIR, `${n}.js`), 'utf-8');

describe('auth layout', () => {
  test('the facade exports the same 12 names as before, and nothing internal', () => {
    assert.deepEqual(Object.keys(facade).sort(), ['changePassword', 'forgotPassword', 'generateSessionToken', 'getCookie', 'getCurrentUser', 'hashPassword', 'login', 'logout', 'register', 'requireRole', 'resetPassword', 'verifyPassword']);
  });
  test('the facade only re-exports from auth/', () => {
    const body = readFileSync(join(ROOT, 'worker/auth.js'), 'utf-8').split('\n').filter((l) => l.trim() && !l.trim().startsWith('//'));
    assert.equal(body.length, 3);
    for (const l of body) assert.match(l, /^export \{ [A-Za-z_, ]+ \} from "\.\/auth\/[a-z-]+\.js";$/);
  });
  test('four parts, imports resolve, no cycle: security and password <- session <- account', () => {
    assert.deepEqual(parts, ['account', 'password', 'security', 'session']);
    const local = { security: [], password: [], session: ['password', 'security'], account: ['password', 'security', 'session'] };
    for (const n of parts) {
      const found = [];
      for (const m of read(n).matchAll(/from\s+"(\.[^"]+)"/g)) {
        assert.ok(existsSync(join(DIR, m[1])), `${n} imports missing ${m[1]}`);
        if (m[1].startsWith('./')) found.push(m[1].slice(2, -3));
      }
      assert.deepEqual(found.sort(), local[n].sort(), n);
    }
  });
  test('the password and security settings sit in one place each', () => {
    assert.match(read('password'), /iterations: 100000/);
    assert.equal((read('password').match(/iterations:/g) || []).length, 2);
    assert.match(read('security'), /windowMinutes = 15/);
    assert.match(read('security'), /maxAttempts = 5/);
    for (const n of ['session', 'account']) assert.doesNotMatch(read(n), /iterations:|windowMinutes/);
  });
  test('each part stays under 250 lines', () => { for (const n of parts) assert.ok(read(n).split('\n').length < 250, n); });
});
