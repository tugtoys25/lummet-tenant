// Provider adapters.
// Part of the admin API. Dispatched in order from worker/api.js (see worker/api/routes/index.js).
import * as affiliateAccounts from "../../database/affiliate-accounts.js";
import { logAudit } from "../../database/audit.js";
import * as providerAdaptersDB from "../../database/provider-adapters.js";
import { syncProviderConfig } from "../../adapters/sync.js";
import { listProviderKeys } from "../../adapters/registry.js";
import * as cronHealthDB from "../../database/cron-health.js";
import { NOT_HANDLED, failure, json, success, validate } from "../helpers.js";

export async function route({ request, env, path, user }) {

    // ==================================
    // PROVIDER API ADAPTERS (brief §10) -- outbound pull integrations.
    // Admin-only, same reasoning as postback_configs (holds a
    // credential_reference pointer).
    // ==================================

    if (path === "/api/v1/provider-adapters/list") {
      const url = new URL(request.url);
      const accountId = url.searchParams.get("account_id") ? Number(url.searchParams.get("account_id")) : null;
      const configs = await providerAdaptersDB.listProviderAdapterConfigs(env.DB, { accountId });
      return json({ success: true, configs, available_providers: listProviderKeys() });
    }

    if (path === "/api/v1/provider-adapter/get") {
      const url = new URL(request.url);
      const id = Number(url.searchParams.get("id"));
      if (!id) return failure("id is required");
      const config = await providerAdaptersDB.getProviderAdapterConfigById(env.DB, id);
      if (!config) return failure("Provider adapter config not found", 404);
      return json({ success: true, config });
    }

    if (path === "/api/v1/provider-adapter/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["account_id", "label", "provider_key", "api_base_url", "credential_reference"]);
      const account = await affiliateAccounts.getAccountById(env.DB, body.account_id);
      if (!account) return failure("Affiliate account not found", 404);

      body.created_by = user.user_id;
      try {
        const id = await providerAdaptersDB.createProviderAdapterConfig(env.DB, body);
        await logAudit(env.DB, { userId: user.user_id, action: 'create', entityType: 'provider_adapter_config', entityId: id, metadata: { account_id: body.account_id, provider_key: body.provider_key, credential_reference: body.credential_reference } });
        return success({ id });
      } catch (error) {
        return failure(error.message, 422);
      }
    }

    if (path === "/api/v1/provider-adapter/update" && request.method === "PUT") {
      const body = await request.json();
      validate(body, ["id", "account_id", "label", "provider_key", "api_base_url", "credential_reference"]);
      const existing = await providerAdaptersDB.getProviderAdapterConfigById(env.DB, body.id);
      if (!existing) return failure("Provider adapter config not found", 404);

      body.updated_by = user.user_id;
      try {
        await providerAdaptersDB.updateProviderAdapterConfig(env.DB, body.id, body);
        await logAudit(env.DB, { userId: user.user_id, action: 'update', entityType: 'provider_adapter_config', entityId: body.id, metadata: { account_id: body.account_id, provider_key: body.provider_key } });
        return success();
      } catch (error) {
        return failure(error.message, 422);
      }
    }

    if (path === "/api/v1/provider-adapter/archive" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      const existing = await providerAdaptersDB.getProviderAdapterConfigById(env.DB, body.id);
      if (!existing) return failure("Provider adapter config not found", 404);
      await providerAdaptersDB.archiveProviderAdapterConfig(env.DB, body.id, user.user_id);
      await logAudit(env.DB, { userId: user.user_id, action: 'archive', entityType: 'provider_adapter_config', entityId: body.id });
      return success();
    }

    // Manual "sync now" -- runs the real adapter (a genuine outbound
    // network call, unlike the postback test tool's dry run) so an
    // admin can verify a freshly-configured integration works without
    // waiting for the cron window. Still respects the feature flag's
    // SPIRIT even though it bypasses the flag itself: it only ever
    // touches the ONE config the admin explicitly requested, not every
    // due config the way the cron job would.
    if (path === "/api/v1/provider-adapter/sync-now" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      const config = await providerAdaptersDB.getProviderAdapterConfigById(env.DB, body.id);
      if (!config) return failure("Provider adapter config not found", 404);
      if (config.status !== "active") return failure("Cannot sync a disabled integration", 422);

      const result = await syncProviderConfig(env.DB, env, config);
      await cronHealthDB.recordCronRun(env.DB, 'provider_sync', { skipped: false, synced: 1 });
      await logAudit(env.DB, { userId: user.user_id, action: 'sync_now', entityType: 'provider_adapter_config', entityId: body.id, metadata: { ok: result.ok, imported: result.importedCount } });
      return json({ success: true, ...result });
    }

  return NOT_HANDLED;
}
