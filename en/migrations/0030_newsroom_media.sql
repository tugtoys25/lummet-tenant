-- Newsroom media tools (additive only): video embeds, podcast feed, photo galleries. All three switches ship OFF.
INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('news_video_embeds', 'false', CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('news_podcast', 'false', CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('news_galleries', 'false', CURRENT_TIMESTAMP);
