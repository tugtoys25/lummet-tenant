// Everything an item can be compared on.
//
// One catalog per content type feeds two places: the dashboard (the admin PICKS a criterion
// from this list instead of typing a key) and the public comparison page (which uses the
// kind of each field to show stars, ticks, chips and "best value" highlights).
// A comparison's saved criteria ({key, label}) keep working exactly as before; keys the
// catalog does not know are shown as plain text like they always were.

function escapeHtml(v) {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Added to every type: what the item is linked to elsewhere on the site
const RELATED_FIELDS = [
  { key: "payment_methods", label: "Payment methods", kind: "list", related: true },
  { key: "categories", label: "Categories", kind: "list", related: true }
];

// kind: rating | number | text | bool | list | url
// better: "high" marks the largest number as the best value
const CASINO_FIELDS = [
  { key: "rating", label: "Rating", kind: "rating", better: "high" },
  { key: "bonus_title", label: "Welcome bonus", kind: "text" },
  { key: "bonus_value", label: "Bonus value", kind: "text" },
  { key: "license", label: "Licence", kind: "text" },
  { key: "owner", label: "Operator / owner", kind: "text" },
  { key: "features", label: "Key features", kind: "list" },
  { key: "supported_countries", label: "Accepts players from", kind: "list" },
  { key: "restricted_countries", label: "Restricted countries", kind: "list" },
  { key: "website_url", label: "Website", kind: "url" },
  { key: "featured", label: "Featured by our editors", kind: "bool" }
];

const ITEM_FIELDS = [
  { key: "rating", label: "Rating", kind: "rating", better: "high" },
  { key: "license", label: "Licence", kind: "text" },
  { key: "license_country", label: "Licence country", kind: "text" },
  { key: "website", label: "Website", kind: "url" },
  { key: "featured", label: "Featured by our editors", kind: "bool" }
];

const SPORTSBOOK_FIELDS = [
  ...ITEM_FIELDS,
  { key: "live_betting", label: "Live betting", kind: "bool" },
  { key: "pre_match", label: "Pre-match betting", kind: "bool" },
  { key: "cashout", label: "Cash out", kind: "bool" },
  { key: "mobile_app", label: "Mobile app", kind: "bool" }
];

const CUSTOM_KIND = {
  number: "number", rating: "rating", boolean: "bool", url: "url",
  multi_select: "list", country: "text", currency: "text", select: "text", date: "text", text: "text", textarea: "text"
};

/** The comparable fields for a content type (custom types add their own defined fields). */
export async function getComparableFields(db, contentType, customTypeSlug = "") {
  if (contentType === "casino") return [...CASINO_FIELDS, ...RELATED_FIELDS].map((f) => ({ ...f }));
  if (contentType === "sportsbook") return [...SPORTSBOOK_FIELDS, ...RELATED_FIELDS].map((f) => ({ ...f }));
  if (contentType === "affiliate_partner") return [...ITEM_FIELDS, ...RELATED_FIELDS].map((f) => ({ ...f }));
  if (contentType !== "custom") return [];

  const fields = [...ITEM_FIELDS, ...RELATED_FIELDS].map((f) => ({ ...f }));
  try {
    const slug = String(customTypeSlug || "");
    const sql = `SELECT field_key, label, field_type FROM custom_field_definitions ${slug ? "WHERE custom_type_slug = ?" : ""} ORDER BY display_order ASC, id ASC`;
    const stmt = db.prepare(sql);
    const res = await (slug ? stmt.bind(slug) : stmt).all();
    const seen = new Set(fields.map((f) => f.key));
    for (const d of res.results || []) {
      if (d.field_type === "image" || d.field_type === "textarea" || seen.has(d.field_key)) continue;
      seen.add(d.field_key);
      const kind = CUSTOM_KIND[d.field_type] || "text";
      fields.push({ key: d.field_key, label: d.label, kind, better: kind === "rating" || kind === "number" ? "" : "", custom: true });
    }
  } catch (err) {
    console.error("comparison fields: custom definitions unavailable:", err && err.message);
  }
  return fields;
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

function toList(raw) {
  if (raw === null || raw === undefined || raw === "") return [];
  if (Array.isArray(raw)) return raw.map((v) => String(v).trim()).filter(Boolean);
  const text = String(raw).trim();
  if (text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.map((v) => (typeof v === "object" && v ? (v.name || v.label || v.title || "") : String(v)).trim()).filter(Boolean);
    } catch { /* fall through to comma list */ }
  }
  return text.split(/[,;\n|]+/).map((v) => v.trim()).filter(Boolean);
}

function isTrue(v) { return v === 1 || v === true || v === "1" || v === "true" || v === "yes"; }
function isFalse(v) { return v === 0 || v === false || v === "0" || v === "false" || v === "no"; }
function empty(v) { return v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length); }

