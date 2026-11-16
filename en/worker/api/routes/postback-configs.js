// Postback configurations.
// Part of the admin API. Dispatched in order from worker/api.js (see worker/api/routes/index.js).
import * as affiliateAccounts from "../../database/affiliate-accounts.js";
import { logAudit } from "../../database/audit.js";
import * as postbackConfigsDB from "../../database/postback-configs.js";
import { ingestPostback } from "../../postback/ingest.js";
import { verifyPostbackAuth, canonicalQuery } from "../../postback/auth.js";
import { normalizeConversionPayload, validateNormalized } from "../../postback/field-mapping.js";
import { quickSetup, programOverview, casinoGroups, applyHandoffToProgram } from "../../postback/quick-setup.js";
import { listPresets, getPreset, buildPostbackSetup, validateCustomDefinition } from "../../postback/presets.js";
import { getPostbackSecret, setPostbackSecret, managedSecretIds, MANAGED } from "../../postback/secrets.js";
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
      const managed = await managedSecretIds(env.DB);
      for (const c of configs) c.secret_managed = managed.has(c.id);
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
      // No Worker secret is needed any more: unless the admin names an existing one, the secret is generated and kept by the site.
      if (!body.credential_reference) body.credential_reference = MANAGED;
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
        let secret = null;
        if (body.credential_reference === MANAGED) {
          secret = await setPostbackSecret(env, id);
          await logAudit(env.DB, { userId: user.user_id, action: 'create_secret', entityType: 'postback_config', entityId: id });
        }
        return success({ id, endpoint_token, secret });
      } catch (error) {
        return failure(error.message, 422);
      }
    }

    if (path === "/api/v1/postback-config/update" && request.method === "PUT") {
      const body = await request.json();
      validate(body, ["id", "account_id", "label", "auth_method"]);

      const existing = await postbackConfigsDB.getPostbackConfigById(env.DB, body.id);
      if (!existing) return failure("Postback config not found", 404);
      if (!body.credential_reference) body.credential_reference = existing.credential_reference || MANAGED;

      body.updated_by = user.user_id;
      try {
        await postbackConfigsDB.updatePostbackConfig(env.DB, body.id, body);
        await logAudit(env.DB, { userId: user.user_id, action: 'update', entityType: 'postback_config', entityId: body.id, metadata: { account_id: body.account_id, auth_method: body.auth_method } });
        return success();
      } catch (error) {
        return failure(error.message, 422);
      }
    }

    // Secrets kept by the site itself. "reveal" lets the admin copy the URL again later; "set" generates a new one (or stores one the
    // program dictates) and immediately makes the old one stop working.
    if (path === "/api/v1/postback-config/secret/reveal" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      const config = await postbackConfigsDB.getPostbackConfigById(env.DB, body.id);
      if (!config) return failure("Postback config not found", 404);
      const secret = await getPostbackSecret(env, config);
      if (!secret) return failure("This integration has no secret yet. Generate one.", 404);
      await logAudit(env.DB, { userId: user.user_id, action: 'reveal_secret', entityType: 'postback_config', entityId: config.id });
      return success({ secret });
    }

    if (path === "/api/v1/postback-config/secret/set" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      const config = await postbackConfigsDB.getPostbackConfigById(env.DB, body.id);
      if (!config) return failure("Postback config not found", 404);
      const custom = body.secret ? String(body.secret).trim() : null;
      if (custom && (custom.length < 12 || custom.length > 200 || /\s/.test(custom))) return failure("A secret you choose must be 12 to 200 characters with no spaces.", 422);
      const secret = await setPostbackSecret(env, config.id, custom);
      await postbackConfigsDB.updatePostbackConfig(env.DB, config.id, { ...config, credential_reference: MANAGED, updated_by: user.user_id });
      await logAudit(env.DB, { userId: user.user_id, action: 'rotate_secret', entityType: 'postback_config', entityId: config.id });
      return success({ secret });
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

    // Connect-a-program wizard: the preset catalogue, and the exact URLs / mapping for a chosen preset or a custom definition.
    if (path === "/api/v1/postback-config/presets" && request.method === "GET") {
      return json({ success: true, presets: listPresets() });
    }

    if (path === "/api/v1/postback-config/build" && request.method === "POST") {
      const body = await request.json();
      let preset = null; let custom = null;
      if (body.preset_id) {
        preset = getPreset(body.preset_id);
        if (!preset) return failure("Unknown preset", 404);
      } else {
        const checked = validateCustomDefinition(body.custom || {});
        if (checked.errors.length) return failure(checked.errors.join(" "), 422);
        custom = checked.value;
      }
      let token = null;
      if (body.config_id) {
        const config = await postbackConfigsDB.getPostbackConfigById(env.DB, body.config_id);
        if (!config) return failure("Postback config not found", 404);
        token = config.endpoint_token;
      }
      const setup = buildPostbackSetup({ origin: new URL(request.url).origin, token, preset, custom, secretPlaceholder: body.secret_placeholder === false ? null : "YOUR_SECRET" });
      return json({ success: true, setup });
    }

    // What exists already (programs with counts, casinos grouped by affiliate domain), so the wizard can reuse before creating.
    if (path === "/api/v1/postback-config/program-overview" && request.method === "GET") {
      return json({ success: true, programs: await programOverview(env.DB), casino_groups: await casinoGroups(env.DB) });
    }

    // Puts one click-ID name on every active tracking link of a program.
    if (path === "/api/v1/postback-config/apply-handoff" && request.method === "POST") {
      const body = await request.json();
      const param = String(body.click_id_param || "").trim();
      if (!body.program_id || !/^[A-Za-z0-9_.-]{1,40}$/.test(param)) return failure("A program and a click-ID name (letters, digits, _ . -) are needed.", 422);
      const n = await applyHandoffToProgram(env.DB, Number(body.program_id), param);
      await logAudit(env.DB, { userId: user.user_id, action: 'apply_handoff', entityType: 'affiliate_program', entityId: Number(body.program_id), metadata: { click_id_param: param, links: n } });
      return success({ links_updated: n });
    }

    // One step for a casino that only has its own affiliate URL: finds or creates the program, account and tracking link the integration needs.
    if (path === "/api/v1/postback-config/quick-setup" && request.method === "POST") {
      const body = await request.json();
      const preset = body.preset_id && body.preset_id !== "custom" ? getPreset(body.preset_id) : null;
      if (body.preset_id && body.preset_id !== "custom" && !preset) return failure("Unknown preset", 404);
      try {
        const result = await quickSetup(env.DB, {
          programName: body.program_name || preset?.name, programId: body.program_id ? Number(body.program_id) : null,
          casinoId: body.casino_id ? Number(body.casino_id) : null, casinoIds: Array.isArray(body.casino_ids) ? body.casino_ids.map(Number).filter(Boolean).slice(0, 100) : [], clickIdParam: body.click_id_param || preset?.click_id_param || null, userId: user.user_id
        });
        await logAudit(env.DB, { userId: user.user_id, action: 'quick_setup', entityType: 'postback_config', entityId: result.account_id, metadata: { created: result.created, casino_id: body.casino_id || null, casino_ids: body.casino_ids || null } });
        return success(result);
      } catch (e) { return failure(e.message || "Could not set this up", 422); }
    }

    // Live log: the most recent postback attempts (accepted, updated, duplicate, unattributed, rejected ...) so an operator can see
    // at once whether a program is really calling and why a call was refused.
    if (path === "/api/v1/postback-logs/list") {
      const url = new URL(request.url);
      const configId = url.searchParams.get("config_id") ? Number(url.searchParams.get("config_id")) : null;
      const outcome = url.searchParams.get("outcome") || null;
      const logs = await postbackConfigsDB.listPostbackLogs(env.DB, { configId, outcome, limit: url.searchParams.get("limit") });
      return json({ success: true, logs });
    }

    // End-to-end check of the part the plain test above skips: is the secret binding present, and does a request signed the way this
    // config says it should be signed pass the REAL verifier? Nothing is written. Shows up credential_not_configured (the usual
    // "nobody ran wrangler secret put" problem) before a program's first real postback fails with a bare 401.
    if (path === "/api/v1/postback-config/live-test" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      const config = await postbackConfigsDB.getPostbackConfigById(env.DB, body.id);
      if (!config) return failure("Postback config not found", 404);

      const secret = await getPostbackSecret(env, config);
      const params = { click_id: body.click_id || "live-test", event: "ftd", amount: "10", currency: "USD", transaction_id: `live-test-${Date.now()}` };
      let sourceIp = null;
      try { const ips = config.allowed_ips ? JSON.parse(config.allowed_ips) : []; sourceIp = ips.length && !String(ips[0]).includes("/") ? ips[0] : null; } catch { sourceIp = null; }
      if (config.timestamp_param) params[config.timestamp_param] = String(Math.floor(Date.now() / 1000));

      const steps = { secret_binding_present: !!secret, ip_allowlist_configured: !!config.allowed_ips };
      if (secret) {
        const sig = config.signature_param || "signature";
        if (config.auth_method === "shared_secret" || config.auth_method === "api_key") params[sig] = secret;
        else {
          const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
          const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(canonicalQuery(params, sig)));
          params[sig] = Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, "0")).join("");
        }
      }
      const auth = await verifyPostbackAuth(env, config, { rawParams: params, rawBody: "", sourceIp });
      steps.auth_passes = auth.valid;
      const hint = auth.valid ? null
        : auth.reason === "credential_not_configured" ? "This integration has no secret yet. Open it and choose Generate secret."
        : auth.reason === "ip_allowlist_invalid" ? "The allowed-IP list is not valid JSON."
        : "Authentication failed with a request signed by this site's own rules; check the signature parameter name and method.";
      const normalized = normalizeConversionPayload(params, config.field_mapping_json);
      const dry = auth.valid ? await ingestPostback(env.DB, { config, normalized, dryRun: true }) : null;
      return json({ success: true, auth_valid: auth.valid, reason: auth.reason || null, hint, steps, ingest: dry });
    }

  return NOT_HANDLED;
}
