// v18.4: generic reviews -- rich body, real sections, one dashboard route.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import * as contentItems from '../worker/database/content-items.js';
import * as genericReviews from '../worker/database/generic-reviews.js';
import { handleAPI } from '../worker/api.js';
import { renderContentLandingPage, renderGenericReview, renderReview, renderReviewList, renderAuthor, renderDashboardGenericReviewEdit, renderDashboardGenericReviewCreate } from '../worker/controllers.js';
import { searchSite } from '../worker/site-search.js';
import { toRichHtml, cleanSections, renderSectionsHtml, renderSections, parseSection, serializeSection, buildReviewNav, renderSectionNav } from '../worker/generic-review-sections.js';
import { getRoute } from '../worker/routes.js';
import { getAuthorHub } from '../worker/author-hub.js';
import { readRichEditorSource } from './support/rich-editor-source.js';
const route = (p) => getRoute(new Request('https://site.test' + p));

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf-8');
const makeReq = (method, url, body) => ({ method, url, headers: new Headers(), json: async () => body });
const admin = { user_id: 1, role: 'admin', email: 'a@test.com' };

describe('sections helpers', () => {
  test('plain text becomes paragraphs, HTML is sanitized', () => {
    assert.equal(toRichHtml('One\nline\n\nTwo & more'), '<p>One<br>line</p>\n<p>Two &amp; more</p>');
    const out = toRichHtml('<p>ok</p><script>alert(1)</script><img src=x onerror=alert(1)>');
    assert.doesNotMatch(out, /script|onerror/i);
    assert.match(out, /<p>ok<\/p>/);
  });
  test('cleanSections drops empties, requires titles, caps count and length', () => {
    assert.deepEqual(cleanSections([{ title: '', content: '<p>&nbsp;</p>' }, { title: ' A ', content: '<p>x</p>' }]).sections, [{ title: 'A', content: '<p>x</p>' }]);
    assert.match(cleanSections([{ title: '', content: '<p>text</p>' }]).error, /title/);
    assert.match(cleanSections(Array.from({ length: 31 }, (_, i) => ({ title: 't' + i, content: 'x' }))).error, /at most 30/);
    assert.match(cleanSections([{ title: 'x'.repeat(121), content: 'x' }]).error, /120/);
    assert.ok(cleanSections('nope').error);
  });
  test('renderSectionsHtml escapes titles, sanitizes bodies, skips empty bodies', async () => {
    const h = await renderSectionsHtml(null, [{ title: '<i>T</i>', content: '<p>a</p><script>x</script>' }, { title: 'Empty', content: '' }]);
    assert.match(h, /<h2>&lt;i&gt;T&lt;\/i&gt;<\/h2>/);
    assert.doesNotMatch(h, /script|Empty/);
  });
  test('tables are wrapped so they scroll sideways', () => {
    assert.match(toRichHtml('<table><tr><td>a</td></tr></table>'), /<div class="table-scroll"[^>]*><table>.*<\/table><\/div>/s);
  });
  test('typed sections round-trip and are cleaned', () => {
    const faq = cleanSections([{ title: 'FAQ', type: 'faq', data: { items: [{ q: ' Q1 ', a: 'A1' }, { q: '', a: 'x' }], junk: 1 } }]).sections[0];
    assert.match(faq.content, /^lmsec:/);
    assert.deepEqual(parseSection(faq.content), { type: 'faq', data: { items: [{ q: 'Q1', a: 'A1' }], open_first: false }, hidden: false });
    assert.equal(serializeSection('rich', { html: '<p>x</p>' }), '<p>x</p>');           // default style stays plain HTML
    assert.match(serializeSection('rich', { html: '<p>x</p>', size: 'l' }), /^lmsec:/);
    assert.match(cleanSections([{ title: 'x', type: 'nope', data: {} }]).error, /Unknown section type/);
    assert.equal(cleanSections([{ title: '', type: 'faq', data: { items: [] } }]).sections.length, 0);
    // links are sanitized, images need an address, payment ids are numbers
    const m = parseSection(cleanSections([{ title: 'M', type: 'media', data: { images: [{ src: 'javascript:alert(1)' }, { src: '/a.png', link: 'javascript:x()' }] } }]).sections[0].content).data;
    assert.equal(m.images.length, 1); assert.equal(m.images[0].link, '');
    assert.deepEqual(parseSection(cleanSections([{ title: 'P', type: 'payments', data: { ids: [3, '3', 'x', -1, 7] } }]).sections[0].content).data.ids, [3, 7]);
  });
  test('navigation lists summary, overview, sections, pros/cons, verdict in order', () => {
    const nav = buildReviewNav({ hasScoring: true, sections: [{ id: 's1', title: 'Features' }], hasVerdict: true });
    assert.deepEqual(nav.map((n) => n.id), ['summary', 'scoring', 'overview', 's1', 'pros-cons', 'verdict']);
    assert.match(renderSectionNav(nav), /<nav class="sn-nav" data-sn[^>]*>.*href="#s1"/s);
    assert.equal(renderSectionNav([{ id: 'a', title: 'a' }]), '');
  });
});

