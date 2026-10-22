// ── Local response helpers ──────────────────────────
// media-upload.js can't import json/success/failure from
// api.js (circular dependency), so we define minimal
// versions here that produce identical Response objects.
export function jsonResponse(status, data) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" }
    });
}

export function jsonError(status, message) {
    return new Response(JSON.stringify({ success: false, error: message }), {
        status,
        headers: { "Content-Type": "application/json" }
    });
}
