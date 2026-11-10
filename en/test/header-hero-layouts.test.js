import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLayoutBlock, HEADER_LAYOUTS, HERO_LAYOUTS } from '../worker/site-settings/theme-layouts.js';
import { validateSettingsInput } from '../worker/site-profile/settings-groups.js';
import { TEMPLATE_PACKS, TEMPLATE_KEYS } from '../worker/site-profile/design-packs.js';

test('the default header and hero add no CSS', () => {
  assert.equal(buildLayoutBlock({ themeHeaderLayout: 'default', themeHeroLayout: 'default' }), '');
});

test('every header type and hero type produces its own CSS', () => {
  const seen = new Set();
  for (const h of HEADER_LAYOUTS.filter((x) => x !== 'default')) { const c = buildLayoutBlock({ themeHeaderLayout: h }); assert.ok(c.includes('.site-header'), h); seen.add(c); }
  for (const h of HERO_LAYOUTS.filter((x) => x !== 'default')) { const c = buildLayoutBlock({ themeHeroLayout: h }); assert.ok(c.includes('.hero'), h); seen.add(c); }
  assert.equal(seen.size, HEADER_LAYOUTS.length - 1 + HERO_LAYOUTS.length - 1, 'all different');
});

test('header types only apply on wide screens, so phones keep the normal menu', () => {
  for (const h of HEADER_LAYOUTS.filter((x) => x !== 'default')) assert.match(buildLayoutBlock({ themeHeaderLayout: h }), /@media \(min-width: (769|1025)px\)/, h);
});

test('nothing is hidden by any header or hero type', () => {
  for (const h of HEADER_LAYOUTS) assert.doesNotMatch(buildLayoutBlock({ themeHeaderLayout: h }), /display:\s*none/, h);
  for (const h of HERO_LAYOUTS) assert.doesNotMatch(buildLayoutBlock({ themeHeroLayout: h }), /display:\s*none|visibility:\s*hidden/, h);
});

test('unknown or hostile values fall back to the default', () => {
  assert.equal(buildLayoutBlock({ themeHeaderLayout: 'x;}body{display:none', themeHeroLayout: '</style>' }), '');
});

test('the settings validator accepts the new types and rejects others', () => {
  for (const h of HEADER_LAYOUTS) assert.deepEqual(validateSettingsInput({ theme_header_layout: h }).errors, [], h);
  for (const h of HERO_LAYOUTS) assert.deepEqual(validateSettingsInput({ theme_hero_layout: h }).errors, [], h);
  assert.ok(validateSettingsInput({ theme_hero_layout: 'nope' }).errors.length > 0);
  assert.ok(validateSettingsInput({ theme_header_layout: 'nope' }).errors.length > 0);
});

test('templates set the hero type too, and some templates use each new type', () => {
  assert.ok(TEMPLATE_KEYS.includes('theme_hero_layout'));
  for (const t of TEMPLATE_PACKS) assert.ok(HERO_LAYOUTS.includes(t.settings.theme_hero_layout), t.id);
  const hdr = new Set(TEMPLATE_PACKS.map((t) => t.settings.theme_header_layout));
  const hero = new Set(TEMPLATE_PACKS.map((t) => t.settings.theme_hero_layout));
  for (const h of HEADER_LAYOUTS) assert.ok(hdr.has(h), `no template uses header ${h}`);
  for (const h of HERO_LAYOUTS) assert.ok(hero.has(h), `no template uses hero ${h}`);
});
