-- Phase 6B: make the history tamper-resistant at the database level, not only by convention.
-- The audit log can never be edited or deleted, and a published version's document can never be rewritten.
-- Forward-only and idempotent (safe to run twice). Needs 0009_config_versions.sql first.
CREATE TRIGGER IF NOT EXISTS trg_config_audit_no_update BEFORE UPDATE ON config_audit BEGIN SELECT RAISE(ABORT, 'config_audit is append-only'); END;
CREATE TRIGGER IF NOT EXISTS trg_config_audit_no_delete BEFORE DELETE ON config_audit BEGIN SELECT RAISE(ABORT, 'config_audit is append-only'); END;
CREATE TRIGGER IF NOT EXISTS trg_config_versions_no_update BEFORE UPDATE ON config_versions BEGIN SELECT RAISE(ABORT, 'config_versions are immutable'); END;
