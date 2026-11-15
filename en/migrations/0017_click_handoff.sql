-- Click-id / sub-id handoff: how a tracking link passes OUR click id (and the visitor's sub1..sub10) to the operator.
-- A separate one-row-per-link table (not ALTER TABLE ... ADD COLUMN) so the migration is idempotent and the code keeps working
-- on a tenant database that has not been migrated yet (every read/write of this table is guarded).
CREATE TABLE IF NOT EXISTS tracking_link_handoff (
  tracking_link_id INTEGER PRIMARY KEY REFERENCES tracking_links(id) ON DELETE CASCADE,
  click_id_param TEXT,      -- query parameter the operator expects the click id in (sub_id, aff_click_id, anid, click_id ...)
  sub_param_map TEXT,       -- JSON {"sub1":"sub_id2", ...}: which of OUR inbound sub1..sub10 go out under which operator parameter
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
