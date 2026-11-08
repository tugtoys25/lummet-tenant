import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Renderer } from '../worker/render.js';
import { setLocal } from '../worker/cache.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
test('old site bars: stored text, colours and links are escaped or validated', async () => {
  const evil = { id: 1, type: 'announcement', position: 'top', dismissible: 0, title: '<script>x</script>', content: '"><img src=x onerror=1>', button_text: '<b>', link: 'javascript:alert(1)', bg_color: 'red;}</style><script>', text_color: '#fff' };
  const env = { DB: { prepare: () => ({ bind: () => ({ all: async () => ({ results: [evil] }) }) }) } };
  const r = Object.create(Renderer.prototype); r.env = env;
  const out = (await r.loadActiveBanners('US')).map((b) => b.html).join('');
  assert.ok(!out.includes('<script') && !/<img[^>]+onerror/.test(out) && !out.includes('javascript:') && !out.includes('red;}'));
  assert.match(out, /&lt;script&gt;/);
});
test('admin table no longer builds rows with innerHTML or inline onclick', () => {
  const s = readFileSync(join(ROOT, 'static/js/banner-admin.js'), 'utf8');
  assert.ok(!/tbody\.innerHTML = banners/.test(s) && !/onclick="editBanner/.test(s));
});
