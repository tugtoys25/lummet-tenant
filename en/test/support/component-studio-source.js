// Source-inspection helper: the Component Studio script (static/js/component-studio.js) is an entry module plus
// the parts in static/js/component-studio/, wired by the import map in templates/layout/base.html.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function componentStudioPartNames() {
  return readdirSync(join(ROOT, 'static/js/component-studio')).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3)).sort();
}

export function readComponentStudioSource() {
  const parts = componentStudioPartNames().map((n) => readFileSync(join(ROOT, `static/js/component-studio/${n}.js`), 'utf-8'));
  return [readFileSync(join(ROOT, 'static/js/component-studio.js'), 'utf-8'), ...parts].join('\n');
}
