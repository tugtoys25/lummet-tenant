// Deleting a news article, generic review or casino that has logged analytics
// events must not fail with a foreign key error (real D1 enforces FKs).
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import * as newsDB from '../worker/database/news.js';
import * as casinosDB from '../worker/database/casinos.js';
import * as genericReviews from '../worker/database/generic-reviews.js';

describe('delete with analytics history (foreign keys ON)', () => {
  let db;
  beforeEach(() => {
    db = createTestDb(); applyMigrations(db);
    db._exec('PRAGMA foreign_keys = ON;');
  });

  test('deleteNews detaches analytics_events and removes the article', async () => {
    const id = (await db.prepare(`INSERT INTO news (slug, title, content) VALUES ('n1','N','body') RETURNING id`).first()).id;
    await db.prepare(`INSERT INTO analytics_events (event_type, news_id) VALUES ('view', ?)`).bind(id).run();
    await newsDB.deleteNews(db, 'n1');
    assert.equal((await db.prepare(`SELECT COUNT(*) n FROM news`).first()).n, 0);
    const ev = await db.prepare(`SELECT news_id FROM analytics_events`).first();
    assert.equal(ev.news_id, null);
  });

  test('deleteCasino detaches analytics_events and removes the casino', async () => {
    const id = (await db.prepare(`INSERT INTO casinos (slug, name, website_url, affiliate_url) VALUES ('c1','C1','https://c','https://c/a') RETURNING id`).first()).id;
    await db.prepare(`INSERT INTO analytics_events (event_type, casino_id) VALUES ('click', ?)`).bind(id).run();
    await casinosDB.deleteCasino(db, 'c1');
    assert.equal((await db.prepare(`SELECT COUNT(*) n FROM casinos`).first()).n, 0);
    assert.equal((await db.prepare(`SELECT casino_id FROM analytics_events`).first()).casino_id, null);
  });

  test('deleting a missing slug is a no-op', async () => {
    await newsDB.deleteNews(db, 'nope');
    await casinosDB.deleteCasino(db, 'nope');
  });
});
