// test/support/d1-shim.js
//
// A minimal, D1-API-compatible wrapper around Node's built-in
// node:sqlite (Node 22+, no npm install required). This exists
// because this repository has NO test framework, NO package.json, and
// no network access to install one (@cloudflare/vitest-pool-workers,
// the real way to test Workers+D1, requires npm). Rather than skip
// tests entirely or write fake ones, this shim lets the ACTUAL worker
// database modules run against a real (in-memory) SQLite database
// through the exact same .prepare(sql).bind(...).all()/.first()/.run()
// interface they call in production against D1.
//
// Known limitations (documented, not hidden):
// - D1 is SQLite-based but not byte-for-byte identical (subtle dialect
//   differences can exist between D1's engine version and node:sqlite's
//   bundled SQLite). Every query used by this codebase's analytics/
//   reports/alerts modules was manually verified to work identically
//   under node:sqlite (FILTER clause, ON CONFLICT upsert, date()) --
//   see the verification run in the commit that added this file.
// - No KV, R2, or Workers runtime globals (crypto.randomUUID IS
//   available in Node 22, so that one just works).
// - .run() returns { success: true, meta: { last_row_id, changes } },
//   matching D1's shape closely enough for the code under test, but is
//   not a guarantee of exact parity with every D1 meta field.
//
// This is a testing aid, not a claim that passing these tests
// guarantees identical behavior on real D1 -- it substantially reduces
// risk on the logic that matters most (item-access scoping, KPI math,
// aggregation correctness) without needing network access.

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitStatements } from '../../scripts/sql-statements.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', '..', 'migrations');

/**
 * Wraps a node:sqlite prepared-statement handle so it matches D1's
 * PreparedStatement API (bind returns a bindable, chainable object;
 * .all()/.first()/.run() are async in D1 -- kept async here too so
 * calling code doesn't need to know the difference).
 */
function wrapStatement(sqliteDb, sql) {
  return {
    bind(...params) {
      const stmt = sqliteDb.prepare(sql);
      const boundParams = params.map(p => (p === undefined ? null : p));
      return {
        async all() {
          const rows = stmt.all(...boundParams);
          return { results: rows, success: true };
        },
        async first() {
          const row = stmt.get(...boundParams);
          return row === undefined ? null : row;
        },
        async run() {
          const result = stmt.run(...boundParams);
          return {
            success: true,
            meta: { last_row_id: Number(result.lastInsertRowid), changes: result.changes }
          };
        }
      };
    },
    // Some call sites in this codebase call .all()/.first()/.run()
    // directly on the prepared statement with no .bind() when there
    // are no parameters -- support that too.
    async all() { return this.bind().all(); },
    async first() { return this.bind().first(); },
    async run() { return this.bind().run(); }
  };
}

export function createTestDb() {
  const sqliteDb = new DatabaseSync(':memory:');
  sqliteDb.exec('PRAGMA foreign_keys = OFF;'); // off while the schema is built; applyMigrations() turns it on

  return {
    prepare(sql) {
      return wrapStatement(sqliteDb, sql);
    },
    // D1's db.batch([...bound statements]): runs them in order inside one
    // transaction (all-or-nothing) and returns one result per statement.
    async batch(statements) {
      sqliteDb.exec('BEGIN');
      try {
        const out = [];
        for (const st of statements) {
          out.push(await st.run());
        }
        sqliteDb.exec('COMMIT');
        return out;
      } catch (err) {
        sqliteDb.exec('ROLLBACK');
        throw err;
      }
    },
    // exposed for fixture setup that wants raw exec (multi-statement
    // migration files) rather than the single-statement .prepare() path
    _exec(sql) {
      sqliteDb.exec(sql);
    },
    _raw: sqliteDb
  };
}

/**
 * Runs every migration file in /migrations, in filename order, against
 * a fresh test DB -- so tests run against the REAL schema, not a
 * hand-maintained copy that could drift from it.
 */
/**
 * Runs every migration file in /migrations, in filename order, against
 * a fresh test DB -- so tests run against the REAL schema, not a
 * hand-maintained copy that could drift from it.
 *
 * This repository has NO automated D1 migration tracking (no
 * migrations_dir/d1_migrations table in wrangler config) -- every
 * migration is applied by hand, per tenant database (there are 7+
 * separate tenant DBs sharing this codebase), via individual
 * `wrangler d1 execute`. That means schema.sql (a periodically
 * re-exported full-schema snapshot) and the numbered migration files
 * can legitimately overlap -- e.g. schema.sql already contains a
 * column that 0002_phase2_upgrade.sql also tries to ADD, because
 * schema.sql was re-exported from a DB where 0002 had already run.
 * Running schema.sql followed by every numbered migration (the only
 * way to test against the actual current full schema, since no single
 * file is guaranteed current for every tenant) surfaces exactly the
 * "duplicate column"/"table already exists" errors a human operator
 * re-running an already-applied migration against one tenant's DB
 * would also hit -- so those specific error classes are tolerated
 * per-statement here, matching the real operational reality of this
 * codebase, while any OTHER SQL error still fails loudly (that's a
 * real bug, not drift).
 */
export function applyMigrations(testDb) {
  // en/migrations/ holds only numbered forward files (0001_..., 0002_...). Each one is idempotent
  // (CREATE ... IF NOT EXISTS, INSERT OR IGNORE), so applying runs them in name order and any error
  // is a real error: nothing is tolerated.
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
    for (const statement of splitStatements(sql)) {
      try {
        testDb._exec(statement);
      } catch (e) {
        throw new Error(`Migration ${file} failed against the test DB on statement:\n${statement}\n\n${e.message}`);
      }
    }
  }
  // D1 enforces foreign keys (ON DELETE CASCADE and friends). Switch it on once the schema is in place, so tests
  // see the same behaviour; the earlier migrations did this with a PRAGMA inside the files.
  testDb._exec('PRAGMA foreign_keys = ON;');
}
