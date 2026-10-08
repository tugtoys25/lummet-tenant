-- Add author_id to content tables
ALTER TABLE reviews ADD COLUMN author_id INTEGER REFERENCES authors(id);
ALTER TABLE news ADD COLUMN author_id INTEGER REFERENCES authors(id);
ALTER TABLE pages ADD COLUMN author_id INTEGER REFERENCES authors(id);

-- Index for fast author lookups
CREATE INDEX IF NOT EXISTS idx_reviews_author ON reviews(author_id);
CREATE INDEX IF NOT EXISTS idx_news_author ON news(author_id);
CREATE INDEX IF NOT EXISTS idx_pages_author ON pages(author_id);
