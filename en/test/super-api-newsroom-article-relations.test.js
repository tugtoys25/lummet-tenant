// test/super-api-newsroom-article-relations.test.js
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import {
  handleCreateSection, handleCreateTopic, handleCreateEntity, handleCreateSeries,
  handleSetArticleMeta, handleGetArticleRelations, handleSetArticleRelations
} from '../worker/super/handlers-newsroom.js';

function req(url) { return new Request(url); }

async function makeArticle(db, overrides = {}) {
  const r = await db.prepare(
    `INSERT INTO news (slug, title, content) VALUES (?, ?, ?)`
  ).bind(overrides.slug || 'test-article', overrides.title || 'Test Article', 'Body text').run();
  return r.meta.last_row_id;
}

describe('Super API v13 -- Article-level Newsroom metadata', () => {
  let db, env, articleId;

  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    env = { DB: db };
    articleId = await makeArticle(db);
  });

  test('setting article_type/content_class/labels succeeds and round-trips via the plain news row', async () => {
    const res = await handleSetArticleMeta(req('https://x'), env, articleId, JSON.stringify({
      article_type: 'analysis',
      content_class: 'editorial',
      labels: ['breaking', 'analysis']
    }));
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);

    const row = await db.prepare(`SELECT * FROM news WHERE id = ?`).bind(articleId).first();
    assert.equal(row.article_type, 'analysis');
    assert.equal(row.content_class, 'editorial');
    assert.deepEqual(JSON.parse(row.labels), ['breaking', 'analysis']);
  });

  test('an invalid article_type is rejected', async () => {
    const res = await handleSetArticleMeta(req('https://x'), env, articleId, JSON.stringify({ article_type: 'not_a_real_type' }));
    assert.equal(res.status, 400);
  });

  test('press releases require pr_provided_by', async () => {
    const res = await handleSetArticleMeta(req('https://x'), env, articleId, JSON.stringify({ content_class: 'press_release' }));
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.match(body.error, /pr_provided_by/);
  });

  test('press release WITH pr_provided_by succeeds', async () => {
    const res = await handleSetArticleMeta(req('https://x'), env, articleId, JSON.stringify({
      content_class: 'press_release',
      pr_provided_by: 'Example Corp'
    }));
    assert.equal(res.status, 200);
  });

  test('setting section_id to an active section succeeds', async () => {
    const sectionId = (await (await handleCreateSection(req('https://x'), env, undefined, JSON.stringify({ name: 'Custom Markets Watch' }))).json()).data.id;
    const res = await handleSetArticleMeta(req('https://x'), env, articleId, JSON.stringify({ section_id: sectionId }));
    assert.equal(res.status, 200);
    const row = await db.prepare(`SELECT section_id FROM news WHERE id = ?`).bind(articleId).first();
    assert.equal(row.section_id, sectionId);
  });

  test('setting section_id to a nonexistent section is rejected', async () => {
    const res = await handleSetArticleMeta(req('https://x'), env, articleId, JSON.stringify({ section_id: 999999 }));
    assert.equal(res.status, 400);
  });

  test('nonexistent article returns 404', async () => {
    const res = await handleSetArticleMeta(req('https://x'), env, 999999, JSON.stringify({ article_type: 'news' }));
    assert.equal(res.status, 404);
  });

  test('invalid (non-numeric) id is rejected with 400, not a crash', async () => {
    const res = await handleSetArticleMeta(req('https://x'), env, 'not-a-number', JSON.stringify({ article_type: 'news' }));
    assert.equal(res.status, 400);
  });

  test('succeeds with zero permission rows in the DB (tenant-wide-admin-equivalent credential)', async () => {
    const res = await handleSetArticleMeta(req('https://x'), env, articleId, JSON.stringify({ article_type: 'news' }));
    assert.equal((await res.json()).success, true);
  });
});

describe('Super API v13 -- Article-level Newsroom relations', () => {
  let db, env, articleId;

  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    env = { DB: db };
    articleId = await makeArticle(db);
  });

  test('empty relations for a freshly-created article', async () => {
    const res = await handleGetArticleRelations(req('https://x'), env, articleId);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.deepEqual(body.data, { topic_ids: [], series_ids: [], entities: [], countries: [], related: [] });
  });

  test('assigning topics/series/entities/countries round-trips through the getter', async () => {
    const topicId = (await (await handleCreateTopic(req('https://x'), env, undefined, JSON.stringify({ name: 'Payments' }))).json()).data.id;
    const seriesId = (await (await handleCreateSeries(req('https://x'), env, undefined, JSON.stringify({ name: 'Year in Review' }))).json()).data.id;
    const entityId = (await (await handleCreateEntity(req('https://x'), env, undefined, JSON.stringify({ name: 'Example Regulator', entity_type: 'regulator' }))).json()).data.id;
    await db.prepare(`INSERT INTO countries (code, name) VALUES ('GB', 'United Kingdom')`).run();

    const setRes = await handleSetArticleRelations(req('https://x'), env, articleId, JSON.stringify({
      topic_ids: [topicId],
      series_ids: [seriesId],
      entities: [{ id: entityId, role: 'subject' }],
      countries: [{ code: 'GB' }],
      primary_country: 'GB'
    }));
    assert.equal(setRes.status, 200);

    const getRes = await handleGetArticleRelations(req('https://x'), env, articleId);
    const body = await getRes.json();
    assert.deepEqual(body.data.topic_ids, [topicId]);
    assert.deepEqual(body.data.series_ids, [seriesId]);
    assert.equal(body.data.entities[0].id, entityId);
    assert.equal(body.data.entities[0].role, 'subject');
    assert.equal(body.data.countries[0].code, 'GB');
    assert.equal(body.data.countries[0].is_primary, true);
  });

  test('assigning an unknown topic id is rejected', async () => {
    const res = await handleSetArticleRelations(req('https://x'), env, articleId, JSON.stringify({ topic_ids: [999999] }));
    assert.equal(res.status, 400);
  });

  test('re-saving relations replaces the previous set (replace-set semantics)', async () => {
    const topicA = (await (await handleCreateTopic(req('https://x'), env, undefined, JSON.stringify({ name: 'Topic A' }))).json()).data.id;
    const topicB = (await (await handleCreateTopic(req('https://x'), env, undefined, JSON.stringify({ name: 'Topic B' }))).json()).data.id;

    await handleSetArticleRelations(req('https://x'), env, articleId, JSON.stringify({ topic_ids: [topicA] }));
    await handleSetArticleRelations(req('https://x'), env, articleId, JSON.stringify({ topic_ids: [topicB] }));

    const body = await (await handleGetArticleRelations(req('https://x'), env, articleId)).json();
    assert.deepEqual(body.data.topic_ids, [topicB]);
  });

  test('getting relations for a nonexistent article returns 404', async () => {
    const res = await handleGetArticleRelations(req('https://x'), env, 999999);
    assert.equal(res.status, 404);
  });
});
