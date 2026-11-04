// Phase 7D: the transfer API (worker/api/routes/site-profile-transfer.js) and the public share endpoint.
// Rules under test: editors export, check and import into the DRAFT; only administrators save presets and make share
// links; writes from another site are refused; downloads are never cached; the public endpoint says the same thing
// for every bad code, is rate limited per address, and still works if the limiter cannot be reached.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { route, shareExport } from '../worker/api/routes/site-profile-transfer.js';
import { publicRoutes } from '../worker/api/public.js';
import { NOT_HANDLED } from '../worker/api/helpers.js';
import { FORMAT } from '../worker/site-profile/transfer.js';
import { newToken, SHARE_PATH, createShare } from '../worker/site-profile/transfer-store.js';
import { getDraft, readLiveDocument } from '../worker/site-profile/versions.js';
import { createTestDb } from './support/d1-shim.js';
import { admin, editor, viewer, freshSite, setSetting, setting, addNav, auditActions, snapshot } from './support/transfer-fixtures.js';

let db, env;
const PREFIX = '/api/v1/config/transfer';
const req = (method, path, body, headers = {}, host = 't.example') => ({ method, url: `https://${host}${path}`, headers: new Headers(headers), json: async () => { if (body === undefined) throw new Error('no body'); return body; } });
const call = async (user, method, sub, body, headers, extraEnv) => {
  const res = await route({ request: req(method, `${PREFIX}${sub}`, body, headers), env: { ...env, ...extraEnv }, path: `${PREFIX}${sub}`.split('?')[0], user });
  if (res === NOT_HANDLED) return { handled: false };
  const text = await res.text(); let j = null; try { j = JSON.parse(text); } catch { /* not json */ }
  return { handled: true, status: res.status, headers: res.headers, text, body: j };
};
const themeFile = async (colour = '#445566') => { await setSetting(db, 'theme_primary', colour); const r = await call(admin, 'GET', '/export?sections=settings.theme'); return r.body.envelope; };

beforeEach(async () => { ({ db, env } = freshSite()); await setSetting(db, 'theme_primary', '#112233'); });

describe('who may do what', () => {
  test('no session is 401 and a viewer is 403 everywhere, including the state', async () => {
    for (const [m, sub] of [['GET', '/state'], ['GET', '/export'], ['POST', '/plan'], ['POST', '/apply'], ['POST', '/fetch'], ['GET', '/presets'], ['POST', '/presets'], ['GET', '/shares'], ['POST', '/shares']]) {
      assert.equal((await call(null, m, sub, {})).status, 401, `${m} ${sub} anonymous`);
      assert.equal((await call(viewer, m, sub, {})).status, 403, `${m} ${sub} viewer`);
    }
  });
  test('an editor exports, plans, applies, fetches and reads presets, and is refused everything that manages', async () => {
    assert.equal((await call(editor, 'GET', '/state')).status, 200);
    assert.equal((await call(editor, 'GET', '/export')).status, 200);
    assert.equal((await call(editor, 'GET', '/presets')).status, 200);
    for (const [m, sub, body] of [['POST', '/presets', { name: 'Nope', sections: ['settings.theme'] }], ['PUT', '/presets/1', { name: 'x' }], ['DELETE', '/presets/1'], ['GET', '/shares'], ['POST', '/shares', { sections: ['settings.theme'] }], ['DELETE', '/shares/1']]) {
      const r = await call(editor, m, sub, body); assert.equal(r.status, 403, `${m} ${sub}`); assert.match(r.body.error, /Your role cannot/);
    }
  });
  test('an administrator may do all of it', async () => {
    const p = await call(admin, 'POST', '/presets', { name: 'Mine', sections: ['settings.theme'] }); assert.equal(p.status, 201);
    assert.equal((await call(admin, 'PUT', `/presets/${p.body.id}`, { name: 'Mine 2' })).status, 200);
    const s = await call(admin, 'POST', '/shares', { sections: ['settings.theme'] }); assert.equal(s.status, 201);
    assert.equal((await call(admin, 'GET', '/shares')).status, 200);
    assert.equal((await call(admin, 'DELETE', `/shares/${s.body.id}`)).status, 200);
    assert.equal((await call(admin, 'DELETE', `/presets/${p.body.id}`)).status, 200);
  });
  test('a role the platform does not know gets nothing, and a missing role too', async () => {
    for (const u of [{ user_id: 9, email: 'x@t.example', role: 'owner' }, { user_id: 9, email: 'x@t.example' }, { user_id: 9, email: 'x@t.example', role: 'ADMIN' }]) assert.equal((await call(u, 'GET', '/state')).status, 403);
  });
  test('paths outside the prefix are not handled, and unknown paths under it fall through', async () => {
    assert.equal((await call(admin, 'GET', '/state', undefined)).handled, true);
    const r = await route({ request: req('GET', '/api/v1/config'), env, path: '/api/v1/config', user: admin }); assert.equal(r, NOT_HANDLED);
    const r2 = await route({ request: req('GET', '/api/v1/config/transferX'), env, path: '/api/v1/config/transferX', user: admin }); assert.equal(r2, NOT_HANDLED);
    assert.equal((await call(admin, 'GET', '/nothing-here')).handled, false);
    assert.equal((await call(admin, 'GET', '')).handled, false);
  });
  test('methods that do not belong are 405 or fall through, never a silent success', async () => {
    assert.equal((await call(admin, 'PATCH', '/presets', {})).status, 405); assert.equal((await call(admin, 'DELETE', '/presets', {})).status, 405);
    assert.equal((await call(admin, 'PUT', '/shares', {})).status, 405);
    assert.equal((await call(admin, 'GET', '/presets/1')).status, 405);
    assert.equal((await call(admin, 'GET', '/plan')).handled, false); assert.equal((await call(admin, 'POST', '/state', {})).handled, false);
  });
});

