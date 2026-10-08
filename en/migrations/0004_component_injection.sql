-- Add injection_point column to page_components
ALTER TABLE page_components ADD COLUMN injection_point TEXT DEFAULT 'content_bottom';

-- Index for bulk queries (page_slug = '*' means all pages of this type)
CREATE INDEX IF NOT EXISTS idx_pc_bulk ON page_components(page_type, page_slug, injection_point, enabled);
