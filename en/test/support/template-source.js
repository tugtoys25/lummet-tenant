// Source-inspection helper: templates can include parts with <!--@include path--> (see expandIncludes in
// worker/render.js). This reads a file under en/ and expands the includes, like the renderer does.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const INCLUDE_RE = /<!--@include ([A-Za-z0-9_\/.-]+\.html)-->/g;

export function expandTemplateSync(text, depth = 0) {
  if (!text.includes('<!--@include ')) return text;
  if (depth > 4) throw new Error('includes nested too deeply');
  return text.replace(INCLUDE_RE, (_, name) => expandTemplateSync(readFileSync(join(ROOT, 'templates', name), 'utf-8'), depth + 1));
}

export function readTemplateSource(relPath) {
  return expandTemplateSync(readFileSync(join(ROOT, relPath), 'utf-8'));
}
