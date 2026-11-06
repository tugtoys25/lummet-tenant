// Phase 11 / T3 follow-ups: the gaps left open when T3 merged.
//   1. Ratings and bookmarks drawn by script (sidebar, search box, casino grid component) follow the switches: the public casino
//      endpoints drop the rating and say what to hide, and the scripts obey.
//   2. Rating structured data (aggregateRating / reviewRating) goes when Ratings is off.
//   3. A section navigation bar with fewer than two links left is removed.
//   4. The comparison "top picks" rating is tagged like the other rating blocks.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeProfile } from '../worker/site-profile/profile.js';
import { rewriteHtmlLinks, stripRatingJsonLd, dropThinSectionNavs } from '../worker/site-profile/links.js';
import { renderSectionNav } from '../worker/generic-review-sections.js';
import { publicRoutes } from '../worker/api/public.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(here, '..', rel), 'utf8');
const off = (...ids) => normalizeProfile({ features: Object.fromEntries(ids.map((i) => [i, false])) });
const ld = (o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;
const jsonOf = (html) => JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1]);

const CASINOS = [
  { slug: 'a', name: 'A', logo: '', rating: 4.5, bonus_title: '', bonus_value: '', website_url: '' },
  { slug: 'b', name: 'B', logo: '', rating: 3.5, bonus_title: '', bonus_value: '', website_url: '' },
];
// A minimal D1 stand-in: every query returns the casino rows (or nothing). The profile comes in through the preview hook.
const envWith = (profile) => ({
  __preview: profile ? { profile } : undefined,
  DB: { prepare: () => ({ bind() { return this; }, all: async () => ({ results: CASINOS.map((c) => ({ ...c })) }), first: async () => null, run: async () => ({}) }) },
});
const call = async (p, profile) => {
  const res = await publicRoutes({ request: new Request('https://s.example' + p), env: envWith(profile), path: p, user: null });
  return res.json();
};

describe('1. script-built cards follow Ratings and Bookmarks', () => {
  for (const p of ['/api/v1/public/casinos/list', '/api/v1/public/casinos/geo']) {
    test(`${p}: default profile is unchanged (ratings kept, no "hide")`, async () => {
      const d = await call(p, null);
      assert.equal(d.casinos.length, 2); assert.ok(d.casinos.every((c) => c.rating > 0)); assert.equal('hide' in d, false);
    });
    test(`${p}: ratings off drops the rating and says so`, async () => {
      const d = await call(p, off('ratings'));
      assert.equal(d.casinos.length, 2); assert.ok(d.casinos.every((c) => !('rating' in c) && c.slug && c.name));
      assert.deepEqual(d.hide, ['ratings']);
    });
    test(`${p}: bookmarks off keeps ratings and says to hide bookmarks`, async () => {
      const d = await call(p, off('bookmarks'));
      assert.ok(d.casinos.every((c) => c.rating > 0)); assert.deepEqual(d.hide, ['bookmarks']);
    });
    test(`${p}: both off`, async () => { assert.deepEqual((await call(p, off('ratings', 'bookmarks'))).hide, ['ratings', 'bookmarks']); });
  }
  test('a bookmarks switch whose module is off (accounts) also counts as off', async () => {
    const d = await call('/api/v1/public/casinos/list', normalizeProfile({ modules: { accounts: false } }));
    assert.deepEqual(d.hide, ['bookmarks']);
  });
  test('the scripts obey "hide": sidebar, search box and the casino grid component', () => {
    const app = read('static/js/app.js');
    assert.match(app, /showRating = !\(data\.hide \|\| \[\]\)\.includes\("ratings"\)/);
    assert.equal((app.match(/showRating \?/g) || []).length >= 2, true);
    const grid = read('templates/components/casino_grid.html');
    assert.match(grid, /const hide = data\.hide \|\| \[\]/);
    assert.match(grid, /showBookmark \? `/); assert.match(grid, /showRating \? `<div class="casino-card__rating"/);
  });
  test('the casino grid script is still valid JavaScript with the new conditionals', () => {
    const js = /<script>([\s\S]*)<\/script>/.exec(read('templates/components/casino_grid.html'))[1].replace(/\{\{position\}\}/g, '1').replace(/\{\{limit\}\}/g, '5');
    assert.doesNotThrow(() => new Function(`return (async () => {${js}})`));
  });
});

