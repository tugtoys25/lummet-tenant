// Earnings tools: the funnel, earnings by sub-ID, payouts and invoices, promo codes and creatives.
// Money is never added across currencies: every figure is kept per currency.

const SUB_KEYS = ['sub1', 'sub2', 'sub3', 'sub4', 'sub5', 'sub6', 'sub7', 'sub8', 'sub9', 'sub10'];
const UTM_COLUMNS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
export const SUBID_KEYS = [...SUB_KEYS, ...UTM_COLUMNS, 'country_code', 'tracking_link_id'];

const CLICK_EVENT = 'TRACKING_LINK_CLICK';

function range(from, to, column) {
  const where = []; const params = [];
  if (from) { where.push(`${column} >= ?`); params.push(from); }
  if (to) { where.push(`${column} < date(?, '+1 day')`); params.push(to); }
  return { where, params };
}

function keyExpr(key) {
  if (!SUBID_KEYS.includes(key)) throw new Error(`Unknown key "${key}".`);
  if (SUB_KEYS.includes(key)) return `json_extract(e.metadata, '$.subs.${key}')`;
  return `e.${key}`;
}

// ── Funnel: clicks -> registrations -> first deposits -> deposits, with money per currency ──
export async function getFunnel(db, { from = null, to = null, programId = null } = {}) {
  const ev = range(from, to, 'e.occurred_at');
  const evWhere = [`e.event_type = '${CLICK_EVENT}'`, 'COALESCE(e.is_bot, 0) = 0', ...ev.where];
  const evParams = [...ev.params];
  if (programId) { evWhere.push('e.program_id = ?'); evParams.push(programId); }
  const clicks = (await db.prepare(`
    SELECT e.program_id AS program_id, COUNT(DISTINCT COALESCE(e.click_id, e.id)) AS clicks
    FROM analytics_events e WHERE ${evWhere.join(' AND ')} GROUP BY e.program_id
  `).bind(...evParams).all()).results || [];

  const cv = range(from, to, 'c.occurred_at');
  const cvWhere = [...cv.where]; const cvParams = [...cv.params];
  if (programId) { cvWhere.push('c.program_id = ?'); cvParams.push(programId); }
  const conv = (await db.prepare(`
    SELECT c.program_id AS program_id, c.conversion_type AS type, c.status AS status, c.currency AS currency,
           COUNT(*) AS n, COALESCE(SUM(c.reported_value), 0) AS value, COALESCE(SUM(c.calculated_commission), 0) AS commission
    FROM analytics_conversions c ${cvWhere.length ? 'WHERE ' + cvWhere.join(' AND ') : ''}
    GROUP BY c.program_id, c.conversion_type, c.status, c.currency
  `).bind(...cvParams).all()).results || [];

  const names = new Map(((await db.prepare('SELECT id, name FROM affiliate_programs').all()).results || []).map((r) => [r.id, r.name]));
  const programs = new Map();
  const get = (id) => {
    const k = id == null ? 0 : id;
    if (!programs.has(k)) programs.set(k, { program_id: id, name: id == null ? '(no program)' : names.get(id) || `Program ${id}`, clicks: 0, registrations: 0, ftd: 0, deposits: 0, rejected: 0, pending: 0, deposit_value: {}, commission_confirmed: {}, commission_pending: {} });
    return programs.get(k);
  };
  for (const r of clicks) get(r.program_id).clicks += r.clicks;
  for (const r of conv) {
    const p = get(r.program_id);
    if (r.status === 'rejected') { p.rejected += r.n; continue; }
    if (r.status === 'pending') p.pending += r.n;
    if (r.type === 'registration') p.registrations += r.n;
    else if (r.type === 'ftd') p.ftd += r.n;
    else if (r.type === 'deposit') p.deposits += r.n;
    if (r.type === 'ftd' || r.type === 'deposit') p.deposit_value[r.currency] = (p.deposit_value[r.currency] || 0) + r.value;
    const bucket = r.status === 'confirmed' ? p.commission_confirmed : p.commission_pending;
    bucket[r.currency] = (bucket[r.currency] || 0) + r.commission;
  }
  const rows = [...programs.values()].sort((a, b) => b.clicks - a.clicks);
  const total = { clicks: 0, registrations: 0, ftd: 0, deposits: 0 };
  for (const r of rows) for (const k of Object.keys(total)) total[k] += r[k];
  const rate = (n, d) => (d ? Math.round((n / d) * 10000) / 100 : null);
  return { programs: rows, total, rates: { click_to_registration: rate(total.registrations, total.clicks), registration_to_ftd: rate(total.ftd, total.registrations), click_to_ftd: rate(total.ftd, total.clicks) } };
}

