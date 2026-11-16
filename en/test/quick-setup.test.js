// A casino that only has its own affiliate URL (no program, account or tracking link) can still get a postback integration in one step.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { quickSetup } from '../worker/postback/quick-setup.js';
import { getLinkHandoff } from '../worker/database/tracking-links.js';
import { resolveRedirectTarget } from '../worker/tracking/redirect.js';
import { createPostbackConfig } from '../worker/database/postback-configs.js';
import { getPreset } from '../worker/postback/presets.js';

describe('quick setup for a casino with only a legacy affiliate URL', () => {
  let db;
  beforeEach(async () => {
    db = createTestDb(); applyMigrations(db);
    await db.prepare(`INSERT INTO users (id, email, password_hash, role) VALUES (1,'a@t.l','x','admin')`).run();
    await db.prepare(`INSERT INTO casinos (id,name,slug,website_url,affiliate_url,created_by) VALUES (200,'Pin-Up','pinup','https://pin.example','https://partner.example/ref?stream=1',1)`).run();
    await db.prepare(`INSERT INTO casinos (id,name,slug,website_url,affiliate_url,created_by) VALUES (201,'NoUrl','nourl','https://n.example','',1)`).run();
  });

  test('creates the partner, program, account and a tracking link with the click id handed over', async () => {
    const r = await quickSetup(db, { programName: 'Pin-Up Partners (documented)', casinoId: 200, clickIdParam: 'sub_id1', userId: 1 });
    assert.deepEqual(r.created.sort(), ['account', 'partner', 'program', 'tracking_link']);
    const link = await db.prepare('SELECT * FROM tracking_links WHERE id = ?').bind(r.tracking_link.id).first();
    assert.equal(link.destination_url, 'https://partner.example/ref?stream=1');
    assert.equal(link.casino_id, 200); assert.equal(link.program_id, r.program_id);
    assert.equal((await getLinkHandoff(db, link.id)).click_id_param, 'sub_id1');
    assert.equal((await db.prepare('SELECT name FROM affiliate_programs WHERE id = ?').bind(r.program_id).first()).name, 'Pin-Up Partners');
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM affiliate_program_casinos WHERE program_id = ? AND casino_id = 200').bind(r.program_id).first()).n, 1);
    // the casino's public /go/<slug> now goes through the link, so every existing button carries the click id
    const target = await resolveRedirectTarget(db, { identifier: 'pinup', countryCode: 'DE' });
    assert.equal(target.type, 'tracking_link');
    assert.equal(target.trackingLink.id, r.tracking_link.id);
  });

  test('a postback integration can then be created on the new account', async () => {
    const r = await quickSetup(db, { programName: getPreset('pinup').name, casinoId: 200, clickIdParam: getPreset('pinup').click_id_param, userId: 1 });
    const cfg = await createPostbackConfig(db, { account_id: r.account_id, label: 'P', auth_method: 'shared_secret', credential_reference: 'managed', created_by: 1 });
    assert.ok(cfg);
  });

  test('running it again reuses everything and never duplicates', async () => {
    const a = await quickSetup(db, { programName: 'Pin-Up Partners', casinoId: 200, clickIdParam: 'sub_id1', userId: 1 });
    const b = await quickSetup(db, { programName: 'Pin-Up Partners', casinoId: 200, clickIdParam: 'sub_id1', userId: 1 });
    assert.deepEqual(b.created, []);
    assert.equal(b.account_id, a.account_id); assert.equal(b.tracking_link.id, a.tracking_link.id);
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM tracking_links').first()).n, 1);
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM affiliate_partners').first()).n, 1);
  });

  test('an existing program is reused, and a casino without an https affiliate URL gets a clear refusal', async () => {
    await db.prepare(`INSERT INTO affiliate_partners (id,name,slug,status,created_by) VALUES (5,'Mine','mine','active',1)`).run();
    await db.prepare(`INSERT INTO affiliate_programs (id,partner_id,name,status,created_by) VALUES (50,5,'My program','active',1)`).run();
    const r = await quickSetup(db, { programId: 50, casinoId: 200, clickIdParam: 'sub1', userId: 1 });
    assert.equal(r.program_id, 50); assert.ok(r.created.includes('account')); assert.ok(!r.created.includes('program'));
    await assert.rejects(() => quickSetup(db, { programId: 50, casinoId: 201, userId: 1 }), /no https affiliate URL/);
    await assert.rejects(() => quickSetup(db, { programId: 999, userId: 1 }), /not found/);
  });
});