describe('2. rating structured data', () => {
  const review = { '@context': 'https://schema.org', '@type': 'Review', name: 'X', reviewRating: { '@type': 'Rating', ratingValue: 4 }, itemReviewed: { '@type': 'Casino', name: 'Y', aggregateRating: { ratingValue: 3, ratingCount: 1 } } };
  test('ratings off: reviewRating and aggregateRating go, the rest of the object stays', () => {
    const out = jsonOf(rewriteHtmlLinks(`<p>a</p>${ld(review)}`, off('ratings'), 'https://s.example'));
    assert.deepEqual(out, { '@context': 'https://schema.org', '@type': 'Review', name: 'X', itemReviewed: { '@type': 'Casino', name: 'Y' } });
  });
  test('ratings on (other switches off): structured data is untouched', () => {
    const page = `<p>a</p>${ld(review)}`;
    assert.equal(rewriteHtmlLinks(page, off('faqs'), 'https://s.example'), page);
  });
  test('arrays and @graph are walked; untagged non-JSON-LD scripts and bad JSON are left alone', () => {
    const graph = { '@graph': [{ '@type': 'Product', aggregateRating: { ratingValue: 1 } }, { '@type': 'WebPage', name: 'W' }] };
    const out = jsonOf(stripRatingJsonLd(ld(graph)));
    assert.deepEqual(out, { '@graph': [{ '@type': 'Product' }, { '@type': 'WebPage', name: 'W' }] });
    const keep = '<script>var aggregateRating = 1;</script><script type="application/ld+json">{ not json aggregateRating</script>';
    assert.equal(stripRatingJsonLd(keep), keep);
  });
  test('it runs even when "hide links to disabled modules" is off', () => {
    const p = normalizeProfile({ features: { ratings: false }, header: { autoPrune: false } });
    assert.ok(!/aggregateRating/.test(rewriteHtmlLinks(ld(review), p, 'https://s.example')));
  });
  test('the real emitter (render/seo.js) output is handled, and its < > & escaping survives the rewrite', () => {
    const seo = read('worker/render/seo.js');
    assert.match(seo, /application\/ld\+json/); assert.match(seo, /\\u003c/);
    const body = JSON.stringify({ '@type': 'Review', name: 'a </script><b>&c', reviewRating: { ratingValue: 4 } }).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
    const page = `<p>x</p>\n<script type="application/ld+json">\n${body}\n</script>\n`;
    const out = rewriteHtmlLinks(page, off('ratings'), 'https://s.example');
    assert.ok(!out.includes('reviewRating'));
    assert.equal((out.match(/<\/script>/g) || []).length, 1, 'a value containing </script> must stay escaped');
    assert.match(out, /name":"a \\u003c\/script\\u003e\\u003cb\\u003e\\u0026c"/);
  });
  test('the older link pruning of JSON-LD keeps the same escaping', () => {
    const ldp = '<script type="application/ld+json">' + '{"@type":"BreadcrumbList","name":"x \\u003c/script\\u003e","itemListElement":[]}' + '</script>';
    const out = rewriteHtmlLinks(ldp, normalizeProfile({ modules: { news: false } }), 'https://s.example');
    assert.equal((out.match(/<\/script>/g) || []).length, 1);
  });
  test('every controller that writes rating structured data hands it to the renderer as a schema object', () => {
    for (const f of ['affiliates', 'casinos', 'reviews', 'generic-reviews', 'content-items']) assert.match(read(`worker/controllers/${f}.js`), /reviewRating|aggregateRating/, f);
  });
});

describe('3. a section nav with fewer than two links left is removed', () => {
  const items = [{ id: 'a', title: 'A', cap: 'features.reviewSections' }, { id: 'b', title: 'B', cap: 'features.reviewSections' }, { id: 'c', title: 'C' }];
  const page = (nav) => `<h1>t</h1>${nav}<section id="c">c</section>`;
  test('one link left: the whole bar goes', () => {
    const out = rewriteHtmlLinks(page(renderSectionNav(items)), off('reviewSections'), 'https://s.example');
    assert.ok(!out.includes('sn-nav')); assert.ok(out.includes('<section id="c">'));
  });
  test('two links left: the bar stays', () => {
    const two = [{ id: 'a', title: 'A', cap: 'features.reviewSections' }, { id: 'b', title: 'B' }, { id: 'c', title: 'C' }];
    const out = rewriteHtmlLinks(page(renderSectionNav(two)), off('reviewSections'), 'https://s.example');
    assert.equal((out.match(/sn-nav__link/g) || []).length, 2);
  });
  test('nothing off: the page is returned untouched', () => {
    const p = page(renderSectionNav(items));
    assert.equal(rewriteHtmlLinks(p, normalizeProfile({}), 'https://s.example'), p);
  });
  test('a page with no nav is not changed by the nav rule; two navs are judged one by one', () => {
    assert.equal(dropThinSectionNavs('<p>x</p>'), '<p>x</p>');
    const thin = renderSectionNav([{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }]).replace(/<a [^>]*data-sn-id="b"[^>]*>B<\/a>/, '');
    const full = renderSectionNav([{ id: 'x', title: 'X' }, { id: 'y', title: 'Y' }]);
    const out = dropThinSectionNavs(thin + full);
    assert.ok(!out.includes('data-sn-id="a"')); assert.ok(out.includes('data-sn-id="x"') && out.includes('data-sn-id="y"'));
  });
});

describe('4. comparison picks', () => {
  test('the top-picks rating is tagged features.ratings and the page loses it when ratings are off', () => {
    const src = read('worker/comparison-design.js');
    assert.match(src, /class="cmps-pick__rating" data-cap="features\.ratings"/);
    const html = '<li><strong>T</strong> <span class="cmps-pick__rating" data-cap="features.ratings">4.0 / 5</span></li>';
    assert.ok(!rewriteHtmlLinks(html, off('ratings'), 'https://s.example').includes('cmps-pick__rating'));
    assert.equal(rewriteHtmlLinks(html, off('faqs'), 'https://s.example'), html);
  });
});
