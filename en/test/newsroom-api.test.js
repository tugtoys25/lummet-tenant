// test/newsroom-api.test.js -- Stage C: admin API + save-path hooks.
// Drives handleNewsroomApi with real Request objects against the real
// migrated schema. Not covered here: the api.js dispatch line itself
// (asserted separately below by source inspection) and real D1/HTTP.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { handleNewsroomApi, beforeNewsUpdate, afterNewsUpdate } from '../worker/newsroom-api.js';
import * as nr from '../worker/database/newsroom.js';
import { setUserItemAccess } from '../worker/database/item-access.js';

const BASE = 'https://site.test';
const ADMIN = { user_id: 1, role: 'admin' };
const EDITOR = { user_id: 2, role: 'editor' };
const EDITOR2 = { user_id: 3, role: 'editor' };
const NOBODY = { user_id: 4, role: 'nobody' };

async function setup() {
  const db = createTestDb(); applyMigrations(db);
  for (const [id, email, role] of [[1, 'a@t.l', 'admin'], [2, 'e@t.l', 'editor'], [3, 'e2@t.l', 'editor'], [4, 'n@t.l', 'nobody']]) {
    await db.prepare(`INSERT INTO users (id, email, password_hash, role) VALUES (?,?, 'x', ?)`).bind(id, email, role).run();
  }
  await db.prepare(`INSERT INTO authors (id, slug, name, role) VALUES (1,'elie','Elie','editor')`).run();
  await db.prepare(`INSERT OR IGNORE INTO countries (code, name) VALUES ('GB','United Kingdom'), ('DE','Germany')`).run();
  const ins = `INSERT INTO news (id, slug, title, content, published, author_id, created_by, published_at) VALUES (?,?,?,?,?,1,?,?)`;
  await db.prepare(ins).bind(10, 'live-one', 'Live One', '<p>x</p>', 1, 2, null).run();        // legacy, owned by editor 2
  await db.prepare(ins).bind(11, 'draft-one', 'Draft One', '<p>y</p>', 0, 2, null).run();      // legacy draft, owned by editor 2
  await db.prepare(ins).bind(12, 'other-one', 'Other One', '<p>z</p>', 1, 3, null).run();      // owned by editor 3
  return { DB: db, db };
}

async function call(env, method, route, { user = ADMIN, body, headers = {}, raw } = {}) {
  const init = { method, headers: { ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}), ...headers } };
  if (method === 'POST') init.body = raw ?? JSON.stringify(body ?? {});
  const res = await handleNewsroomApi(new Request(`${BASE}/api/v1/newsroom/${route}`, init), env, user);
  return { res, json: res ? await res.json() : null, status: res?.status };
}
const on = (db, key = 'news_editorial_workflow') => db.prepare(`UPDATE system_settings SET value='true' WHERE key=?`).bind(key).run();

describe('request hygiene', () => {
  let env; beforeEach(async () => { env = await setup(); });

  test('ignores paths outside /api/v1/newsroom/ (returns null)', async () => {
    const r = await handleNewsroomApi(new Request(`${BASE}/api/v1/news/list`), env, ADMIN);
    assert.equal(r, null);
  });
  test('no user -> 401', async () => assert.equal((await call(env, 'GET', 'meta', { user: null })).status, 401));
  test('cross-origin POST refused; same-origin and absent Origin accepted', async () => {
    assert.equal((await call(env, 'POST', 'sources/save', { body: { id: 10, sources: [] }, headers: { Origin: 'https://evil.test' } })).status, 403);
    assert.equal((await call(env, 'POST', 'sources/save', { body: { id: 10, sources: [] }, headers: { Origin: BASE } })).status, 200);
    assert.equal((await call(env, 'POST', 'sources/save', { body: { id: 10, sources: [] } })).status, 200);
  });
  test('non-JSON content type -> 415, bad JSON -> 400, array body -> 400, oversize -> 413', async () => {
    assert.equal((await call(env, 'POST', 'sources/save', { headers: { 'Content-Type': 'text/plain' }, raw: '{}' })).status, 415);
    assert.equal((await call(env, 'POST', 'sources/save', { raw: '{nope' })).status, 400);
    assert.equal((await call(env, 'POST', 'sources/save', { raw: '[]' })).status, 400);
    assert.equal((await call(env, 'POST', 'sources/save', { raw: JSON.stringify({ id: 10, pad: 'x'.repeat(600 * 1024) }) })).status, 413);
  });
  test('only GET/POST; unknown routes 404; responses are never cacheable', async () => {
    const r = await handleNewsroomApi(new Request(`${BASE}/api/v1/newsroom/meta`, { method: 'DELETE' }), env, ADMIN);
    assert.equal(r.status, 405);
    const nf = await call(env, 'GET', 'nope'); assert.equal(nf.status, 404);
    assert.equal(nf.res.headers.get('Cache-Control'), 'no-store');
  });
});

