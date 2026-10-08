// =====================================================
// SUPER API — HANDLERS (Editorial AI Tools)
//
// Thin wrappers around en/worker/ai/admin-tools.js — the same
// generation functions the tenant's own admin/ai.html page and
// /api/admin/ai-command already call. No new AI logic lives here,
// same "no duplicated business logic" convention as handlers.js.
//
// Deliberately GENERATION-ONLY: every route here returns text/JSON
// for a human admin to review and save through the normal content
// routes (reviews, seo, etc.) already exposed by this API. None of
// these routes writes to D1 themselves and none of them re-exposes
// the tenant's separate natural-language "/api/admin/ai-command"
// layer (which directly executes free-form admin actions against
// the tenant's own DB) -- that stays internal to the tenant
// dashboard, consistent with rule #25 (no arbitrary-action
// passthrough on the Super API).
//
// Requires the Cloudflare Workers AI binding (env.AI) on the
// tenant Worker. Every admin-tools.js function already degrades
// gracefully (null / [] / echoed input) when env.AI is unset or the
// model call fails -- these wrappers surface that as a 200 with an
// explicit `generated: false` flag rather than a 500, so a tenant
// without the AI binding configured doesn't look "broken" from the
// control plane, just "not available".
// =====================================================

import {
  generateReview,
  generateSeo,
  generateFAQs,
  generateSchema,
  generateOutline,
  improveContent,
  suggestInternalLinks
} from "../ai/admin-tools.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
function ok(data = {}) { return json({ success: true, ...data }, 200); }
function fail(message, status = 400) { return json({ success: false, error: message }, status); }

async function readJsonBody(request, bodyText) {
  if (!bodyText) return {};
  try {
    return JSON.parse(bodyText);
  } catch (_) {
    throw new Error("invalid_json_body");
  }
}

function validateRequired(body, required) {
  for (const key of required) {
    if (body[key] === undefined || body[key] === null || body[key] === "") {
      throw new Error(`${key}_required`);
    }
  }
}

// GET /en/api/super/ai/availability
// Whether this deployment has the AI binding configured at all --
// lets the control plane show a clear "not configured on this
// tenant" state instead of firing every generation route and
// getting `generated: false` back one at a time.
export async function handleAiAvailability(request, env) {
  return ok({ available: !!env.AI, model: "@cf/zai-org/glm-4.7-flash" });
}

// POST /en/api/super/ai/generate-review
// body: { casinoName, countryCode, slug }
export async function handleGenerateReview(request, env, _param, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    validateRequired(body, ["casinoName", "slug"]);
    const text = await generateReview(env, body.casinoName, body.countryCode || "RW", body.slug, request);
    return ok({ generated: !!text, text: text || null });
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

// POST /en/api/super/ai/generate-seo
// body: { targetDomain, type, slug, country }
export async function handleGenerateSeoCopy(request, env, _param, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    validateRequired(body, ["targetDomain", "slug"]);
    const seo = await generateSeo(env, body.targetDomain, {
      type: body.type || "casino",
      slug: body.slug,
      country: body.country || "Global"
    });
    return ok({ generated: !!seo, seo: seo || null });
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

// POST /en/api/super/ai/generate-faqs
// body: { casinoName, context, siteName }
export async function handleGenerateFaqs(request, env, _param, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    validateRequired(body, ["casinoName"]);
    const faqs = await generateFAQs(env, body.casinoName, body.context || "", body.siteName || "this site");
    return ok({ generated: Array.isArray(faqs) && faqs.length > 0, faqs: faqs || [] });
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

// POST /en/api/super/ai/generate-schema
// body: { type, data }
export async function handleGenerateSchema(request, env, _param, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    validateRequired(body, ["type", "data"]);
    const schema = await generateSchema(env, body.type, body.data);
    return ok({ generated: !!schema, schema: schema || null });
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

// POST /en/api/super/ai/generate-outline
// body: { topic, contentType, siteName }
export async function handleGenerateOutline(request, env, _param, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    validateRequired(body, ["topic"]);
    const outline = await generateOutline(env, body.topic, body.contentType || "review", body.siteName || "this site");
    return ok({ generated: Array.isArray(outline) && outline.length > 0, outline: outline || [] });
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

// POST /en/api/super/ai/improve-content
// body: { content, improvementType, siteName }
export async function handleImproveContent(request, env, _param, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    validateRequired(body, ["content"]);
    const improved = await improveContent(env, body.content, body.improvementType || "readability", body.siteName || "this site");
    return ok({ generated: improved !== body.content, text: improved });
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

// POST /en/api/super/ai/suggest-links
// body: { content, availablePages }
export async function handleSuggestInternalLinks(request, env, _param, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    validateRequired(body, ["content"]);
    const links = await suggestInternalLinks(env, body.content, Array.isArray(body.availablePages) ? body.availablePages : []);
    return ok({ generated: Array.isArray(links) && links.length > 0, links: links || [] });
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}
