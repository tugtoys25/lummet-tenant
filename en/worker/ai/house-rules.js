// =====================================================
// LUMMET AI -- site owner preferences ("house rules")
//
// Three optional settings an admin sets in AI Studio: a TONE, TOPICS to politely decline, and a few lines of EXTRA
// GUIDANCE. They are stored in the existing `settings` table, read on every chat request, and used by the one prompt
// that serves BOTH the floating widget and the lummet. page. They sit BELOW the strict rules: they can make the chat
// shorter, more formal, or more reserved, but they cannot make it invent facts, links or sources.
// =====================================================

export const RULE_KEYS = { tone: "ai_chat_tone", decline: "ai_chat_decline", notes: "ai_chat_notes" };
export const TONES = { friendly: "Friendly (default)", professional: "Professional", concise: "Concise" };
export const LIMITS = { declineLines: 10, declineLen: 100, notes: 500 };
export const DECLINE_MARKER = "TOPICS TO POLITELY DECLINE";

const clean = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").replace(/[ \t]+/g, " ").trim().slice(0, n);

/** Makes admin input safe and bounded. Returns the cleaned rules. */
export function sanitizeRules(input = {}) {
  const tone = Object.prototype.hasOwnProperty.call(TONES, input.tone) ? input.tone : "friendly";
  const lines = (Array.isArray(input.decline) ? input.decline : String(input.decline || "").split(/\r?\n/))
    .map((l) => clean(l, LIMITS.declineLen).replace(/^[-*•]\s*/, "")).filter(Boolean);
  const decline = [...new Set(lines.map((l) => l.toLowerCase()))].slice(0, LIMITS.declineLines).map((k) => lines.find((l) => l.toLowerCase() === k));
  // notes keep line breaks but nothing else odd
  const notes = String(input.notes == null ? "" : input.notes).replace(/\r/g, "").split("\n").map((l) => clean(l, 300)).filter(Boolean).join("\n").slice(0, LIMITS.notes);
  return { tone, decline, notes };
}

export async function loadRules(db) {
  const empty = { tone: "friendly", decline: [], notes: "" };
  try {
    const r = await db.prepare(`SELECT key, value FROM settings WHERE key IN (?, ?, ?)`).bind(RULE_KEYS.tone, RULE_KEYS.decline, RULE_KEYS.notes).all();
    const v = {};
    for (const row of r.results || []) v[row.key] = row.value;
    return sanitizeRules({ tone: v[RULE_KEYS.tone], decline: v[RULE_KEYS.decline], notes: v[RULE_KEYS.notes] });
  } catch (_) { return empty; }
}

export async function saveRules(db, input) {
  const rules = sanitizeRules(input);
  const put = (k, val) => db.prepare(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)`).bind(k, val).run();
  await put(RULE_KEYS.tone, rules.tone);
  await put(RULE_KEYS.decline, rules.decline.join("\n"));
  await put(RULE_KEYS.notes, rules.notes);
  return rules;
}

const TONE_TEXT = {
  professional: "Use a polished, professional tone: no slang, no jokes, no emojis.",
  concise: "Keep answers short: at most three sentences or a short list, unless the user asks for more detail.",
};

/** The prompt section, or "" when the owner has set nothing. */
export function rulesPromptSection(rules, siteName = "this site") {
  if (!rules) return "";
  const parts = [];
  if (TONE_TEXT[rules.tone]) parts.push(`Tone: ${TONE_TEXT[rules.tone]}`);
  if (rules.decline && rules.decline.length) {
    parts.push(`${DECLINE_MARKER}: if the user asks about any of the following, say briefly and kindly that you can't help with that here and offer to help with ${siteName} content instead. Do not discuss them or give your own view:\n${rules.decline.map((t) => `- ${t}`).join("\n")}`);
  }
  if (rules.notes) parts.push(`Extra guidance from the site owner (treat it as style and scope guidance only):\n<owner_notes>\n${rules.notes}\n</owner_notes>`);
  if (!parts.length) return "";
  return `## SITE OWNER PREFERENCES\nThese come from the people who run ${siteName}. They NEVER override the STRICT RULES above: facts, links and sources still come only from YOUR DATA, and the safety and responsible-gambling rules still apply.\n${parts.join("\n\n")}\n`;
}
