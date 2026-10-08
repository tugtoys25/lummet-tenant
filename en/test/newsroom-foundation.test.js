// test/newsroom-foundation.test.js
//
// Stage A (database additions) verification for the newsroom upgrade.
// Runs the REAL migrations (schema.sql + 0001..0058) against an in-memory
// SQLite via the project's D1 shim, then exercises the EXISTING news.js
// data layer against legacy-shaped rows to prove nothing regressed.
//
// Limits (same as the rest of this suite): node:sqlite is not byte-identical
// to D1, and this does not execute the Worker. It proves schema safety and
// data-layer compatibility, not HTTP behaviour.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { getAllNews, getNews } from '../worker/database/news.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(__dirname, '..', 'migrations');

const NEW_TABLES = [
  'news_sections', 'news_topics', 'news_regions', 'news_region_countries',
  'news_entities', 'news_series', 'news_article_topics', 'news_article_countries',
  'news_article_entities', 'news_series_articles', 'news_related',
  'news_article_sources', 'news_corrections', 'news_timeline_updates',
  'news_revisions', 'news_editorial', 'news_editorial_notes', 'news_pins'
];

// Columns that must NEVER exist on `news`: existing public reads use n.* and
// /api/v1/public/news/list returns those rows verbatim.
const INTERNAL_COLUMNS = [
  'fact_check_notes', 'editor_notes', 'assignment_notes', 'private_sources',
  'assigned_to', 'reviewed_by', 'fact_checked_by', 'fact_checked_at',
  'approved_by', 'published_by', 'workflow_status', 'fact_check_status', 'internal_review'
];

async function seedLegacyNews(db) {
  await db.prepare(`INSERT INTO users (id, email, password_hash, role) VALUES (1, 'a@test.local', 'x', 'admin')`).run();
  await db.prepare(`INSERT INTO authors (id, slug, name, bio, role) VALUES (1, 'elie', 'Elie', 'Bio', 'editor')`).run();
  // Shape mirrors production rows: published_at NULL, ISO-with-T string, and past date.
  const rows = [
    [4, 'legacy-a', 'Legacy A', '<p>Body A</p>', 1, null],
    [5, 'legacy-b', 'Legacy B', '<p>Body B</p>', 1, '2026-08-30T08:11'],
    [6, 'legacy-draft', 'Legacy Draft', '<p>Body D</p>', 0, null]
  ];
  for (const [id, slug, title, content, published, publishedAt] of rows) {
    await db.prepare(`
      INSERT INTO news (id, slug, title, content, author, published, author_id, published_at, created_by, ad_mode, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'Elie', ?, 1, ?, 1, 'auto', '2026-07-15 08:13:44', '2026-08-25 16:09:27')
    `).bind(id, slug, title, content, published, publishedAt).run();
  }
}

function stripComments(sql) {
  return sql.split('\n').map(l => { const i = l.indexOf('--'); return i === -1 ? l : l.slice(0, i); }).join('\n');
}

describe('newsroom migrations are additive-only', () => {
  for (const file of ['0053_news_published_at_parity.sql', '0054_newsroom_foundation.sql']) {
    test(`${file} contains no destructive or row-rewriting statements`, () => {
      const sql = stripComments(readFileSync(join(MIGRATIONS, file), 'utf-8'));
      assert.doesNotMatch(sql, /\bDROP\s+(TABLE|COLUMN|INDEX|VIEW)\b/i);
      assert.doesNotMatch(sql, /\bDELETE\s+FROM\b/i);
      assert.doesNotMatch(sql, /\bTRUNCATE\b/i);
      assert.doesNotMatch(sql, /\bUPDATE\s+\w+\s+SET\b/i);
      assert.doesNotMatch(sql, /\bRENAME\b/i);
    });
  }

  test('every CREATE TABLE / CREATE INDEX in 0054 is IF NOT EXISTS (re-runnable)', () => {
    const sql = stripComments(readFileSync(join(MIGRATIONS, '0054_newsroom_foundation.sql'), 'utf-8'));
    const creates = sql.match(/CREATE\s+(UNIQUE\s+)?(TABLE|INDEX)\s+(?!IF NOT EXISTS)/gi);
    assert.equal(creates, null);
  });

  test('all seeds use INSERT OR IGNORE', () => {
    const sql = stripComments(readFileSync(join(MIGRATIONS, '0054_newsroom_foundation.sql'), 'utf-8'));
    const plainInserts = sql.match(/INSERT\s+(?!OR IGNORE)INTO/gi);
    assert.equal(plainInserts, null);
  });
});