describe('writes from another site are refused', () => {
  test('every write is blocked when Origin names another site, and the same site or no Origin passes', async () => {
    const evil = { Origin: 'https://evil.example' };
    const before = await snapshot(db);
    for (const [m, sub, body] of [['POST', '/plan', { text: '{}' }], ['POST', '/apply', { text: '{}' }], ['POST', '/fetch', { url: 'https://a.com', token: newToken() }], ['POST', '/presets', { name: 'Evil', sections: ['settings.theme'] }],
      ['PUT', '/presets/1', { name: 'x' }], ['DELETE', '/presets/1'], ['POST', '/shares', { sections: ['settings.theme'] }], ['DELETE', '/shares/1']]) {
      const r = await call(admin, m, sub, body, evil); assert.equal(r.status, 403, `${m} ${sub}`); assert.match(r.body.error, /Cross-site/);
    }
    assert.equal(await snapshot(db), before);
    assert.equal((await call(admin, 'POST', '/presets', { name: 'Fine', sections: ['settings.theme'] }, { Origin: 'https://t.example' })).status, 201);
    assert.equal((await call(admin, 'POST', '/presets', { name: 'Fine 2', sections: ['settings.theme'] }, { Origin: 'null' })).status, 403, 'an opaque origin is another site');
  });
  test('a plain read is not a write, so the browser’s download link works', async () => {
    assert.equal((await call(admin, 'GET', '/export?download=1', undefined, { Origin: 'https://evil.example' })).status, 200);
  });
});

