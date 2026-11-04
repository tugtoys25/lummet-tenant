import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRoute } from '../worker/routes.js';
import { PRESETS } from '../worker/site-profile/registry.js';
import { applyPreset, defaultProfile, gate, pruneCapBlocks } from '../worker/site-profile/profile.js';
import { rewriteHtmlLinks, needsRewrite, linkRewriteApplies } from '../worker/site-profile/links.js';

const ORIGIN = 'https://s.example';
const SAMPLES = ['/en/casino', '/en/casino/bcgame', '/en/review', '/en/review/bcgame', '/en/news', '/en/news/some-story', '/en/updates', '/en/author',
  '/en/author/jane', '/en/category', '/en/country', '/en/research', '/en/sportsbook', '/en/affiliate-partner', '/en/search', '/en/best/x', '/en/privacy-policy', '/en/about'];

const page = (paths) => `<html><head><link rel="canonical" href="${ORIGIN}/en/casino/bcgame"><link rel="alternate" hreflang="en" href="/en/news"><link rel="stylesheet" href="/static/a.css">
<script type="application/ld+json">${JSON.stringify({ '@type': 'BreadcrumbList', itemListElement: [
  { '@type': 'ListItem', position: 1, item: ORIGIN + '/en' }, { '@type': 'ListItem', position: 2, item: ORIGIN + '/en/casino' }, { '@type': 'ListItem', position: 3, item: ORIGIN + '/en/news' }] })}</script>
<script>var x = '<a href="/en/casino">js string</a>';</script></head><body>
<ul>${paths.map((p) => `<li><a href="${p}">Item ${p}</a></li>`).join('')}</ul>
<p>${paths.map((p) => `Read <a href="${p}?x=1&amp;y=2" class="x">link ${p}</a>`).join(' ')}</p>
<div>${paths.map((p) => `<a href="${ORIGIN}${p}" class="btn btn--primary">Go ${p}</a>`).join('')}</div>
<a href="https://partner.example/en/casino">external</a><a href="#top">top</a><a href="mailto:a@b.c">mail</a></body></html>`;

function hrefsOf(html) {
  const body = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  return [...body.matchAll(/<(?:a|link)\b[^>]*?\shref="([^"]*)"/gi)].map((m) => m[1]);
}

test('crawl per preset: no remaining internal link leads to a removed section', () => {
  for (const id of Object.keys(PRESETS)) {
    const profile = applyPreset(id);
    const html = rewriteHtmlLinks(page(SAMPLES), profile, ORIGIN);
    for (const href of hrefsOf(html)) {
      if (/^(https?:)?\/\/(?!s\.example)/.test(href) || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('/static/')) continue;
      const path = href.replace(ORIGIN, '').split(/[?#]/)[0].replace(/&amp;/g, '&');
      const d = gate(getRoute({ url: ORIGIN + path }), profile);
      assert.equal(d.action, 'pass', `${id}: ${href} -> ${JSON.stringify(d)}`);
    }
  }
});

test('full platform: page is returned byte-for-byte (fast path)', () => {
  const html = page(SAMPLES);
  assert.equal(needsRewrite(defaultProfile()), false);
  assert.equal(rewriteHtmlLinks(html, defaultProfile(), ORIGIN), html);
});

test('news only: casino links vanish, news links, external links, fragments and mail stay', () => {
  const p = applyPreset('news');
  const out = rewriteHtmlLinks(page(SAMPLES), p, ORIGIN);
  assert.ok(!out.includes('<li><a href="/en/casino">'));
  assert.ok(out.includes('<li><a href="/en/news">'));
  assert.ok(out.includes('link /en/news/some-story'));                        // text kept
  assert.ok(out.includes('link /en/casino') && !out.includes('href="/en/casino?x'));     // unlinked, text kept
  assert.ok(!out.includes('Go /en/casino'));                                  // button-style link removed
  assert.ok(out.includes('https://partner.example/en/casino') && out.includes('#top') && out.includes('mailto:a@b.c'));
  assert.ok(out.includes('/static/a.css'));
});

test('head links and JSON-LD breadcrumbs are cleaned and renumbered; scripts are not rewritten', () => {
  const p = applyPreset('news');
  const out = rewriteHtmlLinks(page(SAMPLES), p, ORIGIN);
  assert.ok(!out.includes('rel="canonical"'));
  assert.ok(out.includes('hreflang="en" href="/en/news"'));
  const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(out)[1]);
  assert.deepEqual(ld.itemListElement.map((e) => e.position), [1]);              // /en (homepage off) and /en/casino gone; only /en/news remains
  assert.ok(out.includes(`'<a href="/en/casino">js string</a>'`));
});

test('homepage off: the /en link is pointed at the landing page instead of being unlinked', () => {
  const p = applyPreset('casino-only');
  const out = rewriteHtmlLinks('<a href="/en" class="logo">Home</a>', p, ORIGIN);
  assert.equal(out, '<a href="/en/casino" class="logo">Home</a>');
});

test('page-level: casino detail links removed while the casino list link stays', () => {
  const p = applyPreset('casino-list'); p.pages['casino.detail'] = false;
  const out = rewriteHtmlLinks('<a href="/en/casino">All</a> <a href="/en/casino/bc">BC</a>', p, ORIGIN);
  assert.equal(out, '<a href="/en/casino">All</a> BC');
});

test('autoPrune off disables rewriting; malformed input never throws', () => {
  const p = applyPreset('news'); p.header.autoPrune = false;
  const html = '<a href="/en/casino">x</a>';
  assert.equal(rewriteHtmlLinks(html, p, ORIGIN), html);
  assert.doesNotThrow(() => rewriteHtmlLinks('<a href="/en/casino"><li><a', applyPreset('news'), ORIGIN));
  assert.equal(rewriteHtmlLinks('', applyPreset('news'), ORIGIN), '');
});

test('rewriter applies to public HTML only', () => {
  const html = new Response('x', { headers: { 'content-type': 'text/html; charset=utf-8' } });
  assert.equal(linkRewriteApplies({ type: 'casinoList' }, html), true);
  assert.equal(linkRewriteApplies({ type: 'dashboardNews' }, html), false);
  assert.equal(linkRewriteApplies({ type: 'sitemap-news' }, html), false);
  assert.equal(linkRewriteApplies({ type: 'casinoList' }, new Response('{}', { headers: { 'content-type': 'application/json' } })), false);
});

test('dashboard stat cards follow capabilities', async () => {
  const fs = await import('node:fs');
  const tpl = fs.readFileSync(new URL('../templates/pages/admin/dashboard.html', import.meta.url), 'utf8');
  const news = pruneCapBlocks(tpl, applyPreset('news'));
  assert.ok(!news.includes('id="statCasinos"') && !news.includes('id="statReviews"') && !news.includes('id="statClicks"'));
  assert.ok(news.includes('id="statPages"'));
  assert.equal(pruneCapBlocks(tpl, defaultProfile()), tpl);
});

test('AI retrieval skips searches of removed sections', async () => {
  const fs = await import('node:fs');
  const dir = new URL('../worker/ai/retrieval/search/', import.meta.url);
  const src = fs.readdirSync(dir).map((f) => fs.readFileSync(new URL(f, dir), 'utf8')).join('\n');
  for (const k of ['casinos', 'reviews', 'news', 'content', 'updates', 'authors', 'taxonomy', 'payments']) assert.ok(src.includes(`ctx.off?.has("${k}")`), k);
});
