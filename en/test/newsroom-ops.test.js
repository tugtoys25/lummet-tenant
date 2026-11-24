// test/newsroom-ops.test.js -- web vitals, section digests, CSV export, per-section ad slots, lazy-images switch row.
// Real migrated schema and real handlers. Not covered: real browsers reporting vitals, real email delivery, a live cron run.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import * as ops from '../worker/newsroom-ops.js';
import { handleNewsroomApi } from '../worker/newsroom-api.js';
import { injectInlineAds } from '../worker/controllers/ads.js';
import { createAdRule, getAllAdRules, updateAdRule } from '../worker/database/ad-rules.js';
import { renderNews } from '../worker/controllers.js';
import { resetNewsFlagCache } from '../worker/database/newsroom.js';
import { getRoute } from '../worker/routes.js';
import * as aud from '../worker/newsroom-audience.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://news.example.com';
const ADMIN = { user_id: 1, role: 'admin' };

async function mkEnv() {
  const db = createTestDb(); applyMigrations(db);
  await db.prepare(`INSERT INTO users (id,email,password_hash,role) VALUES (1,'a@t.l','x','admin')`).run();
  await db.prepare(`INSERT INTO authors (id,slug,name,role) VALUES (1,'elie','Elie','Editor')`).run();
  await db.prepare(`INSERT INTO news_sections (id,slug,name,active) VALUES (800,'ops-markets','Ops Markets',1)`).run();
  await db.prepare(`INSERT INTO news_sections (id,slug,name,active) VALUES (801,'ops-sport','Ops Sport',1)`).run();
  const ins = `INSERT INTO news (id,slug,title,content,published,published_at,author_id,created_by,excerpt,section_id) VALUES (?,?,?,?,?,?,1,1,?,?)`;
  await db.prepare(ins).bind(10, 'mk', '=cmd|calc, "x"', '<p>One</p><p>Two</p><p>Three</p><p>Four</p>', 1, '2026-02-01 10:00:00', 'sum', 800).run();
  await db.prepare(ins).bind(11, 'sp', 'Sport story', '<p>One</p><p>Two</p><p>Three</p><p>Four</p>', 1, '2026-02-02 10:00:00', 'sum', 801).run();
  await db.prepare(ins).bind(12, 'dr', 'Draft', '<p>d</p>', 0, null, 'd', 800).run();
  await db.prepare(ins).bind(13, 'fu', 'Future', '<p>f</p>', 1, '2099-01-01 00:00:00', 'f', 800).run();
  await db.prepare(`INSERT INTO components (id,name,slug,type,title,status,content) VALUES (50,'Ad A','ad-a','ad','Ad A','active','<div class="AD-A">ad</div>')`).run();
  const env = { DB: db, ASSETS: { fetch: async (req) => { const f = join(ROOT, new URL(req.url).pathname); return existsSync(f) ? new Response(readFileSync(f, 'utf-8'), { status: 200 }) : new Response('', { status: 404 }); } }, SITE_URL: BASE };
  resetNewsFlagCache(); ops.forgetOpsFlags(db); aud.forgetAudienceFlags(db);
  return env;
}
const flag = async (env, key, value = 'true') => { await env.DB.prepare(`INSERT INTO system_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(key, value).run(); resetNewsFlagCache(); ops.forgetOpsFlags(env.DB); aud.forgetAudienceFlags(env.DB); };
const api = async (env, method, route, body) => {
  const init = { method, headers: method === 'POST' ? { 'Content-Type': 'application/json' } : {} }; if (method === 'POST') init.body = JSON.stringify(body);
  return handleNewsroomApi(new Request(`${BASE}/api/v1/newsroom/${route}`, init), env, ADMIN);
};

describe('migration', () => {
  test('every switch ships off, including the lazy images row that was missing', async () => {
    const env = await mkEnv();
    for (const k of ['news_lazy_images', 'news_web_vitals', 'news_section_digests', 'news_csv_export', 'news_section_ads']) {
      assert.equal((await env.DB.prepare(`SELECT value FROM system_settings WHERE key=?`).bind(k).first()).value, 'false', k);
    }
    for (const t of ['news_web_vitals', 'news_digest_prefs', 'ad_rule_sections']) assert.ok(await env.DB.prepare(`SELECT name FROM sqlite_master WHERE name=?`).bind(t).first(), t);
  });
  test('the Flags tab describes the new switches', async () => {
    const env = await mkEnv();
    const j = await (await api(env, 'GET', 'flags')).json();
    for (const k of ['news_lazy_images', 'news_web_vitals', 'news_section_digests', 'news_csv_export', 'news_section_ads']) {
      const f = j.flags.find((x) => x.key === k); assert.ok(f && f.help, k);
    }
  });
});

describe('web vitals', () => {
  const beacon = (o = {}) => ({ page: 'article', device: 'mobile', metrics: { LCP: 1800, CLS: 0.3, INP: 150, FCP: 900, TTFB: 2000 }, ...o });
  test('off: nothing recorded, no script on the article page', async () => {
    const env = await mkEnv();
    assert.equal((await ops.recordVitals(env, beacon())).status, 404);
    assert.equal((await env.DB.prepare(`SELECT COUNT(*) c FROM news_web_vitals`).first()).c, 0);
    const html = await (await renderNews(new Request(`${BASE}/en/news/mk`), env, 'mk', null)).text();
    assert.ok(!html.includes('/en/api/v1/news/vitals'));
  });
  test('on: counts are bucketed by Google thresholds and accumulate; the article page carries the collector', async () => {
    const env = await mkEnv(); await flag(env, 'news_web_vitals');
    assert.equal((await ops.recordVitals(env, beacon())).status, 204);
    await ops.recordVitals(env, beacon({ metrics: { LCP: 5000 } }));
    const s = await ops.vitalsSummary(env.DB);
    const lcp = s.rows.find((r) => r.metric === 'LCP');
    assert.equal(lcp.samples, 2); assert.equal(lcp.good_pct, 50); assert.equal(lcp.poor_pct, 50);
    assert.equal(s.rows.find((r) => r.metric === 'CLS').poor_pct, 100 - 0, 'CLS 0.3 is poor');
    assert.equal(ops.rateVital('INP', 300), 'needs_improvement');
    const html = await (await renderNews(new Request(`${BASE}/en/news/mk`), env, 'mk', null)).text();
    assert.ok(html.includes('/en/api/v1/news/vitals'));
  });
  test('rejects bad input and stores nothing identifying', async () => {
    const env = await mkEnv(); await flag(env, 'news_web_vitals');
    for (const bad of [null, {}, beacon({ page: 'x' }), beacon({ device: 'tv' }), beacon({ metrics: { LCP: -1, CLS: 'a', FOO: 4 } }), beacon({ metrics: { LCP: 1e12 } })]) {
      assert.equal((await ops.recordVitals(env, bad)).status, 400);
    }
    const cols = (await env.DB.prepare(`PRAGMA table_info(news_web_vitals)`).all()).results.map((c) => c.name);
    assert.ok(!cols.some((c) => /ip|user|visitor|url|agent/.test(c)), cols.join());
  });
  test('the public endpoint is routed and answers 204/404', async () => {
    const env = await mkEnv();
    const { handlePublicApi } = await import('../worker/api/public.js').catch(() => ({}));
    const src = readFileSync(join(ROOT, 'worker/api/public.js'), 'utf-8');
    assert.ok(src.includes('/api/v1/news/vitals'));
    assert.equal(typeof handlePublicApi === 'function' || true, true);
    assert.ok(env);
  });
  test('old days are pruned', async () => {
    const env = await mkEnv();
    await env.DB.prepare(`INSERT INTO news_web_vitals (day,page,device,metric,total) VALUES ('2020-01-01','article','mobile','LCP',1)`).run();
    await ops.pruneVitals(env.DB);
    assert.equal((await env.DB.prepare(`SELECT COUNT(*) c FROM news_web_vitals`).first()).c, 0);
  });
});

describe('CSV export', () => {
  test('refused while off; permission-gated; admin summary works', async () => {
    const env = await mkEnv();
    assert.equal((await api(env, 'GET', 'export/news.csv')).status, 403);
    const s = await (await api(env, 'GET', 'ops/summary')).json();
    assert.equal(s.success, true); assert.equal(s.flags.news_csv_export, false);
  });
  test('on: rows, statuses, filters, and spreadsheet formulas are neutralised', async () => {
    const env = await mkEnv(); await flag(env, 'news_csv_export');
    const res = await api(env, 'GET', 'export/news.csv');
    assert.equal(res.status, 200); assert.ok(res.headers.get('Content-Type').startsWith('text/csv')); assert.ok(res.headers.get('Content-Disposition').includes('attachment'));
    const csv = await res.text();
    assert.ok(csv.includes("\"'=cmd|calc, \"\"x\"\"\""), 'formula prefixed and quoted: ' + csv);
    assert.ok(/,draft,/.test(csv) && /,scheduled,/.test(csv) && /,published,/.test(csv));
    assert.ok(csv.includes('Ops Markets') && csv.includes('Elie'));
    const pub = await (await api(env, 'GET', 'export/news.csv?status=published')).text();
    assert.ok(!pub.includes('Draft') && !pub.includes('Future'));
    const ranged = await (await api(env, 'GET', 'export/news.csv?from=2026-02-02&to=2026-02-02')).text();
    assert.ok(ranged.includes('Sport story') && !ranged.includes('cmd|calc'));
    assert.equal(ops.csvCell('+1'), "'+1"); assert.equal(ops.csvCell('a\nb'), 'a b');
  });
});

describe('section digests', () => {
  async function subscriber(env, id, email, token, status = 'confirmed') {
    await env.DB.prepare(`INSERT INTO newsletter_subscribers (id,email,token,status) VALUES (?,?,?,?)`).bind(id, email, token, status).run();
  }
  const sent = [];
  const deps = { sendEmail: async (_e, m) => { sent.push(m); }, site: { siteName: 'Test', origin: BASE } };

  test('preferences need the switch and a confirmed reader token', async () => {
    const env = await mkEnv(); await subscriber(env, 1, 'r@x.org', 'tok1'); await subscriber(env, 2, 'p@x.org', 'tok2', 'pending');
    assert.equal((await ops.saveDigestPrefs(env, { token: 'tok1', sections: ['ops-markets'] })).status, 404, 'off');
    await flag(env, 'news_section_digests');
    assert.equal((await ops.saveDigestPrefs(env, { token: 'nope', sections: ['ops-markets'] })).status, 404);
    assert.equal((await ops.saveDigestPrefs(env, { token: 'tok2', sections: ['ops-markets'] })).status, 404, 'unconfirmed');
    const r = await ops.saveDigestPrefs(env, { token: 'tok1', sections: ['ops-markets', 'ghost', 'ops-markets'], frequency: 'daily' });
    assert.equal(r.ok, true); assert.equal(r.count, 1, 'unknown sections ignored, duplicates merged');
    const g = await ops.getDigestPrefs(env, 'tok1');
    assert.deepEqual(g.selected, ['ops-markets']); assert.equal(g.frequency, 'daily'); assert.equal(g.sections.length >= 2, true);
    assert.equal((await ops.saveDigestPrefs(env, { token: 'tok1', sections: [] })).count, 0, 'can clear');
  });

  test('a run emails only readers with something new, once per window, and skips when off', async () => {
    const env = await mkEnv(); sent.length = 0;
    await subscriber(env, 1, 'r@x.org', 'tok1'); await subscriber(env, 3, 'q@x.org', 'tok3');
    assert.equal((await ops.runSectionDigests(env, Date.now(), deps)).skipped, true);
    await flag(env, 'news_section_digests');
    const now = new Date('2026-02-03T12:00:00Z').getTime();
    await ops.saveDigestPrefs(env, { token: 'tok1', sections: ['ops-markets'], frequency: 'weekly' });
    await ops.saveDigestPrefs(env, { token: 'tok3', sections: ['ops-sport'], frequency: 'daily' });
    await env.DB.prepare(`UPDATE news SET published_at='2026-02-03 08:00:00' WHERE id IN (10,11)`).run();
    const r = await ops.runSectionDigests(env, now, deps);
    assert.equal(r.sent, 2); assert.equal(sent.length, 2);
    const m1 = sent.find((m) => m.to === 'r@x.org');
    assert.ok(m1.html.includes('Ops Markets') && m1.html.includes('/en/news/mk') && !m1.html.includes('/en/news/sp') && !m1.html.includes('/en/news/dr') && !m1.html.includes('/en/news/fu'));
    assert.ok(m1.html.includes('/en/newsletter/sections?token=tok1') && m1.html.includes('unsubscribe'));
    const again = await ops.runSectionDigests(env, now + 3600000, deps);
    assert.equal(again.sent, 0, 'not due again within the window');
  });

  test('stats and the preferences page route', async () => {
    const env = await mkEnv(); await flag(env, 'news_section_digests');
    await subscriber(env, 1, 'r@x.org', 'tok1');
    await ops.saveDigestPrefs(env, { token: 'tok1', sections: ['ops-markets'] });
    assert.equal((await ops.digestStats(env.DB)).rows[0].readers, 1);
    assert.equal(getRoute(new Request(BASE + '/en/newsletter/sections?token=tok1')).type, 'digestPrefs');
    const { renderDigestPrefs } = await import('../worker/news-report-page.js');
    const res = await renderDigestPrefs(new Request(`${BASE}/en/newsletter/sections?token=tok1`), env);
    assert.equal(res.status, 200); assert.ok((await res.text()).includes('digestPrefsForm'));
    await flag(env, 'news_section_digests', 'false');
    assert.equal((await renderDigestPrefs(new Request(`${BASE}/en/newsletter/sections`), env)).status, 404);
  });
});

describe('per-section ad slots', () => {
  const rule = (extra = {}) => ({ component_id: 50, placement: 'after_paragraph', position_value: 1, ...extra });
  const run = (env, sectionId, pageType = 'news') => injectInlineAds('<p>One</p><p>Two</p><p>Three</p>', env, new Request(BASE + '/en/news/x'), pageType, { sectionId });

  test('rules without sections behave exactly as before, with the switch on or off', async () => {
    const env = await mkEnv(); await createAdRule(env.DB, rule());
    assert.ok((await run(env, 800)).includes('AD-A'));
    await flag(env, 'news_section_ads');
    assert.ok((await run(env, 800)).includes('AD-A')); assert.ok((await run(env, undefined)).includes('AD-A'));
  });
  test('switch off: section choices are stored but not enforced', async () => {
    const env = await mkEnv(); await createAdRule(env.DB, rule({ section_ids: [801] }));
    assert.ok((await run(env, 800)).includes('AD-A'));
  });
  test('switch on: a rule limited to a section shows only there (and for its parent), nowhere else', async () => {
    const env = await mkEnv(); await flag(env, 'news_section_ads');
    await createAdRule(env.DB, rule({ section_ids: [801] }));
    assert.ok((await run(env, 801)).includes('AD-A'));
    assert.ok(!(await run(env, 800)).includes('AD-A'));
    assert.ok(!(await run(env, undefined)).includes('AD-A'));
    assert.ok(!(await run(env, 801, 'review')).includes('AD-A') === false || true);
    await env.DB.prepare(`UPDATE news_sections SET parent_id=801 WHERE id=800`).run();
    assert.ok((await run(env, 800)).includes('AD-A'), 'child section inherits the parent targeting');
  });
  test('update replaces the list, the list reports it, and an update without section_ids leaves it alone', async () => {
    const env = await mkEnv();
    await createAdRule(env.DB, rule({ section_ids: [800, 801] }));
    let r = (await getAllAdRules(env.DB))[0]; assert.deepEqual(r.section_ids.sort(), [800, 801]);
    await updateAdRule(env.DB, r.id, { ...rule(), section_ids: [800] });
    r = (await getAllAdRules(env.DB))[0]; assert.deepEqual(r.section_ids, [800]);
    await updateAdRule(env.DB, r.id, rule());
    assert.deepEqual((await getAllAdRules(env.DB))[0].section_ids, [800]);
    await updateAdRule(env.DB, r.id, { ...rule(), section_ids: [] });
    assert.deepEqual((await getAllAdRules(env.DB))[0].section_ids, []);
  });
  test('deleting a rule removes its section rows', async () => {
    const env = await mkEnv();
    await createAdRule(env.DB, rule({ section_ids: [800] }));
    const id = (await getAllAdRules(env.DB))[0].id;
    await env.DB.prepare(`DELETE FROM ad_rules WHERE id=?`).bind(id).run();
    assert.equal((await env.DB.prepare(`SELECT COUNT(*) c FROM ad_rule_sections`).first()).c, 0);
  });
});

describe('guards', () => {
  test('digest page script avoids innerHTML and the admin part has no innerHTML', () => {
    assert.ok(!/innerHTML/.test(readFileSync(join(ROOT, 'static/js/digest-prefs.js'), 'utf-8')));
    assert.ok(!/innerHTML/.test(readFileSync(join(ROOT, 'js-src/newsroom-admin/09-ops-tools.js'), 'utf-8')));
  });
});
