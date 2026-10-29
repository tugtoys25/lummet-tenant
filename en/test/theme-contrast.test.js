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

// Every preset offered in Settings must itself produce readable tokens, and be selectable.
const presetSrc = readFileSync(new URL('../static/js/admin/theme-presets.js', import.meta.url), 'utf8');
const PRESETS = new Function(`${presetSrc}; return SITE_THEME_PRESETS;`)();
const camel = (k) => k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const asSettings = (p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [camel(k), v]));

test('there are at least 15 presets, light and dark', () => {
  const names = Object.keys(PRESETS);
  assert.ok(names.length >= 15, names.join(','));
  assert.ok(names.some((n) => lum(hex(PRESETS[n].theme_background)) > 0.5));
  assert.ok(names.some((n) => lum(hex(PRESETS[n].theme_background)) < 0.05));
});

test('every preset is listed in the Settings dropdown, and the dropdown lists nothing else', () => {
  const html = readFileSync(new URL('../templates/pages/admin/settings/theme.html', import.meta.url), 'utf8');
  const sel = html.slice(html.indexOf('name="theme_preset"'), html.indexOf('</select>'));
  const options = [...sel.matchAll(/<option value="([a-z-]+)"/g)].map((m) => m[1]).filter((v) => v !== 'custom').sort();
  assert.deepEqual(options, Object.keys(PRESETS).sort());
});

for (const [name, preset] of Object.entries(PRESETS)) {
  test(`preset "${name}" is readable`, () => {
    const s = { ...DEFAULTS, ...asSettings(preset) };
    const css = buildThemeCss(s);
    assert.ok(ratio(token(css, '--theme-text'), s.themeBackground) >= 4.5, 'page text');
    assert.ok(ratio(token(css, '--theme-text-muted'), s.themeBackground) >= 4.5, 'muted text');
    assert.ok(ratio(token(css, '--theme-button-text'), token(css, '--theme-primary-solid')) >= 4.5, 'button label');
    assert.ok(ratio(token(css, '--theme-link-on-light'), '#ffffff') >= 4.5, 'link on a white card');
    assert.ok(ratio(token(css, '--theme-link-on-light'), '#eceff3') >= 4.5, 'link on a frosted card');
    assert.ok(ratio(token(css, '--theme-link-on-dark'), token(css, '--theme-chrome')) >= 4.5, 'link in header/footer');
    assert.ok(ratio(token(css, '--theme-chrome-text'), token(css, '--theme-chrome')) >= 7, 'header/footer text');
  });
}

test('glass cards use a frosted-white surface so their dark text always reads', () => {
  const css = buildThemeCss({ ...DEFAULTS });
  const m = css.match(/body\.theme-card-glass[^{]*\{([^}]*)\}/);
  assert.ok(m);
  assert.match(m[1], /background:\s*rgba\(255,\s*255,\s*255,\s*\.9\d\)/);
  assert.doesNotMatch(m[1], /color:\s*var\(--theme-text\)/);
});
