// Patch 1: click-ID handoff, field-mapping synonyms, status upsert, HMAC canonical signing, CIDR allow-list.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { logEvent } from '../worker/database/analytics.js';
import { createCommercialTerm } from '../worker/database/affiliate-commercial-terms.js';
import { createPostbackConfig, getActiveConfigByToken, listPostbackLogs } from '../worker/database/postback-configs.js';
import { getLinkHandoff, setLinkHandoff } from '../worker/database/tracking-links.js';
import { verifyPostbackAuth, canonicalQuery, ipMatches } from '../worker/postback/auth.js';
import { normalizeConversionPayload } from '../worker/postback/field-mapping.js';
import { ingestPostback, effectiveReference } from '../worker/postback/ingest.js';
import { buildOutboundUrl, validateHandoff, captureClickParams } from '../worker/tracking/click-params.js';

describe('click handoff', () => {
  test('macros in any syntax are filled', () => {
    const u = buildOutboundUrl('https://op.example/p?a=1&sid={clickid}', { clickId: 'abc' });
    assert.match(u, /sid=abc/);
  });
  test('click_id_param appends the click id under the program name', () => {
    const u = buildOutboundUrl('https://op.example/p?a=1', { clickId: 'abc', link: { click_id_param: 'aff_click_id' } });
    assert.equal(u, 'https://op.example/p?a=1&aff_click_id=abc');
  });
  test('inbound sub ids are forwarded under mapped names', () => {
    const captured = captureClickParams(new URLSearchParams('sub3=fb_a&utm_source=fb'));
    const u = buildOutboundUrl('https://op.example/p', { clickId: 'abc', captured, link: { click_id_param: 'sid', sub_param_map: { sub3: 'sub_id3' } } });
    assert.match(u, /sub_id3=fb_a/);
  });
  test('validateHandoff rejects an unsafe parameter name', () => {
    assert.ok(validateHandoff({ click_id_param: 'bad name&x' }).errors.length);
    assert.equal(validateHandoff({ click_id_param: 'anid' }).errors.length, 0);
  });
});

describe('field mapping', () => {
  test('provider aliases and synonyms', () => {
    const n = normalizeConversionPayload({ anid: 'c1', et: 'fd', sum: '50', txid: 't1', status: 'approved' });
    assert.equal(n.click_id, 'c1');
    assert.equal(n.conversion_type, 'ftd');
    assert.equal(n.external_reference, 't1');
    assert.equal(n.status, 'confirmed');
  });
  test('status=lead|sale is treated as the event', () => {
    assert.equal(normalizeConversionPayload({ click_id: 'c', status: 'lead' }).conversion_type, 'registration');
    assert.equal(normalizeConversionPayload({ click_id: 'c', status: 'sale' }).conversion_type, 'deposit');
  });
  test('unix seconds timestamp becomes ISO', () => {
    const n = normalizeConversionPayload({ click_id: 'c', conversion_type: 'ftd', timestamp: '1760000000' });
    assert.match(n.occurred_at, /^2025-10-09T/);
  });
});

describe('effectiveReference', () => {
  test('negative types get a suffix, one-offs get an auto key, repeatables warn', () => {
    assert.equal(effectiveReference({ conversion_type: 'refund', external_reference: 'x' }).reference, 'x#refund');
    assert.equal(effectiveReference({ conversion_type: 'ftd', click_id: 'c' }).reference, 'auto:c:ftd');
    assert.ok(effectiveReference({ conversion_type: 'deposit', click_id: 'c' }).warnings.length);
  });
});

