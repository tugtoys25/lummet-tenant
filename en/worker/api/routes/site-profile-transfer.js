// Configuration export, import, presets, share links and cloning (Phase 7).
// Dispatched from worker/api/routes/index.js. Everything under /api/v1/config/transfer needs a signed-in staff role.
//   editor   exports, checks files (dry run), adds an import to the draft, lists presets, clones from another site
//   admin    also saves, renames and deletes presets, and creates and revokes share links
// Importing only ever writes to the DRAFT; publishing stays with the administrator (see site-profile/versions.js).
// One public endpoint lives here as well: shareExport (POST /api/v1/config-share/export), called by another site
// with a share code. It is wired in worker/api/public.js because it runs without a session.
import { NOT_HANDLED, failure, json } from "../helpers.js";
import { crossSite, readBody } from "../config-http.js";
import { checkRateLimit, logFailedAttempt, hashIPForAuth } from "../../auth/security.js";
import { permissionsFor, tablesReady, NEEDS_MIGRATION } from "../../site-profile/versions.js";
import { sectionCatalog, buildExport, parseEnvelope, planImport, applyImport, transferPermissions, recordTransfer, FORMAT_VERSION, MAX_IMPORT_BYTES, BRAND_GROUPS } from "../../site-profile/transfer.js";
import {
  transferTablesReady, NEEDS_TRANSFER_MIGRATION, listPresets, savePreset, getPresetText, updatePreset, deletePreset,
  listShares, createShare, revokeShare, exportForShare, fetchShared, SHARE_HOURS, MAX_PRESETS, MAX_ACTIVE_SHARES,
} from "../../site-profile/transfer-store.js";

const PREFIX = "/api/v1/config/transfer";
const MUTATES = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const deny = (what) => failure(`Your role cannot ${what}.`, 403);

// Result objects from the worker modules -> responses.
function respond(r, okStatus = 200) {
  if (r.errors?.length) return json({ success: false, error: r.errors.join(" "), errors: r.errors, rejected: r.rejected, report: r.report }, r.status || 422);
  if (r.conflict) return json({ success: false, code: "conflict", error: "The draft was changed by someone else. Reload to see their changes, then check the file again.", draft: r.draft }, 409);
  if (r.error) return json({ success: false, error: r.error, code: r.code, report: r.report }, r.status || 400);
  return json({ success: true, ...r }, okStatus);
}

