// Configuration draft, publish, versions, rollback, audit and preview (Phase 6).
// Dispatched from worker/api/routes/index.js. Roles (staff only; the public "viewer" account role gets nothing here): editor reads, edits the draft and
// previews it; administrator also publishes, rolls back and discards. See worker/site-profile/versions.js.
import { NOT_HANDLED, failure, json } from "../helpers.js";
import {
  permissionsFor, configState, saveDraft, discardDraft, previewPublish, publishDraft, rollbackTo,
  listVersions, getVersion, listAudit, tablesReady, NEEDS_MIGRATION, rowsView,
} from "../../site-profile/versions.js";
import { previewCookie, PREVIEW_MAX_AGE } from "../../site-profile/preview.js";
import { refuseWhenOff } from "../../site-profile/system-flag.js";

const PREFIX = "/api/v1/config";
const MUTATES = new Set(["POST", "PUT", "PATCH", "DELETE"]);

import { crossSite, readJsonCapped, MAX_BODY_DRAFT } from "../config-http.js";
import { limitRequest } from "../config-limits.js";
const deny = (what) => failure(`Your role cannot ${what}.`, 403);
const num = (v) => (v == null || v === "" ? undefined : Number(v));

export async function route({ request, env, path, user }) {
  if (path !== PREFIX && !path.startsWith(PREFIX + "/")) return NOT_HANDLED;
  if (!user) return failure("Unauthorized", 401);
  const perm = permissionsFor(user);
  if (!perm.view) return deny("view the configuration");
  if (MUTATES.has(request.method) && crossSite(request)) return failure("Cross-site request refused.", 403);
  const host = new URL(request.url).hostname;
  const q = new URL(request.url).searchParams;
  const sub = path.slice(PREFIX.length);
  const m = request.method;
  // Master switch OFF (Phase 10): no configuration writes (draft, publish, rollback). Preview only sets a cookie and stays allowed.
  if (MUTATES.has(m) && sub !== "/preview") { const off = await refuseWhenOff(env); if (off) return off; }

  const respond = (r, okStatus = 200) => {
    if (r.error && !r.errors?.length) return json({ success: false, error: r.error, code: r.conflict ? "conflict" : r.empty ? "nothing_to_publish" : r.retry ? "retry" : undefined, conflicts: r.conflicts, draft: r.draft }, r.status || 400);
    if (r.errors?.length) return json({ success: false, error: r.errors.join(" "), errors: r.errors, rejected: r.rejected }, r.status || 422);
    if (r.conflict) return json({ success: false, code: "conflict", error: "The draft was changed by someone else. Reload to see their changes.", draft: r.draft }, 409);
    return json({ success: true, ...r }, okStatus);
  };

  if (sub === "/state" && m === "GET") return json({ success: true, ...(await configState(env, user)) });

  if (sub === "/draft") {
    if (m === "PUT") {
      if (!perm.editDraft) return deny("edit the draft");
      const rb = await readJsonCapped(request, MAX_BODY_DRAFT); if (rb.response) return rb.response; const b = rb.body;
      return respond(await saveDraft(env, user, { profile: b.profile, settings: b.settings, rows: b.rows, revision: num(b.revision) }));
    }
    if (m === "DELETE") {
      if (!perm.discard) return deny("discard the draft");
      return respond(await discardDraft(env, user));
    }
    return failure("Method not allowed", 405);
  }

  const rv = sub.match(/^\/rows\/([a-z]+)$/);
  if (rv && m === "GET") { const r = await rowsView(env, rv[1]); return r.error ? failure(r.error, r.status || 404) : json({ success: true, ...r }); }

  if (sub === "/publish-preview" && m === "GET") return respond(await previewPublish(env));

  if (sub === "/publish" && m === "POST") {
    if (!perm.publish) return deny("publish");
    { const lim = await limitRequest(env, user, "publish"); if (lim) return lim; }
    const rb = await readJsonCapped(request); if (rb.response) return rb.response; const b = rb.body;
    return respond(await publishDraft(env, host, user, { note: b.note, revision: num(b.revision), resolve: b.resolve }));
  }

  if (sub === "/rollback" && m === "POST") {
    if (!perm.rollback) return deny("roll back");
    { const lim = await limitRequest(env, user, "rollback"); if (lim) return lim; }
    const rb = await readJsonCapped(request); if (rb.response) return rb.response; const b = rb.body;
    if (!Number.isInteger(Number(b.version))) return failure("Choose a version to restore.", 422);
    return respond(await rollbackTo(env, host, user, b.version, b.note));
  }

  if (sub === "/versions" && m === "GET") {
    if (!(await tablesReady(env))) return json({ success: false, error: NEEDS_MIGRATION }, 503);
    return json({ success: true, ...(await listVersions(env, { limit: q.get("limit"), before: q.get("before") })) });
  }
  const one = sub.match(/^\/versions\/(\d+)$/);
  if (one && m === "GET") {
    if (!(await tablesReady(env))) return json({ success: false, error: NEEDS_MIGRATION }, 503);
    const v = await getVersion(env, one[1]);
    return v ? json({ success: true, ...v }) : failure("That version does not exist.", 404);
  }

  if (sub === "/audit" && m === "GET") {
    if (!(await tablesReady(env))) return json({ success: false, error: NEEDS_MIGRATION }, 503);
    return json({ success: true, ...(await listAudit(env, { limit: q.get("limit"), before: q.get("before") })) });
  }

  if (sub === "/preview" && m === "POST") {
    if (!perm.preview) return deny("preview the draft");
    const rb = await readJsonCapped(request); if (rb.response) return rb.response; const b = rb.body;
    const on = b.on !== false;
    return new Response(JSON.stringify({ success: true, on, url: "/en", expiresInSeconds: on ? PREVIEW_MAX_AGE : 0 }), {
      status: 200, headers: { "Content-Type": "application/json", "Set-Cookie": previewCookie(on), "Cache-Control": "no-store" },
    });
  }

  return NOT_HANDLED;
}
