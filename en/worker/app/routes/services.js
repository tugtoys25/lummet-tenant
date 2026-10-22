// Media, favicon, super API, API and redirects.
// Returns NOT_HANDLED for a route type this group does not own.
import { NOT_HANDLED } from "./not-handled.js";
import { getCurrentUser } from "../../auth.js";
import { handleAPI } from "../../api.js";
import { handleSuperApi } from "../../super/router.js";
import { serveMedia } from "../../media-upload.js";

export async function handleServices(route, request, env, ctx, url) {
  switch (route.type) {

      case "media":
        return serveMedia(request, env, route.key);

      case "favicon":
        return env.ASSETS.fetch(request);

      case "superApi":
        return handleSuperApi(request, env, ctx, route.path);

      case "api":

  const user =
    await getCurrentUser(
      request,
      env
    );

  return handleAPI(
    request,
    env,
    route.path,
    user
  );

      case "redirect":
        return new Response(null, { status: 302, headers: { Location: route.target } });

      default:
        return NOT_HANDLED;
  }
}
