// Replay protection for the HMAC Super API: a nonce can be used once per credential, even under concurrency.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { checkAndConsumeNonce } from '../worker/super/auth.js';

function db() { const d = createTestDb(); applyMigrations(d); return d; }

test('a nonce is accepted once and rejected on replay', async () => {
  const d = db(); const now = Date.now();
  assert.equal(await checkAndConsumeNonce(d, 'cred-1', 'n-1', now), true);
  assert.equal(await checkAndConsumeNonce(d, 'cred-1', 'n-1', now + 1), false);
  assert.equal(await checkAndConsumeNonce(d, 'cred-1', 'n-2', now + 2), true);
});

test('the same nonce under a different credential is a different nonce', async () => {
  const d = db(); const now = Date.now();
  assert.equal(await checkAndConsumeNonce(d, 'cred-1', 'shared', now), true);
  assert.equal(await checkAndConsumeNonce(d, 'cred-2', 'shared', now), true);
});

test('simultaneous requests with one nonce: exactly one wins and the rest are clean rejections, never exceptions', async () => {
  const d = db(); const now = Date.now();
  const results = await Promise.all(Array.from({ length: 8 }, () => checkAndConsumeNonce(d, 'cred-1', 'race', now)));
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(results.filter((r) => r === false).length, 7);
});
