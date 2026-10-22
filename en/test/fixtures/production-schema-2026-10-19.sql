-- Cloudflare D1 schema export
-- Database: lummet-tenant-db
-- Generated: 2026-10-19T16:14:20.473846+00:00
-- Schema only; table data is not included.
-- Generated SQL definitions originate from sqlite_master.

PRAGMA foreign_keys = ON;

-- TABLE: _cf_KV
CREATE TABLE _cf_KV (
        key TEXT PRIMARY KEY,
        value BLOB
      ) WITHOUT ROWID;

-- TABLE: ad_rules
CREATE TABLE ad_rules (   id              INTEGER PRIMARY KEY AUTOINCREMENT,   component_id    INTEGER NOT NULL,   enabled         INTEGER DEFAULT 1,   placement       TEXT NOT NULL DEFAULT 'after_paragraph',   position_value  INTEGER DEFAULT 3,   repeat_interval INTEGER DEFAULT 0,   max_appearances INTEGER DEFAULT 1,   devices         TEXT DEFAULT 'all',   countries       TEXT DEFAULT 'all',   page_type       TEXT DEFAULT 'all',   priority        INTEGER DEFAULT 100,   start_date      TEXT,   end_date        TEXT,   created_at      TEXT DEFAULT CURRENT_TIMESTAMP,   updated_at      TEXT DEFAULT CURRENT_TIMESTAMP,   FOREIGN KEY (component_id) REFERENCES components(id) ON DELETE CASCADE );

-- TABLE: affiliate_accounts
CREATE TABLE affiliate_accounts (     id INTEGER PRIMARY KEY AUTOINCREMENT,     program_id INTEGER NOT NULL REFERENCES affiliate_programs(id) ON DELETE RESTRICT,     account_name TEXT NOT NULL,     external_account_id TEXT,     status TEXT DEFAULT 'active',     portal_url TEXT,     notes TEXT,     credential_reference TEXT,     created_by INTEGER REFERENCES users(id),     updated_by INTEGER REFERENCES users(id),     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP );

-- TABLE: affiliate_commercial_terms
CREATE TABLE affiliate_commercial_terms (     id INTEGER PRIMARY KEY AUTOINCREMENT,     program_id INTEGER NOT NULL REFERENCES affiliate_programs(id) ON DELETE RESTRICT,     account_id INTEGER REFERENCES affiliate_accounts(id) ON DELETE RESTRICT,     casino_id INTEGER REFERENCES casinos(id),     geo_code TEXT,     term_type TEXT NOT NULL,     cpa_amount REAL,     revshare_percent REAL,     hybrid_cpa_amount REAL,     hybrid_revshare_percent REAL,     fixed_fee_amount REAL,     currency TEXT DEFAULT 'USD',     custom_terms_json TEXT,     effective_date DATE NOT NULL,     expiry_date DATE,     status TEXT DEFAULT 'active',     notes TEXT,     created_by INTEGER REFERENCES users(id),     created_at DATETIME DEFAULT CURRENT_TIMESTAMP );

-- TABLE: affiliate_partner_contacts
CREATE TABLE affiliate_partner_contacts (     id INTEGER PRIMARY KEY AUTOINCREMENT,     partner_id INTEGER NOT NULL REFERENCES affiliate_partners(id) ON DELETE CASCADE,     name TEXT NOT NULL,     role TEXT,     email TEXT,     phone TEXT,     notes TEXT,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP );

-- TABLE: affiliate_partners
CREATE TABLE affiliate_partners (     id INTEGER PRIMARY KEY AUTOINCREMENT,     name TEXT NOT NULL,     slug TEXT UNIQUE NOT NULL,     website TEXT,     description TEXT,     partner_type TEXT DEFAULT 'network',     status TEXT DEFAULT 'active',     contact_name TEXT,     contact_email TEXT,     contact_phone TEXT,     notes TEXT,     external_reference TEXT,     created_by INTEGER REFERENCES users(id),     updated_by INTEGER REFERENCES users(id),     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP );

-- TABLE: affiliate_program_casinos
CREATE TABLE affiliate_program_casinos (     program_id INTEGER NOT NULL REFERENCES affiliate_programs(id) ON DELETE CASCADE,     casino_id INTEGER NOT NULL REFERENCES casinos(id) ON DELETE CASCADE,     status TEXT DEFAULT 'active',     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     PRIMARY KEY (program_id, casino_id) );

-- TABLE: affiliate_programs
CREATE TABLE affiliate_programs (     id INTEGER PRIMARY KEY AUTOINCREMENT,     partner_id INTEGER NOT NULL REFERENCES affiliate_partners(id) ON DELETE RESTRICT,     name TEXT NOT NULL,     status TEXT DEFAULT 'active',     portal_url TEXT,     supported_geos TEXT,     reporting_notes TEXT,     notes TEXT,     created_by INTEGER REFERENCES users(id),     updated_by INTEGER REFERENCES users(id),     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP );

-- TABLE: affiliates
CREATE TABLE affiliates (     id INTEGER PRIMARY KEY AUTOINCREMENT,     casino_slug TEXT,     network TEXT,     manager_name TEXT,     manager_email TEXT,     revshare REAL,     cpa REAL,     hybrid TEXT,     tracking_url TEXT,     status TEXT DEFAULT 'active' );

-- TABLE: ai_conversations
CREATE TABLE ai_conversations (     id TEXT PRIMARY KEY,     session_id TEXT NOT NULL,     user_id INTEGER,     messages TEXT NOT NULL DEFAULT '[]',     created_at TEXT NOT NULL DEFAULT (datetime('now')),     updated_at TEXT NOT NULL DEFAULT (datetime('now')) );

-- TABLE: ai_free_tier_usage
CREATE TABLE ai_free_tier_usage (     ip_hash TEXT PRIMARY KEY,     message_count INTEGER NOT NULL DEFAULT 0,     first_message_at TEXT,     last_message_at TEXT );

-- TABLE: ai_generations
CREATE TABLE ai_generations (     id INTEGER PRIMARY KEY AUTOINCREMENT,     entity_type TEXT NOT NULL,     entity_slug TEXT NOT NULL,     prompt TEXT,     model TEXT,     status TEXT DEFAULT 'completed',     created_at DATETIME DEFAULT CURRENT_TIMESTAMP );

-- TABLE: ai_rate_limits
CREATE TABLE ai_rate_limits (     ip_hash TEXT NOT NULL,     created_at TEXT NOT NULL,     PRIMARY KEY (ip_hash, created_at) );

-- TABLE: analytics_alert_rules
CREATE TABLE analytics_alert_rules (     id INTEGER PRIMARY KEY AUTOINCREMENT,     name TEXT NOT NULL,     metric TEXT NOT NULL,     scope_type TEXT NOT NULL DEFAULT 'global',     scope_id INTEGER,     threshold_type TEXT NOT NULL,     threshold_value REAL,     comparison_window_days INTEGER NOT NULL DEFAULT 7,     enabled INTEGER NOT NULL DEFAULT 1,     created_by INTEGER REFERENCES users(id),     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP );

-- TABLE: analytics_alerts
CREATE TABLE analytics_alerts (     id INTEGER PRIMARY KEY AUTOINCREMENT,     rule_id INTEGER REFERENCES analytics_alert_rules(id),     triggered_at DATETIME DEFAULT CURRENT_TIMESTAMP,     details_json TEXT,     status TEXT NOT NULL DEFAULT 'open',     acknowledged_by INTEGER REFERENCES users(id),     acknowledged_at DATETIME );

-- TABLE: analytics_conversions
CREATE TABLE analytics_conversions (     id INTEGER PRIMARY KEY AUTOINCREMENT,     click_id TEXT,     tracking_link_id INTEGER REFERENCES tracking_links(id),     offer_id INTEGER REFERENCES offers(id),     casino_id INTEGER REFERENCES casinos(id),     partner_id INTEGER REFERENCES affiliate_partners(id),     program_id INTEGER REFERENCES affiliate_programs(id),     account_id INTEGER REFERENCES affiliate_accounts(id),     commercial_term_id INTEGER REFERENCES affiliate_commercial_terms(id),     campaign_id INTEGER,     conversion_type TEXT NOT NULL,     status TEXT NOT NULL DEFAULT 'pending',     reported_value REAL,     calculated_commission REAL,     currency TEXT NOT NULL DEFAULT 'USD',     country_code TEXT,     external_reference TEXT,     occurred_at DATETIME DEFAULT CURRENT_TIMESTAMP,     created_by INTEGER REFERENCES users(id),     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP , source TEXT NOT NULL DEFAULT 'manual', reported_commission REAL, external_player_id TEXT);

-- TABLE: analytics_daily
CREATE TABLE analytics_daily (     id INTEGER PRIMARY KEY AUTOINCREMENT,     date TEXT NOT NULL,     dimension_type TEXT NOT NULL,     dimension_id INTEGER,     page_views INTEGER DEFAULT 0,     clicks INTEGER DEFAULT 0,     unique_clicks INTEGER DEFAULT 0,     conversions INTEGER DEFAULT 0,     revenue REAL DEFAULT 0,     commission REAL DEFAULT 0,     currency TEXT NOT NULL DEFAULT 'USD',     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,     UNIQUE(date, dimension_type, dimension_id, currency) );

-- TABLE: analytics_events
CREATE TABLE analytics_events (     id INTEGER PRIMARY KEY AUTOINCREMENT,     event_type TEXT NOT NULL,     occurred_at DATETIME DEFAULT CURRENT_TIMESTAMP,     casino_id INTEGER REFERENCES casinos(id),     review_id INTEGER REFERENCES reviews(id),     page_id INTEGER REFERENCES pages(id),     news_id INTEGER REFERENCES news(id),     offer_id INTEGER REFERENCES offers(id),     offer_version_id INTEGER REFERENCES offer_versions(id),     tracking_link_id INTEGER REFERENCES tracking_links(id),     partner_id INTEGER REFERENCES affiliate_partners(id),     program_id INTEGER REFERENCES affiliate_programs(id),     account_id INTEGER REFERENCES affiliate_accounts(id),     campaign_id INTEGER,     country_code TEXT,     region TEXT,     city TEXT,     device_type TEXT,     browser TEXT,     os TEXT,     referrer TEXT,     landing_page TEXT,     utm_source TEXT,     utm_medium TEXT,     utm_campaign TEXT,     utm_term TEXT,     utm_content TEXT,     session_id TEXT,     visitor_hash TEXT,     click_id TEXT,     user_id INTEGER REFERENCES users(id),     value REAL,     currency TEXT,     metadata TEXT,     is_bot INTEGER DEFAULT 0,     is_duplicate INTEGER DEFAULT 0 , content_item_id INTEGER REFERENCES content_items(id));

-- TABLE: audit_logs
CREATE TABLE audit_logs (     id INTEGER PRIMARY KEY AUTOINCREMENT,      user_id INTEGER,      action TEXT,      entity_type TEXT,      entity_id TEXT,      created_at DATETIME DEFAULT CURRENT_TIMESTAMP , metadata TEXT);

-- TABLE: auth_attempts
CREATE TABLE auth_attempts (     id INTEGER PRIMARY KEY AUTOINCREMENT,     ip_hash TEXT NOT NULL,     action TEXT NOT NULL,     created_at DATETIME NOT NULL );

