// worker/newsroom-amp-route.js -- /en/amp/news/<slug>: the AMP version of a published article. Off unless the news_amp switch is on. Gated (members-only)
// articles are never served here, because AMP would show the whole text: those go back to the normal page.
import * as news from "./database/news.js";
import * as newsroom from "./database/newsroom.js";
import { resolveGate } from "./newsroom-membership.js";
import { renderAmpPage } from "./newsroom-amp.js";
import { cacheHeaders } from "./controllers/shared.js";

export async function renderNewsAmp(request, env, slug) {
  const notFound = () => new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  let flags = {};
  try { flags = await newsroom.getNewsFlags(env.DB); } catch { return notFound(); }
  if (!flags.news_amp) return notFound();
  const article = await news.getNews(env.DB, slug);
  if (!article || Number(article.published) !== 1) return notFound();
  if (article.published_at) { const d = new Date(article.published_at); if (!Number.isNaN(d.getTime()) && d > new Date()) return notFound(); }
  const origin = new URL(request.url).origin;
  const canonical = `${origin}/en/news/${article.slug}`;
  try {
    const gate = await resolveGate(env.DB, request, article);
    if (gate && !gate.entitled) return new Response(null, { status: 302, headers: { Location: canonical, "Cache-Control": "private, no-store" } });
  } catch { /* no membership: not gated */ }
  // Real picture sizes from the media library, so images are not stretched to a guessed 16:9. Never fails the page.
  const dims = new Map();
  try {
    const urls = [...new Set([...String(article.content || "").matchAll(/<img\b[^>]*?\ssrc\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]).concat(article.featured_image_url || []))].slice(0, 40);
    if (urls.length) {
      const rows = (await env.DB.prepare(`SELECT url, width, height FROM media_library WHERE width > 0 AND height > 0 AND url IN (${urls.map(() => "?").join(",")})`).bind(...urls).all()).results || [];
      for (const x of rows) dims.set(x.url, { width: x.width, height: x.height });
    }
  } catch { /* keep the defaults */ }
  const html = renderAmpPage({ article: { ...article, author_name: article.author }, canonical, siteName: env.SITE_NAME || "", siteUrl: `${origin}/`, dims });
  return new Response(html, { headers: { ...cacheHeaders(), "Content-Type": "text/html; charset=utf-8" } });
}
