-- =====================================================
-- 0049_research_review_queue.sql
-- Research Engine — Phase 5: review queue.
--
-- No new tables. The review queue is computed entirely from
-- existing columns (research_items.next_review_at from 0045,
-- research_sources.status from 0046, research_relations from
-- 0047) — see worker/database/research-review-queue.js.
--
-- The only schema change is the feature flag for the scheduled
-- source-health-check job, same convention as every other cron
-- job's flag in this codebase (system_settings, default off —
-- see 0025_tracking_links.sql's tracking_link_health_cron_enabled
-- for the precedent this follows).
-- =====================================================

INSERT OR IGNORE INTO system_settings (key, value)
VALUES ('research_source_health_cron_enabled', 'false');
