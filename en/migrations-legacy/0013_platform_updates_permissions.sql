-- =====================================================
-- PLATFORM UPDATES PERMISSIONS
-- =====================================================

INSERT OR IGNORE INTO permissions
(role, resource, action, allowed)
VALUES
('admin', 'platform-updates', 'create', 1),
('admin', 'platform-updates', 'read', 1),
('admin', 'platform-updates', 'update', 1),
('admin', 'platform-updates', 'delete', 1),

('editor', 'platform-updates', 'create', 1),
('editor', 'platform-updates', 'read', 1),
('editor', 'platform-updates', 'update', 1),
('editor', 'platform-updates', 'delete', 1);
