-- Phase 9: provisioning. Gives every EXISTING site the "Full platform" configuration explicitly and marks its setup as
-- complete, so the setup wizard never appears on a site that is already in use.
-- Forward-only and idempotent (safe to run twice). INSERT OR IGNORE never overwrites a configuration or a choice
-- that is already stored, so running this on a site someone has configured changes nothing about its behaviour.
--
-- "Full platform" is what a site with no stored configuration already did (the resolver falls back to it), so the
-- stored row below is the same behaviour made visible. Modules added to the platform later are on by default, as before.
--
-- A brand-new site gets the same rows from this file when it is first built. The control plane then marks its setup as
-- "pending" and applies the chosen preset (see worker/site-profile/setup.js), so the owner is guided through the wizard.
INSERT OR IGNORE INTO settings (key, value) VALUES ('site_profile', '{"v":2,"preset":"full"}');
INSERT OR IGNORE INTO settings (key, value) VALUES ('site_setup_state', 'complete');
INSERT OR IGNORE INTO settings (key, value) VALUES ('site_setup_source', 'migrated');
