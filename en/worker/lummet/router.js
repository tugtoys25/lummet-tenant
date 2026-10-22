// The public chat on this subdomain runs through the SAME handlers as the floating widget
// (/en/api/v1/ai/*), so limits, country handling, memory, retrieval and feedback behave identically.
import { handleChat as sharedChat, handleChatStream as sharedChatStream, handleClearChat as sharedClearChat } from '../ai/api.js';
import { handleFeedback } from '../ai/feedback.js';

import { getCurrentUser } from '../auth.js';

import {
  handleAdminLogin,
  handleGetCasinos,
  handleGetReviews,
  handleGetNews,
  handleGetPages,
  handleTogglePublish,
  handleAiCommand,
  handleGenerateReview,
  handleBulkSEO,
  handleBulkFAQs,
  handleBulkReviews
} from './admin-api.js';
import { getSiteContext } from "../site-context.js";

/**
 * Lummet subdomain router.
 *
 * Works for any tenant:
 *
 *   lummet.freewin.xyz
 *   lummet.example.com
 *   lummet.cluster.casino
 *
 * No tenant/domain identity is hardcoded here.
 *
 * Returns null only when the request is not a Lummet hostname.
 */
export async function handleLummetRequest(request, env, ctx) {
  const url = new URL(request.url);
  const hostname = url.hostname.toLowerCase();

  // Lummet is identified by the first hostname label.
  //
  // Example:
  //   lummet.freewin.xyz
  //   ^^^^^^
  //
  if (!hostname.startsWith("lummet.")) {
    return null;
  }

  const path = url.pathname;
  const method = request.method;

  // =====================================================
  // STATIC ASSETS
  // =====================================================

  // Important:
  // Lummet requests must be allowed to fetch CSS/JS/images
  // from the normal ASSETS binding instead of falling through
  // to the SPA index.
  if (path.startsWith("/static/")) {
    return env.ASSETS.fetch(request);
  }

  // Lummet application assets.
  if (path.startsWith("/lummet/") && path !== "/lummet/index.html") {
    return env.ASSETS.fetch(request);
  }

  // =====================================================
  // ADMIN API
  // =====================================================

  if (path === "/api/admin/login" && method === "POST") {
    return handleAdminLogin(request, env);
  }

  if (path === "/api/admin/casinos" && method === "GET") {
    return handleGetCasinos(request, env);
  }

  if (path === "/api/admin/reviews" && method === "GET") {
    return handleGetReviews(request, env);
  }

  if (path === "/api/admin/news" && method === "GET") {
    return handleGetNews(request, env);
  }

  if (path === "/api/admin/pages" && method === "GET") {
    return handleGetPages(request, env);
  }

  if (path === "/api/admin/toggle-publish" && method === "POST") {
    return handleTogglePublish(request, env);
  }

  if (path === "/api/admin/ai-command" && method === "POST") {
    return handleAiCommand(request, env);
  }

  if (path === "/api/admin/generate-review" && method === "POST") {
    return handleGenerateReview(request, env);
  }

  if (path === "/api/admin/bulk-seo" && method === "POST") {
    return handleBulkSEO(request, env);
  }

  if (path === "/api/admin/bulk-faqs" && method === "POST") {
    return handleBulkFAQs(request, env);
  }

  if (path === "/api/admin/bulk-reviews" && method === "POST") {
    return handleBulkReviews(request, env);
  }

  // =====================================================
  // LUMMET HOME
  // =====================================================

  if (path === "/" && method === "GET") {
    return serveIndex(request, env);
  }

  if (path === "/lummet" && method === "GET") {
    return serveIndex(request, env);
  }

  if (path === "/lummet/" && method === "GET") {
    return serveIndex(request, env);
  }

  // =====================================================
  // CHAT API — STREAMING
  // =====================================================

  if (path === "/api/chat/stream" && method === "POST") {
    return handleChatStream(request, env);
  }

  // =====================================================
  // CHAT API — NORMAL
  // =====================================================

  if (path === "/api/chat" && method === "POST") {
    return handleChat(request, env);
  }

  // =====================================================
  // CHAT API — CLEAR AND FEEDBACK (same handlers as the widget)
  // =====================================================

  if (path === "/api/chat/clear" && method === "POST") {
    return sharedClearChat(request, env, await currentUser(request, env));
  }

  if (path === "/api/feedback" && method === "POST") {
    return handleFeedback(request, env);
  }

  // =====================================================
  // FAVICON
  // =====================================================

  if (path === "/favicon.ico") {
    return new Response(null, {
      status: 204
    });
  }

  // =====================================================
  // UNKNOWN LUMMET PATH
  // =====================================================

  // Lummet is an SPA.
  // Any non-API/non-asset path goes back to index.html.
  return serveIndex(request, env);
}


/**
 * Serve the Lummet application.
 *
 * IMPORTANT:
 * Do NOT hardcode:
 *
 *   https://lummet.example.com
 *
 * The current request hostname is used instead.
 */
async function serveIndex(request, env) {
  const assetUrl = new URL("/lummet/index.html", request.url);

  const assetRequest = new Request(assetUrl.toString(), {
    method: "GET",
    headers: request.headers
  });

  const response = await env.ASSETS.fetch(assetRequest);

  if (!response.ok) {
    return response;
  }

  const site = await getSiteContext(request, env);

  let html = await response.text();

  // Server-side tenant/site rendering.
  html = html
    .replaceAll("{{site_name}}", site.siteName)
    .replaceAll("{{site_url}}", site.origin)
    .replaceAll("{{site_hostname}}", site.hostname);

  const headers = new Headers(response.headers);

  // HTML was modified, so do not keep an old compressed/content-length response.
  headers.delete("content-length");
  headers.delete("content-encoding");

  headers.set("content-type", "text/html; charset=UTF-8");

  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}


// =====================================================
// CHAT
// =====================================================

async function currentUser(request, env) {
  try { return await getCurrentUser(request, env); } catch (_) { return null; }
}

async function handleChat(request, env) {
  return sharedChat(request, env, await currentUser(request, env));
}


// =====================================================
// CHAT STREAM
// =====================================================

async function handleChatStream(request, env) {
  return sharedChatStream(request, env, await currentUser(request, env));
}


// =====================================================
// SESSION
// =====================================================

function generateSessionId(request) {
  const ip =
    request.headers.get("CF-Connecting-IP") ||
    "anon";

  return `lummet-${ip}-${crypto.randomUUID().slice(0, 8)}`;
}
