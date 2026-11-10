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

test('stacked header: logo centred on top, menu below, desktop only', () => {
  const css = buildLayoutBlock({ themeHeaderLayout: 'stacked' });
  assert.match(css, /@media \(min-width: 769px\) \{[\s\S]*grid-template-areas: "\. logo actions" "nav nav nav"/);
  assert.match(css, /\.header-inner \.main-nav \{ grid-area: nav; justify-content: center;/);
  assert.doesNotMatch(css, /display:\s*none/);
  assert.equal(buildLayoutBlock({ themeHeaderLayout: 'default' }), '');
});

test('section styles only change backgrounds, borders and spacing', () => {
  assert.match(buildLayoutBlock({ themeSectionStyle: 'bands' }), /\.section:nth-of-type\(even\) \{ background: var\(--theme-section-alt\); \}/);
  assert.match(buildLayoutBlock({ themeSectionStyle: 'boxed' }), /\.section > \.container \{ border: 1px solid var\(--theme-border\)/);
  assert.match(buildLayoutBlock({ themeSectionStyle: 'divided' }), /\.section \+ \.section \{[^}]*border-top/);
  for (const v of ['bands', 'boxed', 'divided']) assert.doesNotMatch(buildLayoutBlock({ themeSectionStyle: v }), /display:\s*none|visibility|opacity/);
});

test('section heading styles: centred, accent bar, or both', () => {
  assert.match(buildLayoutBlock({ themeSectionHeading: 'centered' }), /\.section-header \{ flex-direction: column;/);
  assert.match(buildLayoutBlock({ themeSectionHeading: 'accent' }), /h2::after \{ content: ""; display: block; width: 48px/);
  const both = buildLayoutBlock({ themeSectionHeading: 'centered-accent' });
  assert.match(both, /\.section-header \{ flex-direction: column;/);
  assert.match(both, /margin: 8px auto 0/);
});

test('the header, section and heading settings validate and reject unknown values', () => {
  assert.deepEqual(validateSettingsInput({ theme_header_layout: 'stacked', theme_section_style: 'boxed', theme_section_heading: 'centered-accent' }).errors, []);
  assert.equal(validateSettingsInput({ theme_section_style: 'fancy' }).errors.length, 1);
});

test('the professional templates cover header, hero and section structure', () => {
  const by = Object.fromEntries(TEMPLATE_PACKS.map((t) => [t.id, t.settings]));
  assert.equal(by['editorial'].theme_header_layout, 'stacked');
  assert.equal(by['magazine'].theme_header_layout, 'stacked');
  assert.equal(by['modern-bands'].theme_section_style, 'bands');
  assert.equal(by['modern-bands'].site_hero_alignment, 'left');
  assert.equal(by['modern-bands'].site_hero_height, 'tall');
  assert.equal(by['compact-list'].site_header_height, 'compact');
  assert.equal(by['wide-rows'].site_header_nav_align, 'right');
  assert.ok(TEMPLATE_PACKS.length >= 8);
});
