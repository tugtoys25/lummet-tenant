// Guards the split of static/js/admin/settings-form.js (v22.41): the entry calls the three parts in the order the code ran in as one function.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (n) => readFileSync(join(ROOT, `static/js/admin/${n}.js`), 'utf-8');

describe('settings form scripts', () => {
  test('the entry defines initSettingsForm and calls the parts in the original order', () => {
    const src = read('settings-form');
    assert.match(src, /^function initSettingsForm\(\) \{/m);
    const calls = ['loadAdComponents();', 'initSettingsThemeEditor();', 'initSettingsSectionButtons();', 'initSettingsSave(form);'].map((c) => src.indexOf(c));
    assert.ok(calls.every((i) => i > -1) && [...calls].sort((a, b) => a - b).join() === calls.join(), String(calls));
  });
  test('each part declares exactly its one top-level function', () => {
    for (const [file, fn] of [['settings-form-theme', 'initSettingsThemeEditor()'], ['settings-form-sections', 'initSettingsSectionButtons()'], ['settings-form-save', 'initSettingsSave(form)']]) {
      const src = read(file);
      assert.deepEqual(src.match(/^(?:async\s+)?function\s+\w+/gm), [`function ${fn.replace(/\(.*/, '')}`], file);
      assert.ok(src.includes(`function ${fn} {`) && src.endsWith('\n}\n'), file);
    }
  });
  test('the save part still posts to the settings API and shows both alert messages', () => {
    const s = read('settings-form-save');
    for (const t of ['/en/api/v1/settings/save', 'Site settings saved successfully.', 'Failed to save settings', 'collectHomepageSections()', 'collectComplianceRows()']) assert.ok(s.includes(t), t);
  });
});
