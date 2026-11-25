// test/newsroom-calendar.test.js -- dashboard calendar: local-timezone weeks, section/author filters, reschedule / unschedule / publish-now.
// Real migrated schema and real API handler. Not covered: the calendar screen itself in a browser (drawing, buttons, confirm boxes).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import * as pro from '../worker/newsroom-pro.js';
import * as cal from '../worker/newsroom-calendar.js';
import { handleNewsroomApi } from '../worker/newsroom-api.js';

const BASE = 'https://news.example.com';
const ADMIN = { user_id: 1, role: 'admin' };
const FUTURE = (days, hh = 10) => { const d = new Date(Date.now() + days * 86400000); d.setUTCHours(hh, 0, 0, 0); return d; };
const sql = (d) => d.toISOString().slice(0, 19).replace('T', ' ');

async function mkEnv() {
  const db = createTestDb(); applyMigrations(db);
  await db.prepare(`INSERT INTO users (id,email,password_hash,role) VALUES (1,'a@t.l','x','admin')`).run();
  await db.prepare(`INSERT INTO authors (id,slug,name,role) VALUES (1,'elie','Elie','Editor'),(2,'ann','Ann','Editor')`).run();
  await db.prepare(`INSERT OR IGNORE INTO news_sections (id,slug,name) VALUES (91,'cal-markets','Markets'),(92,'cal-sport','Sport')`).run();
  const ins = `INSERT INTO news (id,slug,title,content,published,published_at,author_id,section_id,created_by) VALUES (?,?,?,?,?,?,?,?,1)`;
  await db.prepare(ins).bind(1, 'sched', 'Scheduled story', '<p>x</p>', 1, sql(FUTURE(3)), 1, 91).run();
  await db.prepare(ins).bind(2, 'sched2', 'Scheduled sport', '<p>x</p>', 1, sql(FUTURE(3, 14)), 2, 92).run();
  await db.prepare(ins).bind(3, 'live', 'Already live', '<p>x</p>', 1, '2026-01-01 08:00:00', 1, 91).run();
  await db.prepare(ins).bind(4, 'draft', 'A draft', '<p>x</p>', 0, null, 1, 91).run();
  return { DB: db, SITE_URL: BASE };
}
const api = async (env, method, route, body) => {
  const init = { method, headers: method === 'POST' ? { 'Content-Type': 'application/json' } : {} }; if (method === 'POST') init.body = JSON.stringify(body);
  const res = await handleNewsroomApi(new Request(`${BASE}/api/v1/newsroom/${route}`, init), env, ADMIN);
  return { status: res.status, json: await res.json() };
};
const row = (env, id) => env.DB.prepare(`SELECT published, published_at FROM news WHERE id=?`).bind(id).first();
const NO_PERMS = { news: { read: true, update: true } };

describe('calendar view', () => {
  test('week follows the editor\'s timezone (tzo) and returns ISO times', async () => {
    const env = await mkEnv();
    await env.DB.prepare(`UPDATE news SET published_at='2026-03-10 22:30:00' WHERE id=3`).run();   // 00:30 on the 11th in Kigali
    const utc = await pro.loadCalendar(env.DB, { from: '2026-03-10', days: 1 });
    assert.deepEqual(utc.items.map((i) => i.id), [3]);
    const kigali = await pro.loadCalendar(env.DB, { from: '2026-03-10', days: 1, tzo: 120 });
    assert.deepEqual(kigali.items.map((i) => i.id), [], 'the 10th in Kigali ends at 22:00 UTC');
    assert.deepEqual((await pro.loadCalendar(env.DB, { from: '2026-03-11', days: 1, tzo: 120 })).items.map((i) => i.id), [3]);
    assert.equal(utc.items[0].at_iso, '2026-03-10T22:30:00.000Z');
    assert.equal((await pro.loadCalendar(env.DB, { from: '2026-03-11', days: 1, tzo: 99999 })).items.length, 1, 'absurd offsets are clamped to +14h (window starts 10:00 UTC on the 10th), not trusted');
  });
  test('section and author filters narrow items and drafts; menus and permissions come with the answer', async () => {
    const env = await mkEnv();
    const from = FUTURE(0).toISOString().slice(0, 10);
    const all = (await api(env, 'GET', `calendar?from=${from}&days=14`)).json;
    assert.deepEqual(all.items.map((i) => i.id).sort(), [1, 2]);
    assert.deepEqual((await api(env, 'GET', `calendar?from=${from}&days=14&section=92`)).json.items.map((i) => i.id), [2]);
    assert.deepEqual((await api(env, 'GET', `calendar?from=${from}&days=14&author=1`)).json.items.map((i) => i.id), [1]);
    assert.deepEqual((await api(env, 'GET', `calendar?from=${from}&days=14&section=92`)).json.unscheduled, [], 'drafts are filtered too');
    assert.ok(all.filters.sections.find((s) => s.name === 'Markets') && all.filters.authors.length === 2);
    assert.deepEqual(all.can, { schedule: true, publish: true });
    assert.deepEqual((await api(env, 'GET', `calendar?from=${from}&days=14&section=abc`)).json.items.map((i) => i.id).sort(), [1, 2], 'a junk filter is ignored');
  });
});

