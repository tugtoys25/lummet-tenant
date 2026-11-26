# Website address layout (/en/, root or custom prefix)

Settings > General > **Website address** (administrators). Default is `/en/`; nothing changes until a different layout is saved.

- **Layout:** under `/en/` (default), at the root (`example.com/news`) or under a custom prefix (`example.com/us/news`).
- **Per page:** rules such as `/about = root`, `/news = en`, `/casino = custom`. A rule covers that page and everything below it; the longest rule wins.
- **Old links:** the old `/en/` address of a moved page answers 301 to the new address (browser page requests only; API and fetch calls are untouched). Can be switched off.
- **Always on /en/:** dashboard, admin and API addresses. Any route that already exists outside `/en/` (robots.txt, /media, /static ...) wins over a page with the same name; custom prefixes cannot use platform names (en, static, media, api, admin ...).

## How it works (no existing code changed)
The app keeps one internal shape, `/en/<page>`. `worker/url-layout.js` wraps the Worker entry: the public address is translated to `/en/...` on the way in, and `/en/...` page links in HTML, sitemap, robots and redirect headers are translated to the public address on the way out. Caches, controllers and templates are unchanged. With the default layout the wrapper returns the normal response without reading it.

Settings keys: `url_layout`, `url_custom_prefix`, `url_page_overrides`, `url_legacy_redirect`. Bad or missing values fall back to `/en/`; a database error also falls back to `/en/`.

Not verified live: the panel in a browser, a real deploy with root layout, search-engine behaviour after a move. Client-side scripts that build `/en/...` links still work (they redirect), they just take one extra hop.
