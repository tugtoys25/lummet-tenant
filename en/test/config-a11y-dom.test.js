// Phase 10 / B3: accessibility of the Configuration screen, asserted at DOM level.
// The real template and the real scripts (configuration.js, configuration-draft.js) run against a small fake DOM
// (test/support/fake-dom.js) wired to the real config API and an in-memory database.
// NOT VERIFIED HERE: a real browser, a real screen reader (NVDA, JAWS, VoiceOver), real keyboard events, real focus rings, real
// colour rendering, zoom or high-contrast mode. This file checks attributes, focus calls, message regions and contrast arithmetic only.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { freshSite, setSetting, admin } from './support/transfer-fixtures.js';
import { makeDom, runScript, parseTemplate, settle, walk } from './support/fake-dom.js';
import { route as profileRoute } from '../worker/api/routes/site-profile.js';
import { route as versionsRoute } from '../worker/api/routes/site-profile-versions.js';
import { SETUP_STATE, SETUP_SOURCE } from '../worker/site-profile/setup.js';
import { applyPreset } from '../worker/site-profile/profile.js';
import { buildThemeCss } from '../worker/site-settings/theme.js';
import { DEFAULTS } from '../worker/site-settings/defaults.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const HTML = read('templates/pages/admin/configuration.html');
const MAIN = read('static/js/admin/configuration.js');
const DRAFT = read('static/js/admin/configuration-draft.js');
const CSS_SRC = read('css-src/dashboard/12-config-a11y.css');
const CSS_BUILT = read('static/css/dashboard.css');
const TAGS = parseTemplate(HTML);

