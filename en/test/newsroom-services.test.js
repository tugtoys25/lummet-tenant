// test/newsroom-services.test.js -- Stage B services (worker/database/newsroom.js)
// Real migrations, real SQL, in-memory SQLite via the D1 shim.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import * as nr from '../worker/database/newsroom.js';

const ADMIN = null;                                            // getPermissionsForUser: null = all allowed
const EDITOR = { news: { create: true, read: true, update: true } }; // seeded editor grants
const NOBODY = {};
const actor = { user_id: 1 };

async function setup() {
  const db = createTestDb(); applyMigrations(db);
  await db.prepare(`INSERT INTO users (id, email, password_hash, role) VALUES (1,'a@test.local','x','admin')`).run();
  await db.prepare(`INSERT INTO authors (id, slug, name, role) VALUES (1,'elie','Elie','editor')`).run();
  await db.prepare(`INSERT INTO news (id, slug, title, content, published, author_id, created_by) VALUES (10,'live-one','Live One','<p>x</p>',1,1,1)`).run();
  await db.prepare(`INSERT INTO news (id, slug, title, content, published, author_id, created_by) VALUES (11,'draft-one','Draft One','<p>y</p>',0,1,1)`).run();
  return db;
}

describe('URL validation (XSS / SSRF / credentials)', () => {
  const bad = ['javascript:alert(1)', 'data:text/html,<script>1</script>', 'file:///etc/passwd', 'ftp://x.com/a',
    'https://user:pw@example.com/', 'http://localhost/admin', 'http://127.0.0.1/', 'http://10.0.0.5/', 'http://192.168.1.1/',
    'http://172.16.0.1/', 'http://169.254.169.254/latest/meta-data', 'http://[::1]/', 'http://[fd00::1]/', 'http://db.internal/',
    'not a url', 'https://' + 'a'.repeat(2100) + '.com'];
  for (const u of bad) test(`rejects ${u.slice(0, 40)}`, () => assert.equal(nr.validatePublicUrl(u).ok, false));

  test('accepts normal https/http and empty', () => {
    assert.equal(nr.validatePublicUrl('https://www.gamblingcommission.gov.uk/x?y=1').ok, true);
    assert.equal(nr.validatePublicUrl('http://example.com').ok, true);
    assert.deepEqual(nr.validatePublicUrl(''), { ok: true, value: null });
    assert.deepEqual(nr.validatePublicUrl(null), { ok: true, value: null });
  });
});

