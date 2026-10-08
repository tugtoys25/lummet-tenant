// Reserved top-level URL segments. A new custom_content_types.slug
// must never collide with one of these, since /en/custom/{typeSlug}
// sits alongside every other top-level route in this file and the
// FALLBACK DYNAMIC PAGE ENGINE catch-all in routes.js matches
// /en/(.+) -- i.e. almost anything not caught earlier. This list is
// the single source of truth for "anything already spoken for",
// checked by the (future) custom-type creation admin form and
// defensively at the point a custom type is looked up.

export const RESERVED_SLUGS = new Set([
  "casino", "review", "news", "updates", "author", "country", "category",
  "payment-methods", "affiliate", "affiliate-partner", "go", "sportsbook",
  "custom", "compare", "dashboard", "login", "register", "forgot-password",
  "reset-password", "user", "media", "favicon.ico", "sitemap", "sitemap.xml",
  "robots.txt", "api",
]);

export function isReservedSlug(slug) {
  return RESERVED_SLUGS.has(String(slug || "").toLowerCase());
}
