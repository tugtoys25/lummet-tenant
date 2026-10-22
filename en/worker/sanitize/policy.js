// =====================================================
// sanitize.js — Central HTML Sanitization Service
// =====================================================
//
// Pure-JavaScript HTML sanitizer for Cloudflare Workers.
// No DOM API required — uses regex-based tokenization.
//
// Security model:
//   1. Tag whitelist — only known-safe tags are kept
//   2. Attribute whitelist — per-tag allowed attributes
//   3. Event handler removal — all on* attributes stripped
//   4. URL sanitization — blocks javascript:, vbscript:, data: (except images)
//   5. Style sanitization — strips dangerous CSS (expression(), javascript:, etc.)
//   6. Comment removal — HTML comments can contain IE conditional scripts
//   7. CDATA removal — XML CDATA sections can hide scripts
//   8. Dangerous tag removal — script, style, object, embed, etc. removed with content
//
// The sanitizer is idempotent — already-sanitized HTML passes through unchanged.
//
// Usage:
//   import { sanitizeHtml } from './sanitize.js';
//   const clean = sanitizeHtml(userContent);
//
// =====================================================

// ── Allowed tags ─────────────────────────────────────
// Tags that are preserved in output. All other tags are
// "unwrapped" — the tag itself is removed but text content
// between them is kept.
export const ALLOWED_TAGS = new Set([
  // Block structure
  'p', 'div', 'br', 'hr', 'span',
  // Headings
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  // Inline formatting
  'strong', 'em', 'u', 's', 'b', 'i', 'mark', 'sup', 'sub', 'small',
  'abbr', 'cite', 'kbd', 'samp', 'var', 'code', 'time', 'address', 'wbr',
  // Links and media
  'a', 'img',
  'video', 'source', 'audio', 'track',
  // Lists
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  // Quotes and code
  'blockquote', 'q', 'pre',
  // Tables
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'col', 'colgroup',
  // Figures
  'figure', 'figcaption',
  // Interactive (safe)
  'details', 'summary', "button",
  // Controlled iframe (for video embeds — src is sanitized)
  'iframe',
]);

// ── Tags removed WITH their content ──────────────────
// These tags and everything inside them is stripped entirely.
// Content is NOT preserved because it is code, not user-visible text.
export const STRIP_CONTENT_TAGS = new Set([
  'script', 'style', 'object', 'embed', 'applet', 'param',
  'noscript', 'template', 'slot',
  'frame', 'frameset', 'xml', 'svg', 'math', 'canvas',
  'map', 'area', 'form', 'input',  'textarea',
  'select', 'option', 'optgroup', 'label', 'fieldset', 'legend',
  'datalist', 'output', 'progress', 'meter',
  'link', 'meta', 'base', 'title', 'head', 'html', 'body',
  'basefont', 'bgsound', 'blink', 'marquee', 'isindex',
  'plaintext', 'xmp', 'listing', 'nextid', 'spacer',
]);

// ── Per-tag allowed attributes ───────────────────────
// Global attributes (class, style, id, title, dir, lang)
// are allowed on ALL tags via the '*' key.
// Tag-specific attributes are listed per tag.
export const ALLOWED_ATTRS = {
  '*': ['class', 'style', 'id', 'title', 'dir', 'lang', 'role', 'tabindex', 'hidden', 'data-*'],

  'a': ['href', 'target', 'rel', 'name', 'download', 'type', 'hreflang'],
  'img': ['src', 'alt', 'width', 'height', 'loading', 'srcset', 'sizes', 'decoding', 'referrerpolicy', 'usemap', 'ismap'],
  'video': ['src', 'poster', 'controls', 'width', 'height', 'preload', 'muted', 'loop', 'autoplay', 'playsinline', 'crossorigin'],
  'audio': ['src', 'controls', 'preload', 'muted', 'loop', 'autoplay', 'crossorigin'],
  'source': ['src', 'type', 'media', 'sizes', 'srcset'],
  'track': ['src', 'kind', 'srclang', 'label', 'default'],
  'iframe': ['src', 'width', 'height', 'allow', 'allowfullscreen', 'frameborder', 'loading', 'name', 'referrerpolicy', 'sandbox', 'title'],

  'table': ['border', 'cellpadding', 'cellspacing', 'summary', 'width'],
  'td': ['colspan', 'rowspan', 'headers', 'scope', 'abbr', 'width', 'height', 'valign', 'align'],
  'th': ['colspan', 'rowspan', 'headers', 'scope', 'abbr', 'width', 'height', 'valign', 'align', 'sorted'],
  'tr': ['valign', 'align'],
  'col': ['span', 'width'],
  'colgroup': ['span', 'width'],
  'thead': ['valign', 'align'],
  'tbody': ['valign', 'align'],
  'tfoot': ['valign', 'align'],

  'ol': ['start', 'type', 'reversed'],
  'ul': ['type'],
  'li': ['value'],
  'dl': [],
  'dt': [],
  'dd': [],

  'blockquote': ['cite'],
  'q': ['cite'],
  'pre': ['width'],
  'code': [],
  'time': ['datetime'],
  'abbr': ['title'],
  'details': ['open'],
  'summary': [],
  'figure': [],
  'figcaption': [],
  'caption': [],
  'hr': ['width', 'size', 'noshade', 'align'],
  'br': ['clear'],
  'b': [],
  'i': [],
  's': [],
  'u': [],
  'mark': [],
  'sup': [],
  'sub': [],
  'small': [],
  'strong': [],
  'em': [],
  'span': [],
  'p': ['align'],
  'div': ['align'],
  'h1': ['align'],
  'h2': ['align'],
  'h3': ['align'],
  'h4': ['align'],
  'h5': ['align'],
  'h6': ['align'],
  'address': [],
  'kbd': [],
  'samp': [],
  'var': [],
  'wbr': [],
};

// ── URL attributes that need scheme sanitization ────
export const URL_ATTRS = new Set(['href', 'src', 'poster', 'cite', 'action', 'data', 'formaction', 'background', 'longdesc', 'usemap', 'profile', 'manifest', 'archive', 'codebase', 'icon', 'ping']);

// ── Allowed URL schemes ──────────────────────────────
// For general URL attributes (href, etc.)
export const ALLOWED_URL_SCHEMES = new Set([
  'http', 'https', 'mailto', 'tel', 'ftp', 'ftps',
  'sms', 'geo', 'news', 'irc', 'ircs', 'xmpp',
]);

// For image src attributes, also allow data:image/ URIs
export const ALLOWED_IMAGE_SCHEMES = new Set([
  'http', 'https', 'mailto', 'tel', 'ftp', 'ftps',
  'sms', 'geo', 'news', 'irc', 'ircs', 'xmpp',
  'data', // only data:image/... is allowed (checked separately)
]);

// ── Dangerous CSS patterns ───────────────────────────
// These patterns in style attribute values are stripped.
export const DANGEROUS_CSS_PATTERNS = [
  /expression\s*\(/gi,
  /javascript\s*:/gi,
  /vbscript\s*:/gi,
  /-moz-binding\s*:/gi,
  /behavior\s*:/gi,
  /@import\b/gi,
  /url\s*\(\s*['"]?\s*javascript\s*:/gi,
  /url\s*\(\s*['"]?\s*vbscript\s*:/gi,
  /url\s*\(\s*['"]?\s*data\s*:/gi,
];
