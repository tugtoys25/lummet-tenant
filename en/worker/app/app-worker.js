import { NOT_HANDLED } from "./routes/not-handled.js";
import { ROUTE_GROUPS } from "./routes/index.js";
import { getRoute } from "../routes.js";
import { getSiteContext } from "../site-context.js";
import { handleLummetRequest } from "../lummet/router.js";
import { render404 } from "../controllers.js";
import { runScheduled } from "./scheduled.js";

const appWorker = {

  async fetch(request, env, ctx) {

    const url = new URL(request.url);

    // ── Check if this is the Lummet subdomain ──
    // ── Check if this is the tenant's Lummet subdomain ──
    if (url.hostname.startsWith("lummet.")) {
      const lummetResponse = await handleLummetRequest(request, env, ctx);

      if (lummetResponse) {
        return lummetResponse;
      }
    }


    // ==========================================================
// HOST-AWARE PWA MANIFEST
// ==========================================================

if (
  request.method === "GET" &&
  url.pathname === "/site.webmanifest"
) {
  const site = await getSiteContext(
    request,
    env
  );

  const { buildSiteManifest } =
    await import("../site-settings.js");

  const manifest =
    buildSiteManifest(
      site,
      site.origin
    );

  return new Response(
    JSON.stringify(
      manifest,
      null,
      2
    ),
    {
      status: 200,
      headers: {
        "content-type":
          "application/manifest+json; charset=utf-8",

        "cache-control":
          "public, max-age=300"
      }
    }
  );
}


    // Serve static assets
    if (
      url.pathname.startsWith("/static/")
    ) {
      return env.ASSETS.fetch(request);
    }

    const route = getRoute(request);

    for (const handle of ROUTE_GROUPS) {
      const result = await handle(route, request, env, ctx, url);
      if (result !== NOT_HANDLED) return result;
    }

    return render404(request, env);
  },

  async scheduled(event, env, ctx) {
    return runScheduled(appWorker, event, env, ctx);
  }
};

export { appWorker };
