import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildThemeCss } from '../worker/site-settings/theme.js';
import { validateSettingsInput } from '../worker/site-profile/settings-groups.js';

test('chosen fonts, size and section band reach the theme CSS', () => {
  const css = buildThemeCss({ themeFontBody: 'serif', themeFontHeading: 'display', themeFontSize: 'large', themeSectionBackground: '#ffeecc' });
  assert.match(css, /body, button, input, select, textarea \{ font-family: Georgia/);
  assert.match(css, /h1, h2, h3, h4, h5, h6 \{ font-family: Impact/);
  assert.match(css, /html \{ font-size: 106.25%; \}/);
  assert.match(css, /--theme-section-alt: #ffeecc/);
});

test('defaults add no typography rules', () => {
  const css = buildThemeCss({});
  assert.doesNotMatch(css, /html \{ font-size/);
  assert.doesNotMatch(css, /h1, h2, h3, h4, h5, h6 \{ font-family/);
});

test('hostile values never reach the CSS', () => {
  const css = buildThemeCss({ themeFontBody: 'x;}body{display:none', themeFontSize: '1px;}', themeSectionBackground: 'red;}body{display:none' });
  assert.doesNotMatch(css, /display:none/);
});

test('the settings API accepts listed fonts and rejects others', () => {
  assert.deepEqual(validateSettingsInput({ theme_font_body: 'serif' }).errors, []);
  assert.equal(validateSettingsInput({ theme_font_body: 'comic-sans' }).errors.length, 1);
});

test('dark page: the open mobile menu panel gets the dark header colour, not the white text colour', () => {
  const dark = buildThemeCss({ themeBackground: '#1a1a1a', themeText: '#ffffff', themeSurface: '#111111' });
  assert.match(dark, /\.site-header \.main-nav\.active \{ background: var\(--theme-chrome\); \}/);
  assert.doesNotMatch(buildThemeCss({}), /main-nav\.active/);
});