// Where the file to check comes from: a pasted/uploaded file (`text` or `envelope`) or a saved preset (`presetId`).
async function source(env, b) {
  if (b.presetId != null && b.presetId !== "") {
    const p = await getPresetText(env, b.presetId);
    return p.error ? { error: p.error, status: p.status } : { input: p.text };
  }
  if (typeof b.text === "string") return { input: b.text };
  if (b.envelope && typeof b.envelope === "object") return { input: b.envelope };
  return { error: "Choose a file, paste its contents, or pick a preset.", status: 422 };
}
async function parsed(env, b) {
  const s = await source(env, b); if (s.error) return s;
  const p = await parseEnvelope(s.input);
  return p.ok ? { parsed: p } : { errors: p.errors, warnings: p.warnings, status: 422 };
}
const idList = (v) => (Array.isArray(v) ? v.map(String) : undefined);
const safeName = (host) => String(host || "site").toLowerCase().replace(/[^a-z0-9.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "site";

export async function route({ request, env, path, user }) {
  if (path !== PREFIX && !path.startsWith(PREFIX + "/")) return NOT_HANDLED;
  if (!user) return failure("Unauthorized", 401);
  const perm = permissionsFor(user), tp = transferPermissions(user);
  if (!perm.view) return deny("view the configuration");
  if (MUTATES.has(request.method) && crossSite(request)) return failure("Cross-site request refused.", 403);
  const url = new URL(request.url), host = url.hostname, q = url.searchParams;
  const sub = path.slice(PREFIX.length), m = request.method;

  if (sub === "/state" && m === "GET") {
    const ready = await transferTablesReady(env);
    const out = { success: true, host, ready, message: ready ? null : NEEDS_TRANSFER_MIGRATION, permissions: tp, formatVersion: FORMAT_VERSION, maxBytes: MAX_IMPORT_BYTES,
      limits: { presets: MAX_PRESETS, shares: MAX_ACTIVE_SHARES, shareHours: SHARE_HOURS },
      catalog: sectionCatalog().map((s) => ({ ...s })), brandGroups: [...BRAND_GROUPS], versioning: await tablesReady(env) };
    if (ready) { out.presets = (await listPresets(env)).presets || []; if (tp.manage) out.shares = (await listShares(env)).shares || []; }
    return json(out);
  }

  if (sub === "/export" && m === "GET") {
    if (!tp.export) return deny("export the configuration");
    const built = await buildExport(env, { host, sections: q.get("sections") ? q.get("sections").split(",") : undefined, from: q.get("from") === "draft" ? "draft" : "live", name: q.get("name") || undefined, description: q.get("description") || undefined });
    if (!built.included.length) return failure("There is nothing to export for the sections you chose.", 422);
    if (q.get("download") === "1") {
      await recordTransfer(env, user, "export", `Exported ${built.included.length} section${built.included.length === 1 ? "" : "s"} as a file.`);
      return new Response(JSON.stringify(built.envelope, null, 2), { status: 200, headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="lummet-config-${safeName(host)}-${built.envelope.exportedAt.slice(0, 10)}.json"`, "Cache-Control": "no-store" } });
    }
    return json({ success: true, envelope: built.envelope, included: built.included, notes: built.notes });
  }

  // ----- dry run and apply -----
  if ((sub === "/plan" || sub === "/apply") && m === "POST") {
    if (!tp.import) return deny("import a configuration");
    const b = await readBody(request); if (!b) return failure("Invalid JSON");
    const p = await parsed(env, b);
    if (p.errors) return json({ success: false, error: p.errors.join(" "), errors: p.errors, warnings: p.warnings }, p.status);
    if (p.error) return failure(p.error, p.status);
    const opts = { sections: idList(b.sections), host, revision: b.revision };
    if (sub === "/plan") { const { report } = await planImport(env, p.parsed, opts); return json({ success: true, report }); }
    return respond(await applyImport(env, user, p.parsed, opts));
  }

  // ----- clone from another site -----
  if (sub === "/fetch" && m === "POST") {
    if (!tp.import) return deny("copy a configuration from another site");
    const b = await readBody(request); if (!b) return failure("Invalid JSON");
    const r = await fetchShared({ url: b.url, token: b.token, selfHost: host, fetch: env.CONFIG_FETCH });
    if (r.error) return failure(r.error, 422);
    const pr = await parseEnvelope(r.text);
    if (!pr.ok) return json({ success: false, error: pr.errors.join(" "), errors: pr.errors }, 422);
    await recordTransfer(env, user, "clone.fetch", `Fetched a configuration from ${r.host} to review.`);
    return json({ success: true, host: r.host, text: r.text });
  }

  // ----- presets -----
  if (sub === "/presets") {
    if (m === "GET") { if (!tp.library) return deny("see presets"); return respond(await listPresets(env)); }
    if (m === "POST") {
      if (!tp.manage) return deny("save presets");
      const b = await readBody(request); if (!b) return failure("Invalid JSON");
      return respond(await savePreset(env, user, { name: b.name, description: b.description, sections: idList(b.sections), from: b.from, host }), 201);
    }
    return failure("Method not allowed", 405);
  }
  // A saved preset as a file, so it can be kept, sent or imported on another site.
  const dl = sub.match(/^\/presets\/(\d+)\/download$/);
  if (dl && m === "GET") {
    if (!tp.library) return deny("download presets");
    const p = await getPresetText(env, dl[1]);
    if (p.error) return failure(p.error, p.status);
    await recordTransfer(env, user, "preset.download", `Downloaded preset “${p.name}” as a file.`);
    return new Response(p.text, { status: 200, headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="lummet-preset-${safeName(p.name)}.json"`, "Cache-Control": "no-store" } });
  }
  const pr = sub.match(/^\/presets\/(\d+)$/);
  if (pr) {
    if (!tp.manage) return deny("change presets");
    if (m === "PUT") { const b = await readBody(request); if (!b) return failure("Invalid JSON"); return respond(await updatePreset(env, user, pr[1], { name: b.name, description: b.description })); }
    if (m === "DELETE") return respond(await deletePreset(env, user, pr[1]));
    return failure("Method not allowed", 405);
  }

  // ----- share links -----
  if (sub === "/shares") {
    if (!tp.manage) return deny("manage share links");
    if (m === "GET") return respond(await listShares(env));
    if (m === "POST") { const b = await readBody(request); if (!b) return failure("Invalid JSON"); return respond(await createShare(env, user, { label: b.label, hours: b.hours, maxUses: b.maxUses, sections: idList(b.sections) }), 201); }
    return failure("Method not allowed", 405);
  }
  const sh = sub.match(/^\/shares\/(\d+)$/);
  if (sh && m === "DELETE") { if (!tp.manage) return deny("manage share links"); return respond(await revokeShare(env, user, sh[1])); }

  return NOT_HANDLED;
}

// Public: POST /api/v1/config-share/export with "Authorization: Bearer lcs_...". Runs without a session.
export async function shareExport({ request, env }) {
  const h = { "Content-Type": "application/json", "Cache-Control": "no-store" };
  if (request.method !== "POST") return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), { status: 405, headers: { ...h, Allow: "POST" } });
  // Guessing a 256-bit code is not realistic, but a stranger still gets only a few wrong tries per address.
  // The limiter is the one the sign-in uses; if it cannot be reached the request is still checked by the code itself.
  let ipHash = "", limited = false;
  try {
    ipHash = await hashIPForAuth(request.headers.get("CF-Connecting-IP"));
    if (ipHash && !(await checkRateLimit(env, ipHash, "config-share"))) limited = true;
  } catch { /* fail open: the code is still required */ }
  if (limited) return new Response(JSON.stringify({ success: false, error: "Too many attempts. Try again later." }), { status: 429, headers: { ...h, "Retry-After": "900" } });
  const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get("Authorization") || "");
  const r = await exportForShare(env, m ? m[1] : "", new URL(request.url).hostname);
  if (r.error) {
    try { if (ipHash) await logFailedAttempt(env, ipHash, "config-share"); } catch { /* ignore */ }
    return new Response(JSON.stringify({ success: false, error: r.error }), { status: r.status || 403, headers: h });
  }
  return new Response(JSON.stringify({ success: true, envelope: r.envelope }), { status: 200, headers: h });
}
