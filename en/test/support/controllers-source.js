// Source-inspection helper: the page controllers live in worker/controllers.js (a re-export
// file) plus the modules under worker/controllers/. Tests that check how a page is built read
// them as one text.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function controllerFiles() {
  const dir = join(ROOT, 'worker/controllers');
  const top = readdirSync(dir, { withFileTypes: true });
  const files = top.filter((e) => e.isFile() && e.name.endsWith('.js')).map((e) => `worker/controllers/${e.name}`);
  // modules split into a folder of parts (for example controllers/news.js + controllers/news/*.js)
  for (const e of top.filter((x) => x.isDirectory())) for (const f of readdirSync(join(dir, e.name)).filter((n) => n.endsWith('.js'))) files.push(`worker/controllers/${e.name}/${f}`);
  return ['worker/controllers.js', ...files.sort()];
}

export function readControllersSource() {
  return controllerFiles().map((f) => readFileSync(join(ROOT, f), 'utf-8')).join('\n');
}
