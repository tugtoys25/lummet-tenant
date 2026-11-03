// Which scripts and styles a page gets (admin or public), and template includes.

// Public pages load only the scripts/styles they use; the dashboard and
// the signed-in user area keep the full admin set. base.html wraps the
// admin-only assets in <!--@full--> ... <!--@/full--> markers.
export function needsAdminAssets(path) {
  return /^\/en\/(dashboard|user)(\/|$)/.test(path || "");
}

export const PUBLIC_CSS_URL = "/static/css/public.css";

// One <link rel="stylesheet"> per file made every public page wait for 12 stylesheet requests before it could paint.
// Public pages get ONE file instead: static/css/public.css, which is those same 12 files joined in the same order
// (scripts/build-public-css.mjs writes it; a test fails if it is out of date). The dashboard keeps the separate files.
const SHEET_LINK = /<link rel="stylesheet" href="\/static\/css\/([a-z0-9-]+)\.css">[ \t]*\n?/g;

/** The stylesheets a public page links (base.html outside the admin-only block), in order. */
export function publicStylesheets(baseHtml) {
  const lean = String(baseHtml || "").replace(/<!--@full-->[\s\S]*?<!--@\/full-->\n?/g, "");
  return [...lean.matchAll(SHEET_LINK)].map((m) => m[1]);
}

export function selectAssetSet(html, path) {
  if (!html) return html;
  if (needsAdminAssets(path)) {
    return html.replace(/<!--@\/?full-->\n?/g, "").replace(/<!--@pub-->[\s\S]*?<!--@\/pub-->\n?/g, "");
  }
  let first = true;
  return html
    .replace(/<!--@full-->[\s\S]*?<!--@\/full-->\n?/g, "")
    .replace(/<!--@\/?pub-->\n?/g, "")
    .replace(SHEET_LINK, () => {
      if (!first) return "";
      first = false;
      return `<link rel="stylesheet" href="${PUBLIC_CSS_URL}">\n`;
    });
}

// A template can pull in other templates with a comment on its own line:
//   <!--@include pages/admin/settings/general.html-->
// The marker is replaced by the file's exact text (path is relative to templates/), so a page
// can be split into parts without changing a byte of its output. Includes may nest (4 deep).
const INCLUDE_RE = /<!--@include ([A-Za-z0-9_\/.-]+\.html)-->/g;

export async function expandIncludes(text, load, depth = 0) {
  if (typeof text !== "string" || !text.includes("<!--@include ")) return text;
  if (depth > 4) throw new Error("template includes are nested too deeply");
  const names = [...new Set([...text.matchAll(INCLUDE_RE)].map((m) => m[1]))];
  const parts = new Map(await Promise.all(names.map(async (name) => {
    const part = await load(name);
    if (part === null || part === undefined) throw new Error(`template include not found: ${name}`);
    return [name, await expandIncludes(part, load, depth + 1)];
  })));
  return text.replace(INCLUDE_RE, (_, name) => parts.get(name));
}
