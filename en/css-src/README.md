# css-src: sources of the big stylesheets

`main.css`, `dashboard.css` and `supportive.css` in `static/css/` are generated from the parts in these folders by `node scripts/build-css.mjs`. Edit a part, run the script, then run `node scripts/asset-version.mjs`, and commit the parts and the generated files together. A test fails if a generated file is out of date.

- Parts are joined in file-name order (`01-…`, `02-…`), so the order is the cascade order.
- Each part starts at a top-level comment, between two rules (never inside a block).
- Keep a part under about 320 lines; add a new numbered part rather than growing one.
- The other stylesheets in `static/css/` are small and are edited directly.

This folder is not served (only `/static/` is).