// ── Earnings by sub-ID (or UTM, country, link): which traffic source actually produces money ──
export async function getSubIdReport(db, { key = 'sub1', from = null, to = null, programId = null } = {}) {
  const expr = keyExpr(key);
  const ev = range(from, to, 'e.occurred_at');
  const where = [`e.event_type = '${CLICK_EVENT}'`, 'COALESCE(e.is_bot, 0) = 0', ...ev.where];
  const params = [...ev.params];
  if (programId) { where.push('e.program_id = ?'); params.push(programId); }
  const rows = (await db.prepare(`
    SELECT COALESCE(CAST(${expr} AS TEXT), '(none)') AS k,
           COUNT(DISTINCT e.click_id) AS clicks,
           COUNT(DISTINCT CASE WHEN c.conversion_type = 'registration' AND c.status != 'rejected' THEN c.id END) AS registrations,
           COUNT(DISTINCT CASE WHEN c.conversion_type = 'ftd' AND c.status != 'rejected' THEN c.id END) AS ftd,
           COUNT(DISTINCT CASE WHEN c.conversion_type = 'deposit' AND c.status != 'rejected' THEN c.id END) AS deposits
    FROM analytics_events e LEFT JOIN analytics_conversions c ON c.click_id = e.click_id
    WHERE ${where.join(' AND ')} GROUP BY k ORDER BY clicks DESC LIMIT 500
  `).bind(...params).all()).results || [];
  const money = (await db.prepare(`
    SELECT COALESCE(CAST(${expr} AS TEXT), '(none)') AS k, c.currency AS currency,
           COALESCE(SUM(CASE WHEN c.status = 'confirmed' THEN c.calculated_commission END), 0) AS confirmed,
           COALESCE(SUM(CASE WHEN c.status = 'pending' THEN c.calculated_commission END), 0) AS pending
    FROM analytics_events e JOIN analytics_conversions c ON c.click_id = e.click_id
    WHERE ${where.join(' AND ')} GROUP BY k, c.currency
  `).bind(...params).all()).results || [];
  const byKey = new Map(rows.map((r) => [r.k, { key: r.k, clicks: r.clicks, registrations: r.registrations, ftd: r.ftd, deposits: r.deposits, commission_confirmed: {}, commission_pending: {} }]));
  for (const m of money) {
    const row = byKey.get(m.k);
    if (!row) continue;
    if (m.confirmed) row.commission_confirmed[m.currency] = m.confirmed;
    if (m.pending) row.commission_pending[m.currency] = m.pending;
  }
  return { key, rows: [...byKey.values()] };
}

// ── Payouts ──
const PAYOUT_STATUSES = ['expected', 'invoiced', 'paid', 'cancelled'];

export async function listPayouts(db, { programId = null } = {}) {
  const r = await db.prepare(`
    SELECT p.*, pr.name AS program_name FROM payouts p LEFT JOIN affiliate_programs pr ON pr.id = p.program_id
    ${programId ? 'WHERE p.program_id = ?' : ''} ORDER BY p.id DESC LIMIT 500
  `).bind(...(programId ? [programId] : [])).all();
  return r.results || [];
}

