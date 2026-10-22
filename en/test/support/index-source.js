// Source-inspection helper: the router that used to be all of worker/index.js is now index.js (the wrapper)
// plus worker/app/*.js and the route groups in worker/app/routes/*.js.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ls = (d) => readdirSync(join(ROOT, d)).filter((f) => f.endsWith('.js')).sort().map((f) => join(ROOT, d, f));

export function readIndexSource() {
  return [join(ROOT, 'worker/index.js'), ...ls('worker/app'), ...ls('worker/app/routes')].map((f) => readFileSync(f, 'utf-8')).join('\n');
}
