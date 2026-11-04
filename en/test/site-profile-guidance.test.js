import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../worker/site-profile/registry.js';
import { applyPreset, defaultProfile, validateProfile, normalizeProfile } from '../worker/site-profile/profile.js';
import { WIZARD, wizardOptions, previewChange, diagnose, nextSteps } from '../worker/site-profile/guidance.js';
import { loadFacts } from '../worker/site-profile/facts.js';

test('wizard options all map to real presets and carry plain-language text', () => {
  for (const w of WIZARD) { assert.ok(PRESETS[w.id], w.id); assert.ok(w.title && w.example && w.learn, w.id); }
  const opts = wizardOptions();
  assert.equal(opts.length, WIZARD.length);
  for (const o of opts) assert.equal(validateProfile(o.profile).ok, true, o.id);
});

test('preview: full -> news lists what goes, counts pages at risk and warns when not redirecting', () => {
  const r = previewChange(defaultProfile(), applyPreset('news'), { casinos: 54, reviews: 20, news: 5 });
  assert.equal(r.risk, 'high');
  assert.equal(r.affectedPages, 74);
  assert.ok(r.removed.some((x) => x.id === 'casino'));
  assert.ok(!r.removed.some((x) => x.id === 'news'));
  assert.ok(r.sitemapFilesRemoved >= 3 && r.dashboardScreensHidden > 5 && r.landingChanged);
  assert.match(r.confirm, /74 published pages/);
});

test('preview: a 301 redirect lowers the risk; no change means nothing to report; features alone are low risk', () => {
  const after = applyPreset('news'); after.disabled = { mode: '301', redirectTo: '/en/news' };
  assert.equal(previewChange(defaultProfile(), after, { casinos: 10 }).risk, 'medium');
  const same = previewChange(defaultProfile(), defaultProfile(), { casinos: 10 });
  assert.deepEqual([same.removed, same.added, same.risk], [[], [], 'low']);
  assert.equal(previewChange(defaultProfile(), normalizeProfile({ features: { banners: false } })).risk, 'low');
});

test('preview: page families are reported only when their module stays on', () => {
  const after = applyPreset('casino-list'); after.pages['casino.detail'] = false;
  const r = previewChange(applyPreset('casino-list'), after, { casinos: 3 });
  assert.deepEqual(r.removed.map((x) => x.id), ['casino.detail']);
  const gone = previewChange(applyPreset('casino-list'), applyPreset('static'));
  assert.ok(gone.removed.some((x) => x.id === 'casino') && !gone.removed.some((x) => x.id === 'casino.detail'));
});

test('diagnose: healthy presets have no issues', () => {
  for (const id of Object.keys(PRESETS)) assert.deepEqual(diagnose(applyPreset(id)).filter((i) => i.level === 'error'), [], id);
  assert.deepEqual(diagnose(defaultProfile()), []);
});

test('diagnose: reviews without any listing gives a one-click fix that resolves it', () => {
  const p = normalizeProfile({ modules: { reviews: true }, preset: 'custom' });
  for (const k of Object.keys(applyPreset('news').modules)) if (k !== 'reviews') p.modules[k] = false;
  const issue = diagnose(p).find((i) => i.id === 'reviews-need-listing');
  assert.ok(issue && issue.fix);
  assert.equal(issue.fix.profile.modules.casino, true);
  assert.equal(diagnose(issue.fix.profile).some((i) => i.id === 'reviews-need-listing'), false);
});

test('diagnose: landing on a switched-off page and a bad redirect are errors with working fixes', () => {
  const p = applyPreset('casino-only'); p.pages['casino.list'] = false;
  const e = diagnose(p).find((i) => i.id === 'landing-off');
  assert.equal(e.level, 'error');
  assert.equal(validateProfile(e.fix.profile).ok, true);
  const q = applyPreset('news'); q.disabled = { mode: '301', redirectTo: '' };
  const e2 = diagnose(q).find((i) => i.id === 'redirect-bad');
  assert.equal(validateProfile(e2.fix.profile).ok, true);
});

test('diagnose: dependent features and pages are explained and fixable', () => {
  const p = applyPreset('static'); p.features = {}; p.modules.partners = true;
  const ids = diagnose(p).map((i) => i.id);
  assert.ok(ids.includes('geo-needs-listing') && ids.includes('partners-need-listing'));
  const n = applyPreset('news'); n.pages['news.article'] = false;
  const f = diagnose(n).find((i) => i.id === 'news-topics-need-articles');
  assert.equal(f.fix.profile.pages['news.taxonomy'], false);
});

test('next steps: lists what is empty, only for what is switched on, with working targets', () => {
  const news = nextSteps(applyPreset('news'), { casinos: 0, news: 0, pages: 0, authors: 0, hasLogo: false });
  const ids = news.steps.map((s) => s.id);
  assert.deepEqual(ids.sort(), ['authors', 'logo', 'news', 'pages']);
  assert.ok(news.steps.every((s) => s.href.startsWith('/en/dashboard/')));
  assert.deepEqual(nextSteps(defaultProfile(), { casinos: 5, reviews: 2, news: 3, pages: 4, authors: 1, hasLogo: true }).steps, []);
  assert.deepEqual(nextSteps(defaultProfile(), {}).steps, []);           // unknown facts never nag
});

test('facts: failures are swallowed and reported as unknown', async () => {
  assert.deepEqual(await loadFacts({}), {});
  const env = { DB: { prepare: () => ({ first: async () => { throw new Error('no table'); } }) } };
  assert.deepEqual(await loadFacts(env), {});
  const ok = { DB: { prepare: (sql) => ({ first: async () => ({ c: 3 }), all: async () => ({ results: /site_logo/.test(sql) ? [{ key: 'site_logo', value: 'x' }] : [] }) }) } };
  const f = await loadFacts(ok); assert.equal(f.casinos, 3); assert.equal(f.hasLogo, true);
});
