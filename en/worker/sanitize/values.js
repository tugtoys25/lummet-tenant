import { ALLOWED_IMAGE_SCHEMES, ALLOWED_URL_SCHEMES, DANGEROUS_CSS_PATTERNS } from "./policy.js";

// ── HTML entity encoding ─────────────────────────────
/**
 * Encodes a string for safe insertion into HTML text content.
 * Encodes &, <, >, ", '.
 * @param {string} str - The string to encode.
 * @returns {string} The HTML-encoded string.
 */
export function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── URL sanitization ─────────────────────────────────
/**
 * Sanitizes a URL value to block dangerous schemes.
 * Allows http, https, mailto, tel, and relative URLs.
 * For image attributes, also allows data:image/ URIs.
 * @param {string} url - The URL to sanitize.
 * @param {boolean} isImage - Whether this URL is for an image attribute.
 * @returns {string} The sanitized URL, or empty string if dangerous.
 */
export function sanitizeUrl(url, isImage) {
  if (typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (trimmed === '') return '';

  // Decode HTML entities in URL (e.g., &#106;avascript:)
  let decoded = trimmed;
  try {
    decoded = decoded
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
      .replace(/&tab;/gi, '\t')
      .replace(/&newline;/gi, '\n')
      .replace(/&colon;/gi, ':')
      .replace(/&NewLine;/gi, '\n')
      .replace(/&lpar;/gi, '(')
      .replace(/&rpar;/gi, ')');
  } catch (e) {
    // If decoding fails, treat as suspicious
    return '';
  }

  // Remove all whitespace and control characters
  // (attackers use \t, \n, \0 to break up "javascript:")
  const cleaned = decoded.replace(/[\x00-\x20\x7f]/g, '');

  // Check for scheme
  const schemeMatch = cleaned.match(/^([a-zA-Z][a-zA-Z0-9+.\-]*):/i);
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();

    // For images, allow data:image/ only
    if (isImage && scheme === 'data') {
      if (/^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml|bmp|x-icon|vnd\.microsoft\.icon)/i.test(cleaned)) {
        return trimmed;
      }
      // data: but not image — block
      return '';
    }

    // For non-image attributes, block all data: URLs
    if (scheme === 'data' && !isImage) {
      return '';
    }

    // Check against allowed schemes
    const allowed = isImage ? ALLOWED_IMAGE_SCHEMES : ALLOWED_URL_SCHEMES;
    if (!allowed.has(scheme)) {
      return '';
    }

    return trimmed;
  }

  // No scheme — relative URL (starts with /, ./, ../, #, or just a path)
  // These are safe
  if (/^(\/|\.\/|\.\.\/|#|\?)/.test(trimmed) || !/^[a-zA-Z]/.test(trimmed)) {
    return trimmed;
  }

  // Could be a protocol-relative URL (//example.com)
  if (/^\/\//.test(trimmed)) {
    return trimmed;
  }

  // Could be a domain-like string (example.com/path)
  // Treat as relative URL — safe
  return trimmed;
}

// ── Style attribute sanitization ─────────────────────
/**
 * Sanitizes a CSS style string for use in a style attribute.
 * Strips dangerous CSS patterns that can execute JavaScript.
 * @param {string} style - The CSS style string to sanitize.
 * @returns {string} The sanitized CSS style string.
 */
export function sanitizeStyle(style) {
  if (typeof style !== 'string') return '';
  let cleaned = style;

  // Remove dangerous patterns
  for (const pattern of DANGEROUS_CSS_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }

  // Remove CSS comments (can hide dangerous content)
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');

  // Remove backslash escapes that could bypass filters
  // (e.g., \6a\61\76... for "jav...")
  cleaned = cleaned.replace(/\\[0-9a-fA-F]{1,6}\s?/g, '');

  // Re-check after removing escapes (patterns might be revealed)
  for (const pattern of DANGEROUS_CSS_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }

  // Clean up multiple semicolons and trailing whitespace
  cleaned = cleaned.replace(/;{2,}/g, ';').replace(/;$/, '').trim();

  return cleaned;
}
