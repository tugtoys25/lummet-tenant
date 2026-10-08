// test/newsroom-public.test.js -- Stage D: public rendering, end to end.
//
// Runs the REAL renderNews() controller, the REAL templates (served from disk
// through a fake ASSETS binding) and the REAL migrated schema in SQLite.
// Not covered: Cloudflare edge caching, real D1 latency, browsers/CSS.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { renderNews } from '../worker/controllers.js';
import * as nr from '../worker/database/newsroom.js';
import * as R from '../worker/newsroom-render.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ALL_FLAGS = ['news_new_taxonomy', 'news_sources_display', 'news_corrections_display'];

async function mkEnv() {
  const db = createTestDb(); applyMigrations(db);
  await db.prepare(`INSERT INTO users (id,email,password_hash,role) VALUES (1,'a@t.l','x','admin')`).run();
  await db.prepare(`INSERT INTO authors (id,slug,name,role) VALUES (1,'elie','Elie','Editor')`).run();
  const ins = `INSERT INTO news (id,slug,title,content,published,published_at,author_id,created_by,excerpt) VALUES (?,?,?,?,?,?,1,1,'ex')`;
  await db.prepare(ins).bind(10, 'live-one', 'Live One', '<p>Body text of the article.</p>', 1, null).run();
  await db.prepare(ins).bind(11, 'rel-pub', 'Related Published', '<p>r</p>', 1, null).run();
  await db.prepare(ins).bind(12, 'rel-draft', 'SECRET DRAFT TITLE', '<p>d</p>', 0, null).run();
  await db.prepare(ins).bind(13, 'rel-sched', 'SECRET SCHEDULED TITLE', '<p>s</p>', 1, '2099-01-01 00:00:00').run();
  const env = { DB: db, ASSETS: { fetch: async (req) => { const f = join(ROOT, new URL(req.url).pathname); return existsSync(f) ? new Response(readFileSync(f, 'utf-8'), { status: 200 }) : new Response('nf', { status: 404 }); } } };
  return env;
}
const flagsOn = (env, keys = ALL_FLAGS) => Promise.all(keys.map((k) => env.DB.prepare(`UPDATE system_settings SET value='true' WHERE key=?`).bind(k).run()));
const get = async (env, path) => {
  const u = new URL('https://site.test' + path);
  const slug = decodeURIComponent(u.pathname.replace('/en/news/', ''));
  const res = await renderNews(new Request(u), env, slug, null);
  return { status: res.status, html: await res.text() };
};
const ldJson = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const bodyOf = (html) => { const a = html.indexOf('<article class="news-detail"'); return html.slice(a, html.indexOf('</article>', a)); }; // the layout footer carries its own generic disclosure text
const q = (env, sql, ...p) => env.DB.prepare(sql).bind(...p).run();
const sectionId = async (env, slug = 'regulation') => (await env.DB.prepare(`SELECT id FROM news_sections WHERE slug=?`).bind(slug).first()).id;

describe('flags OFF: existing article pages carry no newsroom markup', () => {
  test('newsroom data in the DB is ignored until a flag is on', async () => {
    const env = await mkEnv();
    const sid = await sectionId(env);
    await q(env, `UPDATE news SET section_id=?, article_type='opinion', content_class='sponsored', labels='["breaking"]', methodology='How we did it' WHERE id=10`, sid);
    await q(env, `INSERT INTO news_article_sources (news_id, source_name) VALUES (10,'Src')`);
    await q(env, `INSERT INTO news_corrections (news_id, type, public_message) VALUES (10,'correction','Fixed')`);
    const { status, html } = await get(env, '/en/news/live-one');
    assert.equal(status, 200);
    assert.ok(!html.includes('newsroom.css') && !/\bnr-/.test(html), 'no newsroom classes or stylesheet');
    for (const s of ['Sponsored', 'Sources', 'Correction', 'Methodology', 'Breaking']) assert.ok(!html.includes(s), `must not show ${s}`);
    assert.match(html, /<h1>Live One<\/h1>/);
    assert.equal(ldJson(html).find((j) => j['@type'] === 'NewsArticle').articleSection, 'News');
  });

  test('a section slug is a 404 while news_new_taxonomy is off', async () => {
    const env = await mkEnv();
    assert.equal((await get(env, '/en/news/regulation')).status, 404);
  });
});

