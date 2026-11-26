// test/newsroom-planner.test.js -- calendar month window, planned drafts, new story from the calendar, embargo, bulk edits, autosave script.
// Real migrated schema and the real API handler. Not covered: dragging and the forms in a browser.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import * as pro from '../worker/newsroom-pro.js';
import * as cal from '../worker/newsroom-calendar.js';
import * as planner from '../worker/newsroom-planner.js';
import * as nr from '../worker/database/newsroom.js';
import { handleNewsroomApi } from '../worker/newsroom-api.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://news.example.com';
const ADMIN = { user_id: 1, role: 'admin' };
const FUTURE = (days, hh = 10) => { const d = new Date(Date.now() + days * 86400000); d.setUTCHours(hh, 0, 0, 0); return d; };
const sql = (d) => d.toISOString().slice(0, 19).replace('T', ' ');

async function mkEnv() {
  const db = createTestDb(); applyMigrations(db);
  await db.prepare(`INSERT INTO users (id,email,password_hash,role) VALUES (1,'a@t.l','x','admin')`).run();
  await db.prepare(`INSERT INTO authors (id,slug,name,role) VALUES (1,'elie','Elie','Editor')`).run();
  await db.prepare(`INSERT OR IGNORE INTO news_sections (id,slug,name) VALUES (91,'pl-markets','Markets'),(92,'pl-sport','Sport')`).run();
  await db.prepare(`INSERT OR IGNORE INTO news_topics (id,slug,name,active) VALUES (81,'pl-topic','Topic',1)`).run();
  const ins = `INSERT INTO news (id,slug,title,content,published,published_at,author_id,section_id,created_by) VALUES (?,?,?,?,?,?,?,?,1)`;
  await db.prepare(ins).bind(1, 'sched', 'Scheduled', '<p>x</p>', 1, sql(FUTURE(3)), 1, 91).run();
  await db.prepare(ins).bind(2, 'draft', 'A draft', '<p>x</p>', 0, null, 1, 91).run();
  await db.prepare(ins).bind(3, 'draft2', 'Another draft', '<p>x</p>', 0, null, 1, 91).run();
  return { DB: db, SITE_URL: BASE };
}
const api = async (env, method, route, body) => {
  const init = { method, headers: method === 'POST' ? { 'Content-Type': 'application/json' } : {} }; if (method === 'POST') init.body = JSON.stringify(body);
  const res = await handleNewsroomApi(new Request(`${BASE}/api/v1/newsroom/${route}`, init), env, ADMIN);
  return { status: res.status, json: await res.json() };
};
const NO_PERMS = { news: { read: true } };

describe('month window and planned drafts', () => {
  test('the calendar can return a 6-week month grid (42 days), not more', async () => {
    const env = await mkEnv();
    assert.equal((await pro.loadCalendar(env.DB, { from: '2026-11-30', days: 42 })).days, 42);
    assert.equal((await pro.loadCalendar(env.DB, { from: '2026-11-30', days: 400 })).days, 42);
    assert.equal((await pro.loadCalendar(env.DB, { from: '2026-11-30' })).days, 7, 'the week view is unchanged');
  });
  test('a planned draft shows on its day, stays unpublished, and can be moved or cleared', async () => {
    const env = await mkEnv(); const at = FUTURE(5, 9);
    const r = await api(env, 'POST', 'calendar/plan', { id: 2, at: at.toISOString() });
    assert.equal(r.status, 200);
    const from = at.toISOString().slice(0, 10);
    const view = (await api(env, 'GET', `calendar?from=${from}&days=1`)).json;
    assert.deepEqual(view.planned.map((p) => p.id), [2]);
    assert.equal(view.planned[0].planned_iso, at.toISOString());
    assert.deepEqual(view.plan_can, { create: true, update: true });
    assert.deepEqual(view.can, { schedule: true, publish: true }, 'the existing permissions shape is untouched');
    assert.equal((await env.DB.prepare(`SELECT published FROM news WHERE id=2`).first()).published, 0, 'planning never publishes');
    assert.equal((await api(env, 'POST', 'calendar/plan', { id: 2, at: null })).status, 200);
    assert.equal((await api(env, 'GET', `calendar?from=${from}&days=1`)).json.planned.length, 0);
  });
  test('a published or scheduled story cannot be planned; a bad date is refused', async () => {
    const env = await mkEnv();
    assert.equal((await api(env, 'POST', 'calendar/plan', { id: 1, at: FUTURE(5).toISOString() })).status, 409);
    assert.equal((await api(env, 'POST', 'calendar/plan', { id: 2, at: 'nonsense' })).status, 400);
    assert.equal((await planner.setPlan(env.DB, { id: 2, at: FUTURE(5).toISOString(), actor: ADMIN, perms: NO_PERMS })).status, 403);
  });
});