/**
 * Payment methods and categories of each item, as { "casino:12": { payment_methods: [...], categories: [...] } }.
 * A missing table or a failed query just leaves those rows empty.
 */
export async function loadRelatedValues(db, items) {
  const out = {};
  for (const item of items) {
    const key = `${item.contentType}:${item.id}`;
    const v = { payment_methods: [], categories: [] };
    try {
      const pm = item.contentType === "casino"
        ? await db.prepare("SELECT pm.name FROM casino_payment_methods l JOIN payment_methods pm ON pm.id = l.payment_method_id WHERE l.casino_id = ? ORDER BY pm.name").bind(item.id).all()
        : await db.prepare("SELECT pm.name FROM content_payment_methods l JOIN payment_methods pm ON pm.id = l.payment_method_id WHERE l.content_type = ? AND l.content_id = ? ORDER BY pm.name").bind(item.contentType, item.id).all();
      v.payment_methods = (pm.results || []).map((r) => r.name);
    } catch (err) { console.error("comparison payment methods unavailable:", err && err.message); }
    try {
      const cat = item.contentType === "casino"
        ? await db.prepare("SELECT c.name FROM casino_categories l JOIN categories c ON c.id = l.category_id WHERE l.casino_id = ? ORDER BY c.name").bind(item.id).all()
        : await db.prepare("SELECT c.name FROM content_categories l JOIN categories c ON c.id = l.category_id WHERE l.content_type = ? AND l.content_id = ? ORDER BY c.name").bind(item.contentType, item.id).all();
      v.categories = (cat.results || []).map((r) => r.name);
    } catch (err) { console.error("comparison categories unavailable:", err && err.message); }
    out[key] = v;
  }
  return out;
}

/** the raw value of one field for one item, or null */
export function rawValue(item, key, customValues) {
  if (item.raw && Object.prototype.hasOwnProperty.call(item.raw, key)) return item.raw[key];
  if (customValues && Object.prototype.hasOwnProperty.call(customValues, key)) return customValues[key];
  return null;
}