-- TABLE: authors
CREATE TABLE authors (     id INTEGER PRIMARY KEY AUTOINCREMENT,     slug TEXT UNIQUE NOT NULL,     name TEXT NOT NULL,     bio TEXT,     avatar_url TEXT,     role TEXT DEFAULT 'editor',     email TEXT,     social_links TEXT,     seo_title TEXT,     seo_description TEXT,     published INTEGER DEFAULT 1,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP , job_title TEXT, expertise TEXT, location TEXT, website_url TEXT);

-- TABLE: banners
CREATE TABLE banners (     id INTEGER PRIMARY KEY AUTOINCREMENT,     type TEXT DEFAULT 'announcement',     title TEXT,     content TEXT,     link TEXT,     button_text TEXT,     bg_color TEXT DEFAULT '#6c5ce7',     text_color TEXT DEFAULT '#ffffff',     position TEXT DEFAULT 'top',     dismissible INTEGER DEFAULT 1,     geo_countries TEXT,     start_date TEXT,     end_date TEXT,     enabled INTEGER DEFAULT 1,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP );

-- TABLE: campaigns
CREATE TABLE campaigns (     id INTEGER PRIMARY KEY AUTOINCREMENT,     name TEXT NOT NULL,     utm_source TEXT,     utm_medium TEXT,     utm_campaign TEXT,     utm_term TEXT,     utm_content TEXT,     status TEXT NOT NULL DEFAULT 'active',     start_date DATE,     end_date DATE,     notes TEXT,     created_by INTEGER REFERENCES users(id),     updated_by INTEGER REFERENCES users(id),     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP );

-- TABLE: casino_categories
CREATE TABLE casino_categories (     casino_id INTEGER NOT NULL,     category_id INTEGER NOT NULL,      PRIMARY KEY (casino_id, category_id),      FOREIGN KEY (casino_id) REFERENCES casinos(id) ON DELETE CASCADE,     FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE );

-- TABLE: casino_payment_methods
CREATE TABLE casino_payment_methods (     casino_id INTEGER NOT NULL,     payment_method_id INTEGER NOT NULL,     PRIMARY KEY (casino_id, payment_method_id),     FOREIGN KEY (casino_id) REFERENCES casinos(id) ON DELETE CASCADE,     FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE CASCADE );

-- TABLE: casino_submissions
CREATE TABLE casino_submissions (     id INTEGER PRIMARY KEY AUTOINCREMENT,     user_id INTEGER NOT NULL,     name TEXT NOT NULL,     website_url TEXT NOT NULL,     affiliate_url TEXT,     bonus_value TEXT,     notes TEXT,     status TEXT DEFAULT 'pending',     admin_notes TEXT,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP );

-- TABLE: casinos
CREATE TABLE casinos (     id INTEGER PRIMARY KEY AUTOINCREMENT,     slug TEXT UNIQUE NOT NULL,     name TEXT NOT NULL,     logo TEXT,     website_url TEXT NOT NULL,     affiliate_url TEXT NOT NULL,     rating REAL DEFAULT 0,     bonus_title TEXT,     bonus_value TEXT,     license TEXT,     owner TEXT,     features TEXT,     supported_countries TEXT,     restricted_countries TEXT,     seo_title TEXT,     seo_description TEXT,     published INTEGER DEFAULT 1,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP , featured INTEGER DEFAULT 0, sort_order INTEGER DEFAULT 0, status TEXT DEFAULT 'draft', logo_media_id INTEGER, hero_image_media_id INTEGER, created_by INTEGER, seo_keywords TEXT);

-- TABLE: categories
CREATE TABLE categories (     id INTEGER PRIMARY KEY AUTOINCREMENT,     slug TEXT UNIQUE NOT NULL,     name TEXT NOT NULL,     description TEXT,     seo_title TEXT,     seo_description TEXT,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP , content_json TEXT, robots TEXT DEFAULT 'index,follow', status TEXT DEFAULT 'published', published INTEGER DEFAULT 1, seo_keywords TEXT, og_image INTEGER REFERENCES media_library(id));

-- TABLE: clicks
CREATE TABLE clicks (     id INTEGER PRIMARY KEY AUTOINCREMENT,     casino_slug TEXT NOT NULL,     country_code TEXT,     city TEXT,     ip_hash TEXT,     user_agent TEXT,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP , tracking_link_id INTEGER REFERENCES tracking_links(id), offer_id INTEGER REFERENCES offers(id));

-- TABLE: comparison_items
CREATE TABLE comparison_items (     comparison_id INTEGER NOT NULL REFERENCES comparisons(id) ON DELETE CASCADE,     item_content_type TEXT NOT NULL,     item_id INTEGER NOT NULL,     position INTEGER DEFAULT 0,     PRIMARY KEY (comparison_id, item_content_type, item_id) );

-- TABLE: comparisons
CREATE TABLE comparisons (     id INTEGER PRIMARY KEY AUTOINCREMENT,     content_type TEXT NOT NULL,     slug TEXT NOT NULL,     title TEXT NOT NULL,     description TEXT,     criteria_json TEXT,     editorial_selection_item_type TEXT,     editorial_selection_item_id INTEGER,     status TEXT DEFAULT 'draft',     seo_title TEXT,     seo_description TEXT,     seo_keywords TEXT,     author_id INTEGER REFERENCES authors(id),     created_by INTEGER,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,     published_at DATETIME,     UNIQUE(content_type, slug) );

-- TABLE: components
CREATE TABLE components (     id INTEGER PRIMARY KEY AUTOINCREMENT,     name TEXT NOT NULL,     slug TEXT UNIQUE,     type TEXT NOT NULL,     title TEXT,     content TEXT,     settings_json TEXT,     status TEXT DEFAULT 'active',     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP );

-- TABLE: content_categories
CREATE TABLE content_categories (     content_type TEXT NOT NULL,     content_id INTEGER NOT NULL,     category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,     PRIMARY KEY (content_type, content_id, category_id) );

-- TABLE: content_currencies
CREATE TABLE content_currencies (     content_type TEXT NOT NULL,     content_id INTEGER NOT NULL,     currency_id INTEGER NOT NULL REFERENCES currencies(id) ON DELETE CASCADE,     PRIMARY KEY (content_type, content_id, currency_id) );

-- TABLE: content_geo
CREATE TABLE content_geo (     id INTEGER PRIMARY KEY AUTOINCREMENT,     content_type TEXT NOT NULL,     content_id INTEGER NOT NULL,     country_code TEXT NOT NULL REFERENCES countries(code),     status TEXT NOT NULL,     bonus_override TEXT,     priority INTEGER DEFAULT 0,     redirect_url TEXT,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP );

-- TABLE: content_items
CREATE TABLE content_items (     id INTEGER PRIMARY KEY AUTOINCREMENT,     content_type TEXT NOT NULL CHECK (content_type IN ('sportsbook', 'affiliate_partner', 'custom')),     custom_type_slug TEXT REFERENCES custom_content_types(slug),     slug TEXT NOT NULL,     name TEXT NOT NULL,     title TEXT,     description TEXT,     excerpt TEXT,     logo_media_id INTEGER REFERENCES media_library(id),     featured_image_media_id INTEGER REFERENCES media_library(id),     website TEXT,     rating REAL DEFAULT 0,     license TEXT,     license_country TEXT,     live_betting INTEGER DEFAULT 0,     pre_match INTEGER DEFAULT 0,     cashout INTEGER DEFAULT 0,     mobile_app INTEGER DEFAULT 0,     linked_affiliate_partner_id INTEGER REFERENCES affiliate_partners(id),     metadata_json TEXT,     featured INTEGER DEFAULT 0,     sort_order INTEGER DEFAULT 0,     status TEXT DEFAULT 'draft',     published INTEGER DEFAULT 0,     seo_title TEXT,     seo_description TEXT,     seo_keywords TEXT,     author_id INTEGER REFERENCES authors(id),     created_by INTEGER,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,     published_at DATETIME, tracking_url TEXT,     UNIQUE(content_type, slug) );

-- TABLE: content_landing_page_items
CREATE TABLE content_landing_page_items (     landing_page_id INTEGER NOT NULL REFERENCES content_landing_pages(id) ON DELETE CASCADE,     content_id INTEGER NOT NULL,     position INTEGER DEFAULT 0,     PRIMARY KEY (landing_page_id, content_id) );

-- TABLE: content_landing_pages
CREATE TABLE content_landing_pages (     id INTEGER PRIMARY KEY AUTOINCREMENT,      content_type TEXT NOT NULL CHECK (content_type IN ('sportsbook', 'affiliate_partner', 'custom')),     custom_type_slug TEXT REFERENCES custom_content_types(slug),      slug TEXT NOT NULL UNIQUE,     title TEXT NOT NULL,     description TEXT,      item_mode TEXT NOT NULL DEFAULT 'manual' CHECK (item_mode IN ('manual', 'auto')),     auto_limit INTEGER NOT NULL DEFAULT 10,      status TEXT NOT NULL DEFAULT 'draft',      seo_title TEXT,     seo_description TEXT,     seo_keywords TEXT,      author_id INTEGER REFERENCES authors(id),     created_by INTEGER,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,     published_at DATETIME );

-- TABLE: content_payment_methods
CREATE TABLE content_payment_methods (     content_type TEXT NOT NULL,     content_id INTEGER NOT NULL,     payment_method_id INTEGER NOT NULL REFERENCES payment_methods(id) ON DELETE CASCADE,     PRIMARY KEY (content_type, content_id, payment_method_id) );

-- TABLE: content_sports
CREATE TABLE content_sports (     content_type TEXT NOT NULL,     content_id INTEGER NOT NULL,     sport_id INTEGER NOT NULL REFERENCES sports(id) ON DELETE CASCADE,     PRIMARY KEY (content_type, content_id, sport_id) );

-- TABLE: countries
CREATE TABLE countries (     code TEXT PRIMARY KEY,     name TEXT NOT NULL,     currency TEXT,     language TEXT,     legal_status TEXT,     seo_title TEXT,     seo_description TEXT,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP , content_json TEXT, robots TEXT DEFAULT 'index,follow', status TEXT DEFAULT 'published', published INTEGER DEFAULT 1, is_featured INTEGER DEFAULT 0, featured_position INTEGER DEFAULT 0, tier INTEGER DEFAULT 3, seo_keywords TEXT, og_image INTEGER REFERENCES media_library(id));

-- TABLE: countries_backup
CREATE TABLE countries_backup(
  code TEXT,
  name TEXT,
  currency TEXT,
  language TEXT,
  legal_status TEXT,
  seo_title TEXT,
  seo_description TEXT,
  created_at NUM
);

-- TABLE: currencies
CREATE TABLE currencies (     id INTEGER PRIMARY KEY AUTOINCREMENT,     code TEXT UNIQUE NOT NULL,     name TEXT NOT NULL,     is_crypto INTEGER DEFAULT 0 );

-- TABLE: custom_content_types
CREATE TABLE custom_content_types (     id INTEGER PRIMARY KEY AUTOINCREMENT,     slug TEXT UNIQUE NOT NULL,     label TEXT NOT NULL,     plural_label TEXT NOT NULL,     icon TEXT,     review_enabled INTEGER DEFAULT 1,     comparison_enabled INTEGER DEFAULT 1,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP );

