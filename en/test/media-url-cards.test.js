import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sameSiteMedia, featuredImageSrc, cardImgTag } from '../worker/media-url.js';
import { cardsCss } from '../worker/studio-pro/cards.js';

const KEY = 'media/news/1763500000000-a1b2c3d4e5f60718.webp';

test('platform uploads become same-site paths, whatever host or resizing prefix the stored link carries', () => {
  for (const u of [`https://old-host.example/${KEY}`, `http://www.site.com/${KEY}`, `https://x.workers.dev/cdn-cgi/image/width=400,format=webp/${KEY}`, `/${KEY}`, `/cdn-cgi/image/width=400,format=webp/${KEY}`, `https://h.example/${KEY}?v=2`])
    assert.equal(sameSiteMedia(u).split('?')[0], `/${KEY}`, u);
});
test('links that are not platform uploads are left alone', () => {
  for (const u of ['https://cdn.other.com/media/logo.png', 'https://cdn.other.com/images/a.webp', '/static/images/default.png', '', null, undefined, 'data:image/png;base64,AAAA'])
    assert.equal(sameSiteMedia(u), u == null ? '' : u);
});
test('the card picture is the original, same-site, and hides itself if it cannot load', () => {
  const row = { featured_image_url: `https://old-host.example/${KEY}`, featured_image_thumbnail: `https://old-host.example/cdn-cgi/image/width=400,format=webp/${KEY}` };
  assert.equal(featuredImageSrc(row), `/${KEY}`);
  assert.equal(featuredImageSrc({ featured_image_thumbnail: `https://h/cdn-cgi/image/width=400,format=webp/${KEY}` }), `/${KEY}`);
  const tag = cardImgTag(featuredImageSrc(row), 'A "quoted" <title>');
  assert.match(tag, /src="\/media\/news\//); assert.match(tag, /onerror="this\.style\.display='none'"/); assert.ok(!tag.includes('<title>'));
  assert.equal(cardImgTag('', 'x'), '');
});
test('the homepage card uses the wrapped markup the homepage CSS styles, with the same-site picture', () => {
  const home = readFileSync(new URL('../worker/controllers/home.js', import.meta.url), 'utf8');
  assert.match(home, /class="news-card__image">\$\{img\}/); assert.match(home, /class="news-card__body"/); assert.match(home, /featuredImageSrc\(n\)/);
  const adv = readFileSync(new URL('../worker/advanced-home/render.js', import.meta.url), 'utf8');
  assert.match(adv, /cardImgTag\(featuredImageSrc\(n\)/);
});
test('author cards: the surface is the card itself, so a Card Studio style that colours .ah-card is what the reader sees', () => {
  const css = readFileSync(new URL('../static/css/authors.css', import.meta.url), 'utf8');
  assert.match(css, /\.ah-card \{[^}]*background: var\(--ah-card-bg, #fff\)/);
  assert.match(css, /\.ah-card a \{[^}]*background: transparent;[^}]*color: inherit/);
  assert.match(cardsCss({ id: 'glass-dark', custom: {} }), /\.ah-card/);   // Card Studio still styles the card root
  assert.match(css, /body\.dsp-cards \.ah-section \{[^}]*background: transparent/);   // Card Studio cards sit on the page, not on a white panel
});
