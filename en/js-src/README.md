# js-src

Source parts of public scripts (`app`, `lummet-ai`, `research-pdf-export`, `ai-studio`, `newsroom-admin`, `component-admin`). An optional `_head.js` and `_tail.js` hold the opening and closing lines of a function wrapper. `node scripts/build-js.mjs` joins `js-src/<name>/NN-title.js` in file-name order into `static/js/<name>.js`; the generated file is committed and is what the browser loads (one request, no build step at deploy). Edit the parts, never the generated file, then run the script and `node scripts/asset-version.mjs`. See `docs/ARCHITECTURE_JS.md`.
