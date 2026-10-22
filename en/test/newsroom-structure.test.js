// Guards the split of worker/database/newsroom.js (v22.37): the facade keeps the public API, parts stay small, no import cycle.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as facade from '../worker/database/newsroom.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'worker/database/newsroom');
const parts = readdirSync(DIR).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3)).sort();
const read = (n) => readFileSync(join(DIR, `${n}.js`), 'utf-8');

describe('newsroom database layout', () => {
  test('the facade exports the same 59 names as before', () => {
    assert.deepEqual(Object.keys(facade).sort(), ["ARTICLE_TYPES", "CONTENT_CLASSES", "CORRECTION_TYPES", "FACT_CHECK_STATUSES", "LABELS", "PUBLIC_FLAG_KEYS", "RELATION_TYPES", "SOURCE_TYPES", "TRACKED_FIELDS", "WORKFLOW_STATUSES", "addCorrection", "assertSectionSlugFree", "canTransition", "createSection", "diffArticle", "findSlugCollisions", "getCountryArticles", "getCountryByCode", "getCountryBySlug", "getEditorialState", "getEffectiveStatus", "getEntityArticles", "getEntityBySlug", "getLandingSitemapEntries", "getNewsFlags", "getPublicCorrections", "getPublicRelated", "getPublicSection", "getPublicSources", "getPublicTimeline", "getRedirectTarget", "getRegionArticles", "getRegionBySlug", "getRevision", "getSectionArticles", "getSectionBySlug", "getSectionIds", "getSeriesArticles", "getSeriesBySlug", "getTopicArticles", "getTopicBySlug", "isNewsFlagEnabled", "listRevisions", "loadArticleExtras", "loadDiscovery", "loadPublicNewsroom", "normalizeSource", "plainText", "recordRevision", "recordSlugRedirect", "replaceArticleSources", "requiredActionFor", "resetCountryCache", "resetNewsFlagCache", "setFactCheck", "setRegionCountries", "slugify", "transitionWorkflow", "validatePublicUrl"]);
  });
  test('the facade only re-exports from newsroom/', () => {
    const body = readFileSync(join(ROOT, 'worker/database/newsroom.js'), 'utf-8').split('\n').filter((l) => l.trim() && !l.trim().startsWith('//'));
    assert.ok(body.length >= 4);
    for (const l of body) assert.match(l, /^export \{ [A-Za-z_, ]+ \} from "\.\/newsroom\/[a-z-]+\.js";$/);
  });
  test('the four parts exist, each under 300 lines, imports resolve, no cycle', () => {
    assert.deepEqual(parts, ['base', 'discovery', 'editorial', 'public']);
    const graph = {};
    for (const n of parts) {
      const s = read(n); assert.ok(s.split('\n').length < 300, `${n} too long`);
      graph[n] = [];
      for (const m of s.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
        assert.ok(existsSync(join(DIR, m[1])), `${n} imports missing ${m[1]}`);
        if (m[1].startsWith('./')) graph[n].push(m[1].slice(2, -3));
      }
    }
    const visit = (n, stack) => { assert.ok(!stack.includes(n), `cycle ${[...stack, n].join(' > ')}`); graph[n].forEach((d) => visit(d, [...stack, n])); };
    parts.forEach((n) => visit(n, []));
  });
  test('the shared LIVE fragment lives in base and is used, not copied', () => {
    assert.match(read('base'), /export const LIVE = /);
    for (const n of parts.filter((p) => p !== 'base')) assert.equal(/const LIVE = /.test(read(n)), false, n);
  });
});
