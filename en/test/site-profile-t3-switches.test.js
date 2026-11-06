// Phase 11 / T3: the nine feature switches (ratings, faqs, reviewSections, bookmarks, inquiries, submissions, components,
// homepageBuilder, importTools). For each switch four things are checked, where the switch has that thing:
//   1. its dashboard screen / public route is gone when off (gate)
//   2. its admin API prefixes are refused when off (apiGate)
//   3. its public block is gone from finished pages when off (tag + rewriteHtmlLinks)
//   4. turning it on again restores everything and nothing stored changes (only "off" is ever stored)
// plus the pruner rules added for T3, the module requirements, the link-pass split, guidance and the hero-only components rule.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FEATURES, PRESETS, capabilityForDashboardType, capabilityForPublicType } from '../worker/site-profile/registry.js';
import { gate, apiGate, isEnabled, normalizeProfile, applyPreset, defaultProfile, CONFIG_PATH } from '../worker/site-profile/profile.js';
import { rewriteHtmlLinks, needsCapPrune, needsPublicPass, needsRewrite } from '../worker/site-profile/links.js';
import { pruneByCap, hideOpenTag } from '../worker/site-profile/cap-blocks.js';
import { diagnose } from '../worker/site-profile/guidance.js';
import { renderSections, faqSchemaScript, renderSectionNav, sectionCap } from '../worker/generic-review-sections.js';
import { buildCasinoCards, buildReviewCasinoCards } from '../worker/controllers/casino-cards.js';
import { renderAllInjectionPoints, renderPageComponents } from '../worker/component-engine.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(here, '..', rel), 'utf8');
const offProfile = (...ids) => normalizeProfile({ features: Object.fromEntries(ids.map((i) => [i, false])) });
const NINE = ['ratings', 'faqs', 'reviewSections', 'bookmarks', 'inquiries', 'submissions', 'components', 'homepageBuilder', 'importTools'];

describe('registry: the nine switches', () => {
  test('all nine exist, with a label and help text', () => {
    for (const id of NINE) { assert.ok(FEATURES[id], id); assert.ok(FEATURES[id].label && FEATURES[id].help, id); }
  });

  test('moved route types are owned by the new switch, once', () => {
    const dash = { dashboardInquiries: 'inquiries', dashboardSubmissions: 'submissions', dashboardComponents: 'components', dashboardImportHistory: 'importTools' };
    for (const [t, f] of Object.entries(dash)) assert.equal(capabilityForDashboardType(t)?.capability, `features.${f}`, t);
    const pub = { userBookmarks: 'bookmarks', userInquiries: 'inquiries', userSubmitCasino: 'submissions' };
    for (const [t, f] of Object.entries(pub)) assert.equal(capabilityForPublicType(t)?.capability, `features.${f}`, t);
    // the rest of the user area and the Users screen stay with the accounts module
    assert.equal(capabilityForPublicType('userProfile')?.capability, 'accounts.area');
    assert.equal(capabilityForDashboardType('dashboardUsers')?.module, 'accounts');
  });

  test('requirements are written as module ids', () => {
    assert.deepEqual(['bookmarks', 'inquiries', 'submissions'].map((f) => FEATURES[f].requires), ['accounts', 'accounts', 'accounts']);
    assert.equal(FEATURES.importTools.requires, 'partners');
    assert.equal(FEATURES.reviewSections.requires, 'reviews|content');
  });
});

