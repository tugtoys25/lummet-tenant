// Guards the split of worker/ai/studio.js (v22.31): the facade keeps the public API, parts stay small, no import cycle.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as facade from '../worker/ai/studio.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'worker/ai/studio');
const parts = readdirSync(DIR).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3)).sort();
const read = (n) => readFileSync(join(DIR, `${n}.js`), 'utf-8');

describe('ai studio layout', () => {
  test('the facade exports the same 24 names as before', () => {
    assert.deepEqual(Object.keys(facade).sort(), [
      'HISTORY_KEEP_DAYS', 'MAX_FIELD', 'MAX_SOURCE_CHARS', 'MODEL', 'RATE_MAX', 'RATE_WINDOW_MIN', 'TASKS', 'applyResult', 'auditContent',
      'checkUrl', 'draftFeedbackFix', 'esc', 'fetchSourceText', 'handleAiStudio', 'listDraftFaqs', 'listTasks', 'loadItemFacts',
      'parseJsonLoose', 'readHistory', 'recordHistory', 'runTask', 'slugify', 'stripHtml', 'textToHtml'
    ]);
  });
  test('the facade only re-exports from studio/', () => {
    const body = readFileSync(join(ROOT, 'worker/ai/studio.js'), 'utf-8').split('\n').filter((l) => l.trim() && !l.trim().startsWith('//'));
    assert.ok(body.length >= 8);
    for (const l of body) assert.match(l, /^export \{ [A-Za-z_, ]+ \} from "\.\/studio\/[a-z-]+\.js";$/);
  });
  test('the nine parts exist, each under 300 lines, imports resolve, no cycle', () => {
    assert.deepEqual(parts, ['apply-result', 'audit', 'config', 'facts', 'history', 'http', 'run-task', 'tasks', 'text-utils']);
    const graph = {};
    for (const n of parts) {
      const s = read(n); assert.ok(s.split('\n').length < 300, `${n} too long`);
      graph[n] = [];
      for (const m of s.matchAll(/(?:from |import\()\s*"(\.[^"]+)"/g)) {
        assert.ok(existsSync(join(DIR, m[1])), `${n} imports missing ${m[1]}`);
        if (m[1].startsWith('./')) graph[n].push(m[1].slice(2, -3));
      }
    }
    const visit = (n, stack) => { assert.ok(!stack.includes(n), `cycle ${[...stack, n].join(' > ')}`); graph[n].forEach((d) => visit(d, [...stack, n])); };
    parts.forEach((n) => visit(n, []));
  });
  test('only the HTTP part builds Response objects', () => {
    for (const n of parts.filter((p) => p !== 'http')) assert.equal(/new Response\(/.test(read(n)), false, `${n} should not build responses`);
    assert.match(read('http'), /new Response\(/);
  });
});
