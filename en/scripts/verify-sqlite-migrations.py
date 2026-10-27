#!/usr/bin/env python3
"""Apply every tenant migration to an empty SQLite database as a syntax/order rehearsal."""
import sqlite3
from pathlib import Path
root=Path(__file__).resolve().parents[1]
files=sorted(p for p in (root/'migrations').glob('*.sql') if p.name!='schema.sql')
conn=sqlite3.connect(':memory:')
for file in files:
    try: conn.executescript(file.read_text())
    except Exception as exc:
        raise SystemExit(f'FAIL {file.name}: {exc}')
print(f'PASS tenant migrations={len(files)} last={files[-1].name}')
