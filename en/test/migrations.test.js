import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const files = readdirSync(DIR).sort();

describe('migrations folder layout (baseline + additive files)', () => {
  test('only numbered .sql files, contiguous from 0001, no duplicates, no rollback or schema files', () => {
    assert.ok(files.every((f) => /^[0-9]{4}_[a-z0-9_]+\.sql$/.test(f)), files.join());
    files.forEach((f, i) => assert.equal(f.slice(0, 4), String(i + 1).padStart(4, '0'), f));
    assert.ok(!files.some((f) => /rollback|schema\.sql|backup/i.test(f)));
  });
  test('applying the whole folder twice works and changes nothing', () => {
    const db = new DatabaseSync(':memory:');
    for (const f of files) db.exec(readFileSync(join(DIR, f), 'utf-8'));
    const snap = () => JSON.stringify(db.prepare("select name, sql from sqlite_master order by name").all());
    const before = snap();
    for (const f of files) db.exec(readFileSync(join(DIR, f), 'utf-8'));
    assert.equal(snap(), before);
  });
  test('the three newest tables exist', () => {
    const db = new DatabaseSync(':memory:');
    for (const f of files) db.exec(readFileSync(join(DIR, f), 'utf-8'));
    const names = db.prepare("select name from sqlite_master where type='table'").all().map((r) => r.name);
    for (const t of ['ai_feedback', 'ai_studio_history', 'perf_samples']) assert.ok(names.includes(t), t);
  });
});