describe('sources', () => {
  let db; beforeEach(async () => { db = await setup(); });

  test('needs manage_sources: editor is refused, admin allowed', async () => {
    const s = [{ source_name: 'Regulator', source_type: 'regulator', source_url: 'https://example.gov/doc' }];
    assert.equal((await nr.replaceArticleSources(db, { newsId: 10, sources: s, actor, perms: EDITOR })).status, 403);
    assert.equal((await nr.replaceArticleSources(db, { newsId: 10, sources: s, actor, perms: NOBODY })).status, 403);
    assert.equal((await nr.replaceArticleSources(db, { newsId: 10, sources: s, actor, perms: ADMIN })).ok, true);
  });

  test('one invalid source rejects the whole update and leaves the old list intact', async () => {
    const good = [{ source_name: 'A', source_type: 'research', source_url: 'https://a.example/x' }];
    await nr.replaceArticleSources(db, { newsId: 10, sources: good, actor, perms: ADMIN });
    const r = await nr.replaceArticleSources(db, { newsId: 10, actor, perms: ADMIN,
      sources: [{ source_name: 'B', source_url: 'https://b.example' }, { source_name: 'Evil', source_url: 'javascript:alert(1)' }] });
    assert.equal(r.status, 400);
    const rows = await nr.getPublicSources(db, 10);
    assert.deepEqual(rows.map(x => x.source_name), ['A']);
  });

  test('bad type, missing name, oversize list are rejected; HTML is stripped from text', async () => {
    assert.equal((await nr.replaceArticleSources(db, { newsId: 10, actor, perms: ADMIN, sources: [{ source_name: 'x', source_type: 'bogus' }] })).status, 400);
    assert.equal((await nr.replaceArticleSources(db, { newsId: 10, actor, perms: ADMIN, sources: [{ source_name: '  ' }] })).status, 400);
    assert.equal((await nr.replaceArticleSources(db, { newsId: 10, actor, perms: ADMIN, sources: new Array(51).fill({ source_name: 'x' }) })).status, 400);
    await nr.replaceArticleSources(db, { newsId: 10, actor, perms: ADMIN, sources: [{ source_name: '<img src=x onerror=alert(1)>Body', description: '<script>1</script>ok' }] });
    const [row] = await nr.getPublicSources(db, 10);
    assert.equal(row.source_name, 'Body');
    assert.equal(row.description, '1ok'); // tags removed, inert text kept (renderer must still escape)
    assert.ok(!/[<>]/.test(row.source_name + row.description));
  });

  test('SQL-injection strings are stored inertly', async () => {
    await nr.replaceArticleSources(db, { newsId: 10, actor, perms: ADMIN, sources: [{ source_name: "x'); DROP TABLE news;--" }] });
    assert.equal((await db.prepare(`SELECT COUNT(*) c FROM news`).first()).c, 2);
  });

  test('public loader exposes only public columns and preserves order', async () => {
    await nr.replaceArticleSources(db, { newsId: 10, actor, perms: ADMIN, sources: [{ source_name: 'One' }, { source_name: 'Two' }] });
    const rows = await nr.getPublicSources(db, 10);
    assert.deepEqual(rows.map(r => r.source_name), ['One', 'Two']);
    assert.deepEqual(Object.keys(rows[0]).sort(), ['author', 'description', 'source_date', 'source_name', 'source_type', 'source_url']);
  });

  test('audit rows written for add and remove', async () => {
    await nr.replaceArticleSources(db, { newsId: 10, actor, perms: ADMIN, sources: [{ source_name: 'One' }] });
    await nr.replaceArticleSources(db, { newsId: 10, actor, perms: ADMIN, sources: [] });
    const a = (await db.prepare(`SELECT action FROM audit_logs ORDER BY id`).all()).results.map(r => r.action);
    assert.deepEqual(a, ['source_added', 'source_removed']);
  });
});