describe('1. dashboard screen and public route', () => {
  for (const f of NINE) {
    for (const t of FEATURES[f].dashboard) {
      test(`${f}: dashboard screen ${t} redirects to Configuration when off and passes when on`, () => {
        assert.deepEqual(gate({ type: t }, offProfile(f)), { action: 'redirect', status: 302, location: CONFIG_PATH });
        assert.deepEqual(gate({ type: t }, defaultProfile()), { action: 'pass' });
      });
    }
    for (const t of FEATURES[f].public || []) {
      test(`${f}: public route ${t} follows the removed-page mode when off and passes when on`, () => {
        assert.equal(gate({ type: t }, offProfile(f)).action, 'gone');
        assert.equal(gate({ type: t }, normalizeProfile({ features: { [f]: false }, disabled: { mode: '410' } })).status, 410);
        assert.deepEqual(gate({ type: t }, defaultProfile()), { action: 'pass' });
      });
    }
  }
  test('ratings, faqs and homepageBuilder have no screen of their own (they are blocks on other screens)', () => {
    for (const f of ['ratings', 'faqs', 'homepageBuilder']) assert.deepEqual([FEATURES[f].dashboard, FEATURES[f].public || []], [[], []], f);
  });
});

describe('2. admin API', () => {
  for (const f of NINE) {
    for (const pre of FEATURES[f].api) {
      test(`${f}: ${pre} is refused with feature_disabled when off and open when on`, () => {
        const r = apiGate(pre + '/x', offProfile(f));
        assert.equal(r.status, 404); assert.equal(r.body.code, 'feature_disabled'); assert.equal(r.body.capability, `features.${f}`);
        assert.equal(apiGate(pre + '/x', defaultProfile()), null);
      });
    }
  }
  test('only the component MANAGEMENT endpoints are refused; read, list, preview and pick stay open', () => {
    const p = offProfile('components');
    for (const ok of ['/api/v1/components/list', '/api/v1/components/preview', '/api/v1/component/preview', '/api/v1/components/pick-sources', '/api/v1/components/hero-preview', '/api/v1/components/sources']) assert.equal(apiGate(ok, p), null, ok);
    for (const no of ['/api/v1/component/create', '/api/v1/component/update', '/api/v1/component/delete', '/api/v1/component/get', '/api/v1/components/assign',
      '/api/v1/components/bulk-assign', '/api/v1/components/unassign', '/api/v1/components/update-assignment', '/api/v1/components/toggle', '/api/v1/components/page', '/api/v1/components/reorder']) assert.equal(apiGate(no, p)?.status, 404, no);
  });
  test('user-side and admin-side prefixes of bookmarks, inquiries and submissions are all refused', () => {
    assert.equal(apiGate('/api/v1/user/bookmarks', offProfile('bookmarks')).status, 404);
    assert.equal(apiGate('/api/v1/user/bookmark/add', offProfile('bookmarks')).status, 404);
    assert.equal(apiGate('/api/v1/user/inquiries', offProfile('inquiries')).status, 404);
    assert.equal(apiGate('/api/v1/user/inquiry/create', offProfile('inquiries')).status, 404);
    assert.equal(apiGate('/api/v1/admin/inquiries', offProfile('inquiries')).status, 404);
    assert.equal(apiGate('/api/v1/admin/inquiry/reply', offProfile('inquiries')).status, 404);
    assert.equal(apiGate('/api/v1/user/submissions', offProfile('submissions')).status, 404);
    assert.equal(apiGate('/api/v1/user/submit-casino', offProfile('submissions')).status, 404);
    assert.equal(apiGate('/api/v1/admin/submissions', offProfile('submissions')).status, 404);
    assert.equal(apiGate('/api/v1/admin/submission/update', offProfile('submissions')).status, 404);
    // the other account endpoints are untouched
    assert.equal(apiGate('/api/v1/user/profile', offProfile('bookmarks', 'inquiries', 'submissions')), null);
    assert.equal(apiGate('/api/v1/admin/users', offProfile('bookmarks', 'inquiries', 'submissions')), null);
  });
  test('import tools and review blocks', () => {
    for (const p of ['/api/v1/imports/list', '/api/v1/import/get', '/api/v1/imports/conversions']) assert.equal(apiGate(p, offProfile('importTools')).status, 404, p);
    assert.equal(apiGate('/api/v1/conversions/x', offProfile('importTools')), null);
    for (const p of ['/api/v1/review-blocks/list', '/api/v1/review-blocks/sync']) assert.equal(apiGate(p, offProfile('reviewSections')).status, 404, p);
    assert.equal(apiGate('/api/v1/reviews/list', offProfile('reviewSections')), null);
  });
  test('ratings, faqs and homepageBuilder have no admin API prefix: their data lives in endpoints owned by casinos, reviews and settings', () => {
    for (const f of ['ratings', 'faqs', 'homepageBuilder']) assert.deepEqual(FEATURES[f].api, [], f);
  });
});

