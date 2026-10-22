// Splits a migration file into single statements: strips "--" comments (outside quotes) and keeps
// CREATE TRIGGER ... BEGIN ... END; together, because its body contains semicolons.
export function splitStatements(sql) {
  let out = '', q = null;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (q) { out += c; if (c === q) { if (sql[i + 1] === q) out += sql[++i]; else q = null; } continue; }
    if (c === "'" || c === '"') { q = c; out += c; continue; }
    if (c === '-' && sql[i + 1] === '-') { while (i < sql.length && sql[i] !== '\n') i++; out += '\n'; continue; }
    out += c;
  }
  const stmts = []; let cur = '', depthTrigger = false; q = null;
  for (let i = 0; i < out.length; i++) {
    const c = out[i]; cur += c;
    if (q) { if (c === q) { if (out[i + 1] === q) cur += out[++i]; else q = null; } continue; }
    if (c === "'" || c === '"') { q = c; continue; }
    if (c === ';') {
      const text = cur.trim();
      if (/^CREATE\s+(TEMP(ORARY)?\s+)?TRIGGER\b/i.test(text) && !/\bEND\s*;$/i.test(text)) continue;
      if (text !== ';') stmts.push(text);
      cur = '';
    }
  }
  if (cur.trim()) stmts.push(cur.trim());
  return stmts;
}
