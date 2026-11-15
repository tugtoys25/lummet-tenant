// Provider adapters.
// Part of the admin API. Dispatched in order from worker/api.js (see worker/api/routes/index.js).
import * as affiliateAccounts from "../../database/affiliate-accounts.js";
import { logAudit } from "../../database/audit.js";
import * as providerAdaptersDB from "../../database/provider-adapters.js";
import { syncProviderConfig } from "../../adapters/sync.js";
import { listProviderKeys, getAdapter } from "../../adapters/registry.js";
import { saveAdapterRequest, saveAdapterSettings, clearAdapterKey, withAdapterSettings, describeAdapterSettings } from "../../adapters/credentials.js";
import { compareWithTracked } from "../../adapters/report-mode.js";
import { API_PRESETS } from "../../adapters/api-presets.js";
import { validateNormalized } from "../../postback/field-mapping.js";
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
      const rows = await providerAdaptersDB.listProviderAdapterConfigs(env.DB, { accountId });
      const configs = [];
      for (const c of rows) configs.push({ ...c, ...(await describeAdapterSettings(env, c)) });
      const flag = await env.DB.prepare(`SELECT value FROM system_settings WHERE key = 'provider_sync_cron_enabled'`).first();
      return json({ success: true, configs, available_providers: listProviderKeys(), api_presets: API_PRESETS, auto_sync: flag?.value === 'true' });
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
      validate(body, ["account_id", "label", "provider_key", "api_base_url"]);
      const account = await affiliateAccounts.getAccountById(env.DB, body.account_id);
      if (!account) return failure("Affiliate account not found", 404);

      body.created_by = user.user_id;
      try {
        const id = await providerAdaptersDB.createProviderAdapterConfig(env.DB, body);
        await saveAdapterSettings(env, id, { apiKey: body.api_key, settings: body });
        if (body.http_method || body.body_json || body.paging || body.result_mode) await saveAdapterRequest(env.DB, id, body);
        await logAudit(env.DB, { userId: user.user_id, action: 'create', entityType: 'provider_adapter_config', entityId: id, metadata: { account_id: body.account_id, provider_key: body.provider_key, key_saved: !!body.api_key } });
        return success({ id });
      } catch (error) {
        return failure(error.message, 422);
      }
    }

    if (path === "/api/v1/provider-adapter/update" && request.method === "PUT") {
      const body = await request.json();
      validate(body, ["id", "account_id", "label", "provider_key", "api_base_url"]);
      const existing = await providerAdaptersDB.getProviderAdapterConfigById(env.DB, body.id);
      if (!existing) return failure("Provider adapter config not found", 404);

      body.updated_by = user.user_id;
      try {
        if (!body.credential_reference) body.credential_reference = existing.credential_reference;
        await providerAdaptersDB.updateProviderAdapterConfig(env.DB, body.id, body);
        await saveAdapterSettings(env, body.id, { apiKey: body.api_key, settings: body });
        if (body.http_method || body.body_json || body.paging || body.result_mode) await saveAdapterRequest(env.DB, body.id, body);
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

    // Save or replace the API key (and how it is sent) from the dashboard. The key is write-only: only its last four characters come back.
    if (path === "/api/v1/provider-adapter/secret/set" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      const existing = await providerAdaptersDB.getProviderAdapterConfigById(env.DB, body.id);
      if (!existing) return failure("Provider adapter config not found", 404);
      if (body.clear === true) { await clearAdapterKey(env.DB, body.id); }
      else {
        if (!body.api_key || String(body.api_key).trim().length < 4) return failure("Paste the API key from your affiliate program.", 422);
        try { await saveAdapterSettings(env, body.id, { apiKey: body.api_key, settings: body }); }
        catch (error) { return failure(error.message, 422); }
      }
      await logAudit(env.DB, { userId: user.user_id, action: body.clear === true ? 'clear_key' : 'set_key', entityType: 'provider_adapter_config', entityId: body.id });
      const fresh = await providerAdaptersDB.getProviderAdapterConfigById(env.DB, body.id);
      return json({ success: true, ...(await describeAdapterSettings(env, fresh)) });
    }

    // Real request for the last 24 hours, explained in plain terms; nothing is imported.
    if (path === "/api/v1/provider-adapter/test" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      const config = await providerAdaptersDB.getProviderAdapterConfigById(env.DB, body.id);
      if (!config) return failure("Provider adapter config not found", 404);
      let result;
      try {
        const adapter = getAdapter(config.provider_key, await withAdapterSettings(env, config));
        result = await adapter.testConnection(env);
        if (result.ok && result.recognised) {
          const v = validateNormalized(result.recognised);
          result.mapping_ok = v.valid;
          result.mapping_problems = v.valid ? [] : v.errors;
        }
      } catch (e) { result = { ok: false, stage: 'error', message: e.message || 'Test failed' }; }
      await logAudit(env.DB, { userId: user.user_id, action: 'test_connection', entityType: 'provider_adapter_config', entityId: body.id, metadata: { ok: result.ok, stage: result.stage } });
      return json({ success: true, result });
    }

    // Turns the scheduled pull on or off for this site (it is off until someone chooses to run it).
    if (path === "/api/v1/provider-adapters/auto-sync" && request.method === "POST") {
      const body = await request.json();
      await env.DB.prepare(`INSERT INTO system_settings (key, value) VALUES ('provider_sync_cron_enabled', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`).bind(body.enabled === true ? 'true' : 'false').run();
      await logAudit(env.DB, { userId: user.user_id, action: 'auto_sync', entityType: 'provider_adapter_config', entityId: 0, metadata: { enabled: body.enabled === true } });
      return json({ success: true, auto_sync: body.enabled === true });
    }

    // Totals the program reports (report-style integrations) beside what this site tracked, by day.
    if (path === "/api/v1/provider-adapter/report" && request.method === "GET") {
      const id = parseInt(new URL(request.url).searchParams.get("id"), 10);
      const config = id ? await providerAdaptersDB.getProviderAdapterConfigById(env.DB, id) : null;
      if (!config) return failure("Provider adapter config not found", 404);
      return json({ success: true, rows: await compareWithTracked(env.DB, config) });
    }

  return NOT_HANDLED;
}
