import { logAIGeneration } from "../../database/ai.js";
import { rateGate } from "../rate.js";
import { chatQualityDigest, contentGaps } from "../digest.js";
import { getRecipients, setRecipient, sendChatQualityReport } from "../report.js";
import { loadRules, saveRules, TONES, LIMITS } from "../house-rules.js";
import { previewChat } from "../preview.js";
import { feedbackSummary, listFeedback, setReviewed } from "../feedback.js";
import { ITEM_TYPES, MODEL, RATE_MAX, RATE_WINDOW_MIN, RESEARCH_TYPES, REWRITE_MODES } from "./config.js";
import { clip, fetchSourceText } from "./text-utils.js";
import { TASKS, listTasks } from "./tasks.js";
import { runTask } from "./run-task.js";
import { applyResult } from "./apply-result.js";
import { auditContent, draftFeedbackFix, listDraftFaqs } from "./audit.js";
import { isAllSeeing, readHistory, recordHistory } from "./history.js";

// ---------- HTTP handler ----------

const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json; charset=utf-8" } });

const fail = (m, status = 400, extra = {}) => json({ success: false, error: m, ...extra }, status);

const underLimit = (db, who) => rateGate(db, who, RATE_MAX, RATE_WINDOW_MIN);

function canUseTask(task, can) {
  if (task.resource === "item") return can("casinos", "create") || can("content_items", "create");
  if (task.resource === "any") return ["news", "pages", "content_items", "research", "casinos"].some((r) => can(r, "create"));
  return can(task.resource, "create");
}

