import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newsImageSources, newsImageTag } from '../worker/news-image.js';
import { renderAdvancedHome } from '../worker/advanced-home/render.js';
import { starterTemplates } from '../worker/advanced-home/templates.js';

const row = {
  featured_image_url: 'https://lummet.example.workers.dev/media/news/1-abc.jpg',
  featured_image_thumbnail: 'https://lummet.example.workers.dev/cdn-cgi/image/width=400,format=webp/media/news/1-abc.jpg'
};

test('media URLs become same-site paths, thumbnail first, original as fallback', () => {
  assert.deepEqual(newsImageSources(row), {
    src: '/cdn-cgi/image/width=400,format=webp/media/news/1-abc.jpg',
    fallback: '/media/news/1-abc.jpg'
  });
});

test('no thumbnail: the original is used and there is no fallback', () => {
  assert.deepEqual(newsImageSources({ featured_image_url: 'https://x.com/media/a.png' }), { src: '/media/a.png', fallback: '' });
});

test('only a thumbnail: it is used', () => {
  assert.equal(newsImageSources({ featured_image_thumbnail: '/cdn-cgi/image/width=400/media/a.png' }).src, '/cdn-cgi/image/width=400/media/a.png');
});

test('other URLs (external image) are left as they are', () => {
  assert.equal(newsImageSources({ featured_image_url: 'https://cdn.example.com/pic.jpg' }).src, 'https://cdn.example.com/pic.jpg');
});

test('no image gives no tag', () => {
  assert.equal(newsImageTag({}, 'x'), '');
  assert.equal(newsImageTag({ featured_image_url: '   ' }, 'x'), '');
});

test('the tag carries the fallback and hides itself if both fail; values are escaped', () => {
  const html = newsImageTag(row, 'A "quoted" <b>');
  assert.match(html, /src="\/cdn-cgi\/image\/width=400,format=webp\/media\/news\/1-abc\.jpg"/);
  assert.match(html, /data-fallback="\/media\/news\/1-abc\.jpg"/);
  assert.match(html, /onerror="[^"]*style\.display='none'/);
  assert.ok(html.includes('alt="A &quot;quoted&quot; &lt;b&gt;"'));
  assert.ok(!html.includes('<b>'));
});

test('Advanced Homepage news cards use the same image tag', () => {
  const cfg = JSON.parse(JSON.stringify(starterTemplates().find((t) => t.id === 'casino').config));
  const d = { casinoCount: 3, country: 'GB', countryName: 'United Kingdom', categories: [], countries: [], payments: [], reviews: [], news: [{ slug: 'n', title: 'N', created_at: '2026-01-02', ...row }] };
  const { main } = renderAdvancedHome(cfg, d, {});
  assert.match(main, /data-fallback="\/media\/news\/1-abc\.jpg"/);
  assert.match(main, /src="\/cdn-cgi\/image\/width=400,format=webp\/media\/news\/1-abc\.jpg"/);
});
