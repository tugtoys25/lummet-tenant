// Configuration screen: eight guided tabs. Runs the REAL template and the REAL configuration-tabs.js / configuration-progress.js
// (and the three lazy scripts' start gates) against a small nested fake DOM (test/support/tabs-dom.js).
// NOT VERIFIED HERE: a real browser, real focus rings, scroll-snap, the sticky offsets, a phone, a screen reader.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { makeTabsPage, buildTree } from './support/tabs-dom.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const HTML = read('templates/pages/admin/configuration.html');
const TABS = read('static/js/admin/configuration-tabs.js');
const PROGRESS = read('static/js/admin/configuration-progress.js');
const CSS = read('css-src/dashboard/14-config-tabs.css');
const ORDER = ['overview', 'business', 'modules', 'pages', 'design', 'menus', 'backup', 'history'];
const NAMES = ['Overview', 'Business type', 'Modules and tools', 'Homepage and pages', 'Design', 'Menus, SEO and components', 'Backup and transfer', 'History'];
const page = (o = {}) => makeTabsPage(HTML, { scripts: [[TABS, 'configuration-tabs.js']], ...o });

// Every id the screen had before the tabs (from the stable 2.5.2 template), and the tab each one belongs to ('' = always visible).
const OLD_IDS = {
  '': 'cfgRoot cfgTitle cfgAlert cfgAnnounce cfgSetup cfgSetupTitle cfgSetupText cfgSetupConfirm cfgSetupChange cfgSetupMsg cfgBar cfgBarStatus cfgBarSave cfgBarActions cfgPreviewBtn cfgReviewBtn cfgDiscardBtn cfgPublish cfgPublishTitle cfgPublishRisk cfgPublishSummary cfgPublishConflicts cfgPublishChanges cfgPublishConfirm cfgPublishAck cfgPublishConfirmText cfgPublishNote cfgPublishGo cfgPublishCancel cfgPublishMsg cfgImpactRisk cfgImpact cfgPreview cfgMsg cfgSave',
  overview: 'cfgHelp cfgIssuesWrap cfgIssues cfgNextWrap cfgNext',
  business: 'cfgPresetsTitle cfgPresetsHelp cfgPresets',
  modules: 'cfgModules cfgFeatures',
  pages: 'cfgHomepage cfgLandingWrap cfgLanding cfgMode cfgRedirect',
  design: 'cfgSticky cfgPrune lookRoot lookTabs lookForm lookPreview lookPvHeader lookPvName lookPvHero lookPvTitle lookPvBtn lookPvCard lookPvMuted lookMsg lookSave',
  menus: 'rowsRoot rowsNotice rowsTabs rowsHelp rowsFind rowsAdd rowsMsg rowsList rowsMore',
  backup: 'xferSection xferRoot',
  history: 'cfgHistory cfgHistoryTitle cfgHistBody cfgHistMsg cfgHistMore cfgVersion cfgVersionTitle cfgVersionBody cfgRestoreNote cfgRestoreGo cfgVersionClose cfgRestoreMsg cfgAudit cfgAuditList cfgAuditMsg cfgAuditMore',
};