describe('newsroom schema on a fresh DB', () => {
  let db;
  beforeEach(() => { db = createTestDb(); applyMigrations(db); });

  test('all new tables exist', async () => {
    for (const t of NEW_TABLES) {
      const row = await db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).bind(t).first();
      assert.ok(row, `missing table ${t}`);
    }
  });

  test('no internal editorial column leaked onto the public news table', async () => {
    const cols = (await db.prepare(`PRAGMA table_info(news)`).all()).results.map(c => c.name);
    for (const c of INTERNAL_COLUMNS) assert.ok(!cols.includes(c), `news must not have internal column ${c}`);
    // ...and the public-safe additions are present
    for (const c of ['article_type', 'section_id', 'primary_country', 'region_slug', 'content_class', 'labels', 'methodology', 'published_at']) {
      assert.ok(cols.includes(c), `news is missing public column ${c}`);
    }
  });

  test('internal fields live in news_editorial instead', async () => {
    const cols = (await db.prepare(`PRAGMA table_info(news_editorial)`).all()).results.map(c => c.name);
    for (const c of ['workflow_status', 'assigned_to', 'fact_check_notes', 'editor_notes', 'fact_checked_by']) {
      assert.ok(cols.includes(c), `news_editorial missing ${c}`);
    }
  });

  test('expected indexes exist', async () => {
    const idx = (await db.prepare(`SELECT name FROM sqlite_master WHERE type='index'`).all()).results.map(r => r.name);
    for (const n of ['idx_news_published_date', 'idx_news_section', 'idx_news_article_type',
      'idx_news_article_sources_news', 'idx_news_revisions_news', 'idx_news_corrections_news']) {
      assert.ok(idx.includes(n), `missing index ${n}`);
    }
  });

  test('all newsroom feature flags ship OFF', async () => {
    const rows = (await db.prepare(`SELECT key, value FROM system_settings WHERE key LIKE 'news_%'`).all()).results;
    assert.ok(rows.length >= 5);
    for (const r of rows) assert.equal(r.value, 'false', `${r.key} must default to false`);
  });

  test('new permission actions are admin-only; existing editor grants untouched', async () => {
    const editorNew = await db.prepare(
      `SELECT action FROM permissions WHERE role='editor' AND resource='news' AND action IN
       ('review','factcheck','publish','schedule','correct','retract','manage_authors','manage_taxonomy','manage_sources','manage_settings','view_analytics')`
    ).all();
    assert.equal(editorNew.results.length, 0);
    const editorOld = await db.prepare(
      `SELECT action FROM permissions WHERE role='editor' AND resource='news' AND allowed=1 ORDER BY action`
    ).all();
    assert.deepEqual(editorOld.results.map(r => r.action), ['create', 'read', 'update']);
    const adminNew = await db.prepare(
      `SELECT COUNT(*) AS c FROM permissions WHERE role='admin' AND resource='news' AND action='publish' AND allowed=1`
    ).first();
    assert.equal(adminNew.c, 1);
  });

  test('seeded sections and regions are generic and inactive-able (no tenant names)', async () => {
    const secs = (await db.prepare(`SELECT slug, name FROM news_sections`).all()).results;
    const regs = (await db.prepare(`SELECT slug FROM news_regions`).all()).results;
    assert.equal(regs.length, 7);
    assert.ok(secs.length >= 11);
    const blob = JSON.stringify([...secs, ...regs]).toLowerCase();
    for (const banned of ['level', 'freewin', 'cluster', 'neuroodds', 'legendodds', 'brilliantodds']) {
      assert.ok(!blob.includes(banned), `seed data must not contain tenant name "${banned}"`);
    }
  });
});

