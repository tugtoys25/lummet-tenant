// =====================================================
// TENANT ROUTER
// Equivalent to Django urls.py
// =====================================================

import { routePublic } from "./routing/public.js";
import { routeContent } from "./routing/content.js";
import { routeDashboard } from "./routing/dashboard.js";
import { routeSystem } from "./routing/system.js";

export function getRoute(request) {

  const url = new URL(request.url);

  let path = url.pathname;

  // remove trailing slash except root
  if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }
  // Add right after: if (path.length > 1 && path.endsWith("/")) { path = path.slice(0, -1); }
  if (path === "/" || path === "") {
      return { type: "redirect", target: "/en" };
  }

  // The groups run in the order the checks had in the single function; the first match wins.
  return (
    routePublic(path) ||
    routeContent(path) ||
    routeDashboard(path) ||
    routeSystem(path, request) ||
    {
      type: "not_found"
    }
  );

}
