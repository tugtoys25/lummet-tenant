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

  // Consent mode (only when the cookie banner is switched on): everything starts denied unless the visitor
  // already said yes. The banner script sends the update. With the banner off this block is empty and the
  // output is exactly what it was before.
  const consentBlock = siteSettings?.cookieBannerMode === "on" ? `
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    (function(){var m=document.cookie.match(/(?:^|; )lm_consent=(granted|denied)/);var s=m&&m[1]==="granted"?"granted":"denied";
    gtag('consent','default',{analytics_storage:s,ad_storage:s,ad_user_data:s,ad_personalization:s,wait_for_update:500});})();
  </script>` : "";

  const configLines = safeIds
    .map(id => `    gtag('config', '${id}');`)
    .join("\n");

  return `${consentBlock}
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

// The banner script tag and the footer "Cookie settings" link. Both are empty strings while the banner is off.
export function buildConsentHtml(siteSettings) {
  if (siteSettings?.cookieBannerMode !== "on") return { script: "", link: "" };
  const text = escapeHtml(String(siteSettings.cookieBannerText || ""));
  const raw = String(siteSettings.cookiePolicyUrl || "").trim();
  const policy = /^(\/[^\s"'<>]*|https?:\/\/[^\s"'<>]+)$/i.test(raw) ? escapeHtml(raw) : "";
  return {
    script: `<script defer src="/static/js/cookie-consent.js" data-text="${text}" data-policy="${policy}"></script>`,
    link: `<a href="#" data-cookie-settings style="margin-left:12px">Cookie settings</a>`
  };
}

export function buildGpwaSeal(siteSettings) {
  if (!siteSettings?.gpwaSealEnabled) return "";
  return String(siteSettings.gpwaSealHtml || "").trim();
}

export function buildGpwaScript(siteSettings) {
  if (!siteSettings?.gpwaSealEnabled) return "";
  return String(siteSettings.gpwaScriptHtml || "").trim();
}
