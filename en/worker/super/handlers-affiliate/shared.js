function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

export function ok(data = {}) { return json({ success: true, ...data }, 200); }

export function created(data = {}) { return json({ success: true, ...data }, 201); }

export function fail(message, status = 400) { return json({ success: false, error: message }, status); }

export async function readJsonBody(request, bodyText) {
  if (!bodyText) return {};
  try { return JSON.parse(bodyText); } catch (_) { return {}; }
}

// Mirrors handlers.js's own validateRequired() exactly.
export function validateRequired(body, required) {
  const missing = required.filter(
    (field) => body[field] === undefined || body[field] === null || body[field] === ""
  );
  if (missing.length > 0) {
    throw new Error(`${missing[0]} is required`);
  }
}
