import { ALLOWED_TAGS, STRIP_CONTENT_TAGS } from "./policy.js";
import { sanitizeTag } from "./tags.js";

// ── Dangerous tag removal ───────────────────────────
/**
 * Removes dangerous tags and their content from HTML.
 * These tags are stripped entirely — content is NOT preserved.
 * @param {string} html - The HTML string to clean.
 * @returns {string} HTML with dangerous tags removed.
 */
function stripDangerousTags(html) {
  let result = html;

  // Remove properly closed dangerous tags WITH content
  for (const tag of STRIP_CONTENT_TAGS) {
    // Match <tag ...>...</tag> (case-insensitive)
    const openCloseRegex = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi');
    result = result.replace(openCloseRegex, '');

    // Remove unclosed opening tags (just the tag, not following content)
    const openOnlyRegex = new RegExp(`<${tag}\\b[^>]*>`, 'gi');
    result = result.replace(openOnlyRegex, '');

    // Remove orphaned closing tags
    const closeOnlyRegex = new RegExp(`<\\/${tag}>`, 'gi');
    result = result.replace(closeOnlyRegex, '');
  }

  return result;
}

// ── Comment and CDATA removal ─────────────────────────
/**
 * Removes HTML comments and CDATA sections.
 * Comments can contain IE conditional comments that execute scripts.
 * @param {string} html - The HTML string to clean.
 * @returns {string} HTML with comments and CDATA removed.
 */
function stripCommentsAndCdata(html) {
  let result = html;

  // Remove HTML comments (including IE conditional comments)
  result = result.replace(/<!--[\s\S]*?-->/g, '');

  // Remove CDATA sections
  result = result.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');

  // Remove processing instructions (<?xml ... ?>, <?php ... ?>)
  result = result.replace(/<\?[\s\S]*?\?>/g, '');

  // Remove DOCTYPE declarations
  result = result.replace(/<!DOCTYPE[^>]*>/gi, '');

  return result;
}

// ── Tag processing ────────────────────────────────────
/**
 * Processes all HTML tags in the string.
 * - Allowed tags: kept with sanitized attributes.
 * - Unknown tags: unwrapped (tag removed, content preserved).
 * @param {string} html - The HTML string to process.
 * @returns {string} HTML with all tags processed.
 */
function processTags(html) {
  // This regex matches any HTML tag: <tag ...>, </tag>, <tag ... />
  return html.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g, (match, slash, tagName, attrsStr) => {
    tagName = tagName.toLowerCase();

    // Check if this is a self-closing tag (ends with /)
    const isSelfClosing = /\/\s*$/.test(attrsStr);
    // Remove the trailing / from attrsStr for parsing
    const cleanAttrsStr = isSelfClosing ? attrsStr.replace(/\/\s*$/, '') : attrsStr;

    const isClosing = slash === '/';

    // If tag is in the allowed list, sanitize and keep it
    if (ALLOWED_TAGS.has(tagName)) {
      return sanitizeTag(tagName, cleanAttrsStr, isClosing, isSelfClosing && !isClosing);
    }

    // If tag is not in any list, unwrap it (remove tag, keep content)
    // For unknown tags, just remove the tag markers
    return '';
  });
}

// ── Main sanitization function ───────────────────────
/**
 * Sanitizes an HTML string to prevent XSS attacks.
 *
 * - Removes all script, style, object, embed, and other dangerous tags (with content)
 * - Removes HTML comments, CDATA sections, and processing instructions
 * - Keeps only whitelisted tags with whitelisted attributes
 * - Strips all event handler attributes (onclick, onload, etc.)
 * - Sanitizes URL attributes to block javascript:, vbscript:, and unsafe data: URLs
 * - Sanitizes style attributes to strip dangerous CSS patterns
 * - Unwraps unknown tags (removes tag but preserves text content)
 *
 * The function is idempotent — already-sanitized HTML passes through unchanged.
 *
 * @param {string} html - The HTML string to sanitize.
 * @returns {string} The sanitized HTML string.
 */
export function sanitizeHtml(html) {
  if (typeof html !== 'string') return '';
  if (html === '') return '';

  let result = html;

  // Step 1: Remove comments, CDATA, processing instructions, DOCTYPE
  result = stripCommentsAndCdata(result);

  // Step 2: Remove dangerous tags and their content
  result = stripDangerousTags(result);

  // Step 3: Process all remaining tags (allow, unwrap, or sanitize)
  result = processTags(result);

  // Step 4: Clean up any remaining artifacts
  // Remove empty attribute values that might cause issues
  result = result.replace(/\s*=\s*""/g, '');

  // Remove any remaining null bytes
  result = result.replace(/\x00/g, '');

  return result;
}
