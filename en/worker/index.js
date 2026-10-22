import { appWorker } from "./app/app-worker.js";
import { bumpPageEpoch, cachedPage, isCacheableRequest, isContentWrite } from "./page-cache.js";
import { finalizeResponse } from "./static-assets.js";
import { getRoute } from "./routes.js";
import { maintenanceResponse } from "./app/maintenance.js";
import { recordSample } from "./perf.js";

// ==========================================================
// MAINTENANCE FALLBACK WRAPPER
// ==========================================================
// Any uncaught error from appWorker.fetch (D1 quota exhaustion,
// KV quota exhaustion, etc.) is caught here and turned into a
// static, inlined maintenance page instead of a raw 500. This
// page makes ZERO calls to D1/KV/R2/templates, so it renders
// correctly even while those services are rate-limited or down.
// Remove this wrapper (or just revert to exporting appWorker
// directly) once the underlying quota/outage issue is resolved.
// ==========================================================

export default {
  async fetch(request, env, ctx) {
    try {
      let response;
      const routeType = request.method === "GET" ? getRoute(request).type : null;
      if (routeType && isCacheableRequest(request, routeType)) {
        const startedAt = Date.now();
        response = await cachedPage(request, env, ctx, routeType, (c) => appWorker.fetch(request, env, c));
        const tookMs = Date.now() - startedAt;
        recordSample(env, ctx, request, routeType, response, tookMs);
        if (response.status === 200) {
          // Visible in the browser's Network tab (Timing) and in curl -D -
          const headers = new Headers(response.headers);
          headers.append("server-timing", `app;dur=${tookMs}, cache;desc="${response.headers.get("x-page-cache") || "miss"}"`);
          response = new Response(response.body, { status: 200, headers });
        }
      } else {
        response = await appWorker.fetch(request, env, ctx);
        if (isContentWrite(request, response.status)) {
          ctx.waitUntil(bumpPageEpoch(env));
        }
      }
      return await finalizeResponse(request, response);
    } catch (err) {
      console.error("Maintenance fallback triggered:", err && err.message ? err.message : err);
      return maintenanceResponse();
    }
  },

  async scheduled(event, env, ctx) {
    try {
      return await appWorker.scheduled(event, env, ctx);
    } catch (err) {
      console.error("Scheduled handler failed, skipping this run:", err && err.message ? err.message : err);
    }
  },
};
