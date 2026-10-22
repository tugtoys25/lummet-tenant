import { getSiteContext } from "../../site-context.js";
import { retrieve, buildContextString, extractContextUrls, sanitizeAnswerUrls } from "../retrieval.js";
import { clip, parseJsonLoose } from "./text-utils.js";
import { secs } from "./facts.js";
import { ask } from "./run-task.js";

// ---------- content audit (no AI) ----------

export async function auditContent(db, { limit = 25 } = {}) {
  const out = [];
  const add = async (key, label, sql, mapRow) => {
    try {
      const r = await db.prepare(sql).bind(limit).all();
      out.push({ key, label, items: (r.results || []).map(mapRow) });
    } catch (_) { out.push({ key, label, items: [] }); }
  };
  await add("casino_seo", "Casinos without SEO title or description",
    `SELECT slug, name FROM casinos WHERE published = 1 AND (seo_title IS NULL OR seo_title = '' OR seo_description IS NULL OR seo_description = '') ORDER BY name LIMIT ?`,
    (r) => ({ type: "casino", key: r.slug, name: r.name }));
  await add("item_seo", "Sportsbooks, partners and custom items without SEO",
    `SELECT content_type, custom_type_slug, slug, name FROM content_items WHERE published = 1 AND (seo_title IS NULL OR seo_title = '' OR seo_description IS NULL OR seo_description = '') ORDER BY name LIMIT ?`,
    (r) => ({ type: r.content_type, key: r.slug, name: r.name }));
  await add("item_thin", "Items with no description",
    `SELECT content_type, slug, name FROM content_items WHERE published = 1 AND (description IS NULL OR length(trim(description)) < 80) ORDER BY name LIMIT ?`,
    (r) => ({ type: r.content_type, key: r.slug, name: r.name }));
  await add("news_seo", "Published news without SEO description",
    `SELECT slug, title FROM news WHERE published = 1 AND (seo_description IS NULL OR seo_description = '') ORDER BY created_at DESC LIMIT ?`,
    (r) => ({ type: "news", key: r.slug, name: r.title }));
  await add("news_excerpt", "Published news without an excerpt",
    `SELECT slug, title FROM news WHERE published = 1 AND (excerpt IS NULL OR excerpt = '') ORDER BY created_at DESC LIMIT ?`,
    (r) => ({ type: "news", key: r.slug, name: r.title }));
  await add("research_stale", "Research overdue for review",
    `SELECT type, slug, title FROM research_items WHERE published = 1 AND next_review_at IS NOT NULL AND next_review_at < CURRENT_TIMESTAMP ORDER BY next_review_at LIMIT ?`,
    (r) => ({ type: "research", key: `${r.type}/${r.slug}`, name: r.title }));
  await add("research_unverified", "Research with unverified claims",
    `SELECT r.type, r.slug, r.title FROM research_items r WHERE r.id IN (SELECT research_item_id FROM research_claims WHERE status = 'unverified') ORDER BY r.updated_at DESC LIMIT ?`,
    (r) => ({ type: "research", key: `${r.type}/${r.slug}`, name: r.title }));
  return { groups: out, total: out.reduce((n, g) => n + g.items.length, 0) };
}

// ---------- fixing a badly rated chat answer ----------

const COVERAGE_KEYS = [["casinos", "casinos"], ["reviews", "reviews"], ["news", "news articles"], ["pages", "pages"], ["faqs", "FAQs"], ["contentItems", "sportsbooks / partners / custom items"], ["researchItems", "research items"], ["platformUpdates", "platform updates"]];

/**
 * Admin only. Looks at what the site actually has on the visitor's question (the same lookup the public chat uses),
 * and, only if there is something to go on, drafts a short FAQ answer from that material alone.
 * Returns {covered:false} without calling the model when the site has nothing on the topic.
 */
export async function draftFeedbackFix(env, request, feedbackId, { sessionRetrieve = retrieve } = {}) {
  const row = await env.DB.prepare(`SELECT id, rating, reason, question, answer, country FROM ai_feedback WHERE id = ?`).bind(Number(feedbackId)).first().catch(() => null);
  if (!row) return { ok: false, status: 404, error: "That feedback item was not found." };
  if (!row.question) return { ok: false, status: 400, error: "No question text was kept for this item." };
  const site = await getSiteContext(request, env);
  const context = await sessionRetrieve(env, row.question, row.country || "RW", null, [], request);
  const found = COVERAGE_KEYS.map(([k, label]) => ({ label, n: (context[k] || []).length })).filter((x) => x.n > 0);
  if (!found.length) {
    return { ok: true, covered: false, coverage: [], question: row.question, advice: "The site has nothing on this topic, so the chat had nothing to answer from. Write the content first (a research draft or a news article); the chat will then find it." };
  }
  if (!env.AI) return { ok: false, status: 503, error: "The AI service is not connected on this site." };
  const ctxStr = buildContextString(context, row.country || "RW", site);
  let text;
  try {
    text = await ask(env,
      secs(site, "an FAQ editor", 'A visitor was unhappy with the chat\'s answer. Using ONLY the context, write a short, accurate FAQ entry for their question. Return ONLY JSON: {"answerable":true,"diagnosis":"one sentence on why the earlier answer probably failed","question":"the question in general form","answer":"2-4 sentences, no links"}. If the context does not actually answer the question, return {"answerable":false,"diagnosis":"..."}.'),
      `<facts>\n${clip(ctxStr, 6000)}\n</facts>\nVisitor question: ${row.question}\nEarlier answer: ${clip(row.answer, 600)}\nVisitor said the problem was: ${row.reason || "not stated"}`,
      { temperature: 0.2, max_tokens: 500 });
  } catch (_) { return { ok: false, status: 502, error: "The AI service did not answer. Try again." }; }
  const d = parseJsonLoose(text);
  if (!d || typeof d !== "object") return { ok: false, status: 502, error: "The AI answer could not be read. Try again." };
  const base = { ok: true, coverage: found, diagnosis: clip(d.diagnosis, 400) };
  if (d.answerable === false || !d.answer) return { ...base, covered: true, answerable: false, question: row.question, advice: "The site has related content, but it does not answer this question directly. Add the missing facts to the item or write new content." };
  let answer = clip(d.answer, 900);
  try { answer = sanitizeAnswerUrls(answer, extractContextUrls(ctxStr), site.url("/en/")); } catch (_) { /* keep text */ }
  return { ...base, covered: true, answerable: true, question: clip(d.question, 240) || row.question, answer };
}

/** FAQs written by AI Studio start switched OFF (is_active = 0) so nothing goes live unreviewed. */
export async function listDraftFaqs(db) {
  try {
    const r = await db.prepare(`SELECT id, question, answer, created_at FROM faqs WHERE is_active = 0 ORDER BY id DESC LIMIT 50`).all();
    return r.results || [];
  } catch (_) { return []; }
}