describe('the page: eight tabs, matching panels, every old id kept once', () => {
  const { doc } = buildTree(HTML);
  const tabs = Object.values(doc.byId).filter((e) => e.hasAttribute('data-cfg-tab'));
  test('exactly eight tabs, in the specified order, with the specified names', () => {
    assert.deepEqual(tabs.map((t) => t.getAttribute('data-cfg-tab')), ORDER);
    assert.deepEqual(tabs.map((t) => t.querySelector('.cfg-tab-label').textContent.trim()), NAMES);
  });
  test('each tab is a role=tab button wired to a role=tabpanel and back; only the first is in the tab order', () => {
    assert.equal(doc.byId.cfgTabs.attrs.role, 'tablist');
    tabs.forEach((t, i) => {
      const id = ORDER[i], p = doc.byId[`tab-${id}`];
      assert.equal(t.attrs.role, 'tab'); assert.equal(t.tag, 'button'); assert.equal(t.id, `tabbtn-${id}`); assert.equal(t.attrs['aria-controls'], `tab-${id}`);
      assert.ok(p, `panel for ${id}`); assert.equal(p.attrs.role, 'tabpanel'); assert.equal(p.attrs['aria-labelledby'], t.id);
      assert.equal(t.getAttribute('aria-selected'), i === 0 ? 'true' : 'false'); assert.equal(t.getAttribute('tabindex'), i === 0 ? '0' : '-1');
    });
    assert.equal(Object.values(doc.byId).filter((e) => e.attrs.role === 'tabpanel').length, 8);
  });
  test('before any script runs only Overview is shown; the other seven panels are hidden, not just styled away', () => {
    assert.deepEqual(ORDER.filter((id) => !doc.byId[`tab-${id}`].hidden), ['overview']);
    assert.match(CSS, /\.cfg-panel\[hidden\]\s*\{\s*display:\s*none/);
  });
  test('every id the screen had before is still there exactly once, inside the right tab', () => {
    const counts = {}; for (const id of doc.allIds) counts[id] = (counts[id] || 0) + 1;
    assert.deepEqual(Object.keys(counts).filter((k) => counts[k] > 1), [], 'duplicate ids');
    for (const [tab, list] of Object.entries(OLD_IDS)) for (const id of list.split(' ')) {
      assert.equal(counts[id], 1, `${id} must exist exactly once`);
      const p = doc.byId[id].closest('[data-cfg-panel]');
      assert.equal(p ? p.getAttribute('data-cfg-panel') : '', tab, `${id} should sit in ${tab || 'the always-visible area'}`);
    }
  });
  test('the draft bar, the publish review and the Apply action are not inside any tab panel, so they show on every tab', () => {
    for (const id of ['cfgBar', 'cfgPreviewBtn', 'cfgReviewBtn', 'cfgDiscardBtn', 'cfgPublish', 'cfgSave', 'cfgImpact']) assert.equal(doc.byId[id].closest('[data-cfg-panel]'), null, id);
  });
  test('every panel starts with a focusable heading, a purpose line of at most 20 words, and a Why-this-matters details', () => {
    for (const id of ORDER) {
      const h = doc.byId[`cfgTitle-${id}`]; assert.ok(h, `heading for ${id}`); assert.equal(h.attrs.tabindex, '-1'); assert.ok(doc.byId[`tab-${id}`].contains(h));
      const purpose = doc.byId[`tab-${id}`].querySelector('.cfg-purpose'); assert.ok(purpose, `purpose line for ${id}`);
      assert.ok(purpose.textContent.trim().split(/\s+/).length <= 20, `${id}: ${purpose.textContent}`);
      assert.ok(doc.byId[`tab-${id}`].querySelector('details.cfg-why'), `why note for ${id}`);
    }
  });
  test('there is no inline script and no inline event handler in the template', () => {
    assert.ok(!/<script/i.test(HTML)); assert.ok(!/\son[a-z]+\s*=/i.test(HTML));
  });
});

describe('configuration-tabs.js: behaviour', () => {
  test('opening a tab shows exactly one panel, moves aria-selected and the roving tabindex, focuses the heading and announces it', () => {
    const p = page(); assert.deepEqual(p.visible(), ['tab-overview']);
    p.$('tabbtn-design').onclick();
    assert.deepEqual(p.visible(), ['tab-design']);
    for (const id of ORDER) { const b = p.$(`tabbtn-${id}`); assert.equal(b.getAttribute('aria-selected'), id === 'design' ? 'true' : 'false'); assert.equal(b.tabIndex, id === 'design' ? 0 : -1); }
    assert.equal(p.doc.activeElement, p.$('cfgTitle-design')); assert.match(p.$('cfgAnnounce').textContent, /Design tab, 5 of 8/);
    assert.equal(p.loc.hash, '#tab-design');
  });
  test('Left, Right, Home and End move between tabs and wrap around, without a blocking prompt', () => {
    const p = page(); const at = (id) => p.$(`tabbtn-${id}`);
    p.press(at('overview'), 'ArrowLeft'); assert.deepEqual(p.visible(), ['tab-history']); assert.equal(p.doc.activeElement, at('history'));
    p.press(at('history'), 'ArrowRight'); assert.deepEqual(p.visible(), ['tab-overview']);
    p.press(at('overview'), 'End'); assert.deepEqual(p.visible(), ['tab-history']);
    p.press(at('history'), 'Home'); assert.deepEqual(p.visible(), ['tab-overview']);
    const e = p.press(at('overview'), 'ArrowRight'); assert.equal(e.prevented, true); assert.deepEqual(p.visible(), ['tab-business']);
    const other = p.press(at('business'), 'a'); assert.equal(other.prevented, undefined); assert.deepEqual(p.visible(), ['tab-business']);
  });
  test('Next and Back walk the recommended order; the first tab has no Back and the last has no Next', () => {
    const p = page(); const nav = (id) => p.$(`tab-${id}`).querySelector('.cfg-step-nav').children;
    assert.deepEqual(nav('overview').map((b) => b.textContent), ['Next: Business type']);
    assert.deepEqual(nav('history').map((b) => b.textContent), ['Back: Backup and transfer']);
    nav('overview')[0].onclick(); assert.deepEqual(p.visible(), ['tab-business']);
    nav('business')[1].onclick(); assert.deepEqual(p.visible(), ['tab-modules']);
    nav('modules')[0].onclick(); assert.deepEqual(p.visible(), ['tab-business']);
  });
  test('the hash picks the tab on load: #tab-x, #tab-x/sub, and the old ids', () => {
    for (const [hash, want] of [['#tab-design', 'design'], ['#tab-design/header', 'design'], ['#tab-backup', 'backup'], ['#look-identity', 'design'], ['#rows-seo', 'menus'], ['#cfgPresets', 'business'], ['#cfgHistory', 'history'], ['#cfgSetup', 'overview'], ['#nonsense', 'overview'], ['', 'overview']]) {
      assert.deepEqual(page({ hash }).visible(), [`tab-${want}`], hash || '(empty)');
    }
  });
  test('Back and Forward (popstate / hashchange) return to the tab in the address bar', () => {
    const p = page(); p.$('tabbtn-pages').onclick(); p.$('tabbtn-menus').onclick();
    p.loc.hash = '#tab-pages'; p.fire('window', 'popstate'); assert.deepEqual(p.visible(), ['tab-pages']);
    p.loc.hash = '#tab-history'; p.fire('window', 'hashchange'); assert.deepEqual(p.visible(), ['tab-history']);
  });
  test('a link to a tab inside the screen switches tabs without leaving the page; other links are left alone', () => {
    const p = page(); const mk = (href) => { const a = p.document.createElement('a'); a.setAttribute('href', href); p.$('cfgRoot').appendChild(a); return a; };
    const ev = { target: mk('#tab-modules') }; p.fire('document', 'click', ev); assert.equal(ev.prevented, true); assert.deepEqual(p.visible(), ['tab-modules']);
    const away = { target: mk('/en/dashboard/pages') }; p.fire('document', 'click', away); assert.equal(away.prevented, undefined);
  });
  test('hidden panels contain nothing that takes focus by script or by tab: only the shown tab button has tabindex 0', () => {
    const p = page(); p.$('tabbtn-design').onclick();
    const hiddenIds = ORDER.filter((id) => id !== 'design').map((id) => p.$(`tab-${id}`)); hiddenIds.forEach((e) => assert.equal(e.hidden, true));
    assert.deepEqual(p.tabbable(), ['tabbtn-design']);
  });
  test('the welcome panel (new sites) is shown with Overview only', () => {
    const p = page(); assert.equal(p.$('cfgSetupSlot').hidden, false); p.$('tabbtn-modules').onclick(); assert.equal(p.$('cfgSetupSlot').hidden, true);
  });
});

describe('badges: unpublished changes and setup problems land on the right tab', () => {
  const state = (changes) => ({ ready: true, version: 3, draft: { changes } });
  const build = (changes, issues = []) => {
    const cfg = { getState: () => state(changes), onSaved() {}, ready: Promise.resolve() };
    const p = page({ scripts: [[TABS, 'configuration-tabs.js'], [PROGRESS, 'configuration-progress.js']], extra: { LummetConfig: cfg } });
    p.window.LummetConfigProgress.issues(issues); p.window.LummetConfigProgress.state({ preset: 'news' }); return p;
  };
  const badge = (p, id) => { const b = p.$(`tabbtn-${id}`).querySelector('.cfg-tab-badge'); return b ? b.textContent : null; };
  test('draft changes are counted per tab from the areas the draft already reports', () => {
    const p = build([{ area: 'Modules' }, { area: 'Tools & features' }, { area: 'Pages' }, { area: 'Navigation' }, { area: 'SEO' }, { area: 'Components' }, { area: 'Look' }]);
    assert.match(badge(p, 'modules'), /^2.*2 unpublished changes/); assert.match(badge(p, 'pages'), /^1.*1 unpublished change$/);
    assert.match(badge(p, 'menus'), /^3.*3 unpublished changes/); assert.match(badge(p, 'design'), /^1.*1 unpublished change$/);
    for (const id of ['overview', 'business', 'backup', 'history']) assert.equal(badge(p, id), null, id);
  });
  test('a setup problem puts a warning on the tab that owns it, with a text for screen readers', () => {
    const p = build([], [{ id: 'landing-off', message: 'Landing pages are off' }, { id: 'news-needs-posts', message: 'News needs a page type' }]);
    assert.match(badge(p, 'pages'), /^!.*1 setup problem$/); assert.match(badge(p, 'modules'), /^!.*1 setup problem$/); assert.equal(badge(p, 'design'), null);
  });
  test('with nothing to report there are no badges, and the badge marks are hidden from screen readers', () => {
    const p = build([]); for (const id of ORDER) assert.equal(badge(p, id), null, id);
    const q = build([{ area: 'Modules' }]); const marks = q.$('tabbtn-modules').querySelectorAll('.cfg-badge'); assert.ok(marks.length); marks.forEach((m) => assert.equal(m.getAttribute('aria-hidden'), 'true'));
  });
  test('the setup checklist has six steps in order, each linking to a tab or a bar control, and ticks come from existing data', () => {
    const p = build([{ area: 'Look' }]); const items = p.$('cfgProgressList').children;
    assert.deepEqual(items.map((li) => li.querySelector('a').textContent), ['Pick a type', 'Review modules', 'Check homepage', 'Choose design', 'Preview', 'Publish']);
    assert.deepEqual(items.map((li) => li.querySelector('a').href), ['#tab-business', '#tab-modules', '#tab-pages', '#tab-design', '#cfgPreviewBtn', '#cfgReviewBtn']);
    assert.deepEqual(items.map((li) => li.className), ['is-done', '', '', 'is-done', '', '']);
  });
});

describe('lazy start: heavy parts wait for their tab', () => {
  const probe = (tab) => `window.__ran = (window.__ran||[]).concat(${JSON.stringify(tab)});`;
  const gated = (file, tab) => {
    const src = read(`static/js/admin/${file}`); const m = /^\(function \(\) \{\n[\s\S]*?\n  var T = window\.LummetConfigTabs;\n  if \(T && T\.onFirstOpen\) T\.onFirstOpen\("(\w+)", boot\); else boot\(\);\n  function boot\(\) \{\n/m.exec(src);
    assert.ok(m, `${file} has the start gate`); assert.equal(m[1], tab); return src.replace(m[0], m[0] + '\n' + probe(tab) + '\n');
  };
  for (const [file, tab] of [['configuration-look.js', 'design'], ['configuration-rows.js', 'menus'], ['configuration-transfer.js', 'backup']]) {
    test(`${file} does not run until ${tab} first opens, then runs once`, () => {
      const p = page({ scripts: [[TABS, 'configuration-tabs.js']] }); const s = gated(file, tab);
      const run = () => { try { p.ctx.__x = 1; new vm.Script(s, { filename: file }).runInContext(p.ctx); } catch { /* the script body needs the full page; only the start order matters here */ } };
      run(); assert.equal((p.window.__ran || []).length, 0, 'must not run at page load');
      p.$(`tabbtn-${tab === 'design' ? 'business' : 'overview'}`).onclick(); assert.equal((p.window.__ran || []).length, 0, 'other tabs do not start it');
      p.$(`tabbtn-${tab}`).onclick(); assert.deepEqual([...p.window.__ran], [tab]);
      p.$('tabbtn-history').onclick(); p.$(`tabbtn-${tab}`).onclick(); assert.deepEqual([...p.window.__ran], [tab], 'not twice');
    });
  }
  test('landing straight on a tab by its link starts that tab\'s script at once', () => {
    const p = page({ hash: '#tab-design/header' }); assert.equal(p.window.LummetConfigTabs.isOpened('design'), true);
  });
  test('without the tabs script the three scripts still start by themselves', () => {
    for (const f of ['configuration-look.js', 'configuration-rows.js', 'configuration-transfer.js']) assert.match(read(`static/js/admin/${f}`), /if \(T && T\.onFirstOpen\) T\.onFirstOpen\("\w+", boot\); else boot\(\);/);
  });
});

describe('size and rules for the new files', () => {
  test('the new scripts are plain scripts under 250 lines with no innerHTML', () => {
    for (const [name, raw] of [['configuration-tabs.js', TABS], ['configuration-progress.js', PROGRESS]]) {
      const src = raw.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n'); assert.ok(raw.split('\n').length < 250, name); assert.ok(!/^\s*(import|export)\s/m.test(src), name); assert.ok(!/innerHTML|insertAdjacentHTML|document\.write|eval\(/.test(src), name);
    }
  });
  test('the new stylesheet part is small, respects reduced motion, and the built bundle contains it', () => {
    assert.ok(CSS.split('\n').length < 250); assert.match(CSS, /prefers-reduced-motion/); assert.ok(read('static/css/dashboard.css').includes('.cfg-tab[aria-selected="true"]'));
  });
  test('the content column does not trap position:sticky (no overflow:auto parent) and cannot widen the page', () => {
    const rule = CSS.split('\n').find((l) => l.includes('.admin-content#cfgRoot')) || '';
    assert.match(rule, /overflow:\s*visible/); assert.match(rule, /min-width:\s*0/); assert.match(CSS, /\.cfg-sticky\s*\{[^}]*position:\s*sticky/); assert.match(CSS, /\.cfg-footer\s*\{[^}]*position:\s*sticky/);
  });
  test('the tabs and progress scripts load before the scripts that use them, and are listed once', () => {
    const base = read('templates/layout/base.html'); const at = (n) => base.indexOf(`/static/js/admin/${n}.js`);
    assert.ok(at('configuration-tabs') > 0 && at('configuration-tabs') < at('configuration-draft')); assert.ok(at('configuration-progress') > at('configuration'));
    for (const n of ['configuration-tabs', 'configuration-progress']) assert.equal(base.split(`/static/js/admin/${n}.js`).length - 1, 1, n);
  });
});
