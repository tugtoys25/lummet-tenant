// Postback Hub: the "set up something new" form creates partner + program + account in one go, reuses what exists,
// and the page keeps every element its script looks up.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { quickSetup, partnerList, hubSummary } from '../worker/postback/quick-setup.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf-8');

describe('new-entries setup', () => {
  let db;
  beforeEach(async () => {
    db = createTestDb(); applyMigrations(db);
    await db.prepare(`INSERT INTO users (id, email, password_hash, role) VALUES (1,'a@t.l','x','admin')`).run();
    await db.prepare(`INSERT INTO casinos (id,name,slug,website_url,affiliate_url,created_by) VALUES (300,'A','a','https://a.example','https://net.example/a',1)`).run();
    await db.prepare(`INSERT INTO casinos (id,name,slug,website_url,affiliate_url,created_by) VALUES (301,'B','b','https://b.example','https://net.example/b',1)`).run();
  });

  test('creates partner, program, account and links with the names exactly as typed', async () => {
    const r = await quickSetup(db, { exactNames: true, partnerName: 'V Partners Ltd', partnerType: 'operator', partnerWebsite: 'https://vp.example',
      programName: 'V Partners (EN)', portalUrl: 'https://portal.vp.example', accountName: 'Main', externalAccountId: '777', casinoIds: [300, 301], clickIdParam: 'sub', userId: 1 });
    assert.deepEqual([...new Set(r.created)].sort(), ['account', 'partner', 'program', 'tracking_link']);
    assert.equal((await db.prepare('SELECT name FROM affiliate_programs WHERE id = ?').bind(r.program_id).first()).name, 'V Partners (EN)');
    const partner = await db.prepare('SELECT name, partner_type, website FROM affiliate_partners WHERE id = ?').bind(r.partner_id).first();
    assert.deepEqual({ ...partner }, { name: 'V Partners Ltd', partner_type: 'operator', website: 'https://vp.example' });
    const acc = await db.prepare('SELECT account_name, external_account_id FROM affiliate_accounts WHERE id = ?').bind(r.account_id).first();
    assert.deepEqual({ ...acc }, { account_name: 'Main', external_account_id: '777' });
    assert.equal(r.links.length, 2);
  });

  test('an existing partner is attached to, and re-running creates nothing', async () => {
    const a = await quickSetup(db, { exactNames: true, partnerName: 'Net', programName: 'Net (EN)', accountName: 'Main', userId: 1 });
    const b = await quickSetup(db, { exactNames: true, partnerId: a.partner_id, programName: 'Net (DE)', accountName: 'Main DE', userId: 1 });
    assert.deepEqual(b.created.sort(), ['account', 'program']);
    assert.equal(b.partner_id, a.partner_id);
    const again = await quickSetup(db, { exactNames: true, partnerId: a.partner_id, programName: 'Net (DE)', accountName: 'Main DE', userId: 1 });
    assert.deepEqual(again.created, []);
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM affiliate_partners').first()).n, 1);
    assert.equal((await partnerList(db))[0].programs, 2);
  });

  test('an account that belongs to another program is refused', async () => {
    const a = await quickSetup(db, { exactNames: true, partnerName: 'P1', programName: 'P1', accountName: 'x', userId: 1 });
    const b = await quickSetup(db, { exactNames: true, partnerName: 'P2', programName: 'P2', accountName: 'y', userId: 1 });
    await assert.rejects(() => quickSetup(db, { programId: b.program_id, accountId: a.account_id, userId: 1 }), /does not belong/);
  });

  test('the overview summary counts integrations and flags ones that never received a postback', async () => {
    const r = await quickSetup(db, { exactNames: true, partnerName: 'P', programName: 'P', accountName: 'x', userId: 1 });
    await db.prepare(`INSERT INTO postback_configs (account_id,label,endpoint_token,auth_method,credential_reference,status,created_by) VALUES (?,?,?,?,?,?,1)`).bind(r.account_id, 'Quiet', 'tok1', 'shared_secret', 'managed', 'active').run();
    const s = await hubSummary(db);
    assert.equal(s.integrations_active, 1);
    assert.equal(s.never_received[0].label, 'Quiet');
    assert.equal(s.last_24h.accepted, 0);
    assert.deepEqual(s.per_config, {});
  });
});

describe('Hub page structure', () => {
  const html = read('templates/pages/admin/postback-configs.html');
  const js = read('static/js/postback-config-admin.js');
  test('every element the script looks up by id exists in the page (or is built by the script)', () => {
    const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
    const built = new Set([...js.matchAll(/id="([^"$]+)"/g)].map((m) => m[1]).concat(['pbToast']));
    for (const m of js.matchAll(/getElementById\("([^"]+)"\)/g)) assert.ok(ids.has(m[1]) || built.has(m[1]), `missing #${m[1]}`);
  });
  test('every tab has a panel and the forwarding script anchors are still present', () => {
    for (const t of ['overview', 'connect', 'integrations', 'test', 'forwarding', 'activity', 'advanced']) {
      assert.ok(html.includes(`data-pb-tab="${t}"`) && html.includes(`data-pb-panel="${t}"`), t);
    }
    for (const id of ['fwBody', 'fwForm', 'fwSave', 'fwLogBody']) assert.ok(html.includes(`id="${id}"`), id);
  });
  test('no browser prompt() is left for secrets or links', () => {
    assert.ok(!/\bprompt\(/.test(js));
  });
});

describe('Hub page vs the generic add-panel script', () => {
  test('the manual form opts out of the slide-in panel, so no dead "+ Add integration" button appears', () => {
    const html = read('templates/pages/admin/postback-configs.html');
    assert.match(html, /<form id="pbForm"[^>]*data-no-panel/);
    assert.match(read('static/js/admin-add-panel.js'), /data-no-panel/);
  });
  test('the header button that opens the Connect tab is wired', () => {
    const html = read('templates/pages/admin/postback-configs.html');
    assert.match(html, /<div class="admin-header">\s*<h1>Postback Hub<\/h1>\s*<button[^>]*data-pb-go="connect"/);
  });
});

describe('guides and field hints', () => {
  const html = read('templates/pages/admin/postback-configs.html');
  test('every tab has a guide that is closed by default and can be closed again', () => {
    for (const k of ['overview', 'connect_existing', 'connect_new', 'integrations', 'test', 'forwarding', 'activity', 'advanced']) {
      const m = html.match(new RegExp(`<details class="pbh-guide" data-pb-guide="${k}"[^>]*>`));
      assert.ok(m, k); assert.ok(!/\sopen[\s>]/.test(m[0]), `${k} must start closed`);
    }
    assert.equal((html.match(/data-pb-guide-close/g) || []).length, 8);
  });
  test('the Connect form fields carry a one-line hint', () => {
    for (const id of ['pbwProgram', 'pbwAccount', 'pbnPartner', 'pbnProgram', 'pbnAccount', 'pbwPreset', 'pbwLabel', 'pbTestClickId', 'fwUrl']) {
      assert.match(html, new RegExp(`id="${id}"[^>]*>(?:</select>)?<span class="pbh-hint">`), id);
    }
  });
  test('the manual form exists exactly once, in the Advanced tab, and is still reachable from Integrations', () => {
    assert.equal((html.match(/id="pbForm"/g) || []).length, 1);
    assert.ok(html.indexOf('id="pbForm"') > html.indexOf('data-pb-panel="advanced"'));
    assert.match(html, /data-pb-go="advanced"/);
  });
});
