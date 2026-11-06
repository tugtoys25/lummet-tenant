import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRESETS, ANALYTICS_DIMENSION_CAP, REPORT_TYPE_CAP } from '../worker/site-profile/registry.js';
import { applyPreset, isEnabled, pruneCapBlocks, apiGate, dimensionAllowed, reportTypeAllowed } from '../worker/site-profile/profile.js';
import { pruneByCap, capsOf } from '../worker/site-profile/cap-blocks.js';
import { route as analyticsRoute } from '../worker/api/routes/analytics.js';
import { route as reportsRoute } from '../worker/api/routes/reports.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const tpl = (n) => fs.readFileSync(path.join(here, '../templates/pages/admin', n), 'utf8');
const off = () => false, on = () => true;
const only = (...ids) => (c) => ids.includes(c);

test('parser: removes a tagged element with nested same-name tags and keeps the rest', () => {
  const html = '<div id="a"><div class="x" data-cap="casino"><div><div>deep</div></div></div><p>keep</p></div>';
  assert.equal(pruneByCap(html, off), '<div id="a"><p>keep</p></div>');
  assert.equal(pruneByCap(html, on), html);
});

test('parser: attribute order, quotes, upper case and extra attributes do not matter', () => {
  for (const tag of ['<div data-cap="x" class="c">', '<div class="c" data-cap="x">', "<div class='c' data-cap='x'>", '<DIV CLASS="c" DATA-CAP="x" id=z>', '<div\n  class="c"\n  data-cap="x"\n>']) {
    const closer = tag.startsWith('<DIV') ? '</DIV>' : '</div>';
    assert.equal(pruneByCap('a' + tag + 'inner' + closer + 'b', off), 'ab', tag);
  }
});

test('parser: any-of lists keep the block while one capability is on', () => {
  const html = '<section data-cap="casino.go|content.go">S</section>';
  assert.equal(pruneByCap(html, only('content.go')), html);
  assert.equal(pruneByCap(html, only('casino.go')), html);
  assert.equal(pruneByCap(html, off), '');
  assert.equal(pruneByCap('<i data-cap="a,b">x</i>', only('b')), '<i data-cap="a,b">x</i>');
  assert.deepEqual(capsOf(' class="c" data-cap=" a | b "'), ['a', 'b']);
  assert.equal(capsOf(' class="c" data-cap=""'), null);
});

test('parser: table rows, options (with and without closing tag) and void elements', () => {
  const tbl = '<table><tr><td>a</td></tr><tr data-cap="p"><td>b</td></tr><tr><td>c</td></tr></table>';
  assert.equal(pruneByCap(tbl, off), '<table><tr><td>a</td></tr><tr><td>c</td></tr></table>');
  const sel = '<select><option value="1">One</option><option data-cap="p" value="2">Two</option><option value="3">Three</option></select>';
  assert.equal(pruneByCap(sel, off), '<select><option value="1">One</option><option value="3">Three</option></select>');
  const unclosed = '<select><option value=1>One<option data-cap="p" value=2>Two<option value=3>Three</select>';
  assert.equal(pruneByCap(unclosed, off), '<select><option value=1>One<option value=3>Three</select>');
  const last = '<select><option value=1>One<option data-cap="p" value=2>Two</select>';
  assert.equal(pruneByCap(last, off), '<select><option value=1>One</select>');
  assert.equal(pruneByCap('<p>a<input data-cap="p" type="text">b</p>', off), '<p>ab</p>');
  assert.equal(pruneByCap('<p>a<br data-cap="p"/>b</p>', off), '<p>ab</p>');
});

