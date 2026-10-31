// The Site Settings page: section cards, change tracking, save bar, and the loader that restores every kind of control.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf-8');
const ux = read('static/js/admin/settings-ux.js');

describe('settings page markup', () => {
  const page = read('templates/pages/admin/settings.html');
  const end = read('templates/pages/admin/settings/form-end.html');
  test('has the save bar with Save and Discard, a live status, and the old big button is gone', () => {
    assert.match(end, /id="settingsSave"[^>]*type="submit"|type="submit"[^>]*id="settingsSave"/);
    assert.match(end, /id="settingsDiscard"/);
    assert.match(end, /id="settingsStatus"[^>]*aria-live="polite"|aria-live="polite"[^>]*id="settingsStatus"/);
    assert.doesNotMatch(end, /Save Site Settings/);
  });
  test('the form validates in script (so a bad value is reported, never a silent block)', () => {
    assert.match(page, /<form id="settingsForm"[^>]*novalidate/);
    assert.match(read('static/js/admin/settings-form-save.js'), /reportValidity/);
  });
  test('the page loads the script after the save handler', () => {
    const base = read('templates/layout/base.html');
    assert.ok(base.indexOf('settings-form-save.js') < base.indexOf('settings-ux.js'));
  });
});

describe('the loader', () => {
  const loader = read('static/js/admin/settings.js');
  test('uses the shared populate function and reports success and failure', () => {
    assert.match(loader, /populateSettingsFields\(form, settings\)/);
    assert.match(loader, /new CustomEvent\("settings:loaded"\)/);
    assert.match(loader, /new CustomEvent\("settings:load-failed"\)/);
  });
  test('populateSettingsFields restores dropdowns, checkboxes, radios and text; leaves unknown dropdown values alone', () => {
    const els = [];
    const mk = (props) => { const e = { name: '', type: 'text', tagName: 'INPUT', value: '', checked: false, ...props }; els.push(e); return e; };
    const select = mk({ name: 'theme_card_style', tagName: 'SELECT', type: 'select-one', value: 'default', options: [{ value: 'default' }, { value: 'glass' }] });
    const badSelect = mk({ name: 'theme_button_style', tagName: 'SELECT', type: 'select-one', value: 'default', options: [{ value: 'default' }, { value: 'pill' }] });
    const text = mk({ name: 'site_name' });
    const box = mk({ name: 'gpwa_seal_enabled', type: 'checkbox' });
    const radio = mk({ name: 'x', type: 'radio', value: 'b' });
    const skip = mk({ name: 'footer_compliance', value: 'keep' });
    const form = { querySelectorAll: () => els };
    const ctx = vm.createContext({ document: { getElementById: () => null }, Event: class {} });
    vm.runInContext(ux.split('(function () {')[0], ctx);
    ctx.populateSettingsFields(form, { theme_card_style: 'glass', theme_button_style: 'oval', site_name: 'Acme', gpwa_seal_enabled: 'true', x: 'b', footer_compliance: 'zzz' });
    assert.equal(select.value, 'glass');
    assert.equal(badSelect.value, 'default');
    assert.equal(text.value, 'Acme');
    assert.equal(box.checked, true);
    assert.equal(radio.checked, true);
    assert.equal(skip.value, 'keep');
  });
});

describe('change tracking script', () => {
  test('groups sections into cards, marks changed sections, and drives Save / Discard', () => {
    for (const t of ['st-card', 'is-changed', 'saveBtn.disabled', 'discardBtn.disabled', 'beforeunload', 'requestSubmit', 'settings:saved', 'settings:save-failed', 'settings:load-failed']) assert.ok(ux.includes(t), t);
  });
  test('saving is turned off when the saved settings could not be loaded (it would overwrite them with defaults)', () => {
    assert.match(ux, /function onLoadFailed\(\)[\s\S]*saveBtn\.disabled = true/);
  });
  test('after a save the stored values are read back, and Discard re-reads them too', () => {
    assert.match(ux, /function onSaved\(\)[\s\S]*loadSettingsForm\(\)/);
    assert.match(ux, /function discard\(\)[\s\S]*loadSettingsForm\(\)/);
  });
  test('the payload keeps the hero guard: only sent when its checkbox is on this page', () => {
    assert.match(ux, /if \(heroEnabled\) \{\s*payload\.site_hero_enabled/);
  });
});

describe('settings stylesheet', () => {
  const css = read('css-src/header-hero/09-admin-settings.css');
  test('has the save bar pinned to the bottom, beside the sidebar on wide screens, and a phone layout', () => {
    assert.match(css, /\.st-savebar \{[^}]*position: fixed/);
    assert.match(css, /@media \(min-width: 901px\)[\s\S]*\.st-savebar \{ left: var\(--dash-w, 272px\)/);
    assert.match(css, /@media \(max-width: 640px\)/);
  });
  test('controls have explicit readable colours', () => {
    assert.match(css, /color: var\(--st-ink\)/);
    assert.match(css, /background: #ffffff; color: var\(--st-ink\)/);
  });
});

describe('sticky tab bar and the ad rules dialog', () => {
  const css = read('css-src/header-hero/09-admin-settings.css');
  test('the page container does not clip overflow (an overflow:auto parent would stop the bar sticking)', () => {
    assert.match(css, /\.admin-wrapper \.admin-content\.st-admin \{ overflow: visible; overflow-x: clip; \}/);
  });
  test('the active tab follows the scroll position, stays in view in the bar, and a click lands the heading under the bars', () => {
    for (const t of ['function current()', 'scrollTo({ left:', 'lockedUntil', 'window.addEventListener("scroll", queue', 'aria-current']) assert.ok(ux.includes(t), t);
    assert.ok(!ux.includes('IntersectionObserver'));
  });
  test('the ad rule dialog and rule cards have their own light surface instead of the site theme surface', () => {
    const tpl = read('templates/pages/admin/settings/ad-rules.html');
    assert.match(tpl, /class="st-modal__panel" role="dialog"/);
    assert.doesNotMatch(tpl, /background:var\(--surface\)/);
    const js = read('static/js/admin/ad-rules.js');
    assert.doesNotMatch(js, /background:var\(--surface\)/);
    assert.match(css, /\.st-modal__panel \{ background: #ffffff; color: var\(--st-ink\)/);
    assert.match(css, /\.st-card \.ad-rule-card \{[^}]*background: #f8fafc/);
  });
});
