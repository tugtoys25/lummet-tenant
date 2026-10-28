// The theme must never produce unreadable colour pairs, whatever palette is saved (light, dark, or a poor one).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildThemeCss, readableOn } from '../worker/site-settings/theme.js';
import { DEFAULTS } from '../worker/site-settings/defaults.js';

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const lum = (rgb) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]); };
const ratio = (a, b) => { const l1 = lum(hex(a)), l2 = lum(hex(b)); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
const token = (css, name) => { const m = css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`)); assert.ok(m, `${name} missing`); return m[1]; };

const PALETTES = {
  'default (professional light)': {},
  midnight: { themeBackground: '#050505', themeSurface: '#0f0f12', themeSurfaceAlt: '#15151a', themeText: '#ffffff', themeTextMuted: '#a1a1aa', themeBorder: '#27272a', themePrimary: '#8b5cf6', themePrimaryHover: '#7c3aed' },
  light: { themeBackground: '#ffffff', themeSurface: '#f8fafc', themeSurfaceAlt: '#f1f5f9', themeText: '#111827', themeTextMuted: '#64748b', themeBorder: '#e2e8f0', themePrimary: '#2563eb', themePrimaryHover: '#1d4ed8' },
  'unreadable choices': { themeBackground: '#ffffff', themeText: '#cccccc', themeTextMuted: '#dddddd', themePrimary: '#ffee00', themePrimaryHover: '#ffdd00', themeButtonText: '#ffffff', themeSurface: '#eeeeee' }
};

for (const [name, over] of Object.entries(PALETTES)) {
  test(`theme tokens are readable: ${name}`, () => {
    const s = { ...DEFAULTS, ...over };
    const css = buildThemeCss(s);
    const bg = s.themeBackground;
    assert.ok(ratio(token(css, '--theme-text'), bg) >= 4.5, 'page text on page background');
    assert.ok(ratio(token(css, '--theme-text-muted'), bg) >= 4.5, 'muted text on page background');
    assert.ok(ratio(token(css, '--theme-button-text'), token(css, '--theme-primary-solid')) >= 4.5, 'button label on button fill');
    assert.ok(ratio(token(css, '--theme-link-on-light'), '#ffffff') >= 4.5, 'link inside a white card');
    assert.ok(ratio(token(css, '--theme-link-on-dark'), token(css, '--theme-chrome')) >= 4.5, 'link in header/footer');
    assert.ok(ratio(token(css, '--theme-chrome-text'), token(css, '--theme-chrome')) >= 7, 'header/footer text');
    assert.ok(ratio(token(css, '--theme-card-text'), '#ffffff') >= 7, 'text inside white cards');
  });
}

test('the default palette is the light professional one', () => {
  assert.equal(DEFAULTS.themePreset, 'professional');
  assert.ok(lum(hex(DEFAULTS.themeBackground)) > 0.5);
  assert.ok(lum(hex(DEFAULTS.themeText)) < 0.05);
});

test('readableOn leaves a colour that already reads, and fixes one that does not', () => {
  assert.equal(readableOn('#111827', ['#ffffff']), '#111827');
  const fixed = readableOn('#cccccc', ['#ffffff']);
  assert.notEqual(fixed, '#cccccc');
  assert.ok(ratio(fixed, '#ffffff') >= 4.5);
  assert.equal(readableOn('red', ['#ffffff']), 'red'); // an unparseable colour is left alone
});

test('the stylesheets no longer hard-code a gold/navy override that disables the theme', () => {
  const main = readFileSync(new URL('../static/css/main.css', import.meta.url), 'utf8');
  assert.doesNotMatch(main, /--theme-primary:\s*#EE9F28\s*!important/i);
  assert.doesNotMatch(main, /--theme-text:\s*#ffffff\s*!important/i);
  assert.doesNotMatch(main, /\.btn--ghost,\s*\.site-header \.btn--ghost,\s*\.hero \.btn--ghost,\s*\.btn--secondary,\s*\.btn--outline\s*\{\s*color:\s*#ffffff\s*!important/);
});

test('white cards, form fields and the header/footer are covered by the readability block', () => {
  const css = buildThemeCss({ ...DEFAULTS });
  assert.match(css, /--dark: var\(--theme-card-text\)/);
  assert.match(css, /:where\(input:not\(\[type="checkbox"\]\)/);
  assert.match(css, /\.site-header a:where\(:not\(\.btn\)\)/);
});