describe('permissions', () => {
  let env; beforeEach(async () => { env = await setup(); });

  test('a role with no news permissions is refused everywhere', async () => {
    assert.equal((await call(env, 'GET', 'article?id=10', { user: NOBODY })).status, 403);
    assert.equal((await call(env, 'GET', 'queue', { user: NOBODY })).status, 403);
    assert.equal((await call(env, 'POST', 'article/meta/save', { user: NOBODY, body: { id: 10, meta: { article_type: 'analysis' } } })).status, 403);
    assert.equal((await env.db.prepare(`SELECT article_type t FROM news WHERE id=10`).first()).t, null);
  });

  test('editor: can read + edit meta, cannot manage sources/taxonomy/corrections/authors', async () => {
    assert.equal((await call(env, 'GET', 'article?id=10', { user: EDITOR })).status, 200);
    assert.equal((await call(env, 'POST', 'article/meta/save', { user: EDITOR, body: { id: 10, meta: { article_type: 'analysis' } } })).status, 200);
    assert.equal((await call(env, 'POST', 'sources/save', { user: EDITOR, body: { id: 10, sources: [{ source_name: 'x' }] } })).status, 403);
    assert.equal((await call(env, 'POST', 'taxonomy/save', { user: EDITOR, body: { kind: 'topics', name: 'T' } })).status, 403);
    assert.equal((await call(env, 'POST', 'corrections/add', { user: EDITOR, body: { id: 10, type: 'correction', public_message: 'x' } })).status, 403);
    assert.equal((await call(env, 'POST', 'authors/profile/save', { user: EDITOR, body: { id: 1, job_title: 'x' } })).status, 403);
  });

  test('privilege escalation via crafted body fields does not work', async () => {
    const r = await call(env, 'POST', 'article/meta/save', { user: EDITOR, body: { id: 10, meta: { article_type: 'news', published: 0, created_by: 2, workflow_status: 'published' } } });
    assert.equal(r.status, 200);
    const n = await env.db.prepare(`SELECT published FROM news WHERE id=10`).first();
    assert.equal(n.published, 1); // unknown keys ignored
    assert.equal((await env.db.prepare(`SELECT COUNT(*) c FROM news_editorial`).first()).c, 0);
  });

  test('item-level scope "own": editor cannot read or edit another author\'s article (404)', async () => {
    await setUserItemAccess(env.db, 2, 'news', 'read', 'own');
    await setUserItemAccess(env.db, 2, 'news', 'update', 'own');
    assert.equal((await call(env, 'GET', 'article?id=12', { user: EDITOR })).status, 404);
    assert.equal((await call(env, 'POST', 'article/meta/save', { user: EDITOR, body: { id: 12, meta: { article_type: 'analysis' } } })).status, 404);
    assert.equal((await call(env, 'GET', 'article?id=10', { user: EDITOR })).status, 200);
    const q = await call(env, 'GET', 'queue?view=published', { user: EDITOR });
    assert.deepEqual(q.json.items.map(i => i.id), [10]);
  });
});