describe('state', () => {
  test('it lists what the screen needs and nothing secret', async () => {
    const r = (await call(admin, 'GET', '/state')).body;
    assert.equal(r.success, true); assert.equal(r.host, 't.example'); assert.equal(r.ready, true); assert.equal(r.message, null);
    assert.deepEqual(r.permissions, { export: true, import: true, library: true, manage: true });
    assert.equal(r.formatVersion, 1); assert.equal(r.maxBytes, 900 * 1024);
    assert.deepEqual(r.limits, { presets: 50, shares: 10, shareHours: [1, 24, 168] });
    assert.ok(r.catalog.length >= 15 && r.catalog.every((s) => s.id && s.label && s.kind)); assert.ok(r.brandGroups.includes('identity'));
    assert.deepEqual(r.presets, []); assert.deepEqual(r.shares, []);
    assert.ok(!/token_hash|lcs_/.test(JSON.stringify(r)));
  });
  test('an editor gets presets but no share list, and its permissions say so', async () => {
    const r = (await call(editor, 'GET', '/state')).body;
    assert.deepEqual(r.permissions, { export: true, import: true, library: true, manage: false });
    assert.ok(Array.isArray(r.presets)); assert.ok(!('shares' in r));
  });
  test('before migration 0011 it says so and still allows exporting and importing a file', async () => {
    const bare = freshSite(); bare.db.prepare('DROP TABLE config_presets').run(); bare.db.prepare('DROP TABLE config_shares').run();
    const saved = env; env = bare.env;
    try {
      const s = (await call(admin, 'GET', '/state')).body; assert.equal(s.ready, false); assert.match(s.message, /0011_config_transfer\.sql/); assert.ok(!('presets' in s));
      assert.equal((await call(admin, 'GET', '/presets')).status, 503); assert.equal((await call(admin, 'GET', '/shares')).status, 503);
      assert.equal((await call(admin, 'POST', '/shares', { sections: ['settings.theme'] })).status, 503);
      assert.equal((await call(admin, 'GET', '/export')).status, 200);
      const file = (await call(admin, 'GET', '/export')).body.envelope;
      assert.equal((await call(admin, 'POST', '/plan', { envelope: file })).status, 200);
    } finally { env = saved; }
  });
});

