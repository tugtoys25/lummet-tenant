// Forwarding: when a conversion is stored (or its status changes), tell your tracker or ad platform about it.
// Kinds: tracker_url (Keitaro, Binom, Voluum or any URL with macros), meta_capi (Meta Conversions API), tiktok_events (TikTok Events API).
// Credentials are kept encrypted by the site (security/secret-box.js); nothing is set outside the dashboard.
// Each (forward, conversion, status) is delivered once; failures are logged and can be retried from the dashboard.
import { encryptSecret, decryptSecret } from '../security/secret-box.js';

export const KINDS = ['tracker_url', 'meta_capi', 'tiktok_events'];
export const CONVERSION_EVENTS = ['registration', 'qualified_lead', 'ftd', 'deposit', 'cpa_conversion', 'revshare', 'hybrid'];
export const FORWARD_STATUSES = ['pending', 'confirmed', 'rejected'];
const TIMEOUT_MS = 4000;
const META_MAX_AGE_SECONDS = 7 * 86400;

export const TRACKER_PRESETS = {
  keitaro: { name: 'Keitaro', url: 'https://YOUR-KEITARO-DOMAIN/postback?subid={sub1}&status={event_mapped}&payout={commission}&currency={currency}&tid={transaction_id}', event_map: { registration: 'lead', qualified_lead: 'lead', ftd: 'sale', deposit: 'rebill', revshare: 'rebill' }, note: 'Pass your Keitaro click id to the link as sub1; it comes back as {sub1}. Check the status names in your Keitaro campaign.' },
  binom: { name: 'Binom', url: 'https://YOUR-BINOM-DOMAIN/click.php?cnv_id={sub1}&payout={commission}&cnv_status={event_mapped}&txid={transaction_id}', event_map: { registration: 'lead', qualified_lead: 'lead', ftd: 'sale', deposit: 'sale' }, note: 'Pass your Binom click id as sub1. Confirm the parameter names in your Binom postback settings.' },
  voluum: { name: 'Voluum', url: 'https://YOUR-VOLUUM-DOMAIN/postback?cid={sub1}&payout={commission}&txid={transaction_id}&et={event_mapped}', event_map: { registration: 'lead', ftd: 'sale', deposit: 'sale' }, note: 'Pass your Voluum click id as sub1. The event names must exist in your Voluum conversion settings.' },
  custom: { name: 'Any URL', url: 'https://example.com/postback?click={click_id}&event={event}&amount={amount}', event_map: {}, note: 'Macros: click_id, event, event_mapped, status, amount, commission, currency, transaction_id, country, conversion_id, sub1-sub10, utm_source, utm_medium, utm_campaign, gclid, fbclid, ttclid.' }
};

const META_EVENTS = { registration: 'CompleteRegistration', qualified_lead: 'Lead', ftd: 'Purchase', deposit: 'Purchase', cpa_conversion: 'Purchase', revshare: 'Purchase', hybrid: 'Purchase' };
const TIKTOK_EVENTS = { registration: 'CompleteRegistration', qualified_lead: 'SubmitForm', ftd: 'CompletePayment', deposit: 'CompletePayment', cpa_conversion: 'CompletePayment', revshare: 'CompletePayment', hybrid: 'CompletePayment' };

// ── Destination safety ──
// An admin types the URL, but a mistaken or hostile value must not make the Worker call internal addresses.
export function checkDestinationUrl(template) {
  let u;
  try { u = new URL(String(template).replace(/\{[a-z0-9_]+\}/gi, 'x')); } catch { return 'The URL is not valid.'; }
  if (u.protocol !== 'https:') return 'The URL must start with https://.';
  if (u.username || u.password) return 'Put credentials in a parameter, not in the address.';
  const host = u.hostname.toLowerCase();
  if (!host.includes('.') || host.startsWith('[') || /^[\d.]+$/.test(host)) return 'Use a domain name, not an IP address.';
  if (/(^|\.)(localhost|local|internal|lan|home|corp|intranet)$/.test(host)) return 'That host name is not allowed.';
  if (u.port && u.port !== '443') return 'Only the standard HTTPS port is allowed.';
  return null;
}