/** { html, sort, same } for one cell. `sort` is the comparable form used to find the best value and to spot differences. */
export function formatCell(field, raw) {
  const kind = field.kind;
  if (empty(raw)) return { html: `<span class="cmp-na">—</span>`, sort: "", num: null };

  if (kind === "bool") {
    if (isTrue(raw)) return { html: `<span class="cmp-yes" aria-label="Yes">✓</span>`, sort: "1", num: null };
    if (isFalse(raw)) return { html: `<span class="cmp-no" aria-label="No">✗</span>`, sort: "0", num: null };
  }
  if (kind === "rating" || kind === "number") {
    const n = Number(raw);
    if (Number.isFinite(n)) {
      if (kind === "rating") {
        const pct = Math.max(0, Math.min(100, (n / 5) * 100));
        return {
          html: `<span class="cmp-rating"><span class="cmp-stars" style="--pct:${pct.toFixed(0)}%" aria-hidden="true"></span><strong>${n.toFixed(1)}</strong><span class="cmp-of">/ 5</span></span>`,
          sort: String(n), num: n
        };
      }
      return { html: `<strong>${escapeHtml(String(n))}</strong>`, sort: String(n), num: n };
    }
  }
  if (kind === "list") {
    const list = toList(raw);
    if (!list.length) return { html: `<span class="cmp-na">—</span>`, sort: "", num: null };
    const shown = list.slice(0, 8).map((v) => `<span class="cmp-chip">${escapeHtml(v)}</span>`).join("");
    const more = list.length > 8 ? `<span class="cmp-chip cmp-chip--more">+${list.length - 8}</span>` : "";
    return { html: `<span class="cmp-chips">${shown}${more}</span>`, sort: [...list].sort().join("|").toLowerCase(), num: null };
  }
  if (kind === "url") {
    const href = String(raw);
    if (/^https?:\/\//i.test(href)) {
      let host = href;
      try { host = new URL(href).hostname.replace(/^www\./, ""); } catch { /* keep as is */ }
      return { html: `<a href="${escapeHtml(href)}" rel="nofollow noopener" target="_blank">${escapeHtml(host)}</a>`, sort: host.toLowerCase(), num: null };
    }
  }
  // legacy behaviour for keys the catalog does not know: 1/0 read as tick/cross
  if (isTrue(raw)) return { html: `<span class="cmp-yes" aria-label="Yes">✓</span>`, sort: "1", num: null };
  if (isFalse(raw)) return { html: `<span class="cmp-no" aria-label="No">✗</span>`, sort: "0", num: null };
  const text = String(raw);
  return { html: escapeHtml(text), sort: text.trim().toLowerCase(), num: null };
}

/**
 * Rows for the public table.
 *   criteria  the comparison's saved criteria [{ key, label }] (admin order, kept first)
 *   fields    the catalog for the comparison type
 * Every catalog field that at least one item has a value for is listed too, under "More
 * details", so the page always shows everything users can compare on.
 */
export function buildComparisonRows(items, criteria, fields, customValuesByItemKey, design = null, related = {}) {
  const valuesOf = (item) => {
    const k = `${item.contentType}:${item.id}`;
    const custom = item.contentType === "custom" ? customValuesByItemKey[k] : null;
    return related[k] ? { ...(custom || {}), ...related[k] } : custom;
  };
  const byKey = new Map(fields.map((f) => [f.key, f]));

  const typed = (design && design.cells) || {};
  const rowFor = (field, label) => {
    const cells = items.map((item) => {
      // a custom value typed in the dashboard replaces the real one for this cell only
      const own = typed[field.key] && typed[field.key][`${item.contentType}:${item.id}`];
      if (own) return { html: escapeHtml(own), sort: String(own).toLowerCase(), num: null, custom: true };
      return formatCell(field, rawValue(item, field.key, valuesOf(item)));
    });
    const filled = cells.filter((c) => c.sort !== "");
    const distinct = new Set(cells.map((c) => c.sort));
    let best = -1;
    if (field.better === "high") {
      const nums = cells.map((c) => c.num);
      const max = Math.max(...nums.filter((n) => n !== null));
      if (Number.isFinite(max) && distinct.size > 1) best = nums.indexOf(max);
    }
    return { key: field.key, label: label || field.label, cells, filled: filled.length, differs: distinct.size > 1, best };
  };

  const chosen = [];
  const used = new Set();
  for (const c of Array.isArray(criteria) ? criteria : []) {
    if (!c || !c.key) continue;
    const field = byKey.get(c.key) || { key: c.key, label: c.label || c.key, kind: "text" };
    chosen.push(rowFor(field, c.label));
    used.add(c.key);
  }

  const more = [];
  for (const f of fields) {
    if (used.has(f.key) || f.key === "rating") continue;
    const row = rowFor(f);
    if (row.filled > 0) more.push(row);
  }
  return { main: chosen, more, ratingRow: rowFor(byKey.get("rating") || { key: "rating", label: "Rating", kind: "rating", better: "high" }) };
}
