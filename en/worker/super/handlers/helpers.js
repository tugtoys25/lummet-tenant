// -----------------------------------------------------
// Response helpers
// -----------------------------------------------------

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

export function ok(data = {}) {
  return json({ success: true, ...data }, 200);
}

export function created(data = {}) {
  return json({ success: true, ...data }, 201);
}

export function fail(message, status = 400) {
  return json({ success: false, error: message }, status);
}

export async function readJsonBody(request, bodyText) {
  if (!bodyText) return {};
  try {
    return JSON.parse(bodyText);
  } catch (_) {
    return {};
  }
}

// Mirrors en/worker/api.js's own validate() exactly — same fields
// required, same "empty string counts as missing" rule, same error
// message shape — so the Super API rejects invalid input exactly
// like the tenant's own admin does, rather than silently accepting
// an incomplete record that the DB layer doesn't itself guard.
export function validateRequired(body, required) {
  const missing = required.filter(
    (field) => body[field] === undefined || body[field] === null || body[field] === ""
  );
  if (missing.length > 0) {
    throw new Error(`${missing[0]} is required`);
  }
}

// -----------------------------------------------------
// Settings: keys that must never be exposed or set
// through the Super API (rule #26).
// -----------------------------------------------------

const SENSITIVE_SETTING_PATTERN =
  /secret|password|credential|private[_-]?key|api[_-]?key|token/i;

export function filterSafeSettings(settingsObject) {
  const out = {};
  for (const [key, value] of Object.entries(settingsObject || {})) {
    if (!SENSITIVE_SETTING_PATTERN.test(key)) {
      out[key] = value;
    }
  }
  return out;
}