describe('revisions', () => {
  let db; beforeEach(async () => { db = await setup(); });
  const before = { title: 'A', content: '<p>old body</p>', slug: 's', published: 1 };

  test('no tracked change -> no revision', async () => {
    assert.equal(await nr.recordRevision(db, { newsId: 10, before, after: { ...before } }), null);
    assert.equal((await db.prepare(`SELECT COUNT(*) c FROM news_revisions`).first()).c, 0);
  });

  test('records field-level diff with incrementing versions', async () => {
    const v1 = await nr.recordRevision(db, { newsId: 10, changedBy: 1, before, after: { ...before, title: 'B' }, summary: 'retitle' });
    const v2 = await nr.recordRevision(db, { newsId: 10, changedBy: 1, before: { ...before, title: 'B' }, after: { ...before, title: 'C' } });
    assert.deepEqual([v1, v2], [1, 2]);
    const r = await nr.getRevision(db, 10, 1, ADMIN);
    assert.deepEqual(r.changed_fields, ['title']);
    assert.deepEqual(r.previous_values, { title: 'A' });
    assert.deepEqual(r.new_values, { title: 'B' });
    assert.equal(r.change_summary, 'retitle');
  });

  test('body: previous stored in full, new stored as a length marker only', async () => {
    await nr.recordRevision(db, { newsId: 10, before, after: { ...before, content: '<p>new body!</p>' } });
    const r = await nr.getRevision(db, 10, 1, ADMIN);
    assert.equal(r.previous_values.content, '<p>old body</p>');
    assert.deepEqual(r.new_values.content, { length: '<p>new body!</p>'.length });
  });

  test('untracked fields are ignored; other articles version independently', async () => {
    assert.equal(await nr.recordRevision(db, { newsId: 10, before: { ...before, tags: 'a' }, after: { ...before, tags: 'b' } }), null);
    await nr.recordRevision(db, { newsId: 10, before, after: { ...before, title: 'X' } });
    assert.equal(await nr.recordRevision(db, { newsId: 11, before, after: { ...before, title: 'X' } }), 1);
  });

  test('a concurrent version collision is retried, not lost', async () => {
    let injected = false;
    const flaky = { prepare: (sql) => {
      const st = db.prepare(sql);
      if (!injected && /INSERT INTO news_revisions/.test(sql)) {
        injected = true;
        return { bind: (...p) => ({ run: async () => { // another editor wins version 1 first
          await db.prepare(`INSERT INTO news_revisions (news_id, version_number) VALUES (10, 1)`).run();
          return st.bind(...p).run(); } }) };
      }
      return st;
    } };
    assert.equal(await nr.recordRevision(flaky, { newsId: 10, before, after: { ...before, title: 'Z' } }), 2);
  });

  test('viewing history requires news.read', async () => {
    await nr.recordRevision(db, { newsId: 10, before, after: { ...before, title: 'Q' } });
    assert.equal(await nr.listRevisions(db, 10, NOBODY), null);
    assert.equal(await nr.getRevision(db, 10, 1, NOBODY), null);
    assert.equal((await nr.listRevisions(db, 10, EDITOR)).length, 1);
  });
});

describe('corrections', () => {
  let db; beforeEach(async () => { db = await setup(); });

  test('editor cannot correct or retract; admin can', async () => {
    const p = { newsId: 10, type: 'correction', message: 'Fixed a figure.', actor };
    assert.equal((await nr.addCorrection(db, { ...p, perms: EDITOR })).status, 403);
    assert.equal((await nr.addCorrection(db, { ...p, type: 'retraction', perms: EDITOR })).status, 403);
    assert.equal((await nr.addCorrection(db, { ...p, perms: ADMIN })).ok, true);
  });

  test('validates type, message, article; strips markup', async () => {
    assert.equal((await nr.addCorrection(db, { newsId: 10, type: 'nope', message: 'x', actor, perms: ADMIN })).status, 400);
    assert.equal((await nr.addCorrection(db, { newsId: 10, type: 'correction', message: '  ', actor, perms: ADMIN })).status, 400);
    assert.equal((await nr.addCorrection(db, { newsId: 999, type: 'correction', message: 'x', actor, perms: ADMIN })).status, 404);
    await nr.addCorrection(db, { newsId: 10, type: 'clarification', message: '<script>x</script>Clarified.', actor, perms: ADMIN });
    const [c] = await nr.getPublicCorrections(db, 10);
    assert.equal(c.public_message, 'xClarified.');
  });

  test('public loader never returns created_by; audit action recorded', async () => {
    await nr.addCorrection(db, { newsId: 10, type: 'retraction', message: 'Withdrawn.', actor, perms: ADMIN });
    const [c] = await nr.getPublicCorrections(db, 10);
    assert.deepEqual(Object.keys(c).sort(), ['created_at', 'public_message', 'type']);
    assert.equal((await db.prepare(`SELECT action FROM audit_logs`).first()).action, 'article_retracted');
  });
});

