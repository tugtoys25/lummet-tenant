// Builds the public scripts that are written as source parts.
//
//   js-src/<name>/NN-title.js  --(concatenated in file-name order)-->  static/js/<name>.js
//   js-src/<name>/_head.js and _tail.js (optional) are put before and after the parts: a script that is one
//   function wrapper keeps its opening line in _head.js and its closing line in _tail.js, and the parts are
//   the statements inside it.
//
// The browser still receives ONE file per script (no extra requests, no build step at deploy):
// the generated files are committed, like the stylesheets built by build-css.mjs. These are classic
// scripts, so the order of the parts is the order the code runs in, and every part must be whole
// top-level statements (a part is checked on its own).
//
//   node scripts/build-js.mjs          write static/js/<name>.js
//   node scripts/build-js.mjs --check  exit 1 if a generated file is out of date
//
// After changing a script run this and then `node scripts/asset-version.mjs`.
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export const BUNDLES = ["app", "lummet-ai", "research-pdf-export", "ai-studio", "newsroom-admin", "component-admin"];

export function partsOf(name, base = root) {
  const dir = join(base, "js-src", name);
  return readdirSync(dir).filter((f) => /^\d\d-[a-z0-9-]+\.js$/.test(f)).sort();
}

export function wrapOf(name, file, base = root) {
  const p = join(base, "js-src", name, file);
  return existsSync(p) ? readFileSync(p, "utf8") : "";
}

export function buildBundle(name, base = root) {
  const dir = join(base, "js-src", name);
  return wrapOf(name, "_head.js", base) + partsOf(name, base).map((f) => readFileSync(join(dir, f), "utf8")).join("") + wrapOf(name, "_tail.js", base);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let stale = 0;
  for (const name of BUNDLES) {
    const out = join(root, "static", "js", `${name}.js`);
    const want = buildBundle(name);
    const have = existsSync(out) ? readFileSync(out, "utf8") : "";
    if (process.argv.includes("--check")) {
      if (have !== want) { console.error(`static/js/${name}.js is out of date. Run: node scripts/build-js.mjs`); stale++; }
    } else if (have !== want) {
      writeFileSync(out, want);
      console.log(`written static/js/${name}.js (${partsOf(name).length} parts)`);
    }
  }
  if (stale) process.exit(1);
  if (process.argv.includes("--check")) console.log("scripts are current");
}
