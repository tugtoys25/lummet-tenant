// Source-inspection helper: the admin script that used to be static/js/admin.js is now the
// files in static/js/admin/, loaded by templates/layout/base.html in a fixed order.
// Tests that look for code in it read the files as one text, in load order.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function adminScriptNames() {
  const base = readFileSync(join(ROOT, 'templates/layout/base.html'), 'utf-8');
  return [...base.matchAll(/<script defer src="\/static\/js\/admin\/([a-z0-9-]+)\.js"><\/script>/g)].map((m) => m[1]);
}

export function readAdminSource() {
  return adminScriptNames().map((n) => readFileSync(join(ROOT, `static/js/admin/${n}.js`), 'utf-8')).join('');
}
