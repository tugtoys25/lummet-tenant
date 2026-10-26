-- Phase 5.4: tenant-local storage metering and optional platform-supplied cap.
-- NULL cap means not configured; upload code preserves legacy behavior until a trusted platform sync sets it.
CREATE TABLE IF NOT EXISTS platform_storage_limits (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  max_bytes INTEGER CHECK (max_bytes IS NULL OR max_bytes >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS platform_storage_usage_snapshots (
  day TEXT PRIMARY KEY CHECK (length(day) = 10),
  bytes_used INTEGER NOT NULL CHECK (bytes_used >= 0),
  captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
