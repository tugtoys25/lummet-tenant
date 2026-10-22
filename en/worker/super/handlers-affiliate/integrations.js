import * as postbackConfigsDB from "../../database/postback-configs.js";
import * as providerAdaptersDB from "../../database/provider-adapters.js";
import * as importBatchesDB from "../../database/import-batches.js";
import { created, fail, ok, readJsonBody } from "./shared.js";

// =====================================================
// POSTBACK CONFIGS
//
// Deliberately admin-only on the tenant's own dashboard -- migration
// 0033_conversion_postback.sql creates no editor permission rows for
// this resource at all (verified: unlike payment_methods, tracking-
// links etc., there is no 'editor' row for 'postback_configs' in any
// migration). Exposed here the same way every other resource already
// is (the Super API's whole model is a single trusted, tenant-wide
// credential -- see handlers-analytics.js's header for the same
// point made explicitly about analytics), but the control plane's
// OWN page for this should stay super-admin-gated rather than
// delegated through the ordinary permission matrix, to actually
// honor the tenant's "no editor access" intent rather than route
// around it.
//
// Never accepts/returns a plaintext secret -- credential_reference is
// a pointer to a Cloudflare secret binding name (see
// postback-configs.js header). endpoint_token IS returned (needed
// operationally to configure the postback URL on the affiliate
// network's side) -- it's an unguessable URL path segment, not a
// credential; rotateEndpointToken() is the recovery path if it leaks.
// =====================================================

export async function handleListPostbackConfigs(request, env) {
  const url = new URL(request.url);
  const rows = await postbackConfigsDB.listPostbackConfigs(env.DB, {
    accountId: url.searchParams.get("account_id") ? Number(url.searchParams.get("account_id")) : null,
    status: url.searchParams.get("status") || null,
  });
  return ok({ data: rows });
}

export async function handleGetPostbackConfig(request, env, id) {
  const row = await postbackConfigsDB.getPostbackConfigById(env.DB, Number(id));
  if (!row) return fail("not_found", 404);
  return ok({ data: row });
}

export async function handleCreatePostbackConfig(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    const result = await postbackConfigsDB.createPostbackConfig(env.DB, body);
    return created({ data: result });
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

export async function handleUpdatePostbackConfig(request, env, id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    const existing = await postbackConfigsDB.getPostbackConfigById(env.DB, Number(id));
    if (!existing) return fail("not_found", 404);
    await postbackConfigsDB.updatePostbackConfig(env.DB, Number(id), body);
    return ok();
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

export async function handleRotatePostbackToken(request, env, id) {
  const existing = await postbackConfigsDB.getPostbackConfigById(env.DB, Number(id));
  if (!existing) return fail("not_found", 404);
  const newToken = await postbackConfigsDB.rotateEndpointToken(env.DB, Number(id));
  return ok({ data: { endpoint_token: newToken } });
}

// "Delete" is archive (status='disabled') -- there is no hard-delete
// function in postback-configs.js, matching offers/tracking-links'
// own no-hard-delete convention for anything with attribution history.
export async function handleArchivePostbackConfig(request, env, id) {
  const existing = await postbackConfigsDB.getPostbackConfigById(env.DB, Number(id));
  if (!existing) return fail("not_found", 404);
  await postbackConfigsDB.archivePostbackConfig(env.DB, Number(id));
  return ok();
}

// =====================================================
// PROVIDER ADAPTER CONFIGS
// Same credential-pointer discipline as postback configs above (see
// provider-adapters.js header). Unlike postback configs, this one DID
// have "no editor rows" noted only for postback_configs specifically
// in the original audit -- but grepping migrations turns up no
// 'editor' + 'provider_adapter_configs' row either, so treating it
// with the same super-admin-only caution here rather than assuming
// wider access than the tenant itself grants.
// =====================================================

export async function handleListProviderAdapters(request, env) {
  const url = new URL(request.url);
  const rows = await providerAdaptersDB.listProviderAdapterConfigs(env.DB, {
    accountId: url.searchParams.get("account_id") ? Number(url.searchParams.get("account_id")) : null,
  });
  return ok({ data: rows });
}

export async function handleGetProviderAdapter(request, env, id) {
  const row = await providerAdaptersDB.getProviderAdapterConfigById(env.DB, Number(id));
  if (!row) return fail("not_found", 404);
  return ok({ data: row });
}

export async function handleCreateProviderAdapter(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    const id = await providerAdaptersDB.createProviderAdapterConfig(env.DB, body);
    return created({ data: { id } });
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

export async function handleUpdateProviderAdapter(request, env, id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    const existing = await providerAdaptersDB.getProviderAdapterConfigById(env.DB, Number(id));
    if (!existing) return fail("not_found", 404);
    await providerAdaptersDB.updateProviderAdapterConfig(env.DB, Number(id), body);
    return ok();
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

export async function handleArchiveProviderAdapter(request, env, id) {
  const existing = await providerAdaptersDB.getProviderAdapterConfigById(env.DB, Number(id));
  if (!existing) return fail("not_found", 404);
  await providerAdaptersDB.archiveProviderAdapterConfig(env.DB, Number(id));
  return ok();
}

// =====================================================
// IMPORT BATCHES (read-only history)
//
// createImportBatch/finalizeImportBatch are called BY the import
// pipeline itself as a bulk import actually runs (see their
// signatures: totalRows/importedCount/duplicateCount/errors are
// pipeline output, not admin-supplied form fields) -- there is no
// "manually create an import batch" action for an admin to take, on
// the tenant dashboard or here. This is intentionally list-only,
// matching the tenant nav's own label: "Import History".
// =====================================================

export async function handleListImportBatches(request, env) {
  const url = new URL(request.url);
  const rows = await importBatchesDB.listImportBatches(env.DB, {
    accountId: url.searchParams.get("account_id") ? Number(url.searchParams.get("account_id")) : null,
    limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 50,
  });
  return ok({ data: rows });
}

export async function handleGetImportBatch(request, env, id) {
  const row = await importBatchesDB.getImportBatchById(env.DB, Number(id));
  if (!row) return fail("not_found", 404);
  return ok({ data: row });
}
