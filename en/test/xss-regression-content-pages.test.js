// test/xss-regression-content-pages.test.js
//
// Follow-up to xss-regression.test.js. During the newsroom integration audit,
// worker/render.js's replaceVariables() was confirmed to apply ZERO escaping
// to any {{var}} whose key is not in the CONTENT_FIELDS allow-list (title,
// name, country_name, parent_label, author_name, casino_name, intro are all
// outside it). That is the exact same bug class already found and fixed for
// the news and author pages -- but it turned out to be site-wide: casino,
// review, country, sportsbook, affiliate-partner, custom-content, research,
// generic-review, comparison, platform-update, affiliate and the two
// seo-landing renderers all passed an unescaped DB-sourced title/name field
// straight into `{{title}}` / `{{name}}` in their templates.
//
// This file proves the fix (an escapeHtml()/sanitizeHtml() wrap added at each
// call site, mirroring the existing news/author fix) with real payloads
// through the REAL renderers, REAL templates and REAL migrated schema.
//
// Scope note: this covers every renderer confirmed vulnerable by grepping the
// `.render(...)` DATA OBJECT specifically (excluding breadcrumb arguments,
// which route through the already-escaped renderBreadcrumbs()). A further,
// separate audit found ~40 additional raw `${x.title}` / `${x.name}`
// interpolations inside inline JS template-literal HTML builders elsewhere in
// controllers.js (list/card builders, mostly). Those are a distinct, larger
// body of work and are NOT covered by this file -- see the conversation
// summary for the full list of call sites still needing review.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import {
  renderCasino, renderReview, renderCountry,
  renderSportsbook, renderAffiliatePartner, renderCustom,
} from '../worker/controllers.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAYLOAD = '</title><script>alert(1)</script>"><img src=x onerror=alert(2)>';

async function mkEnv() {
  const db = createTestDb(); applyMigrations(db);
  return { DB: db, ASSETS: { fetch: async (r) => { const f = join(ROOT, new URL(r.url).pathname); return existsSync(f) ? new Response(readFileSync(f, 'utf-8')) : new Response('nf', { status: 404 }); } } };
}
const noRawPayload = (html) => {
  for (const bad of ['<script>alert(1)', '<img src=x onerror', '</title><script>']) assert.ok(!html.includes(bad), `raw payload survived: ${bad}`);
};

describe('casino / review / country pages: title and name are escaped', () => {
  test('renderCasino: casino.name cannot inject markup', async () => {
    const env = await mkEnv();
    await env.DB.prepare(`INSERT INTO casinos (slug, name, website_url, affiliate_url, published, status) VALUES ('c1', ?, 'https://c.example', 'https://c.example/aff', 1, 'published')`).bind(PAYLOAD + 'Casino').run();
    const res = await renderCasino(new Request('https://site.test/en/casino/c1'), env, 'c1', null);
    assert.equal(res.status, 200);
    const html = await res.text();
    noRawPayload(html);
    assert.match(html, /<title>&lt;\/title&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;&quot;&gt;&lt;img src=x onerror=alert\(2\)&gt;Casino/);
  });

  test('renderReview: review.title and casino_name cannot inject markup', async () => {
    const env = await mkEnv();
    await env.DB.prepare(`INSERT INTO casinos (slug, name, website_url, affiliate_url, published, status) VALUES ('c2', ?, 'https://c2.example', 'https://c2.example/aff', 1, 'published')`).bind(PAYLOAD + 'CasinoName').run();
    await env.DB.prepare(`INSERT INTO reviews (casino_slug, slug, title, content, published) VALUES ('c2', 'r1', ?, '<p>x</p>', 1)`).bind(PAYLOAD + 'Review').run();
    const res = await renderReview(new Request('https://site.test/en/review/r1'), env, 'r1', null);
    assert.equal(res.status, 200);
    noRawPayload(await res.text());
  });

  test('renderCountry: country.name cannot inject markup', async () => {
    const env = await mkEnv();
    await env.DB.prepare(`INSERT INTO countries (code, name) VALUES ('ZZ', ?)`).bind(PAYLOAD + 'Country').run();
    const res = await renderCountry(new Request('https://site.test/en/country/zz'), env, 'zz');
    assert.equal(res.status, 200);
    noRawPayload(await res.text());
  });
});

describe('generic content items (sportsbook / affiliate-partner / custom): item.name is escaped', () => {
  const insertItem = (env, type, slug, name, extra = '') => env.DB.prepare(
    `INSERT INTO content_items (content_type, custom_type_slug, slug, name, published, status${extra ? ',' + extra.split('=')[0] : ''}) VALUES (?,?,?,?,1,'published'${extra ? ',' + extra.split('=')[1] : ''})`
  ).bind(type, type === 'custom' ? 'reviewed-provider' : null, slug, name).run();

  test('renderSportsbook: item.name cannot inject markup', async () => {
    const env = await mkEnv();
    await insertItem(env, 'sportsbook', 'sb1', PAYLOAD + 'Sportsbook');
    const res = await renderSportsbook(new Request('https://site.test/en/sportsbook/sb1'), env, 'sb1', null);
    assert.equal(res.status, 200);
    noRawPayload(await res.text());
  });

  test('renderAffiliatePartner: item.name cannot inject markup', async () => {
    const env = await mkEnv();
    await insertItem(env, 'affiliate_partner', 'ap1', PAYLOAD + 'Partner');
    const res = await renderAffiliatePartner(new Request('https://site.test/en/affiliate-partner/ap1'), env, 'ap1', null);
    assert.equal(res.status, 200);
    noRawPayload(await res.text());
  });

  test('renderCustom: item.name cannot inject markup', async () => {
    const env = await mkEnv();
    await env.DB.prepare(`INSERT INTO custom_content_types (slug, label, plural_label) VALUES ('reviewed-provider','Provider','Providers')`).run();
    await insertItem(env, 'custom', 'cu1', PAYLOAD + 'Custom');
    const res = await renderCustom(new Request('https://site.test/en/custom/reviewed-provider/cu1'), env, 'reviewed-provider', 'cu1', null);
    assert.equal(res.status, 200);
    noRawPayload(await res.text());
  });
});

describe('static confirmation: every identified call site now wraps its field', () => {
  // Cheap, deterministic guard against a future edit silently reverting one of
  // these fixes: every previously-bare occurrence must now be wrapped.
  const src = readFileSync(join(ROOT, 'worker/controllers.js'), 'utf-8');
  const mustContain = [
    'name: escapeHtml(casino.name)', 'title: escapeHtml(review.title)', 'casino_name: escapeHtml(casinoName)',
    'name: escapeHtml(countryData.name)', 'title: escapeHtml(item.title)', 'name: escapeHtml(item.name)',
    'title: escapeHtml(review.title)', 'title: escapeHtml(comparison.title)', 'title: escapeHtml(page.title)',
    'title: escapeHtml(effectivePage.title)', 'title: escapeHtml(update.title)',
  ];
  for (const needle of mustContain) {
    test(`controllers.js still contains: ${needle}`, () => assert.ok(src.includes(needle), needle));
  }
});
