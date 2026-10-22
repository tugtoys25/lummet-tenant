// Authors.
// Part of the admin API. Dispatched in order from worker/api.js (see worker/api/routes/index.js).
import * as authorsDB from "../../database/authors.js";
import { NOT_HANDLED, failure, json, success, validate } from "../helpers.js";

export async function route({ request, env, path }) {
    // ==================================
    // AUTHORS CRUD
    // ==================================

    if (path === "/api/v1/authors/list") {
      const result = await authorsDB.getAllAuthorsAdmin(env.DB);
      return json({ authors: result });
    }

    if (path === "/api/v1/author/get" && request.method === "GET") {
      const url = new URL(request.url);
      const id = parseInt(url.searchParams.get("id"));
      if (!id) return failure("id is required");
      const author = await authorsDB.getAuthorById(env.DB, id);
      if (!author) return failure("Author not found", 404);
      return json({ success: true, author });
    }

    if (path === "/api/v1/author/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["slug", "name"]);
      const id = await authorsDB.createAuthor(env.DB, body);
      return json({ success: true, id });
    }

    if (path === "/api/v1/author/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "slug", "name"]);
      await authorsDB.updateAuthor(env.DB, body.id, body);
      return success();
    }

    if (path === "/api/v1/author/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      await authorsDB.deleteAuthor(env.DB, body.id);
      return success();
    }

    if (path === "/api/v1/author/content" && request.method === "GET") {
      const url = new URL(request.url);
      const id = parseInt(url.searchParams.get("id"));
      if (!id) return failure("id is required");
      const content = await authorsDB.getAuthorContent(env.DB, id);
      const stats = await authorsDB.getAuthorStats(env.DB, id);
      return json({ content, stats });
    }

  return NOT_HANDLED;
}
