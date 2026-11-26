// test/maintenance-fallback.test.js -- the maintenance page says WHY it was shown (header + one structured log line).
// Real worker entry; not covered: a real Cloudflare quota error (the messages below are the ones D1/KV raise, matched by pattern).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import { classifyFailure } from '../worker/app/fallback.js';

test('failures are labelled quota, outage or code error', () => {
  for (const m of ['D1_ERROR: Exceeded daily row read limit', 'KV GET failed: 429 Too Many Requests', 'Rate limit exceeded', 'daily quota exceeded']) assert.equal(classifyFailure(new Error(m)), 'storage_quota', m);
  for (const m of ['D1_ERROR: Network connection lost', 'fetch timed out', 'Internal error', 'KV GET failed: 503']) assert.equal(classifyFailure(new Error(m)), 'storage_unavailable', m);
  for (const m of ["Cannot read properties of undefined (reading 'x')", 'x is not a function']) assert.equal(classifyFailure(new Error(m)), 'code_error', m);
});

test('an uncaught error serves the same 503 page, with a reason header, retry hint only for temporary causes, and one log line', async () => {
  const logs = []; const orig = console.error; console.error = (...a) => logs.push(a.join(' '));
  try {
    const env = { DB: { prepare() { throw new Error('D1_ERROR: Exceeded daily row read limit'); } }, CACHE: { get() { throw new Error('KV GET failed: 429 Too Many Requests'); } } };
    const res = await worker.fetch(new Request('https://s.example/en/news'), env, { waitUntil() {}, passThroughOnException() {} });
    assert.equal(res.status, 503); assert.match(await res.text(), /right back/i);
    assert.equal(res.headers.get('x-fallback-reason'), 'storage_quota'); assert.equal(res.headers.get('retry-after'), '30');
    const line = logs.find((l) => l.includes('Maintenance fallback')); assert.ok(line, 'logged'); const j = JSON.parse(line.slice(line.indexOf('{')));
    assert.equal(j.reason, 'storage_quota'); assert.equal(j.path, '/en/news'); assert.match(j.message, /Exceeded/);
  } finally { console.error = orig; }
});

test('fetch does not depend on `this` (a detached call still works)', async () => {
  const { fetch } = worker; // how a runtime or a test may call it
  const res = await fetch(new Request('https://s.example/en/news'), { DB: { prepare() { throw new Error('boom'); } } }, { waitUntil() {} });
  assert.equal(res.status, 503); assert.equal(res.headers.get('x-fallback-reason'), 'code_error'); assert.notEqual(res.headers.get('retry-after'), '30', 'a code error is not promised to clear in 30 seconds');
});
