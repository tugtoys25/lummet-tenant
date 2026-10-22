// Guards the split of the admin script: the files, their load order, and that together
// they still define what the admin pages call.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { adminScriptNames } from './support/admin-js-source.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf-8');

// The order is the order the code had in the single file. Listeners and top-level
// declarations depend on it, so changing it needs a reason.
const ORDER = ['init', 'reviews', 'news', 'pages', 'settings', 'homepage-builder-items', 'homepage-builder-section', 'homepage-builder-content', 'homepage-builder-controls', 'homepage-builder-render', 'homepage-builder-collect', 'theme-presets', 'settings-form', 'settings-form-theme', 'settings-form-sections', 'settings-form-save', 'ai-generator',
  'categories', 'countries', 'research', 'research-content-builder', 'research-content-fields', 'research-content-sections', 'research-content-wire', 'research-content-init', 'research-sources-claims', 'research-relations', 'research-versions',
  'research-review-queue', 'research-datasets', 'content-edit-actions', 'content-edit-news', 'content-edit-pages', 'content-edit-taxonomy', 'payment-methods', 'platform-updates', 'platform-updates-form', 'platform-updates-edit', 'platform-updates-actions', 'html-escape',
  'platform-updates-init', 'ad-rules', 'seo-pages', 'country-pages', 'category-country-pages'];

describe('admin script layout', () => {
  test('the old single file is gone and base.html loads the parts in the fixed order', () => {
    assert.ok(!existsSync(join(ROOT, 'static/js/admin.js')));
    assert.ok(!read('templates/layout/base.html').includes('/static/js/admin.js'));
    assert.deepEqual(adminScriptNames(), ORDER);
  });

  test('every file in static/js/admin/ is loaded, and every loaded file exists', () => {
    const onDisk = readdirSync(join(ROOT, 'static/js/admin')).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3)).sort();
    assert.deepEqual([...ORDER].sort(), onDisk);
  });

  test('the parts load after media-picker.js and before casino-admin.js, inside the admin-only block', () => {
    const base = read('templates/layout/base.html');
    const first = base.indexOf('/static/js/admin/init.js');
    const last = base.indexOf('/static/js/admin/category-country-pages.js');
    assert.ok(base.indexOf('/static/js/media-picker.js') < first);
    assert.ok(last < base.indexOf('/static/js/casino-admin.js'));
    const open = base.lastIndexOf('<!--@full-->', first);
    assert.ok(open > -1 && base.indexOf('<!--@/full-->', last) > last && base.indexOf('<!--@/full-->', open) > last, 'inside a @full block');
  });

  test('parts are plain scripts (no import/export) that stay under 1,200 lines', () => {
    for (const n of ORDER) {
      const text = read(`static/js/admin/${n}.js`);
      assert.ok(!/^\s*(import|export)\s/m.test(text), n);
      assert.ok(text.split('\n').length <= 1200, `${n}: ${text.split('\n').length} lines`);
      new vm.Script(text, { filename: `${n}.js` });
    }
  });

  test('loaded one after the other like the browser does, they define the same functions and listeners', () => {
    const listeners = [];
    const noop = () => null;
    const document = { addEventListener: (type, fn) => listeners.push({ type, fn }), getElementById: noop, querySelector: noop, querySelectorAll: () => [] };
    const ctx = vm.createContext({ document, window: {}, console, fetch: noop, setTimeout, clearTimeout, navigator: {}, location: { href: 'https://x.test/en/dashboard' }, localStorage: {} });
    for (const n of ORDER) vm.runInContext(read(`static/js/admin/${n}.js`), ctx, { filename: `${n}.js` });
    const defined = vm.runInContext('typeof loadReviewsTable + typeof editReview + typeof escapeHtml + typeof renderHomepageSections + typeof saveAdRule + typeof initCategoryCountryForm + typeof SITE_THEME_PRESETS', ctx);
    assert.equal(defined, 'function'.repeat(6) + 'object');
    assert.equal(listeners.length, 4, 'DOMContentLoaded listeners registered by the admin script');
    assert.ok(listeners.every((l) => l.type === 'DOMContentLoaded'));
    const all = ORDER.map((n) => read(`static/js/admin/${n}.js`)).join('');
    // 202 in the original single file, +4 since v22.32 (renderHomepageSections was cut into 4 helpers), +3 since v22.41 (settings form parts)
    assert.equal((all.match(/^(?:async\s+)?function\s+\w+/gm) || []).length, 209, 'top-level functions');
  });
});

