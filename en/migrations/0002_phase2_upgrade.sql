-- ==========================================
-- LEVEL.CASINO PHASE 2 UPGRADE
-- ==========================================

-- CASINOS
ALTER TABLE casinos ADD COLUMN featured INTEGER DEFAULT 0;
ALTER TABLE casinos ADD COLUMN sort_order INTEGER DEFAULT 0;
ALTER TABLE casinos ADD COLUMN status TEXT DEFAULT 'draft';
ALTER TABLE casinos ADD COLUMN logo_media_id INTEGER;
ALTER TABLE casinos ADD COLUMN hero_image_media_id INTEGER;

-- REVIEWS
ALTER TABLE reviews ADD COLUMN overview TEXT;
ALTER TABLE reviews ADD COLUMN games TEXT;
ALTER TABLE reviews ADD COLUMN bonuses TEXT;
ALTER TABLE reviews ADD COLUMN payments TEXT;
ALTER TABLE reviews ADD COLUMN licenses TEXT;
ALTER TABLE reviews ADD COLUMN faq_json TEXT;
ALTER TABLE reviews ADD COLUMN verdict TEXT;

-- NEWS
ALTER TABLE news ADD COLUMN featured_image INTEGER;
ALTER TABLE news ADD COLUMN excerpt TEXT;
ALTER TABLE news ADD COLUMN tags TEXT;

-- MEDIA
ALTER TABLE media ADD COLUMN alt_text TEXT;
ALTER TABLE media ADD COLUMN width INTEGER;
ALTER TABLE media ADD COLUMN height INTEGER;
ALTER TABLE media ADD COLUMN folder TEXT;

-- GEO RULES
ALTER TABLE geo_rules ADD COLUMN priority INTEGER DEFAULT 0;
ALTER TABLE geo_rules ADD COLUMN redirect_url TEXT;