describe('workflow', () => {
  let db; beforeEach(async () => { db = await setup(); });

  test('legacy articles get an effective status from `published`, with no editorial row created', async () => {
    assert.equal(await nr.getEffectiveStatus(db, 10), 'published');
    assert.equal(await nr.getEffectiveStatus(db, 11), 'draft');
    assert.equal((await db.prepare(`SELECT COUNT(*) c FROM news_editorial`).first()).c, 0);
    assert.equal(await nr.getEffectiveStatus(db, 999), null);
  });

  test('transition table: illegal jumps are rejected', () => {
    assert.equal(nr.canTransition('draft', 'editorial_review'), true);
    assert.equal(nr.canTransition('editorial_review', 'fact_check'), true);
    assert.equal(nr.canTransition('draft', 'retracted'), false);
    assert.equal(nr.canTransition('idea', 'published'), false);
    assert.equal(nr.canTransition('retracted', 'published'), false);
    assert.equal(nr.canTransition('draft', 'bogus'), false);
  });

  test('editor may submit for review but cannot fact-check, approve, or publish', async () => {
    const t = (to, perms) => nr.transitionWorkflow(db, { newsId: 11, to, actor, perms });
    assert.equal((await t('editorial_review', EDITOR)).ok, true);
    assert.equal((await t('fact_check', EDITOR)).status, 403);
    assert.equal((await t('approved', EDITOR)).status, 403);
    assert.equal((await t('published', EDITOR)).status, 409); // review -> published is not a legal jump
    assert.equal((await t('approved', ADMIN)).ok, true);
    assert.equal((await t('published', EDITOR)).status, 403);
    // still unpublished after all the refused attempts
    assert.equal((await db.prepare(`SELECT published p FROM news WHERE id=11`).first()).p, 0);
  });

  test('publishing sets published/published_at, stamps the actor, audits', async () => {
    const r = await nr.transitionWorkflow(db, { newsId: 11, to: 'published', actor: { user_id: 1 }, perms: ADMIN });
    assert.equal(r.ok, true);
    const n = await db.prepare(`SELECT published, published_at FROM news WHERE id=11`).first();
    assert.equal(n.published, 1); assert.ok(n.published_at);
    assert.equal((await db.prepare(`SELECT published_by FROM news_editorial WHERE news_id=11`).first()).published_by, 1);
    assert.ok((await db.prepare(`SELECT action FROM audit_logs`).all()).results.some(a => a.action === 'article_published'));
  });

  test('retraction and archive do NOT unpublish (URL must keep returning the page)', async () => {
    await nr.transitionWorkflow(db, { newsId: 10, to: 'retracted', actor, perms: ADMIN });
    assert.equal((await db.prepare(`SELECT published p FROM news WHERE id=10`).first()).p, 1);
    await nr.transitionWorkflow(db, { newsId: 10, to: 'archived', actor, perms: ADMIN });
    assert.equal((await db.prepare(`SELECT published p FROM news WHERE id=10`).first()).p, 1);
  });

  test('explicit unpublish (published -> draft) is audited as article_unpublished', async () => {
    await nr.transitionWorkflow(db, { newsId: 10, to: 'draft', actor, perms: ADMIN });
    assert.equal((await db.prepare(`SELECT published p FROM news WHERE id=10`).first()).p, 0);
    assert.ok((await db.prepare(`SELECT action FROM audit_logs`).all()).results.some(a => a.action === 'article_unpublished'));
  });

  test('scheduling requires a future date and needs schedule permission', async () => {
    assert.equal((await nr.transitionWorkflow(db, { newsId: 11, to: 'scheduled', actor, perms: ADMIN })).status, 400);
    assert.equal((await nr.transitionWorkflow(db, { newsId: 11, to: 'scheduled', actor, perms: ADMIN, scheduledAt: '2000-01-01T00:00:00Z' })).status, 400);
    assert.equal((await nr.transitionWorkflow(db, { newsId: 11, to: 'scheduled', actor, perms: EDITOR, scheduledAt: '2099-01-01T00:00:00Z' })).status, 403);
    assert.equal((await nr.transitionWorkflow(db, { newsId: 11, to: 'scheduled', actor, perms: ADMIN, scheduledAt: '2099-01-01T00:00:00Z' })).ok, true);
    assert.equal((await db.prepare(`SELECT published_at pa FROM news WHERE id=11`).first()).pa, '2099-01-01 00:00:00');
  });

  test('fact check needs permission and validates status; notes stay internal', async () => {
    assert.equal((await nr.setFactCheck(db, { newsId: 10, status: 'fact_checked', actor, perms: EDITOR })).status, 403);
    assert.equal((await nr.setFactCheck(db, { newsId: 10, status: 'bogus', actor, perms: ADMIN })).status, 400);
    await nr.setFactCheck(db, { newsId: 10, status: 'fact_checked', notes: 'secret note', actor, perms: ADMIN });
    assert.equal((await nr.getEditorialState(db, 10, ADMIN)).fact_check_notes, 'secret note');
    assert.equal(await nr.getEditorialState(db, 10, NOBODY), null);
    const pub = JSON.stringify(await nr.loadArticleExtras(db, { id: 10, section_id: null }));
    assert.ok(!pub.includes('secret note'));
  });
});