describe('3. public blocks', () => {
  const stripped = (html, ...ids) => rewriteHtmlLinks(html, offProfile(...ids), 'https://s.example');

  test('ratings: hero stars and info rows on casino and item pages, the review header, the comparison row and the card', () => {
    for (const [file, needles] of [
      ['templates/pages/casino.html', ['rating-stars', 'Rating</dt>', '{{rating}} / 5']],
      ['templates/pages/content-item.html', ['rating-stars', '{{it_rating}}</dt>']],
      ['templates/pages/review.html', ['rating-stars']],
      ['templates/pages/generic-review.html', ['rating-stars']],
      ['templates/pages/comparison.html', ['cmp-rating-row']],
      ['templates/components/casino-card.html', ['class="rating"']],
    ]) {
      const src = read(file), out = stripped(src, 'ratings');
      for (const n of needles) { assert.ok(src.includes(n), `${file} lost ${n}`); assert.ok(!out.includes(n), `${file} still has ${n} when ratings are off`); }
      assert.ok(out.length < src.length, file);
    }
    // the page around the removed rating is untouched
    assert.match(stripped(read('templates/pages/casino.html'), 'ratings'), /<h1>\{\{name\}\}<\/h1>/);
  });

  test('ratings: the "Status" row next to the removed "Rating" row stays', () => {
    const out = stripped(read('templates/pages/casino.html'), 'ratings');
    assert.match(out, /<dt>Status<\/dt><dd>\{\{status\}\}<\/dd>/);
  });

  test('faqs: the review FAQ section and the FAQ component go, with the component JSON-LD inside it', () => {
    const review = stripped(read('templates/pages/review.html'), 'faqs');
    assert.ok(!review.includes('rv-sec--faq')); assert.ok(read('templates/pages/review.html').includes('rv-sec--faq'));
    const comp = read('templates/components/faq_group.html');
    assert.ok(comp.includes('application/ld+json'));
    assert.equal(stripped(comp, 'faqs').trim(), '');
  });

  test('faqs: FAQ JSON-LD from sections is a tagged script and is removed as a whole', () => {
    const s = faqSchemaScript([{ q: 'Q?', a: 'A.' }]);
    assert.match(s, /data-cap="features\.faqs"/);
    const page = `<p>before</p>${s}<script>var keep = "FAQPage";</script><p>after</p>`;
    const out = stripped(page, 'faqs');
    assert.ok(!out.includes('application/ld+json')); assert.ok(out.includes('var keep = "FAQPage";')); assert.ok(out.includes('<p>before</p>') && out.includes('<p>after</p>'));
    assert.equal(rewriteHtmlLinks(page, offProfile('ratings'), 'https://s.example'), page);
    assert.equal(faqSchemaScript([]), '');
  });

  test('reviewSections: every non-FAQ section and its nav entry go; FAQ sections follow the FAQ switch instead', async () => {
    const faq = 'lmsec:' + JSON.stringify({ type: 'faq', items: [{ q: 'Q1', a: 'A1' }] });
    const blocks = [{ title: 'Intro', content: '<p>rich body</p>' }, { title: 'Questions', content: faq }, { title: 'Facts', content: 'lmsec:' + JSON.stringify({ type: 'callout', tone: 'tip', title: 'Tip', text: 'x' }) }];
    const out = await renderSections({}, blocks);
    assert.equal(out.nav.length, 3);
    assert.deepEqual(out.nav.map((n) => n.cap), ['features.reviewSections', 'features.faqs', 'features.reviewSections']);
    assert.equal(sectionCap('faq'), 'features.faqs'); assert.equal(sectionCap('rich'), 'features.reviewSections');
    const page = `<article>${renderSectionNav(out.nav)}${out.html}</article>`;
    const noSections = stripped(page, 'reviewSections');
    assert.ok(!noSections.includes('rich body') && !noSections.includes('Facts'));
    assert.ok(noSections.includes('Q1') && noSections.includes('rv-sec--faq'), 'the FAQ section stays when only review sections are off');
    // only the FAQ link is left, and a bar of one link is not useful: the bar goes (Phase 11 T3 follow-up)
    assert.ok(!/href="#section-1-intro"/.test(noSections) && !noSections.includes('sn-nav'));
    const noFaq = stripped(page, 'faqs');
    assert.ok(!noFaq.includes('Q1') && noFaq.includes('rich body'));
    assert.ok(!/href="#section-2-questions"/.test(noFaq));
    const both = stripped(page, 'faqs', 'reviewSections');
    assert.ok(!both.includes('review-section') && !both.includes('sn-nav__link'));
    assert.equal(rewriteHtmlLinks(page, defaultProfile(), ''), page);
  });

  test('bookmarks: card buttons in both card builders and the user-area link', () => {
    const casino = { slug: 'bc', name: 'BC', rating: 4, logo: '', bonus: 'x', bonus_value: 'x', status: 'active', features: '[]' };
    for (const [fn, html] of [['buildCasinoCards', buildCasinoCards([casino])], ['buildReviewCasinoCards', buildReviewCasinoCards([casino])]]) {
      const markup = Array.isArray(html) ? html.join('') : String(html);
      assert.ok(markup.includes('casino-card__bookmark'), `${fn} has no bookmark button`);
      const out = stripped(markup, 'bookmarks');
      assert.ok(!out.includes('casino-card__bookmark') && !out.includes('data-bookmark-slug'), fn);
      assert.ok(out.includes('data-casino-slug="bc"'), `${fn} lost its card`);
    }
    const nav = read('templates/layout/user-nav.html');
    const out = stripped(nav, 'bookmarks');
    assert.ok(!out.includes('/en/user/bookmarks') && out.includes('/en/user/inquiries') && out.includes('/en/user/submit-casino'));
  });

  test('inquiries and submissions: their user-area links', () => {
    const nav = read('templates/layout/user-nav.html');
    const noInq = stripped(nav, 'inquiries');
    assert.ok(!noInq.includes('/en/user/inquiries') && noInq.includes('/en/user/bookmarks') && noInq.includes('/en/user/submit-casino'));
    const noSub = stripped(nav, 'submissions');
    assert.ok(!noSub.includes('/en/user/submit-casino') && noSub.includes('/en/user/inquiries'));
  });

  test('homepageBuilder: the homepage sections wrapper goes; the Settings block is hidden (not removed) so Save keeps its fields', () => {
    const home = read('templates/pages/home.html');
    assert.ok(home.includes('{{homepage_sections_html}}'));
    assert.ok(!stripped(home, 'homepageBuilder').includes('{{homepage_sections_html}}'));
    const block = read('templates/pages/admin/settings/homepage-content.html');
    const hidden = pruneByCap(block, (c) => !c.includes('homepageBuilder'));
    assert.ok(hidden.includes('id="homepageSections"') && hidden.includes('addFeaturesSectionBtn'), 'builder markup must stay in the page');
    assert.match(hidden, /<div id="homepageBuilderBlock" hidden style="display:none">|<div id="homepageBuilderBlock" style="display:none" hidden>/);
    assert.equal(pruneByCap(block, () => true), block, 'on: untouched');
    const settings = read('templates/pages/admin/settings.html');
    assert.ok(!pruneByCap(settings, (c) => !c.includes('homepageBuilder')).includes('href="#homepage-content"'));
  });

  test('reviewSections: the casino-review tab and panel, the generic review editor and the landing page editors are hidden, not removed', () => {
    const none = (c) => !c.includes('reviewSections');
    const reviews = pruneByCap(read('templates/pages/admin/reviews.html'), none);
    assert.ok(reviews.includes('id="rsSections"') && reviews.includes('id="reviewBlockForm"'), 'editor markup stays so scripts find it');
    assert.match(reviews, /data-rv-tab="sections"[^>]*style="display:none"/);
    assert.match(reviews, /data-rv-panel="sections" hidden style="display:none"/);
    assert.equal((reviews.match(/data-rv-panel="sections"[^>]*\bhidden\b[^>]*\bhidden\b/g) || []).length, 0, 'no duplicate hidden attribute');
    for (const f of ['generic-review-edit', 'content-landing-page-edit', 'content-landing-page-create']) {
      const src = read(`templates/pages/admin/${f}.html`), out = pruneByCap(src, none);
      assert.ok(out.length >= src.length - 40, `${f}: nothing may be removed, only hidden`);
      assert.match(out, /<fieldset[^>]*style="display:none"[^>]*>/);
    }
    const js = read('static/js/dashboard/generic-review-edit.js');
    assert.match(js, /reviewBlocksFieldset/); assert.match(js, /blocksHidden \? Promise\.resolve/);
  });

  test('importTools and components have no public block of their own', () => {
    assert.deepEqual(FEATURES.importTools.public || [], []);
    assert.deepEqual(FEATURES.components.public || [], []);
  });
});

