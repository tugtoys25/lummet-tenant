// =====================================================
// TENANT (CUSTOMER-SITE) CONTENT SECURITY POLICY (Round 6.3C)
//
// Finding before this round: the tenant Worker sent no CSP and no other security headers.
// TENANT_CSP_MODE = off (default; nothing changes) | report-only (adds Content-Security-Policy-Report-Only to HTML pages;
// the browser reports violations in its console and, when TENANT_CSP_REPORT_URI is set, to that address; nothing is blocked).
// There is deliberately NO enforce mode in this round: customer pages use inline scripts and a hard-coded analytics tag, so
// enforcing would break sites. Enforcement is a later owner decision after report-only evidence (docs/TENANT_CSP.md).
//
// The policy keeps Cloudflare Turnstile working: its script, widget frame and verification calls need
// https://challenges.cloudflare.com in script-src, frame-src and connect-src.
// =====================================================

const TURNSTILE = "https://challenges.cloudflare.com";

// Origins the shipped templates and scripts already use. Each is listed where it is needed and nowhere else.
const POLICY = {
  "default-src": ["'self'"],
  "script-src": ["'self'", "'unsafe-inline'", TURNSTILE, "https://www.googletagmanager.com", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
  "style-src": ["'self'", "'unsafe-inline'"],
  "img-src": ["'self'", "data:", "blob:", "https:"],
  "font-src": ["'self'", "data:"],
  "media-src": ["'self'", "blob:", "https:"],
  "frame-src": [TURNSTILE, "https://www.youtube.com", "https://www.youtube-nocookie.com"],
  "connect-src": ["'self'", TURNSTILE, "https://www.googletagmanager.com", "https://www.google-analytics.com", "https://*.google-analytics.com", "https://*.analytics.google.com"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"]
};

/** "report-only" only for that exact word (any case, surrounding spaces ignored); everything else is "off". */
export function tenantCspMode(env) {
  return String(env?.TENANT_CSP_MODE ?? "").trim().toLowerCase() === "report-only" ? "report-only" : "off";
}

function reportUri(env) {
  const v = String(env?.TENANT_CSP_REPORT_URI ?? "").trim();
  if (!v || /[\s;,]/.test(v)) return "";
  return /^\/(?!\/)/.test(v) || /^https:\/\/[A-Za-z0-9.-]+(:\d+)?\/[^\s;,]*$/.test(v) ? v : "";
}

/** The policy text. Pure; the same for every site. */
export function buildTenantCsp(env) {
  const parts = Object.entries(POLICY).map(([directive, sources]) => `${directive} ${sources.join(" ")}`);
  const uri = reportUri(env);
  if (uri) parts.push(`report-uri ${uri}`);
  return parts.join("; ");
}

/** Adds the report-only header to a successful or failed HTML page, when the mode is on. Anything else is returned untouched. */
export function withTenantCsp(response, env) {
  try {
    if (tenantCspMode(env) !== "report-only" || !response) return response;
    if (!(response.headers.get("content-type") || "").toLowerCase().includes("text/html")) return response;
    if (response.headers.get("content-security-policy-report-only") || response.headers.get("content-security-policy")) return response;
    const headers = new Headers(response.headers);
    headers.set("Content-Security-Policy-Report-Only", buildTenantCsp(env));
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  } catch (_) {
    return response;
  }
}
