import { ALLOWED_ATTRS, URL_ATTRS } from "./policy.js";
import { sanitizeStyle, sanitizeUrl } from "./values.js";

// ── Attribute parsing ────────────────────────────────
/**
 * Parses an attribute string into an array of {name, value} pairs.
 * Handles double-quoted, single-quoted, and unquoted values.
 * Handles boolean attributes (value = null).
 * @param {string} attrsStr - The attribute portion of a tag (everything between tag name and >).
 * @returns {Array<{name: string, value: string|null}>} Parsed attributes.
 */
function parseAttributes(attrsStr) {
  const attrs = [];
  // Regex matches: name="value" | name='value' | name=value | name (boolean)
  const attrRegex = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let match;
  while ((match = attrRegex.exec(attrsStr)) !== null) {
    const name = match[1].toLowerCase();
    const value = match[2] !== undefined ? match[2] : (match[3] !== undefined ? match[3] : (match[4] !== undefined ? match[4] : null));
    attrs.push({ name, value });
  }
  return attrs;
}

// ── Attribute sanitization ───────────────────────────
/**
 * Checks if an attribute name is allowed for a given tag.
 * Supports wildcard attributes via 'data-*'.
 * @param {string} tag - The tag name (lowercase).
 * @param {string} attrName - The attribute name (lowercase).
 * @returns {boolean} True if the attribute is allowed.
 */
function isAllowedAttr(tag, attrName) {
  // Always strip event handlers
  if (/^on/i.test(attrName)) {
    return false;
  }

  // Check global attributes
  const globalAttrs = ALLOWED_ATTRS['*'] || [];
  for (const ga of globalAttrs) {
    if (ga === attrName) return true;
    // Support data-* wildcard
    if (ga === 'data-*' && /^data-/i.test(attrName)) return true;
  }

  // Check tag-specific attributes
  const tagAttrs = ALLOWED_ATTRS[tag] || [];
  for (const ta of tagAttrs) {
    if (ta === attrName) return true;
    if (ta === 'data-*' && /^data-/i.test(attrName)) return true;
  }

  return false;
}

/**
 * Sanitizes an attribute value based on attribute name and tag.
 * @param {string} tag - The tag name (lowercase).
 * @param {string} attrName - The attribute name (lowercase).
 * @param {string|null} value - The attribute value.
 * @returns {string|null} The sanitized value, or null to remove the attribute.
 */
function sanitizeAttrValue(tag, attrName, value) {
  if (value === null) {
    return null; // Boolean attribute
  }

  // URL attributes — sanitize scheme
  if (URL_ATTRS.has(attrName)) {
    const isImage = (tag === 'img' || tag === 'source') && attrName === 'src';
    const sanitized = sanitizeUrl(value, isImage);
    return sanitized || null; // Remove attr if URL is dangerous
  }

  // Style attribute — sanitize CSS
  if (attrName === 'style') {
    const sanitized = sanitizeStyle(value);
    return sanitized || null; // Remove attr if style is empty after sanitization
  }

  // For iframe src — ensure HTTPS or protocol-relative
  if (tag === 'iframe' && attrName === 'src') {
    const sanitized = sanitizeUrl(value, false);
    if (!sanitized) return null;
    // Block non-HTTPS absolute URLs for iframes
    if (/^https?:\/\//i.test(sanitized) && !/^https:\/\//i.test(sanitized)) {
      return null; // Block http: iframes
    }
    return sanitized;
  }

  // For target attribute on links — only allow safe values
  if (attrName === 'target') {
    const lower = value.toLowerCase().trim();
    if (lower === '_blank' || lower === '_self' || lower === '_parent' || lower === '_top') {
      return lower;
    }
    return null;
  }

  // For rel attribute — allow safe values
  if (attrName === 'rel') {
    const safeRels = ['alternate', 'author', 'bookmark', 'help', 'license', 'next', 'nofollow', 'noopener', 'noreferrer', 'prefetch', 'prev', 'search', 'tag', 'sponsored', 'ugc'];
    const parts = value.toLowerCase().split(/\s+/).filter(p => safeRels.includes(p));
    return parts.length > 0 ? parts.join(' ') : null;
  }

  // For boolean attributes — return empty string (presence = true)
  const booleanAttrs = new Set(['controls', 'muted', 'loop', 'autoplay', 'playsinline', 'allowfullscreen', 'default', 'open', 'hidden', 'ismap', 'noshade', 'reversed', 'crossorigin', 'async', 'defer', 'disabled', 'checked', 'selected', 'readonly', 'multiple', 'required', 'autofocus', 'novalidate', 'formnovalidate', 'download']);
  if (booleanAttrs.has(attrName)) {
    return '';
  }

  // Default — return value as-is (already parsed from quoted attribute)
  return value;
}

/**
 * Rebuilds a tag with sanitized attributes.
 * @param {string} tagName - The tag name (lowercase).
 * @param {string} attrsStr - The raw attribute string.
 * @param {boolean} isClosing - Whether this is a closing tag.
 * @param {boolean} isSelfClosing - Whether this is a self-closing tag.
 * @returns {string} The sanitized tag string.
 */
export function sanitizeTag(tagName, attrsStr, isClosing, isSelfClosing) {
  tagName = tagName.toLowerCase();

  // Closing tags have no attributes
  if (isClosing) {
    return `</${tagName}>`;
  }

  // Parse and sanitize attributes
  const attrs = parseAttributes(attrsStr);
  const keptAttrs = [];

  for (const attr of attrs) {
    if (!isAllowedAttr(tagName, attr.name)) {
      continue;
    }
    const sanitizedValue = sanitizeAttrValue(tagName, attr.name, attr.value);
    if (sanitizedValue === null) {
      // Boolean attribute with no value — include as boolean
      if (attr.value === null) {
        keptAttrs.push(` ${attr.name}`);
      }
      // Value was sanitized to null — skip
      continue;
    }
    // Escape quotes in value
    const escapedValue = sanitizedValue.replace(/"/g, '&quot;');
    keptAttrs.push(` ${attr.name}="${escapedValue}"`);
  }

  const selfClose = isSelfClosing ? ' /' : '';
  return `<${tagName}${keptAttrs.join('')}${selfClose}>`;
}
