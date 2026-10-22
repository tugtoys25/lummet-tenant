// Source-inspection helper: the editor that used to be one file (static/js/rich-editor.js) is an entry
// module plus the parts in static/js/rich-editor/, wired together by the import map in templates/layout/base.html.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function richEditorPartNames() {
  return readdirSync(join(ROOT, 'static/js/rich-editor')).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3)).sort();
}

export function readRichEditorSource() {
  const parts = richEditorPartNames().map((n) => readFileSync(join(ROOT, `static/js/rich-editor/${n}.js`), 'utf-8'));
  return [readFileSync(join(ROOT, 'static/js/rich-editor.js'), 'utf-8'), ...parts].join('\n');
}
