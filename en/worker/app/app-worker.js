import { NOT_HANDLED } from "./routes/not-handled.js";
import { ROUTE_GROUPS } from "./routes/index.js";
import { getRoute } from "../routes.js";
import { getSiteContext } from "../site-context.js";
import { handleLummetRequest } from "../lummet/router.js";
import { render404 } from "../controllers.js";
import { runScheduled } from "./scheduled.js";
import { loadProfile } from "../site-profile/store.js";
import { gate } from "../site-profile/profile.js";
import { needsPublicPass, rewriteHtmlLinks, linkRewriteApplies } from "../site-profile/links.js";
import { resolvePreview, decoratePreview } from "../site-profile/preview.js";

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

    // Draft preview: a signed-in editor with preview switched on sees the draft applied (never cached, banner added).
    const previewing = await resolvePreview(request, env, url);
    if (previewing) env = Object.assign(Object.create(env), { __preview: previewing });

    // Site profile: modules / landing page / disabled-route behaviour (fail-open to the full platform).
    const profile = await loadProfile(env, url.hostname);
    const decision = gate(route, profile);
    if (decision.action === "redirect") {
      return new Response(null, { status: decision.status, headers: { Location: decision.location, "Cache-Control": "no-store" } });
    }
    // Link integrity: strip links to removed sections from finished public HTML (before the page cache stores it).
    const finish = async (res) => {
      try {
        let out = res;
        if (request.method === "GET" && needsPublicPass(profile) && linkRewriteApplies(route, res)) {
          const html = rewriteHtmlLinks(await res.text(), profile, url.origin);
          const headers = new Headers(res.headers); headers.delete("content-length");
          out = new Response(html, { status: res.status, statusText: res.statusText, headers });
        }
        return previewing ? await decoratePreview(out) : out;
      } catch { return res; }
    };

    if (decision.action === "gone") {
      const page = await render404(request, env);
      return finish(new Response(page.body, { status: decision.status, headers: page.headers }));
    }

    for (const handle of ROUTE_GROUPS) {
      const result = await handle(route, request, env, ctx, url);
      if (result !== NOT_HANDLED) return finish(result);
    }

    return finish(await render404(request, env));
  },

  async scheduled(event, env, ctx) {
    return runScheduled(appWorker, event, env, ctx);
  }
};

export { appWorker };
