-- Earnings tools: payouts and invoices, promo codes, creatives, and the promo code a postback carried.
CREATE TABLE IF NOT EXISTS payouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program_id INTEGER REFERENCES affiliate_programs(id),
  account_id INTEGER REFERENCES affiliate_accounts(id),
  period_start TEXT,
  period_end TEXT,
  amount REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'expected',
  invoice_number TEXT,
  paid_at TEXT,
  reference TEXT,
  notes TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_payouts_program ON payouts(program_id, currency, status);

CREATE TABLE IF NOT EXISTS promo_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  program_id INTEGER REFERENCES affiliate_programs(id),
  casino_id INTEGER REFERENCES casinos(id),
  tracking_link_id INTEGER REFERENCES tracking_links(id),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  starts_at TEXT,
  ends_at TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS creatives (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'banner',
  program_id INTEGER REFERENCES affiliate_programs(id),
  tracking_link_id INTEGER REFERENCES tracking_links(id),
  asset_url TEXT,
  width INTEGER,
  height INTEGER,
  body_text TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conversion_promo (
  conversion_id INTEGER PRIMARY KEY REFERENCES analytics_conversions(id) ON DELETE CASCADE,
  promo_code TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conversion_promo_code ON conversion_promo(promo_code);
