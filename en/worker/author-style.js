// Colours and shape of the author page cards, set by the site owner in the Authors screen (settings keys ah_*).
// Only strict colour values are accepted, so nothing else can reach the page's CSS.
export const AH_FIELDS = [
  { key: "ah_section_bg", css: "--ah-section-bg", label: "Section background", kind: "color", def: "#ffffff" },
  { key: "ah_heading", css: "--ah-heading", label: "Section heading colour", kind: "color", def: "#14181f" },
  { key: "ah_stat_bg", css: "--ah-stat-bg", label: "Count tile background", kind: "color", def: "#eef2ff" },
  { key: "ah_stat_text", css: "--ah-stat-text", label: "Count tile text", kind: "color", def: "#1e1b4b" },
  { key: "ah_card_bg", css: "--ah-card-bg", label: "Card background", kind: "color", def: "#ffffff" },
  { key: "ah_card_text", css: "--ah-card-text", label: "Card text", kind: "color", def: "#14181f" },
  { key: "ah_card_border", css: "--ah-card-border", label: "Card border", kind: "color", def: "#d5dbe5" },
  { key: "ah_accent", css: "--ah-accent", label: "Accent (hover, badges)", kind: "color", def: "#4f46e5" },
];
export const AH_SHAPES = {
  ah_radius: { css: "--ah-radius", min: 0, max: 32, def: 14, unit: "px" },
};
export const AH_SHADOWS = { none: "none", soft: "0 4px 14px rgba(0,0,0,.10)", strong: "0 10px 28px rgba(0,0,0,.22)" };
export const AH_KEYS = [...AH_FIELDS.map((f) => f.key), ...Object.keys(AH_SHAPES), "ah_shadow"];

const COLOR = /^(#[0-9a-fA-F]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\))$/;

export async function loadAuthorStyleSettings(db) {
  const out = {};
  try {
    const rows = (await db.prepare("SELECT key, value FROM settings WHERE key LIKE 'ah\\_%' ESCAPE '\\'").all()).results || [];
    for (const r of rows) if (AH_KEYS.includes(r.key)) out[r.key] = r.value;
  } catch { /* defaults apply */ }
  return out;
}

export function buildAuthorStyle(map = {}) {
  const vars = [];
  for (const f of AH_FIELDS) { const v = String(map[f.key] || "").trim(); if (v && COLOR.test(v)) vars.push(`${f.css}:${v}`); }
  const r = parseInt(map.ah_radius, 10);
  if (Number.isFinite(r) && r >= AH_SHAPES.ah_radius.min && r <= AH_SHAPES.ah_radius.max) vars.push(`--ah-radius:${r}px`);
  if (AH_SHADOWS[map.ah_shadow]) vars.push(`--ah-shadow:${AH_SHADOWS[map.ah_shadow]}`);
  return vars.length ? `<style>:root{${vars.join(";")}}</style>` : "";
}