describe('4. on restores everything, nothing stored changes', () => {
  test('only "off" is ever stored: switching on removes the entry and a stored true is dropped', () => {
    for (const f of NINE) {
      assert.deepEqual(normalizeProfile({ features: { [f]: false } }).features, { [f]: false });
      assert.deepEqual(normalizeProfile({ features: { [f]: true } }).features, {});
    }
  });
  test('turning every switch off and on again gives byte-identical pages', () => {
    const files = ['templates/pages/casino.html', 'templates/pages/review.html', 'templates/layout/user-nav.html', 'templates/pages/home.html', 'templates/components/faq_group.html'];
    for (const file of files) {
      const src = read(file);
      assert.equal(rewriteHtmlLinks(src, defaultProfile(), ''), src, file);
      const off = rewriteHtmlLinks(src, offProfile(...NINE), '');
      const back = rewriteHtmlLinks(src, normalizeProfile({ ...offProfile(...NINE), features: {} }), '');
      assert.equal(back, src, `${file}: on again must restore the page exactly`);
      assert.notEqual(off, src, `${file}: off must change the page`);
    }
  });
  test('presets: existing sites keep everything (the default profile stores nothing); named presets store only "off"', () => {
    assert.deepEqual(defaultProfile().features, {});
    assert.deepEqual(applyPreset('full').features, {});
    for (const id of Object.keys(PRESETS)) for (const v of Object.values(applyPreset(id).features)) assert.equal(v, false, id);
  });
});

