// Small HTTP helpers shared by the configuration API route files.

// A browser always sends Origin on cross-site writes; refuse when it names another site.
export function crossSite(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return false;
  try { return new URL(origin).host !== new URL(request.url).host; } catch { return true; }
}

// The JSON body as an object, {} for an empty object, or null when it is not valid JSON.
export async function readBody(request) {
  try { const b = await request.json(); return b && typeof b === "object" && !Array.isArray(b) ? b : {}; } catch { return null; }
}
