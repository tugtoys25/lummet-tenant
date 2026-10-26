-- Phase 5.4: short-lived byte reservations so concurrent uploads cannot jointly exceed the cap.
CREATE TABLE IF NOT EXISTS platform_storage_reservations (
  id TEXT PRIMARY KEY,
  bytes INTEGER NOT NULL CHECK (bytes >= 0),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_storage_reservations_expiry ON platform_storage_reservations(expires_at);
