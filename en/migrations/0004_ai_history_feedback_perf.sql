-- Adds the three tables introduced after the baseline: AI Studio history, AI feedback, performance samples.
-- Every statement is IF NOT EXISTS, so it is safe on a database that already has them.

CREATE TABLE IF NOT EXISTS ai_studio_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  user_label TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('generate', 'save')),
  task TEXT,
  target TEXT,
  item_type TEXT,
  item_key TEXT,
  outcome TEXT NOT NULL DEFAULT 'ok' CHECK (outcome IN ('ok', 'failed')),
  detail TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_studio_history_created ON ai_studio_history(created_at);

CREATE INDEX IF NOT EXISTS idx_ai_studio_history_user ON ai_studio_history(user_id, created_at);

CREATE TABLE IF NOT EXISTS ai_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  msg_ts INTEGER NOT NULL,
  rating TEXT NOT NULL CHECK (rating IN ('up', 'down')),
  reason TEXT,
  question TEXT,
  answer TEXT,
  country TEXT,
  reviewed INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  source TEXT,
  UNIQUE (session_id, msg_ts)
);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_created ON ai_feedback(created_at);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_rating ON ai_feedback(rating, reviewed, created_at);

CREATE TABLE IF NOT EXISTS perf_samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  path TEXT NOT NULL,
  route TEXT,
  state TEXT NOT NULL,
  ms INTEGER NOT NULL,
  status INTEGER,
  country TEXT
);

CREATE INDEX IF NOT EXISTS idx_perf_samples_at ON perf_samples(at);
