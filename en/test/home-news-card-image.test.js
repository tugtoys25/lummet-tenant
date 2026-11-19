import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const home = readFileSync(new URL('../worker/controllers/home.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../css-src/main/15-news-card-bare-image.css', import.meta.url), 'utf8');

test('homepage news card wraps the image the way the homepage CSS expects', () => {
  assert.match(home, /class="news-card__image"><img src=/);
  assert.match(home, /class="news-card__body"/);
  assert.match(home, /class="news-card__link"/);
});

test('homepage news card escapes the image URL, alt text and title', () => {
  assert.match(home, /src="\$\{escapeText\(img\)\}"/);
  assert.match(home, /alt="\$\{alt\}"/);
  assert.match(home, /<h3>\$\{escapeText\(n\.title\)\}<\/h3>/);
});

test('a bare image in a news card (Advanced Homepage) is sized by CSS', () => {
  assert.match(css, /\.news-grid \.news-card > img\s*\{[^}]*aspect-ratio: 16 \/ 9/);
});
