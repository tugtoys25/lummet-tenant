// Report-style provider APIs (for example Affilka's /partner/report): the answer is {rows:{data:[[{name,value,type},...]]}} with
// one row of named cells per day or group. This turns that into plain rows, stores them, and compares them with what this site tracked.

const PERIOD_NAMES = ['day', 'date', 'week', 'month', 'year', 'period'];

const moneyOf = (v) => (v && typeof v === 'object' && 'amount' in v ? { amount: Number(v.amount), currency: v.currency || null } : null);

export function flattenReport(body) {
  const data = body?.rows?.data;
  if (!Array.isArray(data)) return null;
  const out = [];
  for (const row of data) {
    if (!Array.isArray(row)) continue;
    const metrics = {};
    const group = {};
    let currency = null;
    let period = null;
    for (const cell of row) {
      if (!cell || typeof cell.name !== 'string') continue;
      const m = moneyOf(cell.value);
      if (m) { metrics[cell.name] = m.amount; currency = currency || m.currency; }
      else if (cell.name === 'currency') currency = String(cell.value);
      else if (typeof cell.value === 'number') metrics[cell.name] = cell.value;
      else if (PERIOD_NAMES.includes(cell.name)) period = String(cell.value).slice(0, 10);
      else if (cell.value != null) group[cell.name] = String(cell.value);
    }
    out.push({ period, group, metrics, currency });
  }
  return { rows: out, currentPage: body.current_page ?? 1, totalPages: body.total_pages ?? 1 };
}

export async function storeReportRows(db, configId, rows, fallbackPeriod) {
  let n = 0;
  for (const r of rows) {
    const period = r.period || fallbackPeriod;
    const key = Object.entries(r.group).map(([k, v]) => `${k}=${v}`).join('&');
    await db.prepare(`INSERT INTO provider_report_rows (config_id, period, group_key, metrics_json, currency) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(config_id, period, group_key) DO UPDATE SET metrics_json = excluded.metrics_json, currency = excluded.currency, fetched_at = CURRENT_TIMESTAMP`)
      .bind(configId, period, key, JSON.stringify(r.metrics), r.currency || null).run();
    n++;
  }
  return n;
}

// Reported totals per day beside this site's own counts for the same days (all statuses except rejected).
export async function compareWithTracked(db, config, days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const { results: reported } = await db.prepare(`SELECT period, group_key, metrics_json, currency FROM provider_report_rows WHERE config_id = ? AND period >= ? ORDER BY period DESC, group_key`).bind(config.id, since).all();
  const { results: tracked } = await db.prepare(`SELECT substr(occurred_at, 1, 10) AS day, conversion_type, COUNT(*) AS n, COALESCE(SUM(COALESCE(calculated_commission, reported_commission, 0)), 0) AS commission
    FROM analytics_conversions WHERE account_id = ? AND status != 'rejected' AND substr(occurred_at, 1, 10) >= ? GROUP BY day, conversion_type`).bind(config.account_id, since).all();
  const t = {};
  for (const r of tracked || []) { (t[r.day] ||= { registration: 0, ftd: 0, commission: 0 }); if (r.conversion_type === 'registration') t[r.day].registration += r.n; if (r.conversion_type === 'ftd') t[r.day].ftd += r.n; t[r.day].commission += r.commission; }
  return (reported || []).map((r) => {
    const m = JSON.parse(r.metrics_json);
    const mine = t[r.period] || { registration: 0, ftd: 0, commission: 0 };
    return {
      period: r.period, group: r.group_key, currency: r.currency,
      reported: { visits: m.visits_count ?? null, registrations: m.registrations_count ?? null, first_deposits: m.first_deposits_count ?? null, income: m.partner_income ?? null },
      tracked: { registrations: mine.registration, first_deposits: mine.ftd, commission: Math.round(mine.commission * 100) / 100 }
    };
  });
}