describe('new story from the calendar', () => {
  test('creates an empty unpublished draft with a planned day, in the chosen section', async () => {
    const env = await mkEnv(); const at = FUTURE(7, 9).toISOString();
    const r = await api(env, 'POST', 'calendar/create', { title: 'Budget day preview', at, section_id: 92 });
    assert.equal(r.status, 200);
    const n = await env.DB.prepare(`SELECT title, published, section_id, slug FROM news WHERE id=?`).bind(r.json.id).first();
    assert.equal(n.title, 'Budget day preview'); assert.equal(n.published, 0); assert.equal(n.section_id, 92); assert.match(n.slug, /^budget-day-preview-/);
    const p = await env.DB.prepare(`SELECT planned_at FROM news_plan WHERE news_id=?`).bind(r.json.id).first();
    assert.equal(new Date(p.planned_at.replace(' ', 'T') + 'Z').toISOString(), at);
  });
  test('short titles and missing permission are refused; markup is stripped', async () => {
    const env = await mkEnv();
    assert.equal((await api(env, 'POST', 'calendar/create', { title: 'ab' })).status, 400);
    assert.equal((await planner.createPlanned(env.DB, { title: 'Fine title', actor: ADMIN, perms: NO_PERMS })).status, 403);
    const r = await api(env, 'POST', 'calendar/create', { title: '<b>Bold</b> idea' });
    assert.equal((await env.DB.prepare(`SELECT title FROM news WHERE id=?`).bind(r.json.id).first()).title, 'Bold idea');
  });
});

describe('embargo', () => {
  test('set, read back, and lift', async () => {
    const env = await mkEnv(); const until = FUTURE(2).toISOString();
    assert.equal((await api(env, 'POST', 'embargo/save', { id: 2, until, note: 'Press release' })).status, 200);
    assert.deepEqual((await api(env, 'GET', 'embargo/get?id=2')).json.embargo, { until, note: 'Press release' });
    assert.equal((await api(env, 'POST', 'embargo/save', { id: 2, until: null })).status, 200);
    assert.equal((await api(env, 'GET', 'embargo/get?id=2')).json.embargo, null);
    assert.equal((await api(env, 'POST', 'embargo/save', { id: 2, until: new Date(Date.now() - 1000).toISOString() })).status, 400, 'must be in the future');
  });
  test('blocks the workflow from publishing or scheduling before the embargo', async () => {
    const env = await mkEnv();
    await env.DB.prepare(`UPDATE system_settings SET value='true' WHERE key='news_editorial_workflow'`).run(); nr.resetNewsFlagCache();
    await env.DB.prepare(`INSERT INTO news_embargo (news_id, until_at) VALUES (2, ?)`).bind(sql(FUTURE(3))).run();
    await env.DB.prepare(`INSERT OR IGNORE INTO news_editorial (news_id) VALUES (2)`).run();
    await env.DB.prepare(`UPDATE news_editorial SET workflow_status='approved' WHERE news_id=2`).run();
    const early = await api(env, 'POST', 'workflow/transition', { id: 2, to: 'published' });
    assert.equal(early.status, 409); assert.match(early.json.error, /embargoed until/);
    const sched = await api(env, 'POST', 'workflow/transition', { id: 2, to: 'scheduled', scheduled_at: FUTURE(1).toISOString() });
    assert.equal(sched.status, 409, 'a schedule time before the embargo is refused');
    assert.equal((await env.DB.prepare(`SELECT published FROM news WHERE id=2`).first()).published, 0, 'nothing went live');
  });
  test('blocks calendar reschedule and publish-now, and a lapsed embargo blocks nothing', async () => {
    const env = await mkEnv();
    await env.DB.prepare(`INSERT INTO news_embargo (news_id, until_at) VALUES (1, ?)`).bind(sql(FUTURE(6))).run();
    const r = await api(env, 'POST', 'calendar/reschedule', { id: 1, at: FUTURE(4).toISOString() });
    assert.equal(r.status, 409); assert.match(r.json.error, /embargoed/);
    assert.equal((await api(env, 'POST', 'calendar/publish-now', { id: 1 })).status, 409);
    assert.equal((await api(env, 'POST', 'calendar/reschedule', { id: 1, at: FUTURE(8).toISOString() })).status, 200, 'after the embargo is fine');
    await env.DB.prepare(`UPDATE news_embargo SET until_at = ? WHERE news_id = 1`).bind(sql(new Date(Date.now() - 60000))).run();
    assert.equal((await api(env, 'POST', 'calendar/publish-now', { id: 1 })).status, 200, 'a lapsed embargo blocks nothing');
  });
  test('the embargo check never throws when the table is missing', async () => {
    const { embargoBlock } = await import('../worker/newsroom-embargo.js');
    assert.equal(await embargoBlock({ prepare() { throw new Error('no table'); } }, 1), null);
  });
});

