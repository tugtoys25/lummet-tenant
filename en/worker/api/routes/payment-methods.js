// Payment methods.
// Part of the admin API. Dispatched in order from worker/api.js (see worker/api/routes/index.js).
import * as paymentMethods from "../../database/payment-methods.js";
import { NOT_HANDLED, failure, json, success, validate } from "../helpers.js";

export async function route({ request, env, path }) {

    // ==================================
    // PAYMENT METHODS CRUD
    // ==================================
    if (path === "/api/v1/payment-methods/list" && request.method === "GET") {
      const rows = await paymentMethods.getAllPaymentMethods(env.DB);
      return json({ success: true, payment_methods: rows });
    }

    if (path === "/api/v1/payment-method/get-by-id" && request.method === "GET") {
      const urlObj = new URL(request.url);
      const id = urlObj.searchParams.get("id");
      if (!id) return failure("id is required", 422);
      const row = await env.DB.prepare(`SELECT * FROM payment_methods WHERE id = ?`).bind(id).first();
      if (!row) return failure("Not found", 404);
      return json({ success: true, payment_method: row });
    }

    if (path === "/api/v1/payment-method/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["slug", "name"]);
      await paymentMethods.createPaymentMethod(env.DB, body);
      return success();
    }

    if (path === "/api/v1/payment-method/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["slug", "name"]);
      await paymentMethods.updatePaymentMethod(env.DB, body.slug, body);
      return success();
    }

    if (path === "/api/v1/payment-method/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["slug"]);
      await paymentMethods.deletePaymentMethod(env.DB, body.slug);
      return success();
    }

    // Casinos currently linked to a payment method -- feeds the
    // "which casinos accept this" checkbox pre-check on the edit form.
    if (path === "/api/v1/payment-method/casinos" && request.method === "GET") {
      const urlObj = new URL(request.url);
      const slug = urlObj.searchParams.get("slug");
      if (!slug) return failure("slug is required", 422);
      const casinoIds = await paymentMethods.getCasinoIdsForPaymentMethod(env.DB, slug);
      return json({ success: true, casino_ids: casinoIds });
    }

    // Full casino rows accepted for this payment method's own
    // content-section casino pickers (casino_grid/casino_editorial/
    // casino_spotlights) -- same role as /category/eligible-casinos.
    if (path === "/api/v1/payment-method/eligible-casinos" && request.method === "GET") {
      const urlObj = new URL(request.url);
      const slug = urlObj.searchParams.get("slug");
      if (!slug) return failure("slug is required", 422);
      const rows = await paymentMethods.getCasinosForPaymentMethod(env.DB, slug);
      return json({ success: true, casinos: rows });
    }

    // Replaces the full casino list for ONE payment method in a
    // single call (bulk direction #1: one method -> many casinos).
    // Body: { payment_method_id, casino_ids: [...] }
    if (path === "/api/v1/payment-method/set-casinos" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["payment_method_id"]);
      await paymentMethods.setCasinosForPaymentMethod(env.DB, body.payment_method_id, body.casino_ids || []);
      return success();
    }

    // Payment methods currently linked to a casino -- feeds the
    // "which methods this casino accepts" checkbox pre-check on the
    // casino edit form (bulk direction #2, see below).
    if (path === "/api/v1/casino/payment-methods" && request.method === "GET") {
      const urlObj = new URL(request.url);
      const casinoId = urlObj.searchParams.get("casino_id");
      if (!casinoId) return failure("casino_id is required", 422);
      const paymentMethodIds = await paymentMethods.getPaymentMethodIdsForCasino(env.DB, casinoId);
      return json({ success: true, payment_method_ids: paymentMethodIds });
    }

    // Replaces the full payment-method list for ONE casino in a
    // single call (bulk direction #2: one casino -> many methods).
    // Body: { casino_id, payment_method_ids: [...] }
    if (path === "/api/v1/casino/set-payment-methods" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["casino_id"]);
      await paymentMethods.setCasinoPaymentMethods(env.DB, body.casino_id, body.payment_method_ids || []);
      return success();
    }

  return NOT_HANDLED;
}