-- TABLE: custom_field_definitions
CREATE TABLE custom_field_definitions (     id INTEGER PRIMARY KEY AUTOINCREMENT,     custom_type_slug TEXT NOT NULL REFERENCES custom_content_types(slug) ON DELETE CASCADE,     field_key TEXT NOT NULL,     label TEXT NOT NULL,     field_type TEXT NOT NULL CHECK (field_type IN         ('text','textarea','number','boolean','url','date','select','multi_select','country','currency','image','rating')),     options_json TEXT,     required INTEGER DEFAULT 0,     display_order INTEGER DEFAULT 0,     UNIQUE(custom_type_slug, field_key) );

-- TABLE: custom_field_values
CREATE TABLE custom_field_values (     content_item_id INTEGER NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,     field_key TEXT NOT NULL,     value TEXT,     PRIMARY KEY (content_item_id, field_key) );

-- TABLE: d1_migrations
CREATE TABLE "d1_migrations"(
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT UNIQUE,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- TABLE: email_campaigns
CREATE TABLE email_campaigns (     id INTEGER PRIMARY KEY AUTOINCREMENT,     subject TEXT NOT NULL,     layout TEXT NOT NULL DEFAULT 'branded',     body_html TEXT NOT NULL,     body_text TEXT,     recipient_type TEXT NOT NULL,     recipient_meta TEXT,     status TEXT NOT NULL DEFAULT 'sending',     recipient_count INTEGER NOT NULL DEFAULT 0,     sent_count INTEGER NOT NULL DEFAULT 0,     failed_count INTEGER NOT NULL DEFAULT 0,     error_message TEXT,     created_by INTEGER,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     sent_at DATETIME,     FOREIGN KEY(created_by) REFERENCES users(id) );

-- TABLE: faqs
CREATE TABLE faqs (     id INTEGER PRIMARY KEY AUTOINCREMENT,     slug TEXT UNIQUE,     question TEXT NOT NULL,     answer TEXT NOT NULL,     is_active INTEGER DEFAULT 1,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP );

-- TABLE: geo_rules
CREATE TABLE geo_rules (     id INTEGER PRIMARY KEY AUTOINCREMENT,     casino_slug TEXT NOT NULL,     country_code TEXT NOT NULL,     status TEXT NOT NULL,     bonus_override TEXT,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP , priority INTEGER DEFAULT 0, redirect_url TEXT);

-- TABLE: import_batches
CREATE TABLE import_batches (     id INTEGER PRIMARY KEY AUTOINCREMENT,     account_id INTEGER NOT NULL REFERENCES affiliate_accounts(id) ON DELETE RESTRICT,     label TEXT,     format TEXT NOT NULL,     total_rows INTEGER NOT NULL DEFAULT 0,     imported_count INTEGER NOT NULL DEFAULT 0,     duplicate_count INTEGER NOT NULL DEFAULT 0,     unattributed_count INTEGER NOT NULL DEFAULT 0,     error_count INTEGER NOT NULL DEFAULT 0,     errors_json TEXT,     created_by INTEGER REFERENCES users(id),     created_at DATETIME DEFAULT CURRENT_TIMESTAMP );

-- TABLE: item_access_assignments
CREATE TABLE item_access_assignments (     id INTEGER PRIMARY KEY AUTOINCREMENT,     user_id INTEGER NOT NULL,     resource TEXT NOT NULL,     item_id INTEGER NOT NULL,     created_at TEXT DEFAULT CURRENT_TIMESTAMP,     created_by INTEGER,     UNIQUE(user_id, resource, item_id),     FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE );

-- TABLE: media
CREATE TABLE media (     id INTEGER PRIMARY KEY AUTOINCREMENT,      filename TEXT NOT NULL,     url TEXT NOT NULL,      mime_type TEXT,     size INTEGER,      uploaded_by INTEGER,      created_at DATETIME DEFAULT CURRENT_TIMESTAMP , alt_text TEXT, width INTEGER, height INTEGER, folder TEXT);

-- TABLE: media_folders
CREATE TABLE media_folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    parent_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES media_folders(id) ON DELETE SET NULL
);

-- TABLE: media_library
CREATE TABLE media_library (     id INTEGER PRIMARY KEY AUTOINCREMENT,     filename TEXT NOT NULL,     url TEXT NOT NULL,     thumbnail_url TEXT,     alt_text TEXT,     width INTEGER,     height INTEGER,     mime_type TEXT,     size INTEGER,     folder TEXT DEFAULT 'general',     uploaded_by INTEGER,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP , r2_key TEXT, original_filename TEXT, type TEXT DEFAULT 'image', caption TEXT, duration INTEGER, poster_url TEXT, file_ext TEXT, credit TEXT, photographer TEXT, credit_source TEXT, license TEXT);

-- TABLE: nav_items
CREATE TABLE nav_items (     id INTEGER PRIMARY KEY AUTOINCREMENT,     label TEXT NOT NULL,     url TEXT NOT NULL,     parent_id INTEGER,     position INTEGER DEFAULT 0,     location TEXT DEFAULT 'header',     is_external INTEGER DEFAULT 0,     icon TEXT,     enabled INTEGER DEFAULT 1,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP , auto_generated INTEGER DEFAULT 0, source_type TEXT, source_ref TEXT, scope_type TEXT, scope_ref TEXT);

-- TABLE: news
CREATE TABLE news (     id INTEGER PRIMARY KEY AUTOINCREMENT,     slug TEXT UNIQUE NOT NULL,     title TEXT NOT NULL,     content TEXT NOT NULL,     author TEXT,     ai_generated INTEGER DEFAULT 0,     seo_title TEXT,     seo_description TEXT,     published INTEGER DEFAULT 1,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP , featured_image INTEGER, excerpt TEXT, tags TEXT, author_id INTEGER REFERENCES authors(id), published_at DATETIME, created_by INTEGER, ad_mode TEXT DEFAULT 'auto', ad_override_rules TEXT, seo_keywords TEXT, og_image INTEGER REFERENCES media_library(id), article_type TEXT, section_id INTEGER REFERENCES news_sections(id), primary_country TEXT, region_slug TEXT, content_class TEXT, labels TEXT, methodology TEXT, pr_provided_by TEXT, pr_original_source_url TEXT, pr_original_date TEXT, disclosure_json TEXT);

-- TABLE: news_article_countries
CREATE TABLE news_article_countries (     news_id INTEGER NOT NULL REFERENCES news(id) ON DELETE CASCADE,     country_code TEXT NOT NULL,     is_primary INTEGER NOT NULL DEFAULT 0,     PRIMARY KEY (news_id, country_code) );

-- TABLE: news_article_entities
CREATE TABLE news_article_entities (     news_id INTEGER NOT NULL REFERENCES news(id) ON DELETE CASCADE,     entity_id INTEGER NOT NULL REFERENCES news_entities(id) ON DELETE CASCADE,     role TEXT,     display_order INTEGER NOT NULL DEFAULT 0,     PRIMARY KEY (news_id, entity_id) );

-- TABLE: news_article_sources
CREATE TABLE news_article_sources (     id INTEGER PRIMARY KEY AUTOINCREMENT,     news_id INTEGER NOT NULL REFERENCES news(id) ON DELETE CASCADE,     source_name TEXT NOT NULL,     source_url TEXT,     source_type TEXT NOT NULL DEFAULT 'other',     source_date TEXT,     author TEXT,     description TEXT,     display_order INTEGER NOT NULL DEFAULT 0,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP );

-- TABLE: news_article_topics
CREATE TABLE news_article_topics (     news_id INTEGER NOT NULL REFERENCES news(id) ON DELETE CASCADE,     topic_id INTEGER NOT NULL REFERENCES news_topics(id) ON DELETE CASCADE,     PRIMARY KEY (news_id, topic_id) );

-- TABLE: news_corrections
CREATE TABLE news_corrections (     id INTEGER PRIMARY KEY AUTOINCREMENT,     news_id INTEGER NOT NULL,     type TEXT NOT NULL,     public_message TEXT NOT NULL,     created_by INTEGER,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP );

-- TABLE: news_editorial
CREATE TABLE news_editorial (     news_id INTEGER PRIMARY KEY REFERENCES news(id) ON DELETE CASCADE,     workflow_status TEXT,     assigned_to INTEGER,     reviewed_by INTEGER,     fact_check_status TEXT,     fact_checked_by INTEGER,     fact_checked_at DATETIME,     approved_by INTEGER,     published_by INTEGER,     editor_notes TEXT,     assignment_notes TEXT,     fact_check_notes TEXT,     revision_number INTEGER NOT NULL DEFAULT 0,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP );

-- TABLE: news_editorial_notes
CREATE TABLE news_editorial_notes (     id INTEGER PRIMARY KEY AUTOINCREMENT,     news_id INTEGER NOT NULL REFERENCES news(id) ON DELETE CASCADE,     note_type TEXT NOT NULL DEFAULT 'editor',     body TEXT NOT NULL,     created_by INTEGER,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP );

-- TABLE: news_entities
CREATE TABLE news_entities (     id INTEGER PRIMARY KEY AUTOINCREMENT,     slug TEXT NOT NULL UNIQUE,     name TEXT NOT NULL,     entity_type TEXT NOT NULL DEFAULT 'company',     description TEXT,     logo_media_id INTEGER REFERENCES media_library(id),     website_url TEXT,     country_code TEXT,     casino_id INTEGER REFERENCES casinos(id),     seo_title TEXT,     seo_description TEXT,     active INTEGER NOT NULL DEFAULT 1,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP );

-- TABLE: news_pins
CREATE TABLE news_pins (     id INTEGER PRIMARY KEY AUTOINCREMENT,     news_id INTEGER NOT NULL REFERENCES news(id) ON DELETE CASCADE,     slot TEXT NOT NULL,     position INTEGER NOT NULL DEFAULT 0,     starts_at DATETIME,     ends_at DATETIME,     created_by INTEGER,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP );

-- TABLE: news_redirects
CREATE TABLE news_redirects (     old_slug TEXT PRIMARY KEY,     news_id INTEGER NOT NULL REFERENCES news(id) ON DELETE CASCADE,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP );

-- TABLE: news_region_countries
CREATE TABLE news_region_countries (     region_slug TEXT NOT NULL REFERENCES news_regions(slug) ON DELETE CASCADE,     country_code TEXT NOT NULL,     PRIMARY KEY (region_slug, country_code) );

-- TABLE: news_regions
CREATE TABLE news_regions (     slug TEXT PRIMARY KEY,     name TEXT NOT NULL,     display_order INTEGER NOT NULL DEFAULT 0,     active INTEGER NOT NULL DEFAULT 1 );

-- TABLE: news_related
CREATE TABLE news_related (     news_id INTEGER NOT NULL REFERENCES news(id) ON DELETE CASCADE,     related_news_id INTEGER NOT NULL REFERENCES news(id) ON DELETE CASCADE,     relation_type TEXT NOT NULL DEFAULT 'related',     display_order INTEGER NOT NULL DEFAULT 0,     PRIMARY KEY (news_id, related_news_id, relation_type) );

-- TABLE: news_revisions
CREATE TABLE news_revisions (     id INTEGER PRIMARY KEY AUTOINCREMENT,     news_id INTEGER NOT NULL,     version_number INTEGER NOT NULL,     changed_by INTEGER,     changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,     change_summary TEXT,     changed_fields TEXT,     previous_values TEXT,     new_values TEXT,     UNIQUE (news_id, version_number) );

