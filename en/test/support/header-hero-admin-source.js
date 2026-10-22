// Source-inspection helper: Header & Hero admin (static/js/header-hero-admin.js) is an entry module plus
// the parts in static/js/header-hero-admin/, wired by the import map in templates/layout/base.html.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function headerHeroAdminPartNames() {
  return readdirSync(join(ROOT, 'static/js/header-hero-admin')).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3)).sort();
}

export function readHeaderHeroAdminSource() {
  const parts = headerHeroAdminPartNames().map((n) => readFileSync(join(ROOT, `static/js/header-hero-admin/${n}.js`), 'utf-8'));
  return [readFileSync(join(ROOT, 'static/js/header-hero-admin.js'), 'utf-8'), ...parts].join('\n');
}
