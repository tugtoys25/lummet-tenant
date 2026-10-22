import { logAIGeneration } from "../../database/ai.js";
import { createNews } from "../../database/news.js";
import { createResearchItem, getResearchItemById } from "../../database/research.js";
import { createClaim } from "../../database/research-claims.js";
import { updateContentItem } from "../../database/content-items.js";
import { canAccessItem } from "../../database/item-access.js";
import { ITEM_TYPES, MODEL, RESEARCH_TYPES } from "./config.js";
import { clip, esc, slugify, textToHtml } from "./text-utils.js";

// ---------- saving results (drafts only) ----------

async function uniqueSlug(db, table, where, base, params = []) {
  const root = slugify(base) || "draft";
  for (let n = 0; n < 50; n++) {
    const slug = n === 0 ? root : `${root}-${n + 1}`;
    const hit = await db.prepare(`SELECT 1 AS x FROM ${table} WHERE slug = ? ${where} LIMIT 1`).bind(slug, ...params).first();
    if (!hit) return slug;
  }
  return `${root}-${Date.now()}`;
}

/**
 * target: news_draft | research_draft | research_claims | item_fields.
 * can(resource, action) is the caller's permission check. Returns {ok, ...} or {ok:false, status, error}.
 */
export async function applyResult(db, user, can, target, p) {
  const deny = (m = "You do not have permission to save this.") => ({ ok: false, status: 403, error: m });
  const bad = (m) => ({ ok: false, status: 400, error: m });
  p = p && typeof p === "object" ? p : {};

  if (target === "news_draft") {
    if (!can("news", "create")) return deny();
    const title = clip(p.title, 200), content = textToHtml(clip(p.content, 20000));
    if (!title || !content) return bad("A title and content are needed.");
    const slug = await uniqueSlug(db, "news", "", p.slug || title);
    await createNews(db, {
      slug, title, content, excerpt: clip(p.excerpt, 400), tags: clip(p.tags, 200),
      seo_title: clip(p.seo_title, 70), seo_description: clip(p.seo_description, 170),
      author: user?.name || user?.email || "Editorial", ai_generated: true, published: 0, created_by: user?.user_id || user?.id || null
    });
    await logAIGeneration(db, "news_draft", slug, "AI Studio news draft saved", MODEL);
    return { ok: true, slug, edit_url: `/en/dashboard/news` };
  }

  if (target === "research_draft") {
    if (!can("research", "create")) return deny();
    const title = clip(p.title, 200);
    const sections = Array.isArray(p.sections) ? p.sections : [];
    if (!title || !sections.length) return bad("A title and at least one section are needed.");
    const type = RESEARCH_TYPES.includes(p.type) ? p.type : "topic";
    const slug = await uniqueSlug(db, "research_items", "AND type = ?", p.slug || title, [type]);
    const content = { sections: sections.slice(0, 12).map((s, n) => ({ id: `s${n + 1}`, type: "rich_text", title: esc(clip(s.title, 200)), body: textToHtml(clip(s.body, 8000)) })) };
    const r = await createResearchItem(db, {
      type, slug, title, subtitle: clip(p.subtitle, 300), excerpt: clip(p.excerpt, 400), content_json: content,
      country_id: p.country_id ? String(p.country_id).toUpperCase().slice(0, 2) : null,
      status: "draft", published: 0, seo_title: clip(p.seo_title, 70), seo_description: clip(p.seo_description, 170)
    });
    await logAIGeneration(db, "research_draft", slug, "AI Studio research draft saved", MODEL);
    return { ok: true, id: r?.meta?.last_row_id || null, slug, type, edit_url: "/en/dashboard/research" };
  }

  if (target === "research_claims") {
    if (!can("research_claims", "create")) return deny();
    const item = await getResearchItemById(db, Number(p.research_item_id));
    if (!item) return bad("Pick the research item these claims belong to.");
    const claims = (Array.isArray(p.claims) ? p.claims : []).slice(0, 30);
    let saved = 0;
    for (const c of claims) {
      const text = clip(c && c.claim_text, 600);
      if (!text) continue;
      await createClaim(db, { research_item_id: item.id, claim_text: text, claim_type: /^(fact|rule|rate|date|statistic|opinion)$/.test(String(c.claim_type)) ? c.claim_type : "fact", status: "unverified" });
      saved++;
    }
    if (!saved) return bad("There were no claims to save.");
    await logAIGeneration(db, "research_claims", item.slug, `AI Studio saved ${saved} unverified claims`, MODEL);
    return { ok: true, saved };
  }

  if (target === "item_fields") {
    const type = String(p.type || ""), key = clip(p.key, 120);
    if (!ITEM_TYPES.includes(type) || !key) return bad("Pick an item.");
    const resource = type === "casino" ? "casinos" : "content_items";
    if (!can(resource, "update")) return deny();
    const f = p.fields && typeof p.fields === "object" ? p.fields : {};
    if (type === "casino") {
      const row = await db.prepare(`SELECT * FROM casinos WHERE slug = ? LIMIT 1`).bind(key).first();
      if (!row) return { ok: false, status: 404, error: "Item not found." };
      if (!(await canAccessItem(db, user, "casinos", "update", row))) return { ok: false, status: 404, error: "Item not found." };
      const sets = [], vals = [];
      if (f.seo_title) { sets.push("seo_title = ?"); vals.push(clip(f.seo_title, 70)); }
      if (f.seo_description) { sets.push("seo_description = ?"); vals.push(clip(f.seo_description, 170)); }
      if (!sets.length) return bad("Nothing to save.");
      await db.prepare(`UPDATE casinos SET ${sets.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE slug = ?`).bind(...vals, key).run();
      await logAIGeneration(db, "casino_seo", key, "AI Studio SEO saved", MODEL);
      return { ok: true, saved: sets.length };
    }
    const row = await db.prepare(`SELECT * FROM content_items WHERE content_type = ? AND slug = ? LIMIT 1`).bind(type, key).first();
    if (!row) return { ok: false, status: 404, error: "Item not found." };
    if (!(await canAccessItem(db, user, "content_items", "update", row))) return { ok: false, status: 404, error: "Item not found." };
    const upd = {};
    if (f.title) upd.title = clip(f.title, 160);
    if (f.description) upd.description = clip(f.description, 4000);
    if (f.seo_title) upd.seoTitle = clip(f.seo_title, 70);
    if (f.seo_description) upd.seoDescription = clip(f.seo_description, 170);
    if (f.seo_keywords) upd.seoKeywords = clip(f.seo_keywords, 200);
    if (!Object.keys(upd).length) return bad("Nothing to save.");
    await updateContentItem(db, type, key, upd);   // never touches status/published
    await logAIGeneration(db, `${type}_copy`, key, "AI Studio copy saved", MODEL);
    return { ok: true, saved: Object.keys(upd).length };
  }

  if (target === "faq_draft") {
    if (!(user && (user.role === "admin" || user.role === "super_admin"))) return deny("Only admins can add chat FAQs.");
    const question = clip(p.question, 240), answer = clip(p.answer, 900);
    if (!question || !answer) return bad("A question and an answer are needed.");
    const dup = await db.prepare(`SELECT id FROM faqs WHERE LOWER(question) = LOWER(?) LIMIT 1`).bind(question).first();
    if (dup) return bad("An FAQ with this question already exists.");
    const r = await db.prepare(`INSERT INTO faqs (question, answer, is_active) VALUES (?, ?, 0)`).bind(question, answer).run();
    if (p.feedback_id) { try { await db.prepare(`UPDATE ai_feedback SET reviewed = 1 WHERE id = ?`).bind(Number(p.feedback_id)).run(); } catch (_) { /* optional */ } }
    await logAIGeneration(db, "faq_draft", String(r?.meta?.last_row_id || ""), "AI Studio saved an inactive FAQ from chat feedback", MODEL);
    return { ok: true, id: r?.meta?.last_row_id || null, saved: 1 };
  }

  return bad("Unknown save target.");
}
