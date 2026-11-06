// ============================================================
// SITE PROFILE: link integrity for rendered public HTML (Phase 3)
// ============================================================
// One pass over a finished page that removes every internal link to a removed section:
//   - <li><a>..</a></li> link items   -> the whole item is removed
//   - button-style links (btn/button) -> removed
//   - any other <a href>              -> unlinked (the text stays)
//   - the homepage link when the homepage is off -> points at the landing page
//   - <link rel=canonical|alternate|prev|next> to a removed page -> removed
//   - JSON-LD BreadcrumbList / ItemList entries for removed pages -> removed and renumbered
//   - blocks tagged data-cap="<capability>" of a switched-off capability or feature are removed first (cap-blocks.js); this runs
//     even when header.autoPrune is off, because it hides content of a switched-off feature, not links
// Pure string functions, no I/O. Fail-safe: any error returns the page untouched.
import { pathAllowed, landingPath, pruneCapBlocks } from "./profile.js";

// Public blocks tagged data-cap="<capability>" (ratings, FAQs, review sections, bookmark buttons ...) are removed whenever a
// feature or module is off. This is NOT a link rewrite, so it does not depend on header.autoPrune ("Hide links to
// disabled modules"): a switched-off feature must not show its blocks. The default profile never needs it (Phase 11 / T3).
export function needsCapPrune(profile) {
  if (!profile) return false;
  if (Object.keys(profile.features || {}).length > 0) return true;
  return Object.values(profile.modules || {}).some((v) => v === false);
}

// Does a finished public page need any pass at all (block pruning, link rewriting, or both)?
export const needsPublicPass = (profile) => needsCapPrune(profile) || needsRewrite(profile);

export function needsRewrite(profile) {
  if (!profile || profile.header?.autoPrune === false) return false;
  if (profile.homepage === false) return true;
  if (Object.values(profile.modules || {}).some((v) => v === false)) return true;
  return Object.keys(profile.pages || {}).length > 0;
}

const decode = (s) => String(s).replace(/&amp;/g, "&").replace(/&#38;/g, "&");
const HREF = /\shref\s*=\s*(?:"([^"]*)"|'([^']*)')/i;

function localPath(href, origin) {
  const h = decode(href).trim();
  if (origin && h.toLowerCase().startsWith(origin.toLowerCase())) { const rest = h.slice(origin.length); return rest.startsWith("/") ? rest : "/" + rest; }
  return h;
}

function allowed(href, profile, origin) {
  const p = localPath(href, origin);
  if (!p.startsWith("/")) return true;           // external, mailto:, #fragment, relative-less
  const clean = p.split(/[?#]/)[0];
  if (clean === "/" || clean === "") return true; // "/" redirects to the landing page by itself
  return pathAllowed(p, profile);
}

const isButton = (attrs) => /\bclass\s*=\s*["'][^"']*\b(btn|button)\b/i.test(attrs) || /\brole\s*=\s*["']button["']/i.test(attrs);

function jsonLdPrune(json, profile, origin) {
  const urlOf = (el) => { const it = el && (el.item ?? el.url ?? el["@id"]); return typeof it === "string" ? it : (it && (it["@id"] || it.url)) || null; };
  const walk = (node) => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== "object") return node;
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k] = walk(v);
    const t = [].concat(out["@type"] || []);
    if ((t.includes("BreadcrumbList") || t.includes("ItemList")) && Array.isArray(out.itemListElement)) {
      let n = 0;
      out.itemListElement = out.itemListElement.filter((el) => { const u = urlOf(el); return !u || allowed(u, profile, origin); })
        .map((el) => (el && typeof el === "object" && "position" in el ? { ...el, position: ++n } : el));
    }
    return out;
  };
  return walk(json);
}

function rewriteSegment(html, profile, origin) {
  // 1. whole list items that are just a link
  let out = html.replace(/<li\b[^>]*>\s*<a\b([^>]*)>[\s\S]*?<\/a>\s*<\/li>/gi, (m, attrs) => {
    const h = HREF.exec(attrs); const href = h && (h[1] ?? h[2]);
    return href && !allowed(href, profile, origin) ? "" : m;
  });
  // 2. remaining anchors
  out = out.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (m, attrs, inner) => {
    const h = HREF.exec(attrs); if (!h) return m;
    const href = h[1] ?? h[2];
    const p = localPath(href, origin);
    if (!profile.homepage && p.split(/[?#]/)[0] === "/en") {
      const to = landingPath(profile);
      return to && to !== "/en" && pathAllowed(to, profile) ? m.replace(href, to) : (isButton(attrs) ? "" : inner);
    }
    if (allowed(href, profile, origin)) return m;
    return isButton(attrs) ? "" : inner;
  });
  // 3. head links
  out = out.replace(/<link\b[^>]*>/gi, (m) => {
    if (!/\brel\s*=\s*["']?(canonical|alternate|prev|next)\b/i.test(m)) return m;
    const h = HREF.exec(m); const href = h && (h[1] ?? h[2]);
    return href && !allowed(href, profile, origin) ? "" : m;
  });
  return out;
}

export function rewriteHtmlLinks(html, profile, origin = "") {
  if (!html || !needsPublicPass(profile)) return html;
  try {
    // Tagged public blocks go first, so links inside a removed block are never looked at. Fails open (page unchanged).
    if (needsCapPrune(profile) && /data-cap/i.test(html)) html = pruneCapBlocks(String(html), profile);
    if (!needsRewrite(profile)) return html;
    return String(html).split(/(<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>)/gi).map((part) => {
      if (/^<script\b/i.test(part)) {
        const m = /^(<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>)([\s\S]*?)(<\/script>)$/i.exec(part);
        if (!m) return part;
        try { return m[1] + JSON.stringify(jsonLdPrune(JSON.parse(m[2]), profile, origin)) + m[3]; } catch { return part; }
      }
      if (/^<style\b/i.test(part)) return part;
      return rewriteSegment(part, profile, origin);
    }).join("");
  } catch { return html; }
}

// Public HTML only: never dashboards, APIs, assets or feeds.
export function linkRewriteApplies(route, response) {
  const t = String(route?.type || "");
  if (t.startsWith("dashboard") || t === "api" || t === "superApi" || t === "media" || t.startsWith("sitemap") || t === "robots" || t === "favicon") return false;
  return /text\/html/i.test(response.headers.get("content-type") || "");
}
