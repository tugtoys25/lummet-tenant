import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildLayoutBlock, PAGE_FRAMES, SECTION_BACKGROUNDS, SECTION_DIVIDERS } from '../worker/site-settings/theme-layouts.js';
import { validateSettingsInput } from '../worker/site-profile/settings-groups.js';
import { TEMPLATE_PACKS, TEMPLATE_KEYS } from '../worker/site-profile/design-packs.js';
import { buildHomepageSectionsHtml } from '../worker/site-settings/homepage-sections.js';

test('defaults add no CSS', () => {
  assert.equal(buildLayoutBlock({ themePageFrame: 'default', themeSectionBackgrounds: 'default', themeSectionDivider: 'default' }), '');
});

test('every frame, background and divider has its own CSS; unknown values fall back', () => {
  const seen = new Set();
  for (const k of PAGE_FRAMES.slice(1)) { const c = buildLayoutBlock({ themePageFrame: k }); assert.match(c, /body::after/, k); seen.add(c); }
  for (const k of SECTION_BACKGROUNDS.slice(1)) { const c = buildLayoutBlock({ themeSectionBackgrounds: k }); assert.match(c, /\.section/, k); seen.add(c); }
  for (const k of SECTION_DIVIDERS.slice(1)) { const c = buildLayoutBlock({ themeSectionDivider: k }); assert.match(c, /\.section/, k); seen.add(c); }
  assert.equal(seen.size, PAGE_FRAMES.length + SECTION_BACKGROUNDS.length + SECTION_DIVIDERS.length - 3);
  assert.equal(buildLayoutBlock({ themePageFrame: 'x}body{display:none', themeSectionBackgrounds: '</style>', themeSectionDivider: 'nope' }), '');
});

test('the frame takes no space, ignores clicks and stays under pop-ups; nothing is hidden', () => {
  for (const k of PAGE_FRAMES.slice(1)) {
    const c = buildLayoutBlock({ themePageFrame: k });
    assert.match(c, /position: fixed; inset: 0; z-index: 900; pointer-events: none/);
    assert.doesNotMatch(c, /display:\s*none|visibility:\s*hidden/);
  }
  for (const k of SECTION_BACKGROUNDS.slice(1)) assert.doesNotMatch(buildLayoutBlock({ themeSectionBackgrounds: k }), /display:\s*none/, k);
  for (const k of SECTION_DIVIDERS.slice(1)) assert.doesNotMatch(buildLayoutBlock({ themeSectionDivider: k }), /display:\s*none/, k);
});

test('validator accepts the new settings and rejects others', () => {
  assert.deepEqual(validateSettingsInput({ theme_page_frame: 'inset', theme_section_backgrounds: 'tints', theme_section_divider: 'curve' }).errors, []);
  for (const k of ['theme_page_frame', 'theme_section_backgrounds', 'theme_section_divider']) assert.ok(validateSettingsInput({ [k]: 'nope' }).errors.length > 0, k);
});

test('templates set the new keys and each new value is used by a template', () => {
  for (const k of ['theme_page_frame', 'theme_section_backgrounds', 'theme_section_divider']) assert.ok(TEMPLATE_KEYS.includes(k), k);
  const used = (k) => new Set(TEMPLATE_PACKS.map((t) => t.settings[k]));
  for (const v of PAGE_FRAMES) assert.ok(used('theme_page_frame').has(v), `frame ${v}`);
  for (const v of SECTION_BACKGROUNDS) assert.ok(used('theme_section_backgrounds').has(v), `bg ${v}`);
  for (const v of SECTION_DIVIDERS) assert.ok(used('theme_section_divider').has(v), `divider ${v}`);
});

test('a homepage section gets its layout class only for known layouts', () => {
  const mk = (layout) => buildHomepageSectionsHtml([{ type: 'features', enabled: true, title: 'T', layout, cards: [{ title: '98%', description: 'Payout rate' }] }], 'https://x.test');
  for (const l of ['cols-2', 'cols-3', 'cols-4', 'list', 'steps', 'stats', 'quotes', 'cta']) assert.match(mk(l), new RegExp(`homepage-section--layout-${l}`), l);
  assert.doesNotMatch(mk('default'), /homepage-section--layout-/);
  assert.doesNotMatch(mk('x" onload="alert(1)'), /layout-|onload/);
  assert.doesNotMatch(mk(undefined), /homepage-section--layout-/);
});

test('the layout stylesheet is built into main.css', () => {
  const css = readFileSync(new URL('../static/css/main.css', import.meta.url), 'utf8');
  for (const l of ['cols-3', 'list', 'steps', 'stats', 'quotes', 'cta']) assert.ok(css.includes(`.homepage-section--layout-${l}`), l);
});