describe('auth', () => {
  test('GET hmac signs the canonical query', async () => {
    const params = { click_id: 'c', event: 'ftd' };
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('s3cret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(canonicalQuery(params, 'signature')));
    params.signature = Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, '0')).join('');
    const config = { auth_method: 'hmac_sha256', credential_reference: 'SEC', signature_param: 'signature' };
    assert.equal((await verifyPostbackAuth({ SEC: 's3cret' }, config, { rawParams: params, rawBody: '', sourceIp: null })).valid, true);
    params.event = 'deposit';
    assert.equal((await verifyPostbackAuth({ SEC: 's3cret' }, config, { rawParams: params, rawBody: '', sourceIp: null })).valid, false);
  });
  test('CIDR matching and malformed allow-list fail closed', async () => {
    assert.equal(ipMatches('203.0.113.0/24', '203.0.113.9'), true);
    assert.equal(ipMatches('203.0.113.0/24', '198.51.100.1'), false);
    const r = await verifyPostbackAuth({ SEC: 'x' }, { auth_method: 'shared_secret', credential_reference: 'SEC', signature_param: 'secret', allowed_ips: '{bad' }, { rawParams: { secret: 'x' }, rawBody: '', sourceIp: '1.2.3.4' });
    assert.equal(r.valid, false);
  });
});

describe('status upsert and log', () => {
  let db, config;
  beforeEach(async () => {
    db = createTestDb(); applyMigrations(db);
    await db.prepare(`INSERT INTO users (id, email, password_hash, role) VALUES (1,'a@t.l','x','admin')`).run();
    await db.prepare(`INSERT INTO affiliate_partners (id,name,slug,status,created_by) VALUES (1,'P','p','active',1)`).run();
    await db.prepare(`INSERT INTO affiliate_programs (id,partner_id,name,status,created_by) VALUES (10,1,'Pr','active',1)`).run();
    await db.prepare(`INSERT INTO affiliate_accounts (id,program_id,account_name,status,credential_reference,created_by) VALUES (100,10,'A','active','S',1)`).run();
    await db.prepare(`INSERT INTO casinos (id,name,slug,website_url,affiliate_url,created_by) VALUES (200,'C','c','https://x.example','https://a.example',1)`).run();
    await db.prepare(`INSERT INTO tracking_links (id,internal_name,tracking_code,destination_url,casino_id,partner_id,program_id,status) VALUES (300,'L','l','https://o.example',200,1,10,'active')`).run();
    const created = await createPostbackConfig(db, { account_id: 100, label: 'T', auth_method: 'shared_secret', credential_reference: 'S', signature_param: 'secret', created_by: 1 });
    config = await getActiveConfigByToken(db, created.endpoint_token);
    await logEvent(db, { eventType: 'TRACKING_LINK_CLICK', casinoId: 200, trackingLinkId: 300, partnerId: 1, programId: 10, clickId: 'ck1' });
  });
  const send = (p) => ingestPostback(db, { config, normalized: normalizeConversionPayload({ click_id: 'ck1', conversion_type: 'ftd', external_reference: 'tx1', currency: 'EUR', reported_value: 100, ...p }) });

  test('pending -> confirmed updates in place; confirmed never goes back to pending', async () => {
    const a = await send({ status: 'pending' });
    assert.equal(a.outcome, 'accepted');
    const b = await send({ status: 'confirmed' });
    assert.equal(b.outcome, 'updated');
    const c = await send({ status: 'pending' });
    assert.notEqual(c.outcome, 'updated');
    const rows = (await db.prepare('SELECT status FROM analytics_conversions').all()).results;
    assert.deepEqual(rows.map((r) => r.status), ['confirmed']);
  });
  test('rejected is final', async () => {
    await send({ status: 'pending' });
    await send({ status: 'rejected' });
    await send({ status: 'confirmed' });
    const rows = (await db.prepare('SELECT status FROM analytics_conversions').all()).results;
    assert.deepEqual(rows.map((r) => r.status), ['rejected']);
  });
  test('link handoff round trip and log listing', async () => {
    await setLinkHandoff(db, 300, { click_id_param: 'anid', sub_param_map: JSON.stringify({ sub1: 'sub_id1' }) });
    const h = await getLinkHandoff(db, 300);
    assert.equal(h.click_id_param, 'anid');
    await db.prepare(`INSERT INTO postback_logs (postback_config_id, outcome, reason) VALUES (?, 'accepted', 'ok')`).bind(config.id).run().catch(() => {});
    const logs = await listPostbackLogs(db, { configId: config.id });
    assert.ok(Array.isArray(logs));
  });
});
