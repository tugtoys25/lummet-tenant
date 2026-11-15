// Patch 2: program presets, URL builder, custom definitions, and the real round trip (build a URL, send what a program would, ingest it).
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { logEvent } from '../worker/database/analytics.js';
import { createPostbackConfig, getActiveConfigByToken } from '../worker/database/postback-configs.js';
import { normalizeConversionPayload, validateNormalized } from '../worker/postback/field-mapping.js';
import { ingestPostback } from '../worker/postback/ingest.js';
import { PRESETS, listPresets, getPreset, buildPostbackSetup, validateCustomDefinition } from '../worker/postback/presets.js';
import { buildOutboundUrl } from '../worker/tracking/click-params.js';
import { readFileSync } from 'node:fs';

const origin = 'https://site.example';

// Substitute macros the way a program would, then parse the query into the flat object the handler reads.
function fire(url, values) {
  const filled = url.replace(/\{\{?([A-Za-z0-9_.-]+)\}?\}|\[([A-Za-z0-9_.-]+)\]|\$\{([A-Za-z0-9_.-]+)\}|##([A-Za-z0-9_.-]+)##/g, (m, a, b, c, d) => encodeURIComponent(values[a || b || c || d] ?? ''));
  return Object.fromEntries(new URL(filled).searchParams);
}

describe('presets catalogue', () => {
  test('ids are unique and every preset is well formed', () => {
    assert.equal(new Set(PRESETS.map((p) => p.id)).size, PRESETS.length);
    assert.ok(PRESETS.length >= 15);
    for (const p of PRESETS) {
      assert.ok(p.name && p.click_id_param, p.id);
      assert.ok(['documented', 'partial', 'typical'].includes(p.confidence), p.id);
      assert.ok(p.query.some((r) => r.field === 'click_id'), `${p.id} needs a click id row`);
      assert.ok(p.events.length, p.id);
    }
  });
  test('list and get', () => {
    assert.equal(listPresets().length, PRESETS.length);
    assert.equal(getPreset('pinup').click_id_param, 'sub_id1');
    assert.equal(getPreset('nope'), null);
  });
});

describe('every preset produces URLs our own handler accepts', () => {
  for (const preset of PRESETS) {
    test(preset.id, () => {
      const setup = buildPostbackSetup({ origin, token: 'TOK', preset, secretPlaceholder: 'S3CRET' });
      assert.ok(setup.urls.length);
      for (const u of setup.urls) {
        assert.ok(u.url.startsWith(`${origin}/en/api/v1/conversions/postback/TOK?`));
        assert.match(u.url, /secret=S3CRET/);
        const values = { CLICK_ID: 'ck1', POSTBACK_ID: 'tx1', CPA_AMOUNT: '12.5', clickID: 'ck1', subId1: 'ck1', clickId: 'tx9', anid: 'ck1', aff_click_id: 'ck1', click_id: 'ck1', afp: 'ck1', dyn: 'ck1', aff_sub: 'ck1', subid: 'ck1', clickid: 'ck1', cid: 'ck1',
          sum: '100', amount: '100', payout: '25', payment: '25', currency: 'EUR', country: 'DE', traderId: 'p9', transaction_id: 'tx1', txid: 'tx1', tid: 'tx1',
          timestamp: '1760000000', event: 'ftd', event_type: 'ftd', et: 'ftd', status: 'approved' };
        const raw = fire(u.url, values);
        const n = normalizeConversionPayload(raw, setup.field_mapping);
        assert.equal(n.click_id, 'ck1');
        const v = validateNormalized(n);
        assert.equal(v.valid, true, `${preset.id}/${u.event}: ${JSON.stringify(v.errors)} ${JSON.stringify(n)}`);
      }
    });
  }
});

describe('builder details', () => {
  test('macro syntaxes', () => {
    const def = { id: 'c', name: 'c', syntax: '{{}}', event_mode: 'separate', events: ['ftd'], query: [{ field: 'click_id', param: 'click_id', macro: 'cid' }] };
    assert.match(buildPostbackSetup({ origin, token: 't', custom: def }).urls[0].url, /click_id=\{\{cid\}\}/);
    assert.match(buildPostbackSetup({ origin, token: 't', custom: { ...def, syntax: '[]' } }).urls[0].url, /click_id=\[cid\]/);
    assert.match(buildPostbackSetup({ origin, token: 't', custom: { ...def, syntax: '${}' } }).urls[0].url, /click_id=\$\{cid\}/);
  });
  test('magic click uses status=lead|sale and no amount', () => {
    const s = buildPostbackSetup({ origin, token: 't', preset: getPreset('magicclick') });
    assert.deepEqual(s.urls.map((u) => u.event), ['registration', 'deposit']);
    assert.match(s.urls[0].url, /status=lead/);
    assert.match(s.urls[1].url, /status=sale/);
  });
  test('without a token a placeholder is shown', () => {
    assert.match(buildPostbackSetup({ origin, preset: getPreset('pinup') }).urls[0].url, /postback\/<token>\?/);
  });
  test('the click-id name for links comes back and feeds the redirect builder', () => {
    const s = buildPostbackSetup({ origin, token: 't', preset: getPreset('parimatch') });
    assert.equal(s.tracking_link.click_id_param, 'anid');
    assert.match(buildOutboundUrl('https://op.example/p?a=1', { clickId: 'abc', link: s.tracking_link }), /anid=abc/);
  });
});

describe('custom definitions', () => {
  const rows = (extra = []) => [{ field: 'click_id', param: 'click_id', macro: 'cid' }, ...extra];
  test('valid definition', () => {
    const r = validateCustomDefinition({ name: 'X', syntax: '[]', event_mode: 'separate', rows: rows([{ field: 'reported_value', param: 'amount', macro: 'sum' }]), click_id_param: 'sid' });
    assert.equal(r.errors.length, 0);
    assert.equal(r.value.query.length, 2);
  });
  test('click id is required, names are checked, unknown fields refused', () => {
    assert.ok(validateCustomDefinition({ rows: [] }).errors.some((e) => /click id/i.test(e)));
    assert.ok(validateCustomDefinition({ rows: rows([{ field: 'currency', param: 'bad name', macro: 'cur' }]) }).errors.length);
    assert.ok(validateCustomDefinition({ rows: rows([{ field: 'nope', param: 'a', macro: 'b' }]) }).errors.length);
    assert.ok(validateCustomDefinition({ rows: rows(), events: ['bogus'] }).errors.length);
  });
  test('empty rows are skipped', () => {
    const r = validateCustomDefinition({ rows: rows([{ field: 'currency', param: '', macro: '' }]) });
    assert.equal(r.value.query.length, 1);
  });
});

describe('end to end: preset URL -> program fires it -> conversion stored', () => {
  let db, config;
  beforeEach(async () => {
    db = createTestDb(); applyMigrations(db);
    await db.prepare(`INSERT INTO users (id, email, password_hash, role) VALUES (1,'a@t.l','x','admin')`).run();
    await db.prepare(`INSERT INTO affiliate_partners (id,name,slug,status,created_by) VALUES (1,'P','p','active',1)`).run();
    await db.prepare(`INSERT INTO affiliate_programs (id,partner_id,name,status,created_by) VALUES (10,1,'Pr','active',1)`).run();
    await db.prepare(`INSERT INTO affiliate_accounts (id,program_id,account_name,status,credential_reference,created_by) VALUES (100,10,'A','active','S',1)`).run();
    await db.prepare(`INSERT INTO casinos (id,name,slug,website_url,affiliate_url,created_by) VALUES (200,'C','c','https://x.example','https://a.example',1)`).run();
    await db.prepare(`INSERT INTO tracking_links (id,internal_name,tracking_code,destination_url,casino_id,partner_id,program_id,status) VALUES (300,'L','l','https://o.example',200,1,10,'active')`).run();
    await logEvent(db, { eventType: 'TRACKING_LINK_CLICK', casinoId: 200, trackingLinkId: 300, partnerId: 1, programId: 10, clickId: 'ck1' });
  });
  async function configFor(preset) {
    const setup = buildPostbackSetup({ origin, token: 'TOK', preset });
    const created = await createPostbackConfig(db, { account_id: 100, label: preset.id, auth_method: 'shared_secret', credential_reference: 'S', signature_param: 'secret', field_mapping_json: setup.field_mapping_json, created_by: 1 });
    config = await getActiveConfigByToken(db, created.endpoint_token);
    return setup;
  }
  test('Pin-Up registration then deposit', async () => {
    const setup = await configFor(getPreset('pinup'));
    const reg = setup.urls.find((u) => u.event === 'registration');
    const raw = fire(reg.url, { subId1: 'ck1', clickId: 'pb-1', traderId: 'p9', sum: '0', payment: '0', currency: 'EUR', country: 'DE', timestamp: '1760000000' });
    const r = await ingestPostback(db, { config, normalized: normalizeConversionPayload(raw, config.field_mapping_json) });
    assert.equal(r.outcome, 'accepted');
    const again = await ingestPostback(db, { config, normalized: normalizeConversionPayload(raw, config.field_mapping_json) });
    assert.notEqual(again.outcome, 'accepted', 'a repeated registration must not be stored twice');
    const dep = setup.urls.find((u) => u.event === 'deposit');
    const d = (id) => normalizeConversionPayload(fire(dep.url, { subId1: 'ck1', clickId: id, traderId: 'p9', sum: '20', payment: '4', currency: 'USD', country: 'DE', timestamp: '1760000100' }), config.field_mapping_json);
    assert.equal((await ingestPostback(db, { config, normalized: d('pb-2') })).outcome, 'accepted');
    assert.equal((await ingestPostback(db, { config, normalized: d('pb-3') })).outcome, 'accepted', 'a second deposit has its own postback id and is kept');
    assert.notEqual((await ingestPostback(db, { config, normalized: d('pb-3') })).outcome, 'accepted', 'the same postback id twice is a duplicate');
  });
  test('Magic Click lead', async () => {
    const setup = await configFor(getPreset('magicclick'));
    const raw = fire(setup.urls[0].url, { aff_click_id: 'ck1' });
    const r = await ingestPostback(db, { config, normalized: normalizeConversionPayload(raw, config.field_mapping_json) });
    assert.equal(r.outcome, 'accepted');
    const row = await db.prepare('SELECT conversion_type FROM analytics_conversions').first();
    assert.equal(row.conversion_type, 'registration');
  });
});

describe('wiring', () => {
  test('the wizard markup and script are present and the template has no stray double braces', () => {
    const html = readFileSync(new URL('../templates/pages/admin/postback-configs.html', import.meta.url), 'utf8');
    assert.match(html, /id="pbWizard"/);
    assert.deepEqual(html.match(/\{\{[^}]*\}\}/g), ['{{admin_nav}}']);
    const js = readFileSync(new URL('../static/js/postback-config-admin.js', import.meta.url), 'utf8');
    assert.match(js, /postback-config\/presets/);
    assert.match(js, /tracking-link\/handoff/);
  });
  test('routes are gated', () => {
    const gate = readFileSync(new URL('../worker/api/gate.js', import.meta.url), 'utf8');
    assert.match(gate, /"\/api\/v1\/postback-config\/presets": "postback_configs"/);
  });
});

