// Splits a SQL script into statements the way SQLite does: ';' inside quotes, comments and
// CREATE TRIGGER ... BEGIN ... END bodies does not end a statement. Comments are dropped.
export function splitSql(sql) {
  const out = []; let cur = ''; let i = 0; const n = sql.length;
  const flush = () => { const s = cur.trim(); if (s) out.push(s); cur = ''; };
  while (i < n) {
    const c = sql[i];
    if (c === "'" || c === '"' || c === '`') {
      const q = c; cur += c; i++;
      while (i < n) { cur += sql[i]; if (sql[i] === q) { if (sql[i + 1] === q) { cur += sql[i + 1]; i += 2; continue; } i++; break; } i++; }
      continue;
    }
    if (c === '-' && sql[i + 1] === '-') { while (i < n && sql[i] !== '\n') i++; continue; }
    if (c === '/' && sql[i + 1] === '*') { const e = sql.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === ';') {
      const head = cur.trim();
      if (/^CREATE\s+(TEMP\s+|TEMPORARY\s+)?TRIGGER\b/i.test(head) && !/;\s*END$/i.test(head)) { cur += c; i++; continue; }
      flush(); i++; continue;
    }
    cur += c; i++;
  }
  flush();
  return out;
}
