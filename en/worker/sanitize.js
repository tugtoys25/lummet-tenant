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

// The code lives in sanitize/*.js (see docs/ARCHITECTURE_SANITIZE.md); this file keeps the public import path.
export { escapeHtml, sanitizeUrl, sanitizeStyle } from "./sanitize/values.js";
export { sanitizeHtml } from "./sanitize/pipeline.js";