describe('flags ON: article page', () => {
  let env; beforeEach(async () => { env = await mkEnv(); await flagsOn(env); });

  test('kicker: section link, sponsored badge first, labels, type badge', async () => {
    const sid = await sectionId(env);
    await q(env, `UPDATE news SET section_id=?, article_type='analysis', content_class='sponsored', labels='["exclusive","breaking"]' WHERE id=10`, sid);
    const { html } = await get(env, '/en/news/live-one');
    assert.match(html, /href="\/en\/news\/regulation">Regulation<\/a>/);
    const badges = [...html.matchAll(/<li class="nr-badge[^"]*">([^<]+)<\/li>/g)].map((m) => m[1]);
    assert.deepEqual(badges, ['Sponsored', 'Exclusive', 'Breaking', 'Analysis']);
    assert.match(html, /<link rel="stylesheet" href="\/static\/css\/newsroom\.css">/);
  });

  test('sponsored + commercial content are visibly disclosed', async () => {
    await q(env, `UPDATE news SET content_class='sponsored' WHERE id=10`);
    assert.match((await get(env, '/en/news/live-one')).html, /Sponsored content\.<\/strong> This article was produced in connection with a commercial arrangement/);
    await q(env, `UPDATE news SET content_class='commercial' WHERE id=10`);
    assert.match((await get(env, '/en/news/live-one')).html, /Commercial content\.<\/strong>/);
  });

  test('press release: provider, date, safe original link; unsafe link is not rendered as a link', async () => {
    await q(env, `UPDATE news SET article_type='press_release', pr_provided_by='Acme Gaming Ltd', pr_original_date='2026-09-01', pr_original_source_url='https://acme.example/pr' WHERE id=10`);
    let { html } = await get(env, '/en/news/live-one');
    assert.match(html, /provided by Acme Gaming Ltd and has not been independently reported/);
    assert.match(html, /Originally published 2026-09-01/);
    assert.match(html, /<a href="https:\/\/acme\.example\/pr" rel="noopener noreferrer">Original source<\/a>/);
    await q(env, `UPDATE news SET pr_original_source_url='javascript:alert(1)' WHERE id=10`);
    ({ html } = await get(env, '/en/news/live-one'));
    assert.ok(!html.includes('javascript:') && !html.includes('Original source'));
  });

  test('opinion and analysis are distinguished from straight news', async () => {
    await q(env, `UPDATE news SET article_type='opinion' WHERE id=10`);
    assert.match((await get(env, '/en/news/live-one')).html, /Opinion\.<\/strong> This article reflects the views of its author and is not a news report/);
    await q(env, `UPDATE news SET article_type='analysis' WHERE id=10`);
    assert.match((await get(env, '/en/news/live-one')).html, /Analysis\.<\/strong> This article interprets developments/);
  });

  test('corrections appear ABOVE the body with type and date; retractions are styled distinctly', async () => {
    await q(env, `INSERT INTO news_corrections (news_id, type, public_message, created_at) VALUES (10,'correction','An earlier version contained an incorrect figure.','2026-09-19 10:00:00')`);
    await q(env, `INSERT INTO news_corrections (news_id, type, public_message, created_at) VALUES (10,'retraction','This article is withdrawn.','2026-09-20 09:00:00')`);
    const { html } = await get(env, '/en/news/live-one');
    assert.match(html, /<strong>Correction<\/strong> — <time datetime="2026-09-19T10:00:00\.000Z">September 19, 2026<\/time>/);
    assert.match(html, /nr-correction--retraction/);
    const vis = bodyOf(html);
    assert.ok(vis.indexOf('An earlier version contained') > -1 && vis.indexOf('An earlier version contained') < vis.indexOf('Body text of the article.'), 'corrections come before the body');
  });

  test('sources render as an ordered list; a hostile URL stored directly in the DB is text, not a link', async () => {
    await q(env, `INSERT INTO news_article_sources (news_id, source_name, source_url, source_type, source_date, author, description, display_order) VALUES (10,'UKGC statement','https://www.gamblingcommission.gov.uk/x','regulator','2026-09-01','Press office','Official notice',0)`);
    await q(env, `INSERT INTO news_article_sources (news_id, source_name, source_url, display_order) VALUES (10,'Evil','javascript:alert(1)',1)`);
    const { html } = await get(env, '/en/news/live-one');
    assert.match(html, /<h2 id="nr-sources-h">Sources<\/h2><ol>/);
    assert.match(html, /<a href="https:\/\/www\.gamblingcommission\.gov\.uk\/x" rel="noopener noreferrer">UKGC statement<\/a> <span class="nr-source__meta">\(Regulator · 2026-09-01 · by Press office\)<\/span>/);
    assert.match(html, /<li>Evil<\/li>/);
    assert.ok(!html.includes('javascript:'));
  });

  test('methodology shows only when present, split into paragraphs, escaped', async () => {
    assert.ok(!(await get(env, '/en/news/live-one')).html.includes('Reporting &amp; Methodology'));
    await q(env, `UPDATE news SET methodology=? WHERE id=10`, 'We reviewed filings.\n\nSecond <b>para</b>.');
    const { html } = await get(env, '/en/news/live-one');
    assert.match(html, /<h2 id="nr-method-h">Reporting &amp; Methodology<\/h2><p>We reviewed filings\.<\/p><p>Second &lt;b&gt;para&lt;\/b&gt;\.<\/p>/);
  });

  test('disclosures are contextual: only those the article enables (sponsored is automatic)', async () => {
    assert.ok(!(await get(env, '/en/news/live-one')).html.includes('nr-disclosures'));
    await q(env, `UPDATE news SET disclosure_json='{"ai_assistance":true,"affiliate":false}' WHERE id=10`);
    let { html } = await get(env, '/en/news/live-one');
    assert.match(bodyOf(html), /Artificial intelligence tools were used in preparing this article\./);
    assert.ok(!bodyOf(html).includes('may earn a commission'));
    await q(env, `UPDATE news SET content_class='sponsored' WHERE id=10`);
    ({ html } = await get(env, '/en/news/live-one'));
    assert.match(html, /This content is sponsored and labelled as such\./);
  });

  test('live articles show a chronological update timeline with the editor name', async () => {
    await q(env, `UPDATE news SET article_type='live' WHERE id=10`);
    await q(env, `INSERT INTO news_timeline_updates (news_id, update_time, body, editor_id) VALUES (10,'2026-09-19 09:00:00','First update',1)`);
    await q(env, `INSERT INTO news_timeline_updates (news_id, update_time, body, editor_id) VALUES (10,'2026-09-19 11:00:00','Second update',1)`);
    const { html } = await get(env, '/en/news/live-one');
    assert.match(html, /<h2 id="nr-timeline-h">Live updates<\/h2>/);
    assert.ok(html.indexOf('Second update') < html.indexOf('First update'), 'newest first');
    assert.match(html, /nr-timeline__by">Elie</);
  });

  test('editorial related stories: published only, grouped by relation type, never leaking drafts or scheduled titles', async () => {
    for (const [id, type] of [[11, 'background'], [12, 'follow_up'], [13, 'previous_coverage']])
      await q(env, `INSERT INTO news_related (news_id, related_news_id, relation_type) VALUES (10,?,?)`, id, type);
    const { html } = await get(env, '/en/news/live-one');
    assert.match(html, /<h3>Background<\/h3><ul><li><a href="\/en\/news\/rel-pub">Related Published<\/a>/);
    assert.ok(!html.includes('SECRET DRAFT TITLE') && !html.includes('SECRET SCHEDULED TITLE') && !html.includes('rel-draft') && !html.includes('rel-sched'));
    assert.ok(!html.includes('Follow-up') && !html.includes('Previous coverage'), 'empty groups are not rendered');
  });

  test('JSON-LD: valid, section-aware articleSection, citation, correction; breadcrumb includes the section', async () => {
    const sid = await sectionId(env);
    await q(env, `UPDATE news SET section_id=? WHERE id=10`, sid);
    await q(env, `INSERT INTO news_article_sources (news_id, source_name, source_url) VALUES (10,'UKGC','https://www.gamblingcommission.gov.uk/x')`);
    await q(env, `INSERT INTO news_article_sources (news_id, source_name, source_url) VALUES (10,'No link',NULL)`);
    await q(env, `INSERT INTO news_corrections (news_id, type, public_message, created_at) VALUES (10,'correction','Fixed.','2026-09-19 10:00:00')`);
    const { html } = await get(env, '/en/news/live-one');
    const blocks = ldJson(html);                                     // throws if any block is not valid JSON
    const art = blocks.find((j) => j['@type'] === 'NewsArticle');
    assert.equal(art.articleSection, 'Regulation');
    assert.deepEqual(art.citation, [{ '@type': 'CreativeWork', name: 'UKGC', url: 'https://www.gamblingcommission.gov.uk/x' }]);
    assert.equal(art.correction[0]['@type'], 'CorrectionComment');
    assert.equal(art.correction[0].text, 'Fixed.');
    assert.equal(blocks.filter((j) => j['@type'] === 'NewsArticle').length, 1, 'no duplicate NewsArticle');
    const crumbs = blocks.find((j) => j['@type'] === 'BreadcrumbList').itemListElement.map((i) => i.name);
    assert.deepEqual(crumbs, ['Home', 'News', 'Regulation', 'Live One']);
  });

  test('canonical is unchanged and unique', async () => {
    const { html } = await get(env, '/en/news/live-one?utm_source=x');
    assert.equal((html.match(/<link rel="canonical"/g) || []).length, 1);
    assert.match(html, /<link rel="canonical" href="https:\/\/site\.test\/en\/news\/live-one">/);
  });

  test('flags are independent: sources flag alone shows sources but no kicker/corrections', async () => {
    const env2 = await mkEnv(); await flagsOn(env2, ['news_sources_display']);
    await q(env2, `UPDATE news SET article_type='opinion' WHERE id=10`);
    await q(env2, `INSERT INTO news_article_sources (news_id, source_name) VALUES (10,'Only sources')`);
    await q(env2, `INSERT INTO news_corrections (news_id, type, public_message) VALUES (10,'correction','Hidden')`);
    const { html } = await get(env2, '/en/news/live-one');
    assert.match(html, /Only sources/);
    assert.ok(!html.includes('Hidden') && !html.includes('nr-badge') && !html.includes('This article reflects the views'));
  });

  test('a legacy article with no newsroom data renders no newsroom blocks and no stylesheet', async () => {
    const { html } = await get(env, '/en/news/live-one');
    assert.ok(!html.includes('newsroom.css') && !/class="nr-/.test(html));
  });
});

describe('security: editor-supplied strings cannot inject markup or template syntax', () => {
  let env; beforeEach(async () => { env = await mkEnv(); await flagsOn(env); });

  test('a hostile title is escaped in the headline (existing template did not escape it)', async () => {
    await q(env, `UPDATE news SET title=? WHERE id=10`, '<img src=x onerror=alert(1)>Title');
    const { html } = await get(env, '/en/news/live-one');
    assert.match(html, /<h1>&lt;img src=x onerror=alert\(1\)&gt;Title<\/h1>/);
    assert.ok(!html.includes('<img src=x onerror'));
  });

  test('image alt/caption attribute injection is neutralised', async () => {
    await q(env, `INSERT INTO media_library (id, filename, url, alt_text) VALUES (9,'a.jpg','/m/a.jpg', ?)`, '" onerror="alert(1)');
    await q(env, `UPDATE news SET featured_image=9 WHERE id=10`);
    const { html } = await get(env, '/en/news/live-one');
    assert.ok(!/alt="[^"]*" onerror=/.test(html));
    assert.match(html, /alt="&quot; onerror=&quot;alert\(1\)"/);
  });

  test('template syntax typed into newsroom fields is not expanded by the template engine', async () => {
    await q(env, `INSERT INTO news_article_sources (news_id, source_name, description) VALUES (10,'S','{{title}} {{{content}}} {{#if title}}X{{/if}}')`);
    await q(env, `INSERT INTO news_corrections (news_id, type, public_message) VALUES (10,'update','{{site_name}}')`);
    await q(env, `UPDATE news SET methodology='{{title}}' WHERE id=10`);
    const { html } = await get(env, '/en/news/live-one');
    assert.ok(html.includes('&#123;&#123;title&#125;&#125;'));
    assert.ok(html.includes('&#123;&#123;site_name&#125;&#125;'));
    assert.ok(!html.includes('{{title}}'));
    assert.equal((bodyOf(html).match(/Body text of the article\./g) || []).length, 1, '{{{content}}} was not re-expanded inside a source description');
  });
});

describe('graceful degradation', () => {
  test('if a newsroom table is broken the article still renders (200) with the other blocks intact', async () => {
    const env = await mkEnv(); await flagsOn(env);
    await q(env, `UPDATE news SET article_type='analysis' WHERE id=10`);
    await q(env, `INSERT INTO news_corrections (news_id, type, public_message) VALUES (10,'correction','Still visible')`);
    env.DB._raw.exec('ALTER TABLE news_article_sources RENAME TO news_article_sources_gone');
    const origErr = console.error; console.error = () => {};
    try {
      const { status, html } = await get(env, '/en/news/live-one');
      assert.equal(status, 200);
      assert.match(html, /Still visible/);
      assert.ok(!html.includes('nr-sources'));
    } finally { console.error = origErr; }
  });

  test('if the flag table is unreadable the page renders exactly as before (flags fail closed)', async () => {
    const env = await mkEnv();
    env.DB._raw.exec('ALTER TABLE system_settings RENAME TO system_settings_gone');
    const origErr = console.error; console.error = () => {};
    try {
      const { status, html } = await get(env, '/en/news/live-one');
      assert.equal(status, 200); assert.ok(!html.includes('nr-'));
    } finally { console.error = origErr; }
  });

  test('flag cache: honours TTL, per DB handle', async () => {
    const env = await mkEnv();
    const t0 = 1_000_000;
    assert.equal((await nr.getNewsFlags(env.DB, { now: t0 })).news_new_taxonomy, false);
    await flagsOn(env, ['news_new_taxonomy']);
    assert.equal((await nr.getNewsFlags(env.DB, { now: t0 + 1000 })).news_new_taxonomy, false, 'cached within ttl');
    assert.equal((await nr.getNewsFlags(env.DB, { now: t0 + 31000 })).news_new_taxonomy, true, 'refreshed after ttl');
    const other = await mkEnv();
    assert.equal((await nr.getNewsFlags(other.DB, { now: t0 + 31000 })).news_new_taxonomy, false, 'other DB unaffected');
  });
});

describe('section pages under /en/news/<slug>', () => {
  let env, sid; beforeEach(async () => { env = await mkEnv(); await flagsOn(env); sid = await sectionId(env); });
  const addArticle = (id, slug, extra = '') => q(env, `INSERT INTO news (id,slug,title,content,published,author_id,created_by,section_id,published_at${extra ? ',' + extra.split('=')[0] : ''}) VALUES (?,?,?,?,1,1,1,?,NULL${extra ? ',' + extra.split('=')[1] : ''})`, id, slug, `Title ${slug}`, '<p>x</p>', sid);

  test('lists live articles of the section and its children only; canonical, robots, JSON-LD, breadcrumbs', async () => {
    await addArticle(20, 'in-section');
    const childId = (await q(env, `INSERT INTO news_sections (slug,name,parent_id) VALUES ('child-sec','Child',?)`, sid)).meta.last_row_id;
    await q(env, `INSERT INTO news (id,slug,title,content,published,author_id,created_by,section_id) VALUES (21,'in-child','Title in-child','<p>x</p>',1,1,1,?)`, childId);
    await q(env, `INSERT INTO news (id,slug,title,content,published,author_id,created_by,section_id) VALUES (22,'draft-in-sec','DRAFT HIDDEN','<p>x</p>',0,1,1,?)`, sid);
    await q(env, `INSERT INTO news (id,slug,title,content,published,author_id,created_by,section_id,published_at) VALUES (23,'sched-in-sec','SCHED HIDDEN','<p>x</p>',1,1,1,?,'2099-01-01 00:00:00')`, sid);
    await q(env, `INSERT INTO news (id,slug,title,content,published,author_id,created_by,section_id) VALUES (24,'other-sec','OTHER SECTION','<p>x</p>',1,1,1,?)`, await sectionId(env, 'markets'));
    const { status, html } = await get(env, '/en/news/regulation');
    assert.equal(status, 200);
    assert.match(html, /<h1[^>]*>Regulation<\/h1>/);
    assert.ok(html.includes('Title in-section') && html.includes('Title in-child'));
    for (const hidden of ['DRAFT HIDDEN', 'SCHED HIDDEN', 'OTHER SECTION']) assert.ok(!html.includes(hidden), `${hidden} must not be listed`);
    assert.match(html, /<link rel="canonical" href="https:\/\/site\.test\/en\/news\/regulation">/);
    assert.match(html, /name="robots" content="index, follow"/);
    const blocks = ldJson(html);
    assert.equal(blocks.find((j) => j['@type'] === 'CollectionPage').mainEntity.itemListElement.length, 2);
    assert.deepEqual(blocks.find((j) => j['@type'] === 'BreadcrumbList').itemListElement.map((i) => i.name), ['Home', 'News', 'Regulation']);
  });

  test('pagination: canonical per page, query noise ignored, out-of-range/invalid pages 404', async () => {
    for (let i = 0; i < 13; i++) await addArticle(100 + i, `p-${i}`);
    const p1 = await get(env, '/en/news/regulation?utm_source=x');
    assert.match(p1.html, /<link rel="canonical" href="https:\/\/site\.test\/en\/news\/regulation">/);
    assert.match(p1.html, /rel="next" href="\/en\/news\/regulation\?page=2"/);
    const p2 = await get(env, '/en/news/regulation?page=2');
    assert.equal(p2.status, 200);
    assert.match(p2.html, /<link rel="canonical" href="https:\/\/site\.test\/en\/news\/regulation\?page=2">/);
    assert.match(p2.html, /rel="prev" href="\/en\/news\/regulation"/);
    for (const bad of ['3', '0', '-1', 'abc', '1.5', '501']) assert.equal((await get(env, `/en/news/regulation?page=${bad}`)).status, 404, `page=${bad}`);
  });

  test('empty section renders but is noindex; inactive/unknown sections 404', async () => {
    const empty = await get(env, '/en/news/regulation');
    assert.equal(empty.status, 200);
    assert.match(empty.html, /name="robots" content="noindex, follow"/);
    await q(env, `UPDATE news_sections SET active=0 WHERE id=?`, sid);
    assert.equal((await get(env, '/en/news/regulation')).status, 404);
    assert.equal((await get(env, '/en/news/no-such-thing')).status, 404);
  });

  test('an existing live article always wins over a section with the same slug', async () => {
    await q(env, `UPDATE news SET slug='regulation' WHERE id=10`);
    const { status, html } = await get(env, '/en/news/regulation');
    assert.equal(status, 200); assert.match(html, /<h1>Live One<\/h1>/);
    assert.equal((await nr.findSlugCollisions(env.DB)).length, 1);
  });

  test('a DRAFT article with the same slug does not hide the section page', async () => {
    await q(env, `UPDATE news SET slug='regulation', published=0 WHERE id=10`);
    await addArticle(30, 'visible-one');
    const { status, html } = await get(env, '/en/news/regulation');
    assert.equal(status, 200); assert.ok(html.includes('Title visible-one'));
  });

  test('section names/descriptions are escaped', async () => {
    await q(env, `UPDATE news_sections SET name=?, description=? WHERE id=?`, '<script>alert(1)</script>', '{{title}} "quoted"', sid);
    const { html } = await get(env, '/en/news/regulation');
    assert.ok(!html.includes('<script>alert(1)</script>'));
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(!html.includes('{{title}}'));
  });
});

describe('render helpers', () => {
  test('esc encodes HTML and template braces', () => {
    assert.equal(R.esc(`<a href="x">'&{{y}}</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#123;&#123;y&#125;&#125;&lt;/a&gt;');
    assert.equal(R.esc(null), '');
  });
  test('safeHref only allows credential-free http(s)', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', '/relative', 'https://u:p@x.com', '', null, 'ftp://x.com']) assert.equal(R.safeHref(bad), null, String(bad));
    assert.equal(R.safeHref('https://example.com/a?b=1'), 'https://example.com/a?b=1');
  });
  test('public news sanitizer is an allow-list: internal and unknown columns are dropped', () => {
    const row = { id: 1, slug: 's', title: 't', content: 'c', created_by: 7, ad_mode: 'auto', ad_override_rules: '{}', some_future_private_col: 'x', author_name: 'A', labels: '[]', methodology: 'm', disclosure_json: '{}' };
    const out = R.sanitizePublicNewsRow(row);
    assert.deepEqual(Object.keys(out).sort(), ['author_name', 'content', 'id', 'labels', 'slug', 'title']);
    assert.deepEqual(R.sanitizePublicNewsList(null), []);
  });
  test('api.js applies the sanitizer to both public news list endpoints', () => {
    const src = readFileSync(join(ROOT, 'worker/api.js'), 'utf-8');
    assert.match(src, /import \{ sanitizePublicNewsList \} from "\.\/newsroom-render\.js"/);
    assert.equal((src.match(/sanitizePublicNewsList\(/g) || []).length, 2);
    assert.match(src, /json\(\{ news: sanitizePublicNewsList\(newsList\) \}\)/);
    assert.match(src, /json\(\{ news: sanitizePublicNewsList\(news\) \}\)/);
  });
});