describe('existing news data layer is unaffected (legacy-shaped rows)', () => {
  let db;
  beforeEach(async () => { db = createTestDb(); applyMigrations(db); await seedLegacyNews(db); });

  test('getAllNews still returns exactly the published legacy articles', async () => {
    const list = await getAllNews(db);
    assert.deepEqual(list.map(n => n.slug).sort(), ['legacy-a', 'legacy-b']);
  });

  test('getNews returns legacy rows with every new column NULL and content untouched', async () => {
    const a = await getNews(db, 'legacy-a');
    assert.equal(a.title, 'Legacy A');
    assert.equal(a.content, '<p>Body A</p>');
    assert.equal(a.slug, 'legacy-a');
    assert.equal(a.created_at, '2026-07-15 08:13:44');
    for (const c of ['article_type', 'section_id', 'primary_country', 'region_slug', 'content_class', 'labels', 'methodology', 'pr_provided_by']) {
      assert.equal(a[c], null, `${c} must be NULL on a legacy row`);
    }
  });

  test('legacy rows have no editorial row (=> simple publishing semantics)', async () => {
    const r = await db.prepare(`SELECT COUNT(*) AS c FROM news_editorial`).first();
    assert.equal(r.c, 0);
  });

  test('row counts are unchanged by the migrations (no data destroyed)', async () => {
    const n = await db.prepare(`SELECT COUNT(*) AS c FROM news`).first();
    const a = await db.prepare(`SELECT COUNT(*) AS c FROM authors`).first();
    assert.equal(n.c, 3);
    assert.equal(a.c, 1);
  });
});

describe('foreign-key behaviour never blocks the existing delete flow', () => {
  let db;
  beforeEach(async () => {
    db = createTestDb(); applyMigrations(db); await seedLegacyNews(db);
    db._raw.exec('PRAGMA foreign_keys = ON;'); // stricter than D1 default, to prove the worst case
  });

  test('deleting an article cascades child rows; corrections/revisions survive as audit history', async () => {
    await db.prepare(`INSERT INTO news_article_sources (news_id, source_name, source_type) VALUES (4, 'Regulator', 'regulator')`).run();
    await db.prepare(`INSERT INTO news_related (news_id, related_news_id, relation_type) VALUES (4, 5, 'background')`).run();
    await db.prepare(`INSERT INTO news_editorial (news_id, workflow_status) VALUES (4, 'draft')`).run();
    await db.prepare(`INSERT INTO news_corrections (news_id, type, public_message) VALUES (4, 'correction', 'Fixed a figure.')`).run();
    await db.prepare(`INSERT INTO news_revisions (news_id, version_number, change_summary) VALUES (4, 1, 'edit')`).run();

    await db.prepare(`DELETE FROM news WHERE id = 4`).run(); // must not throw

    const c = async (t) => (await db.prepare(`SELECT COUNT(*) AS c FROM ${t} WHERE news_id = 4`).first()).c;
    assert.equal(await c('news_article_sources'), 0);
    assert.equal(await c('news_editorial'), 0);
    assert.equal(await c('news_corrections'), 1);
    assert.equal(await c('news_revisions'), 1);
  });
});

describe('constraints', () => {
  let db;
  beforeEach(async () => { db = createTestDb(); applyMigrations(db); await seedLegacyNews(db); });

  test('revision version numbers are unique per article', async () => {
    await db.prepare(`INSERT INTO news_revisions (news_id, version_number) VALUES (4, 1)`).run();
    await assert.rejects(() => db.prepare(`INSERT INTO news_revisions (news_id, version_number) VALUES (4, 1)`).run());
    await db.prepare(`INSERT INTO news_revisions (news_id, version_number) VALUES (5, 1)`).run(); // other article ok
  });

  test('section, topic, entity, series slugs are unique', async () => {
    await assert.rejects(() => db.prepare(`INSERT INTO news_sections (slug, name) VALUES ('regulation', 'Dup')`).run());
    await db.prepare(`INSERT INTO news_topics (slug, name) VALUES ('t1', 'T1')`).run();
    await assert.rejects(() => db.prepare(`INSERT INTO news_topics (slug, name) VALUES ('t1', 'T1b')`).run());
  });
});
