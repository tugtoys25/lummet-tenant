-- News polish switches (all off): reading time, section name on cards, menu on section and article pages.
INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('news_reading_time', 'false', CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('news_card_sections', 'false', CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('news_menu_everywhere', 'false', CURRENT_TIMESTAMP);
