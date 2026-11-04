// Shared fixtures for the Phase 7 transfer tests: two independent in-memory sites, small seeding helpers,
// and a hand-made signed envelope so a test can feed the importer exactly what it wants.
import { createTestDb, applyMigrations } from './d1-shim.js';
import { FORMAT, FORMAT_VERSION, PLATFORM, checksumOf, buildExport, parseEnvelope } from '../../worker/site-profile/transfer.js';
import assert from 'node:assert/strict';

export const admin = { user_id: 1, email: 'boss@t.example', role: 'admin' };
export const editor = { user_id: 2, email: 'ed@t.example', role: 'editor' };
export const viewer = { user_id: 3, email: 'v@t.example', role: 'viewer' };

// A site with every migration applied (default menu and pages included).
export function freshSite() { const db = createTestDb(); applyMigrations(db); return { db, env: { DB: db } }; }

export const setSetting = (db, key, value) => db.prepare('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, value).run();
export const setting = async (db, key) => (await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first())?.value ?? null;
export const addNav = (db, label, url, x = {}) => db.prepare('INSERT INTO nav_items(label, url, location, position, enabled, auto_generated, parent_id, scope_type, scope_ref, is_external) VALUES(?,?,?,?,?,0,?,?,?,?)')
  .bind(label, url, x.location || 'header', x.position || 0, x.enabled === 0 ? 0 : 1, x.parent_id || null, x.scope_type || null, x.scope_ref || null, x.is_external ? 1 : 0).run().then((r) => Number(r.meta.last_row_id));
export const addPage = (db, slug, template = 'page.html') => db.prepare("INSERT OR IGNORE INTO pages(slug, type, template, title) VALUES(?, 'page', ?, ?)").bind(slug, template, slug).run();
export const addComponent = (db, name, type = 'text', title = '', settings = null) => db.prepare("INSERT INTO components(name, slug, type, title, status, settings_json) VALUES(?, ?, ?, ?, 'active', ?)")
  .bind(name, `${type}-${name}`.toLowerCase().replace(/\W+/g, '-'), type, title, settings).run().then((r) => Number(r.meta.last_row_id));
export const place = (db, componentId, slug = 'about', position = 0) => db.prepare("INSERT INTO page_components(page_type, page_slug, component_id, position, enabled) VALUES('page', ?, ?, ?, 1)").bind(slug, componentId, position).run();
export const addSeo = (db, type, slug, x = {}) => db.prepare('INSERT INTO seo_meta(page_type, page_slug, title, description, keywords, canonical, og_image, robots) VALUES(?,?,?,?,?,?,?,?)')
  .bind(type, slug, x.title || null, x.description || null, x.keywords || null, x.canonical || null, x.og_image || null, x.robots || 'index, follow').run();
export const navLabels = async (db) => ((await db.prepare('SELECT label FROM nav_items ORDER BY id').all()).results || []).map((r) => r.label);
export const navCount = async (db) => Number((await db.prepare('SELECT COUNT(*) AS n FROM nav_items').first()).n);
export const auditActions = async (db) => ((await db.prepare('SELECT action FROM config_audit ORDER BY id').all()).results || []).map((r) => r.action);
export const snapshot = async (db) => JSON.stringify({
  settings: (await db.prepare('SELECT key, value FROM settings ORDER BY key').all()).results,
  nav: (await db.prepare('SELECT * FROM nav_items ORDER BY id').all()).results,
  pages: (await db.prepare('SELECT * FROM pages ORDER BY id').all()).results,
  seo: (await db.prepare('SELECT * FROM seo_meta ORDER BY id').all()).results,
  components: (await db.prepare('SELECT * FROM components ORDER BY id').all()).results,
  placements: (await db.prepare('SELECT * FROM page_components ORDER BY id').all()).results,
});

export const exportOf = async (env, opts = {}) => (await buildExport(env, { host: 'a.example', ...opts })).envelope;
export const parse = async (envelope) => { const p = await parseEnvelope(JSON.stringify(envelope)); assert.ok(p.ok, JSON.stringify(p.errors)); return p; };
export async function makeEnvelope(document, extra = {}) {
  const e = { format: FORMAT, formatVersion: FORMAT_VERSION, name: 'Hand made', description: '', exportedAt: '2026-11-04T10:00:00.000Z', source: { host: 'a.example', version: 3, platform: PLATFORM, from: 'live' }, sections: [], document: { v: 1, ...document }, ...extra };
  e.checksum = await checksumOf(e);
  return e;
}
