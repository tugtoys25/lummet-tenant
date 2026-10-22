// Source-inspection helper: the admin API lives in worker/api.js plus the modules under
// worker/api/. Tests that check how the API is wired read them as one text, in the order
// they run (entry, public routes, sign-in check, platform routes, route groups, helpers).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf-8');

export function apiModuleFiles() {
  const registry = read('worker/api/routes/index.js');
  const groups = [...registry.matchAll(/from "\.\/([a-z0-9-]+)\.js"/g)].map((m) => `worker/api/routes/${m[1]}.js`);
  return ['worker/api.js', 'worker/api/public.js', 'worker/api/gate.js', 'worker/api/platform.js', ...groups, 'worker/api/helpers.js'];
}

export function readApiSource() {
  return apiModuleFiles().map(read).join('\n');
}
