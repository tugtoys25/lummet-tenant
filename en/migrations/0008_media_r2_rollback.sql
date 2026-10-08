-- =====================================================
-- ROLLBACK: PHASE 8 MEDIA R2 UPGRADE
-- =====================================================
-- WARNING: D1 (SQLite) does not support DROP COLUMN.
-- This rollback recreates media_library without the new columns.
-- Run ONLY if you need to completely revert Phase 8.
-- =====================================================

-- Step 1: Recreate media_library without new columns
CREATE TABLE media_library_rollback AS
SELECT
    id, filename, url, thumbnail_url, alt_text,
    width, height, mime_type, size, folder, uploaded_by, created_at
FROM media_library;

-- Step 2: Drop and rename
DROP TABLE media_library;
ALTER TABLE media_library_rollback RENAME TO media_library;

-- Step 3: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_media_folder ON media_library(folder);

-- Step 4: Drop media_folders table
DROP TABLE IF EXISTS media_folders;

-- Step 5: Remove added permissions (optional — harmless if left)
DELETE FROM permissions
WHERE role = 'editor' AND resource = 'media' AND action IN ('update', 'delete')
   OR role = 'viewer' AND resource = 'media' AND action = 'read';
