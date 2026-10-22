// Source-inspection helper: the Super API route table used to be written in worker/super/router.js. Since v22.59 it is
// written in worker/super/routes/*.js and joined by router.js. Tests that look for a route or a handler in the
// router read the router and the route files as one text.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SUPER = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'worker', 'super');

export function readRouterSource() {
  const routes = readdirSync(join(SUPER, 'routes')).filter((f) => f.endsWith('.js')).sort();
  return [readFileSync(join(SUPER, 'router.js'), 'utf-8'), ...routes.map((f) => readFileSync(join(SUPER, 'routes', f), 'utf-8'))].join('\n');
}
