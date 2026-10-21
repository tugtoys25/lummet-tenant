CREATE INDEX IF NOT EXISTS idx_casino_name
ON casinos(name);


CREATE INDEX IF NOT EXISTS idx_reviews_title
ON reviews(title);


CREATE INDEX IF NOT EXISTS idx_news_date
ON news(created_at);


CREATE INDEX IF NOT EXISTS idx_geo_country
ON geo_rules(country);
