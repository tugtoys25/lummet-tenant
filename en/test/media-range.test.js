// test/media-range.test.js -- byte-range support for /media files (video playback on Safari and iPhone).
// Requests without a Range header must behave exactly as before.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { serveMedia, parseByteRange } from '../worker/media-upload.js';

const DATA = new Uint8Array(Array.from({ length: 100 }, (_, i) => i));

function bucket(calls = []) {
  return {
    async head() { return { size: DATA.length, httpEtag: '"e1"', httpMetadata: { contentType: 'video/mp4' } }; },
    async get(key, opts) {
      calls.push(opts || null);
      const slice = opts && opts.range ? DATA.slice(opts.range.offset, opts.range.offset + opts.range.length) : DATA;
      return { body: slice, httpEtag: '"e1"', httpMetadata: { contentType: 'video/mp4' } };
    }
  };
}
const req = (headers = {}) => new Request('https://t.test/media/videos/a.mp4', { headers });

describe('parseByteRange', () => {
  test('forms browsers send', () => {
    assert.deepEqual(parseByteRange('bytes=0-9', 100), { start: 0, end: 9 });
    assert.deepEqual(parseByteRange('bytes=90-', 100), { start: 90, end: 99 });
    assert.deepEqual(parseByteRange('bytes=-10', 100), { start: 90, end: 99 });
    assert.deepEqual(parseByteRange('bytes=0-9999', 100), { start: 0, end: 99 });
    assert.deepEqual(parseByteRange('bytes=0-0', 100), { start: 0, end: 0 });
  });
  test('out of range is unsatisfiable; unsupported forms are ignored', () => {
    assert.equal(parseByteRange('bytes=100-120', 100), 'unsatisfiable');
    assert.equal(parseByteRange('bytes=50-10', 100), 'unsatisfiable');
    assert.equal(parseByteRange('bytes=-0', 100), 'unsatisfiable');
    assert.equal(parseByteRange('bytes=0-1,5-6', 100), null);
    assert.equal(parseByteRange('items=0-1', 100), null);
    assert.equal(parseByteRange('bytes=-', 100), null);
  });
});

describe('serveMedia', () => {
  test('a normal request is unchanged (200, whole file) and now advertises ranges', async () => {
    const calls = [];
    const res = await serveMedia(req(), { MEDIA_BUCKET: bucket(calls) }, 'media/videos/a.mp4');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Accept-Ranges'), 'bytes');
    assert.equal(res.headers.get('Content-Type'), 'video/mp4');
    assert.equal(res.headers.get('Cache-Control'), 'public, max-age=31536000, immutable');
    assert.deepEqual(calls, [null]);
    assert.equal((await res.arrayBuffer()).byteLength, 100);
  });

  test('a Range request returns 206 with the right bytes and Content-Range', async () => {
    const res = await serveMedia(req({ Range: 'bytes=10-19' }), { MEDIA_BUCKET: bucket() }, 'media/videos/a.mp4');
    assert.equal(res.status, 206);
    assert.equal(res.headers.get('Content-Range'), 'bytes 10-19/100');
    assert.equal(res.headers.get('Content-Length'), '10');
    assert.deepEqual([...new Uint8Array(await res.arrayBuffer())], [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
  });

  test('Safari-style "bytes=0-1" probe works', async () => {
    const res = await serveMedia(req({ Range: 'bytes=0-1' }), { MEDIA_BUCKET: bucket() }, 'media/videos/a.mp4');
    assert.equal(res.status, 206);
    assert.equal(res.headers.get('Content-Range'), 'bytes 0-1/100');
  });

  test('a range past the end is 416, a missing file is 404', async () => {
    const bad = await serveMedia(req({ Range: 'bytes=500-600' }), { MEDIA_BUCKET: bucket() }, 'media/videos/a.mp4');
    assert.equal(bad.status, 416);
    assert.equal(bad.headers.get('Content-Range'), 'bytes */100');
    const none = await serveMedia(req({ Range: 'bytes=0-1' }), { MEDIA_BUCKET: { head: async () => null, get: async () => null } }, 'media/x');
    assert.equal(none.status, 404);
  });

  test('an unsupported Range form falls back to the whole file', async () => {
    const res = await serveMedia(req({ Range: 'bytes=0-1,5-6' }), { MEDIA_BUCKET: bucket() }, 'media/videos/a.mp4');
    assert.equal(res.status, 200);
  });
});
