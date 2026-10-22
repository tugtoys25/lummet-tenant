// Look of review pages (section cards, sticky bar, links), set by the site owner in the Reviews screen (settings keys rl_*).
// Only strict colour values reach the page's CSS.
export const RL_FIELDS = [
  { key: "rl_accent", css: "--rl-accent", label: "Accent (active tab, links, icons)", def: "#2563eb" },
  { key: "rl_card_bg", css: "--rl-card-bg", label: "Card background", def: "#ffffff" },
  { key: "rl_card_text", css: "--rl-card-text", label: "Card text", def: "#1f2937" },
  { key: "rl_heading", css: "--rl-heading", label: "Card heading colour", def: "#0f172a" },
  { key: "rl_border", css: "--rl-border", label: "Card border", def: "#e5e7eb" },
];
export const RL_RADIUS = { min: 0, max: 32, def: 18 };
export const RL_SHADOWS = { none: "none", soft: "0 1px 2px rgba(15,23,42,.05), 0 10px 30px rgba(15,23,42,.07)", strong: "0 2px 4px rgba(15,23,42,.08), 0 16px 40px rgba(15,23,42,.20)" };
export const RL_KEYS = [...RL_FIELDS.map((f) => f.key), "rl_radius", "rl_shadow", "rl_mode"];
const COLOR = /^#[0-9a-fA-F]{6}$/;

export async function loadReviewStyleSettings(db) {
  const out = {};
  try {
    const rows = (await db.prepare("SELECT key, value FROM settings WHERE key LIKE 'rl\\_%' ESCAPE '\\'").all()).results || [];
    for (const r of rows) if (RL_KEYS.includes(r.key)) out[r.key] = r.value;
  } catch { /* defaults apply */ }
  return out;
}

export function buildReviewStyle(map = {}) {
  const vars = [];
  for (const f of RL_FIELDS) { const v = String(map[f.key] || "").trim(); if (COLOR.test(v)) vars.push(`${f.css}:${v}`); }
  const r = parseInt(map.rl_radius, 10);
  if (Number.isFinite(r) && r >= RL_RADIUS.min && r <= RL_RADIUS.max) vars.push(`--rl-radius:${r}px`);
  if (RL_SHADOWS[map.rl_shadow]) vars.push(`--rl-shadow:${RL_SHADOWS[map.rl_shadow]}`);
  let css = vars.length ? `:root{${vars.join(";")}}` : "";
  const acc = String(map.rl_accent || "").trim();
  if (map.rl_mode === "single" && COLOR.test(acc)) {
    const n = parseInt(acc.slice(1), 16);
    const tint = `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},.10)`;
    css += `.review-body .rv-sec:not(.rv-sec--verdict){--rv-accent:${acc};--rv-tint:${tint}}`;
  }
  return css ? `<style>${css}</style>` : "";
}
