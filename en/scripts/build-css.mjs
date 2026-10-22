// Builds the big stylesheets from their source parts.
//
//   css-src/<name>/NN-title.css  --(concatenated in file-name order)-->  static/css/<name>.css
//
// The browser still receives ONE file per stylesheet (no extra requests, no
// build step at deploy): the generated files are committed. Cascade order is
// the order of the parts, so a rule that must win goes in a later part.
//
//   node scripts/build-css.mjs          write static/css/<name>.css
//   node scripts/build-css.mjs --check  exit 1 if a generated file is out of date
//
// After changing a stylesheet run this and then `node scripts/asset-version.mjs`.
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export const BUNDLES = ["main", "dashboard", "supportive", "header-hero", "responsive"];

export function partsOf(name, base = root) {
  const dir = join(base, "css-src", name);
  return readdirSync(dir).filter((f) => /^\d\d-[a-z0-9-]+\.css$/.test(f)).sort();
}

export function buildBundle(name, base = root) {
  const dir = join(base, "css-src", name);
  return partsOf(name, base).map((f) => readFileSync(join(dir, f), "utf8")).join("");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let stale = 0;
  for (const name of BUNDLES) {
    const out = join(root, "static", "css", `${name}.css`);
    const want = buildBundle(name);
    const have = existsSync(out) ? readFileSync(out, "utf8") : "";
    if (process.argv.includes("--check")) {
      if (have !== want) { console.error(`static/css/${name}.css is out of date. Run: node scripts/build-css.mjs`); stale++; }
    } else if (have !== want) {
      writeFileSync(out, want);
      console.log(`written static/css/${name}.css (${partsOf(name).length} parts)`);
    }
  }
  if (stale) process.exit(1);
  if (process.argv.includes("--check")) console.log("stylesheets are current");
}
