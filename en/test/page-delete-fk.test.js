// Deleting a page that has analytics rows used to fail with SQLITE_CONSTRAINT_FOREIGNKEY, because
// analytics_events.page_id REFERENCES pages(id) with no ON DELETE action.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { createPage, deletePage, getPage } from '../worker/database/pages.js';

let db;
beforeEach(() => { db = createTestDb(); applyMigrations(db); });

const mk = (slug) => createPage(db, { slug, type: 'page', template: 'default', title: slug, seo_title: slug, seo_description: slug });
const event = async (pageId) => db.prepare("INSERT INTO analytics_events (event_type, page_id) VALUES ('page_view', ?)").bind(pageId).run();

describe('deletePage', () => {
  test('deletes a page that has no analytics', async () => {
    await mk('about-us');
    await deletePage(db, 'about-us');
    assert.equal(await getPage(db, 'about-us'), null);
  });

  test('deletes a page that analytics events point at, and keeps the events', async () => {
    await mk('about-us');
    const { id } = await getPage(db, 'about-us');
    await event(id); await event(id);
    await deletePage(db, 'about-us');
    assert.equal(await getPage(db, 'about-us'), null);
    const rows = (await db.prepare("SELECT page_id FROM analytics_events").all()).results;
    assert.equal(rows.length, 2);
    assert.ok(rows.every((r) => r.page_id === null));
  });

  test("leaves other pages' analytics alone", async () => {
    await mk('a'); await mk('b');
    const a = await getPage(db, 'a'), b = await getPage(db, 'b');
    await event(a.id); await event(b.id);
    await deletePage(db, 'a');
    const rows = (await db.prepare("SELECT page_id FROM analytics_events ORDER BY id").all()).results;
    assert.deepEqual(rows.map((r) => r.page_id), [null, b.id]);
  });

  test('unknown slug is a harmless no-op', async () => {
    await deletePage(db, 'nope');
  });
});
