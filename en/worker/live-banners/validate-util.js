// Small validation helpers shared by validate.js and validate-slider.js.
export const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
export const oneOf = (v, list, d) => (list.includes(v) ? v : d);
export const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n * 100) / 100)) : d; };
export const txt = (v, max) => String(v ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max);

export function strict(obj, allowed, where, errs) {
  if (obj === undefined || obj === null) return {};
  if (!isObj(obj)) { errs.push(`${where} must be an object`); return {}; }
  for (const k of Object.keys(obj)) if (!allowed.includes(k)) errs.push(`${where}: unknown field "${k}"`);
  return obj;
}

/** "2026-11-24", "2026-11-24T10:30" or "2026-11-24 10:30:00" -> "2026-11-24 10:30:00" (UTC), or null. */
export function dateOf(v, where, errs) {
  if (v === undefined || v === null || v === "") return null;
  const m = String(v).trim().match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2})(?::(\d{2}))?)?$/);
  if (!m || Number.isNaN(Date.parse(m[1]))) { errs.push(`${where}: invalid date`); return null; }
  return `${m[1]} ${m[2] || "00:00"}:${m[3] || "00"}`;
}
