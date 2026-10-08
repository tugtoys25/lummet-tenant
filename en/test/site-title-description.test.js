// Site Title / Site Description settings feed getSiteSettings()
// (site.title / site.description), which the homepage uses as the
// middle link of: SEO Meta override -> Site setting -> hardcoded default.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getSiteSettings } from '../worker/site-settings.js';

const fakeDb = (rows) => ({
  prepare: () => ({ all: async () => ({ results: rows }), bind() { return this; } })
});

test('getSiteSettings exposes title/description empty by default (hardcoded fallback applies)', async () => {
  const s = await getSiteSettings(null, 'https://example.com');
  assert.equal(s.title, '');
  assert.equal(s.description, '');
});

test('admin settings form has a Site Title field', () => {
  const html = readFileSync(new URL('../templates/pages/admin/settings.html', import.meta.url), 'utf8');
  assert.match(html, /name="site_title"/);
  assert.match(html, /name="site_description"/);
});

test('homepage title/description chain: override -> setting -> hardcoded', () => {
  const src = readFileSync(new URL('../worker/controllers.js', import.meta.url), 'utf8');
  assert.match(src, /seo_title: dynamicSeo\.seo_title \|\| site\.title \|\|/);
  assert.match(src, /seo_description: dynamicSeo\.seo_description \|\| site\.description \|\|/);
});
