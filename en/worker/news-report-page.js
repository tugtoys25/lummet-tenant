// Public "Report a copyright issue" page (switch: news_copyright_reports). 404 while the switch is off.
import { Renderer } from "./render.js";
import { getSiteContext } from "./site-context.js";
import { cacheHeaders } from "./controllers/shared.js";
import { render404 } from "./controllers/system-pages.js";
import { getAudienceFlags } from "./newsroom-audience.js";
import { esc } from "./newsroom-render.js";

export async function renderCopyrightReport(request, env) {
  try {
    if (!(await getAudienceFlags(env.DB)).news_copyright_reports) return render404(request, env);
    const site = await getSiteContext(request, env);
    const u = new URL(request.url).searchParams.get("url") || "";
    let prefill = "";
    try { const p = new URL(u, site.origin); if (p.origin === new URL(site.origin).origin) prefill = p.origin + p.pathname; } catch { /* ignore a bad value */ }
    const renderer = new Renderer(env, request);
    const html = await renderer.render("copyright-report.html", {
      site_name: esc(site.siteName), report_page_url: esc(prefill),
      seo_title: `Report a copyright issue | ${site.siteName}`,
      seo_description: `Tell ${site.siteName} about material that uses your work without permission.`,
      robots: "noindex, follow", canonical: site.url("/en/copyright-report")
    }, null, [{ label: "Home", url: "/en" }, { label: "Report a copyright issue", url: null }]);
    return new Response(html, { headers: cacheHeaders() });
  } catch (e) {
    console.error("copyright report page failed:", e && e.message);
    return render404(request, env);
  }
}
