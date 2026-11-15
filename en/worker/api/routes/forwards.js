// Forwarding rules: send conversions on to a tracker (Keitaro, Binom, Voluum, any URL), Meta or TikTok.
// Admin API under /api/v1/forwards, dispatched from worker/api/routes/index.js. Credentials are stored encrypted and never returned.
import * as fw from "../../forwarding/forward.js";
import { logAudit } from "../../database/audit.js";
import { NOT_HANDLED, failure, json, success, validate } from "../helpers.js";

const PREFIX = "/api/v1/forwards";

export async function route({ request, env, path, user }) {
  if (!path.startsWith(PREFIX + "/")) return NOT_HANDLED;
  const sub = path.slice(PREFIX.length);
  const url = new URL(request.url);

  if (request.method === "GET") {
    if (sub === "/list") return json({ success: true, forwards: await fw.listForwards(env.DB) });
    if (sub === "/deliveries") return json({ success: true, deliveries: await fw.listDeliveries(env.DB, { forwardId: url.searchParams.get("forward_id") ? Number(url.searchParams.get("forward_id")) : null, limit: url.searchParams.get("limit") }) });
    if (sub === "/presets") return json({ success: true, trackers: fw.TRACKER_PRESETS, events: fw.CONVERSION_EVENTS, statuses: fw.FORWARD_STATUSES });
    return NOT_HANDLED;
  }
  if (request.method !== "POST") return NOT_HANDLED;
  const body = await request.json();

  if (sub === "/save") {
    const checked = fw.validateForward(body, { creating: !body.id });
    if (checked.errors.length) return failure(checked.errors.join(" "), 422);
    const id = await fw.saveForward(env, checked.value, user.user_id);
    await logAudit(env.DB, { userId: user.user_id, action: body.id ? "update" : "create", entityType: "conversion_forward", entityId: id, metadata: { kind: checked.value.kind } });
    return success({ id });
  }
  if (sub === "/delete") { validate(body, ["id"]); await fw.deleteForward(env.DB, body.id); await logAudit(env.DB, { userId: user.user_id, action: "delete", entityType: "conversion_forward", entityId: body.id }); return success(); }
  if (sub === "/test") {
    validate(body, ["id"]);
    const out = await fw.testForward(env, body.id, { send: body.send === true });
    if (out.error && !out.preview) return failure(out.error, 404);
    return json({ success: !out.error, ...out });
  }
  if (sub === "/retry") {
    validate(body, ["delivery_id"]);
    const out = await fw.retryDelivery(env, body.delivery_id);
    return out.error ? failure(out.error, 404) : success(out);
  }
  return NOT_HANDLED;
}
