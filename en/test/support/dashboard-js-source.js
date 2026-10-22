// Source-inspection helper: the script that used to be static/js/dashboard.js is now the files
// in static/js/dashboard/, loaded by templates/layout/base.html in a fixed order.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function dashboardScriptNames() {
  const base = readFileSync(join(ROOT, 'templates/layout/base.html'), 'utf-8');
  return [...base.matchAll(/<script defer src="\/static\/js\/dashboard\/([a-z0-9-]+)\.js"><\/script>/g)].map((m) => m[1]);
}

export function readDashboardSource() {
  return dashboardScriptNames().map((n) => readFileSync(join(ROOT, `static/js/dashboard/${n}.js`), 'utf-8')).join('');
}