describe('taxonomy slugs cannot shadow existing article URLs', () => {
  let db; beforeEach(async () => { db = await setup(); });

  test('rejects article slugs, region slugs, reserved words, duplicates, bad format', async () => {
    const t = (slug) => nr.assertSectionSlugFree(db, slug);
    assert.equal((await t('live-one')).ok, false);   // existing article
    assert.equal((await t('europe')).ok, false);      // seeded region
    assert.equal((await t('regulation')).ok, false);  // seeded section
    assert.equal((await t('search')).ok, false);      // reserved
    assert.equal((await t('Bad Slug')).ok, false);
    assert.equal((await t('fresh-topic')).ok, true);
  });

  test('createSection enforces permission, name and collision rules', async () => {
    assert.equal((await nr.createSection(db, { name: 'X', actor, perms: EDITOR })).status, 403);
    assert.equal((await nr.createSection(db, { name: '', actor, perms: ADMIN })).status, 400);
    assert.equal((await nr.createSection(db, { name: 'Live One', actor, perms: ADMIN })).status, 409);
    const ok = await nr.createSection(db, { name: 'Gaming Tech & AI', actor, perms: ADMIN });
    assert.equal(ok.ok, true); assert.equal(ok.slug, 'gaming-tech-and-ai');
  });
});

describe('graceful degradation (Phase 51)', () => {
  test('loadArticleExtras returns empty extras if every query throws', async () => {
    const broken = { prepare: () => { throw new Error('D1 down'); } };
    const origErr = console.error; console.error = () => {};
    try {
      const x = await nr.loadArticleExtras(broken, { id: 1, section_id: 2, article_type: 'live' });
      assert.deepEqual(x, { sources: [], corrections: [], timeline: [], section: null });
    } finally { console.error = origErr; }
  });

  test('flag reader fails closed', async () => {
    const origErr = console.error; console.error = () => {};
    try { assert.equal(await nr.isNewsFlagEnabled({ prepare: () => { throw new Error('x'); } }, 'news_v2_homepage'), false); }
    finally { console.error = origErr; }
  });

  test('flags read from system_settings; seeded value is off, "true" turns on', async () => {
    const db = await setup();
    assert.equal(await nr.isNewsFlagEnabled(db, 'news_v2_homepage'), false);
    await db.prepare(`UPDATE system_settings SET value='true' WHERE key='news_v2_homepage'`).run();
    assert.equal(await nr.isNewsFlagEnabled(db, 'news_v2_homepage'), true);
    assert.equal(await nr.isNewsFlagEnabled(db, 'does_not_exist'), false);
  });

  test('timeline loader shows author display name, never user data', async () => {
    const db = await setup();
    await db.prepare(`INSERT INTO news_timeline_updates (news_id, update_time, body, editor_id) VALUES (10,'2026-09-19 10:00:00','Update 1',1)`).run();
    const [t] = await nr.getPublicTimeline(db, 10);
    assert.deepEqual(Object.keys(t).sort(), ['body', 'editor_name', 'update_time']);
    assert.equal(t.editor_name, 'Elie');
  });
});