-- TABLE: news_search_docs
CREATE TABLE news_search_docs (     news_id INTEGER PRIMARY KEY REFERENCES news(id) ON DELETE CASCADE,     content_hash TEXT NOT NULL,     indexed_at DATETIME DEFAULT CURRENT_TIMESTAMP );

-- TABLE: news_search_terms
CREATE TABLE news_search_terms (     term TEXT NOT NULL,     news_id INTEGER NOT NULL REFERENCES news(id) ON DELETE CASCADE,     weight INTEGER NOT NULL,     PRIMARY KEY (term, news_id) ) WITHOUT ROWID;

-- TABLE: news_sections
CREATE TABLE news_sections (     id INTEGER PRIMARY KEY AUTOINCREMENT,     slug TEXT NOT NULL UNIQUE,     name TEXT NOT NULL,     description TEXT,     seo_title TEXT,     seo_description TEXT,     og_image INTEGER REFERENCES media_library(id),     display_order INTEGER NOT NULL DEFAULT 0,     active INTEGER NOT NULL DEFAULT 1,     parent_id INTEGER REFERENCES news_sections(id),     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP );

-- TABLE: news_series
CREATE TABLE news_series (     id INTEGER PRIMARY KEY AUTOINCREMENT,     slug TEXT NOT NULL UNIQUE,     name TEXT NOT NULL,     description TEXT,     image_media_id INTEGER REFERENCES media_library(id),     seo_title TEXT,     seo_description TEXT,     active INTEGER NOT NULL DEFAULT 1,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP );

-- TABLE: news_series_articles
CREATE TABLE news_series_articles (     series_id INTEGER NOT NULL REFERENCES news_series(id) ON DELETE CASCADE,     news_id INTEGER NOT NULL REFERENCES news(id) ON DELETE CASCADE,     position INTEGER NOT NULL DEFAULT 0,     PRIMARY KEY (series_id, news_id) );

-- TABLE: news_timeline_updates
CREATE TABLE news_timeline_updates (     id INTEGER PRIMARY KEY AUTOINCREMENT,     news_id INTEGER NOT NULL REFERENCES news(id) ON DELETE CASCADE,     update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,     body TEXT NOT NULL,     editor_id INTEGER,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP );

-- TABLE: news_topics
CREATE TABLE news_topics (     id INTEGER PRIMARY KEY AUTOINCREMENT,     slug TEXT NOT NULL UNIQUE,     name TEXT NOT NULL,     description TEXT,     seo_title TEXT,     seo_description TEXT,     active INTEGER NOT NULL DEFAULT 1,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP );

-- TABLE: newsletter_subscribers
CREATE TABLE newsletter_subscribers (     id INTEGER PRIMARY KEY AUTOINCREMENT,     email TEXT UNIQUE NOT NULL,     status TEXT NOT NULL DEFAULT 'pending',     token TEXT UNIQUE NOT NULL,     subscribed_at DATETIME DEFAULT CURRENT_TIMESTAMP,     confirmed_at DATETIME,     unsubscribed_at DATETIME , user_id INTEGER REFERENCES users(id), notify_news INTEGER NOT NULL DEFAULT 1, notify_casinos INTEGER NOT NULL DEFAULT 1, notify_reviews INTEGER NOT NULL DEFAULT 1, notify_weekly_report INTEGER NOT NULL DEFAULT 1, source TEXT NOT NULL DEFAULT 'footer');

-- TABLE: offer_versions
CREATE TABLE offer_versions (     id INTEGER PRIMARY KEY AUTOINCREMENT,     offer_id INTEGER NOT NULL REFERENCES offers(id) ON DELETE CASCADE,     version_number INTEGER NOT NULL,     snapshot_json TEXT NOT NULL,     changed_by INTEGER REFERENCES users(id),     change_reason TEXT,     valid_from DATETIME NOT NULL,     valid_to DATETIME,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     UNIQUE(offer_id, version_number) );

-- TABLE: offers
CREATE TABLE offers (     id INTEGER PRIMARY KEY AUTOINCREMENT,     casino_id INTEGER NOT NULL REFERENCES casinos(id),     program_id INTEGER REFERENCES affiliate_programs(id),     offer_type TEXT NOT NULL,     internal_name TEXT NOT NULL,     public_headline TEXT,     public_description TEXT,     bonus_amount REAL,     bonus_percent REAL,     currency TEXT,     free_spins_qty INTEGER,     min_deposit REAL,     max_bonus REAL,     wagering_multiplier REAL,     max_bet REAL,     eligible_games TEXT,     terms_and_conditions TEXT,     start_date DATETIME,     expiry_date DATETIME,     status TEXT DEFAULT 'draft',     priority INTEGER DEFAULT 0,     allowed_geos TEXT,     blocked_geos TEXT,     created_by INTEGER REFERENCES users(id),     updated_by INTEGER REFERENCES users(id),     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP );

-- TABLE: page_components
CREATE TABLE page_components (     id INTEGER PRIMARY KEY AUTOINCREMENT,     page_type TEXT NOT NULL,     page_slug TEXT NOT NULL,     component_id INTEGER NOT NULL,     position INTEGER DEFAULT 0,     enabled INTEGER DEFAULT 1,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP, injection_point TEXT DEFAULT 'content_bottom',     FOREIGN KEY (component_id) REFERENCES components(id) ON DELETE CASCADE );

-- TABLE: page_nav_geo_rules
CREATE TABLE page_nav_geo_rules (     id INTEGER PRIMARY KEY AUTOINCREMENT,     nav_item_id INTEGER NOT NULL,     country_code TEXT NOT NULL,     status TEXT NOT NULL DEFAULT 'allowed',     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     FOREIGN KEY (nav_item_id) REFERENCES nav_items(id) ON DELETE CASCADE );

-- TABLE: pages
CREATE TABLE pages (     id INTEGER PRIMARY KEY AUTOINCREMENT,     slug TEXT UNIQUE NOT NULL,     type TEXT NOT NULL,     template TEXT NOT NULL,     title TEXT NOT NULL,     content_json TEXT,     seo_title TEXT,     seo_description TEXT,     ai_generated INTEGER DEFAULT 0,     published INTEGER DEFAULT 1,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP , author_id INTEGER REFERENCES authors(id), created_by INTEGER, seo_keywords TEXT);

-- TABLE: password_resets
CREATE TABLE password_resets (     id INTEGER PRIMARY KEY AUTOINCREMENT,     user_id INTEGER NOT NULL,     token_hash TEXT NOT NULL,     expires_at DATETIME NOT NULL,     used_at DATETIME,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     FOREIGN KEY(user_id) REFERENCES users(id) );

-- TABLE: payment_methods
CREATE TABLE payment_methods (     id INTEGER PRIMARY KEY AUTOINCREMENT,     slug TEXT UNIQUE NOT NULL,     name TEXT NOT NULL,     icon_url TEXT,     method_type TEXT DEFAULT 'card',     description TEXT,     content_json TEXT,     seo_title TEXT,     seo_description TEXT,     seo_keywords TEXT,     sort_order INTEGER DEFAULT 0,     status TEXT DEFAULT 'published',     published INTEGER DEFAULT 1,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP );

-- TABLE: permissions
CREATE TABLE permissions (     id INTEGER PRIMARY KEY AUTOINCREMENT,     role TEXT NOT NULL,     resource TEXT NOT NULL,     action TEXT NOT NULL,     allowed INTEGER DEFAULT 0,     UNIQUE(role, resource, action) );

-- TABLE: platform_updates
CREATE TABLE platform_updates (     id INTEGER PRIMARY KEY AUTOINCREMENT,     slug TEXT UNIQUE NOT NULL,     title TEXT NOT NULL,     excerpt TEXT,     content TEXT NOT NULL,     featured_image INTEGER,     seo_title TEXT,     seo_description TEXT,     author_id INTEGER,     published INTEGER DEFAULT 1,     featured INTEGER DEFAULT 0,     published_at DATETIME,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, created_by INTEGER, seo_keywords TEXT,     FOREIGN KEY (author_id)         REFERENCES authors(id)         ON DELETE SET NULL );

-- TABLE: postback_configs
CREATE TABLE postback_configs (     id INTEGER PRIMARY KEY AUTOINCREMENT,     account_id INTEGER NOT NULL REFERENCES affiliate_accounts(id) ON DELETE RESTRICT,     label TEXT NOT NULL,     endpoint_token TEXT UNIQUE NOT NULL,     auth_method TEXT NOT NULL,     credential_reference TEXT NOT NULL,     signature_param TEXT,     timestamp_param TEXT,     timestamp_tolerance_seconds INTEGER DEFAULT 300,     allowed_ips TEXT,     field_mapping_json TEXT,     status TEXT DEFAULT 'active',     created_by INTEGER REFERENCES users(id),     updated_by INTEGER REFERENCES users(id),     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP );

-- TABLE: postback_logs
CREATE TABLE postback_logs (     id INTEGER PRIMARY KEY AUTOINCREMENT,     postback_config_id INTEGER REFERENCES postback_configs(id) ON DELETE SET NULL,     received_at DATETIME DEFAULT CURRENT_TIMESTAMP,     source_ip TEXT,     outcome TEXT NOT NULL,     reason TEXT,     click_id TEXT,     external_reference TEXT,     conversion_id INTEGER REFERENCES analytics_conversions(id) ON DELETE SET NULL,     normalized_payload_json TEXT,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP );

-- TABLE: provider_adapter_configs
CREATE TABLE provider_adapter_configs (     id INTEGER PRIMARY KEY AUTOINCREMENT,     account_id INTEGER NOT NULL REFERENCES affiliate_accounts(id) ON DELETE RESTRICT,     label TEXT NOT NULL,     provider_key TEXT NOT NULL,     api_base_url TEXT NOT NULL,     credential_reference TEXT NOT NULL,     auth_header_name TEXT,     auth_scheme TEXT,     conversions_path TEXT,     date_param_since TEXT,     date_param_until TEXT,     response_array_path TEXT,     field_mapping_json TEXT,     sync_frequency_minutes INTEGER NOT NULL DEFAULT 60,     last_sync_at DATETIME,     last_sync_status TEXT,     last_sync_error TEXT,     status TEXT DEFAULT 'active',     created_by INTEGER REFERENCES users(id),     updated_by INTEGER REFERENCES users(id),     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP );

-- TABLE: report_definitions
CREATE TABLE report_definitions (     id INTEGER PRIMARY KEY AUTOINCREMENT,     name TEXT NOT NULL,     report_type TEXT NOT NULL,     filters_json TEXT,     columns_json TEXT,     grouping_json TEXT,     sort_json TEXT,     owner_id INTEGER NOT NULL REFERENCES users(id),     status TEXT NOT NULL DEFAULT 'active',     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP );

-- TABLE: report_recipients
CREATE TABLE report_recipients (     id INTEGER PRIMARY KEY AUTOINCREMENT,     schedule_id INTEGER NOT NULL REFERENCES report_schedules(id) ON DELETE CASCADE,     user_id INTEGER REFERENCES users(id),     email TEXT,     CHECK (user_id IS NOT NULL OR email IS NOT NULL) );

-- TABLE: report_runs
CREATE TABLE report_runs (     id INTEGER PRIMARY KEY AUTOINCREMENT,     report_id INTEGER NOT NULL REFERENCES report_definitions(id) ON DELETE CASCADE,     schedule_id INTEGER REFERENCES report_schedules(id),     status TEXT NOT NULL DEFAULT 'running',     row_count INTEGER,     output_format TEXT,     error_message TEXT,     triggered_by INTEGER REFERENCES users(id),     started_at DATETIME DEFAULT CURRENT_TIMESTAMP,     finished_at DATETIME );

