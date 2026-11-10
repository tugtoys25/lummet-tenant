import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildThemeCss } from '../worker/site-settings/theme.js';
import { buildLayoutBlock } from '../worker/site-settings/theme-layouts.js';
import { validateSettingsInput } from '../worker/site-profile/settings-groups.js';
import { TEMPLATE_PACKS } from '../worker/site-profile/design-packs.js';

test('defaults add no layout CSS at all', () => {
  assert.equal(buildLayoutBlock({}), '');
  assert.equal(buildLayoutBlock({ themeListLayout: 'default', themeReviewLayout: 'default' }), '');
  assert.doesNotMatch(buildThemeCss({}), /PAGE LAYOUTS/);
});

test('rows layout: one row per casino on wide screens, still stacked on phones', () => {
  const css = buildLayoutBlock({ themeListLayout: 'rows' });
  assert.match(css, /@media \(min-width: 768px\) \{\s*\.casino-card \{ display: grid; grid-template-columns: 150px/);
  assert.match(css, /\.casino-grid \{ grid-template-columns: 1fr;/);
  assert.doesNotMatch(css, /display:\s*none/, 'no content is ever hidden');
});

test('compact layout and the sidebar positions', () => {
  assert.match(buildLayoutBlock({ themeListLayout: 'compact' }), /logo-wrap \{ width: 56px/);
  assert.match(buildLayoutBlock({ themeReviewLayout: 'left' }), /\.layout-wrapper \.sidebar \{ order: -1; \}/);
  assert.match(buildLayoutBlock({ themeReviewLayout: 'stacked' }), /\.layout-wrapper \{ grid-template-columns: 1fr; \}/);
  assert.match(buildLayoutBlock({ themeReviewLayout: 'left' }), /min-width: 969px/, 'the mobile sidebar behaviour is left alone');
});

test('hostile or unknown values fall back to the default', () => {
  assert.equal(buildLayoutBlock({ themeListLayout: 'x;}body{display:none', themeReviewLayout: 'nope' }), '');
});

test('the settings API accepts the layout values and rejects others', () => {
  assert.deepEqual(validateSettingsInput({ theme_list_layout: 'rows', theme_review_layout: 'stacked' }).errors, []);
  assert.equal(validateSettingsInput({ theme_list_layout: 'grid9' }).errors.length, 1);
});

test('templates carry the layouts', () => {
  const by = Object.fromEntries(TEMPLATE_PACKS.map((t) => [t.id, t.settings]));
  assert.equal(by['stadium-rows'].theme_list_layout, 'rows');
  assert.equal(by['compact-list'].theme_list_layout, 'compact');
  assert.equal(by['wide-rows'].theme_review_layout, 'left');
  assert.equal(by['editorial'].theme_review_layout, 'stacked');
  assert.equal(by['classic-cards'].theme_list_layout, 'default');
});
