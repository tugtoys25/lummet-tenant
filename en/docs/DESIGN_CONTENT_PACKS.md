# Design: content packs (Phase 11, T6)

Status: DESIGN ONLY. Nothing is built. Implementation starts only after you approve or edit the decisions in section 10.
Read from the baseline code (`worker/site-profile/transfer.js`, `migrations/0001_baseline.sql`, `worker/database/*`). Nothing was run.

## 1. What a content pack is
A file that moves **content** (not configuration) from one Lummet site to another. The configuration export
(`lummet-config`) already moves structure, settings and menus. A content pack is a second, separate envelope, so the
two can be used independently and the configuration limit (900 KB) does not have to grow.

## 2. Scope
| In v1 | Match key on import | Notes |
|---|---|---|
| Articles (`news`, `news_sections`) | `slug` | author, section and tags carried by slug |
| Pages (`pages`) | `slug` | text and `content_json` only |
| Authors (`authors`) | `slug` | no `email` field, ever |
| Categories (`categories`) | `slug` | |
| Casinos (`casinos`) | `slug` | `affiliate_url` is carried but flagged in the report: it is the owner's money link |
| Reviews (`reviews`, plus the generic review tables; exact names to confirm) | `slug` | linked to a casino or content item by slug |
| Custom types: definitions plus items (`custom_content_types`, `content_items`) | `(content_type, slug)` | definition created if missing |

Out of v1: users and accounts, clicks and analytics, offers, tracking links, postbacks, partner commercial terms and
payment-provider data (secrets and money), settings and menus (already in the config export), media files themselves.
`content_items` of every type (sportsbook, affiliate partner, custom) are in scope through the last row of the table;
the separate `affiliate_partners` records with contacts and commercial terms are not.

## 3. Format and limits
- Envelope: `{ format: "lummet-content", formatVersion: 1, name, description, exportedAt, source: { host, platform }, sections: [ids], checksum, document: { tables } }`.
- Same canonical JSON and `sha256:` checksum helpers as the config export (`canon`, `sha256Hex`). A wrong or missing
  checksum is a warning, never trusted, same as today.
- Sections are chosen at export (articles, pages, authors, categories, casinos, reviews, custom). A missing section is
  never widened into "everything".
- Limits (proposed): 5 MB per file, 500 items per pack, 200 KB per body field, 2,000 characters per short field.
  Over the limit = export refuses and says how to split. Import refuses before parsing past the limit.
- Row ids are never exported. Cross references use slugs and pack-local keys, so ids in the target can differ.

## 4. Media
v1 carries a **media manifest**, not files: `{ ref, filename, alt, caption, credit, license, mime, size, sha256, sourceUrl }`.
Content refers to media by `ref`. On import each ref is matched to the target's `media_library` by `r2_key` or
`filename + size`. A ref with no match leaves the image empty and appears in the report as "image missing: upload it,
then re-run". Nothing is downloaded from `sourceUrl` in v1 (no outbound fetch, no SSRF surface).
Links inside body text: absolute links to the source host are made relative; relative `/en/...` links are kept; links that
point at a page the pack does not contain and the target lacks are listed, not changed. The existing link rewriter
already hides links to switched-off sections at render time.

## 5. Slug conflicts
Decided per item at the dry run, one policy per type, with these choices:
- **Skip** (default): the existing row is untouched.
- **Create with a new slug**: `slug-2`, `slug-3`; only for items that do not exist yet under that key.
- **Replace**: overwrite the existing row. Off by default; the previous row is stored for rollback (section 7).
Authors and categories are matched, not duplicated: an item that names an author or category slug the target lacks gets
it created (as a pack-created row) or left empty if you choose "do not create".

## 6. Draft versus live
Everything imported lands as a **draft**: `published = 0` and `status = 'draft'` where the table has them, whatever it was
at the source. Publishing stays in the existing editors and bulk actions. This mirrors the configuration import, which
only ever writes a draft. Items of a module that is switched off are still imported (hidden by the profile, data kept).

## 7. Dry run, apply, rollback
1. **Upload** (admin): file is parsed and validated in memory. The client never supplies a plan.
2. **Dry run**: the server plans and returns a report, writing nothing: counts of create / skip / rename / replace per
   type, missing media, missing authors and categories, custom types that would be created, links to missing pages,
   oversize or malformed items (listed with reasons), checksum status, and which items belong to switched-off modules.
3. **Apply**: runs in chunks of 50 rows through `env.DB.batch`, resumable, one run at a time per site. The server plans
   again before the first write and refuses if the target changed since the dry run.
4. **Run record**: every run gets an id. Each row created is recorded; each row replaced is stored as a JSON snapshot.
5. **Rollback** (by run id): restores replaced rows from their snapshots and removes only the rows that run created, and
   only if they are unchanged since import (`updated_at` equal). Anything edited since is left and listed.
Audit: one `recordTransfer` entry per export, dry run, apply and rollback, the same audit log as configuration changes.

## 8. Roles and rate limits
- Export: users who can already export configuration (`transferPermissions`).
- Dry run and apply: admin only, new permission `content.import`. Publishing the imported drafts keeps its current permission.
- Limits (proposed): 10 exports per hour per user, 3 applies per hour per site, 1 run at a time, 5 MB body cap enforced
  before parsing.

## 9. Does it need a migration?
**Yes.** Chunked, resumable apply and rollback need two new tables: `content_pack_runs` (id, status, file name,
checksum, actor, counts, policy, created_at, finished_at) and `content_pack_items` (run_id, table_name, row_id, action,
before_json). Without them only a one-shot import with no rollback is possible. The SQL would be idempotent
(`CREATE TABLE IF NOT EXISTS`) and supplied separately for you to run on D1 by hand. It will not be added silently.
No change to existing tables. No new capability id is needed if content packs follow the existing `features.importTools`
switch proposed in T3 (otherwise one id, `features.contentPacks`, must be added to both repositories' pinned preset test).

## 10. Decisions for you
1. **Scope**: is the list in section 2 right? Recommended: yes, and keep partner, offer and tracking data out.
2. **Media in v1**: manifest only, no file transfer (recommended). The alternative is fetching images from the source URL, which needs an allowlist and a size cap.
3. **Rollback deletes** rows the run created. Your rule 3 says never delete data; this deletes only untouched imported drafts. Recommended: allow it with a confirmation. The alternative is "hide only", which leaves clutter.
4. **Replace policy**: offer it (recommended, off by default) or ship skip and rename only.
5. **Migration**: approve the two tables in section 9 (recommended) or accept no rollback.
6. **Who imports**: admin only (recommended).
7. **Switch**: tie packs to T3's `features.importTools`, or give them their own switch.

## 11. Build order if approved
(a) migration SQL for you to run, (b) export and envelope, (c) parse and dry run with report, (d) apply in chunks,
(e) rollback, (f) dashboard screen under the import tools area, (g) tests per step, including a round trip
(export from one test site, import into a fresh one, compare), slug conflicts, oversize, tampered checksum and rollback of an edited row.