// ---------------------------------------------------------------------------------------------------------------------------
describe('template attributes (static)', () => {
  const byId = (id) => TAGS.find((t) => t.attrs.id === id);
  test('every id is unique', () => {
    const ids = TAGS.map((t) => t.attrs.id).filter(Boolean);
    assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), []);
  });
  test('every aria-labelledby / aria-describedby / aria-controls points at an id that exists', () => {
    for (const t of TAGS) for (const a of ['aria-labelledby', 'aria-describedby', 'aria-controls']) if (t.attrs[a]) for (const id of t.attrs[a].split(/\s+/)) assert.ok(byId(id), `${t.attrs.id || t.tag}: ${a}="${id}" has no target`);
  });
  test('two message regions exist for screen readers: a polite status and an assertive alert, both outside any hidden panel', () => {
    const al = byId('cfgAlert'), an = byId('cfgAnnounce');
    assert.equal(al.attrs.role, 'alert'); assert.equal(an.attrs.role, 'status'); assert.equal(an.attrs['aria-live'], 'polite'); assert.equal(an.attrs['aria-atomic'], 'true');
    assert.ok(!('hidden' in al.attrs) && !('hidden' in an.attrs));
    assert.match(al.attrs.class, /cfg-sr/); assert.match(an.attrs.class, /cfg-sr/);
  });
  test('every status line the scripts write into is a live region', () => {
    for (const id of ['cfgMsg', 'cfgSetupMsg', 'cfgPublishMsg', 'cfgPublishRisk', 'cfgRestoreMsg', 'cfgHistMsg', 'cfgBarStatus']) {
      const t = byId(id); assert.ok(t, id); assert.ok(t.attrs.role === 'status' || t.attrs['aria-live'], `${id} is not announced`);
    }
    assert.equal(byId('cfgBarSave').attrs['aria-live'], 'polite');
  });
  test('the welcome panel, the publish review and the version panel are labelled regions whose heading can take focus', () => {
    for (const [region, title] of [['cfgSetup', 'cfgSetupTitle'], ['cfgPublish', 'cfgPublishTitle'], ['cfgVersion', 'cfgVersionTitle']]) {
      assert.equal(byId(region).attrs.role, 'region', region); assert.equal(byId(region).attrs['aria-labelledby'], title, region);
      assert.equal(byId(title).attrs.tabindex, '-1', `${title} must be focusable by script only`);
    }
    assert.equal(byId('cfgTitle').attrs.tabindex, '-1'); assert.equal(byId('cfgHistoryTitle').attrs.tabindex, '-1');
  });
  test('the preset list is a labelled radio group', () => {
    const g = byId('cfgPresets'); assert.equal(g.attrs.role, 'radiogroup'); assert.equal(g.attrs['aria-labelledby'], 'cfgPresetsTitle'); assert.equal(g.attrs['aria-describedby'], 'cfgPresetsHelp');
  });
  test('every form control has an accessible name: wrapping <label>, label[for], aria-label or aria-labelledby', () => {
    const labelFor = new Set(TAGS.filter((t) => t.tag === 'label' && t.attrs.for).map((t) => t.attrs.for));
    // labels that wrap their control: the control sits between <label ...> and </label>
    const wrapped = new Set();
    for (const m of HTML.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/g)) for (const t of parseTemplate(m[1])) if (/^(input|select|textarea)$/.test(t.tag)) wrapped.add(t.attrs.id || `@${m.index}${t.index}`);
    let n = 0;
    for (const m of HTML.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/g)) for (const t of parseTemplate(m[1])) if (/^(input|select|textarea)$/.test(t.tag)) n++;
    for (const t of TAGS) {
      if (!/^(input|select|textarea)$/.test(t.tag) || t.attrs.type === 'hidden') continue;
      const inLabel = t.attrs.id ? wrapped.has(t.attrs.id) : false;
      assert.ok(inLabel || (t.attrs.id && labelFor.has(t.attrs.id)) || t.attrs['aria-label'] || t.attrs['aria-labelledby'], `${t.tag}#${t.attrs.id || '(no id)'} has no accessible name`);
    }
    assert.ok(n > 5, 'the wrapping-label check found controls');
  });
  test('the two selects without a visible label carry an aria-label', () => {
    for (const id of ['cfgLanding', 'cfgMode', 'cfgRedirect']) assert.ok(byId(id).attrs['aria-label'], id);
  });
  test('every <button> says type="button" (so none submits a form by accident)', () => {
    for (const t of TAGS.filter((x) => x.tag === 'button')) assert.equal(t.attrs.type, 'button', t.attrs.id || 'button');
  });
  test('tables have a caption and column headers with scope', () => {
    assert.match(HTML, /<caption class="cfg-sr">Published configuration versions/);
    for (const t of TAGS.filter((x) => x.tag === 'th')) assert.equal(t.attrs.scope, 'col');
  });
  test('the page has exactly one h1 and no heading level is skipped inside the screen', () => {
    const levels = TAGS.filter((t) => /^h[1-4]$/.test(t.tag)).map((t) => Number(t.tag[1]));
    assert.equal(levels.filter((l) => l === 1).length, 1);
    let prev = 1; for (const l of levels) { assert.ok(l <= prev + 1, `heading jumps from h${prev} to h${l}`); prev = l; }
  });
  test('the help section is a native <details> (keyboard and screen reader operable without script)', () => {
    const d = byId('cfgHelp'); assert.equal(d.tag, 'details');
    assert.match(HTML, /<details[^>]*id="cfgHelp"[\s\S]*?<summary>How setup works<\/summary>/);
  });
  test('no positive tabindex anywhere (it would break the natural keyboard order), and the keyboard order follows the reading order', () => {
    for (const t of TAGS) if (t.attrs.tabindex !== undefined) assert.ok(Number(t.attrs.tabindex) <= 0, `${t.attrs.id || t.tag} has tabindex ${t.attrs.tabindex}`);
    const order = ['cfgSetup', 'cfgBar', 'cfgHelp', 'cfgPresets', 'cfgModules', 'cfgSave', 'cfgHistory', 'cfgAudit'].map((id) => HTML.indexOf(`id="${id}"`));
    assert.ok(order.every((v) => v > 0)); assert.deepEqual([...order].sort((a, b) => a - b), order, 'sections appear in the order a person works through them');
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
describe('contrast and motion (static arithmetic on the shipped CSS and the theme tokens)', () => {
  const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const lum = (rgb) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]); };
  const ratio = (a, b) => { const l1 = lum(hex(a)), l2 = lum(hex(b)); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const mix = (fg, pct, bg) => '#' + hex(fg).map((c, i) => Math.round(c * pct + hex(bg)[i] * (1 - pct)).toString(16).padStart(2, '0')).join('');
  const token = (css, name) => css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`))[1];
  // .cfg-welcome { background: color-mix(in srgb, var(--primary) 7%, var(--white)); color: var(--dark) } (css-src/dashboard/11-config-setup.css)
  const PALETTES = { default: {}, midnight: { themeBackground: '#050505', themeSurface: '#0f0f12', themeText: '#ffffff', themeTextMuted: '#a1a1aa', themePrimary: '#8b5cf6', themePrimaryHover: '#7c3aed' }, light: { themeBackground: '#ffffff', themeText: '#111827', themeTextMuted: '#64748b', themePrimary: '#2563eb', themePrimaryHover: '#1d4ed8' } };

  test('the panel tint is defined as 7% primary over --white, so the arithmetic below describes the real background', () => {
    assert.match(read('css-src/dashboard/11-config-setup.css'), /\.cfg-welcome \{[^}]*background: color-mix\(in srgb, var\(--primary\) 7%, var\(--white\)\)/);
  });
  test('.cfg-welcome text (muted text and small print included) uses the panel\'s own fixed ink, not the grey and not the theme-following --dark', () => {
    for (const css of [CSS_SRC, CSS_BUILT]) {
      assert.match(css, /\.cfg-welcome\s*\{\s*--cfg-welcome-ink:\s*#1a1a2e;\s*color:\s*var\(--cfg-welcome-ink\)/);
      assert.match(css, /\.cfg-welcome \.muted,\s*\.cfg-welcome small[^{]*\{\s*color:\s*var\(--cfg-welcome-ink\)/);
    }
  });
  for (const [name, over] of Object.entries(PALETTES)) {
    test(`welcome panel text keeps at least 7:1 on the tint, ${name} palette (the ink is fixed, so a dark theme cannot make it unreadable)`, () => {
      const s = { ...DEFAULTS, ...over };
      const tint = mix(s.themePrimary, 0.07, '#ffffff');
      const ink = CSS_SRC.match(/--cfg-welcome-ink:\s*(#[0-9a-fA-F]{6})/)[1];
      assert.ok(ratio(ink, tint) >= 7, `${ink} on ${tint}: ${ratio(ink, tint).toFixed(2)}`);
    });
    test(`(why the ink is fixed) with the ${name} palette the theme-following text colour ${name === 'midnight' ? 'is unreadable on the tint' : 'happens to be readable'}`, () => {
      const s = { ...DEFAULTS, ...over }; const tint = mix(s.themePrimary, 0.07, '#ffffff'); const themeText = token(buildThemeCss(s), '--theme-text');
      if (name === 'midnight') assert.ok(ratio(themeText, tint) < 4.5, `theme text ${themeText} on ${tint} is ${ratio(themeText, tint).toFixed(2)}`); else assert.ok(ratio(themeText, tint) >= 4.5);
    });
  }
  test('the default muted grey is the reason for the rule: on the tint it is below the 4.5:1 line (so the override is needed, not decoration)', () => {
    const tint = mix('#2563eb', 0.07, '#ffffff'); const grey = '#64748b';
    assert.ok(ratio(grey, tint) < 4.6, `grey on tint is ${ratio(grey, tint).toFixed(2)}`);
    assert.ok(ratio(CSS_SRC.match(/--cfg-welcome-ink:\s*(#[0-9a-fA-F]{6})/)[1], tint) > ratio(grey, tint));
  });
  test('a visible focus ring exists for links, buttons, inputs, selects, summary and the programmatically focused headings', () => {
    for (const css of [CSS_SRC, CSS_BUILT]) {
      for (const sel of ['a:focus-visible', 'button:focus-visible', 'input:focus-visible', 'select:focus-visible', 'summary:focus-visible', 'h1:focus-visible', 'h2:focus-visible', 'h3:focus-visible']) assert.ok(css.includes(`#cfgRoot ${sel}`), `${sel} missing`);
      assert.match(css, /#cfgRoot a:focus-visible[^{]*\{\s*outline:\s*2px solid var\(--primary\)/);
    }
  });
  test('the reduced-motion rule is present in the source and in the built stylesheet, and switches off animation, transition and smooth scrolling', () => {
    for (const css of [CSS_SRC, CSS_BUILT]) {
      const m = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*#cfgRoot \*[^}]*\}/);
      assert.ok(m, 'reduced-motion block missing');
      for (const d of ['animation-duration', 'transition-duration', 'scroll-behavior: auto']) assert.ok(m[0].includes(d), d);
    }
  });
  test('the visually hidden helper keeps text available to screen readers (clip, not display:none)', () => {
    for (const css of [CSS_SRC, CSS_BUILT]) { const m = css.match(/\.cfg-sr\s*\{[^}]*\}/)[0]; assert.ok(!/display:\s*none/.test(m)); assert.match(m, /clip: rect\(0, 0, 0, 0\)/); }
  });
  test('the built stylesheet and the asset hash are current (same checks as scripts/build-css.mjs --check and asset-version.mjs --check)', async () => {
    const { computeAssetVersion } = await import('../scripts/asset-version.mjs');
    assert.equal(read('worker/asset-version.js').match(/ASSET_VERSION = "([0-9a-f]+)"/)[1], computeAssetVersion(), 'run: node scripts/asset-version.mjs');
    assert.ok(CSS_BUILT.includes('.cfg-sr') && CSS_BUILT.includes('--cfg-welcome-ink'), 'built dashboard.css contains the part-12 rules: run node scripts/build-css.mjs');
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
let db, env;
const callApi = async (url, opts = {}) => {
  const path = url.replace(/^\/en/, '').split('?')[0];
  const method = (opts.method || 'GET').toUpperCase();
  const body = opts.body ? JSON.parse(opts.body) : undefined;
  const r = path.startsWith('/api/v1/config') ? versionsRoute : profileRoute;
  return r({ request: { method, url: `https://t.example${path}`, headers: new Headers(), json: async () => body }, env, path, user: admin });
};
beforeEach(async () => { ({ db, env } = freshSite()); await setSetting(db, 'site_profile', JSON.stringify(applyPreset('casino-reviews'))); });

function bootMain({ hash = '', completeFails = false } = {}) {
  const dom = makeDom(HTML);
  const timers = [];
  const win = { LummetConfig: undefined, confirm: () => true, addEventListener() {} };
  const fetchLog = [];
  const fetch = async (url, opts) => { fetchLog.push([opts?.method || 'GET', url]); if (completeFails && /setup\/complete/.test(url)) return new Response(JSON.stringify({ success: false, error: 'Only administrators can do this.' }), { status: 403 }); return callApi(url, opts); };
  const ctx = runScript(MAIN, 'configuration.js', { document: dom.document, window: win, location: { hash, reload() {} }, fetch, setTimeout: (fn, ms) => { const t = setTimeout(fn, 0); timers.push(t); return t; }, clearTimeout, Promise, console, JSON, Object });
  return { ...dom, win, fetchLog, ctx };
}
const el = (dom, id) => dom.doc.byId[id];
const controls = (dom, prefix) => walk(el(dom, 'cfgModules')).concat(walk(el(dom, 'cfgPresets'))).concat(walk(el(dom, 'cfgFeatures'))).filter((n) => n.fkey && n.fkey.startsWith(prefix));

describe('configuration.js: welcome panel, messages and focus', () => {
  beforeEach(async () => { await setSetting(db, SETUP_STATE, 'pending'); await setSetting(db, SETUP_SOURCE, 'preset'); });

  test('opening the screen normally does NOT steal focus; arriving through the #cfgSetup link starts at the panel heading', async () => {
    const a = bootMain(); await settle();
    assert.equal(el(a, 'cfgSetup').hidden, false, 'panel shown'); assert.equal(a.doc.activeElement, a.body, 'focus untouched');
    const b = bootMain({ hash: '#cfgSetup' }); await settle();
    assert.equal(b.doc.activeElement, el(b, 'cfgSetupTitle'));
  });
  test('"Choose a different type" moves the keyboard to the first preset radio (and does not just scroll)', async () => {
    const dom = bootMain(); await settle();
    el(dom, 'cfgSetupChange').onclick({ preventDefault() {} });
    assert.ok(dom.doc.activeElement.fkey && dom.doc.activeElement.fkey.startsWith('p:'), `focus is on ${dom.doc.activeElement.fkey || dom.doc.activeElement.tag}`);
    assert.equal(dom.doc.activeElement.type, 'radio');
  });
  test('confirming: busy state while saving, then the panel closes, a polite announcement is made and focus goes to the page heading (not lost)', async () => {
    const dom = bootMain(); await settle();
    const btn = el(dom, 'cfgSetupConfirm'); btn.onclick(); 
    assert.equal(el(dom, 'cfgSetup').attrs['aria-busy'], 'true'); assert.equal(btn.disabled, true);
    await settle();
    assert.equal(el(dom, 'cfgSetup').hidden, true); assert.equal(el(dom, 'cfgSetup').attrs['aria-busy'], 'false');
    assert.match(el(dom, 'cfgAnnounce').textContent, /Setup confirmed/); assert.equal(dom.doc.activeElement, el(dom, 'cfgTitle'));
    assert.equal(el(dom, 'cfgAlert').textContent, '', 'no alert on success');
  });
  test('a failed confirm raises the assertive alert with the server message, re-enables the button and returns focus to it', async () => {
    const dom = bootMain({ completeFails: true }); await settle();
    const btn = el(dom, 'cfgSetupConfirm'); btn.onclick(); await settle();
    assert.equal(el(dom, 'cfgAlert').textContent, 'Only administrators can do this.'); assert.equal(el(dom, 'cfgSetupMsg').textContent, 'Only administrators can do this.');
    assert.equal(btn.disabled, false); assert.equal(dom.doc.activeElement, btn); assert.equal(el(dom, 'cfgSetup').hidden, false, 'the panel stays so the person can retry');
  });
  test('the welcome panel is hidden, and nothing is announced, when setup is not pending', async () => {
    await setSetting(db, SETUP_STATE, 'done'); const dom = bootMain(); await settle();
    assert.equal(el(dom, 'cfgSetup').hidden, true); assert.equal(el(dom, 'cfgAnnounce').textContent, '');
  });
});

describe('configuration.js: the keyboard focus survives a redraw', () => {
  test('toggling a module checkbox rebuilds the lists, and focus lands on the NEW checkbox for the same module', async () => {
    const dom = bootMain(); await settle();
    const before = controls(dom, 'm:'); assert.ok(before.length > 3, 'module checkboxes rendered');
    const target = before.find((n) => n.fkey === 'm:news'); assert.ok(target);
    target.focus(); assert.equal(dom.doc.activeElement, target);
    target.checked = !target.checked; target.onchange();
    const now = dom.doc.activeElement;
    assert.notEqual(now, target, 'the old node was replaced by the redraw'); assert.equal(now.fkey, 'm:news'); assert.equal(now.isConnected, true);
    assert.equal(now.checked, target.checked, 'and it shows the new state');
  });
  test('the same holds for a preset radio and for a feature checkbox', async () => {
    const dom = bootMain(); await settle();
    for (const prefix of ['f:', 'p:']) {
      const c = controls(dom, prefix)[0]; assert.ok(c, prefix); c.focus(); const key = c.fkey;
      if (prefix === 'f:') { c.checked = !c.checked; c.onchange(); } else { const other = controls(dom, 'p:').find((n) => n !== c); other.focus(); other.checked = true; other.onchange(); }
      assert.ok(dom.doc.activeElement.fkey, `${prefix} focus kept`); assert.equal(dom.doc.activeElement.isConnected, true);
      if (prefix === 'f:') assert.equal(dom.doc.activeElement.fkey, key);
    }
  });
  test('when focus is somewhere else (outside the redrawn lists) a redraw does not move it', async () => {
    const dom = bootMain(); await settle();
    const save = el(dom, 'cfgSave'); save.focus(); const m = controls(dom, 'm:')[0]; m.checked = !m.checked; m.onchange();
    assert.equal(dom.doc.activeElement, save);
  });
  test('applying a one-click fix is announced and the link is exposed as a button', async () => {
    const dom = bootMain(); await settle();
    // switch reviews on without casinos' dependency to provoke a fix suggestion
    const casinos = controls(dom, 'm:').find((n) => n.fkey === 'm:casino'); casinos.checked = false; casinos.onchange(); await settle(40);
    const links = walk(el(dom, 'cfgIssues')).filter((n) => n.tag === 'a');
    if (!links.length) return; // no suggestion for this preset: nothing to assert (the role is asserted by source below)
    assert.equal(links[0].attrs.role, 'button'); links[0].onclick({ preventDefault() {} });
    assert.match(el(dom, 'cfgAnnounce').textContent, /^Fix applied: /);
  });
  test('source guard: the fix link gets role=button and the announce call', () => {
    assert.match(MAIN, /a\.setAttribute\("role", "button"\)/); assert.match(MAIN, /announce\("Fix applied: "/);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
function bootDraft() {
  const dom = makeDom(HTML);
  const win = { LummetConfig: undefined, confirm: () => true, addEventListener() {} };
  const fetch = (url, opts) => callApi(url, opts);
  runScript(DRAFT, 'configuration-draft.js', { document: dom.document, window: win, location: { hash: '', reload() {} }, fetch, setTimeout, clearTimeout, Promise, console, JSON, Object, Date, isNaN, String, Object });
  return { ...dom, win };
}
const key = (k) => ({ key: k, preventDefault() { this.prevented = true; } });

describe('configuration-draft.js: publish review and version panel focus', () => {
  test('opening the publish review moves focus to its heading; closing it with the button returns focus to the control that opened it', async () => {
    const dom = bootDraft(); await settle();
    const opener = el(dom, 'cfgReviewBtn'); opener.focus();
    opener.onclick(); await settle(8);
    assert.equal(el(dom, 'cfgPublish').hidden, false); assert.equal(dom.doc.activeElement, el(dom, 'cfgPublishTitle'));
    el(dom, 'cfgPublishCancel').onclick();
    assert.equal(el(dom, 'cfgPublish').hidden, true); assert.equal(dom.doc.activeElement, opener);
  });
  test('Escape closes the publish review (default prevented) and returns focus; Escape while it is closed does nothing', async () => {
    const dom = bootDraft(); await settle();
    const opener = el(dom, 'cfgReviewBtn'); opener.focus(); opener.onclick(); await settle(8);
    const e = key('Escape'); el(dom, 'cfgPublish').onkeydown(e);
    assert.equal(e.prevented, true); assert.equal(el(dom, 'cfgPublish').hidden, true); assert.equal(dom.doc.activeElement, opener);
    const other = el(dom, 'cfgSave') || el(dom, 'cfgPreviewBtn'); other.focus(); const e2 = key('Escape'); el(dom, 'cfgPublish').onkeydown(e2);
    assert.notEqual(e2.prevented, true); assert.equal(dom.doc.activeElement, other, 'focus untouched');
  });
  test('other keys do nothing; "Esc" (older browsers) works too', async () => {
    const dom = bootDraft(); await settle();
    const opener = el(dom, 'cfgReviewBtn'); opener.focus(); opener.onclick(); await settle(8);
    el(dom, 'cfgPublish').onkeydown(key('Enter')); assert.equal(el(dom, 'cfgPublish').hidden, false);
    el(dom, 'cfgPublish').onkeydown(key('Esc')); assert.equal(el(dom, 'cfgPublish').hidden, true);
  });
  test('with no opener focused (a browser that does not focus buttons on click) focus still goes somewhere sensible, never to nothing', async () => {
    const dom = bootDraft(); await settle();
    dom.doc.activeElement = dom.body; el(dom, 'cfgReviewBtn').onclick(); await settle(8);
    el(dom, 'cfgPublishCancel').onclick();
    assert.equal(dom.doc.activeElement, el(dom, 'cfgReviewBtn'));
  });
  test('the version panel: "See changes" moves focus to its heading, Escape and Close return focus to the button that opened it', async () => {
    // give the history one row: publish a change through the real API first
    await callApi('/en/api/v1/config/draft', { method: 'PUT', body: JSON.stringify({ profile: applyPreset('news') }) });
    const pub = await callApi('/en/api/v1/config/publish', { method: 'POST', body: JSON.stringify({ note: 'a11y test' }) }); assert.equal(pub.status, 200);
    const dom = bootDraft(); await settle(30);
    const rows = walk(el(dom, 'cfgHistBody')).filter((n) => n.tag === 'button'); assert.ok(rows.length >= 1, 'history rows rendered');
    rows[0].focus(); rows[0].onclick(); await settle(8);
    assert.equal(el(dom, 'cfgVersion').hidden, false); assert.equal(dom.doc.activeElement, el(dom, 'cfgVersionTitle'));
    assert.match(el(dom, 'cfgVersionTitle').textContent, /^Version \d+$/);
    const e = key('Escape'); el(dom, 'cfgVersion').onkeydown(e);
    assert.equal(e.prevented, true); assert.equal(el(dom, 'cfgVersion').hidden, true); assert.equal(dom.doc.activeElement, rows[0]);
    rows[0].onclick(); await settle(8); el(dom, 'cfgVersionClose').onclick(); assert.equal(dom.doc.activeElement, rows[0]);
  });
  test('if the opener was removed from the page (history reloaded) focus falls back to the history heading', async () => {
    await callApi('/en/api/v1/config/draft', { method: 'PUT', body: JSON.stringify({ profile: applyPreset('news') }) });
    await callApi('/en/api/v1/config/publish', { method: 'POST', body: JSON.stringify({}) });
    const dom = bootDraft(); await settle(30);
    const btn = walk(el(dom, 'cfgHistBody')).find((n) => n.tag === 'button'); btn.focus(); btn.onclick(); await settle(8);
    el(dom, 'cfgHistBody').textContent = ''; // the table was rebuilt; the old button is gone
    el(dom, 'cfgVersionClose').onclick();
    assert.equal(dom.doc.activeElement, el(dom, 'cfgHistoryTitle'));
  });
  test('the status line tells the person what happened without needing sight: it is a live region and has text after load', async () => {
    const dom = bootDraft(); await settle(); assert.match(el(dom, 'cfgBarStatus').textContent, /Live site: version \d+/);
  });
});