describe('requirements between switches and modules', () => {
  test('bookmarks, inquiries and submissions need Visitor accounts', () => {
    const p = normalizeProfile({ modules: { ...defaultProfile().modules, accounts: false } });
    for (const f of ['bookmarks', 'inquiries', 'submissions']) assert.equal(isEnabled(p, `features.${f}`), false, f);
    for (const f of ['bookmarks', 'inquiries', 'submissions']) assert.equal(isEnabled(defaultProfile(), `features.${f}`), true, f);
  });
  test('import tools need Affiliate & tracking', () => {
    assert.equal(isEnabled(normalizeProfile({ modules: { ...defaultProfile().modules, partners: false } }), 'features.importTools'), false);
  });
  test('review sections need reviews OR content: either is enough', () => {
    const mods = (o) => normalizeProfile({ modules: { ...defaultProfile().modules, reviews: false, content: false, ...o } });
    assert.equal(isEnabled(mods({}), 'features.reviewSections'), false);
    assert.equal(isEnabled(mods({ reviews: true }), 'features.reviewSections'), true);
    assert.equal(isEnabled(mods({ content: true }), 'features.reviewSections'), true);
  });
  test('a route behind an unmet requirement is refused even when the switch itself was never stored', () => {
    const p = normalizeProfile({ modules: { ...defaultProfile().modules, accounts: false } });
    assert.equal(apiGate('/api/v1/user/bookmark/add', p)?.status, 404);
    assert.equal(rewriteHtmlLinks('<a href="/en/user/bookmarks" data-cap="features.bookmarks">B</a>', p, ''), '');
  });
  test('switches without a requirement are not affected by modules', () => {
    const p = normalizeProfile({ modules: Object.fromEntries(Object.keys(defaultProfile().modules).map((k) => [k, false])) });
    for (const f of ['ratings', 'faqs', 'components', 'homepageBuilder']) assert.equal(isEnabled(p, `features.${f}`), true, f);
  });
});