export async function handleAiStudio(request, env, path, can, user, { fetchImpl } = {}) {
  const route = path.replace("/api/v1/ai-studio/", "");
  const method = request.method;
  const url = new URL(request.url);

  if (method === "GET" && route === "meta") {
    const tasks = listTasks().filter((t) => canUseTask(TASKS[t.id], can));
    return json({ available: !!env.AI, model: MODEL, tasks, item_types: ITEM_TYPES, research_types: RESEARCH_TYPES, rewrite_modes: Object.keys(REWRITE_MODES), rate: { max: RATE_MAX, window_minutes: RATE_WINDOW_MIN }, feedback: !!isAllSeeing(user) });
  }

  if (method === "GET" && route === "items") {
    const type = url.searchParams.get("type") || "";
    const q = `%${clip(url.searchParams.get("q"), 80).toLowerCase()}%`;
    if (type === "casino") {
      if (!can("casinos", "read")) return fail("Forbidden", 403);
      const r = await env.DB.prepare(`SELECT slug AS key, name FROM casinos WHERE LOWER(name) LIKE ? OR slug LIKE ? ORDER BY name LIMIT 30`).bind(q, q).all();
      return json({ items: r.results || [] });
    }
    if (ITEM_TYPES.includes(type)) {
      if (!can("content_items", "read")) return fail("Forbidden", 403);
      const r = await env.DB.prepare(`SELECT slug AS key, name FROM content_items WHERE content_type = ? AND (LOWER(name) LIKE ? OR slug LIKE ?) ORDER BY name LIMIT 30`).bind(type, q, q).all();
      return json({ items: r.results || [] });
    }
    if (type === "research") {
      if (!can("research", "read")) return fail("Forbidden", 403);
      const r = await env.DB.prepare(`SELECT id AS key, title AS name FROM research_items WHERE LOWER(title) LIKE ? ORDER BY updated_at DESC LIMIT 30`).bind(q).all();
      return json({ items: r.results || [] });
    }
    return fail("Unknown type");
  }

  if (method === "GET" && route === "history") {
    if (!["news", "casinos", "content_items", "research"].some((r) => can(r, "create"))) return fail("Forbidden", 403);
    const h = await readHistory(env.DB, user, { kind: url.searchParams.get("kind") || "", mine: url.searchParams.get("mine") === "1", before: Number(url.searchParams.get("before")) || 0, limit: Number(url.searchParams.get("limit")) || 50 });
    return json({ success: true, everyone: !!isAllSeeing(user), ...h });
  }

  // answer feedback from the public chat: admins only (it contains visitors' questions)
  if (route === "feedback" || route.startsWith("feedback/")) {
    if (!isAllSeeing(user)) return fail("Forbidden", 403);
    if (method === "GET" && route === "feedback") {
      const [summary, list] = await Promise.all([feedbackSummary(env.DB, Number(url.searchParams.get("days")) || 30),
        listFeedback(env.DB, { rating: url.searchParams.get("rating") || "down", reviewed: url.searchParams.get("reviewed") || "", before: Number(url.searchParams.get("before")) || 0 })]);
      return json({ success: true, summary, ...list });
    }
    if (method === "POST" && route === "feedback/fix") {
      let body; try { body = await request.json(); } catch (_) { return fail("Invalid JSON"); }
      if (!(await underLimit(env.DB, `studio:${user?.user_id || user?.id || "anon"}`))) return fail("Too many AI requests. Try again in a few minutes.", 429);
      const r = await draftFeedbackFix(env, request, body && body.id);
      await recordHistory(env.DB, user, { kind: "generate", task: "feedback_fix", item_type: "chat_feedback", item_key: String(body && body.id || ""), outcome: r.ok ? "ok" : "failed", detail: r.ok ? "" : r.error });
      return r.ok ? json({ success: true, ...r }) : fail(r.error, r.status || 400);
    }
    if (method === "GET" && route === "feedback/digest") {
      if (!(await underLimit(env.DB, `studio:${user?.user_id || user?.id || "anon"}`))) return fail("Too many requests. Try again in a few minutes.", 429);
      return json({ success: true, ...(await chatQualityDigest(env, request)) });
    }
    if (method === "GET" && route === "feedback/gaps") {
      if (!(await underLimit(env.DB, `studio:${user?.user_id || user?.id || "anon"}`))) return fail("Too many requests. Try again in a few minutes.", 429);
      return json({ success: true, ...(await contentGaps(env, request)) });
    }
    // weekly chat-quality email: each admin turns it on or off for themselves; "send now" goes only to the person asking
    if (route === "feedback/report") {
      const uid = Number(user?.user_id || user?.id) || 0;
      if (method === "GET") {
        const ids = await getRecipients(env.DB);
        return json({ success: true, enabled: ids.includes(uid), recipients: ids.length, email_ready: !!(env.RESEND_API_KEY && env.RESEND_FROM_EMAIL) });
      }
      if (method === "POST") {
        let body; try { body = await request.json(); } catch (_) { return fail("Invalid JSON"); }
        if (body && body.send_now) {
          if (!(await underLimit(env.DB, `studio:${uid || "anon"}`))) return fail("Too many requests. Try again in a few minutes.", 429);
          const r = await sendChatQualityReport(env, request, { onlyUserId: uid });
          return json({ success: true, ...r });
        }
        if (!uid) return fail("Sign in again.", 401);
        await setRecipient(env.DB, uid, !!(body && body.enabled));
        return json({ success: true, enabled: !!(body && body.enabled) });
      }
    }
    if (method === "GET" && route === "feedback/faqs") return json({ success: true, faqs: await listDraftFaqs(env.DB) });
    if (method === "POST" && route === "feedback/faq") {
      let body; try { body = await request.json(); } catch (_) { return fail("Invalid JSON"); }
      const id = Number(body && body.id);
      const row = await env.DB.prepare(`SELECT id, is_active FROM faqs WHERE id = ?`).bind(id).first().catch(() => null);
      if (!row) return fail("Not found", 404);
      if (body.action === "delete") {
        if (row.is_active) return fail("Switch it off before deleting it.", 400);
        await env.DB.prepare(`DELETE FROM faqs WHERE id = ?`).bind(id).run();
      } else if (body.action === "activate" || body.action === "deactivate") {
        await env.DB.prepare(`UPDATE faqs SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(body.action === "activate" ? 1 : 0, id).run();
      } else return fail("Unknown action");
      await recordHistory(env.DB, user, { kind: "save", target: `faq_${body.action}`, item_type: "faq", item_key: String(id), outcome: "ok" });
      return json({ success: true });
    }
    if (method === "POST" && route === "feedback/review") {
      let body; try { body = await request.json(); } catch (_) { return fail("Invalid JSON"); }
      return (await setReviewed(env.DB, body && body.id, !!(body && body.reviewed))) ? json({ success: true }) : fail("Not found", 404);
    }
  }

  // owner preferences for the public chat (tone, topics to decline, extra guidance): admins only
  if (route === "chat-rules") {
    if (!isAllSeeing(user)) return fail("Forbidden", 403);
    if (method === "GET") return json({ success: true, rules: await loadRules(env.DB), tones: TONES, limits: LIMITS });
    if (method === "POST") {
      let body; try { body = await request.json(); } catch (_) { return fail("Invalid JSON"); }
      const rules = await saveRules(env.DB, body || {});
      await recordHistory(env.DB, user, { kind: "save", target: "chat_rules", item_type: "chat", detail: `tone ${rules.tone}, ${rules.decline.length} declined topic(s), ${rules.notes ? "notes set" : "no notes"}` });
      return json({ success: true, rules });
    }
  }

  // "Ask the chat": a question through the real pipeline with the settings from the form (nothing saved or counted)
  if (route === "chat-rules/preview" && method === "POST") {
    if (!isAllSeeing(user)) return fail("Forbidden", 403);
    let body; try { body = await request.json(); } catch (_) { return fail("Invalid JSON"); }
    if (!(await underLimit(env.DB, `studio:${user?.user_id || user?.id || "anon"}`))) return fail("Too many AI requests. Try again in a few minutes.", 429);
    const r = await previewChat(env, request, body && body.message, body && body.rules);
    return r.ok ? json({ success: true, answer: r.answer, intent: r.intent }) : fail(r.error, r.status || 400);
  }

  if (method === "GET" && route === "audit") {
    if (!["news", "casinos", "content_items", "research"].some((r) => can(r, "read"))) return fail("Forbidden", 403);
    return json({ success: true, ...(await auditContent(env.DB)) });
  }

  if (method === "POST" && route === "fetch") {
    if (!canUseTask({ resource: "any" }, can)) return fail("Forbidden", 403);
    let body; try { body = await request.json(); } catch (_) { return fail("Invalid JSON"); }
    const who = `studio:${user?.user_id || user?.id || "anon"}`;
    if (!(await underLimit(env.DB, who))) return fail("Too many AI requests. Try again in a few minutes.", 429);
    const r = await fetchSourceText(body && body.url, fetchImpl);
    return r.ok ? json({ success: true, url: r.url, title: r.title, text: r.text }) : fail(r.error, 422);
  }

  if (method === "POST" && route === "run") {
    let body; try { body = await request.json(); } catch (_) { return fail("Invalid JSON"); }
    const task = TASKS[body && body.task];
    if (!task) return fail("Unknown task");
    if (!canUseTask(task, can)) return fail("Forbidden: you cannot use this tool", 403);
    const who = `studio:${user?.user_id || user?.id || "anon"}`;
    if (!(await underLimit(env.DB, who))) return fail("Too many AI requests. Try again in a few minutes.", 429);
    const res = await runTask(env, request, body.task, body.input, { fetchImpl });
    { const it = body.input && body.input.item; await recordHistory(env.DB, user, { kind: "generate", task: body.task, item_type: it && it.type, item_key: it && it.key, outcome: res.generated ? "ok" : "failed", detail: res.generated ? "" : (res.reason || "") }); }
    if (res.generated) { try { await logAIGeneration(env.DB, `studio_${body.task}`, clip(body.input && body.input.item && body.input.item.key || body.input && body.input.topic || "", 80) || "-", `AI Studio: ${task.label}`, MODEL); } catch (_) { /* log is best effort */ } }
    return json({ success: true, ...res });
  }

  if (method === "POST" && route === "apply") {
    let body; try { body = await request.json(); } catch (_) { return fail("Invalid JSON"); }
    const r = await applyResult(env.DB, user, can, body && body.target, body && body.payload);
    { const p = (body && body.payload) || {}; await recordHistory(env.DB, user, { kind: "save", target: body && body.target, item_type: p.type || (body && body.target === "research_claims" ? "research" : ""), item_key: p.key || r.slug || (p.research_item_id ? String(p.research_item_id) : ""), outcome: r.ok ? "ok" : "failed", detail: r.ok ? (r.saved != null ? `saved ${r.saved}` : "draft created") : r.error }); }
    if (!r.ok) return fail(r.error, r.status || 400);
    return json({ success: true, ...r });
  }

  return fail("Not found", 404);
}
