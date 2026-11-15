-- Report-style provider APIs return totals (visits, registrations, first deposits, income) per day, not one row per conversion.
-- They are kept here so the dashboard can set them beside what this site tracked itself.
CREATE TABLE IF NOT EXISTS provider_adapter_mode (
  config_id INTEGER PRIMARY KEY REFERENCES provider_adapter_configs(id) ON DELETE CASCADE,
  result_mode TEXT NOT NULL DEFAULT 'conversions'
);
CREATE TABLE IF NOT EXISTS provider_report_rows (
  config_id INTEGER NOT NULL REFERENCES provider_adapter_configs(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  group_key TEXT NOT NULL DEFAULT '',
  metrics_json TEXT NOT NULL,
  currency TEXT,
  fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (config_id, period, group_key)
);
