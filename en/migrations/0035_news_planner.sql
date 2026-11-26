-- Editor tools (additive, new tables only): planned dates for drafts shown on the calendar, and embargoes.
CREATE TABLE IF NOT EXISTS news_plan (
  news_id INTEGER PRIMARY KEY REFERENCES news(id) ON DELETE CASCADE,
  planned_at TEXT NOT NULL,
  created_by INTEGER,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_news_plan_at ON news_plan(planned_at);

CREATE TABLE IF NOT EXISTS news_embargo (
  news_id INTEGER PRIMARY KEY REFERENCES news(id) ON DELETE CASCADE,
  until_at TEXT NOT NULL,
  note TEXT,
  set_by INTEGER,
  set_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
