// Which built-in parts of a casino review are switched off (hidden content and no tab in the top bar).
// Kept in the settings table under review_hidden:<slug>, so no migration is needed.
export const REVIEW_PARTS = [
  { id: "summary", label: "Summary table" },
  { id: "overview", label: "Overview" },
  { id: "games", label: "Games" },
  { id: "bonuses", label: "Bonuses" },
  { id: "payments", label: "Payment methods" },
  { id: "licensing", label: "Licensing" },
  { id: "more-details", label: "More details (main text)" },
  { id: "verdict", label: "Verdict" },
  { id: "pros-cons", label: "Pros and cons" },
  { id: "faq", label: "FAQ" },
  { id: "related-casinos", label: "Related casinos" },
];
const IDS = new Set(REVIEW_PARTS.map((p) => p.id));
const key = (slug) => `review_hidden:${slug}`;

export async function getHiddenParts(db, slug) {
  try {
    const row = await db.prepare("SELECT value FROM settings WHERE key = ?").bind(key(slug)).first();
    const arr = row && row.value ? JSON.parse(row.value) : [];
    return new Set((Array.isArray(arr) ? arr : []).filter((x) => IDS.has(x)));
  } catch { return new Set(); }
}

export async function setHiddenParts(db, slug, ids) {
  const clean = [...new Set((Array.isArray(ids) ? ids : []).filter((x) => IDS.has(x)))];
  if (!clean.length) { await db.prepare("DELETE FROM settings WHERE key = ?").bind(key(slug)).run(); return []; }
  await db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(key(slug), JSON.stringify(clean)).run();
  return clean;
}

export async function clearHiddenParts(db, slug) {
  try { await db.prepare("DELETE FROM settings WHERE key = ?").bind(key(slug)).run(); } catch { /* nothing to clear */ }
}
