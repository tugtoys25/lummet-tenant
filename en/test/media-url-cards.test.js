import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newsImageLinks, newsImageTag } from '../worker/media-url.js';
import { cardsCss } from '../worker/studio-pro/cards.js';

const URL1 = 'https://site.example/media/news/1763500000000-a1b2c3d4e5f60718.webp';
const THUMB = 'https://site.example/cdn-cgi/image/width=400,format=webp/media/news/1763500000000-a1b2c3d4e5f60718.webp';

test('like the author page: the original first, the thumbnail only as the second try', () => {
  assert.deepEqual(newsImageLinks({ featured_image_url: URL1, featured_image_thumbnail: THUMB }), { src: URL1, alt: THUMB });
  assert.deepEqual(newsImageLinks({ featured_image_thumbnail: THUMB }), { src: THUMB, alt: '' });
  assert.deepEqual(newsImageLinks({ featured_image_url: URL1 }), { src: URL1, alt: '' });
  assert.deepEqual(newsImageLinks({}), { src: '', alt: '' });
});
test('the card picture is escaped, has the fallback, and removes itself when nothing loads', () => {
  const tag = newsImageTag({ featured_image_url: URL1, featured_image_thumbnail: THUMB }, 'A "quoted" <title>');
  assert.match(tag, new RegExp(`src="${URL1.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}"`)); assert.match(tag, /data-alt="https:\/\/site\.example\/cdn-cgi/);
  assert.match(tag, /onerror="[^"]*\.remove\(\)/); assert.ok(!tag.includes('<title>'));
  assert.equal(newsImageTag({}, 'x'), '');
});
test('the homepage cards (default and Advanced Homepage) use that picture, in the markup the homepage CSS styles', () => {
  const home = readFileSync(new URL('../worker/controllers/home.js', import.meta.url), 'utf8');
  assert.match(home, /class="news-card__image">\$\{img\}/); assert.match(home, /class="news-card__body"/); assert.match(home, /newsImageTag\(n, /);
  assert.match(readFileSync(new URL('../worker/advanced-home/render.js', import.meta.url), 'utf8'), /newsImageTag\(n, n\.title\)/);
});
test('author cards: the surface is the card itself, so a Card Studio style that colours .ah-card is what the reader sees', () => {
  const css = readFileSync(new URL('../static/css/authors.css', import.meta.url), 'utf8');
  assert.match(css, /\.ah-card \{[^}]*background: var\(--ah-card-bg, #fff\)/);
  assert.match(css, /\.ah-card a \{[^}]*background: transparent;[^}]*color: inherit/);
  assert.match(cardsCss({ id: 'glass-dark', custom: {} }), /\.ah-card/);
  assert.match(css, /body\.dsp-cards \.ah-section \{[^}]*background: transparent/);
});
