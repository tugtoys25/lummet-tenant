// Patch 3: funnel, earnings by sub-ID, payouts and invoices, promo codes, creatives, and the admin API.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { logEvent, recordConversion } from '../worker/database/analytics.js';
import * as E from '../worker/database/earnings.js';
import { normalizeConversionPayload } from '../worker/postback/field-mapping.js';
import { ingestPostback } from '../worker/postback/ingest.js';
import { createPostbackConfig, getActiveConfigByToken } from '../worker/database/postback-configs.js';
import { clickEventFields, captureClickParams } from '../worker/tracking/click-params.js';

async function seed(db) {
  await db.prepare(`INSERT INTO users (id, email, password_hash, role) VALUES (1,'a@t.l','x','admin')`).run();
  await db.prepare(`INSERT INTO affiliate_partners (id,name,slug,status,created_by) VALUES (1,'P','p','active',1)`).run();
  await db.prepare(`INSERT INTO affiliate_programs (id,partner_id,name,status,created_by) VALUES (10,1,'Alpha','active',1)`).run();
  await db.prepare(`INSERT INTO affiliate_accounts (id,program_id,account_name,status,credential_reference,created_by) VALUES (100,10,'A','active','S',1)`).run();
  await db.prepare(`INSERT INTO casinos (id,name,slug,website_url,affiliate_url,created_by) VALUES (200,'C','c','https://x.example','https://a.example',1)`).run();
  await db.prepare(`INSERT INTO tracking_links (id,internal_name,tracking_code,destination_url,casino_id,partner_id,program_id,status) VALUES (300,'L','l','https://o.example',200,1,10,'active')`).run();
}
const click = (db, id, qs) => logEvent(db, { eventType: 'TRACKING_LINK_CLICK', casinoId: 200, trackingLinkId: 300, partnerId: 1, programId: 10, clickId: id, ...clickEventFields(captureClickParams(new URLSearchParams(qs))) });
const conv = (db, clickId, type, status, value, commission, ref, at = '2026-11-05 10:00:00') => db.prepare(
  `INSERT INTO analytics_conversions (click_id, tracking_link_id, casino_id, partner_id, program_id, account_id, conversion_type, status, reported_value, calculated_commission, currency, external_reference, occurred_at, source)
   VALUES (?,300,200,1,10,100,?,?,?,?,'USD',?,?, 'postback')`).bind(clickId, type, status, value, commission, ref, at).run();

describe('funnel and sub-ID report', () => {
  let db;
  beforeEach(async () => {
    db = createTestDb(); applyMigrations(db); await seed(db);
    await click(db, 'c1', 'sub1=fb&sub2=a'); await click(db, 'c2', 'sub1=fb'); await click(db, 'c3', 'sub1=tg&utm_source=tg'); await click(db, 'c4', '');
    await conv(db, 'c1', 'registration', 'confirmed', 0, 0, 'r1');
    await conv(db, 'c1', 'ftd', 'confirmed', 100, 40, 'f1');
    await conv(db, 'c2', 'registration', 'pending', 0, 0, 'r2');
    await conv(db, 'c3', 'ftd', 'pending', 50, 20, 'f3');
    await conv(db, 'c3', 'registration', 'rejected', 0, 0, 'r3');
  });
  test('funnel counts clicks, registrations and first deposits per program, with rates', async () => {
    const f = await E.getFunnel(db, {});
    assert.equal(f.programs.length, 1);
    const p = f.programs[0];
    assert.equal(p.name, 'Alpha'); assert.equal(p.clicks, 4); assert.equal(p.registrations, 2); assert.equal(p.ftd, 2); assert.equal(p.rejected, 1);
    assert.equal(p.commission_confirmed.USD, 40); assert.equal(p.commission_pending.USD, 20);
    assert.equal(f.rates.click_to_registration, 50); assert.equal(f.rates.registration_to_ftd, 100);
  });
  test('the period filter applies to both clicks and conversions', async () => {
    const f = await E.getFunnel(db, { from: '2030-01-01' });
    assert.equal(f.programs.length, 0);
  });
  test('sub1 report groups traffic and joins conversions through the click id', async () => {
    const r = await E.getSubIdReport(db, { key: 'sub1' });
    const fb = r.rows.find((x) => x.key === 'fb'); const tg = r.rows.find((x) => x.key === 'tg'); const none = r.rows.find((x) => x.key === '(none)');
    assert.equal(fb.clicks, 2); assert.equal(fb.registrations, 2); assert.equal(fb.ftd, 1); assert.equal(fb.commission_confirmed.USD, 40);
    assert.equal(tg.clicks, 1); assert.equal(tg.ftd, 1); assert.equal(tg.commission_pending.USD, 20); assert.equal(tg.registrations, 0, 'rejected registrations are not counted');
    assert.equal(none.clicks, 1);
  });
  test('utm and unknown keys', async () => {
    const r = await E.getSubIdReport(db, { key: 'utm_source' });
    assert.ok(r.rows.find((x) => x.key === 'tg'));
    await assert.rejects(() => E.getSubIdReport(db, { key: "sub1') OR 1=1 --" }));
  });
});

