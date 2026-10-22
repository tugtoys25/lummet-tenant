// =====================================================
// LUMMET AI -- "Ask the chat": try a question with the CURRENT (even unsaved) chat settings
//
// Runs the real pipeline (understand -> retrieve -> prompt -> model -> link and geo guards) exactly like a visitor's
// question, with the settings from the form instead of the saved ones. Admin only. It saves no conversation, does not
// count against any free-message limit, and writes no feedback or history. Settings are never saved by this call.
// =====================================================

import { understand } from "./understand.js";
import { retrieve, buildContextString, extractContextUrls, sanitizeAnswerUrls, guardGeoFacts } from "./retrieval.js";
import { buildSystemPrompt, buildMessages } from "./prompt.js";
import { validateInput, detectInjection } from "./security.js";
import { CHAT_SETTINGS } from "./assistant.js";
import { sanitizeRules } from "./house-rules.js";
import { getSiteContext } from "../site-context.js";

export async function previewChat(env, request, message, rulesInput) {
  const v = validateInput(message);
  if (!v.valid) return { ok: false, status: 400, error: v.error || "Type a question first." };
  if (!env.AI) return { ok: false, status: 503, error: "AI is not connected on this site." };
  const rules = sanitizeRules(rulesInput || {});
  const site = await getSiteContext(request, env);
  const country = (request && request.cf && request.cf.country) || "RW";
  if (detectInjection(v.sanitized).isInjection) {
    return { ok: true, answer: `I'm Lummet AI, here to help you explore ${site.siteName}'s editorial content. What would you like to know?`, intent: "security_block", rules };
  }
  try {
    const plan = await understand(env, v.sanitized, [], request);
    const context = await retrieve(env, v.sanitized, country, plan, [], request);
    const systemPrompt = await buildSystemPrompt(context, country, plan?.intent, [], request, env, rules);
    const messages = buildMessages(systemPrompt, v.sanitized, [], plan?.intent);
    const out = await env.AI.run(CHAT_SETTINGS.MODEL, { messages, temperature: CHAT_SETTINGS.TEMPERATURE, max_tokens: CHAT_SETTINGS.MAX_TOKENS });
    let answer = String(out?.response || out?.choices?.[0]?.message?.content || out?.result?.response || out?.output?.text || "").trim();
    if (!answer) return { ok: false, status: 502, error: "The model gave no answer. Try again." };
    try { answer = sanitizeAnswerUrls(answer, extractContextUrls(buildContextString(context, country, site)), site.url("/en/")); } catch (_) {}
    if (plan?.intent === "geo" || plan?.intent === "licensing") { try { answer = guardGeoFacts(answer, buildContextString(context, country, site), site); } catch (_) {} }
    return { ok: true, answer, intent: plan?.intent || null, rules };
  } catch (e) {
    return { ok: false, status: 502, error: "The preview could not run. Try again in a moment." };
  }
}
