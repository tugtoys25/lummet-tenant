// Renders one custom-field value as safe HTML for the public
// content-item page, dispatching on the field's declared type
// (custom_field_definitions.field_type). This is the ONE place
// custom-field values are turned into HTML, so there's a single spot
// to audit for the Phase 36 requirement: custom fields must never
// permit arbitrary executable HTML/JS, regardless of what an admin
// typed into the field.
//
// Reuses the EXISTING sanitizer (worker/sanitize.js) rather than a
// second one -- escapeHtml() for anything that renders as text,
// sanitizeUrl() for anything that renders as a link/src.

import { escapeHtml, sanitizeUrl } from "./sanitize.js";

function renderTextLike(value) {
  return escapeHtml(String(value ?? ""));
}

function renderMultiSelect(value) {
  let items;
  try {
    items = JSON.parse(value);
  } catch {
    items = [];
  }
  if (!Array.isArray(items)) return "";
  return items.map(v => `<span class="feature-tag">${escapeHtml(String(v))}</span>`).join("");
}

/**
 * fieldDef: a row from custom_field_definitions (has field_type, label, field_key)
 * rawValue: the stored string value from custom_field_values (may be null/undefined)
 * Returns { label, html } -- html is always safe to insert with {{{...}}}.
 */
export function renderCustomFieldValue(fieldDef, rawValue) {
  const label = escapeHtml(fieldDef.label);
  if (rawValue === null || rawValue === undefined || rawValue === "") {
    return { label, html: "" };
  }

  switch (fieldDef.field_type) {
    case "boolean":
      return { label, html: (rawValue === "1" || rawValue === "true") ? "Yes" : "No" };

    case "number":
    case "rating": {
      const n = Number(rawValue);
      return { label, html: Number.isFinite(n) ? escapeHtml(String(n)) : "" };
    }

    case "date":
      return { label, html: renderTextLike(rawValue) }; // stored as ISO text, displayed verbatim (escaped)

    case "url": {
      const safe = sanitizeUrl(rawValue, false);
      if (!safe) return { label, html: "" };
      // sanitizeUrl() only blocks dangerous SCHEMES (javascript:, etc.)
      // -- it does not escape quote characters, so a value like
      // https://x.com/"><script>...</script> would otherwise break
      // out of the href="..." attribute. escapeHtml() the sanitized
      // URL too, for the attribute context, not just the visible text.
      return { label, html: `<a href="${escapeHtml(safe)}" target="_blank" rel="nofollow noopener">${escapeHtml(rawValue)}</a>` };
    }

    case "image": {
      const safe = sanitizeUrl(rawValue, true);
      if (!safe) return { label, html: "" };
      return { label, html: `<img src="${escapeHtml(safe)}" alt="${escapeHtml(fieldDef.label)}" loading="lazy">` };
    }

    case "multi_select":
      return { label, html: renderMultiSelect(rawValue) };

    case "country":
    case "currency":
    case "select":
    case "text":
    case "textarea":
    default:
      // Every other type -- including the two free-text types -- is
      // rendered as plain escaped text. NEVER passed through
      // sanitizeHtml() as rich HTML: these are single-line/plain
      // values by design (Phase 36), not a rich-text field type.
      return { label, html: renderTextLike(rawValue) };
  }
}

/**
 * Renders a full custom-fields block: definitions (ordered) joined
 * with stored values, skipping empty values entirely rather than
 * showing an empty row.
 */
export function renderCustomFieldsHtml(fieldDefs, valuesByKey) {
  const rows = fieldDefs
    .map(def => ({ def, ...renderCustomFieldValue(def, valuesByKey[def.field_key]) }))
    .filter(row => row.html !== "");

  if (!rows.length) return "";

  return `<dl>${rows.map(r => `<dt>${r.label}</dt><dd>${r.html}</dd>`).join("")}</dl>`;
}
