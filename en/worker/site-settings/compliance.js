import { escapeHtml } from "./helpers.js";

// ------------------------------------------------------------
// Render compliance logos safely
// ------------------------------------------------------------

export function buildComplianceHtml(siteSettings) {
  const items = siteSettings?.compliance || [];

  return items
    .map(item => {
      const image = escapeHtml(item.image);
      const alt = escapeHtml(item.alt);

      if (item.url) {
        return `
          <a
            href="${escapeHtml(item.url)}"
            target="_blank"
            rel="noopener noreferrer nofollow"
          >
            <img
              src="${image}"
              alt="${alt}"
              loading="lazy"
              decoding="async"
              style="height:36px;width:auto;object-fit:contain;"
            >
          </a>
        `;
      }

      return `
        <img
          src="${image}"
          alt="${alt}"
          loading="lazy"
          decoding="async"
          style="height:36px;width:auto;object-fit:contain;"
        >
      `;
    })
    .join("\n");
}