describe('payouts, balances and invoices', () => {
  let db;
  beforeEach(async () => {
    db = createTestDb(); applyMigrations(db); await seed(db);
    await conv(db, null, 'ftd', 'confirmed', 100, 40, 'a', '2026-10-10 10:00:00');
    await conv(db, null, 'revshare', 'confirmed', 0, 10, 'b', '2026-10-20 10:00:00');
    await conv(db, null, 'ftd', 'confirmed', 100, 70, 'c', '2026-11-05 10:00:00');
    await conv(db, null, 'ftd', 'pending', 100, 99, 'd', '2026-11-06 10:00:00');
  });
  test('validatePayout', () => {
    assert.ok(E.validatePayout({ program_id: 10, amount: -1 }).errors.length);
    assert.ok(E.validatePayout({ program_id: 10, amount: 5, currency: 'usdd' }).errors.length);
    assert.equal(E.validatePayout({ program_id: 10, amount: 5, status: 'paid' }).value.paid_at.length, 10);
  });
  test('invoice totals confirmed commission only, by type, and records an invoiced payout', async () => {
    const out = await E.createInvoice(db, { programId: 10, currency: 'USD', from: '2026-10-01', to: '2026-10-31' });
    assert.equal(out.invoice.total, 50);
    assert.deepEqual(out.invoice.lines.map((l) => l.type), ['ftd', 'revshare']);
    assert.match(out.invoice.number, /^INV-202610-10-0001$/);
    const b = (await E.getBalances(db))[0];
    assert.equal(b.confirmed, 120); assert.equal(b.pending, 99); assert.equal(b.invoiced, 50); assert.equal(b.paid, 0); assert.equal(b.outstanding, 120);
  });
  test('an overlapping period is refused and an empty period too', async () => {
    await E.createInvoice(db, { programId: 10, currency: 'USD', from: '2026-10-01', to: '2026-10-31' });
    assert.match((await E.createInvoice(db, { programId: 10, currency: 'USD', from: '2026-10-15', to: '2026-11-15' })).error, /overlaps/);
    assert.match((await E.createInvoice(db, { programId: 10, currency: 'EUR', from: '2026-10-01', to: '2026-10-31' })).error, /No confirmed/);
  });
  test('paying reduces what is outstanding', async () => {
    const v = E.validatePayout({ program_id: 10, amount: 50, currency: 'USD', status: 'paid', paid_at: '2026-11-10' }).value;
    await E.savePayout(db, v);
    assert.equal((await E.getBalances(db))[0].outstanding, 70);
    const list = await E.listPayouts(db, {});
    assert.equal(list[0].program_name, 'Alpha');
  });
});