-- TABLE: report_schedules
CREATE TABLE report_schedules (     id INTEGER PRIMARY KEY AUTOINCREMENT,     report_id INTEGER NOT NULL REFERENCES report_definitions(id) ON DELETE CASCADE,     frequency TEXT NOT NULL,     timezone TEXT NOT NULL DEFAULT 'UTC',     next_run_at DATETIME,     enabled INTEGER NOT NULL DEFAULT 1,     output_format TEXT NOT NULL DEFAULT 'csv',     created_by INTEGER REFERENCES users(id),     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP );

-- TABLE: research_claim_sources
CREATE TABLE research_claim_sources (     id INTEGER PRIMARY KEY AUTOINCREMENT,     claim_id INTEGER NOT NULL REFERENCES research_claims(id) ON DELETE CASCADE,     source_id INTEGER NOT NULL REFERENCES research_sources(id) ON DELETE CASCADE,     citation_context TEXT,     source_quote TEXT,     support_type TEXT NOT NULL DEFAULT 'direct' CHECK (support_type IN (         'direct', 'partial', 'contextual', 'disputed'     )),     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     UNIQUE (claim_id, source_id) );

-- TABLE: research_claims
CREATE TABLE research_claims (     id INTEGER PRIMARY KEY AUTOINCREMENT,     research_item_id INTEGER NOT NULL REFERENCES research_items(id) ON DELETE CASCADE,     claim_text TEXT NOT NULL,     claim_type TEXT DEFAULT 'fact',     status TEXT NOT NULL DEFAULT 'unverified' CHECK (status IN (         'unverified', 'verified', 'disputed', 'superseded'     )),     jurisdiction_id TEXT REFERENCES countries(code),     valid_from DATE,     valid_until DATE,     verified_at DATETIME,     verified_by TEXT,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP );

-- TABLE: research_dataset_versions
CREATE TABLE research_dataset_versions (     id INTEGER PRIMARY KEY AUTOINCREMENT,     dataset_id INTEGER NOT NULL REFERENCES research_datasets(id) ON DELETE CASCADE,     version_number INTEGER NOT NULL,     columns_snapshot TEXT NOT NULL,     rows_snapshot TEXT NOT NULL,     changed_by TEXT,     change_summary TEXT,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     UNIQUE (dataset_id, version_number) );

-- TABLE: research_datasets
CREATE TABLE research_datasets (     id INTEGER PRIMARY KEY AUTOINCREMENT,     slug TEXT UNIQUE NOT NULL,     title TEXT NOT NULL,     description TEXT,     columns_json TEXT NOT NULL DEFAULT '[]',     rows_json TEXT NOT NULL DEFAULT '[]',     status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (         'draft', 'published', 'needs_update', 'archived'     )),     published INTEGER NOT NULL DEFAULT 0,     source_id INTEGER REFERENCES research_sources(id) ON DELETE SET NULL,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP );

-- TABLE: research_item_versions
CREATE TABLE research_item_versions (     id INTEGER PRIMARY KEY AUTOINCREMENT,     research_item_id INTEGER NOT NULL REFERENCES research_items(id) ON DELETE CASCADE,     version_number INTEGER NOT NULL,     content_snapshot TEXT NOT NULL,     changed_by TEXT,     change_summary TEXT,     restored_from_version INTEGER,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     UNIQUE (research_item_id, version_number) );

-- TABLE: research_items
CREATE TABLE research_items (     id INTEGER PRIMARY KEY AUTOINCREMENT,     type TEXT NOT NULL CHECK (type IN (         'report', 'country', 'regulator', 'topic',         'development', 'legislation', 'licence'     )),     slug TEXT NOT NULL,     title TEXT NOT NULL,     subtitle TEXT,     excerpt TEXT,     content_json TEXT,     country_id TEXT REFERENCES countries(code),     author_id INTEGER REFERENCES authors(id),     status TEXT NOT NULL DEFAULT 'draft'         CHECK (status IN (             'draft', 'researching', 'source_review', 'fact_check',             'editorial_review', 'approved', 'published',             'needs_update', 'archived'         )),     published INTEGER NOT NULL DEFAULT 0,     robots TEXT DEFAULT 'index,follow',     seo_title TEXT,     seo_description TEXT,     seo_keywords TEXT,     canonical_url TEXT,     og_image INTEGER REFERENCES media_library(id),     featured INTEGER NOT NULL DEFAULT 0,     published_at DATETIME,     last_verified_at DATETIME,     next_review_at DATETIME,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,     UNIQUE (type, slug) );

-- TABLE: research_relations
CREATE TABLE research_relations (     id INTEGER PRIMARY KEY AUTOINCREMENT,     from_type TEXT NOT NULL CHECK (from_type IN (         'research_item', 'casino', 'country', 'category', 'payment_method'     )),     from_id TEXT NOT NULL,     to_type TEXT NOT NULL CHECK (to_type IN (         'research_item', 'casino', 'country', 'category', 'payment_method'     )),     to_id TEXT NOT NULL,     relation_type TEXT NOT NULL CHECK (relation_type IN (         'covers', 'located_in', 'operates_in', 'regulated_by', 'regulates',         'licensed_by', 'requires', 'uses', 'related_to', 'part_of', 'contains',         'updates', 'supersedes', 'superseded_by', 'cites', 'supports',         'contradicts', 'derived_from', 'mentions', 'affects', 'affected_by',         'applies_to', 'available_in', 'restricted_in'     )),     label TEXT,     sort_order INTEGER NOT NULL DEFAULT 0,     is_primary INTEGER NOT NULL DEFAULT 0,     valid_from DATE,     valid_until DATE,     source_id INTEGER REFERENCES research_sources(id) ON DELETE SET NULL,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,     UNIQUE (from_type, from_id, to_type, to_id, relation_type) );

-- TABLE: research_sources
CREATE TABLE research_sources (     id INTEGER PRIMARY KEY AUTOINCREMENT,     organisation TEXT NOT NULL,     title TEXT,     url TEXT,     domain TEXT,     source_type TEXT NOT NULL DEFAULT 'other' CHECK (source_type IN (         'regulator', 'government', 'legislation', 'court',         'eu_institution', 'official_register', 'operator',         'industry_organization', 'academic', 'research_organization',         'news', 'other'     )),     country_id TEXT REFERENCES countries(code),     is_primary INTEGER NOT NULL DEFAULT 0,     document_type TEXT,     language TEXT,     publication_date DATE,     accessed_at DATETIME,     status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'broken', 'archived')),     notes TEXT,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP );

-- TABLE: review_blocks
CREATE TABLE review_blocks (     id INTEGER PRIMARY KEY AUTOINCREMENT,     review_slug TEXT NOT NULL,     title TEXT NOT NULL,     content TEXT NOT NULL,     position INTEGER DEFAULT 0,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP );

-- TABLE: review_criteria_scores
CREATE TABLE review_criteria_scores (     id INTEGER PRIMARY KEY AUTOINCREMENT,     review_id INTEGER NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,     criterion_key TEXT NOT NULL,     score REAL NOT NULL,     UNIQUE(review_id, criterion_key) );

-- TABLE: review_criteria_templates
CREATE TABLE review_criteria_templates (     id INTEGER PRIMARY KEY AUTOINCREMENT,     content_type TEXT NOT NULL,     criterion_key TEXT NOT NULL,     label TEXT NOT NULL,     weight REAL NOT NULL DEFAULT 0,     display_order INTEGER DEFAULT 0,     UNIQUE(content_type, criterion_key) );

-- TABLE: reviews
CREATE TABLE reviews (     id INTEGER PRIMARY KEY AUTOINCREMENT,     casino_slug TEXT NOT NULL,     country_code TEXT,     slug TEXT UNIQUE NOT NULL,     title TEXT NOT NULL,     content TEXT NOT NULL,     pros TEXT,     cons TEXT,     rating REAL,     seo_title TEXT,     seo_description TEXT,     ai_generated INTEGER DEFAULT 0,     published INTEGER DEFAULT 1,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP , overview TEXT, games TEXT, bonuses TEXT, payments TEXT, licenses TEXT, faq_json TEXT, verdict TEXT, author TEXT DEFAULT 'Elie Bizimana', author_title TEXT, reviewed_at TEXT, author_id INTEGER REFERENCES authors(id), created_by INTEGER, seo_keywords TEXT, reviewed_content_type TEXT, reviewed_content_id INTEGER);

-- TABLE: seo_meta
CREATE TABLE seo_meta (     id INTEGER PRIMARY KEY AUTOINCREMENT,     page_type TEXT NOT NULL,     page_slug TEXT NOT NULL,     title TEXT,     description TEXT,     keywords TEXT,     canonical TEXT,     og_image TEXT,     schema_json TEXT,     robots TEXT DEFAULT 'index, follow',     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,     UNIQUE(page_type, page_slug) );

-- TABLE: seo_page_casinos
CREATE TABLE seo_page_casinos (     id INTEGER PRIMARY KEY AUTOINCREMENT,     seo_page_id INTEGER NOT NULL REFERENCES seo_pages(id) ON DELETE CASCADE,     casino_id INTEGER NOT NULL REFERENCES casinos(id) ON DELETE CASCADE,     position INTEGER NOT NULL DEFAULT 0,     section_key TEXT,     display_mode TEXT NOT NULL DEFAULT 'card'         CHECK (display_mode IN ('card', 'editorial', 'comparison')),     custom_label TEXT,     is_featured INTEGER NOT NULL DEFAULT 0,     editorial_content TEXT,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     UNIQUE (seo_page_id, casino_id, section_key) );

-- TABLE: seo_pages
CREATE TABLE seo_pages (     id INTEGER PRIMARY KEY AUTOINCREMENT,     page_type TEXT NOT NULL CHECK (page_type IN ('country_custom', 'category_country')),     slug TEXT NOT NULL,     country_code TEXT NOT NULL REFERENCES countries(code),     category_id INTEGER REFERENCES categories(id),     title TEXT NOT NULL,     seo_title TEXT,     seo_description TEXT,     og_image TEXT,     featured_image TEXT,     canonical_url TEXT,     robots TEXT DEFAULT 'index,follow',     author_id INTEGER REFERENCES authors(id),     content_json TEXT,     casino_mode TEXT NOT NULL DEFAULT 'auto_priority'         CHECK (casino_mode IN ('manual', 'auto', 'auto_priority')),     min_casino_count INTEGER NOT NULL DEFAULT 1,     status TEXT NOT NULL DEFAULT 'draft'         CHECK (status IN ('draft', 'reviewed', 'published')),     published INTEGER NOT NULL DEFAULT 0,     sitemap_enabled INTEGER NOT NULL DEFAULT 1,     auto_generated INTEGER NOT NULL DEFAULT 0,     created_by INTEGER,     updated_by INTEGER,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, nav_label TEXT, seo_keywords TEXT,     UNIQUE (page_type, country_code, slug) );

-- TABLE: sessions
CREATE TABLE sessions (     id TEXT PRIMARY KEY,     user_id INTEGER NOT NULL,     expires_at DATETIME NOT NULL,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     FOREIGN KEY(user_id) REFERENCES users(id) );

-- TABLE: settings
CREATE TABLE settings (     key TEXT PRIMARY KEY,     value TEXT,     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP );

