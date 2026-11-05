// The control plane mirrors these preset ids (lummet-control-plane worker/site-setup.js SITE_PRESETS) and refuses any other id
// before calling the tenant. If a preset is added, renamed or removed here, change that list in the control plane in the same release;
// this pinned list exists in both repositories (control plane test: test/preset-ids-pinned.test.js) so a drift fails a test on one side.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../worker/site-profile/registry.js';

export const PINNED_PRESET_IDS = ['full', 'news', 'casino-list', 'casino-only', 'list-reviews', 'sportsbook', 'research', 'static'];

test('the tenant preset ids are exactly the pinned list the control plane mirrors', () => {
  assert.deepEqual(Object.keys(PRESETS).sort(), [...PINNED_PRESET_IDS].sort());
});
