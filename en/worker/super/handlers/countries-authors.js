import * as countriesDB from "../../database/countries.js";
import * as authorsDB from "../../database/authors.js";
import { created, fail, ok, readJsonBody } from "./helpers.js";

// =====================================================
// COUNTRIES
// =====================================================

export async function handleListCountries(request, env) {
  const rows = await countriesDB.getAllCountries(env.DB);
  return ok({ data: rows });
}

export async function handleGetCountry(request, env, code) {
  const row = await countriesDB.getCountry(env.DB, code);
  if (!row) return fail("not_found", 404);
  return ok({ data: row });
}

export async function handleCreateCountry(request, env, _code, bodyText) {
  const body = await readJsonBody(request, bodyText);
  const id = await countriesDB.createCountry(env.DB, body);
  return created({ data: { id } });
}

export async function handleUpdateCountry(request, env, code, bodyText) {
  const body = await readJsonBody(request, bodyText);
  await countriesDB.updateCountry(env.DB, code, body);
  return ok();
}

export async function handleDeleteCountry(request, env, code) {
  await countriesDB.deleteCountry(env.DB, code);
  return ok();
}

// =====================================================
// AUTHORS
// =====================================================

export async function handleListAuthors(request, env) {
  const rows = await authorsDB.getAllAuthorsAdmin(env.DB);
  return ok({ data: rows });
}

export async function handleGetAuthor(request, env, id) {
  const row = await authorsDB.getAuthorById(env.DB, id);
  if (!row) return fail("not_found", 404);
  return ok({ data: row });
}

export async function handleCreateAuthor(request, env, _slug, bodyText) {
  const body = await readJsonBody(request, bodyText);
  const id = await authorsDB.createAuthor(env.DB, body);
  return created({ data: { id } });
}

export async function handleUpdateAuthor(request, env, id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  await authorsDB.updateAuthor(env.DB, id, body);
  return ok();
}

export async function handleDeleteAuthor(request, env, id) {
  await authorsDB.deleteAuthor(env.DB, id);
  return ok();
}