-- TABLE: sports
CREATE TABLE sports (     id INTEGER PRIMARY KEY AUTOINCREMENT,     slug TEXT UNIQUE NOT NULL,     name TEXT NOT NULL,     icon_url TEXT,     sort_order INTEGER DEFAULT 0 );

-- TABLE: super_api_nonces
CREATE TABLE super_api_nonces (     nonce TEXT NOT NULL,     credential_id TEXT NOT NULL,     created_at INTEGER NOT NULL,     PRIMARY KEY (credential_id, nonce) );

-- TABLE: super_api_rate_limits
CREATE TABLE super_api_rate_limits (     credential_id TEXT NOT NULL,     created_at INTEGER NOT NULL,     PRIMARY KEY (credential_id, created_at) );

-- TABLE: super_audit_logs
CREATE TABLE super_audit_logs (     id INTEGER PRIMARY KEY AUTOINCREMENT,     credential_id TEXT,     endpoint TEXT NOT NULL,     method TEXT NOT NULL,     resource TEXT,     resource_id TEXT,     action TEXT,                                                                                                            success INTEGER NOT NULL,     status_code INTEGER,     request_id TEXT,     created_at TEXT DEFAULT CURRENT_TIMESTAMP );

-- TABLE: system_settings
CREATE TABLE system_settings (     key TEXT PRIMARY KEY,     value TEXT NOT NULL,     updated_at TEXT DEFAULT CURRENT_TIMESTAMP );

-- TABLE: tenant_migrations
CREATE TABLE tenant_migrations (filename TEXT PRIMARY KEY, applied_at TEXT DEFAULT CURRENT_TIMESTAMP);

-- TABLE: tracking_link_geo_destinations
CREATE TABLE tracking_link_geo_destinations (     id INTEGER PRIMARY KEY AUTOINCREMENT,     tracking_link_id INTEGER NOT NULL REFERENCES tracking_links(id) ON DELETE CASCADE,     country_code TEXT NOT NULL,     destination_url TEXT NOT NULL,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     UNIQUE(tracking_link_id, country_code) );

-- TABLE: tracking_link_health_checks
CREATE TABLE tracking_link_health_checks (     id INTEGER PRIMARY KEY AUTOINCREMENT,     tracking_link_id INTEGER NOT NULL REFERENCES tracking_links(id) ON DELETE CASCADE,     checked_at DATETIME DEFAULT CURRENT_TIMESTAMP,     http_status INTEGER,     final_url TEXT,     redirect_count INTEGER,     response_time_ms INTEGER,     error_type TEXT,     error_message TEXT,     health_status TEXT NOT NULL,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP );

-- TABLE: tracking_links
CREATE TABLE tracking_links (     id INTEGER PRIMARY KEY AUTOINCREMENT,     internal_name TEXT NOT NULL,     tracking_code TEXT UNIQUE NOT NULL,     destination_url TEXT NOT NULL,     casino_id INTEGER REFERENCES casinos(id),     partner_id INTEGER REFERENCES affiliate_partners(id),     program_id INTEGER REFERENCES affiliate_programs(id),     offer_id INTEGER REFERENCES offers(id),     campaign TEXT,     source TEXT,     medium TEXT,     content TEXT,     allowed_geos TEXT,     blocked_geos TEXT,     priority INTEGER DEFAULT 0,     status TEXT DEFAULT 'active',     health_status TEXT DEFAULT 'unknown',     health_checked_at DATETIME,     created_by INTEGER REFERENCES users(id),     updated_by INTEGER REFERENCES users(id),     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP , campaign_id INTEGER REFERENCES campaigns(id));

-- TABLE: user_bookmarks
CREATE TABLE user_bookmarks (     user_id INTEGER NOT NULL,     casino_slug TEXT NOT NULL,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     PRIMARY KEY (user_id, casino_slug) );

-- TABLE: user_inquiries
CREATE TABLE user_inquiries (     id INTEGER PRIMARY KEY AUTOINCREMENT,     user_id INTEGER NOT NULL,     subject TEXT NOT NULL,     message TEXT NOT NULL,     status TEXT DEFAULT 'pending',     admin_reply TEXT,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP );

-- TABLE: user_item_access
CREATE TABLE user_item_access (     id INTEGER PRIMARY KEY AUTOINCREMENT,     user_id INTEGER NOT NULL,     resource TEXT NOT NULL,     action TEXT NOT NULL DEFAULT 'read',     scope TEXT NOT NULL DEFAULT 'all',     created_at TEXT DEFAULT CURRENT_TIMESTAMP,     updated_at TEXT DEFAULT CURRENT_TIMESTAMP,     UNIQUE(user_id, resource, action),     FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE );

-- TABLE: user_notifications
CREATE TABLE user_notifications (     id INTEGER PRIMARY KEY AUTOINCREMENT,     user_id INTEGER NOT NULL,     title TEXT NOT NULL,     message TEXT,     link TEXT,     is_read INTEGER DEFAULT 0,     created_at DATETIME DEFAULT CURRENT_TIMESTAMP , severity TEXT DEFAULT 'info', category TEXT, related_resource TEXT, related_id INTEGER, expires_at DATETIME);

-- TABLE: users
CREATE TABLE users (     id INTEGER PRIMARY KEY AUTOINCREMENT,     email TEXT UNIQUE NOT NULL,     password_hash TEXT NOT NULL,     role TEXT NOT NULL DEFAULT 'editor',     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP );

-- INDEX: idx_ad_rules_enabled
CREATE INDEX idx_ad_rules_enabled ON ad_rules(enabled);

-- INDEX: idx_ad_rules_page_type
CREATE INDEX idx_ad_rules_page_type ON ad_rules(page_type);

-- INDEX: idx_ad_rules_priority
CREATE INDEX idx_ad_rules_priority ON ad_rules(priority);

-- INDEX: idx_affiliate_accounts_program
CREATE INDEX idx_affiliate_accounts_program ON affiliate_accounts(program_id);

-- INDEX: idx_affiliate_partners_slug
CREATE INDEX idx_affiliate_partners_slug ON affiliate_partners(slug);

-- INDEX: idx_affiliate_partners_status
CREATE INDEX idx_affiliate_partners_status ON affiliate_partners(status);

-- INDEX: idx_affiliate_programs_partner
CREATE INDEX idx_affiliate_programs_partner ON affiliate_programs(partner_id);

-- INDEX: idx_affiliate_programs_status
CREATE INDEX idx_affiliate_programs_status ON affiliate_programs(status);

-- INDEX: idx_ai_conversations_session
CREATE INDEX idx_ai_conversations_session  ON ai_conversations(session_id);

-- INDEX: idx_ai_conversations_updated
CREATE INDEX idx_ai_conversations_updated  ON ai_conversations(updated_at);

-- INDEX: idx_ai_entity
CREATE INDEX idx_ai_entity ON ai_generations(entity_slug);

-- INDEX: idx_ai_free_tier_last
CREATE INDEX idx_ai_free_tier_last ON ai_free_tier_usage(last_message_at);

-- INDEX: idx_alert_rules_enabled
CREATE INDEX idx_alert_rules_enabled ON analytics_alert_rules(enabled);

-- INDEX: idx_alert_rules_scope
CREATE INDEX idx_alert_rules_scope ON analytics_alert_rules(scope_type, scope_id);

-- INDEX: idx_alerts_rule
CREATE INDEX idx_alerts_rule ON analytics_alerts(rule_id);

-- INDEX: idx_alerts_status
CREATE INDEX idx_alerts_status ON analytics_alerts(status, triggered_at);

-- INDEX: idx_analytics_daily_date
CREATE INDEX idx_analytics_daily_date ON analytics_daily(date);

-- INDEX: idx_analytics_daily_lookup
CREATE INDEX idx_analytics_daily_lookup ON analytics_daily(dimension_type, dimension_id, date);

-- INDEX: idx_analytics_events_campaign
CREATE INDEX idx_analytics_events_campaign ON analytics_events(campaign_id);

-- INDEX: idx_analytics_events_casino
CREATE INDEX idx_analytics_events_casino ON analytics_events(casino_id, occurred_at);

-- INDEX: idx_analytics_events_click_id
CREATE INDEX idx_analytics_events_click_id ON analytics_events(click_id);

-- INDEX: idx_analytics_events_content_item
CREATE INDEX idx_analytics_events_content_item ON analytics_events(content_item_id);

-- INDEX: idx_analytics_events_country
CREATE INDEX idx_analytics_events_country ON analytics_events(country_code, occurred_at);

-- INDEX: idx_analytics_events_news
CREATE INDEX idx_analytics_events_news ON analytics_events(news_id, occurred_at);

-- INDEX: idx_analytics_events_offer
CREATE INDEX idx_analytics_events_offer ON analytics_events(offer_id, occurred_at);

-- INDEX: idx_analytics_events_partner
CREATE INDEX idx_analytics_events_partner ON analytics_events(partner_id, occurred_at);

-- INDEX: idx_analytics_events_session
CREATE INDEX idx_analytics_events_session ON analytics_events(session_id, occurred_at);

-- INDEX: idx_analytics_events_tracking_link
CREATE INDEX idx_analytics_events_tracking_link ON analytics_events(tracking_link_id, occurred_at);

-- INDEX: idx_analytics_events_type_time
CREATE INDEX idx_analytics_events_type_time ON analytics_events(event_type, occurred_at);

-- INDEX: idx_auth_attempts_ip
CREATE INDEX idx_auth_attempts_ip ON auth_attempts(ip_hash, action, created_at);

-- INDEX: idx_banners_enabled
CREATE INDEX idx_banners_enabled ON banners(enabled, position);

-- INDEX: idx_campaigns_dates
CREATE INDEX idx_campaigns_dates ON campaigns(start_date, end_date);

-- INDEX: idx_campaigns_status
CREATE INDEX idx_campaigns_status ON campaigns(status);

-- INDEX: idx_casino_name
CREATE INDEX idx_casino_name ON casinos(name);

-- INDEX: idx_casinos_created_by
CREATE INDEX idx_casinos_created_by ON casinos(created_by);

-- INDEX: idx_casinos_featured
CREATE INDEX idx_casinos_featured ON casinos(featured);

-- INDEX: idx_casinos_published
CREATE INDEX idx_casinos_published ON casinos(published);

-- INDEX: idx_casinos_slug
CREATE INDEX idx_casinos_slug ON casinos(slug);

-- INDEX: idx_casinos_sort_order
CREATE INDEX idx_casinos_sort_order ON casinos(sort_order);

-- INDEX: idx_categories_published
CREATE INDEX idx_categories_published ON categories(published);

-- INDEX: idx_categories_slug
CREATE INDEX idx_categories_slug ON categories(slug);

-- INDEX: idx_cc_casino
CREATE INDEX idx_cc_casino ON casino_categories(casino_id);

-- INDEX: idx_cc_category
CREATE INDEX idx_cc_category ON casino_categories(category_id);

-- INDEX: idx_clicks_casino
CREATE INDEX idx_clicks_casino ON clicks(casino_slug);

-- INDEX: idx_clicks_date
CREATE INDEX idx_clicks_date ON clicks(created_at);

-- INDEX: idx_commercial_terms_account
CREATE INDEX idx_commercial_terms_account ON affiliate_commercial_terms(account_id);

-- INDEX: idx_commercial_terms_casino
CREATE INDEX idx_commercial_terms_casino ON affiliate_commercial_terms(casino_id);

