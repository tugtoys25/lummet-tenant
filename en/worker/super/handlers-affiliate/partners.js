import * as partnersDB from "../../database/affiliate-partners.js";
import * as programsDB from "../../database/affiliate-programs.js";
import * as accountsDB from "../../database/affiliate-accounts.js";
import * as offersDB from "../../database/offers.js";
import * as trackingLinksDB from "../../database/tracking-links.js";
import { created, fail, ok, readJsonBody, validateRequired } from "./shared.js";

// =====================================================
// AFFILIATE PARTNERS
// =====================================================

export async function handleListPartners(request, env) {
  const url = new URL(request.url);
  const rows = await partnersDB.getAllPartnersAdmin(env.DB, {
    status: url.searchParams.get("status") || null,
    search: url.searchParams.get("search") || null,
  });
  return ok({ data: rows });
}

export async function handleGetPartner(request, env, id) {
  const row = await partnersDB.getPartnerById(env.DB, Number(id));
  if (!row) return fail("not_found", 404);
  row.contacts = await partnersDB.getPartnerContacts(env.DB, row.id);
  return ok({ data: row });
}

export async function handleCreatePartner(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    validateRequired(body, ["name"]);
    body.slug = body.slug || await partnersDB.generateUniquePartnerSlug(env.DB, body.name);
    const id = await partnersDB.createPartner(env.DB, body);
    return created({ data: { id } });
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

export async function handleUpdatePartner(request, env, id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    validateRequired(body, ["name"]);
    const existing = await partnersDB.getPartnerById(env.DB, Number(id));
    if (!existing) return fail("not_found", 404);
    body.slug = body.slug || existing.slug;
    await partnersDB.updatePartner(env.DB, Number(id), body);
    return ok();
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

export async function handleDeletePartner(request, env, id) {
  const dependents = await partnersDB.getPartnerDependents(env.DB, Number(id));
  if (dependents) {
    return fail(`Cannot delete: ${dependents.programs} affiliate program(s) attached. Archive instead.`, 409);
  }
  const trackingDependents = await trackingLinksDB.getPartnerTrackingLinkDependents(env.DB, Number(id));
  if (trackingDependents) {
    return fail(`Cannot delete: ${trackingDependents.tracking_links} tracking link(s) attached. Archive instead.`, 409);
  }
  await partnersDB.deletePartner(env.DB, Number(id));
  return ok();
}

// =====================================================
// AFFILIATE PROGRAMS
// =====================================================

export async function handleListPrograms(request, env) {
  const url = new URL(request.url);
  const rows = await programsDB.getAllProgramsAdmin(env.DB, {
    partnerId: url.searchParams.get("partner_id") ? Number(url.searchParams.get("partner_id")) : null,
    status: url.searchParams.get("status") || null,
    search: url.searchParams.get("search") || null,
  });
  return ok({ data: rows });
}

export async function handleGetProgram(request, env, id) {
  const row = await programsDB.getProgramById(env.DB, Number(id));
  if (!row) return fail("not_found", 404);
  // casino_ids alongside the record, same virtual-field pattern
  // handlers.js already uses for casinos.category_ids/geo_rules.
  const casinos = await programsDB.getProgramCasinos(env.DB, row.id);
  row.casino_ids = casinos.map((c) => c.id);
  row.casinos = casinos;
  return ok({ data: row });
}

export async function handleCreateProgram(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    validateRequired(body, ["partner_id", "name"]);
    const partner = await partnersDB.getPartnerById(env.DB, Number(body.partner_id));
    if (!partner) return fail("partner_id does not reference an existing affiliate partner", 422);
    const id = await programsDB.createProgram(env.DB, body);
    if (Array.isArray(body.casino_ids)) {
      await programsDB.setProgramCasinos(env.DB, id, body.casino_ids);
    }
    return created({ data: { id } });
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

export async function handleUpdateProgram(request, env, id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    validateRequired(body, ["name"]);
    const existing = await programsDB.getProgramById(env.DB, Number(id));
    if (!existing) return fail("not_found", 404);
    await programsDB.updateProgram(env.DB, Number(id), body);
    if (Array.isArray(body.casino_ids)) {
      await programsDB.setProgramCasinos(env.DB, Number(id), body.casino_ids);
    }
    return ok();
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

export async function handleDeleteProgram(request, env, id) {
  const dependents = await programsDB.getProgramDependents(env.DB, Number(id));
  if (dependents) {
    const parts = Object.entries(dependents).map(([k, v]) => `${v} ${k}`).join(", ");
    return fail(`Cannot delete: ${parts} attached. Archive instead.`, 409);
  }
  const offerDependents = await offersDB.getProgramOfferDependents(env.DB, Number(id));
  if (offerDependents) return fail(`Cannot delete: ${offerDependents.offers} offer(s) attached. Archive instead.`, 409);
  const trackingDependents = await trackingLinksDB.getProgramTrackingLinkDependents(env.DB, Number(id));
  if (trackingDependents) return fail(`Cannot delete: ${trackingDependents.tracking_links} tracking link(s) attached. Archive instead.`, 409);

  await programsDB.deleteProgram(env.DB, Number(id));
  return ok();
}

// =====================================================
// AFFILIATE ACCOUNTS
// =====================================================

export async function handleListAccounts(request, env) {
  const url = new URL(request.url);
  const rows = await accountsDB.getAllAccountsAdmin(env.DB, {
    programId: url.searchParams.get("program_id") ? Number(url.searchParams.get("program_id")) : null,
    status: url.searchParams.get("status") || null,
    search: url.searchParams.get("search") || null,
  });
  return ok({ data: rows });
}

export async function handleGetAccount(request, env, id) {
  const row = await accountsDB.getAccountById(env.DB, Number(id));
  if (!row) return fail("not_found", 404);
  return ok({ data: row });
}

export async function handleCreateAccount(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    validateRequired(body, ["program_id", "account_name"]);
    const program = await programsDB.getProgramById(env.DB, Number(body.program_id));
    if (!program) return fail("program_id does not reference an existing affiliate program", 422);
    const id = await accountsDB.createAccount(env.DB, body);
    return created({ data: { id } });
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

export async function handleUpdateAccount(request, env, id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    validateRequired(body, ["account_name"]);
    const existing = await accountsDB.getAccountById(env.DB, Number(id));
    if (!existing) return fail("not_found", 404);
    await accountsDB.updateAccount(env.DB, Number(id), body);
    return ok();
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

export async function handleDeleteAccount(request, env, id) {
  const dependents = await accountsDB.getAccountDependents(env.DB, Number(id));
  if (dependents) return fail(`Cannot delete: ${dependents.commercial_terms} commercial term(s) attached. Archive instead.`, 409);
  await accountsDB.deleteAccount(env.DB, Number(id));
  return ok();
}
