// Guards the split of worker/media-upload.js (v22.53): the facade keeps the public API, parts stay small,
// no import cycle, and the upload limits and range parsing stay in one place each.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as facade from '../worker/media-upload.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'worker/media-upload');
const parts = readdirSync(DIR).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3)).sort();
const read = (n) => readFileSync(join(DIR, `${n}.js`), 'utf-8');

describe('media-upload layout', () => {
  test('the facade exports the same 8 names as before, and nothing internal', () => {
    assert.deepEqual(Object.keys(facade).sort(), ['generatePublicUrl', 'generateR2Key', 'generateThumbnailUrls', 'handleDelete', 'handleUpload', 'parseByteRange', 'serveMedia', 'validateFile']);
  });
  test('the facade only re-exports from media-upload/', () => {
    const body = readFileSync(join(ROOT, 'worker/media-upload.js'), 'utf-8').split('\n').filter((l) => l.trim() && !l.trim().startsWith('//'));
    assert.equal(body.length, 4);
    for (const l of body) assert.match(l, /^export \{ [A-Za-z0-9_, ]+ \} from "\.\/media-upload\/[a-z-]+\.js";$/);
  });
  test('five parts, imports resolve, no cycle: http and files <- upload, http <- delete, serve alone', () => {
    assert.deepEqual(parts, ['delete', 'files', 'http', 'serve', 'upload']);
    const local = { http: [], files: [], serve: [], delete: ['http'], upload: ['files', 'http'] };
    for (const n of parts) {
      const found = [];
      for (const m of read(n).matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
        assert.ok(existsSync(join(DIR, m[1])) || existsSync(join(ROOT, 'worker', m[1].replace(/^\.\.\//, ''))), `${n} imports missing ${m[1]}`);
        if (m[1].startsWith('./')) found.push(m[1].slice(2, -3));
      }
      assert.deepEqual(found.sort(), local[n].sort(), n);
    }
  });
  test('size limits and allowed types sit in files.js only; range parsing in serve.js only', () => {
    assert.match(read('files'), /MAX_IMAGE_SIZE = 10 \* 1024 \* 1024/);
    assert.match(read('files'), /MAX_VIDEO_SIZE = 100 \* 1024 \* 1024/);
    assert.match(read('files'), /MAX_DOCUMENT_SIZE = 5 \* 1024 \* 1024/);
    for (const n of parts.filter((p) => p !== 'files')) assert.doesNotMatch(read(n), /MAX_(IMAGE|VIDEO|DOCUMENT)_SIZE|ALLOWED_MIME_TYPES/, n);
    for (const n of parts.filter((p) => p !== 'serve')) assert.doesNotMatch(read(n), /bytes=/, n);
  });
  test('each part stays under 250 lines', () => { for (const n of parts) assert.ok(read(n).split('\n').length < 250, n); });
});