-- INDEX: idx_commercial_terms_lookup
CREATE INDEX idx_commercial_terms_lookup     ON affiliate_commercial_terms(program_id, account_id, casino_id, geo_code, effective_date, expiry_date);

-- INDEX: idx_commercial_terms_program
CREATE INDEX idx_commercial_terms_program ON affiliate_commercial_terms(program_id);

-- INDEX: idx_comparisons_type_status
CREATE INDEX idx_comparisons_type_status ON comparisons(content_type, status);

-- INDEX: idx_components_slug
CREATE INDEX idx_components_slug ON components(slug);

-- INDEX: idx_components_status
CREATE INDEX idx_components_status ON components(status);

-- INDEX: idx_components_type
CREATE INDEX idx_components_type ON components(type);

-- INDEX: idx_content_categories_cat
CREATE INDEX idx_content_categories_cat ON content_categories(category_id);

-- INDEX: idx_content_categories_lookup
CREATE INDEX idx_content_categories_lookup ON content_categories(content_type, content_id);

-- INDEX: idx_content_currencies_currency
CREATE INDEX idx_content_currencies_currency ON content_currencies(currency_id);

-- INDEX: idx_content_geo_country
CREATE INDEX idx_content_geo_country ON content_geo(country_code);

-- INDEX: idx_content_geo_lookup
CREATE INDEX idx_content_geo_lookup ON content_geo(content_type, content_id);

-- INDEX: idx_content_items_affiliate_partner
CREATE INDEX idx_content_items_affiliate_partner ON content_items(linked_affiliate_partner_id);

-- INDEX: idx_content_items_author
CREATE INDEX idx_content_items_author ON content_items(author_id);

-- INDEX: idx_content_items_created_by
CREATE INDEX idx_content_items_created_by ON content_items(created_by);

-- INDEX: idx_content_items_slug
CREATE INDEX idx_content_items_slug ON content_items(content_type, slug);

-- INDEX: idx_content_items_type_status
CREATE INDEX idx_content_items_type_status ON content_items(content_type, status);

-- INDEX: idx_content_landing_pages_type
CREATE INDEX idx_content_landing_pages_type ON content_landing_pages(content_type);

-- INDEX: idx_content_payment_methods_pm
CREATE INDEX idx_content_payment_methods_pm ON content_payment_methods(payment_method_id);

-- INDEX: idx_content_sports_sport
CREATE INDEX idx_content_sports_sport ON content_sports(sport_id);

-- INDEX: idx_conversions_account
CREATE INDEX idx_conversions_account ON analytics_conversions(account_id, occurred_at);

-- INDEX: idx_conversions_campaign
CREATE INDEX idx_conversions_campaign ON analytics_conversions(campaign_id);

-- INDEX: idx_conversions_click
CREATE INDEX idx_conversions_click ON analytics_conversions(click_id);

-- INDEX: idx_conversions_external_ref_source
CREATE UNIQUE INDEX idx_conversions_external_ref_source     ON analytics_conversions(account_id, external_reference, source);

-- INDEX: idx_conversions_link
CREATE INDEX idx_conversions_link ON analytics_conversions(tracking_link_id, occurred_at);

-- INDEX: idx_conversions_player
CREATE INDEX idx_conversions_player ON analytics_conversions(account_id, external_player_id);

-- INDEX: idx_conversions_source
CREATE INDEX idx_conversions_source ON analytics_conversions(source, occurred_at);

-- INDEX: idx_conversions_status
CREATE INDEX idx_conversions_status ON analytics_conversions(status);

-- INDEX: idx_conversions_type
CREATE INDEX idx_conversions_type ON analytics_conversions(conversion_type, occurred_at);

-- INDEX: idx_countries_featured
CREATE INDEX idx_countries_featured ON countries(is_featured, featured_position);

-- INDEX: idx_countries_published
CREATE INDEX idx_countries_published ON countries(published);

-- INDEX: idx_cpm_casino
CREATE INDEX idx_cpm_casino ON casino_payment_methods(casino_id);

-- INDEX: idx_cpm_payment_method
CREATE INDEX idx_cpm_payment_method ON casino_payment_methods(payment_method_id);

-- INDEX: idx_custom_field_defs_type
CREATE INDEX idx_custom_field_defs_type ON custom_field_definitions(custom_type_slug);

-- INDEX: idx_email_campaigns_created
CREATE INDEX idx_email_campaigns_created ON email_campaigns(created_at);

-- INDEX: idx_geo_casino
CREATE INDEX idx_geo_casino ON geo_rules(casino_slug);

-- INDEX: idx_geo_country
CREATE INDEX idx_geo_country ON geo_rules(country_code);

-- INDEX: idx_geo_unique
CREATE UNIQUE INDEX idx_geo_unique ON geo_rules(casino_slug, country_code);

-- INDEX: idx_import_batches_account
CREATE INDEX idx_import_batches_account ON import_batches(account_id, created_at);

-- INDEX: idx_inquiries_user
CREATE INDEX idx_inquiries_user ON user_inquiries(user_id, status);

-- INDEX: idx_item_assignments_item
CREATE INDEX idx_item_assignments_item ON item_access_assignments(resource, item_id);

-- INDEX: idx_item_assignments_resource
CREATE INDEX idx_item_assignments_resource ON item_access_assignments(resource);

-- INDEX: idx_item_assignments_user
CREATE INDEX idx_item_assignments_user ON item_access_assignments(user_id);

-- INDEX: idx_item_assignments_user_resource
CREATE INDEX idx_item_assignments_user_resource ON item_access_assignments(user_id, resource);

-- INDEX: idx_media_filename
CREATE INDEX idx_media_filename ON media_library(filename);

-- INDEX: idx_media_folder
CREATE INDEX idx_media_folder ON media_library(folder);

-- INDEX: idx_media_folders_parent
CREATE INDEX idx_media_folders_parent ON media_folders(parent_id);

-- INDEX: idx_media_folders_slug
CREATE INDEX idx_media_folders_slug ON media_folders(slug);

-- INDEX: idx_media_type
CREATE INDEX idx_media_type ON media_library(type);

-- INDEX: idx_nav_items_scope
CREATE INDEX idx_nav_items_scope ON nav_items(location, scope_type, scope_ref, enabled, position);

-- INDEX: idx_nav_items_source
CREATE UNIQUE INDEX idx_nav_items_source ON nav_items(source_type, source_ref) WHERE source_type IS NOT NULL;

-- INDEX: idx_nav_location
CREATE INDEX idx_nav_location ON nav_items(location, enabled, position);

-- INDEX: idx_news_article_countries_country
CREATE INDEX idx_news_article_countries_country ON news_article_countries(country_code, news_id);

-- INDEX: idx_news_article_entities_entity
CREATE INDEX idx_news_article_entities_entity ON news_article_entities(entity_id, news_id);

-- INDEX: idx_news_article_sources_news
CREATE INDEX idx_news_article_sources_news ON news_article_sources(news_id, display_order);

-- INDEX: idx_news_article_topics_topic
CREATE INDEX idx_news_article_topics_topic ON news_article_topics(topic_id, news_id);

-- INDEX: idx_news_article_type
CREATE INDEX idx_news_article_type ON news(article_type);

-- INDEX: idx_news_author
CREATE INDEX idx_news_author ON news(author_id);

-- INDEX: idx_news_corrections_news
CREATE INDEX idx_news_corrections_news ON news_corrections(news_id, created_at);

-- INDEX: idx_news_created_by
CREATE INDEX idx_news_created_by ON news(created_by);

-- INDEX: idx_news_date
CREATE INDEX idx_news_date ON news(created_at);

-- INDEX: idx_news_editorial_assignee
CREATE INDEX idx_news_editorial_assignee ON news_editorial(assigned_to, workflow_status);

-- INDEX: idx_news_editorial_notes_news
CREATE INDEX idx_news_editorial_notes_news ON news_editorial_notes(news_id, created_at);

-- INDEX: idx_news_editorial_status
CREATE INDEX idx_news_editorial_status ON news_editorial(workflow_status);

-- INDEX: idx_news_entities_country
CREATE INDEX idx_news_entities_country ON news_entities(country_code);

-- INDEX: idx_news_entities_type
CREATE INDEX idx_news_entities_type ON news_entities(entity_type, active);

-- INDEX: idx_news_pins_slot
CREATE INDEX idx_news_pins_slot ON news_pins(slot, position);

-- INDEX: idx_news_primary_country
CREATE INDEX idx_news_primary_country ON news(primary_country);

-- INDEX: idx_news_published
CREATE INDEX idx_news_published ON news(published);

-- INDEX: idx_news_published_date
CREATE INDEX idx_news_published_date ON news(published, published_at);

-- INDEX: idx_news_redirects_news
CREATE INDEX idx_news_redirects_news ON news_redirects(news_id);

-- INDEX: idx_news_region_countries_country
CREATE INDEX idx_news_region_countries_country ON news_region_countries(country_code);

-- INDEX: idx_news_related_target
CREATE INDEX idx_news_related_target ON news_related(related_news_id);

-- INDEX: idx_news_revisions_news
CREATE INDEX idx_news_revisions_news ON news_revisions(news_id, version_number DESC);

-- INDEX: idx_news_search_terms_news
CREATE INDEX idx_news_search_terms_news ON news_search_terms(news_id);

-- INDEX: idx_news_section
CREATE INDEX idx_news_section ON news(section_id);

-- INDEX: idx_news_sections_active_order
CREATE INDEX idx_news_sections_active_order ON news_sections(active, display_order);

-- INDEX: idx_news_sections_parent
CREATE INDEX idx_news_sections_parent ON news_sections(parent_id);

-- INDEX: idx_news_series_articles_news
CREATE INDEX idx_news_series_articles_news ON news_series_articles(news_id);

-- INDEX: idx_news_slug
CREATE INDEX idx_news_slug ON news(slug);

-- INDEX: idx_news_timeline_updates_news
CREATE INDEX idx_news_timeline_updates_news ON news_timeline_updates(news_id, update_time);

-- INDEX: idx_newsletter_subscribers_token
CREATE INDEX idx_newsletter_subscribers_token ON newsletter_subscribers(token);

-- INDEX: idx_newsletter_subscribers_user
CREATE INDEX idx_newsletter_subscribers_user ON newsletter_subscribers(user_id);

-- INDEX: idx_notifications_category
CREATE INDEX idx_notifications_category ON user_notifications(category, is_read);

-- INDEX: idx_notifications_user
CREATE INDEX idx_notifications_user ON user_notifications(user_id, is_read);

-- INDEX: idx_offer_versions_lookup
CREATE INDEX idx_offer_versions_lookup ON offer_versions(offer_id, valid_from, valid_to);

-- INDEX: idx_offer_versions_offer
CREATE INDEX idx_offer_versions_offer ON offer_versions(offer_id);

-- INDEX: idx_offers_casino
CREATE INDEX idx_offers_casino ON offers(casino_id);

-- INDEX: idx_offers_dates
CREATE INDEX idx_offers_dates ON offers(start_date, expiry_date);

-- INDEX: idx_offers_program
CREATE INDEX idx_offers_program ON offers(program_id);

-- INDEX: idx_offers_selection
CREATE INDEX idx_offers_selection ON offers(casino_id, status, priority);

-- INDEX: idx_offers_status
CREATE INDEX idx_offers_status ON offers(status);

