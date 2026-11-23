// robots.txt, dynamic pages and the 404 page.
// Returns NOT_HANDLED for a route type this group does not own.
import { NOT_HANDLED } from "./not-handled.js";
import { render404, renderDynamicPage, robots } from "../../controllers.js";
import { getIndexNowKey } from "../../newsroom-pro.js";

export async function handleMisc(route, request, env, ctx, url) {
  switch (route.type) {

      case "robots":
        if (route.indexnowKey) {
          const saved = await getIndexNowKey(env.DB).catch(() => null);
          if (saved && saved === route.indexnowKey) return new Response(saved, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
          return render404(request, env);
        }
        return robots(request, env);

      case "page":
        return renderDynamicPage(
          request,
          env,
          route.slug,
          ctx
        );

      case "not_found":
        return render404(request, env);

      default:
        return NOT_HANDLED;
  }
}
