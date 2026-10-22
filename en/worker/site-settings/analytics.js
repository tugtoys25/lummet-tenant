import { escapeHtml } from "./helpers.js";

// ------------------------------------------------------------
// Google Analytics (gtag.js)
// ------------------------------------------------------------
// ------------------------------------------------------------
// Google Analytics (gtag.js)
// ------------------------------------------------------------

export function buildGaScript(siteSettings) {
  const raw =
    String(siteSettings?.gaMeasurementId || "").trim();

  if (!raw) {
    return "";
  }

  // Supports one ID, or a comma-separated pair/list — e.g. a GA4
  // property together with a Google Tag / GTM container id:
  // "G-XXXXXXXXXX, GT-XXXXXXXX". Each token is individually
  // whitelisted (letters, digits, dashes only) so nothing else
  // can be injected into this inline script.
  const idPattern = /^[A-Za-z0-9-]{6,20}$/;

  const ids = raw
    .split(",")
    .map(id => id.trim())
    .filter(id => idPattern.test(id));

  if (!ids.length) {
    return "";
  }

  const safeIds = ids.map(id => escapeHtml(id));

  const configLines = safeIds
    .map(id => `    gtag('config', '${id}');`)
    .join("\n");

  return `
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=${safeIds[0]}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
${configLines}
  </script>`;
}

// ------------------------------------------------------------
// GPWA verification (seal + script)
// Admin-pasted per tenant. Deliberately NOT run through
// sanitizeHtml() — the script snippet legitimately needs a
// <script> tag, which the sanitizer strips — so access to the
// settings fields that populate these is restricted to
// admin/editor roles at the API layer (see api.js saveSettings).
// Both helpers return "" unless the tenant has the toggle on
// AND has actually pasted markup in, so an empty/never-configured
// tenant renders nothing and the {{#if}} guards in the templates
// collapse to nothing as well.
// ------------------------------------------------------------

export function buildGpwaSeal(siteSettings) {
  if (!siteSettings?.gpwaSealEnabled) return "";
  return String(siteSettings.gpwaSealHtml || "").trim();
}

export function buildGpwaScript(siteSettings) {
  if (!siteSettings?.gpwaSealEnabled) return "";
  return String(siteSettings.gpwaScriptHtml || "").trim();
}