describe('API + public page', () => {
  let db, env, call, sb;
  beforeEach(async () => {
    db = createTestDb(); applyMigrations(db);
    env = { DB: db, ASSETS: { fetch: async (r) => { const f = join(ROOT, new URL(r.url).pathname); return existsSync(f) ? new Response(readFileSync(f, 'utf-8')) : new Response('nf', { status: 404 }); } } };
    call = (m, p, b) => handleAPI(makeReq(m, `https://x.com${p}`, b), env, p.split('?')[0], admin);
    sb = await contentItems.createContentItem(db, 'sportsbook', { slug: 'sb', name: 'SB', status: 'published', published: true });
  });
  const create = (extra = {}) => call('POST', '/api/v1/generic-review/create', { reviewed_content_type: 'sportsbook', reviewed_content_id: sb.id, slug: 'rv', title: 'Rv', content: '<p>Body</p>', published: true, ...extra });

  test('create saves sections; get returns them in order; update replaces them', async () => {
    const r = await (await create({ sections: [{ title: 'Features', content: '<p>F</p>' }, { title: 'Payments', content: '<p>P</p>' }] })).json();
    assert.ok(r.success);
    let g = await (await call('GET', `/api/v1/generic-review/get?id=${r.review.id}`)).json();
    assert.deepEqual(g.sections.map((s) => s.title), ['Features', 'Payments']);
    await call('POST', '/api/v1/generic-review/update', { id: r.review.id, sections: [{ title: 'Payments', content: '<p>P</p>' }] });
    g = await (await call('GET', `/api/v1/generic-review/get?id=${r.review.id}`)).json();
    assert.deepEqual(g.sections.map((s) => s.title), ['Payments']);
    // update without `sections` leaves them alone
    await call('POST', '/api/v1/generic-review/update', { id: r.review.id, title: 'New' });
    g = await (await call('GET', `/api/v1/generic-review/get?id=${r.review.id}`)).json();
    assert.equal(g.sections.length, 1);
  });

  test('validation: empty body, bad slug, duplicate slug, bad sections', async () => {
    assert.equal((await create({ content: '<p>&nbsp;</p>' })).status, 400);
    assert.equal((await create({ slug: 'Bad Slug' })).status, 400);
    assert.ok((await (await create()).json()).success);
    const dup = await create();
    assert.equal(dup.status, 400);
    assert.match((await dup.json()).error, /already exists/);
    assert.equal((await create({ slug: 'x2', sections: [{ title: '', content: '<p>t</p>' }] })).status, 400);
  });

  test('deleting a review removes its sections (no leftovers for a reused slug)', async () => {
    const r = await (await create({ sections: [{ title: 'A', content: '<p>a</p>' }] })).json();
    await call('POST', '/api/v1/generic-review/delete', { id: r.review.id });
    assert.equal((await db.prepare(`SELECT COUNT(*) n FROM review_blocks WHERE review_slug='rv'`).first()).n, 0);
  });

  test('public page shows sections after the overview; rich body is sanitized; old plain text still reads', async () => {
    await create({ content: '<p>Rich</p><script>bad()</script>', sections: [{ title: 'Features', content: '<p>Fast payouts</p>' }] });
    let html = await (await renderGenericReview(new Request('https://site.test/en/sportsbook/review/rv'), env, 'sportsbook', 'rv', null)).text();
    assert.match(html, /<h2>Features<\/h2>/);
    assert.match(html, /Fast payouts/);
    assert.ok(html.indexOf('id="overview"') < html.indexOf('Fast payouts'));
    assert.doesNotMatch(html, /bad\(\)/);
    await genericReviews.updateGenericReview(db, (await db.prepare(`SELECT id FROM reviews WHERE slug='rv'`).first()).id, { content: 'Line one\n\nLine two' });
    html = await (await renderGenericReview(new Request('https://site.test/en/sportsbook/review/rv'), env, 'sportsbook', 'rv', null)).text();
    assert.match(html, /<p>Line one<\/p>\n<p>Line two<\/p>/);
  });

  test('owner-set review look reaches the page; bad colours do not', async () => {
    await create({});
    const url = 'https://site.test/en/sportsbook/review/rv';
    const page = async () => (await renderGenericReview(new Request(url), env, 'sportsbook', 'rv', null)).text();
    let html = await page();
    assert.doesNotMatch(html, /--rl-accent/);
    const put = (k, v) => db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(k, v).run();
    await put('rl_accent', '#e11d48'); await put('rl_card_bg', 'red;}</style><script>x()</script>'); await put('rl_radius', '8'); await put('rl_shadow', 'strong'); await put('rl_mode', 'single');
    html = await page();
    assert.match(html, /--rl-accent:#e11d48/); assert.match(html, /--rl-radius:8px/); assert.match(html, /--rl-shadow:0 2px 4px/);
    assert.match(html, /--rv-accent:#e11d48/);
    assert.doesNotMatch(html, /x\(\)|--rl-card-bg/);
    await put('rl_mode', 'multi');
    assert.doesNotMatch(await page(), /--rv-accent:#e11d48/);
  });

  test('admin reviews screen has the review look form', async () => {
    const t = read('templates/pages/admin/reviews.html');
    assert.match(t, /id="rlForm"/); assert.match(t, /id="rlPreview"/);
    assert.match(read('templates/layout/base.html'), /review-look-admin\.js/);
  });

  test('generic review parts use the section card look', async () => {
    await create({ verdict: 'Great' });
    const html = await (await renderGenericReview(new Request('https://site.test/en/sportsbook/review/rv'), env, 'sportsbook', 'rv', null)).text();
    assert.match(html, /class="info-block rv-sec rv-sec--overview" id="overview"/);
    assert.match(html, /rv-sec--verdict" id="verdict"/);
  });

  test('generic review summary is a card with rating and facts, not a table', async () => {
    await create({ rating: 4 });
    const html = await (await renderGenericReview(new Request('https://site.test/en/sportsbook/review/rv'), env, 'sportsbook', 'rv', null)).text();
    assert.match(html, /class="review-summary rs-card" id="summary"/);
    assert.match(html, /class="rs-top"/); assert.match(html, /<dt>Item<\/dt><dd>SB<\/dd>/);
    assert.doesNotMatch(html, /review-summary-table/);
  });
});

describe('typed sections on the public page, and one public address', () => {
  let db, env, call, sb;
  beforeEach(async () => {
    db = createTestDb(); applyMigrations(db);
    env = { DB: db, ASSETS: { fetch: async (r) => { const f = join(ROOT, new URL(r.url).pathname); return existsSync(f) ? new Response(readFileSync(f, 'utf-8')) : new Response('nf', { status: 404 }); } } };
    call = (m, p, b) => handleAPI(makeReq(m, `https://x.com${p}`, b), env, p.split('?')[0], admin);
    sb = await contentItems.createContentItem(db, 'sportsbook', { slug: 'sb', name: 'SB', status: 'published', published: true });
    await db.prepare(`INSERT OR IGNORE INTO payment_methods (slug, name, published) VALUES ('visa','Visa',1), ('skrill','Skrill',1)`).run();
    await db.prepare(`INSERT INTO casinos (slug, name, website_url, affiliate_url, published, status) VALUES ('c1','Casino One','https://c','https://c/a',1,'published')`).run();
  });
  const page = async (slug) => (await renderGenericReview(new Request('https://site.test/en/sportsbook/review/' + slug), env, 'sportsbook', slug, null)).text();

  test('FAQ, images + text, payments, picks, cards, callout, stats all render; nav lists each; FAQ gets schema', async () => {
    const pm = (await db.prepare(`SELECT id FROM payment_methods WHERE slug IN ('visa','skrill') ORDER BY slug`).all()).results.map((r) => r.id);
    const sections = [
      { title: 'Questions', type: 'faq', data: { items: [{ q: 'Is it safe?', a: 'Yes <b>very</b>' }] } },
      { title: 'Gallery', type: 'media', data: { images: [{ src: '/a.png', alt: 'A', caption: 'Cap' }, { src: '/b.png' }], text_html: '<p>After text</p>' } },
      { title: 'Pay', type: 'payments', data: { ids: pm, text_html: '<p>Fast</p>' } },
      { title: 'Related', type: 'picks', data: { items: [{ source: 'casino', key: 'c1' }, { url: '/en/about', label: 'About us' }, { source: 'casino', key: 'missing' }] } },
      { title: 'Cards', type: 'cards', data: { cards: [{ title: 'One', text: 'T', url: '/en/x', cta: 'Go' }], columns: 2 } },
      { title: 'Note', type: 'callout', data: { tone: 'warning', title: 'Careful', text: 'Read terms' } },
      { title: 'Numbers', type: 'stats', data: { items: [{ value: '24h', label: 'Payout' }] } },
    ];
    const r = await (await call('POST', '/api/v1/generic-review/create', { reviewed_content_type: 'sportsbook', reviewed_content_id: sb.id, slug: 'rv', title: 'Rv', content: '<p>Body</p>', published: true, verdict: 'Good', sections })).json();
    assert.ok(r.success, JSON.stringify(r));
    const html = await page('rv');
    assert.match(html, /<details class="rv-faq__item"><summary>Is it safe\?<\/summary>/);
    assert.match(html, /FAQPage/);
    assert.match(html, /rv-media--grid3/); assert.match(html, /<figcaption>Cap<\/figcaption>/); assert.match(html, /After text/);
    assert.match(html, /href="\/en\/payment-methods\/visa"/); assert.match(html, /href="\/en\/payment-methods\/skrill"/);
    assert.match(html, /href="\/en\/casino\/c1"/); assert.match(html, /About us/); assert.doesNotMatch(html, /missing/);
    assert.match(html, /rv-cards--outlined rv-cols-2/); assert.match(html, /rv-callout--warning/); assert.match(html, /<dd>24h<\/dd>/);
    const nav = html.match(/<nav class="sn-nav"[\s\S]*?<\/nav>/)[0];
    for (const t of ['Summary', 'Overview', 'Questions', 'Gallery', 'Pay', 'Related', 'Cards', 'Note', 'Numbers', 'Pros &amp; Cons', 'Verdict']) assert.ok(nav.includes('>' + t + '<'), t);
    assert.match(html, /id="summary"/);
    // get returns the typed data for the editor
    const g = await (await call('GET', `/api/v1/generic-review/get?id=${r.review.id}`)).json();
    assert.deepEqual(g.sections.map((x) => x.type), ['faq', 'media', 'payments', 'picks', 'cards', 'callout', 'stats']);
    assert.equal(g.sections[0].data.items[0].q, 'Is it safe?');
  });

  test('a review about a sportsbook is not reachable, listed or searchable under /en/review', async () => {
    await call('POST', '/api/v1/generic-review/create', { reviewed_content_type: 'sportsbook', reviewed_content_id: sb.id, slug: 'sb-rev', title: 'SB Review', content: '<p>x</p>', published: true });
    await db.prepare(`INSERT INTO reviews (casino_slug, slug, title, content, published) VALUES ('c1','c-rev','Casino Rev','x',1)`).run();
    const old = await renderReview(new Request('https://site.test/en/review/sb-rev'), env, 'sb-rev');
    assert.equal(old.status, 301); assert.equal(old.headers.get('Location'), '/en/sportsbook/review/sb-rev');
    assert.equal((await renderReview(new Request('https://site.test/en/review/c-rev'), env, 'c-rev')).status, 200);
    const list = await (await renderReviewList(new Request('https://site.test/en/review'), env)).text();
    assert.doesNotMatch(list, /sb-rev|SB Review/); assert.match(list, /c-rev|Casino Rev/);
    const found = await searchSite(db, 'rev');
    const urls = found.groups.flatMap((g) => g.items.map((i) => i.url));
    assert.ok(urls.includes('/en/sportsbook/review/sb-rev')); assert.ok(!urls.includes('/en/review/sb-rev')); assert.ok(urls.includes('/en/review/c-rev'));
    const pub = await (await call('GET', '/api/v1/public/reviews/list')).json();
    assert.deepEqual(pub.reviews.map((r) => r.slug), ['c-rev']);
    // an unpublished one does not redirect (so it cannot be probed)
    await db.prepare(`UPDATE reviews SET published = 0 WHERE slug = 'sb-rev'`).run();
    assert.equal((await renderReview(new Request('https://site.test/en/review/sb-rev'), env, 'sb-rev')).status, 404);
  });

  test('a casino review takes typed sections, shows them with a sticky bar, and the sync is checked', async () => {
    await db.prepare(`INSERT INTO reviews (casino_slug, slug, title, content, published, verdict) VALUES ('c1','c1-review','Casino One Review','<p>Body text</p>',1,'Solid')`).run();
    const bad = await (await call('POST', '/api/v1/review-blocks/sync', { review_slug: 'c1-review', sections: [{ title: 'X', type: 'nope', data: {} }] })).json();
    assert.ok(bad.error);
    const ok = await (await call('POST', '/api/v1/review-blocks/sync', { review_slug: 'c1-review', sections: [
      { title: 'Questions', type: 'faq', data: { items: [{ q: 'Legit?', a: 'Yes' }] } },
      { title: 'Wide', type: 'rich', data: { html: '<table><tr><td>a</td></tr></table>' } },
    ] })).json();
    assert.ok(ok.success, JSON.stringify(ok));
    const html = await (await renderReview(new Request('https://site.test/en/review/c1-review'), env, 'c1-review', null)).text();
    assert.match(html, /rv-faq__item/); assert.match(html, /FAQPage/); assert.match(html, /class="table-scroll"/);
    const nav = html.match(/<nav class="sn-nav"[\s\S]*?<\/nav>/)[0];
    for (const t of ['Summary', 'More details', 'Questions', 'Wide', 'Verdict']) assert.ok(nav.includes('>' + t + '<'), t);
    assert.doesNotMatch(nav, /Games|Bonuses|Licensing|Pros/);
    assert.doesNotMatch(html, /No pros listed|rs-long__label[^>]*><span[^>]*>[^<]*<\/span>(Bonuses|License)/);
    await db.prepare(`UPDATE reviews SET pros='["Fast"]', bonuses='<p>100% match</p>' WHERE slug='c1-review'`).run();
    const html2 = await (await renderReview(new Request('https://site.test/en/review/c1-review'), env, 'c1-review', null)).text();
    assert.match(html2.match(/<nav class="sn-nav"[\s\S]*?<\/nav>/)[0], /Pros &amp; Cons/); assert.match(html2, /<\/span>Bonuses<\/div>/); assert.match(html2, /<li>Fast<\/li>/);
    const list = await (await call('GET', '/api/v1/review-blocks/list?review_slug=c1-review')).json();
    assert.deepEqual(list.sections.map((x) => x.type), ['faq', 'rich']);
    assert.match(read('templates/pages/admin/reviews.html'), /id="rsSections"/);
    assert.match(read('templates/layout/base.html'), /review-sections-admin\.js/);
  });
  test('author page lists everything the author published, with counts', async () => {
    const a = await db.prepare(`INSERT INTO authors (slug, name, role, published) VALUES ('ann','Ann','Editor',1) RETURNING id`).first();
    await db.prepare(`INSERT INTO reviews (casino_slug, slug, title, content, published, author_id) VALUES ('c1','c-rev','Casino Rev','x',1,?)`).bind(a.id).run();
    await call('POST', '/api/v1/generic-review/create', { reviewed_content_type: 'sportsbook', reviewed_content_id: sb.id, slug: 'sb-rev', title: 'SB Review', content: '<p>x</p>', published: true, author_id: a.id });
    await db.prepare(`INSERT INTO platform_updates (slug, title, content, published, author_id) VALUES ('u1','An Update','x',1,?)`).bind(a.id).run();
    await db.prepare(`INSERT INTO pages (slug, type, template, title, published, author_id) VALUES ('p1','static','default','A Page',1,?)`).bind(a.id).run();
    await db.prepare(`UPDATE content_items SET author_id = ? WHERE id = ?`).bind(a.id, sb.id).run();
    const html = await (await renderAuthor(new Request('https://site.test/en/author/ann'), env, 'ann')).text();
    assert.match(html, /<span class="ah-stat__n">1<\/span><span class="ah-stat__l">Casino reviews<\/span>/);
    assert.match(html, /<span class="ah-stat__l">Other reviews<\/span>/);
    assert.match(html, /href="\/en\/sportsbook\/review\/sb-rev"/); assert.match(html, /href="\/en\/review\/c-rev"/);
    assert.doesNotMatch(html, /href="\/en\/review\/sb-rev"/);
    assert.match(html, /href="\/en\/updates\/u1"/); assert.match(html, /href="\/en\/p1"/); assert.match(html, /href="\/en\/sportsbook\/sb"/);
    assert.match(html, /<nav class="sn-nav"/);
  });
});

describe('one dashboard route', () => {
  test('old add and edit addresses redirect to the single screen', async () => {
    const e = await renderDashboardGenericReviewEdit(new Request('https://site.test/en/dashboard/generic-review/edit/5'), {}, 5);
    assert.equal(e.status, 302); assert.equal(e.headers.get('Location'), '/en/dashboard/reviews/generic?edit=5');
    const c = await renderDashboardGenericReviewCreate(new Request('https://site.test/en/dashboard/review/generic/create?type=custom'), {});
    assert.equal(c.status, 302); assert.equal(c.headers.get('Location'), '/en/dashboard/reviews/generic?type=custom&new=1');
  });
  test('routes still resolve; the screen holds list, editor, rich body and sections', () => {
    assert.equal(route('/en/dashboard/reviews/generic').type, 'dashboardGenericReviews');
    assert.equal(route('/en/dashboard/generic-review/edit/5').id, 5);
    const t = read('templates/pages/admin/generic-reviews.html');
    for (const id of ['grListView', 'grEditView', 'grForm', 'grContent', 'grSections', 'grPresets']) assert.match(t, new RegExp(`id="${id}"`));
    const js = read('static/js/generic-review-admin.js');
    assert.match(js, /RichEditor\.init/); assert.match(js, /SectionBuilder\.mount/); assert.match(js, /EntityPicker\.attach/);
    assert.match(read('static/js/section-builder.js'), /data-rich-editor/);
    assert.match(read('templates/pages/admin/reviews.html'), /name="casino_slug"[^>]*data-entity="casino"/);
    assert.match(readRichEditorSource(), /lummetpick/);
    assert.match(read('templates/layout/base.html'), /generic-review-admin\.js/);
  });
});

describe('landing pages: form, sections, author, public page', () => {
  let db, env, call, sb;
  beforeEach(async () => {
    db = createTestDb(); applyMigrations(db);
    env = { DB: db, ASSETS: { fetch: async (r) => { const f = join(ROOT, new URL(r.url).pathname); return existsSync(f) ? new Response(readFileSync(f, 'utf-8')) : new Response('nf', { status: 404 }); } } };
    call = (m, p, b) => handleAPI(makeReq(m, `https://x.com${p}`, b), env, p.split('?')[0], admin);
    sb = await contentItems.createContentItem(db, 'sportsbook', { slug: 'sb', name: 'SB', status: 'published', published: true });
  });
  test('create with sections and author, edit them, show them on the public page', async () => {
    const a = await db.prepare(`INSERT INTO authors (slug, name) VALUES ('amy','Amy Writer') RETURNING id`).first();
    const bad = await (await call('POST', '/api/v1/content-landing-page/create', { content_type: 'sportsbook', slug: 'Bad Slug', title: 'T' })).json();
    assert.ok(bad.error);
    const r = await (await call('POST', '/api/v1/content-landing-page/create', { content_type: 'sportsbook', slug: 'top-books', title: 'Top books', description: 'Intro', status: 'published', item_ids: [sb.id], author_id: a.id,
      sections: [{ title: 'Questions', type: 'faq', data: { items: [{ q: 'Why?', a: 'Because' }] } }, { title: 'Notes', type: 'callout', data: { tone: 'info', title: 'Hi', text: 'There' } }] })).json();
    assert.ok(r.success, JSON.stringify(r));
    const dup = await (await call('POST', '/api/v1/content-landing-page/create', { content_type: 'sportsbook', slug: 'top-books', title: 'T' })).json();
    assert.ok(dup.error);
    const g = await (await call('GET', '/api/v1/content-landing-page/get?slug=top-books')).json();
    assert.deepEqual(g.sections.map((s) => s.type), ['faq', 'callout']); assert.equal(g.page.author_id, a.id);
    const html = await (await renderContentLandingPage(new Request('https://site.test/en/best/top-books'), env, 'top-books')).text();
    assert.match(html, /By <a href="\/en\/author\/amy">Amy Writer<\/a>/); assert.match(html, /rv-faq__item/); assert.match(html, /FAQPage/);
    const nav = html.match(/<nav class="sn-nav"[\s\S]*?<\/nav>/)[0];
    for (const t of ['Questions', 'Notes']) assert.ok(nav.includes('>' + t + '<'), t);
    const u = await (await call('POST', '/api/v1/content-landing-page/update', { slug: 'top-books', author_id: null, sections: [] })).json();
    assert.ok(u.success);
    const g2 = await (await call('GET', '/api/v1/content-landing-page/get?slug=top-books')).json();
    assert.equal(g2.sections.length, 0); assert.equal(g2.page.author_id, null);
    await call('POST', '/api/v1/content-landing-page/update', { slug: 'top-books', sections: [{ title: 'X', type: 'faq', data: { items: [{ q: 'q', a: 'a' }] } }] });
    await call('POST', '/api/v1/content-landing-page/delete', { slug: 'top-books' });
    assert.equal((await db.prepare(`SELECT COUNT(*) n FROM review_blocks WHERE review_slug = 'landing:top-books'`).first()).n, 0);
  });
  test('form templates carry the five steps and the script is loaded', () => {
    for (const f of ['create', 'edit']) {
      const t = read(`templates/pages/admin/content-landing-page-${f}.html`);
      for (const id of ['lpForm', 'lpSections', 'lpPresets', 'lpAuthor', 'lpSerpTitle', 'itemSearchInput', 'selectedItemRows']) assert.match(t, new RegExp(`id="${id}"`));
    }
    assert.match(read('templates/layout/base.html'), /landing-page-admin\.js/);
    assert.match(read('static/js/landing-page-admin.js'), /SectionBuilder\.mount/);
  });
  test('author page shows pictures for research, updates and country pages', async () => {
    const a = await db.prepare(`INSERT INTO authors (slug, name) VALUES ('bo','Bo') RETURNING id`).first();
    const m = await db.prepare(`INSERT INTO media_library (filename, url) VALUES ('r.png','/media/r.png') RETURNING id`).first().catch(() => null);
    if (!m) return;
    await db.prepare(`INSERT INTO research_items (type, slug, title, excerpt, author_id, published, status, og_image) VALUES ('report','g1','Guide One','x',?,1,'published',?)`).bind(a.id, m.id).run();
    const hub = await getAuthorHub(db, a.id);
    const research = hub.find((g) => g.key === 'research');
    assert.equal(research.items[0].image, '/media/r.png');
  });
});

describe('v18.8: hidden sections, hidden page parts, author look, tabs', () => {
  let db, env, call;
  beforeEach(async () => {
    db = createTestDb(); applyMigrations(db);
    env = { DB: db, ASSETS: { fetch: async (r) => { const f = join(ROOT, new URL(r.url).pathname); return existsSync(f) ? new Response(readFileSync(f, 'utf-8')) : new Response('nf', { status: 404 }); } } };
    call = (m, p, b) => handleAPI(makeReq(m, `https://x.com${p}`, b), env, p.split('?')[0], admin);
    await db.prepare(`INSERT INTO casinos (slug, name, website_url, affiliate_url, published, status) VALUES ('c1','Casino One','https://c','https://c/a',1,'published')`).run();
    await db.prepare(`INSERT INTO reviews (casino_slug, slug, title, content, published, verdict, overview, bonuses, pros) VALUES ('c1','c1-review','Casino One Review','<p>Body text</p>',1,'Solid','<p>Over</p>','<p>Bonus text</p>','["Fast"]')`).run();
  });
  const page = async () => (await renderReview(new Request('https://site.test/en/review/c1-review'), env, 'c1-review', null)).text();
  test('a section switched off disappears with its tab, and comes back', () => {
    const c = cleanSections([{ title: 'Off', type: 'faq', data: { items: [{ q: 'q', a: 'a' }] }, hidden: true }]).sections[0];
    assert.equal(parseSection(c.content).hidden, true);
    assert.equal(cleanSections([{ title: 'Off', content: c.content, hidden: false }]).sections[0].content.includes('"hidden"'), false);
  });
  test('hidden sections and hidden page parts are left out of the page and the top bar', async () => {
    await call('POST', '/api/v1/review-blocks/sync', { review_slug: 'c1-review', sections: [
      { title: 'Shown one', type: 'faq', data: { items: [{ q: 'Legit?', a: 'Yes' }] } },
      { title: 'Secret one', type: 'rich', data: { html: '<p>Hidden words</p>' }, hidden: true },
    ] });
    let html = await page();
    assert.match(html, /Shown one/); assert.doesNotMatch(html, /Secret one|Hidden words/);
    assert.match(html.match(/<nav class="sn-nav"[\s\S]*?<\/nav>/)[0], />Bonuses</);
    const r = await (await call('POST', '/api/v1/review-blocks/sync', { review_slug: 'c1-review', hidden_parts: ['bonuses', 'verdict', 'pros-cons', 'nonsense'] })).json();
    assert.ok(r.success);
    html = await page();
    const nav = html.match(/<nav class="sn-nav"[\s\S]*?<\/nav>/)[0];
    assert.doesNotMatch(nav, />Bonuses<|>Verdict<|Pros/); assert.doesNotMatch(html, /Bonus text/); assert.match(html, /Shown one/);
    const list = await (await call('GET', '/api/v1/review-blocks/list?review_slug=c1-review')).json();
    assert.deepEqual(list.hidden_parts.sort(), ['bonuses', 'pros-cons', 'verdict']); assert.ok(list.parts.length >= 10);
    assert.equal(list.sections[1].hidden, true);
    await call('POST', '/api/v1/review-blocks/sync', { review_slug: 'c1-review', hidden_parts: [] });
    assert.match(await page(), /Bonus text/);
  });
  test('author look: only strict colours reach the page', async () => {
    const { buildAuthorStyle } = await import('../worker/author-style.js');
    const css = buildAuthorStyle({ ah_card_bg: '#112233', ah_accent: 'red;}</style><script>', ah_radius: '99', ah_shadow: 'soft', ah_stat_bg: 'rgba(1,2,3,.5)' });
    assert.match(css, /--ah-card-bg:#112233/); assert.match(css, /--ah-stat-bg:rgba\(1,2,3,.5\)/); assert.match(css, /--ah-shadow:/);
    assert.doesNotMatch(css, /script|red|--ah-radius/);
    assert.equal(buildAuthorStyle({}), '');
    const t = read('templates/pages/admin/authors.html'); assert.match(t, /id="ahForm"/);
    assert.match(read('templates/layout/base.html'), /author-appearance-admin\.js/);
    assert.match(read('templates/pages/author.html'), /author_style_html/);
  });
  test('reviews screen has three tabs; count tiles and nav share one jump', () => {
    const t = read('templates/pages/admin/reviews.html');
    for (const n of ['list', 'edit', 'sections']) assert.match(t, new RegExp(`data-rv-tab="${n}"`));
    for (const n of ['list', 'sections']) assert.match(t, new RegExp(`data-rv-panel="${n}"`));
    assert.match(read('static/js/review-field-toggles.js'), /Show on page/); assert.match(read('templates/layout/base.html'), /review-field-toggles\.js/);
    assert.match(t, /id="rsParts"/); assert.match(read('templates/layout/base.html'), /review-tabs\.js/);
    assert.match(read('static/js/section-nav.js'), /a\.ah-stat/); assert.match(read('static/js/section-builder.js'), /sb-show/);
  });
  test('author news cards use the full picture first and fall back to the thumbnail', async () => {
    const a = await db.prepare(`INSERT INTO authors (slug, name) VALUES ('nia','Nia') RETURNING id`).first();
    const m = await db.prepare(`INSERT INTO media_library (filename, url, thumbnail_url) VALUES ('n.png','/media/n.png','/media/n-thumb.png') RETURNING id`).first();
    await db.prepare(`INSERT INTO news (slug, title, content, published, author_id, featured_image) VALUES ('story','Story','<p>x</p>',1,?,?)`).bind(a.id, m.id).run();
    const html = await (await renderAuthor(new Request('https://site.test/en/author/nia'), env, 'nia')).text();
    assert.match(html, /<img src="\/media\/n\.png" data-alt="\/media\/n-thumb\.png"/);
  });
  test('landing page shows its picked and automatic items even when they have no country rules', async () => {
    const sb = await contentItems.createContentItem(db, 'sportsbook', { slug: 'bet-one', name: 'Bet One', status: 'published', published: true });
    await call('POST', '/api/v1/content-landing-page/create', { content_type: 'sportsbook', slug: 'manual-page', title: 'Manual page', status: 'published', item_mode: 'manual', item_ids: [sb.id] });
    await call('POST', '/api/v1/content-landing-page/create', { content_type: 'sportsbook', slug: 'auto-page', title: 'Auto page', status: 'published', item_mode: 'auto', auto_limit: 5 });
    for (const slug of ['manual-page', 'auto-page']) {
      const html = await (await renderContentLandingPage(new Request('https://site.test/en/best/' + slug), env, slug)).text();
      assert.match(html, /Bet One/, slug); assert.match(html, /href="\/en\/sportsbook\/bet-one"/, slug); assert.doesNotMatch(html, /Not Available/, slug);
    }
  });
});
