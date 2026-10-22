// Dashboard statistics.
// Part of the admin API. Dispatched in order from worker/api.js (see worker/api/routes/index.js).
import { NOT_HANDLED, json } from "../helpers.js";

export async function route({ env, path }) {

// Get stats (already exists but move here for consistency)
if (path === "/api/v1/stats") {
  const casinos = await env.DB.prepare("SELECT COUNT(*) c FROM casinos").first();
  const reviews = await env.DB.prepare("SELECT COUNT(*) c FROM reviews").first();
  const clicks = await env.DB.prepare("SELECT COUNT(*) c FROM clicks").first();
  const pages = await env.DB.prepare("SELECT COUNT(*) c FROM pages").first();
  return json({
    casinos: casinos.c,
    reviews: reviews.c,
    clicks: clicks.c,
    pages: pages.c
  });
}
if (path === "/api/v1/stats/top-casinos") {
    const result = await env.DB.prepare(`
      SELECT casino_slug, COUNT(*) as clicks
      FROM clicks
      GROUP BY casino_slug
      ORDER BY clicks DESC
      LIMIT 20
    `).all();
    return json({ casinos: result.results });
  }

  if (path === "/api/v1/stats/countries") {
    const result = await env.DB.prepare(`
      SELECT country_code, COUNT(*) as clicks
      FROM clicks
      GROUP BY country_code
      ORDER BY clicks DESC
      LIMIT 100
    `).all();
    return json({ countries: result.results });
  }

  return NOT_HANDLED;
}