test('parser: unbalanced markup is left alone (fail open), scripts and comments are never touched', () => {
  const broken = '<div><div data-cap="p">never closed';
  assert.equal(pruneByCap(broken, off), broken);
  const inert = '<!-- <div data-cap="p">x</div> --><script>var s = \'<div data-cap="p">x</div>\';</script><style>.a{}</style><p>ok</p>';
  assert.equal(pruneByCap(inert, off), inert);
  assert.equal(pruneByCap('<p>no tags</p>', off), '<p>no tags</p>');
  assert.equal(pruneByCap('<p title="a>b" data-cap="p">x</p>tail', off), 'tail');
  assert.equal(pruneByCap('', off), '');
});

test('parser: an element nested inside a removed element goes with it; a kept parent loses only its tagged child', () => {
  const html = '<div data-cap="a"><span data-cap="b">1</span>2</div><div data-cap="b"><b data-cap="a">3</b>4</div>';
  assert.equal(pruneByCap(html, only('b')), '<div data-cap="b">4</div>');
});

test('pruneCapBlocks: the stat cards on the Overview still follow their capability (regression of the old behaviour)', () => {
  const html = tpl('dashboard.html');
  const news = pruneCapBlocks(html, applyPreset('news'));
  assert.ok(!news.includes('id="statCasinos"') && !news.includes('id="statReviews"') && !news.includes('id="statClicks"'));
  assert.ok(news.includes('id="statPages"'), 'the untagged Pages card stays');
  assert.equal(pruneCapBlocks(html, applyPreset('full')), html, 'Full platform is unchanged');
  assert.equal(pruneCapBlocks(html, null), html);
});

const TEMPLATES = ['dashboard.html', 'analytics.html', 'reports.html'];

