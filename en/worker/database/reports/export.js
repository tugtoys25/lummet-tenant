// ── Export rendering ────────────────────────────────

function csvEscape(value) {
  if (value == null) return '';
  const str = String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

/**
 * Builds a CSV string from a { columns, rows } result. Kept as a plain
 * string builder, not a true byte-stream, because D1 result sets here
 * are already fully materialized in memory by the handler queries above
 * (they're bounded, permission-scoped, date-ranged aggregate rows, not
 * raw event dumps) -- the "avoid loading millions of rows into memory"
 * constraint applies to the underlying query design (querying
 * analytics_daily, not analytics_events, for anything but single-day
 * ranges), not to this formatting step.
 */
export function toCsv({ columns, rows }) {
  const header = columns.map(c => csvEscape(c.label)).join(',');
  const lines = rows.map(row => columns.map(c => csvEscape(row[c.key])).join(','));
  return [header, ...lines].join('\n');
}

export function toHtml({ columns, rows }, title) {
  const header = columns.map(c => `<th>${c.label}</th>`).join('');
  const body = rows.map(row =>
    `<tr>${columns.map(c => `<td>${row[c.key] ?? ''}</td>`).join('')}</tr>`
  ).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
    <style>table{border-collapse:collapse;width:100%;font-family:sans-serif;font-size:13px}
    th,td{border:1px solid #ccc;padding:6px 10px;text-align:left}th{background:#f5f5f5}</style>
    </head><body><h1>${title}</h1><table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></body></html>`;
}
