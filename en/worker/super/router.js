// =====================================================
// SUPER API — ROUTER
// Explicit allowlist for /en/api/super/*. Every route is
// enumerated; there is no wildcard passthrough and no
// arbitrary-SQL endpoint (rule #25).
// =====================================================
import { verifySuperApiRequest, logSuperApiRequest } from "./auth.js";
import { CORE_ROUTES } from "./routes/core.js";
import { AFFILIATE_ROUTES } from "./routes/affiliate.js";
import { ANALYTICS_ROUTES } from "./routes/analytics.js";
import { AI_NEWSROOM_ROUTES } from "./routes/ai-newsroom.js";
import { RESEARCH_ROUTES } from "./routes/research.js";

// Each entry: [METHOD, path-pattern, handler, resource-name]
// Path patterns use ":param" for a single dynamic segment.
// The entries live in routes/*.js (see docs/ARCHITECTURE_SUPER_ROUTER.md); the order below is the order
// the single table always had, and the first match wins.
const ROUTES = [
  ...CORE_ROUTES,
  ...AFFILIATE_ROUTES,
  ...ANALYTICS_ROUTES,
  ...AI_NEWSROOM_ROUTES,
  ...RESEARCH_ROUTES
];

function matchRoute(method, path) {
  for (const [routeMethod, pattern, handler, resource] of ROUTES) {
    if (routeMethod !== method) continue;

    const patternParts = pattern.split("/").filter(Boolean);
    const pathParts = path.split("/").filter(Boolean);

    if (patternParts.length !== pathParts.length) continue;

    let param = null;
    let matched = true;

    for (let i = 0; i < patternParts.length; i++) {
      const pp = patternParts[i];
      if (pp.startsWith(":")) {
        param = decodeURIComponent(pathParts[i]);
        continue;
      }
      if (pp !== pathParts[i]) {
        matched = false;
        break;
      }
    }

    if (matched) {
      return { handler, resource, param };
    }
  }

  return null;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function actionForMethod(method) {
  switch (method) {
    case "GET":
      return "read";
    case "POST":
      return "create";
    case "PUT":
      return "update";
    case "DELETE":
      return "delete";
    default:
      return method.toLowerCase();
  }
}

/**
 * Entry point for all /en/api/super/* requests.
 * Wired from routes.js / index.js — see rule #7/#9/#10/#25.
 */
export async function handleSuperApi(request, env, ctx, path) {
  const method = request.method.toUpperCase();
  const requestId = crypto.randomUUID();

  const match = matchRoute(method, path);

  if (!match) {
    return json({ success: false, error: "not_found" }, 404);
  }

  // Read the body once as text (needed both for signature
  // verification and for JSON parsing in the handler).
  let bodyText = "";
  if (method === "POST" || method === "PUT" || method === "DELETE") {
    try {
      bodyText = await request.text();
    } catch (_) {
      bodyText = "";
    }
  }

  const verification = await verifySuperApiRequest(request, env, path, bodyText);

  if (!verification.ok) {
    await logSuperApiRequest(env, {
      credentialId: null,
      endpoint: path,
      method,
      resource: match.resource,
      resourceId: match.param,
      action: actionForMethod(method),
      success: false,
      statusCode: verification.status,
      requestId
    });

    const publicMessage =
      verification.status === 429 ? "rate_limited" : "unauthorized";

    return json({ success: false, error: publicMessage }, verification.status);
  }

  try {
    const response = await match.handler(
      request,
      env,
      match.param,
      bodyText
    );

    await logSuperApiRequest(env, {
      credentialId: verification.credentialId,
      endpoint: path,
      method,
      resource: match.resource,
      resourceId: match.param,
      action: actionForMethod(method),
      success: response.status < 400,
      statusCode: response.status,
      requestId
    });

    return response;
  } catch (error) {
    await logSuperApiRequest(env, {
      credentialId: verification.credentialId,
      endpoint: path,
      method,
      resource: match.resource,
      resourceId: match.param,
      action: actionForMethod(method),
      success: false,
      statusCode: 500,
      requestId
    });

    return json({ success: false, error: "internal_error" }, 500);
  }
}
