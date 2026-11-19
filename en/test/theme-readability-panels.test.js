import { test } from 'node:test';
import assert from 'node:assert/strict';
import { READABILITY_CSS } from '../worker/site-settings/theme-readability.js';

test('soft fills inside white panels follow the panel, so dark pages never put a dark fill under dark text', () => {
  for (const sel of ['.info-block', '.casino-hero', '.research-table-wrap', '.dt__table', '.mobile-sticky-cta']) assert.ok(READABILITY_CSS.includes(sel), sel);
  assert.match(READABILITY_CSS, /--bg: color-mix\(in srgb, var\(--theme-card-text\) 5%, #ffffff\)/);
  assert.match(READABILITY_CSS, /--support-bg: color-mix/);
});
test('research and dataset tables are a white sheet with dark text; Card Studio roots are not re-tinted', () => {
  assert.match(READABILITY_CSS, /:where\(\.research-table-wrap\) \{\s*background: #ffffff;/);
  assert.match(READABILITY_CSS, /:where\(\.research-table-wrap, \.dt__table\) :where\(th, td, caption\)/);
  const tint = READABILITY_CSS.slice(READABILITY_CSS.indexOf('Soft fills inside white panels'));
  const block = tint.slice(0, tint.indexOf('}'));
  assert.ok(!/\.casino-card|\.news-card|\.rv-card|\.research-card/.test(block.split('{')[0]), 'card roots stay out of the tint scope');
});
