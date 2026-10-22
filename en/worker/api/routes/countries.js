// Countries.
// Part of the admin API. Dispatched in order from worker/api.js (see worker/api/routes/index.js).
import { invalidateCountries, invalidateNav } from "../../cache.js";
import { NOT_HANDLED, failure, json, success, validate } from "../helpers.js";

export async function route({ request, env, path }) {

    // ==================================
    // COUNTRIES CRUD
    // ==================================
    if (path === "/api/v1/country/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["code", "name"]);
      const { createCountry } = await import("../../database/countries.js");
      await createCountry(env.DB, body);
      await invalidateCountries(env);
      await invalidateNav(env);
      return success();
    }

    if (path === "/api/v1/country/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["code", "name"]);
      const { updateCountry } = await import("../../database/countries.js");
      await updateCountry(env.DB, body.code, body);
      await invalidateCountries(env);
      await invalidateNav(env);
      return success();
    }

    if (path === "/api/v1/country/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["code"]);
      const { deleteCountry } = await import("../../database/countries.js");
      await deleteCountry(env.DB, body.code);
      await invalidateCountries(env);
      await invalidateNav(env);
      return success();
    }

    if (path === "/api/v1/countries/list") {
      const result = await env.DB.prepare("SELECT * FROM countries ORDER BY name").all();
      return json({ countries: result.results });
    }

    // ==================================
    // COUNTRY GET BY ID (for edit)
    // ==================================

    if (path === "/api/v1/country/get-by-id" && request.method === "GET") {
      const url = new URL(request.url);
      const id = parseInt(url.searchParams.get("id"));
      if (!id) return failure("id is required");
      const { getCountryById } = await import("../../database/countries.js");
      const country = await getCountryById(env.DB, id);
      if (!country) return failure("Country not found", 404);
      return json({ success: true, country });
    }

    if (path === "/api/v1/country/get-by-code" && request.method === "GET") {
      const url = new URL(request.url);
      const code = url.searchParams.get("code");
      if (!code) return failure("code is required");
      const { getCountry } = await import("../../database/countries.js");
      const country = await getCountry(env.DB, code.toUpperCase());
      if (!country) return failure("Country not found", 404);
      return json({ success: true, country });
    }

  return NOT_HANDLED;
}
