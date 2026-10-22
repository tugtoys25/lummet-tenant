// Postback configurations.
// Part of the admin API. Dispatched in order from worker/api.js (see worker/api/routes/index.js).
import * as affiliateAccounts from "../../database/affiliate-accounts.js";
import { logAudit } from "../../database/audit.js";
import * as postbackConfigsDB from "../../database/postback-configs.js";
import { ingestPostback } from "../../postback/ingest.js";
import { normalizeConversionPayload, validateNormalized } from "../../postback/field-mapping.js";
import { NOT_HANDLED, failure, json, success, validate } from "../helpers.js";

export async function route({ request, env, path, user }) {

    // ==================================
    // POSTBACK INTEGRATIONS (brief §4-6, §21, §25)
    // Admin-only -- see readResourceMap/resourceMap above and
    // migration 0033 (no editor permission rows exist for this
    // resource at all, so a non-admin gets a 403 regardless of role).
    // ==================================

    if (path === "/api/v1/postback-configs/list") {
      const url = new URL(request.url);
      const accountId = url.searchParams.get("account_id") ? Number(url.searchParams.get("account_id")) : null;
      const status = url.searchParams.get("status") || null;
      const configs = await postbackConfigsDB.listPostbackConfigs(env.DB, { accountId, status });
      return json({ success: true, configs });
    }

    if (path === "/api/v1/postback-config/get") {
      const url = new URL(request.url);
      const id = Number(url.searchParams.get("id"));
      if (!id) return failure("id is required");
      const config = await postbackConfigsDB.getPostbackConfigById(env.DB, id);
      if (!config) return failure("Postback config not found", 404);
      return json({ success: true, config });
    }

    if (path === "/api/v1/postback-config/health") {
      const url = new URL(request.url);
      const id = Number(url.searchParams.get("id"));
      if (!id) return failure("id is required");
      const health = await postbackConfigsDB.getConversionHealth(env.DB, id);
      return json({ success: true, health });
    }

    if (path === "/api/v1/postback-config/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["account_id", "label", "auth_method", "credential_reference"]);

      const account = await affiliateAccounts.getAccountById(env.DB, body.account_id);
      if (!account) return failure("Affiliate account not found", 404);

      body.created_by = user.user_id;
      try {
        const { id, endpoint_token } = await postbackConfigsDB.createPostbackConfig(env.DB, body);
        await logAudit(env.DB, {
          userId: user.user_id, action: 'create', entityType: 'postback_config', entityId: id,
          // Never the credential value -- only which pointer/account it's for.
          metadata: { account_id: body.account_id, auth_method: body.auth_method, credential_reference: body.credential_reference }
        });
        // endpoint_token is returned once here so the admin can hand
        // it to the network -- it is a URL path segment, not the
        // credential itself, but is still only ever shown through this
        // authenticated admin API, never a public response.
        return success({ id, endpoint_token });
      } catch (error) {
        return failure(error.message, 422);
      }
    }

    if (path === "/api/v1/postback-config/update" && request.method === "PUT") {
      const body = await request.json();
      validate(body, ["id", "account_id", "label", "auth_method", "credential_reference"]);

      const existing = await postbackConfigsDB.getPostbackConfigById(env.DB, body.id);
      if (!existing) return failure("Postback config not found", 404);

      body.updated_by = user.user_id;
      try {
        await postbackConfigsDB.updatePostbackConfig(env.DB, body.id, body);
        await logAudit(env.DB, { userId: user.user_id, action: 'update', entityType: 'postback_config', entityId: body.id, metadata: { account_id: body.account_id, auth_method: body.auth_method } });
        return success();
      } catch (error) {
        return failure(error.message, 422);
      }
    }

    if (path === "/api/v1/postback-config/rotate-token" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      const existing = await postbackConfigsDB.getPostbackConfigById(env.DB, body.id);
      if (!existing) return failure("Postback config not found", 404);

      const endpoint_token = await postbackConfigsDB.rotateEndpointToken(env.DB, body.id, user.user_id);
      await logAudit(env.DB, { userId: user.user_id, action: 'rotate_token', entityType: 'postback_config', entityId: body.id });
      return success({ endpoint_token });
    }

    if (path === "/api/v1/postback-config/archive" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      const existing = await postbackConfigsDB.getPostbackConfigById(env.DB, body.id);
      if (!existing) return failure("Postback config not found", 404);

      await postbackConfigsDB.archivePostbackConfig(env.DB, body.id, user.user_id);
      await logAudit(env.DB, { userId: user.user_id, action: 'archive', entityType: 'postback_config', entityId: body.id });
      return success();
    }

    // The postback testing UI (brief §25): runs the EXACT same
    // ingestPostback() pipeline the live endpoint uses, in dry-run
    // mode (never inserts a conversion row), and returns the same
    // per-step resolution breakdown the admin dashboard's "Test
    // Postback" screen renders as a checklist.
    if (path === "/api/v1/postback-config/test" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);

      const config = await postbackConfigsDB.getPostbackConfigById(env.DB, body.id);
      if (!config) return failure("Postback config not found", 404);

      const normalized = normalizeConversionPayload(body.payload || {}, config.field_mapping_json);
      const validation = validateNormalized(normalized);
      if (!validation.valid) {
        return json({ success: true, outcome: "rejected_validation", errors: validation.errors }, 200);
      }

      const result = await ingestPostback(env.DB, { config, normalized, dryRun: true });
      return json({ success: true, ...result });
    }

  return NOT_HANDLED;
}
