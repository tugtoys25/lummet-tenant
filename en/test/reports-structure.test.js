// Guards the split of worker/database/reports.js: the facade keeps the public API, parts stay small,
// every static and dynamic import resolves, and there is no import cycle.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as facade from '../worker/database/reports.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'worker/database/reports');
const parts = readdirSync(DIR).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3)).sort();
const read = (n) => readFileSync(join(DIR, `${n}.js`), 'utf-8');

describe('reports layout', () => {
  test('the facade exports the same nine functions as before, and only re-exports', () => {
    assert.deepEqual(Object.keys(facade).sort(), ['executeReportRun', 'getAllReportDefinitions', 'getReportColumnOptions', 'isValidReportType', 'runDueReportSchedules', 'runDueReportSchedulesNow', 'runReport', 'toCsv', 'toHtml']);
    const body = readFileSync(join(ROOT, 'worker/database/reports.js'), 'utf-8').split('\n').filter((l) => l.trim() && !l.trim().startsWith('//'));
    for (const l of body) assert.match(l, /^export \{ [A-Za-z, ]+ \} from "\.\/reports\/[a-z-]+\.js";$/);
  });

  test('eight parts, each under 250 lines', () => {
    assert.deepEqual(parts, ['cohort-ltv', 'columns', 'export', 'handlers-core', 'operational-health', 'reconciliation', 'run', 'scheduling']);
    for (const n of parts) assert.ok(read(n).split('\n').length < 250, `${n} too long`);
  });

  test('every static and dynamic relative import resolves; no cycle between parts', () => {
    const graph = {};
    for (const n of parts) {
      graph[n] = [];
      for (const m of read(n).matchAll(/(?:from\s+|import\(\s*)["'](\.[^"']+)["']/g)) {
        assert.ok(existsSync(join(DIR, m[1])), `${n} imports missing ${m[1]}`);
        if (m[1].startsWith('./')) graph[n].push(m[1].slice(2, -3));
      }
    }
    const visit = (n, stack) => { assert.ok(!stack.includes(n), `cycle ${[...stack, n].join(' > ')}`); graph[n].forEach((d) => visit(d, [...stack, n])); };
    parts.forEach((n) => visit(n, []));
  });
});
