// Which scripts and styles a page gets (admin or public), and template includes.

// Public pages load only the scripts/styles they use; the dashboard and
// the signed-in user area keep the full admin set. base.html wraps the
// admin-only assets in <!--@full--> ... <!--@/full--> markers.
export function needsAdminAssets(path) {
  return /^\/en\/(dashboard|user)(\/|$)/.test(path || "");
}

export function selectAssetSet(html, path) {
  if (!html) return html;
  if (needsAdminAssets(path)) {
    return html.replace(/<!--@\/?full-->\n?/g, "");
  }
  return html.replace(/<!--@full-->[\s\S]*?<!--@\/full-->\n?/g, "");
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
