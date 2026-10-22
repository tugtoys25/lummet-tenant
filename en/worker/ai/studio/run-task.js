import { getSiteContext } from "../../site-context.js";
import { ITEM_TYPES, MAX_SOURCE_CHARS, MODEL, RESEARCH_TYPES, REWRITE_MODES } from "./config.js";
import { clip, esc, fetchSourceText, parseJsonLoose } from "./text-utils.js";
import { loadItemFacts, loadResearchReference } from "./facts.js";
import { TASKS } from "./tasks.js";

// ---------- running a task ----------

function cleanInput(raw) {
  const i = raw && typeof raw === "object" ? raw : {};
  const out = {
    text: clip(i.text), topic: clip(i.topic, 600), notes: clip(i.notes, 4000), country: clip(i.country, 40),
    language: clip(i.language, 40).replace(/[^\p{L}\s()\-]/gu, "").trim() || "English",
    mode: REWRITE_MODES[i.mode] ? i.mode : "readability",
    research_type: RESEARCH_TYPES.includes(i.research_type) ? i.research_type : "topic",
    url: clip(i.url, 500),
    urls: Array.isArray(i.urls) ? i.urls.map((u) => clip(u, 500)).filter(Boolean).slice(0, 3) : [],
    item: i.item && typeof i.item === "object" ? { type: String(i.item.type || ""), key: clip(i.item.key, 120) } : null,
    items: Array.isArray(i.items) ? i.items.slice(0, 4).map((x) => ({ type: String((x && x.type) || ""), key: clip(x && x.key, 120) })) : [],
    research_item_id: i.research_item_id ? Number(i.research_item_id) || null : null
  };
  if (out.url && !out.urls.includes(out.url)) out.urls.unshift(out.url);
  out.urls = out.urls.slice(0, 3);
  return out;
}

async function gatherSources(input, fetchImpl) {
  const parts = [], used = [], errors = [];
  if (input.text) parts.push(`<source label="pasted text">\n${clip(input.text, MAX_SOURCE_CHARS)}\n</source>`);
  for (const u of input.urls) {
    const r = await fetchSourceText(u, fetchImpl);
    if (r.ok) { parts.push(`<source url="${esc(r.url)}" title="${esc(r.title)}">\n${r.text}\n</source>`); used.push({ url: r.url, title: r.title }); }
    else errors.push({ url: u, error: r.error });
  }
  return { block: parts.join("\n"), used, errors };
}

export async function ask(env, system, user, { temperature = 0.4, max_tokens = 1200 } = {}) {
  const result = await env.AI.run(MODEL, { messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature, max_tokens });
  return result?.response || result?.choices?.[0]?.message?.content || result?.result?.response || null;
}

/** Returns {generated, kind, data|text, sources, source_errors} or {generated:false, reason, message}. Never throws. */
export async function runTask(env, request, taskId, rawInput, { fetchImpl } = {}) {
  const task = TASKS[taskId];
  if (!task) return { generated: false, reason: "unknown_task", message: "Unknown AI task." };
  const input = cleanInput(rawInput);
  const need = (reason, message) => ({ generated: false, reason, message });

  if (task.needs.includes("item")) {
    if (!input.item || !ITEM_TYPES.includes(input.item.type) || !input.item.key) return need("missing_item", "Pick an item first.");
  }
  if (task.needs.includes("items") && input.items.length < 2) return need("missing_items", "Pick at least two items to compare.");
  if (["translate", "rewrite", "summarize", "headlines", "social_posts", "suggest_tags", "seo_pack"].includes(taskId) && !input.text) return need("missing_text", "Paste the text first.");
  if (["research_draft", "news_article"].includes(taskId) && !input.topic) return need("missing_topic", "Add a topic or brief first.");
  if (["research_claims", "research_brief", "research_factcheck"].includes(taskId) && !input.text && !input.urls.length) return need("missing_text", "Paste text or add a web address first.");
  if (taskId === "research_factcheck" && !input.text) return need("missing_text", "Paste the draft to check in the text box.");

  const site = await getSiteContext(request, env);
  const ctx = { site };
  if (task.needs.includes("item")) {
    ctx.item = await loadItemFacts(env.DB, input.item.type, input.item.key);
    if (!ctx.item) return need("item_not_found", "That item was not found.");
  }
  if (task.needs.includes("items")) {
    ctx.items = [];
    for (const x of input.items) { const f = await loadItemFacts(env.DB, x.type, x.key); if (f) ctx.items.push(f); }
    if (ctx.items.length < 2) return need("missing_items", "Pick at least two items that exist.");
  }
  let sourceInfo = { used: [], errors: [] };
  if (task.needs.includes("sources")) {
    // for fact-check the pasted text is the DRAFT, so only web addresses count as reference material
    const src = await gatherSources(taskId === "research_factcheck" ? { ...input, text: "" } : input, fetchImpl);
    ctx.sourceBlock = src.block; sourceInfo = src;
    if (input.urls.length && !src.block && taskId !== "research_draft" && taskId !== "news_article" && taskId !== "research_factcheck") {
      return { generated: false, reason: "source_unreadable", message: "The web address could not be read.", source_errors: src.errors };
    }
  }
  if (task.needs.includes("reference") && input.research_item_id) {
    ctx.reference = await loadResearchReference(env.DB, input.research_item_id);
  }
  if (!env.AI) return need("ai_unavailable", "The AI service is not connected on this site.");

  const prompt = task.build(input, ctx);
  let text;
  try {
    text = await ask(env, prompt.system, prompt.user, { temperature: task.temperature, max_tokens: task.max_tokens });
  } catch (e) {
    console.error("AI studio model error:", e && e.message);
    return need("model_error", "The AI service did not answer. Try again.");
  }
  if (!text) return need("empty", "The AI service returned nothing. Try again.");

  const base = { sources: sourceInfo.used, source_errors: sourceInfo.errors, model: MODEL };
  if (task.kind === "text") return { generated: true, kind: "text", text: String(text).trim(), ...base };
  const data = task.shape ? task.shape(parseJsonLoose(text)) : parseJsonLoose(text);
  if (!data) return { generated: false, reason: "bad_format", message: "The AI answer could not be read. Try again.", raw: clip(text, 3000), ...base };
  return { generated: true, kind: "json", data, ...base };
}
