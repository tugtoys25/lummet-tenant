// Phase 10 / B2: the offline load harness itself (tools/load/config-load-harness.mjs).
// Tests its argument parsing, statistics and pool, and one tiny end-to-end run so the harness cannot rot unnoticed.
// NOT verified: anything about real D1, KV, Cloudflare or real load; the harness is not a capacity test.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, percentile, summarize, runPool, runHarness, formatReport, EXIT } from '../../tools/load/config-load-harness.mjs';

describe('arguments', () => {
  test('defaults, overrides and refusals', () => {
    assert.equal(parseArgs([]).requests, 3000);
    const o = parseArgs(['--requests', '50', '--concurrency', '5', '--hosts', '2', '--max-p95-ms', '10', '--max-error-rate', '0.01', '--json', 'r.json', '--quiet']);
    assert.deepEqual([o.requests, o.concurrency, o.hosts, o.maxP95Ms, o.maxErrorRate, o.json, o.quiet], [50, 5, 2, 10, 0.01, 'r.json', true]);
    for (const bad of [['--requests', '0'], ['--requests', 'x'], ['--concurrency', '9999'], ['--max-error-rate', '2'], ['--json'], ['--nope']]) assert.throws(() => parseArgs(bad), /must be|needs|Unknown/);
    assert.equal(EXIT.USAGE, 2);
  });
});

describe('statistics and pool', () => {
  test('percentile and summary', () => {
    const s = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    assert.equal(percentile(s, 50), 5); assert.equal(percentile(s, 95), 10); assert.equal(percentile([], 95), 0);
    const m = summarize([3, 1, 2]); assert.deepEqual([m.n, m.meanMs, m.p50Ms, m.maxMs], [3, 2, 2, 3]);
  });
  test('the pool runs every call once, never exceeds the concurrency, and records outcomes and thrown errors', async () => {
    let live = 0, peak = 0;
    const r = await runPool(40, 4, async (i) => { live++; peak = Math.max(peak, live); await new Promise((x) => setImmediate(x)); live--; if (i === 7) throw new Error('boom'); return i % 2 ? 'ok' : '500'; });
    assert.equal(r.n, 40); assert.ok(peak <= 4 && peak >= 2);
    assert.equal(r.outcomes['threw:boom'], 1); assert.equal(Object.values(r.outcomes).reduce((a, b) => a + b, 0), 40);
  });
});

describe('end to end, tiny', () => {
  test('a small run meets every check, covers the limiter and the size cap, and prints a report', async () => {
    const report = await runHarness(parseArgs(['--requests', '60', '--concurrency', '4', '--hosts', '3', '--max-p95-ms', '5000']));
    const failed = report.checks.filter((c) => !c.pass);
    assert.deepEqual(failed, [], JSON.stringify(failed));
    const names = report.checks.map((c) => c.name).join('|');
    for (const part of ['zero profile', 'exactly the configured number', 'Retry-After', '413']) assert.match(names, new RegExp(part));
    assert.match(formatReport(report), /RESULT: all checks met \(offline only/);
    assert.match(report.notCapacity, /not capacity/i);
  });
});