// ── Validation and storage ──
export function validateForward(input, { creating = true } = {}) {
  const errors = [];
  const kind = input.kind;
  if (!KINDS.includes(kind)) errors.push('Choose what to forward to.');
  const label = String(input.label || '').trim().slice(0, 100);
  if (!label) errors.push('Give it a label.');
  const events = (Array.isArray(input.events) ? input.events : ['ftd']).filter((e) => CONVERSION_EVENTS.includes(e));
  if (!events.length) errors.push('Pick at least one event.');
  const statuses = (Array.isArray(input.statuses) ? input.statuses : ['confirmed']).filter((s) => FORWARD_STATUSES.includes(s));
  if (!statuses.length) errors.push('Pick at least one status.');
  const s = input.settings || {};
  const settings = {};
  if (kind === 'tracker_url') {
    const bad = checkDestinationUrl(s.url);
    if (bad) errors.push(bad); else settings.url = String(s.url).trim().slice(0, 1000);
    settings.method = s.method === 'POST' ? 'POST' : 'GET';
    settings.event_map = s.event_map && typeof s.event_map === 'object' ? Object.fromEntries(Object.entries(s.event_map).filter(([k, v]) => CONVERSION_EVENTS.includes(k) && /^[A-Za-z0-9_-]{1,40}$/.test(String(v)))) : {};
  } else if (kind === 'meta_capi') {
    if (!/^\d{5,20}$/.test(String(s.pixel_id || ''))) errors.push('The pixel / dataset ID is a number.'); else settings.pixel_id = String(s.pixel_id);
    settings.api_version = /^v\d{1,2}\.\d$/.test(String(s.api_version || '')) ? s.api_version : 'v26.0';
    if (s.test_event_code) settings.test_event_code = String(s.test_event_code).slice(0, 40);
    settings.value_source = s.value_source === 'commission' ? 'commission' : 'amount';
  } else if (kind === 'tiktok_events') {
    if (!/^[A-Za-z0-9]{6,40}$/.test(String(s.pixel_code || ''))) errors.push('The TikTok pixel code looks wrong.'); else settings.pixel_code = String(s.pixel_code);
    if (s.test_event_code) settings.test_event_code = String(s.test_event_code).slice(0, 40);
    settings.value_source = s.value_source === 'commission' ? 'commission' : 'amount';
  }
  const secret = input.secret ? String(input.secret).trim() : null;
  if (kind !== 'tracker_url' && creating && !secret) errors.push('The access token is required.');
  return { errors, value: { id: input.id ? Number(input.id) : null, label, kind, settings, secret, program_id: input.program_id ? Number(input.program_id) : null, events, statuses, status: input.status === 'paused' ? 'paused' : 'active' } };
}