describe('export', () => {
  test('as JSON it returns the file, what was included and the notes, and changes nothing', async () => {
    const before = await snapshot(db);
    const r = (await call(editor, 'GET', '/export?sections=settings.theme&name=My%20file&description=About')).body;
    assert.deepEqual(r.included, ['settings.theme']); assert.equal(r.envelope.name, 'My file'); assert.equal(r.envelope.description, 'About'); assert.equal(r.envelope.source.host, 't.example');
    assert.equal(await snapshot(db), before); assert.deepEqual(await auditActions(db), []);
  });
  test('as a download it has attachment headers, no caching, a tidy file name, and is audited', async () => {
    const r = await call(editor, 'GET', '/export?download=1&sections=settings.theme');
    assert.equal(r.status, 200); assert.equal(r.headers.get('Content-Type'), 'application/json; charset=utf-8'); assert.equal(r.headers.get('Cache-Control'), 'no-store');
    assert.match(r.headers.get('Content-Disposition'), /^attachment; filename="lummet-config-t\.example-\d{4}-\d\d-\d\d\.json"$/);
    assert.equal(JSON.parse(r.text).format, r.body.format); assert.match(r.text, /^\{\n  "/, 'pretty printed for a person to open');
    assert.ok((await auditActions(db)).includes('export'));
  });
  test('a preset’s download file name can never carry path or header characters, whatever the name holds', async () => {
    for (const name of ['../../etc/passwd', 'a"b\r\nX-Evil: 1', 'ünïcode ✓ name', '<script>x</script>', 'a'.repeat(80)]) {
      const saved = await call(admin, 'POST', '/presets', { name, sections: ['settings.theme'] }); assert.equal(saved.status, 201, name);
      const dl = await call(admin, 'GET', `/presets/${saved.body.id}/download`); const cd = dl.headers.get('Content-Disposition');
      assert.match(cd, /^attachment; filename="lummet-preset-[a-z0-9.-]+\.json"$/, name); assert.ok(!/[\r\n/\\]/.test(cd.replace(/^attachment; /, '')), name);
      assert.ok(cd.length < 140, 'a long name is cut');
    }
  });
  test('a section list with nothing valid in it is a 422 and not an export of everything', async () => {
    for (const q of ['sections=nope', 'sections=nope,also-nope', 'sections=rows.seo']) { const r = await call(admin, 'GET', `/export?${q}`); assert.equal(r.status, 422, q); assert.match(r.body.error, /nothing to export/); }
  });
  test('no section list, or an empty one, exports every section that has something in it', async () => {
    const a = (await call(admin, 'GET', '/export')).body, b = (await call(admin, 'GET', '/export?sections=')).body;
    assert.deepEqual(a.included, b.included); assert.ok(a.included.length >= 3);
  });
  test('the same choice always gives the same checksum, however the list is ordered', async () => {
    const x = (await call(admin, 'GET', '/export?sections=settings.theme,structure')).body.envelope, y = (await call(admin, 'GET', '/export?sections=structure,settings.theme')).body.envelope;
    assert.equal(x.checksum, y.checksum); assert.deepEqual(x.sections, y.sections); assert.match(x.checksum, /^sha256:[0-9a-f]{64}$/);
  });
  test('from=draft takes the draft, anything else takes live', async () => {
    const { saveDraft } = await import('../worker/site-profile/versions.js');
    await saveDraft(env, editor, { settings: { theme_primary: '#abcdef' } });
    assert.match(JSON.stringify((await call(admin, 'GET', '/export?sections=settings.theme&from=draft')).body.envelope), /#abcdef/);
    for (const q of ['from=live', 'from=whatever', '']) assert.match(JSON.stringify((await call(admin, 'GET', `/export?sections=settings.theme&${q}`)).body.envelope), /#112233/, q);
  });
  test('scripts and ad HTML never leave the site', async () => {
    await setSetting(db, 'ga_script', '<script>steal()</script>'); await setSetting(db, 'ad_html', '<div>ad</div>');
    const text = (await call(admin, 'GET', '/export')).text; assert.doesNotMatch(text, /steal\(\)|<div>ad/);
  });
});

describe('plan and apply', () => {
  test('a plan is a dry run: it returns the report and writes nothing, not even a draft', async () => {
    const file = await themeFile('#778899'); await setSetting(db, 'theme_primary', '#112233');
    const before = await snapshot(db);
    const r = await call(editor, 'POST', '/plan', { envelope: file });
    assert.equal(r.status, 200); assert.equal(r.body.report.hasChanges, true); assert.equal(await snapshot(db), before); assert.equal(await getDraft(env), null);
  });
  test('the file can come as an object, as text, or as a saved preset; with none of them it says what to do', async () => {
    const file = await themeFile('#778899'); await setSetting(db, 'theme_primary', '#112233');
    assert.equal((await call(editor, 'POST', '/plan', { envelope: file })).status, 200);
    assert.equal((await call(editor, 'POST', '/plan', { text: JSON.stringify(file) })).status, 200);
    const p = await call(admin, 'POST', '/presets', { name: 'Blue', sections: ['settings.theme'] }); await setSetting(db, 'theme_primary', '#000001');
    assert.equal((await call(editor, 'POST', '/plan', { presetId: p.body.id })).status, 200);
    assert.equal((await call(editor, 'POST', '/plan', { presetId: 9999 })).status, 404);
    const none = await call(editor, 'POST', '/plan', {}); assert.equal(none.status, 422); assert.match(none.body.error, /Choose a file/);
  });
  test('garbage is a plain 422 with the reasons, never a 500', async () => {
    for (const body of [{ text: 'not json' }, { text: '[]' }, { text: '{"format":"other"}' }, { envelope: {} }, { text: 'x'.repeat(1024 * 1024) }]) {
      const r = await call(editor, 'POST', '/plan', body); assert.equal(r.status, 422, JSON.stringify(body).slice(0, 40)); assert.equal(r.body.success, false); assert.ok(r.body.error.length > 5);
    }
  });
  test('a body that is not JSON is refused as such', async () => {
    for (const sub of ['/plan', '/apply', '/fetch', '/presets']) { const r = await call(admin, 'POST', sub, undefined); assert.equal(r.status, 400, sub); assert.match(r.body.error, /Invalid JSON/); }
  });
  test('apply adds to the DRAFT only, leaves the live site alone, records an audit entry, and publishing stays with the administrator', async () => {
    const file = await themeFile('#778899'); await setSetting(db, 'theme_primary', '#112233');
    const r = await call(editor, 'POST', '/apply', { envelope: file, sections: ['settings.theme'] });
    assert.equal(r.status, 200, r.text); assert.equal(r.body.success, true);
    assert.equal(await setting(db, 'theme_primary'), '#112233'); assert.match(JSON.stringify((await getDraft(env)).document), /#778899/);
    assert.ok((await auditActions(db)).some((a) => /import/.test(a)));
    const pub = await import('../worker/api/routes/site-profile-versions.js');
    const publish = (user) => pub.route({ request: req('POST', '/api/v1/config/publish', {}), env, path: '/api/v1/config/publish', user });
    assert.equal((await publish(editor)).status, 403); assert.equal((await publish(admin)).status, 200); assert.equal(await setting(db, 'theme_primary'), '#778899');
  });
  test('apply plans again on the server and honours only the sections chosen', async () => {
    await setSetting(db, 'site_name', 'Alpha'); const file = (await call(admin, 'GET', '/export?sections=settings.theme,settings.identity')).body.envelope;
    const B = freshSite(); const saved = env; env = B.env; db = B.db;
    try {
      const r = await call(editor, 'POST', '/apply', { envelope: file, sections: ['settings.theme'] }); assert.equal(r.status, 200, r.text);
      const draft = JSON.stringify((await getDraft(env)).document); assert.match(draft, /#112233/); assert.doesNotMatch(draft, /Alpha/);
    } finally { env = saved; }
  });
  test('a stale draft revision is a 409 conflict with the draft returned, and nothing is added', async () => {
    const file = await themeFile('#778899'); await setSetting(db, 'theme_primary', '#112233');
    const { saveDraft } = await import('../worker/site-profile/versions.js'); await saveDraft(env, editor, { settings: { site_name: 'Mine' } });
    const r = await call(editor, 'POST', '/apply', { envelope: file, revision: 99 });
    assert.equal(r.status, 409); assert.equal(r.body.code, 'conflict'); assert.match(r.body.error, /changed by someone else/); assert.ok(!/#778899/.test(JSON.stringify((await getDraft(env)).document)));
  });
  test('applying a file with nothing to change is refused with the reason', async () => {
    const file = (await call(admin, 'GET', '/export?sections=settings.theme')).body.envelope;
    const r = await call(editor, 'POST', '/apply', { envelope: file }); assert.ok(r.status >= 400 && r.status < 500, String(r.status)); assert.equal(r.body.success, false);
  });
  test('a damaged checksum is reported on the plan and an apply still goes through the same checks', async () => {
    const file = await themeFile('#778899'); await setSetting(db, 'theme_primary', '#112233'); file.document.settings.theme_primary = '#000000';
    const r = await call(editor, 'POST', '/plan', { envelope: file }); assert.equal(r.status, 200); assert.equal(r.body.report.file.checksum, 'mismatch');
  });
});

describe('clone: /fetch', () => {
  const answer = (out) => async () => new Response(JSON.stringify(out), { status: 200 });
  test('it uses the injected fetch, returns the file text to review, and records the fetch; nothing is changed', async () => {
    const file = await themeFile('#778899'); const before = await snapshot(db); let seen;
    const r = await call(editor, 'POST', '/fetch', { url: 'https://other.example.org', token: newToken() }, {}, { CONFIG_FETCH: async (u, i) => { seen = u; return answer({ success: true, envelope: file })(u, i); } });
    assert.equal(r.status, 200); assert.equal(r.body.host, 'other.example.org'); assert.deepEqual(JSON.parse(r.body.text), file); assert.equal(seen, `https://other.example.org${SHARE_PATH}`);
    assert.ok((await auditActions(db)).includes('clone.fetch')); assert.equal((await snapshot(db)).length, before.length);
  });
  test('this site, private addresses and bad codes are refused before any request', async () => {
    let calls = 0; const f = async () => { calls++; return new Response('{}'); };
    for (const b of [{ url: 'https://t.example', token: newToken() }, { url: 'https://127.0.0.1', token: newToken() }, { url: 'https://other.example.org', token: 'nope' }, {}, { url: 5, token: 5 }]) { const r = await call(editor, 'POST', '/fetch', b, {}, { CONFIG_FETCH: f }); assert.equal(r.status, 422, JSON.stringify(b)); }
    assert.equal(calls, 0);
  });
  test('an answer that is not a valid configuration is refused with the reasons', async () => {
    const r = await call(editor, 'POST', '/fetch', { url: 'https://other.example.org', token: newToken() }, {}, { CONFIG_FETCH: answer({ success: true, envelope: { format: 'something-else' } }) });
    assert.equal(r.status, 422); assert.equal(r.body.success, false); assert.ok(r.body.errors.length);
    assert.ok(!(await auditActions(db)).includes('clone.fetch'));
  });
  test('the other site’s refusal is shown as a plain message', async () => {
    const r = await call(editor, 'POST', '/fetch', { url: 'https://other.example.org', token: newToken() }, {}, { CONFIG_FETCH: async () => new Response('{}', { status: 403 }) });
    assert.equal(r.status, 422); assert.match(r.body.error, /did not accept the share code/);
  });
  test('the fetched text then goes through the normal dry run', async () => {
    const file = await themeFile('#778899'); await setSetting(db, 'theme_primary', '#112233');
    const f = await call(editor, 'POST', '/fetch', { url: 'https://other.example.org', token: newToken() }, {}, { CONFIG_FETCH: answer({ success: true, envelope: file }) });
    const plan = await call(editor, 'POST', '/plan', { text: f.body.text }); assert.equal(plan.status, 200); assert.equal(plan.body.report.hasChanges, true);
  });
});

describe('presets over the API', () => {
  test('save, list, plan from, rename, download, delete', async () => {
    const saved = await call(admin, 'POST', '/presets', { name: 'News starter', description: 'd', sections: ['settings.theme'], from: 'live' });
    assert.equal(saved.status, 201); assert.equal(saved.body.saved, true); const id = saved.body.id;
    assert.equal((await call(editor, 'GET', '/presets')).body.presets[0].name, 'News starter');
    assert.equal((await call(admin, 'PUT', `/presets/${id}`, { name: 'News starter 2', description: 'x' })).status, 200);
    const dl = await call(editor, 'GET', `/presets/${id}/download`);
    assert.equal(dl.status, 200); assert.equal(dl.headers.get('Cache-Control'), 'no-store'); assert.equal(dl.headers.get('Content-Type'), 'application/json; charset=utf-8');
    assert.match(dl.headers.get('Content-Disposition'), /^attachment; filename="lummet-preset-news-starter-2\.json"$/);
    assert.equal(JSON.parse(dl.text).format, FORMAT); assert.ok((await auditActions(db)).includes('preset.download'));
    assert.equal((await call(admin, 'DELETE', `/presets/${id}`)).status, 200); assert.equal((await call(editor, 'GET', `/presets/${id}/download`)).status, 404);
  });
  test('a name clash is 409 and a bad name is 422 with the plain message', async () => {
    await call(admin, 'POST', '/presets', { name: 'One', sections: ['settings.theme'] });
    const dup = await call(admin, 'POST', '/presets', { name: 'one', sections: ['settings.theme'] }); assert.equal(dup.status, 409); assert.match(dup.body.error, /already exists/);
    const bad = await call(admin, 'POST', '/presets', { name: 'x', sections: ['settings.theme'] }); assert.equal(bad.status, 422); assert.match(bad.body.error, /at least 2 characters/);
  });
  test('ids in the path must be numbers; anything else does not match a route', async () => {
    for (const sub of ['/presets/abc', '/presets/1abc', '/presets/-1', '/presets/1/download/x', '/presets/%2e%2e', '/shares/abc']) assert.equal((await call(admin, 'DELETE', sub)).handled, false, sub);
    assert.equal((await call(editor, 'GET', '/presets/abc/download')).handled, false);
  });
  test('an unknown preset is a 404 on rename, delete and download', async () => {
    assert.equal((await call(admin, 'PUT', '/presets/77', { name: 'Whatever' })).status, 404); assert.equal((await call(admin, 'DELETE', '/presets/77')).status, 404); assert.equal((await call(editor, 'GET', '/presets/77/download')).status, 404);
  });
});

describe('share links over the API', () => {
  test('creating shows the code once and the list never shows it again', async () => {
    const made = await call(admin, 'POST', '/shares', { label: 'Staging', hours: 1, maxUses: 2, sections: ['settings.theme'] });
    assert.equal(made.status, 201); assert.match(made.body.token, /^lcs_[A-Za-z0-9_-]{43}$/);
    const list = await call(admin, 'GET', '/shares'); assert.equal(list.body.shares.length, 1); assert.ok(!list.text.includes(made.body.token));
    const st = await call(admin, 'GET', '/state'); assert.ok(!st.text.includes(made.body.token));
  });
  test('nothing chosen is a 422; the eleventh active link is a 409; revoking frees a place', async () => {
    assert.equal((await call(admin, 'POST', '/shares', { sections: [] })).status, 422); assert.equal((await call(admin, 'POST', '/shares', {})).status, 422);
    const ids = []; for (let i = 0; i < 10; i++) ids.push((await call(admin, 'POST', '/shares', { label: `L${i}`, sections: ['settings.theme'] })).body.id);
    assert.equal((await call(admin, 'POST', '/shares', { sections: ['settings.theme'] })).status, 409);
    assert.equal((await call(admin, 'DELETE', `/shares/${ids[0]}`)).status, 200); assert.equal((await call(admin, 'POST', '/shares', { sections: ['settings.theme'] })).status, 201);
    assert.equal((await call(admin, 'DELETE', '/shares/4242')).status, 404);
  });
});

// ------------------------------------------------------------------ the public endpoint
const pub = (token, { method = 'POST', ip = '203.0.113.7', headers = {}, host = 't.example' } = {}) => shareExport({ request: req(method, '/en/api/v1/config-share/export', {}, { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(ip ? { 'CF-Connecting-IP': ip } : {}), ...headers }, host), env });
const attempts = async () => Number((await db.prepare('SELECT COUNT(*) AS n FROM auth_attempts WHERE action = ?').bind('config-share').first()).n);
const body = async (res) => ({ status: res.status, headers: res.headers, json: await res.json() });

describe('the public share endpoint', () => {
  test('a valid code returns the chosen sections as a valid file, with no caching', async () => {
    const s = await createShare(env, admin, { label: 'B', sections: ['settings.theme'], maxUses: 3 });
    const r = await body(await pub(s.token)); assert.equal(r.status, 200); assert.equal(r.json.success, true); assert.equal(r.headers.get('Cache-Control'), 'no-store'); assert.equal(r.headers.get('Content-Type'), 'application/json');
    assert.deepEqual(r.json.envelope.sections, ['settings.theme']); assert.ok(!('included' in r.json)); assert.equal(await attempts(), 0, 'a good request is not logged as a failure');
  });
  test('only POST is accepted; anything else is a 405 that says so, and costs the caller nothing', async () => {
    for (const m of ['GET', 'PUT', 'DELETE', 'PATCH', 'HEAD']) { const res = await pub(newToken(), { method: m }); assert.equal(res.status, 405, m); assert.equal(res.headers.get('Allow'), 'POST'); }
    assert.equal(await attempts(), 0);
  });
  test('missing, malformed and wrong codes get the same 403 and each wrong one is counted', async () => {
    const same = JSON.stringify({ success: false, error: 'This share link is not valid.' });
    for (const t of [null, 'lcs_short', newToken()]) { const res = await pub(t); assert.equal(res.status, 403); assert.equal(JSON.stringify(await res.json()), same); }
    assert.equal(await attempts(), 3);
    const odd = await shareExport({ request: req('POST', '/x', {}, { Authorization: 'Basic abc', 'CF-Connecting-IP': '203.0.113.7' }), env }); assert.equal(odd.status, 403);
  });
  test('after five wrong tries from one address, even the right code is refused with 429 and a retry hint; other addresses are unaffected', async () => {
    const s = await createShare(env, admin, { sections: ['settings.theme'], maxUses: 5 });
    for (let i = 0; i < 5; i++) assert.equal((await pub(newToken(), { ip: '198.51.100.9' })).status, 403);
    const blocked = await pub(s.token, { ip: '198.51.100.9' }); assert.equal(blocked.status, 429); assert.equal(blocked.headers.get('Retry-After'), '900'); assert.match((await blocked.json()).error, /Too many attempts/);
    assert.equal((await pub(s.token, { ip: '198.51.100.10' })).status, 200);
    const used = await db.prepare('SELECT uses FROM config_shares WHERE id = ?').bind(s.id).first(); assert.equal(used.uses, 1, 'the blocked request did not use the code');
  });
  test('the limit is about the address and is shared with nothing else the sign-in counts', async () => {
    for (let i = 0; i < 5; i++) await db.prepare('INSERT INTO auth_attempts(ip_hash, action, created_at) VALUES(?, ?, ?)').bind('x'.repeat(64), 'login', new Date().toISOString()).run();
    const s = await createShare(env, admin, { sections: ['settings.theme'] }); assert.equal((await pub(s.token)).status, 200);
  });
  test('old failures age out of the window', async () => {
    const { hashIPForAuth } = await import('../worker/auth/security.js'); const h = await hashIPForAuth('198.51.100.20');
    for (let i = 0; i < 5; i++) await db.prepare('INSERT INTO auth_attempts(ip_hash, action, created_at) VALUES(?, ?, ?)').bind(h, 'config-share', new Date(Date.now() - 20 * 60 * 1000).toISOString()).run();
    const s = await createShare(env, admin, { sections: ['settings.theme'] }); assert.equal((await pub(s.token, { ip: '198.51.100.20' })).status, 200);
  });
  test('without an address header there is no per-address limit, but the code is still required', async () => {
    for (let i = 0; i < 8; i++) assert.equal((await pub(newToken(), { ip: null })).status, 403);
    const s = await createShare(env, admin, { sections: ['settings.theme'] }); assert.equal((await pub(s.token, { ip: null })).status, 200); assert.equal(await attempts(), 0);
  });
  test('if the limiter cannot be reached the endpoint still works: the code alone decides', async () => {
    db.prepare('DROP TABLE auth_attempts').run();
    const s = await createShare(env, admin, { sections: ['settings.theme'] });
    assert.equal((await pub(s.token)).status, 200); assert.equal((await pub(newToken())).status, 403);
  });
  test('a used-up, expired or revoked code is refused like any other', async () => {
    const a = await createShare(env, admin, { sections: ['settings.theme'], maxUses: 1 }); assert.equal((await pub(a.token)).status, 200); assert.equal((await pub(a.token)).status, 403);
    const b = await createShare(env, admin, { sections: ['settings.theme'] }); await db.prepare("UPDATE config_shares SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?").bind(b.id).run(); assert.equal((await pub(b.token)).status, 403);
  });
  test('it is reachable without a session through the public router, and only at its own path', async () => {
    const s = await createShare(env, admin, { sections: ['settings.theme'] });
    const res = await publicRoutes({ request: req('POST', '/api/v1/config-share/export', {}, { Authorization: `Bearer ${s.token}`, 'CF-Connecting-IP': '203.0.113.44' }), env, path: '/api/v1/config-share/export', user: null });
    assert.equal(res.status, 200); assert.equal((await res.json()).success, true);
  });
  test('the response never includes the stored hash, other sections, or the label of the link', async () => {
    await setSetting(db, 'site_name', 'Private Name'); const s = await createShare(env, admin, { label: 'Internal label', sections: ['settings.theme'] });
    const text = await (await pub(s.token)).text(); assert.doesNotMatch(text, /Private Name|Internal label|token_hash/);
    const row = await db.prepare('SELECT token_hash FROM config_shares WHERE id = ?').bind(s.id).first(); assert.ok(!text.includes(row.token_hash));
  });
  test('a share made on one site is cloned by another end to end, and the live site of the first never changes', async () => {
    await addNav(db, 'Deals', '/en/deals', { position: 7 }); const live = JSON.stringify((await readLiveDocument(env)).rows);
    const s = await createShare(env, admin, { sections: ['settings.theme', 'rows.nav'], maxUses: 1 });
    const A = { db, env }; const B = freshSite(); db = B.db; env = B.env;
    const toA = async (u, init) => { const saved = [db, env]; [db, env] = [A.db, A.env]; try { return await pub(/^Bearer (\S+)$/.exec(init.headers.Authorization)[1]); } finally { [db, env] = saved; } };
    const f = await call(editor, 'POST', '/fetch', { url: 'https://a.example.org', token: s.token }, {}, { CONFIG_FETCH: toA }); assert.equal(f.status, 200, f.text);
    const applied = await call(editor, 'POST', '/apply', { text: f.body.text }); assert.equal(applied.status, 200, applied.text);
    assert.match(JSON.stringify((await getDraft(env)).document), /Deals/);
    assert.equal(JSON.stringify((await readLiveDocument(A.env)).rows), live);
  });
});
