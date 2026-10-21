import { readdirSync, readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
const a = process.argv.slice(2);
const db = a[a.indexOf("--db") + 1];
const remote = a.includes("--remote");
const dry = a.includes("--dry-run");
if (!db || a.indexOf("--db") < 0) { console.error("Usage: node tenant-migrate.mjs --db <name> [--remote] [--dry-run]"); process.exit(2); }
const DIR = "en/migrations";
const TOLERATED = /duplicate column name|already exists/i;
function wr(args) {
  const full = ["d1", "execute", db, ...args, remote ? "--remote" : "--local", "--yes"];
  return execFileSync("wrangler", full, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}
const cmd = (sql) => wr(["--command", sql, "--json"]);
const file = (p) => wr(["--file", p]);
const strip = (s) => s.split("\n").map((l) => { const i = l.indexOf("--"); return i < 0 ? l : l.slice(0, i); }).join("\n");
const stmts = (s) => strip(s).split(";").map((x) => x.trim()).filter(Boolean);
const errText = (e) => String(e.stderr || "") + String(e.stdout || "") + String(e.message || "");
cmd("CREATE TABLE IF NOT EXISTS tenant_migrations (filename TEXT PRIMARY KEY, applied_at TEXT DEFAULT CURRENT_TIMESTAMP);");
let applied = new Set();
try { const r = JSON.parse(cmd("SELECT filename FROM tenant_migrations;")); applied = new Set((r[0]?.results || []).map((x) => x.filename)); } catch {}
const files = readdirSync(DIR).filter((f) => f.endsWith(".sql") && !f.toLowerCase().includes("rollback"));
const order = [...files.filter((f) => f === "schema.sql"), ...files.filter((f) => f !== "schema.sql").sort()];
const pending = order.filter((f) => !applied.has(f));
console.log(`${pending.length} pending of ${order.length}`);
if (dry) { pending.forEach((f) => console.log("  -", f)); process.exit(0); }
for (const f of pending) {
  const path = join(DIR, f);
  process.stdout.write(`Applying ${f} ... `);
  let mode = "whole";
  try { file(path); }
  catch (e) {
    if (!TOLERATED.test(errText(e))) { console.log("FAILED\n" + errText(e)); process.exit(1); }
    mode = "per-statement";
    let skipped = 0;
    for (const s of stmts(readFileSync(path, "utf8"))) {
      try { const t = join(mkdtempSync(join(tmpdir(), "m-")), "s.sql"); writeFileSync(t, s + ";"); file(t); }
      catch (e2) {
        if (TOLERATED.test(errText(e2))) { skipped++; continue; }
        console.log("FAILED on statement:\n" + s + "\n" + errText(e2)); process.exit(1);
      }
    }
    mode += ` (${skipped} already-present skipped)`;
  }
  cmd(`INSERT OR IGNORE INTO tenant_migrations (filename) VALUES ('${f.replace(/'/g, "''")}');`);
  console.log("ok, " + mode);
}
console.log("Done.");