export async function saveForward(env, v, userId = null) {
  const enc = v.secret ? await encryptSecret(env, v.secret) : null;
  if (v.id) {
    await env.DB.prepare(`UPDATE conversion_forwards SET label=?, kind=?, settings_json=?, ${enc ? 'secret_enc=?, ' : ''}program_id=?, events_json=?, statuses_json=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(v.label, v.kind, JSON.stringify(v.settings), ...(enc ? [enc] : []), v.program_id, JSON.stringify(v.events), JSON.stringify(v.statuses), v.status, v.id).run();
    return v.id;
  }
  const r = await env.DB.prepare(`INSERT INTO conversion_forwards (label, kind, settings_json, secret_enc, program_id, events_json, statuses_json, status, created_by) VALUES (?,?,?,?,?,?,?,?,?)`)
    .bind(v.label, v.kind, JSON.stringify(v.settings), enc, v.program_id, JSON.stringify(v.events), JSON.stringify(v.statuses), v.status, userId).run();
  return r.meta.last_row_id;
}

export async function deleteForward(db, id) { await db.prepare('DELETE FROM conversion_forwards WHERE id = ?').bind(id).run(); }

const parse = (j, fallback) => { try { return JSON.parse(j); } catch { return fallback; } };

export async function listForwards(db) {
  const rows = (await db.prepare(`SELECT f.*, p.name AS program_name,
      (SELECT COUNT(*) FROM forward_deliveries d WHERE d.forward_id = f.id AND d.outcome = 'sent') AS sent,
      (SELECT COUNT(*) FROM forward_deliveries d WHERE d.forward_id = f.id AND d.outcome = 'failed') AS failed
    FROM conversion_forwards f LEFT JOIN affiliate_programs p ON p.id = f.program_id ORDER BY f.id DESC`).all()).results || [];
  return rows.map(({ secret_enc, settings_json, events_json, statuses_json, ...r }) => ({ ...r, has_secret: !!secret_enc, settings: parse(settings_json, {}), events: parse(events_json, []), statuses: parse(statuses_json, []) }));
}

export async function listDeliveries(db, { forwardId = null, limit = 50 } = {}) {
  return (await db.prepare(`SELECT d.*, f.label AS forward_label FROM forward_deliveries d JOIN conversion_forwards f ON f.id = d.forward_id
    ${forwardId ? 'WHERE d.forward_id = ?' : ''} ORDER BY d.id DESC LIMIT ?`).bind(...(forwardId ? [forwardId] : []), Math.min(Number(limit) || 50, 200)).all()).results || [];
}

// ── Building the outgoing request (pure) ──
function macroValues(c, click) {
  const subs = click?.subs || {}; const utm = click?.utm || {}; const ids = click?.ids || {};
  const v = {
    click_id: c.click_id, event: c.conversion_type, status: c.status, amount: c.reported_value, commission: c.calculated_commission, payout: c.calculated_commission,
    currency: c.currency, transaction_id: c.external_reference, country: c.country_code, conversion_id: c.id,
    gclid: ids.gclid, fbclid: ids.fbclid, ttclid: ids.ttclid, msclkid: ids.msclkid
  };
  for (let i = 1; i <= 10; i++) v[`sub${i}`] = subs[`sub${i}`];
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']) v[k] = utm[k] ?? click?.[k];
  return v;
}

export function fillTemplate(template, values, eventMap = {}) {
  const all = { ...values, event_mapped: eventMap[values.event] || values.event };
  return String(template).replace(/\{([a-z0-9_]+)\}/gi, (m, name) => (name in all && all[name] != null ? encodeURIComponent(String(all[name])) : ''));
}

const unix = (t) => { const ms = Date.parse(String(t || '').includes('T') ? t : String(t || '').replace(' ', 'T') + 'Z'); return Number.isFinite(ms) ? Math.floor(ms / 1000) : Math.floor(Date.now() / 1000); };

// Returns { skip: reason } when the platform cannot use this conversion, otherwise { url, method, headers, body }.
export function buildRequest(forward, secret, conversion, click, { siteUrl = null, now = Date.now() } = {}) {
  const s = forward.settings;
  const values = macroValues(conversion, click);
  if (forward.kind === 'tracker_url') {
    const url = fillTemplate(s.url, values, s.event_map);
    if (s.method === 'POST') {
      const u = new URL(url);
      return { url: `${u.origin}${u.pathname}`, method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: u.searchParams.toString() };
    }
    return { url, method: 'GET', headers: {}, body: null };
  }
  const value = Number((s.value_source === 'commission' ? conversion.calculated_commission : (conversion.reported_value || conversion.calculated_commission)) || 0);
  const when = unix(conversion.occurred_at);
  const eventId = `${conversion.id}-${conversion.status}`;
  if (forward.kind === 'meta_capi') {
    if (!click?.ids?.fbclid) return { skip: 'The click has no fbclid, so Meta cannot match this conversion. Send traffic through links that keep the fbclid parameter.' };
    if (now / 1000 - when > META_MAX_AGE_SECONDS) return { skip: 'Meta only accepts events up to 7 days old.' };
    const event = { event_name: META_EVENTS[conversion.conversion_type] || 'Lead', event_time: when, event_id: eventId, action_source: 'website', user_data: { fbc: `fb.1.${Math.floor(unix(click.occurred_at) * 1000)}.${click.ids.fbclid}` }, custom_data: { value, currency: String(conversion.currency || 'USD').toUpperCase() } };
    if (siteUrl) event.event_source_url = siteUrl;
    const body = { data: [event] };
    if (s.test_event_code) body.test_event_code = s.test_event_code;
    return { url: `https://graph.facebook.com/${s.api_version || 'v26.0'}/${s.pixel_id}/events?access_token=${encodeURIComponent(secret || '')}`, method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
  }
  if (forward.kind === 'tiktok_events') {
    if (!click?.ids?.ttclid) return { skip: 'The click has no ttclid, so TikTok cannot match this conversion.' };
    const body = { event_source: 'web', event_source_id: s.pixel_code, data: [{ event: TIKTOK_EVENTS[conversion.conversion_type] || 'SubmitForm', event_time: when, event_id: eventId, user: { ttclid: click.ids.ttclid }, properties: { value, currency: String(conversion.currency || 'USD').toUpperCase() } }] };
    if (s.test_event_code) body.test_event_code = s.test_event_code;
    return { url: 'https://business-api.tiktok.com/open_api/v1.3/event/track/', method: 'POST', headers: { 'content-type': 'application/json', 'Access-Token': secret || '' }, body: JSON.stringify(body) };
  }
  return { skip: 'Unknown kind.' };
}

// ── Delivery ──
async function loadContext(db, conversionId) {
  const conversion = await db.prepare(`SELECT id, click_id, program_id, conversion_type, status, reported_value, calculated_commission, currency, external_reference, country_code, occurred_at FROM analytics_conversions WHERE id = ?`).bind(conversionId).first();
  if (!conversion) return null;
  let click = null;
  if (conversion.click_id) {
    const e = await db.prepare(`SELECT metadata, occurred_at, utm_source, utm_medium, utm_campaign, utm_term, utm_content FROM analytics_events WHERE click_id = ? AND event_type = 'TRACKING_LINK_CLICK' ORDER BY id ASC LIMIT 1`).bind(conversion.click_id).first();
    if (e) { const m = parse(e.metadata, {}); click = { subs: m.subs || {}, ids: m.ids || {}, utm: { utm_source: e.utm_source, utm_medium: e.utm_medium, utm_campaign: e.utm_campaign, utm_term: e.utm_term, utm_content: e.utm_content }, occurred_at: e.occurred_at }; }
  }
  return { conversion, click };
}

async function deliverOne(env, forward, conversion, click, fetchImpl) {
  const secret = forward.secret_enc ? await decryptSecret(env, forward.secret_enc) : null;
  if (forward.kind !== 'tracker_url' && !secret) return { outcome: 'failed', http_status: null, detail: 'The saved access token could not be read. Enter it again.' };
  const req = buildRequest(forward, secret, conversion, click, { siteUrl: env.SITE_URL || null });
  if (req.skip) return { outcome: 'skipped', http_status: null, detail: req.skip };
  if (forward.kind === 'tracker_url') { const bad = checkDestinationUrl(req.url); if (bad) return { outcome: 'failed', http_status: null, detail: bad }; }
  try {
    const res = await fetchImpl(req.url, { method: req.method, headers: req.headers, body: req.body, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
    const ok = res.status >= 200 && res.status < 300;
    let detail = null;
    if (!ok) { try { detail = (await res.text()).slice(0, 300); } catch { detail = null; } }
    return { outcome: ok ? 'sent' : 'failed', http_status: res.status, detail };
  } catch (e) {
    return { outcome: 'failed', http_status: null, detail: String(e && e.name === 'TimeoutError' ? 'Timed out' : e && e.message || e).slice(0, 300) };
  }
}

async function record(db, forwardId, conversionId, status, r) {
  await db.prepare(`INSERT INTO forward_deliveries (forward_id, conversion_id, conv_status, outcome, http_status, detail) VALUES (?,?,?,?,?,?)
    ON CONFLICT(forward_id, conversion_id, conv_status) DO UPDATE SET outcome=excluded.outcome, http_status=excluded.http_status, detail=excluded.detail, attempts=attempts+1, updated_at=CURRENT_TIMESTAMP`)
    .bind(forwardId, conversionId, status, r.outcome, r.http_status, r.detail).run();
}

// Called after a postback stored or updated a conversion. Never throws: forwarding must not affect the response to the program.
export async function dispatchForwards(env, conversionId, { fetchImpl = fetch } = {}) {
  try {
    const forwards = (await env.DB.prepare(`SELECT * FROM conversion_forwards WHERE status = 'active'`).all()).results || [];
    if (!forwards.length) return [];
    const ctx = await loadContext(env.DB, conversionId);
    if (!ctx) return [];
    const { conversion, click } = ctx;
    const out = [];
    await Promise.allSettled(forwards.map(async (f) => {
      const forward = { ...f, settings: parse(f.settings_json, {}) };
      const events = parse(f.events_json, []); const statuses = parse(f.statuses_json, []);
      if (f.program_id && f.program_id !== conversion.program_id) return;
      if (!events.includes(conversion.conversion_type) || !statuses.includes(conversion.status)) return;
      const done = await env.DB.prepare(`SELECT outcome FROM forward_deliveries WHERE forward_id = ? AND conversion_id = ? AND conv_status = ?`).bind(f.id, conversion.id, conversion.status).first();
      if (done && (done.outcome === 'sent' || done.outcome === 'skipped')) return;
      const r = await deliverOne(env, forward, conversion, click, fetchImpl);
      await record(env.DB, f.id, conversion.id, conversion.status, r);
      out.push({ forward_id: f.id, ...r });
    }));
    return out;
  } catch { return []; }
}

export async function retryDelivery(env, deliveryId, { fetchImpl = fetch } = {}) {
  const d = await env.DB.prepare('SELECT * FROM forward_deliveries WHERE id = ?').bind(deliveryId).first();
  if (!d) return { error: 'Delivery not found.' };
  const f = await env.DB.prepare('SELECT * FROM conversion_forwards WHERE id = ?').bind(d.forward_id).first();
  const ctx = await loadContext(env.DB, d.conversion_id);
  if (!f || !ctx) return { error: 'The forwarding rule or the conversion no longer exists.' };
  const r = await deliverOne(env, { ...f, settings: parse(f.settings_json, {}) }, { ...ctx.conversion, status: d.conv_status }, ctx.click, fetchImpl);
  await record(env.DB, f.id, d.conversion_id, d.conv_status, r);
  return { result: r };
}

// A harmless preview (no secrets shown) or a real test send using a sample conversion.
export async function testForward(env, id, { send = false, fetchImpl = fetch } = {}) {
  const f = await env.DB.prepare('SELECT * FROM conversion_forwards WHERE id = ?').bind(id).first();
  if (!f) return { error: 'Forwarding rule not found.' };
  const forward = { ...f, settings: parse(f.settings_json, {}) };
  const sample = { id: 0, click_id: 'test-click', conversion_type: 'ftd', status: 'confirmed', reported_value: 10, calculated_commission: 4, currency: 'USD', external_reference: 'test-' + Date.now(), country_code: 'DE', occurred_at: new Date().toISOString().slice(0, 19).replace('T', ' ') };
  const click = { subs: { sub1: 'test-sub1' }, ids: { fbclid: 'TESTFBCLID', ttclid: 'TESTTTCLID' }, utm: {}, occurred_at: sample.occurred_at };
  const secret = forward.secret_enc ? await decryptSecret(env, forward.secret_enc) : null;
  const req = buildRequest(forward, secret, sample, click, { siteUrl: env.SITE_URL || null });
  if (req.skip) return { error: req.skip };
  const shown = { ...req, url: req.url.replace(/access_token=[^&]*/, 'access_token=***'), headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, /token/i.test(k) ? '***' : v])) };
  if (!send) return { preview: shown };
  if (forward.kind !== 'tracker_url' && !forward.settings.test_event_code) return { preview: shown, error: 'Add a test event code first, so the sample event does not reach your real data.' };
  const r = await deliverOne(env, forward, sample, click, fetchImpl);
  return { preview: shown, result: r };
}
