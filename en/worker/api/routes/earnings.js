// Earnings tools: funnel, earnings by sub-ID, payouts and invoices, promo codes, creatives.
// Admin API, dispatched from worker/api/routes/index.js. Everything lives under /api/v1/earnings.
import * as earnings from "../../database/earnings.js";
import { logAudit } from "../../database/audit.js";
import { NOT_HANDLED, failure, json, success, validate } from "../helpers.js";

const PREFIX = "/api/v1/earnings";

export async function route({ request, env, path, user }) {
  if (!path.startsWith(PREFIX + "/")) return NOT_HANDLED;
  const url = new URL(request.url);
  const q = (k) => url.searchParams.get(k) || null;
  const num = (k) => (q(k) ? Number(q(k)) : null);
  const sub = path.slice(PREFIX.length);

  if (request.method === "GET") {
    if (sub === "/funnel") return json({ success: true, ...(await earnings.getFunnel(env.DB, { from: q("from"), to: q("to"), programId: num("program_id") })) });
    if (sub === "/subids") {
      const key = q("key") || "sub1";
      if (!earnings.SUBID_KEYS.includes(key)) return failure("Unknown key", 422);
      return json({ success: true, keys: earnings.SUBID_KEYS, ...(await earnings.getSubIdReport(env.DB, { key, from: q("from"), to: q("to"), programId: num("program_id") })) });
    }
    if (sub === "/payouts/list") return json({ success: true, payouts: await earnings.listPayouts(env.DB, { programId: num("program_id") }), balances: await earnings.getBalances(env.DB) });
    if (sub === "/promo-codes/list") return json({ success: true, promo_codes: await earnings.listPromos(env.DB) });
    if (sub === "/creatives/list") return json({ success: true, creatives: await earnings.listCreatives(env.DB) });
    return NOT_HANDLED;
  }

  if (request.method !== "POST") return NOT_HANDLED;
  const body = await request.json();

  if (sub === "/payouts/save") {
    const checked = earnings.validatePayout(body);
    if (checked.errors.length) return failure(checked.errors.join(" "), 422);
    const id = await earnings.savePayout(env.DB, checked.value, user.user_id);
    await logAudit(env.DB, { userId: user.user_id, action: body.id ? "update" : "create", entityType: "payout", entityId: id, metadata: { program_id: checked.value.program_id, status: checked.value.status } });
    return success({ id });
  }
  if (sub === "/payouts/delete") { validate(body, ["id"]); await earnings.deletePayout(env.DB, body.id); await logAudit(env.DB, { userId: user.user_id, action: "delete", entityType: "payout", entityId: body.id }); return success(); }

  if (sub === "/invoice/create") {
    validate(body, ["program_id", "from", "to"]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.from) || !/^\d{4}-\d{2}-\d{2}$/.test(body.to) || body.from > body.to) return failure("Give a valid period (YYYY-MM-DD).", 422);
    const out = await earnings.createInvoice(env.DB, { programId: Number(body.program_id), currency: body.currency, from: body.from, to: body.to, userId: user.user_id, notes: body.notes ? String(body.notes).slice(0, 500) : null });
    if (out.error) return failure(out.error, 409);
    await logAudit(env.DB, { userId: user.user_id, action: "create", entityType: "invoice", entityId: out.invoice.id, metadata: { number: out.invoice.number, total: out.invoice.total } });
    return success({ invoice: out.invoice });
  }

  if (sub === "/promo-codes/save") {
    const checked = earnings.validatePromo(body);
    if (checked.errors.length) return failure(checked.errors.join(" "), 422);
    try { return success({ id: await earnings.savePromo(env.DB, checked.value, user.user_id) }); }
    catch (e) { return failure(/UNIQUE/i.test(e.message) ? "That code already exists." : e.message, 422); }
  }
  if (sub === "/promo-codes/delete") { validate(body, ["id"]); await earnings.deletePromo(env.DB, body.id); return success(); }

  if (sub === "/creatives/save") {
    const checked = earnings.validateCreative(body);
    if (checked.errors.length) return failure(checked.errors.join(" "), 422);
    return success({ id: await earnings.saveCreative(env.DB, checked.value, user.user_id) });
  }
  if (sub === "/creatives/delete") { validate(body, ["id"]); await earnings.deleteCreative(env.DB, body.id); return success(); }

  return NOT_HANDLED;
}
