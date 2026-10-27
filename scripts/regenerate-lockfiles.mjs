#!/usr/bin/env node
/** Regenerate tenant root and worker lockfiles using npm, never by hand. */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const cwd of [root, path.join(root, 'en')]) {
  console.log(`\n==> npm install --package-lock-only --ignore-scripts --no-audit --no-fund (${path.relative(root, cwd) || '.'})`);
  const r = spawnSync('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd, stdio: 'inherit', timeout: 180000 });
  if (r.error || r.status !== 0) { console.error(`LOCKFILE REGENERATION FAILED in ${cwd}: ${r.error?.message || `npm exited ${r.status}`}`); console.error('Restore registry access, rerun this script, then run lockfile-check and npm ci in both package roots. Never fake lockfiles.'); process.exit(1); }
}
const r = spawnSync(process.execPath, [path.join(root, 'scripts/lockfile-check.mjs')], { cwd: root, stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status || 1);
console.log('Tenant lockfiles regenerated and verified. Run npm ci in the root and en/ roots.');
