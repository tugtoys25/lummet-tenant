# Release: Instant pages (tenant v22.61, 1y line)

Built on `1yy1msaasversion.zip`. Nothing removed. **No migration.** Control plane: no change needed (see below).

Details and reasons: `docs/PLATFORM_UPGRADES.md` section 99. Summary: page and "pages changed" counter read together; warm Worker never waits for KV; cached pages stored with versioned asset URLs; templates kept in memory; fewer sequential database waits on a cold render; `/static/*` served by Cloudflare directly (`wrangler.jsonc` and new `en/_headers`); "page not found" reused for 60 s (never in KV); site-access gate asks the database once per 15 s instead of on every request.

## Control plane

Already has what this release adds to the tenant (stale-while-revalidate page cache, versioned assets cached for a year, `/static/*` off the Worker with `public/_headers`, Smart Placement), so there is nothing to change.

## Tests

Tenant: 1463 pass. Install, deploy, check, rollback: see the chat message that came with this release.