test('every preset: no tagged block or option of a switched-off capability is left in Overview, Analytics or Reports', () => {
  for (const [id] of Object.entries(PRESETS)) {
    const profile = applyPreset(id);
    for (const name of TEMPLATES) {
      const raw = tpl(name), out = pruneCapBlocks(raw, profile);
      const tags = [...raw.matchAll(/data-cap="([^"]+)"/g)].map((m) => m[1].split('|'));
      const expectedLeft = tags.filter((caps) => caps.some((c) => isEnabled(profile, c))).length;
      const left = (out.match(/data-cap="/g) || []).length;
      assert.equal(left, expectedLeft, `${id} / ${name}: ${left} tagged blocks left, expected ${expectedLeft}`);
      if (id === 'full') assert.equal(out, raw, `${id} / ${name} must be unchanged`);
    }
  }
});

test('news-only site: Overview, Analytics and Reports show nothing of casinos, offers, tracking links or partners', () => {
  const p = applyPreset('news');
  const overview = pruneCapBlocks(tpl('dashboard.html'), p);
  assert.ok(!overview.includes('Top Casinos by Clicks') && !overview.includes('topCasinosTable'));
  assert.ok(!overview.includes('Clicks by Country') && !overview.includes('topCountriesTable'));
  const an = pruneCapBlocks(tpl('analytics.html'), p);
  for (const v of ['casino', 'offer', 'tracking_link', 'partner', 'program', 'account']) assert.ok(!an.includes(`value="${v}"`), `analytics option ${v}`);
  assert.ok(an.includes('value="campaign"'), 'campaigns is a feature, still on');
  assert.ok(!an.includes('value="tracking_link_health"') && !an.includes('value="health_failure"'));
  const rp = pruneCapBlocks(tpl('reports.html'), p);
  for (const v of Object.keys(REPORT_TYPE_CAP)) assert.ok(!rp.includes(`value="${v}"`), `report type ${v}`);
  assert.ok(rp.includes('value="executive_performance"') && rp.includes('value="geo_performance"') && rp.includes('value="content_performance"'));
  assert.ok(!rp.includes('<option data-cap="casino" value="casino">'));
});

test('casino-only site keeps casino analytics and drops partner tooling; offers follow the Offers page switch', () => {
  const p = applyPreset('casino-list');
  const an = pruneCapBlocks(tpl('analytics.html'), p);
  assert.ok(an.includes('value="casino"') && an.includes('value="offer"'));
  assert.ok(!an.includes('value="partner"') && !an.includes('value="program"'));
  const noOffers = { ...p, pages: { ...p.pages, 'casino.offers': false } };
  assert.ok(!pruneCapBlocks(tpl('analytics.html'), noOffers).includes('value="offer"'));
  assert.ok(pruneCapBlocks(tpl('dashboard.html'), p).includes('Top Casinos by Clicks'));
});

test('sportsbook-only site: Clicks by Country stays (content /go links), Top Casinos goes', () => {
  const o = pruneCapBlocks(tpl('dashboard.html'), applyPreset('sportsbook'));
  assert.ok(o.includes('Clicks by Country') && !o.includes('Top Casinos by Clicks'));
});

test('every dimension and report type in the maps is a real capability id', () => {
  const p = applyPreset('full');
  for (const c of [...Object.values(ANALYTICS_DIMENSION_CAP), ...Object.values(REPORT_TYPE_CAP)]) assert.equal(isEnabled(p, c), true, c);
});

test('admin API: dimension and report helpers follow the profile; Full platform allows everything', () => {
  const news = applyPreset('news'), full = applyPreset('full');
  assert.equal(dimensionAllowed(news, 'casino'), false);
  assert.equal(dimensionAllowed(news, 'partner'), false);
  assert.equal(dimensionAllowed(news, 'campaign'), true);
  assert.equal(dimensionAllowed(news, 'page'), true);
  assert.equal(reportTypeAllowed(news, 'casino_performance'), false);
  assert.equal(reportTypeAllowed(news, 'executive_performance'), true);
  for (const k of Object.keys(ANALYTICS_DIMENSION_CAP)) assert.equal(dimensionAllowed(full, k), true);
  for (const k of Object.keys(REPORT_TYPE_CAP)) assert.equal(reportTypeAllowed(full, k), true);
  assert.equal(dimensionAllowed(null, 'casino'), true, 'no profile = full platform');
  assert.equal(apiGate('/api/v1/stats/top-casinos', news).body.code, 'feature_disabled');
  assert.equal(apiGate('/api/v1/stats/top-casinos', full), null);
  assert.equal(apiGate('/api/v1/stats/countries', news), null);
});

const asEnv = (id) => ({ __preview: { profile: applyPreset(id) } }); // loadProfile honours the signed-in editor preview; no DB needed
const req = (u, body) => new Request('https://s.example' + u, body ? { method: 'POST', body: JSON.stringify(body) } : {});
const body = async (r) => ({ status: r.status, json: await r.json() });

test('analytics route: a disabled module answers with an empty, well-formed result (no DB touched)', async () => {
  const q = '?dimension_type=casino&start_date=2026-01-01&end_date=2026-01-31';
  let r = await body(await analyticsRoute({ request: req('/api/v1/analytics/overview' + q), env: asEnv('news'), path: '/api/v1/analytics/overview', user: {} }));
  assert.deepEqual(r, { status: 200, json: { success: true, dimension_type: 'casino', rows: [] } });
  r = await body(await analyticsRoute({ request: req('/api/v1/analytics/timeseries' + q), env: asEnv('news'), path: '/api/v1/analytics/timeseries', user: {} }));
  assert.deepEqual(r, { status: 200, json: { success: true, series: [] } });
});

test('reports route: create and column-options for a disabled module are refused cleanly', async () => {
  let r = await body(await reportsRoute({ request: req('/api/v1/report/create', { name: 'x', reportType: 'casino_performance' }), env: asEnv('news'), path: '/api/v1/report/create', user: { user_id: 1 } }));
  assert.equal(r.status, 404); assert.equal(r.json.code, 'feature_disabled'); assert.equal(r.json.capability, 'casino');
  r = await body(await reportsRoute({ request: req('/api/v1/report/column-options?report_type=partner_performance'), env: asEnv('news'), path: '/api/v1/report/column-options', user: {} }));
  assert.equal(r.status, 200); assert.deepEqual(r.json.columns, []);
});
