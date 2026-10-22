import { DEFAULTS } from "./defaults.js";

// ------------------------------------------------------------
// HTML escaping
// ------------------------------------------------------------

export function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ------------------------------------------------------------
// Read JSON setting safely
// ------------------------------------------------------------

export function parseJson(value, fallback) {
  if (!value) return fallback;

  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function parseHomepageSections(value) {
  if (!value) {
    return DEFAULTS.homepageSections;
  }

  try {
    const parsed = JSON.parse(value);

    if (!Array.isArray(parsed)) {
      return DEFAULTS.homepageSections;
    }

    return parsed;
  } catch {
    return DEFAULTS.homepageSections;
  }
}