describe('admin routes', () => {
  let db;
  beforeEach(async () => {
    db = createTestDb(); applyMigrations(db);
    await db.prepare(`INSERT INTO users (id, email, password_hash, role) VALUES (1,'a@t.l','x','admin')`).run();
    await db.prepare(`INSERT INTO casinos (id,name,slug,website_url,affiliate_url,created_by) VALUES (200,'C','c','https://x.example','https://a.example',1)`).run();
    await db.prepare(`INSERT INTO tracking_links (id,internal_name,tracking_code,destination_url,casino_id,status) VALUES (300,'L','l','https://o.example',200,'active')`).run();
  });
  const call = async (mod, path, method, body) => {
    const { route } = await import(mod);
    const res = await route({ request: new Request(`${origin}/en${path}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), env: { DB: db }, path, user: { user_id: 1, role: 'admin' } });
    return res.json();
  };
  test('presets list and build', async () => {
    const list = await call('../worker/api/routes/postback-configs.js', '/api/v1/postback-config/presets', 'GET');
    assert.ok(list.presets.length >= 15);
    const built = await call('../worker/api/routes/postback-configs.js', '/api/v1/postback-config/build', 'POST', { preset_id: 'pinup' });
    assert.match(built.setup.urls[0].url, /^https:\/\/site\.example\/en\/api\/v1\/conversions\/postback\/<token>\?/);
    const bad = await call('../worker/api/routes/postback-configs.js', '/api/v1/postback-config/build', 'POST', { custom: { rows: [] } });
    assert.equal(bad.success, false);
  });
  test('handoff sets the click-id name on several links and keeps the sub-id map', async () => {
    const { setLinkHandoff, getLinkHandoff } = await import('../worker/database/tracking-links.js');
    await setLinkHandoff(db, 300, { click_id_param: 'old', sub_param_map: JSON.stringify({ sub1: 'sub_id1' }) });
    const r = await call('../worker/api/routes/tracking-links.js', '/api/v1/tracking-link/handoff', 'POST', { ids: [300], click_id_param: 'anid' });
    assert.equal(r.updated, 1);
    const h = await getLinkHandoff(db, 300);
    assert.equal(h.click_id_param, 'anid');
    assert.equal(h.sub_param_map, JSON.stringify({ sub1: 'sub_id1' }));
    const bad = await call('../worker/api/routes/tracking-links.js', '/api/v1/tracking-link/handoff', 'POST', { ids: [300], click_id_param: 'bad name' });
    assert.equal(bad.success, false);
  });
});

import { buildPostbackSetup as _bps, getPreset as _gp } from '../worker/postback/presets.js';
test('Affilka preset follows the platform manual: ${} macros, one URL per action, clickID round trip', () => {
  const r = _bps({ origin: 'https://s.example', token: 'T', preset: _gp('affilka') });
  assert.equal(r.confidence, 'documented');
  assert.deepEqual(r.urls.map((u) => u.event), ['registration', 'qualified_lead', 'ftd', 'deposit']);
  assert.match(r.urls[2].url, /click_id=\$\{clickID\}&amount=\$\{amount\}&currency=\$\{currency\}.*event=ftd$/);
  assert.equal(r.tracking_link.click_id_param, 'clickID');
});

test('Pin-Up preset: our click id rides in subId1, their clickId is the transaction id', () => {
  const r = _bps({ origin: 'https://s.example', token: 'T', preset: _gp('pinup') });
  assert.deepEqual(r.urls.map((u) => u.event), ['registration', 'qualified_lead', 'ftd', 'deposit']);
  assert.match(r.urls[2].url, /click_id=\{subId1\}&transaction_id=\{clickId\}&player_id=\{traderId\}&amount=\{sum\}&payout=\{payment\}/);
  assert.equal(r.tracking_link.click_id_param, 'sub_id1');
  assert.equal(r.field_mapping.external_reference, 'transaction_id');
});

test('V.Partners preset: ##MACROS##, status postbacks for hold, approve and reject', () => {
  const r = _bps({ origin: 'https://s.example', token: 'T', preset: _gp('vpartners') });
  assert.deepEqual(r.urls.map((u) => u.event), ['registration', 'ftd', 'deposit', 'revshare', 'lead_hold', 'lead_approve', 'lead_reject']);
  assert.match(r.urls[1].url, /click_id=##CLICK_ID##&transaction_id=##POSTBACK_ID##&payout=##CPA_AMOUNT##&currency=##CURRENCY##&event=ftd$/);
  assert.match(r.urls[5].url, /event=cpa_conversion&status=confirmed$/);
  assert.equal(r.field_mapping.status, 'status');
});

import { readFileSync as _read } from 'node:fs';
test('every integration row offers Setup links, which rebuilds the finished URLs from its own token and secret', () => {
  const js = _read(new URL('../static/js/postback-config-admin.js', import.meta.url), 'utf8');
  assert.match(js, /onclick="showSetupLinks\(\$\{c\.id\}\)"/);
  assert.match(js, /async function showSetupLinks/);
  assert.match(js, /secret\/reveal[\s\S]*postback-config\/build[\s\S]*config_id: id/);
});

test('connect wizard has a program picker that filters accounts and preselects a program matching the chosen preset', () => {
  const js = _read(new URL('../static/js/postback-config-admin.js', import.meta.url), 'utf8');
  const html = _read(new URL('../templates/pages/admin/postback-configs.html', import.meta.url), 'utf8');
  assert.match(html, /id="pbwProgram"/);
  assert.match(js, /function pbwFilterAccounts/);
  assert.match(js, /function pbwPickProgramFor/);
  // the name matching rule, run on the real preset names
  const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const keyOf = (name) => { const full = norm(String(name).replace(/\(.*$/, '')); const short = full.replace(/partners?$/, ''); return short.length >= 3 ? short : full; };
  const match = (preset, program) => { const k = keyOf(preset); return norm(program).includes(k) || k.includes(norm(program)); };
  assert.ok(match('Pin-Up Partners', 'Pin-Up Partners'));
  assert.ok(match('Pin-Up Partners', 'PinUp'));
  assert.ok(match('Affilka (affiliate programs on the Affilka platform)', 'Affilka Network'));
  assert.ok(!match('V.Partners (Vegas and its brands)', 'Pin-Up Partners'));
});
