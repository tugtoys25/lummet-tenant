// Small HTTP helpers shared by the configuration API route files (Phase 7, hardened in Phase 10).

// Cross-site writes are refused. A browser always sends Origin on cross-site writes (and Sec-Fetch-Site on current browsers); the session
// cookie is also SameSite=Lax. Requests with neither header (scripts, curl) are not browser-driven and are let through to the normal role checks.
export function crossSite(request) {
  const sfs = request.headers.get("Sec-Fetch-Site");
  if (sfs === "cross-site") return true;
  const origin = request.headers.get("Origin");
  if (!origin) return false;
  try { return new URL(origin).host !== new URL(request.url).host; } catch { return true; }
}

// ---------- request body size caps (checked BEFORE the JSON is parsed) ----------
export const MAX_BODY_DEFAULT = 64 * 1024;          // profile, settings, presets, shares, publish, rollback, setup
export const MAX_BODY_DRAFT = 512 * 1024;           // a draft can carry menu, SEO and component rows
export const MAX_BODY_IMPORT = 2 * 1024 * 1024;     // an import file is at most 900 KB (MAX_IMPORT_BYTES); JSON string escaping can double it

const tooLarge = (max) => new Response(JSON.stringify({ success: false, code: "payload_too_large", error: `The request is too large (limit ${Math.round(max / 1024)} KB).` }),
  { status: 413, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const invalid = () => new Response(JSON.stringify({ success: false, error: "Invalid JSON" }), { status: 400, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

/**
 * Read a JSON object body with a size cap. -> { body } on success ({} for an empty object or a non-object JSON value),
 * or { response } (413 payload_too_large, or 400 Invalid JSON) that the caller returns as is.
 */
export async function readJsonCapped(request, max = MAX_BODY_DEFAULT) {
  const declared = Number(request.headers?.get?.("content-length"));
  if (Number.isFinite(declared) && declared > max) return { response: tooLarge(max) };
  let text;
  try {
    if (typeof request.text === "function") text = await request.text();
    else text = JSON.stringify(await request.json()); // test doubles that only offer json()
  } catch { return { response: invalid() }; }
  if (typeof text !== "string" || text.length > max) return { response: tooLarge(max) };
  try { const b = JSON.parse(text); return { body: b && typeof b === "object" && !Array.isArray(b) ? b : {} }; } catch { return { response: invalid() }; }
}

// The JSON body as an object, {} for an empty object, or null when it is not valid JSON. (Kept for older callers; new code uses readJsonCapped.)
export async function readBody(request) {
  try { const b = await request.json(); return b && typeof b === "object" && !Array.isArray(b) ? b : {}; } catch { return null; }
}
