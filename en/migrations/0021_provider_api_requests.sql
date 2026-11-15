-- How a provider API integration asks for its data: GET or POST, an optional JSON body, and page-by-page fetching.
CREATE TABLE IF NOT EXISTS provider_adapter_request (
  config_id INTEGER PRIMARY KEY REFERENCES provider_adapter_configs(id) ON DELETE CASCADE,
  http_method TEXT NOT NULL DEFAULT 'GET',
  body_json TEXT,
  paging TEXT NOT NULL DEFAULT 'none',
  page_size INTEGER NOT NULL DEFAULT 100,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
