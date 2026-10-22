// Signed-in routes handled outside the main route groups: dashboard, AI Studio, Geo Manager.
import * as geo from "../database/geo.js";
import { dashboardStatsAPI } from "../controllers.js";
import * as permDB from "../database/permissions.js";
import { NOT_HANDLED, failure, json } from "./helpers.js";

export async function platformRoutes({ request, env, path, user, userPermissions }) {

if (path === "/api/v1/dashboard") {
  return dashboardStatsAPI(request, env);
}

if (path.startsWith("/api/v1/ai-studio/")) {
  const { handleAiStudio } = await import("../ai/studio.js");
  return handleAiStudio(request, env, path, (resource, action) => permDB.checkPermission(userPermissions, resource, action), user);
}

if (path.startsWith("/api/v1/geo-manager/")) {
  const { handleGeoManager } = await import("../geo-manager.js");
  return handleGeoManager(request, env, path, (resource, action) => permDB.checkPermission(userPermissions, resource, action));
}

if (path === "/api/v1/old/geo/check") {
    const url = new URL(request.url);
    const slug = url.searchParams.get("slug");
    if (!slug) return failure("slug is required");

    const country = request.cf?.country || null;
    const rule = await geo.getGeoRule(env.DB, slug, country);

    if (rule) {
      return json({
        status: rule.status,
        country,
        bonusOverride: rule.bonus_override || null
      });
    }

    return json({
      status: "allowed",
      country,
      bonusOverride: null
    });
  }

  return NOT_HANDLED;
}