-- INDEX: idx_page_nav_geo_country
CREATE INDEX idx_page_nav_geo_country ON page_nav_geo_rules(country_code);

-- INDEX: idx_page_nav_geo_item
CREATE INDEX idx_page_nav_geo_item ON page_nav_geo_rules(nav_item_id);

-- INDEX: idx_page_nav_geo_lookup
CREATE INDEX idx_page_nav_geo_lookup ON page_nav_geo_rules(nav_item_id, country_code);

-- INDEX: idx_pages_author
CREATE INDEX idx_pages_author ON pages(author_id);

-- INDEX: idx_pages_created_by
CREATE INDEX idx_pages_created_by ON pages(created_by);

-- INDEX: idx_pages_slug
CREATE INDEX idx_pages_slug ON pages(slug);

-- INDEX: idx_pages_type
CREATE INDEX idx_pages_type ON pages(type);

-- INDEX: idx_partner_contacts_partner
CREATE INDEX idx_partner_contacts_partner ON affiliate_partner_contacts(partner_id);

-- INDEX: idx_password_resets_token
CREATE INDEX idx_password_resets_token ON password_resets(token_hash);

-- INDEX: idx_password_resets_user
CREATE INDEX idx_password_resets_user ON password_resets(user_id);

-- INDEX: idx_payment_methods_published
CREATE INDEX idx_payment_methods_published ON payment_methods(published);

-- INDEX: idx_payment_methods_slug
CREATE INDEX idx_payment_methods_slug ON payment_methods(slug);

-- INDEX: idx_pc_bulk
CREATE INDEX idx_pc_bulk ON page_components(page_type, page_slug, injection_point, enabled);

-- INDEX: idx_pc_component
CREATE INDEX idx_pc_component ON page_components(component_id);

-- INDEX: idx_pc_page
CREATE INDEX idx_pc_page ON page_components(page_type, page_slug);

-- INDEX: idx_platform_updates_author
CREATE INDEX idx_platform_updates_author ON platform_updates(author_id);

-- INDEX: idx_platform_updates_created_by
CREATE INDEX idx_platform_updates_created_by ON platform_updates(created_by);

-- INDEX: idx_platform_updates_date
CREATE INDEX idx_platform_updates_date ON platform_updates(published_at);

-- INDEX: idx_platform_updates_featured
CREATE INDEX idx_platform_updates_featured ON platform_updates(featured);

-- INDEX: idx_platform_updates_published
CREATE INDEX idx_platform_updates_published ON platform_updates(published);

-- INDEX: idx_platform_updates_slug
CREATE INDEX idx_platform_updates_slug ON platform_updates(slug);

-- INDEX: idx_postback_configs_account
CREATE INDEX idx_postback_configs_account ON postback_configs(account_id);

-- INDEX: idx_postback_configs_status
CREATE INDEX idx_postback_configs_status ON postback_configs(status);

-- INDEX: idx_postback_logs_config
CREATE INDEX idx_postback_logs_config ON postback_logs(postback_config_id, received_at);

-- INDEX: idx_postback_logs_outcome
CREATE INDEX idx_postback_logs_outcome ON postback_logs(outcome, received_at);

-- INDEX: idx_program_casinos_casino
CREATE INDEX idx_program_casinos_casino ON affiliate_program_casinos(casino_id);

-- INDEX: idx_provider_adapter_configs_account
CREATE INDEX idx_provider_adapter_configs_account ON provider_adapter_configs(account_id);

-- INDEX: idx_provider_adapter_configs_status
CREATE INDEX idx_provider_adapter_configs_status ON provider_adapter_configs(status);

-- INDEX: idx_rb_slug
CREATE INDEX idx_rb_slug ON review_blocks(review_slug);

-- INDEX: idx_report_definitions_owner
CREATE INDEX idx_report_definitions_owner ON report_definitions(owner_id);

-- INDEX: idx_report_definitions_type
CREATE INDEX idx_report_definitions_type ON report_definitions(report_type);

-- INDEX: idx_report_recipients_schedule
CREATE INDEX idx_report_recipients_schedule ON report_recipients(schedule_id);

-- INDEX: idx_report_runs_report
CREATE INDEX idx_report_runs_report ON report_runs(report_id, started_at);

-- INDEX: idx_report_runs_status
CREATE INDEX idx_report_runs_status ON report_runs(status);

-- INDEX: idx_report_schedules_due
CREATE INDEX idx_report_schedules_due ON report_schedules(enabled, next_run_at);

-- INDEX: idx_report_schedules_report
CREATE INDEX idx_report_schedules_report ON report_schedules(report_id);

-- INDEX: idx_research_claim_sources_claim
CREATE INDEX idx_research_claim_sources_claim ON research_claim_sources(claim_id);

-- INDEX: idx_research_claim_sources_source
CREATE INDEX idx_research_claim_sources_source ON research_claim_sources(source_id);

-- INDEX: idx_research_claims_item
CREATE INDEX idx_research_claims_item ON research_claims(research_item_id);

-- INDEX: idx_research_claims_jurisdiction
CREATE INDEX idx_research_claims_jurisdiction ON research_claims(jurisdiction_id);

-- INDEX: idx_research_claims_status
CREATE INDEX idx_research_claims_status ON research_claims(status);

-- INDEX: idx_research_dataset_versions_dataset
CREATE INDEX idx_research_dataset_versions_dataset ON research_dataset_versions(dataset_id);

-- INDEX: idx_research_datasets_status
CREATE INDEX idx_research_datasets_status ON research_datasets(status);

-- INDEX: idx_research_item_versions_item
CREATE INDEX idx_research_item_versions_item ON research_item_versions(research_item_id);

-- INDEX: idx_research_items_country
CREATE INDEX idx_research_items_country ON research_items(country_id);

-- INDEX: idx_research_items_next_review
CREATE INDEX idx_research_items_next_review ON research_items(next_review_at);

-- INDEX: idx_research_items_published
CREATE INDEX idx_research_items_published ON research_items(published);

-- INDEX: idx_research_items_status
CREATE INDEX idx_research_items_status ON research_items(status);

-- INDEX: idx_research_items_type
CREATE INDEX idx_research_items_type ON research_items(type);

-- INDEX: idx_research_relations_from
CREATE INDEX idx_research_relations_from ON research_relations(from_type, from_id);

-- INDEX: idx_research_relations_to
CREATE INDEX idx_research_relations_to ON research_relations(to_type, to_id);

-- INDEX: idx_research_relations_type
CREATE INDEX idx_research_relations_type ON research_relations(relation_type);

-- INDEX: idx_research_sources_country
CREATE INDEX idx_research_sources_country ON research_sources(country_id);

-- INDEX: idx_research_sources_status
CREATE INDEX idx_research_sources_status ON research_sources(status);

-- INDEX: idx_research_sources_type
CREATE INDEX idx_research_sources_type ON research_sources(source_type);

-- INDEX: idx_reviews_author
CREATE INDEX idx_reviews_author ON reviews(author_id);

-- INDEX: idx_reviews_casino
CREATE INDEX idx_reviews_casino ON reviews(casino_slug);

-- INDEX: idx_reviews_country
CREATE INDEX idx_reviews_country ON reviews(country_code);

-- INDEX: idx_reviews_created_by
CREATE INDEX idx_reviews_created_by ON reviews(created_by);

-- INDEX: idx_reviews_published
CREATE INDEX idx_reviews_published ON reviews(published);

-- INDEX: idx_reviews_reviewed_content
CREATE INDEX idx_reviews_reviewed_content ON reviews(reviewed_content_type, reviewed_content_id);

-- INDEX: idx_reviews_slug
CREATE INDEX idx_reviews_slug ON reviews(slug);

-- INDEX: idx_reviews_title
CREATE INDEX idx_reviews_title ON reviews(title);

-- INDEX: idx_seo_page
CREATE INDEX idx_seo_page ON seo_meta(page_type, page_slug);

-- INDEX: idx_seo_page_casinos_page
CREATE INDEX idx_seo_page_casinos_page ON seo_page_casinos(seo_page_id, position);

-- INDEX: idx_seo_pages_category_country
CREATE INDEX idx_seo_pages_category_country ON seo_pages(category_id, country_code);

-- INDEX: idx_seo_pages_lookup
CREATE INDEX idx_seo_pages_lookup ON seo_pages(page_type, country_code, slug);

-- INDEX: idx_seo_pages_status
CREATE INDEX idx_seo_pages_status ON seo_pages(published, sitemap_enabled);

-- INDEX: idx_sessions_user
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- INDEX: idx_submissions_user
CREATE INDEX idx_submissions_user ON casino_submissions(user_id, status);

-- INDEX: idx_super_audit_created
CREATE INDEX idx_super_audit_created ON super_audit_logs(created_at);

-- INDEX: idx_super_audit_credential
CREATE INDEX idx_super_audit_credential ON super_audit_logs(credential_id);

-- INDEX: idx_super_nonces_created
CREATE INDEX idx_super_nonces_created ON super_api_nonces(created_at);

-- INDEX: idx_tl_geo_dest_link
CREATE INDEX idx_tl_geo_dest_link ON tracking_link_geo_destinations(tracking_link_id);

-- INDEX: idx_tl_health_link
CREATE INDEX idx_tl_health_link ON tracking_link_health_checks(tracking_link_id, checked_at);

-- INDEX: idx_tracking_links_campaign
CREATE INDEX idx_tracking_links_campaign ON tracking_links(campaign_id);

-- INDEX: idx_tracking_links_casino
CREATE INDEX idx_tracking_links_casino ON tracking_links(casino_id);

-- INDEX: idx_tracking_links_code
CREATE INDEX idx_tracking_links_code ON tracking_links(tracking_code);

-- INDEX: idx_tracking_links_health
CREATE INDEX idx_tracking_links_health ON tracking_links(health_status);

-- INDEX: idx_tracking_links_offer
CREATE INDEX idx_tracking_links_offer ON tracking_links(offer_id);

-- INDEX: idx_tracking_links_selection
CREATE INDEX idx_tracking_links_selection ON tracking_links(casino_id, status, priority);

-- INDEX: idx_tracking_links_status
CREATE INDEX idx_tracking_links_status ON tracking_links(status);

-- INDEX: idx_user_item_access_resource
CREATE INDEX idx_user_item_access_resource ON user_item_access(resource);

-- INDEX: idx_user_item_access_user
CREATE INDEX idx_user_item_access_user ON user_item_access(user_id);

-- INDEX: idx_user_item_access_user_resource
CREATE INDEX idx_user_item_access_user_resource ON user_item_access(user_id, resource);

-- INDEX: idx_users_email
CREATE INDEX idx_users_email ON users(email);

-- TRIGGER: trg_casino_rating_to_reviews
CREATE TRIGGER trg_casino_rating_to_reviews AFTER UPDATE OF rating ON casinos BEGIN   UPDATE reviews   SET rating = NEW.rating,       updated_at = CURRENT_TIMESTAMP   WHERE casino_slug = NEW.slug; END;

-- TRIGGER: trg_review_rating_from_casino
CREATE TRIGGER trg_review_rating_from_casino AFTER INSERT ON reviews BEGIN   UPDATE reviews   SET rating = (SELECT rating FROM casinos WHERE slug = NEW.casino_slug)   WHERE id = NEW.id     AND EXISTS (SELECT 1 FROM casinos WHERE slug = NEW.casino_slug); END;
