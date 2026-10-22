// Banners.
// Part of the admin API. Dispatched in order from worker/api.js (see worker/api/routes/index.js).
import * as bannerDB from "../../database/banners.js";
import { NOT_HANDLED, json, success, validate } from "../helpers.js";

export async function route({ request, env, path }) {

        // ==================================
    // BANNERS CRUD
    // ==================================

    if (path === "/api/v1/banners/list") {
      const result = await bannerDB.getAllBanners(env.DB);
      return json({ banners: result });
    }

    if (path === "/api/v1/banner/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["title"]);
      const id = await bannerDB.createBanner(env.DB, body);
      return json({ success: true, id });
    }

    if (path === "/api/v1/banner/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      await bannerDB.updateBanner(env.DB, body.id, body);
      return success();
    }

    if (path === "/api/v1/banner/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      await bannerDB.deleteBanner(env.DB, body.id);
      return success();
    }

  return NOT_HANDLED;
}
