// AI review, chat and feedback.
// Part of the admin API. Dispatched in order from worker/api.js (see worker/api/routes/index.js).
import * as ai from "../../database/ai.js";
import { handleChat, handleChatStream, handleClearChat } from "../../ai/api.js";
import { aiEngine } from "../../ai.js";
import { NOT_HANDLED, json, validate } from "../helpers.js";

export async function route({ request, env, path, user }) {

    // ==================================
    // AI REVIEW
    // ==================================

    if (
      path === "/api/v1/ai/review" &&
      request.method === "POST"
    ) {
      return generateReview(request, env);
    }

// ── LUMMET AI NON-STREAMING CHAT ──
if (path === "/api/v1/ai/chat" && request.method === "POST") {
  return handleChat(request, env, user);
}
    // ── LUMMET AI STREAMING CHAT ──
if (path === "/api/v1/ai/chat/stream" && request.method === "POST") {
  return handleChatStream(request, env, user);
}

// ── LUMMET AI ANSWER FEEDBACK (thumbs up / down) ──
if (path === "/api/v1/ai/feedback" && request.method === "POST") {
  const { handleFeedback } = await import("../../ai/feedback.js");
  return handleFeedback(request, env);
}

// ── LUMMET AI CLEAR CONVERSATION ──
if (path === "/api/v1/ai/chat/clear" && request.method === "POST") {
  return handleClearChat(request, env, user);
}

  return NOT_HANDLED;
}

// =====================================================
// AI REVIEW GENERATION
// =====================================================

async function generateReview(request, env) {
  const body = await request.json();
  validate(body, ["casino", "country", "slug"]);

  const content = await aiEngine.generateFullReview(
    env,
    request,
    body.casino,
    body.country,
    body.slug
  );

  await ai.logAIGeneration(
    env.DB,
    "review",
    body.slug,
    `Full review generation for ${body.casino} (${body.country})`,
    "@cf/zai-org/glm-4.7-flash"
  );

  return json({
    success: true,
    content
  });
}