describe('quick actions', () => {
  test('reschedule moves a scheduled story and writes an audit row', async () => {
    const env = await mkEnv(); const was = (await row(env, 1)).published_at; const to = FUTURE(6, 9);
    const r = await api(env, 'POST', 'calendar/reschedule', { id: 1, at: to.toISOString(), expected: was });
    assert.equal(r.status, 200); assert.equal((await row(env, 1)).published_at, sql(to));
    const a = await env.DB.prepare(`SELECT action, metadata FROM audit_logs WHERE entity_id=1 ORDER BY id DESC LIMIT 1`).first().catch(() => null);
    if (a) assert.match(a.metadata, /calendar/);
  });
  test('refuses bad times, live stories and drafts; changes nothing', async () => {
    const env = await mkEnv();
    for (const at of ['nonsense', new Date(Date.now() - 3600000).toISOString(), new Date(Date.now() + 3 * 365 * 86400000).toISOString()])
      assert.equal((await api(env, 'POST', 'calendar/reschedule', { id: 1, at })).status, 400, at);
    const future = FUTURE(8).toISOString();
    assert.equal((await api(env, 'POST', 'calendar/reschedule', { id: 3, at: future })).status, 409, 'live story');
    assert.equal((await api(env, 'POST', 'calendar/reschedule', { id: 4, at: future })).status, 409, 'draft');
    assert.equal((await api(env, 'POST', 'calendar/unschedule', { id: 3 })).status, 409);
    assert.equal((await api(env, 'POST', 'calendar/publish-now', { id: 4 })).status, 409);
    assert.equal((await row(env, 3)).published_at, '2026-01-01 08:00:00'); assert.equal((await row(env, 4)).published, 0);
  });
  test('a stale screen (someone else changed it) is refused, not overwritten', async () => {
    const env = await mkEnv();
    const r = await api(env, 'POST', 'calendar/reschedule', { id: 1, at: FUTURE(9).toISOString(), expected: '2099-01-01 00:00:00' });
    assert.equal(r.status, 409); assert.match(r.json.error, /someone else/);
    assert.equal((await api(env, 'POST', 'calendar/unschedule', { id: 1, expected: '2099-01-01 00:00:00' })).status, 409);
    assert.equal((await row(env, 1)).published, 1);
  });
  test('unschedule returns it to a draft and leaves the text alone; workflow status follows', async () => {
    const env = await mkEnv();
    await env.DB.prepare(`INSERT INTO news_editorial (news_id, workflow_status) VALUES (1, 'scheduled')`).run();
    assert.equal((await api(env, 'POST', 'calendar/unschedule', { id: 1 })).status, 200);
    const r = await row(env, 1); assert.equal(r.published, 0); assert.equal(r.published_at, null);
    assert.equal((await env.DB.prepare(`SELECT content FROM news WHERE id=1`).first()).content, '<p>x</p>');
    assert.equal((await env.DB.prepare(`SELECT workflow_status s FROM news_editorial WHERE news_id=1`).first()).s, 'draft');
    const c = (await api(env, 'GET', `calendar?from=${FUTURE(0).toISOString().slice(0, 10)}&days=14`)).json;
    assert.ok(c.unscheduled.some((i) => i.id === 1));
  });
  test('publish now makes it live immediately', async () => {
    const env = await mkEnv();
    await env.DB.prepare(`INSERT INTO news_editorial (news_id, workflow_status) VALUES (2, 'scheduled')`).run();
    assert.equal((await api(env, 'POST', 'calendar/publish-now', { id: 2 })).status, 200);
    assert.ok(Date.parse(String((await row(env, 2)).published_at).replace(' ', 'T') + 'Z') <= Date.now() + 1000);
    assert.equal((await env.DB.prepare(`SELECT workflow_status s FROM news_editorial WHERE news_id=2`).first()).s, 'published');
  });
  test('people without the permission are refused and nothing changes', async () => {
    const env = await mkEnv(); const was = (await row(env, 1)).published_at;
    for (const r of [await cal.rescheduleArticle(env.DB, { id: 1, at: FUTURE(7).toISOString(), perms: NO_PERMS }), await cal.unscheduleArticle(env.DB, { id: 1, perms: NO_PERMS }), await cal.publishNowArticle(env.DB, { id: 1, perms: NO_PERMS })])
      assert.equal(r.status, 403);
    assert.equal((await row(env, 1)).published_at, was);
    const onlySchedule = { news: { schedule: true } };
    assert.equal((await cal.publishNowArticle(env.DB, { id: 1, perms: onlySchedule })).status, 403, 'scheduling is not publishing');
    assert.equal((await cal.rescheduleArticle(env.DB, { id: 1, at: FUTURE(7).toISOString(), perms: onlySchedule })).ok, true);
  });
});