export function validatePayout(input) {
  const errors = [];
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount < 0) errors.push('Amount must be a number of zero or more.');
  const currency = String(input.currency || 'USD').toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) errors.push('Currency must be a three-letter code.');
  const status = input.status || 'expected';
  if (!PAYOUT_STATUSES.includes(status)) errors.push('Unknown status.');
  if (!Number.isInteger(Number(input.program_id)) || Number(input.program_id) <= 0) errors.push('Choose a program.');
  for (const f of ['period_start', 'period_end', 'paid_at']) if (input[f] && !/^\d{4}-\d{2}-\d{2}/.test(input[f])) errors.push(`${f} must be a date (YYYY-MM-DD).`);
  if (status === 'paid' && !input.paid_at) input = { ...input, paid_at: new Date().toISOString().slice(0, 10) };
  return { errors, value: { id: input.id ? Number(input.id) : null, program_id: Number(input.program_id), account_id: input.account_id ? Number(input.account_id) : null, period_start: input.period_start || null, period_end: input.period_end || null, amount, currency, status, invoice_number: input.invoice_number || null, paid_at: input.paid_at || null, reference: input.reference ? String(input.reference).slice(0, 200) : null, notes: input.notes ? String(input.notes).slice(0, 1000) : null } };
}

export async function savePayout(db, value, userId = null) {
  if (value.id) {
    await db.prepare(`UPDATE payouts SET program_id=?, account_id=?, period_start=?, period_end=?, amount=?, currency=?, status=?, invoice_number=?, paid_at=?, reference=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(value.program_id, value.account_id, value.period_start, value.period_end, value.amount, value.currency, value.status, value.invoice_number, value.paid_at, value.reference, value.notes, value.id).run();
    return value.id;
  }
  const r = await db.prepare(`INSERT INTO payouts (program_id, account_id, period_start, period_end, amount, currency, status, invoice_number, paid_at, reference, notes, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(value.program_id, value.account_id, value.period_start, value.period_end, value.amount, value.currency, value.status, value.invoice_number, value.paid_at, value.reference, value.notes, userId).run();
  return r.meta.last_row_id;
}

export async function deletePayout(db, id) {
  await db.prepare('DELETE FROM payouts WHERE id = ?').bind(id).run();
}

// What each program owes you: confirmed commission earned, minus what has been paid. Pending commission is shown but not counted.
export async function getBalances(db) {
  const earned = (await db.prepare(`
    SELECT program_id, currency,
           COALESCE(SUM(CASE WHEN status='confirmed' THEN calculated_commission END),0) AS confirmed,
           COALESCE(SUM(CASE WHEN status='pending' THEN calculated_commission END),0) AS pending
    FROM analytics_conversions GROUP BY program_id, currency
  `).all()).results || [];
  const paid = (await db.prepare(`
    SELECT program_id, currency,
           COALESCE(SUM(CASE WHEN status='paid' THEN amount END),0) AS paid,
           COALESCE(SUM(CASE WHEN status='invoiced' THEN amount END),0) AS invoiced
    FROM payouts GROUP BY program_id, currency
  `).all()).results || [];
  const names = new Map(((await db.prepare('SELECT id, name FROM affiliate_programs').all()).results || []).map((r) => [r.id, r.name]));
  const map = new Map();
  const get = (pid, cur) => {
    const k = `${pid}|${cur}`;
    if (!map.has(k)) map.set(k, { program_id: pid, name: pid == null ? '(no program)' : names.get(pid) || `Program ${pid}`, currency: cur, confirmed: 0, pending: 0, paid: 0, invoiced: 0, outstanding: 0 });
    return map.get(k);
  };
  for (const r of earned) { const b = get(r.program_id, r.currency); b.confirmed = r.confirmed; b.pending = r.pending; }
  for (const r of paid) { const b = get(r.program_id, r.currency); b.paid = r.paid; b.invoiced = r.invoiced; }
  for (const b of map.values()) b.outstanding = Math.round((b.confirmed - b.paid) * 100) / 100;
  return [...map.values()].sort((a, b) => b.outstanding - a.outstanding);
}

// Builds an invoice for the confirmed commission of one program and currency in a period, and records it as an 'invoiced' payout.
// Refuses a period that overlaps an invoice already raised for the same program and currency.
export async function createInvoice(db, { programId, currency, from, to, userId = null, notes = null }) {
  const cur = String(currency || 'USD').toUpperCase();
  const overlap = await db.prepare(`SELECT id, invoice_number FROM payouts WHERE program_id = ? AND currency = ? AND status IN ('invoiced','paid') AND period_start IS NOT NULL AND period_start <= ? AND period_end >= ? LIMIT 1`).bind(programId, cur, to, from).first();
  if (overlap) return { error: `This period overlaps invoice ${overlap.invoice_number || '#' + overlap.id}.` };
  const lines = (await db.prepare(`
    SELECT conversion_type AS type, COUNT(*) AS n, COALESCE(SUM(reported_value),0) AS value, COALESCE(SUM(calculated_commission),0) AS commission
    FROM analytics_conversions
    WHERE program_id = ? AND currency = ? AND status = 'confirmed' AND occurred_at >= ? AND occurred_at < date(?, '+1 day')
    GROUP BY conversion_type ORDER BY conversion_type
  `).bind(programId, cur, from, to).all()).results || [];
  const total = Math.round(lines.reduce((s, l) => s + l.commission, 0) * 100) / 100;
  if (!lines.length || total <= 0) return { error: 'No confirmed commission in this period for that currency.' };
  const program = await db.prepare('SELECT name FROM affiliate_programs WHERE id = ?').bind(programId).first();
  const seq = (await db.prepare(`SELECT COUNT(*) AS c FROM payouts WHERE invoice_number IS NOT NULL`).first()).c + 1;
  const number = `INV-${from.slice(0, 7).replace('-', '')}-${programId}-${String(seq).padStart(4, '0')}`;
  const id = await savePayout(db, { id: null, program_id: programId, account_id: null, period_start: from, period_end: to, amount: total, currency: cur, status: 'invoiced', invoice_number: number, paid_at: null, reference: null, notes }, userId);
  return { invoice: { id, number, program: program ? program.name : `Program ${programId}`, currency: cur, period_start: from, period_end: to, lines: lines.map((l) => ({ type: l.type, count: l.n, value: l.value, commission: l.commission })), total, notes } };
}

// ── Promo codes ──
export function validatePromo(input) {
  const errors = [];
  const code = String(input.code || '').trim();
  if (!/^[A-Za-z0-9_-]{2,40}$/.test(code)) errors.push('The code must be 2 to 40 letters, digits, - or _.');
  const status = input.status === 'paused' ? 'paused' : 'active';
  const id = (v) => (v ? Number(v) : null);
  return { errors, value: { id: id(input.id), code, program_id: id(input.program_id), casino_id: id(input.casino_id), tracking_link_id: id(input.tracking_link_id), description: input.description ? String(input.description).slice(0, 300) : null, status, starts_at: input.starts_at || null, ends_at: input.ends_at || null } };
}

export async function savePromo(db, v, userId = null) {
  if (v.id) {
    await db.prepare(`UPDATE promo_codes SET code=?, program_id=?, casino_id=?, tracking_link_id=?, description=?, status=?, starts_at=?, ends_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(v.code, v.program_id, v.casino_id, v.tracking_link_id, v.description, v.status, v.starts_at, v.ends_at, v.id).run();
    return v.id;
  }
  const r = await db.prepare(`INSERT INTO promo_codes (code, program_id, casino_id, tracking_link_id, description, status, starts_at, ends_at, created_by) VALUES (?,?,?,?,?,?,?,?,?)`)
    .bind(v.code, v.program_id, v.casino_id, v.tracking_link_id, v.description, v.status, v.starts_at, v.ends_at, userId).run();
  return r.meta.last_row_id;
}

export async function deletePromo(db, id) { await db.prepare('DELETE FROM promo_codes WHERE id = ?').bind(id).run(); }

// A conversion counts for a code when the postback carried that code, or when its tracking link is the one the code is bound to.
export async function listPromos(db) {
  const rows = (await db.prepare(`
    SELECT p.*, pr.name AS program_name, c.name AS casino_name, t.internal_name AS link_name FROM promo_codes p
    LEFT JOIN affiliate_programs pr ON pr.id = p.program_id LEFT JOIN casinos c ON c.id = p.casino_id LEFT JOIN tracking_links t ON t.id = p.tracking_link_id
    ORDER BY p.id DESC LIMIT 500`).all()).results || [];
  const stats = (await db.prepare(`
    SELECT p.id AS promo_id, c.currency AS currency, COUNT(DISTINCT c.id) AS conversions,
           COALESCE(SUM(CASE WHEN c.status='confirmed' THEN c.calculated_commission END),0) AS commission
    FROM promo_codes p
    JOIN analytics_conversions c ON c.status != 'rejected' AND (
      c.id IN (SELECT conversion_id FROM conversion_promo cp WHERE LOWER(cp.promo_code) = LOWER(p.code))
      OR (p.tracking_link_id IS NOT NULL AND c.tracking_link_id = p.tracking_link_id))
    GROUP BY p.id, c.currency`).all()).results || [];
  for (const r of rows) {
    r.conversions = 0; r.commission = {};
    for (const s of stats.filter((x) => x.promo_id === r.id)) { r.conversions += s.conversions; r.commission[s.currency] = s.commission; }
  }
  return rows;
}

export async function recordConversionPromo(db, conversionId, code) {
  if (!conversionId || !code) return;
  try { await db.prepare('INSERT OR REPLACE INTO conversion_promo (conversion_id, promo_code) VALUES (?, ?)').bind(conversionId, String(code).slice(0, 40)).run(); } catch { /* table not migrated yet: the conversion is still stored */ }
}

// ── Creatives ──
const CREATIVE_KINDS = ['banner', 'text', 'landing', 'email', 'video'];
export function validateCreative(input) {
  const errors = [];
  const name = String(input.name || '').trim();
  if (!name) errors.push('Give the creative a name.');
  const kind = CREATIVE_KINDS.includes(input.kind) ? input.kind : 'banner';
  const asset = input.asset_url ? String(input.asset_url).trim() : null;
  if (asset && !/^(https:\/\/|\/)/.test(asset)) errors.push('The asset must be an https:// address or a path on this site.');
  const id = (v) => (v ? Number(v) : null);
  const dim = (v) => (v && Number(v) > 0 ? Math.min(Math.round(Number(v)), 5000) : null);
  return { errors, value: { id: id(input.id), name: name.slice(0, 120), kind, program_id: id(input.program_id), tracking_link_id: id(input.tracking_link_id), asset_url: asset, width: dim(input.width), height: dim(input.height), body_text: input.body_text ? String(input.body_text).slice(0, 500) : null, notes: input.notes ? String(input.notes).slice(0, 500) : null, status: input.status === 'archived' ? 'archived' : 'active' } };
}

export async function saveCreative(db, v, userId = null) {
  if (v.id) {
    await db.prepare(`UPDATE creatives SET name=?, kind=?, program_id=?, tracking_link_id=?, asset_url=?, width=?, height=?, body_text=?, notes=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(v.name, v.kind, v.program_id, v.tracking_link_id, v.asset_url, v.width, v.height, v.body_text, v.notes, v.status, v.id).run();
    return v.id;
  }
  const r = await db.prepare(`INSERT INTO creatives (name, kind, program_id, tracking_link_id, asset_url, width, height, body_text, notes, status, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(v.name, v.kind, v.program_id, v.tracking_link_id, v.asset_url, v.width, v.height, v.body_text, v.notes, v.status, userId).run();
  return r.meta.last_row_id;
}

export async function deleteCreative(db, id) { await db.prepare('DELETE FROM creatives WHERE id = ?').bind(id).run(); }

export async function listCreatives(db) {
  return (await db.prepare(`
    SELECT cr.*, pr.name AS program_name, t.internal_name AS link_name, t.tracking_code AS tracking_code,
           (SELECT COUNT(*) FROM analytics_conversions c WHERE c.tracking_link_id = cr.tracking_link_id AND c.status != 'rejected') AS conversions
    FROM creatives cr LEFT JOIN affiliate_programs pr ON pr.id = cr.program_id LEFT JOIN tracking_links t ON t.id = cr.tracking_link_id
    ORDER BY cr.id DESC LIMIT 500`).all()).results || [];
}
