# Newsroom content import

Switch (Newsroom > Flags, off by default): `news_import`. Then Newsroom > Import (manage-settings permission).

Formats: WordPress export (.xml, posts only), any RSS or Atom file, CSV with a header row (title, content, slug, excerpt, published_at, author, tags, url).

Safety: everything is created as a draft, never published. HTML goes through the site sanitiser. An address (slug) that already exists, or repeats inside the file, is skipped and never overwritten. Run the same file twice and the second run adds nothing. Up to 300 articles and 2 MB per run; split larger exports.

Old addresses: the last part of the old address is kept working through the existing news redirects when it differs from the new slug. Each run has a downloadable old-address to new-address CSV for setting up redirects for the full old paths (for example /2020/05/first-post/) at your DNS or edge.

Not covered: images are not copied (they stay as links to the old site, so keep the old site up or move images separately), comments, categories as sections, pages.