describe('article editorial data flow (admin)', () => {
  let env; beforeEach(async () => { env = await setup(); });

  test('taxonomy: create section, reject article/region collisions, archive not delete', async () => {
    const ok = await call(env, 'POST', 'taxonomy/save', { body: { kind: 'sections', name: 'Gaming Tech' } });
    assert.equal(ok.status, 200); assert.equal(ok.json.slug, 'gaming-tech');
    assert.equal((await call(env, 'POST', 'taxonomy/save', { body: { kind: 'sections', name: 'X', slug: 'live-one' } })).status, 409);
    assert.equal((await call(env, 'POST', 'taxonomy/save', { body: { kind: 'sections', name: 'X', slug: 'europe' } })).status, 409);
    assert.equal((await call(env, 'POST', 'taxonomy/save', { body: { kind: 'bogus', name: 'X' } })).status, 404);
    assert.equal((await call(env, 'POST', 'taxonomy/archive', { body: { kind: 'sections', id: ok.json.id } })).status, 200);
    const row = await env.db.prepare(`SELECT active FROM news_sections WHERE id=?`).bind(ok.json.id).first();
    assert.equal(row.active, 0);
    const pub = await call(env, 'GET', 'taxonomy/list?kind=sections');
    assert.ok(!pub.json.items.some(i => i.id === ok.json.id));
    const all = await call(env, 'GET', 'taxonomy/list?kind=sections&all=1');
    assert.ok(all.json.items.some(i => i.id === ok.json.id));
  });

  test('section cannot be its own parent or create a cycle', async () => {
    const a = (await call(env, 'POST', 'taxonomy/save', { body: { kind: 'sections', name: 'A' } })).json.id;
    const b = (await call(env, 'POST', 'taxonomy/save', { body: { kind: 'sections', name: 'B', parent_id: a } })).json.id;
    assert.equal((await call(env, 'POST', 'taxonomy/save', { body: { kind: 'sections', id: a, parent_id: a } })).status, 400);
    assert.equal((await call(env, 'POST', 'taxonomy/save', { body: { kind: 'sections', id: a, parent_id: b } })).status, 400);
  });

  test('entity validation: bad type, javascript: website, bad country', async () => {
    const t = (o) => call(env, 'POST', 'taxonomy/save', { body: { kind: 'entities', name: 'UKGC', ...o } });
    assert.equal((await t({ entity_type: 'alien' })).status, 400);
    assert.equal((await t({ website_url: 'javascript:alert(1)' })).status, 400);
    assert.equal((await t({ country_code: 'GBR' })).status, 400);
    assert.equal((await t({ entity_type: 'regulator', website_url: 'https://www.gamblingcommission.gov.uk', country_code: 'gb' })).status, 200);
  });

  test('meta + relations save, bundle round-trip, revision recorded, no internal leakage', async () => {
    const sec = (await call(env, 'POST', 'taxonomy/save', { body: { kind: 'sections', name: 'Deals' } })).json.id;
    const top = (await call(env, 'POST', 'taxonomy/save', { body: { kind: 'topics', name: 'Licensing' } })).json.id;
    const ent = (await call(env, 'POST', 'taxonomy/save', { body: { kind: 'entities', name: 'UKGC', entity_type: 'regulator' } })).json.id;
    const ser = (await call(env, 'POST', 'taxonomy/save', { body: { kind: 'series', name: 'EU Reg' } })).json.id;
    const r = await call(env, 'POST', 'article/meta/save', { body: {
      id: 10, change_summary: 'classify',
      meta: { article_type: 'analysis', section_id: sec, primary_country: 'gb', labels: ['analysis', 'exclusive', 'analysis'], methodology: 'We reviewed <b>filings</b>.', disclosure_json: { affiliate: true, bogus: true } },
      relations: { topic_ids: [top], entities: [{ id: ent, role: 'subject' }], series_ids: [ser], countries: ['GB', 'DE'], primary_country: 'GB', related: [{ news_id: 12, relation_type: 'background' }] }
    } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.revision, 1);
    const b = (await call(env, 'GET', 'article?id=10')).json;
    assert.equal(b.article.article_type, 'analysis');
    assert.equal(b.article.primary_country, 'GB');
    assert.deepEqual(b.article.labels, ['analysis', 'exclusive']);
    assert.equal(b.article.methodology, 'We reviewed filings.');
    assert.deepEqual(b.article.disclosure, { affiliate: true });
    assert.equal(b.topics[0].name, 'Licensing');
    assert.equal(b.entities[0].role, 'subject');
    assert.equal(b.series[0].name, 'EU Reg');
    assert.deepEqual(b.countries.map(c => c.country_code).sort(), ['DE', 'GB']);
    assert.equal(b.related[0].slug, 'other-one');
    assert.equal(b.revisions[0].change_summary, 'classify');
    // bundle for the article record must not carry created_by / content
    assert.ok(!('created_by' in b.article) && !('content' in b.article));
  });

  test('meta validation: unknown section/country/region/type/labels rejected; press release needs provider', async () => {
    const m = (meta) => call(env, 'POST', 'article/meta/save', { body: { id: 10, meta } });
    assert.equal((await m({ section_id: 9999 })).status, 400);
    assert.equal((await m({ primary_country: 'ZZ' })).status, 400);
    assert.equal((await m({ region_slug: 'atlantis' })).status, 400);
    assert.equal((await m({ article_type: 'gossip' })).status, 400);
    assert.equal((await m({ labels: ['breaking', 'nonsense'] })).status, 400);
    assert.equal((await m({ pr_original_source_url: 'http://169.254.169.254/' })).status, 400);
    assert.equal((await m({ article_type: 'press_release' })).status, 400);
    assert.equal((await m({ article_type: 'press_release', pr_provided_by: 'Acme Ltd' })).status, 200);
  });

  test('a failed relation batch writes nothing (validate-then-write)', async () => {
    const top = (await call(env, 'POST', 'taxonomy/save', { body: { kind: 'topics', name: 'T' } })).json.id;
    await call(env, 'POST', 'article/meta/save', { body: { id: 10, relations: { topic_ids: [top] } } });
    const bad = await call(env, 'POST', 'article/meta/save', { body: { id: 10, relations: { topic_ids: [], related: [{ news_id: 10, relation_type: 'related' }] } } });
    assert.equal(bad.status, 400); // self-relation
    assert.equal((await env.db.prepare(`SELECT COUNT(*) c FROM news_article_topics WHERE news_id=10`).first()).c, 1);
  });

  test('sources save + corrections add reach the public loaders; cache-safe response', async () => {
    assert.equal((await call(env, 'POST', 'sources/save', { body: { id: 10, sources: [{ source_name: 'Regulator', source_type: 'regulator', source_url: 'https://r.example/doc' }] } })).status, 200);
    assert.equal((await call(env, 'POST', 'sources/save', { body: { id: 10, sources: [{ source_name: 'Bad', source_url: 'javascript:1' }] } })).status, 400);
    assert.equal((await call(env, 'POST', 'corrections/add', { body: { id: 10, type: 'correction', public_message: 'Fixed.' } })).status, 200);
    const b = (await call(env, 'GET', 'article?id=10')).json;
    assert.equal(b.sources.length, 1); assert.equal(b.corrections[0].public_message, 'Fixed.');
  });

  test('timeline only on live articles', async () => {
    assert.equal((await call(env, 'POST', 'timeline/add', { body: { id: 10, body: 'Update' } })).status, 409);
    await call(env, 'POST', 'article/meta/save', { body: { id: 10, meta: { article_type: 'live' } } });
    assert.equal((await call(env, 'POST', 'timeline/add', { body: { id: 10, body: '<b>Update</b> one', editor_author_id: 1 } })).status, 200);
    const b = (await call(env, 'GET', 'article?id=10')).json;
    assert.equal(b.timeline[0].body, 'Update one'); assert.equal(b.timeline[0].editor_name, 'Elie');
  });

  test('author profile + media credit', async () => {
    assert.equal((await call(env, 'POST', 'authors/profile/save', { body: { id: 1, role: 'Emperor' } })).status, 400);
    assert.equal((await call(env, 'POST', 'authors/profile/save', { body: { id: 1, website_url: 'javascript:1' } })).status, 400);
    assert.equal((await call(env, 'POST', 'authors/profile/save', { body: { id: 1, role: 'Senior Editor', job_title: 'Head of News', expertise: 'Regulation' } })).status, 200);
    assert.equal((await call(env, 'POST', 'authors/profile/save', { body: { id: 99, job_title: 'x' } })).status, 404);
    const a = await env.db.prepare(`SELECT role, job_title FROM authors WHERE id=1`).first();
    assert.deepEqual({ ...a }, { role: 'Senior Editor', job_title: 'Head of News' });
    await env.db.prepare(`INSERT INTO media_library (id, filename, url) VALUES (1,'a.jpg','/u/a.jpg')`).run();
    assert.equal((await call(env, 'POST', 'media/credit/save', { user: NOBODY, body: { id: 1, credit: 'x' } })).status, 403);
    assert.equal((await call(env, 'POST', 'media/credit/save', { body: { id: 1 } })).status, 400);
    assert.equal((await call(env, 'POST', 'media/credit/save', { body: { id: 99, credit: 'x' } })).status, 404);
    assert.equal((await call(env, 'POST', 'media/credit/save', { user: EDITOR, body: { id: 1, credit: '<i>Reuters</i>', photographer: 'J. Doe', license: 'CC BY 4.0', credit_source: 'Getty', alt_text: 'A chart', id2: 5 } })).status, 200);
    const m = await env.db.prepare(`SELECT credit, photographer, license, credit_source, alt_text FROM media_library WHERE id=1`).first();
    assert.deepEqual({ ...m }, { credit: 'Reuters', photographer: 'J. Doe', license: 'CC BY 4.0', credit_source: 'Getty', alt_text: 'A chart' });
  });
});

describe('slug conflicts (article URL shadows a section page)', () => {
  test('lists articles whose slug equals an active section slug; requires news.read', async () => {
    const env = await setup();
    assert.deepEqual((await call(env, 'GET', 'slug-conflicts')).json.conflicts, []);
    await env.db.prepare(`UPDATE news SET slug='regulation' WHERE id=10`).run();
    const c = (await call(env, 'GET', 'slug-conflicts')).json.conflicts;
    assert.equal(c.length, 1); assert.equal(c[0].news_id, 10); assert.equal(c[0].section_name, 'Regulation');
    assert.equal((await call(env, 'GET', 'slug-conflicts', { user: NOBODY })).status, 403);
  });
});

describe('workflow endpoints (behind news_editorial_workflow)', () => {
  let env; beforeEach(async () => { env = await setup(); });

  test('flag off -> 404 for transition / assign / factcheck', async () => {
    for (const route of ['workflow/transition', 'workflow/assign', 'factcheck/save'])
      assert.equal((await call(env, 'POST', route, { body: { id: 11, to: 'editorial_review', status: 'in_review' } })).status, 404);
  });

  test('flag on: editor submits, cannot approve/publish; admin approves + publishes; queues reflect it', async () => {
    await on(env.db);
    assert.equal((await call(env, 'POST', 'workflow/transition', { user: EDITOR, body: { id: 11, to: 'editorial_review' } })).status, 200);
    assert.equal((await call(env, 'POST', 'workflow/transition', { user: EDITOR, body: { id: 11, to: 'approved' } })).status, 403);
    assert.equal((await call(env, 'GET', 'queue?view=review', { user: EDITOR })).json.items[0].id, 11);
    assert.equal((await call(env, 'POST', 'workflow/transition', { body: { id: 11, to: 'approved' } })).status, 200);
    assert.equal((await call(env, 'POST', 'workflow/transition', { user: EDITOR, body: { id: 11, to: 'published' } })).status, 403);
    assert.equal((await env.db.prepare(`SELECT published p FROM news WHERE id=11`).first()).p, 0);
    assert.equal((await call(env, 'POST', 'workflow/transition', { body: { id: 11, to: 'published' } })).status, 200);
    assert.equal((await env.db.prepare(`SELECT published p FROM news WHERE id=11`).first()).p, 1);
  });

  test('assign + factcheck + assigned_to_me queue; internal notes only via editorial block', async () => {
    await on(env.db);
    assert.equal((await call(env, 'POST', 'workflow/assign', { user: EDITOR, body: { id: 11, assigned_to: 2 } })).status, 403);
    assert.equal((await call(env, 'POST', 'workflow/assign', { body: { id: 11, assigned_to: 999 } })).status, 400);
    assert.equal((await call(env, 'POST', 'workflow/assign', { body: { id: 11, assigned_to: 2, assignment_notes: 'cover UKGC' } })).status, 200);
    const q = await call(env, 'GET', 'queue?view=assigned_to_me', { user: EDITOR });
    assert.deepEqual(q.json.items.map(i => i.id), [11]);
    assert.deepEqual((await call(env, 'GET', 'queue?view=assigned_to_me', { user: EDITOR2 })).json.items, []);
    assert.equal((await call(env, 'POST', 'factcheck/save', { body: { id: 11, status: 'fact_checked', notes: 'internal only' } })).status, 200);
    assert.equal((await call(env, 'GET', 'article?id=11')).json.editorial.fact_check_notes, 'internal only');
  });

  test('corrections keep workflow status in step when the workflow is on', async () => {
    await on(env.db);
    await call(env, 'POST', 'corrections/add', { body: { id: 10, type: 'correction', public_message: 'Fix.' } });
    assert.equal((await env.db.prepare(`SELECT workflow_status s FROM news_editorial WHERE news_id=10`).first()).s, 'corrected');
    await call(env, 'POST', 'corrections/add', { body: { id: 10, type: 'retraction', public_message: 'Withdrawn.' } });
    assert.equal((await env.db.prepare(`SELECT workflow_status s, (SELECT published FROM news WHERE id=10) p FROM news_editorial WHERE news_id=10`).first()).s, 'retracted');
    assert.equal((await env.db.prepare(`SELECT published p FROM news WHERE id=10`).first()).p, 1);
  });

  test('queue: unknown view 400; drafts/scheduled/published/corrections views', async () => {
    assert.equal((await call(env, 'GET', 'queue?view=drop table')).status, 400);
    assert.deepEqual((await call(env, 'GET', 'queue?view=drafts')).json.items.map(i => i.id), [11]);
    await env.db.prepare(`UPDATE news SET published_at='2099-01-01 00:00:00' WHERE id=12`).run();
    assert.deepEqual((await call(env, 'GET', 'queue?view=scheduled')).json.items.map(i => i.id), [12]);
    assert.deepEqual((await call(env, 'GET', 'queue?view=published')).json.items.map(i => i.id), [10]);
    await call(env, 'POST', 'corrections/add', { body: { id: 10, type: 'update', public_message: 'Updated.' } });
    assert.deepEqual((await call(env, 'GET', 'queue?view=corrections')).json.items.map(i => i.id), [10]);
  });
});

describe('save-path hooks on the EXISTING update endpoint', () => {
  let env; beforeEach(async () => { env = await setup(); });
  const upd = (over = {}) => ({ old_slug: 'live-one', slug: 'live-one', title: 'Live One', content: '<p>x</p>', ...over });

  test('flag off: hooks are complete no-ops (no revision, no audit, no denial)', async () => {
    const ctx = await beforeNewsUpdate(env, EDITOR, upd());
    assert.deepEqual(ctx, { enabled: false });
    await afterNewsUpdate(env, EDITOR, upd({ title: 'Changed' }), ctx);
    assert.equal((await env.db.prepare(`SELECT COUNT(*) c FROM news_revisions`).first()).c, 0);
    assert.equal((await env.db.prepare(`SELECT COUNT(*) c FROM audit_logs`).first()).c, 0);
  });

  test('flag on: legacy article keeps simple publishing for editors, and edits are versioned', async () => {
    await on(env.db);
    const body = upd({ title: 'Live One (edited)', change_summary: 'headline' });
    const ctx = await beforeNewsUpdate(env, EDITOR, body);
    assert.ok(!ctx.denied);
    await env.db.prepare(`UPDATE news SET title = ? WHERE slug = ?`).bind(body.title, 'live-one').run(); // stands in for news.updateNews
    await afterNewsUpdate(env, EDITOR, body, ctx);
    const rev = await nr.getRevision(env.db, 10, 1, null);
    assert.deepEqual(rev.changed_fields, ['title']);
    assert.equal(rev.previous_values.title, 'Live One');
    assert.equal(rev.change_summary, 'headline');
  });

  test('flag on: an article in the workflow cannot be published/unpublished via plain update without news.publish', async () => {
    await on(env.db);
    await call(env, 'POST', 'workflow/transition', { user: EDITOR, body: { id: 11, to: 'editorial_review' } });
    const pub = { old_slug: 'draft-one', slug: 'draft-one', title: 'Draft One', content: '<p>y</p>', published: 1 };
    const denied = await beforeNewsUpdate(env, EDITOR, pub);
    assert.equal(denied.denied.status, 403);
    assert.ok(!(await beforeNewsUpdate(env, ADMIN, pub)).denied);
    // omitting `published` means "publish" in the legacy handler -> also denied
    assert.equal((await beforeNewsUpdate(env, EDITOR, { ...pub, published: undefined })).denied.status, 403);
    // staying a draft is fine
    assert.ok(!(await beforeNewsUpdate(env, EDITOR, { ...pub, published: 0 })).denied);
  });

  test('flag on: editing does not clear a future schedule', async () => {
    await on(env.db);
    await env.db.prepare(`UPDATE news SET published_at='2099-01-01 00:00:00' WHERE id=12`).run();
    const body = { old_slug: 'other-one', slug: 'other-one', title: 'Other One', content: '<p>z</p>' }; // no published_at, like the legacy form
    const ctx = await beforeNewsUpdate(env, ADMIN, body);
    await env.db.prepare(`UPDATE news SET published_at = NULL WHERE id = 12`).run(); // what legacy updateNews does
    await afterNewsUpdate(env, ADMIN, body, ctx);
    assert.equal((await env.db.prepare(`SELECT published_at pa FROM news WHERE id=12`).first()).pa, '2099-01-01 00:00:00');
  });

  test('hooks never throw into the save, even if the DB fails', async () => {
    const broken = { DB: { prepare: () => { throw new Error('D1 down'); } } };
    const origErr = console.error; console.error = () => {};
    try {
      assert.deepEqual(await beforeNewsUpdate(broken, EDITOR, upd()), { enabled: false });
      await afterNewsUpdate(broken, EDITOR, upd(), { enabled: true, before: { id: 10, published_at: null } });
    } finally { console.error = origErr; }
  });
});

describe('flags admin API', () => {
  test('GET flags: needs news.manage_settings; lists every news_* row with its saved value and a label', async () => {
    const env = await setup();
    assert.equal((await call(env, 'GET', 'flags', { user: EDITOR })).status, 403);
    const r = await call(env, 'GET', 'flags');
    assert.equal(r.status, 200);
    assert.ok(r.json.flags.length >= 9, `expected at least 9 flags, got ${r.json.flags.length}`);
    const bySlug = Object.fromEntries(r.json.flags.map((f) => [f.key, f]));
    assert.ok(bySlug.news_search_v2); assert.equal(bySlug.news_search_v2.value, false);
    assert.ok(bySlug.news_search_v2.label && bySlug.news_search_v2.label !== 'news_search_v2', 'known flags get a human label');
    // an unlisted-but-real flag still shows up, just labelled by its key (documentation list is not a read allow-list)
    await env.DB.prepare(`INSERT INTO system_settings (key, value) VALUES ('news_made_up_future_flag', 'false')`).run();
    const r2 = await call(env, 'GET', 'flags');
    const madeUp = r2.json.flags.find((f) => f.key === 'news_made_up_future_flag');
    assert.ok(madeUp); assert.equal(madeUp.label, 'news_made_up_future_flag');
  });

  test('POST flags/save: needs news.manage_settings; flips one or many; is audited; unknown request shapes fail cleanly', async () => {
    const env = await setup();
    assert.equal((await call(env, 'POST', 'flags/save', { user: EDITOR, body: { flags: { news_search_v2: true } } })).status, 403);
    assert.equal((await call(env, 'POST', 'flags/save', { body: {} })).status, 400);
    const r = await call(env, 'POST', 'flags/save', { body: { flags: { news_search_v2: true, news_trending: true } } });
    assert.equal(r.status, 200); assert.equal(r.json.updated, 2);
    const row = await env.DB.prepare(`SELECT value FROM system_settings WHERE key='news_search_v2'`).first();
    assert.equal(row.value, 'true');
    const audit = await env.DB.prepare(`SELECT metadata FROM audit_logs WHERE entity_type='news_flag' ORDER BY id DESC LIMIT 1`).first();
    assert.match(audit.metadata, /news_search_v2/);
    // single-flag shorthand also works
    const r2 = await call(env, 'POST', 'flags/save', { body: { key: 'news_trending', value: false } });
    assert.equal(r2.status, 200);
    assert.equal((await env.DB.prepare(`SELECT value FROM system_settings WHERE key='news_trending'`).first()).value, 'false');
  });

  test('POST flags/save: allow-listed to existing news_* rows only -- cannot create or touch an arbitrary system_settings key', async () => {
    const env = await setup();
    const before = await env.DB.prepare(`SELECT COUNT(*) c FROM system_settings`).first();
    const r = await call(env, 'POST', 'flags/save', { body: { flags: { site_maintenance_mode: true } } });
    assert.equal(r.status, 400);
    assert.match(r.json.error, /Unknown flag/);
    const after = await env.DB.prepare(`SELECT COUNT(*) c FROM system_settings`).first();
    assert.equal(after.c, before.c, 'no new row was created');
    assert.equal(await env.DB.prepare(`SELECT value FROM system_settings WHERE key='site_maintenance_mode'`).first(), null, 'non-news setting was never touched');
  });

  test('a flag flip takes effect immediately for public rendering, not after the 30s cache window', async () => {
    const env = await setup();
    const { getNewsFlags } = nr;
    assert.equal((await getNewsFlags(env.DB)).news_trending, false);
    await call(env, 'POST', 'flags/save', { body: { flags: { news_trending: true } } });
    assert.equal((await getNewsFlags(env.DB)).news_trending, true, 'cache was reset by the save, not left stale for 30s');
  });
});

describe('wiring (source inspection of api.js)', () => {
  const src = readFileSync(new URL('../worker/api.js', import.meta.url), 'utf-8');
  test('api.js imports and mounts the newsroom handler after the auth gate', () => {
    assert.match(src, /import \{ handleNewsroomApi, beforeNewsUpdate, afterNewsUpdate, slugRedirectHook, searchReindexHook \} from "\.\/newsroom-api\.js"/);
    const authGate = src.indexOf('return failure("Unauthorized", 401)');
    const mount = src.indexOf('handleNewsroomApi(request, env, user)');
    assert.ok(authGate > -1 && mount > authGate, 'newsroom must be mounted after the unauthenticated-request rejection');
  });
  test('create and update keep the search index current, right after the save', () => {
    const c = src.indexOf('await news.createNews(env.DB, body);');
    const hook = src.indexOf('searchReindexHook(env, body.slug)', c);
    assert.ok(c > -1 && hook > c && hook < src.indexOf('await invalidateNews(env);', c));
    const u = src.indexOf('await slugRedirectHook(env, body);');
    assert.ok(u > -1 && src.indexOf('searchReindexHook(env, body.slug)', u) > u);
  });
  test('update handler calls before/after hooks around news.updateNews', () => {
    const a = src.indexOf('beforeNewsUpdate(env, user, body)');
    const b = src.indexOf('await news.updateNews(', a);
    const r = src.indexOf('slugRedirectHook(env, body)', b);
    const c = src.indexOf('afterNewsUpdate(env, user, body, newsroomCtx)', b);
    assert.ok(a > -1 && b > a && r > b && c > r, 'redirect is recorded right after the save, before the other hooks');
  });
});
