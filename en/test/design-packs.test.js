import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DESIGN_PACKS, DESIGN_KEYS, TEMPLATE_PACKS, TEMPLATE_KEYS } from '../worker/site-profile/design-packs.js';
import { validateSettingsInput } from '../worker/site-profile/settings-groups.js';
import { buildThemeCss } from '../worker/site-settings/theme.js';
import { toRgb, contrast } from '../worker/site-settings/colour.js';

const ratio = (a, b) => contrast(toRgb(a), toRgb(b));

test('there are several designs with unique ids and plain-language text', () => {
  assert.ok(DESIGN_PACKS.length >= 6);
  assert.equal(new Set(DESIGN_PACKS.map((d) => d.id)).size, DESIGN_PACKS.length);
  for (const d of DESIGN_PACKS) { assert.ok(d.label && d.help, d.id); assert.ok(['light', 'dark'].includes(d.tone), d.id); }
});

test('every design sets every design key, so applying one replaces the whole look', () => {
  for (const d of DESIGN_PACKS) assert.deepEqual(Object.keys(d.settings).sort(), [...DESIGN_KEYS].sort(), d.id);
});

test('every design passes the same validation the dashboard uses', () => {
  for (const d of DESIGN_PACKS) {
    const r = validateSettingsInput(d.settings);
    assert.deepEqual(r.errors, [], d.id);
  }
});

test('colours read well: text on page, muted text on page, button text on the primary colour', () => {
  for (const d of DESIGN_PACKS) {
    const s = d.settings;
    assert.ok(ratio(s.theme_text, s.theme_background) >= 4.5, `${d.id}: text on background`);
    assert.ok(ratio(s.theme_text_muted, s.theme_background) >= 4.5, `${d.id}: muted text on background`);
    assert.ok(ratio(s.theme_button_text, s.theme_primary) >= 4.5, `${d.id}: button text on primary`);
    assert.ok(ratio('#ffffff', s.theme_surface) >= 4.5, `${d.id}: white header text on the dark surface`);
  }
});

test('light designs have a light page and dark designs a dark one', () => {
  const lum = (h) => { const [r, g, b] = toRgb(h).map((v) => v / 255); return (r + g + b) / 3; };
  for (const d of DESIGN_PACKS) assert.equal(lum(d.settings.theme_background) > 0.5, d.tone === 'light', d.id);
});

test('each design builds theme CSS with its own colours and fonts', () => {
  for (const d of DESIGN_PACKS) {
    const s = d.settings;
    const css = buildThemeCss({
      themePrimary: s.theme_primary, themeBackground: s.theme_background, themeSurface: s.theme_surface, themeText: s.theme_text,
      themeSectionBackground: s.theme_section_background, themeFontBody: s.theme_font_body, themeFontHeading: s.theme_font_heading,
    });
    assert.ok(css.includes(`--theme-primary: ${s.theme_primary};`), d.id);
    assert.ok(css.includes(`--theme-background: ${s.theme_background};`), d.id);
  }
});

test('designs are the look only: they carry no layout keys, so they never move the page structure', () => {
  for (const d of DESIGN_PACKS) for (const k of TEMPLATE_KEYS) assert.ok(!(k in d.settings), `${d.id} must not set ${k}`);
});

test('templates are the layout only and set every layout key', () => {
  assert.ok(TEMPLATE_PACKS.length >= 5);
  assert.equal(new Set(TEMPLATE_PACKS.map((t) => t.id)).size, TEMPLATE_PACKS.length);
  for (const t of TEMPLATE_PACKS) {
    assert.ok(t.label && t.help, t.id);
    assert.deepEqual(Object.keys(t.settings).sort(), [...TEMPLATE_KEYS].sort(), t.id);
    assert.deepEqual(validateSettingsInput(t.settings).errors, [], t.id);
  }
});

test('any design can be combined with any template (all values valid together)', () => {
  for (const d of DESIGN_PACKS) for (const t of TEMPLATE_PACKS) assert.deepEqual(validateSettingsInput({ ...d.settings, ...t.settings }).errors, [], `${d.id}+${t.id}`);
});

test('templates differ from each other and include the stadium-style rows layout', () => {
  const sig = TEMPLATE_PACKS.map((t) => JSON.stringify(t.settings));
  assert.equal(new Set(sig).size, sig.length);
  assert.equal(TEMPLATE_PACKS.find((t) => t.id === 'stadium-rows').settings.theme_list_layout, 'rows');
});