describe('bulk edits', () => {
  test('sets a section for several stories at once, keeps history, reports per-story failures', async () => {
    const env = await mkEnv();
    const r = await api(env, 'POST', 'bulk/apply', { ids: [2, 3, 999], action: 'section', value: 92 });
    assert.equal(r.status, 200); assert.deepEqual(r.json.done.sort(), [2, 3]); assert.equal(r.json.failed[0].id, 999);
    assert.deepEqual((await env.DB.prepare(`SELECT section_id FROM news WHERE id IN (2,3)`).all()).results.map((x) => x.section_id), [92, 92]);
    assert.ok((await env.DB.prepare(`SELECT COUNT(*) c FROM news_revisions WHERE news_id IN (2,3)`).first()).c >= 2, 'each change is in the revision history');
  });
  test('adds and removes a topic; unknown topic and unknown action are refused', async () => {
    const env = await mkEnv();
    assert.deepEqual((await api(env, 'POST', 'bulk/apply', { ids: [2, 3], action: 'topic_add', value: 81 })).json.done.sort(), [2, 3]);
    assert.equal((await env.DB.prepare(`SELECT COUNT(*) c FROM news_article_topics WHERE topic_id=81`).first()).c, 2);
    assert.deepEqual((await api(env, 'POST', 'bulk/apply', { ids: [2], action: 'topic_remove', value: 81 })).json.done, [2]);
    assert.equal((await env.DB.prepare(`SELECT COUNT(*) c FROM news_article_topics WHERE topic_id=81`).first()).c, 1);
    assert.equal((await api(env, 'POST', 'bulk/apply', { ids: [2], action: 'topic_add', value: 5555 })).json.failed.length, 1);
    assert.equal((await api(env, 'POST', 'bulk/apply', { ids: [2], action: 'delete' })).status, 400, 'there is no bulk delete');
  });
  test('needs ids, caps the batch at 100, and a bulk embargo blocks publishing', async () => {
    const env = await mkEnv();
    assert.equal((await api(env, 'POST', 'bulk/apply', { ids: [], action: 'section', value: 91 })).status, 400);
    assert.equal((await api(env, 'POST', 'bulk/apply', { ids: Array.from({ length: 101 }, (_, i) => i + 1), action: 'section', value: 91 })).status, 400);
    const r = await api(env, 'POST', 'bulk/apply', { ids: [2, 3], action: 'embargo', value: FUTURE(4).toISOString() });
    assert.deepEqual(r.json.done.sort(), [2, 3]);
    assert.ok(await planner.getEmbargo(env.DB, 3));
  });
});

describe('browser scripts', () => {
  test('news form autosave is in the news script and keeps data on this device only', () => {
    const js = readFileSync(join(ROOT, 'static/js/admin/news.js'), 'utf8');
    assert.match(js, /NEWS FORM AUTOSAVE/); assert.match(js, /newsAutosave:/); assert.match(js, /beforeunload/);
    assert.ok(!/fetch\([^)]*autosave/i.test(js), 'nothing is sent to the server by autosave');
  });
  test('the admin bundle has the month view, drag and drop, bulk tab and embargo', () => {
    const js = readFileSync(join(ROOT, 'static/js/newsroom-admin.js'), 'utf8');
    for (const s of ['calendar/plan', 'calendar/create', 'bulk/apply', 'embargo/save', 'dragstart', 'state.calView']) assert.ok(js.includes(s), s);
    assert.match(readFileSync(join(ROOT, 'templates/pages/admin/newsroom.html'), 'utf8'), /data-nr-tab="bulk"/);
  });
});
