import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { resolveItems } from '../worker/live-banners/load.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
test('item references resolve to live data; unpublished, deleted and geo-blocked casinos are skipped', async () => {
  const db = createTestDb(); applyMigrations(db); db._exec(readFileSync(join(ROOT, 'migrations/0016_live_banners.sql'), 'utf8'));
  const ins = (slug, pub, name = slug) => db._raw.prepare("INSERT INTO casinos (name, slug, website_url, affiliate_url, published, status) VALUES (?, ?, ?, ?, ?, ?)").run(name, slug, "https://x.example", "https://x.example/a", pub, pub ? "published" : "draft");
  ins('good', 1, 'Good Casino'); ins('draft', 0); ins('blocked', 1);
  const rule = (slug, cc, st) => db._raw.prepare("INSERT INTO geo_rules (casino_slug, country_code, status) VALUES (?, ?, ?)").run(slug, cc, st);
  rule('good', 'US', 'allowed'); rule('draft', 'US', 'allowed'); rule('blocked', 'GB', 'allowed');
  const banner = { template_key: 'casino_table', items: ['good', 'draft', 'blocked', 'gone'].map((k) => ({ source_type: 'casino', source_key: k, overrides: k === 'good' ? { label: 'Renamed' } : {} })) };
  const us = await resolveItems(db, banner, 'US');
  assert.deepEqual(us.map((c) => c.key), ['good']); assert.equal(us[0].title, 'Renamed'); assert.equal(us[0].cta_url, '/en/go/good');
  assert.deepEqual((await resolveItems(db, banner, 'GB')).map((c) => c.key), ['blocked']); // 'good' is allow-listed for US only
  assert.equal((await resolveItems(db, banner, null, { geo: false })).map((c) => c.key).join(), 'good,blocked');
});