describe('pruner rules added for T3', () => {
  const off = () => false, on = () => true;
  test('a tagged script or style is removed as a whole; untagged ones are never inspected', () => {
    const html = '<p>a</p><script type="application/ld+json" data-cap="x">{"a":1}</script><style data-cap="x">.a{}</style><script>var s="data-cap=\\"x\\"";</script><p>b</p>';
    assert.equal(pruneByCap(html, off), '<p>a</p><script>var s="data-cap=\\"x\\"";</script><p>b</p>');
    assert.equal(pruneByCap(html, on), html);
  });
  test('a tagged script inside a removed element goes with it, and unbalanced markup does not throw', () => {
    assert.equal(pruneByCap('<div data-cap="x"><script data-cap="y">1</script>t</div>k', off), 'k');
    assert.doesNotThrow(() => pruneByCap('<div data-cap="x"><script data-cap="x">', off));
  });
  test('data-cap-hide hides instead of removing', () => {
    assert.equal(pruneByCap('<div data-cap-hide="x" class="a">hi</div>', off), '<div class="a" style="display:none" hidden>hi</div>');
    assert.equal(pruneByCap('<div class="a" data-cap-hide="x">hi</div>', on), '<div class="a" data-cap-hide="x">hi</div>');
  });
  test('data-cap-hide keeps an existing hidden attribute once and merges an existing style', () => {
    assert.equal(pruneByCap('<div hidden data-cap-hide="x">hi</div>', off), '<div hidden style="display:none">hi</div>');
    assert.equal(pruneByCap('<div style="margin:0" data-cap-hide="x">hi</div>', off), '<div style="display:none;margin:0" hidden>hi</div>');
    assert.equal(pruneByCap("<div data-cap-hide='x' style='a:b'>hi</div>", off), "<div style='display:none;a:b' hidden>hi</div>");
    assert.equal(hideOpenTag('<input data-cap-hide="x" value="1"/>'), '<input value="1" style="display:none" hidden/>');
  });
  test('data-cap-hide inside a removed element is removed with it; children of a hidden element stay', () => {
    assert.equal(pruneByCap('<div data-cap="x"><p data-cap-hide="x">a</p></div>z', off), 'z');
    assert.equal(pruneByCap('<div data-cap-hide="x"><p>a</p><button id="b">b</button></div>', off), '<div style="display:none" hidden><p>a</p><button id="b">b</button></div>');
  });
  test('an element with both attributes is removed (data-cap wins)', () => {
    assert.equal(pruneByCap('<div data-cap="x" data-cap-hide="x">a</div>b', off), 'b');
  });
});