describe('promo codes', () => {
  let db;
  beforeEach(async () => { db = createTestDb(); applyMigrations(db); await seed(db); });
  test('validatePromo and unique codes', async () => {
    assert.ok(E.validatePromo({ code: 'a b' }).errors.length);
    await E.savePromo(db, E.validatePromo({ code: 'WELCOME', program_id: 10 }).value);
    await assert.rejects(() => E.savePromo(db, E.validatePromo({ code: 'WELCOME' }).value));
  });
  test('results come from the code a postback reported and from the bound tracking link', async () => {
    await E.savePromo(db, E.validatePromo({ code: 'FREE10', program_id: 10 }).value);
    await E.savePromo(db, E.validatePromo({ code: 'LINKCODE', tracking_link_id: 300 }).value);
    await click(db, 'k1', '');
    const created = await createPostbackConfig(db, { account_id: 100, label: 'T', auth_method: 'shared_secret', credential_reference: 'S', signature_param: 'secret', created_by: 1 });
    const config = await getActiveConfigByToken(db, created.endpoint_token);
    const n = normalizeConversionPayload({ click_id: 'k1', event: 'ftd', status: 'confirmed', amount: '100', currency: 'USD', transaction_id: 't1', promo: 'free10' });
    assert.equal(n.promo_code, 'free10');
    const r = await ingestPostback(db, { config, normalized: n });
    assert.equal(r.outcome, 'accepted');
    const promos = await E.listPromos(db);
    assert.equal(promos.find((p) => p.code === 'FREE10').conversions, 1, 'matched on the reported code, case-insensitively');
    assert.equal(promos.find((p) => p.code === 'LINKCODE').conversions, 1, 'matched through the tracking link');
  });
});

describe('creatives', () => {
  test('validate and list with conversions per link', async () => {
    const db = createTestDb(); applyMigrations(db); await seed(db);
    assert.ok(E.validateCreative({ name: '' }).errors.length);
    assert.ok(E.validateCreative({ name: 'x', asset_url: 'javascript:alert(1)' }).errors.length);
    await E.saveCreative(db, E.validateCreative({ name: 'Banner 300x250', kind: 'banner', asset_url: 'https://cdn.example/b.png', width: 300, height: 250, tracking_link_id: 300, program_id: 10 }).value);
    await conv(db, null, 'ftd', 'confirmed', 1, 1, 'z');
    const list = await E.listCreatives(db);
    assert.equal(list[0].conversions, 1); assert.equal(list[0].tracking_code, 'l'); assert.equal(list[0].program_name, 'Alpha');
  });
});

describe('admin API', () => {
  let db;
  beforeEach(async () => { db = createTestDb(); applyMigrations(db); await seed(db); await conv(db, null, 'ftd', 'confirmed', 100, 40, 'a', '2026-10-10 10:00:00'); });
  const call = async (path, method, body) => {
    const { route } = await import('../worker/api/routes/earnings.js');
    const res = await route({ request: new Request(`https://s.example/en${path}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), env: { DB: db }, path: path.split('?')[0], user: { user_id: 1, role: 'admin' } });
    return res.json();
  };
  test('reports, invoice and promo endpoints', async () => {
    assert.equal((await call('/api/v1/earnings/funnel', 'GET')).success, true);
    assert.equal((await call('/api/v1/earnings/subids?key=sub3', 'GET')).key, 'sub3');
    assert.equal((await call('/api/v1/earnings/subids?key=bad', 'GET')).success, false);
    const inv = await call('/api/v1/earnings/invoice/create', 'POST', { program_id: 10, from: '2026-10-01', to: '2026-10-31', currency: 'USD' });
    assert.equal(inv.invoice.total, 40);
    assert.equal((await call('/api/v1/earnings/invoice/create', 'POST', { program_id: 10, from: '2026-10-01', to: '2026-10-31', currency: 'USD' })).success, false);
    assert.equal((await call('/api/v1/earnings/invoice/create', 'POST', { program_id: 10, from: 'bad', to: '2026-10-31' })).success, false);
    const p = await call('/api/v1/earnings/promo-codes/save', 'POST', { code: 'X1' });
    assert.ok(p.id);
    assert.equal((await call('/api/v1/earnings/promo-codes/save', 'POST', { code: 'X1' })).success, false);
    const list = await call('/api/v1/earnings/payouts/list', 'GET');
    assert.equal(list.payouts[0].status, 'invoiced');
    assert.equal((await call('/api/v1/earnings/payouts/delete', 'POST', { id: list.payouts[0].id })).success, true);
  });
});
