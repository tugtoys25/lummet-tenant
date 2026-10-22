import { getResearchItemById } from "../../database/research.js";
import { GROUND, ITEM_TYPES } from "./config.js";
import { clip } from "./text-utils.js";

// ---------- facts from the database ----------

const CASINO_FIELDS = ["name", "rating", "bonus_title", "bonus_value", "license", "owner", "website_url", "features", "supported_countries", "restricted_countries", "seo_description"];

const ITEM_FIELDS = ["name", "title", "description", "excerpt", "website", "rating", "license", "license_country", "live_betting", "pre_match", "cashout", "mobile_app", "metadata_json"];

function factLines(row, keys) {
  const out = [];
  for (const k of keys) {
    const v = row[k];
    if (v === null || v === undefined || v === "" || v === 0 && /^(live_betting|pre_match|cashout|mobile_app)$/.test(k)) continue;
    out.push(`${k.replace(/_/g, " ")}: ${clip(v, 700)}`);
  }
  return out;
}

export async function loadItemFacts(db, type, key) {
  if (!ITEM_TYPES.includes(type) || !key) return null;
  try {
    if (type === "casino") {
      const row = await db.prepare(`SELECT * FROM casinos WHERE slug = ? LIMIT 1`).bind(String(key)).first();
      if (!row) return null;
      const lines = factLines(row, CASINO_FIELDS);
      try {
        const pm = await db.prepare(`SELECT p.name FROM casino_payment_methods c JOIN payment_methods p ON p.id = c.payment_method_id WHERE c.casino_id = ? LIMIT 30`).bind(row.id).all();
        const names = (pm.results || []).map((r) => r.name).filter(Boolean);
        if (names.length) lines.push(`payment methods: ${names.join(", ")}`);
      } catch (_) { /* optional */ }
      return { type, key: row.slug, name: row.name, row, facts: lines.join("\n") };
    }
    const row = await db.prepare(`SELECT * FROM content_items WHERE content_type = ? AND slug = ? LIMIT 1`).bind(type, String(key)).first();
    if (!row) return null;
    const lines = factLines(row, ITEM_FIELDS);
    try {
      const cf = await db.prepare(`SELECT field_key, value FROM custom_field_values WHERE content_item_id = ? LIMIT 40`).bind(row.id).all();
      for (const f of cf.results || []) if (f.value) lines.push(`${f.field_key}: ${clip(f.value, 500)}`);
    } catch (_) { /* optional */ }
    return { type, key: row.slug, name: row.name, row, facts: lines.join("\n") };
  } catch (_) {
    return null;
  }
}

export async function loadResearchReference(db, id) {
  const item = await getResearchItemById(db, Number(id));
  if (!item) return null;
  let claims = [], sources = [];
  try {
    claims = (await db.prepare(`SELECT claim_text, status FROM research_claims WHERE research_item_id = ? LIMIT 60`).bind(item.id).all()).results || [];
  } catch (_) { /* optional */ }
  try {
    sources = (await db.prepare(`SELECT DISTINCT s.title, s.url FROM research_sources s JOIN research_claim_sources cs ON cs.source_id = s.id JOIN research_claims c ON c.id = cs.claim_id WHERE c.research_item_id = ? LIMIT 30`).bind(item.id).all()).results || [];
  } catch (_) { /* optional */ }
  return { item, claims, sources };
}

// ---------- the tasks ----------

export const arr = (v, n, max = 400) => (Array.isArray(v) ? v.map((x) => clip(x, max)).filter(Boolean).slice(0, n) : []);

export function secs(site, role, extra = "") {
  return `You are ${role} for ${site.siteName}. ${GROUND} ${extra}`.trim();
}