describe('public pass: block pruning is separate from link rewriting', () => {
  test('the default profile needs no pass; any off feature or off module does', () => {
    assert.equal(needsCapPrune(defaultProfile()), false); assert.equal(needsPublicPass(defaultProfile()), false);
    assert.equal(needsCapPrune(offProfile('ratings')), true); assert.equal(needsPublicPass(offProfile('ratings')), true);
    assert.equal(needsCapPrune(normalizeProfile({ modules: { ...defaultProfile().modules, news: false } })), true);
    assert.equal(needsCapPrune(null), false);
  });
  test('a feature switch alone does not turn on link rewriting', () => {
    assert.equal(needsRewrite(offProfile('ratings')), false);
  });
  test('with "hide links to disabled modules" off, blocks of switched-off features are still removed but links are left alone', () => {
    const p = normalizeProfile({ features: { ratings: false }, modules: { ...defaultProfile().modules, news: false }, header: { autoPrune: false } });
    assert.equal(needsRewrite(p), false); assert.equal(needsPublicPass(p), true);
    const out = rewriteHtmlLinks('<span data-cap="features.ratings">4/5</span><a href="/en/news">News</a>', p, '');
    assert.equal(out, '<a href="/en/news">News</a>');
  });
  test('tagged blocks are removed before links inside them are looked at, and a page with no tags is returned untouched', () => {
    const p = offProfile('bookmarks');
    assert.equal(rewriteHtmlLinks('<p>no tags</p>', p, ''), '<p>no tags</p>');
    assert.equal(rewriteHtmlLinks('<p data-cap="features.bookmarks"><a href="/en/x">x</a></p>ok', p, ''), 'ok');
  });
  test('fails open on garbage', () => {
    assert.doesNotThrow(() => rewriteHtmlLinks('<div data-cap="features.ratings"><a', offProfile('ratings'), ''));
    assert.equal(rewriteHtmlLinks('', offProfile('ratings'), ''), '');
  });
});

describe('guidance', () => {
  const noModule = (...ids) => normalizeProfile({ modules: { ...defaultProfile().modules, ...Object.fromEntries(ids.map((i) => [i, false])) } });
  test('one issue per missing module, with a one-click fix that switches the dependent switches off', () => {
    const p = noModule('accounts', 'partners', 'reviews', 'content');
    const ids = diagnose(p).map((i) => i.id).filter((i) => i.startsWith('features-need-'));
    assert.deepEqual(ids.sort(), ['features-need-accounts', 'features-need-partners', 'features-need-reviews-or-content']);
    const acc = diagnose(p).find((i) => i.id === 'features-need-accounts');
    assert.match(acc.message, /Bookmarks, Inquiries and Casino submissions need Visitor accounts/);
    assert.deepEqual(acc.fix.profile.features, { bookmarks: false, inquiries: false, submissions: false });
    assert.equal(diagnose(acc.fix.profile).some((i) => i.id === 'features-need-accounts'), false);
    const rs = diagnose(p).find((i) => i.id === 'features-need-reviews-or-content');
    assert.deepEqual(rs.fix.profile.features, { reviewSections: false });
  });
  test('no issue while the module is on, none once the dependent switch is stored off, none for the default profile', () => {
    assert.deepEqual(diagnose(defaultProfile()), []);
    assert.equal(diagnose(noModule('accounts')).filter((i) => i.id === 'features-need-accounts').length, 1);
    const already = normalizeProfile({ modules: noModule('accounts').modules, features: { bookmarks: false, inquiries: false, submissions: false } });
    assert.equal(diagnose(already).some((i) => i.id.startsWith('features-need-')), false);
  });
  test('no named preset produces a missing-module issue', () => {
    for (const id of Object.keys(PRESETS)) assert.deepEqual(diagnose(applyPreset(id)).filter((i) => i.id.startsWith('features-need-')), [], id);
  });
});

