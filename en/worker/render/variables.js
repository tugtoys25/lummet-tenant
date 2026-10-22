// Renderer methods: Template variable replacement ({{x}}, {{{x}}}).
// Installed on Renderer.prototype by worker/render.js (see worker/render/install-methods.js).
import { sanitizeHtml } from "../sanitize.js";

// ── Content fields that contain user-authored HTML ──
// These fields are sanitized via sanitizeHtml() before
// being inserted into templates. Add new content field
// names here when new content types are introduced.
const CONTENT_FIELDS = new Set([
  'content',
  'overview',
  'games',
  'bonuses',
  'payments',
  'licenses',
  'verdict',
  'pros',
  'cons',
  'faq_html',
  'bio',
  'text',
  'html',
  'excerpt',
  'description',
  'caption',
]);

export const variablesMethods = {

  // =====================================================
  // REPLACE {{variables}}
  // =====================================================
  replaceVariables(template, data = {}) {
  if (!template || typeof template !== "string") {
    console.error("Template missing:", template);
    return "";
  }

  // =====================================================
  // RAW HTML VARIABLES — triple braces
  // {{{content}}}
  // {{{tags_html}}}
  // {{{related_news_html}}}
  // {{{news_cards}}}
  // =====================================================

  template = template.replace(
    /\{\{\{(.*?)\}\}\}/gs,
    (_, key) => {
      key = key.trim();

      const value = data[key];

      if (value === undefined || value === null) {
        return "";
      }

      /*
       * These values are generated HTML rather than normal
       * text variables.
       *
       * User-authored HTML fields still pass through
       * sanitizeHtml().
       */
      if (CONTENT_FIELDS.has(key)) {
        return sanitizeHtml(String(value));
      }

      return String(value);
    }
  );

  // =====================================================
  // CONDITIONAL BLOCKS
  // {{#if key}} ... {{/if}}
  // =====================================================

  template = template.replace(
    /\{\{#if\s+(.*?)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_, key, content) => {
      key = key.trim();

      const val = data[key];

      if (
        val &&
        val !== "" &&
        val !== null &&
        val !== undefined &&
        val !== false
      ) {
        return content;
      }

      return "";
    }
  );

  // =====================================================
  // NORMAL VARIABLES — double braces
  // {{title}}
  // {{excerpt}}
  // {{published_at}}
  // =====================================================

  return template.replace(
    /\{\{(.*?)\}\}/g,
    (_, key) => {
      key = key.trim();

      let value = data[key] ?? "";

      if (
        typeof value === "string" &&
        CONTENT_FIELDS.has(key)
      ) {
        value = sanitizeHtml(value);
      }

      return value;
    }
  );
},

  replaceVariablesbackups(template, data = {}) {
    // Handle {{#if key}}...{{/if}} blocks
    if (!template || typeof template !== "string") {
    console.error("Template missing:", template);
    return "";
  }
    template = template.replace(
      /\{\{#if\s+(.*?)\}\}([\s\S]*?)\{\{\/if\}\}/g,
      (_, key, content) => {
        key = key.trim();
        const val = data[key];
        if (val && val !== "" && val !== null && val !== undefined && val !== false) {
          return content;
        }
        return "";
      }
    );
    // Handle {{key}} variables
   // return template.replace(
  //    /\{\{(.*?)\}\}/g,
  //    (_, key) => {
    //    key = key.trim();
      //  return data[key] ?? "";
      //}
   // );
    return template.replace(
  /\{\{(.*?)\}\}/g,
  (_, key) => {
    key = key.trim();

    let value = data[key] ?? "";

    if (
      typeof value === "string" &&
      CONTENT_FIELDS.has(key)
    ) {
      value = sanitizeHtml(value);
    }

    return value;
  }
);

  }
};