describe('homepage builder render parts (v22.32)', () => {
  test('the entry only loops over the sections and calls the four helpers, each helper has its own file', () => {
    const entry = read('static/js/admin/homepage-builder-render.js');
    assert.ok(entry.split('\n').length < 40);
    for (const fn of ['renderHomepageSectionShell', 'renderHomepageParagraphs', 'renderHomepageCards', 'bindHomepageSectionControls']) assert.match(entry, new RegExp(`${fn}\\(`));
    const files = { 'homepage-builder-section': 'renderHomepageSectionShell', 'homepage-builder-content': 'renderHomepageParagraphs', 'homepage-builder-controls': 'bindHomepageSectionControls' };
    for (const [f, fn] of Object.entries(files)) {
      const s = read(`static/js/admin/${f}.js`);
      assert.match(s, new RegExp(`^function ${fn}\\(`, 'm'));
      assert.ok(s.split('\n').length < 400, `${f} too long`);
    }
    assert.match(read('static/js/admin/homepage-builder-content.js'), /^function renderHomepageCards\(wrapper, section\)/m);
  });

  test('platform updates: each part holds its functions, and nothing else defines them', () => {
    const want = {
      'platform-updates': ['loadPlatformUpdatesTable'],
      'platform-updates-form': ['openUpdateFeaturedImagePicker', 'setUpdateFeaturedImage', 'clearUpdateFeaturedImage', 'initPlatformUpdateForm'],
      'platform-updates-edit': ['editPlatformUpdate'],
      'platform-updates-actions': ['deletePlatformUpdate', 'cancelPlatformUpdateEdit', 'resetPlatformUpdateForm', 'showPlatformUpdateAlert', 'formatDateTimeLocal'],
    };
    for (const [file, fns] of Object.entries(want)) {
      const src = read(`static/js/admin/${file}.js`);
      const defined = [...src.matchAll(/^(?:async )?function (\w+)/gm)].map((m) => m[1]);
      assert.deepEqual(defined, fns, file);
    }
  });

  test('research content builder: each part defines its own functions, in the original order', () => {
    const want = {
      'research-content-builder': ['fetchResearchItemsCached', 'fetchResearchDatasetsCached', 'fetchResearchDatasetVersionsFor', 'researchEditorIdFor', 'destroyResearchSectionEditors', 'initResearchSectionEditors', 'researchEditorValue'],
      'research-content-fields': ['researchRichTextarea', 'researchFieldsHtml_heading', 'researchFieldsHtml_rich_text', 'researchFieldsHtml_statistic', 'researchTimelineEventRow', 'researchFieldsHtml_timeline', 'researchTableRow', 'researchFieldsHtml_table', 'researchFieldsHtml_source_citation', 'researchFieldsHtml_fact_card', 'researchFaqItemRow', 'researchFieldsHtml_faq', 'researchLinkRow', 'researchFieldsHtml_internal_links', 'researchFieldsHtml_research_reference', 'researchFieldsHtml_dataset_table', 'researchFieldsHtml_image'],
      'research-content-sections': ['researchSectionCardHtml', 'renderResearchFormSections', 'syncResearchSectionsFromDom', 'researchDefaultSectionFor'],
      'research-content-wire': ['wireResearchSectionBuilder'],
      'research-content-init': ['insertResearchTemplate', 'initResearchForm'],
    };
    for (const [file, fns] of Object.entries(want)) {
      const src = read(`static/js/admin/${file}.js`);
      assert.deepEqual([...src.matchAll(/^(?:async )?function (\w+)/gm)].map((m) => m[1]), fns, file);
    }
  });

  test('content edit actions (v22.58): each file holds its own functions, and nothing else defines them', () => {
    const want = {
      'content-edit-actions': ['deleteReview', 'deletePage', 'deleteNewsArticle', 'editReview', 'cancelReviewEdit'],
      'content-edit-news': ['editNews', 'toDatetimeLocal', 'cancelNewsEdit'],
      'content-edit-pages': ['editPage', 'cancelPageEdit'],
      'content-edit-taxonomy': ['editCategory', 'cancelCategoryEdit', 'editCountry', 'cancelCountryEdit']
    };
    const defined = (n) => [...read(`static/js/admin/${n}.js`).matchAll(/^(?:async\s+)?function\s+(\w+)/gm)].map((m) => m[1]);
    for (const [n, fns] of Object.entries(want)) assert.deepEqual(defined(n), fns, n);
    const order = adminScriptNames();
    assert.deepEqual(order.slice(order.indexOf('content-edit-actions'), order.indexOf('content-edit-actions') + 4), Object.keys(want));
    for (const n of Object.keys(want)) assert.ok(read(`static/js/admin/${n}.js`).split('\n').length < 250, n);
  });
});
