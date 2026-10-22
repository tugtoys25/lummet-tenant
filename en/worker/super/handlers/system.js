import { getSiteContext } from "../../site-context.js";
import { SUPER_API_VERSION, getCapabilities } from "../capabilities.js";
import { fail, ok } from "./helpers.js";

// =====================================================
// HANDSHAKE / HEALTH / CAPABILITIES
// =====================================================

export async function handleHandshake(request, env) {
  const site = await getSiteContext(request, env);

  return ok({
    platform: "levelcasino-cms",
    host: site.hostname,
    site_name: site.siteName,
    deployment_id: env.DEPLOYMENT_ID || site.hostname,
    api_version: SUPER_API_VERSION,
    capabilities: Object.keys(getCapabilities()).filter(
      (k) => getCapabilities()[k]
    )
  });
}

export async function handleHealth(request, env) {
  try {
    await env.DB.prepare("SELECT 1").first();
    return ok({ status: "online" });
  } catch (error) {
    return fail("database_unavailable", 503);
  }
}

export async function handleCapabilities(request, env) {
  return ok({
    api_version: SUPER_API_VERSION,
    capabilities: getCapabilities()
  });
}
