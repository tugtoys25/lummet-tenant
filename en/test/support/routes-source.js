// Source-inspection helper: the router (worker/routes.js) is an entry plus the groups in worker/routing/.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function readRoutesSource() {
  const parts = readdirSync(join(ROOT, 'worker/routing')).filter((f) => f.endsWith('.js')).sort().map((f) => readFileSync(join(ROOT, 'worker/routing', f), 'utf-8'));
  return [readFileSync(join(ROOT, 'worker/routes.js'), 'utf-8'), ...parts].join('\n');
}