describe('presets (choices made by the implementer, open to change)', () => {
  const FOUR = ['bookmarks', 'inquiries', 'submissions', 'importTools'];
  test('every named preset except Full platform switches off bookmarks, inquiries, submissions and import tools', () => {
    for (const id of Object.keys(PRESETS)) {
      const f = applyPreset(id).features;
      for (const k of FOUR) assert.equal(f[k], id === 'full' ? undefined : false, `${id}.${k}`);
    }
  });
  test('news, research and static also switch off ratings and review sections; casino-list and casino-only review sections', () => {
    for (const id of ['news', 'research', 'static']) { const f = applyPreset(id).features; assert.equal(f.ratings, false, id); assert.equal(f.reviewSections, false, id); }
    for (const id of ['casino-list', 'casino-only']) { const f = applyPreset(id).features; assert.equal(f.reviewSections, false, id); assert.equal(f.ratings, undefined, id); }
    for (const id of ['list-reviews', 'sportsbook']) assert.equal(applyPreset(id).features.reviewSections, undefined, id);
  });
  test('no preset switches off FAQ blocks, components or the homepage builder (the Static preset keeps its earlier list)', () => {
    for (const id of Object.keys(PRESETS)) for (const k of ['faqs', 'components', 'homepageBuilder']) assert.equal(applyPreset(id).features[k], undefined, `${id}.${k}`);
  });
});

describe('components: only the hero banner is rendered while Components is off', () => {
  const rows = [
    { id: 1, type: 'hero', name: 'Hero', title: 'HERO', content: '', settings_json: '{}', position: 1, injection_point: 'top' },
    { id: 2, type: 'text_block', name: 'Text', title: 'TEXT', content: 'body', settings_json: '{}', position: 2, injection_point: 'content_top' },
  ];
  const harness = (host, features) => {
    const stored = JSON.stringify({ v: 2, preset: 'custom', modules: defaultProfile().modules, pages: {}, features });
    const db = { prepare: (sql) => ({ bind: () => ({ all: async () => ({ results: /FROM settings/i.test(sql) ? [{ key: 'site_profile', value: stored }] : rows }) }) }) };
    const renderer = {
      env: { DB: db }, request: { url: `https://${host}/en` },
      loadTemplate: async (n) => `[${n}|{{title}}]`,
      replaceVariables: (t, d) => t.replace('{{title}}', d.title),
    };
    return { db, renderer };
  };

  test('off: the hero stays, other components are hidden (all injection points)', async () => {
    const { db, renderer } = harness('t3-off.example', { components: false });
    const out = await renderAllInjectionPoints(renderer, db, 'home', '/');
    assert.match(out.top, /HERO/); assert.equal(out.content_top, '');
  });
  test('on: every component renders', async () => {
    const { db, renderer } = harness('t3-on.example', {});
    const out = await renderAllInjectionPoints(renderer, db, 'home', '/');
    assert.match(out.top, /HERO/); assert.match(out.content_top, /TEXT/);
  });
  test('the per-injection-point renderer follows the same rule', async () => {
    const { db, renderer } = harness('t3-off2.example', { components: false });
    const html = await renderPageComponents(renderer, db, 'home', '/', null);
    assert.match(html, /HERO/); assert.ok(!html.includes('TEXT'));
  });
  test('fails open: a renderer without an environment keeps components on', async () => {
    const { db } = harness('t3-open.example', { components: false });
    const renderer = { env: null, request: null, loadTemplate: async (n) => `[${n}|{{title}}]`, replaceVariables: (t, d) => t.replace('{{title}}', d.title) };
    const out = await renderAllInjectionPoints(renderer, db, 'home', '/');
    assert.match(out.content_top, /TEXT/);
  });
});

describe('Configuration screen', () => {
  test('the API meta carries requires and the screen honours it', () => {
    assert.match(read('worker/api/routes/site-profile.js'), /requires: f\.requires \|\| ""/);
    const js = read('static/js/admin/configuration.js');
    assert.match(js, /function reqMet\(k\)/); assert.match(js, /fcb\.disabled = true/);
  });
});
