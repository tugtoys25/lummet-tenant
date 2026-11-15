-- API credentials and connection details for provider API integrations, managed from the dashboard (no Worker secret needed).
-- The key is stored encrypted (see worker/security/secret-box.js). Rows are optional: an older integration keeps working through the
-- Worker secret named by provider_adapter_configs.credential_reference.
CREATE TABLE IF NOT EXISTS provider_adapter_settings (
  config_id INTEGER PRIMARY KEY REFERENCES provider_adapter_configs(id) ON DELETE CASCADE,
  secret_enc TEXT,
  auth_query_param TEXT,
  date_format TEXT NOT NULL DEFAULT 'iso',
  extra_query TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
