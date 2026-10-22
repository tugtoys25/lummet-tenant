// =====================================================
// ADMIN + PUBLIC API  (/api/v1/*)
//
// This file only decides the order things happen in:
//   1. routes that work without signing in      -> api/public.js
//   2. sign-in and role permission checks        -> api/gate.js
//   3. dashboard, AI Studio, Geo Manager         -> api/platform.js
//   4. every other route, grouped by area        -> api/routes/*.js
// To add or change an endpoint, edit the group for its area (see docs/ARCHITECTURE_API.md).
// =====================================================
import { json, NOT_HANDLED } from "./api/helpers.js";
import { publicRoutes } from "./api/public.js";
import { authorize } from "./api/gate.js";
import { platformRoutes } from "./api/platform.js";
import { ROUTE_GROUPS } from "./api/routes/index.js";

export async function handleAPI(
  request,
  env,
  path,
  user = null
) {
  const early = await publicRoutes({ request, env, path, user });
  if (early !== NOT_HANDLED) return early;

  const gate = await authorize(request, env, path, user);
  if (gate.response) return gate.response;
  const { userPermissions } = gate;

  const platform = await platformRoutes({ request, env, path, user, userPermissions });
  if (platform !== NOT_HANDLED) return platform;

  try {
    const ctx = { request, env, path, user, userPermissions };
    for (const group of ROUTE_GROUPS) {
      const result = await group(ctx);
      if (result !== NOT_HANDLED) return result;
    }

    return json({
      success: false,
      error: "Endpoint not found"
    }, 404);
  } catch (error) {

    return json({
      success: false,
      error: error.message
    }, 500);

  }
}
