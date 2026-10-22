#!/usr/bin/env node
// Compares a D1 schema export (for example the file the "D1 schema export" tool produces) with the
// schema that en/migrations/ builds, and prints what is missing or different.
//
//   node scripts/check-schema.mjs <export.sql>            report; exit code 1 when something is missing
//   node scripts/check-schema.mjs <export.sql> --fix      also print SQL that repairs what can be repaired
//   node scripts/check-schema.mjs --self                  only prove that migrations/ applies twice cleanly
//
// What it checks: tables, columns (name, type, NOT NULL, default, primary key), indexes, triggers.
// Extra objects in the export (Cloudflare and wrangler bookkeeping tables, backups) are listed but are not an error.
// --fix prints CREATE statements for missing tables, indexes and triggers and ALTER TABLE ... ADD COLUMN for
// missing columns that SQLite can add; anything else is reported as "needs a manual step".
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitStatements } from './sql-statements.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS = join(ROOT, 'migrations');
const BOOKKEEPING = new Set(['_cf_KV', 'd1_migrations', 'tenant_migrations']);

export function migrationFiles() { return readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort(); }

export function buildExpected() {
  const db = new DatabaseSync(':memory:');
  for (const f of migrationFiles()) for (const st of splitStatements(readFileSync(join(MIGRATIONS, f), 'utf8'))) db.exec(st);
  return db;
}

function describe(db) {
  const objects = db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  const columns = {};
  for (const o of objects.filter((x) => x.type === 'table')) columns[o.name] = db.prepare(`PRAGMA table_xinfo("${o.name}")`).all();
  return { objects, columns };
}
const norm = (s) => (s || '').replace(/IF NOT EXISTS /gi, '').replace(/\s+/g, ' ').replace(/ ?([(),]) ?/g, '$1').trim().toLowerCase();

export function compare(expectedDb, actualDb) {
  const exp = describe(expectedDb), act = describe(actualDb);
  const problems = [], fixes = [], extra = [];
  const has = (d, type, name) => d.objects.find((o) => o.type === type && o.name === name);
  for (const o of exp.objects.filter((x) => x.type === 'table')) {
    if (!has(act, 'table', o.name)) { problems.push(`missing table ${o.name}`); fixes.push(o.sql.replace(/^CREATE TABLE /i, 'CREATE TABLE IF NOT EXISTS ') + ';'); continue; }
    const have = new Map(act.columns[o.name].map((c) => [c.name, c]));
    for (const c of exp.columns[o.name]) {
      const h = have.get(c.name);
      if (!h) {
        problems.push(`missing column ${o.name}.${c.name}`);
        const addable = !c.pk && !(c.notnull && c.dflt_value === null) && !/\bUNIQUE\b/i.test(columnSql(o.sql, c.name));
        fixes.push(addable ? `ALTER TABLE ${o.name} ADD COLUMN ${columnSql(o.sql, c.name)};` : `-- needs a manual step: ${o.name}.${c.name} cannot be added with ALTER TABLE (${columnSql(o.sql, c.name)})`);
      } else if ((h.type || '').toUpperCase() !== (c.type || '').toUpperCase() || h.notnull !== c.notnull || (h.dflt_value ?? null) !== (c.dflt_value ?? null) || h.pk !== c.pk) {
        problems.push(`different column ${o.name}.${c.name}: expected ${c.type} notnull=${c.notnull} default=${c.dflt_value} pk=${c.pk}, found ${h.type} notnull=${h.notnull} default=${h.dflt_value} pk=${h.pk}`);
      }
    }
    for (const n of have.keys()) if (!exp.columns[o.name].some((c) => c.name === n)) extra.push(`extra column ${o.name}.${n}`);
  }
  for (const type of ['index', 'trigger']) for (const o of exp.objects.filter((x) => x.type === type)) {
    const h = has(act, type, o.name);
    if (!h) { problems.push(`missing ${type} ${o.name}`); fixes.push(o.sql.replace(/^CREATE (UNIQUE )?(INDEX|TRIGGER) /i, (m, u, t) => `CREATE ${u || ''}${t} IF NOT EXISTS `) + ';'); }
    else if (norm(h.sql) !== norm(o.sql)) problems.push(`different ${type} ${o.name}`);
  }
  for (const o of act.objects.filter((x) => x.type === 'table' && !has(exp, 'table', x.name))) extra.push(BOOKKEEPING.has(o.name) ? `bookkeeping table ${o.name}` : `extra table ${o.name}`);
  for (const type of ['index', 'trigger']) for (const o of act.objects.filter((x) => x.type === type && !has(exp, type, x.name))) extra.push(`extra ${type} ${o.name}`);
  return { problems, fixes, extra };
}

// "name TYPE ..." definition of one column, taken from the CREATE TABLE text
function columnSql(createSql, name) {
  const body = createSql.slice(createSql.indexOf('(') + 1, createSql.lastIndexOf(')'));
  let depth = 0, cur = '', q = null; const parts = [];
  for (const ch of body) { if (q) { cur += ch; if (ch === q) q = null; continue; } if (ch === "'" || ch === '"') { q = ch; cur += ch; continue; } if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; continue; } cur += ch; }
  parts.push(cur.trim());
  return (parts.find((p) => new RegExp(`^["\`]?${name}["\`]?\\s`).test(p)) || name).replace(/\s+/g, ' ');
}

export function loadExport(path) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec(readFileSync(path, 'utf8').replace(/PRAGMA foreign_keys\s*=\s*ON;/gi, ''));
  return db;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const expected = buildExpected();
  if (args.includes('--self')) {
    const files = migrationFiles();
    const snapshot = () => JSON.stringify(expected.prepare("SELECT type, name, sql FROM sqlite_master ORDER BY type, name").all());
    const before = snapshot();
    for (const f of files) for (const st of splitStatements(readFileSync(join(MIGRATIONS, f), 'utf8'))) expected.exec(st);
    console.log(`${files.length} migration files apply twice with no error; schema ${snapshot() === before ? 'unchanged' : 'CHANGED'} by the second run.`);
    process.exit(snapshot() === before ? 0 : 1);
  }
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) { console.error('usage: node scripts/check-schema.mjs <export.sql> [--fix] | --self'); process.exit(2); }
  const { problems, fixes, extra } = compare(expected, loadExport(file));
  if (extra.length) console.log(`Not in migrations (${extra.length}, not an error):\n${extra.map((e) => '  ' + e).join('\n')}\n`);
  if (!problems.length) { console.log('The database matches the migrations.'); process.exit(0); }
  console.log(`Differences (${problems.length}):\n${problems.map((p) => '  ' + p).join('\n')}`);
  if (args.includes('--fix')) console.log(`\n-- SQL that repairs what can be repaired:\n${fixes.join('\n')}`);
  process.exit(1);
}
