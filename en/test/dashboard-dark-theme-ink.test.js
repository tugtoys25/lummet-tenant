// Phase 10 dark-theme review: text on the dashboard's white surfaces must not follow the (light) theme text colour.
// Source-level check on the built stylesheet plus real contrast arithmetic for every palette. NOT a rendering test: no browser was used.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildThemeCss } from '../worker/site-settings/theme.js';
import { DEFAULTS } from '../worker/site-settings/defaults.js';

const css = readFileSync(new URL('../static/css/dashboard.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim().split(/\s*,\s*/), body: m[2] }));
const lastColor = (selector) => { let v = null; for (const r of rules) if (r.sel.includes(selector)) { const m = r.body.match(/(?:^|[;\s])color\s*:\s*([^;]+)/); if (m) v = m[1].trim(); } return v; };
const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const lum = (rgb) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]); };
const ratio = (a, b) => { const l1 = lum(hex(a)), l2 = lum(hex(b)); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };

const ON_WHITE_MUTED = ['.stat-label', '#xferRoot .muted', '#xferRoot h5', '.xfer-msg', '.xfer-facts dt', '.dash-kbd', '.dsearch-close', '.dsearch-group', '.dsearch-sub', '.dsearch-kind', '.dsearch-chip--off', '.dsearch-pin', '.dsearch-empty', '.dsearch-status', '.dsearch-foot', '.admin-section .mini-table th'];
const ON_WHITE_STRONG = ['.dash-searchbtn', '.dsearch-box'];

test('every white-surface element resolves to a fixed ink, not the theme text colour', () => {
  for (const s of ON_WHITE_MUTED) assert.match(lastColor(s) || '', /var\(--ink-muted-on-white\)/, `${s} -> ${lastColor(s)}`);
  for (const s of ON_WHITE_STRONG) assert.match(lastColor(s) || '', /var\(--ink-on-white\)/, `${s} -> ${lastColor(s)}`);
});
test('the dashboard stylesheet defines both inks', () => {
  assert.match(css, /--ink-on-white:\s*var\(--theme-card-text,\s*#111827\)/);
  const muted = css.match(/--ink-muted-on-white:\s*(#[0-9a-f]{6})/i); assert.ok(muted);
  assert.ok(ratio(muted[1], '#ffffff') >= 7, `muted ink ${ratio(muted[1], '#ffffff')}`);
});
test('the strong ink stays readable on white for light, dark and unreadable palettes', () => {
  const palettes = [{}, { themeBackground: '#050505', themeSurface: '#0f0f12', themeSurfaceAlt: '#15151a', themeText: '#ffffff', themeTextMuted: '#a1a1aa', themeBorder: '#27272a', themePrimary: '#8b5cf6' }, { themeBackground: '#ffffff', themeText: '#cccccc', themeTextMuted: '#dddddd' }];
  for (const p of palettes) { const t = buildThemeCss({ ...DEFAULTS, ...p }); const m = t.match(/--theme-card-text:\s*(#[0-9a-f]{6})/i); assert.ok(m); assert.ok(ratio(m[1], '#ffffff') >= 7, `${m[1]} on white`); }
});
test('the configuration screen parts never colour text with a theme text variable', () => {
  const themed = /var\(--(text-strong|text-body|text-secondary|theme-text|theme-text-muted)\b/;
  for (const r of rules) { const m = r.body.match(/(?:^|[;\s])color\s*:\s*([^;]+)/); if (m && r.sel.some((s) => /cfg-|#cfgRoot/.test(s))) assert.ok(!themed.test(m[1]), `${r.sel.join(',')} -> ${m[1]}`); }
});
