# Phase 9: provisioning and platform defaults (tenant side, final)

Baseline: Phase 8 tree (elite zip). Pairs with control plane migration 0084 and `worker/site-setup.js` (see lummet-control-plane/docs/CHANGES_PHASE_9.md).

## What this phase adds to the tenant
- `migrations/0013_setup_state.sql`: explicit "Full platform" `site_profile` row, `site_setup_state=complete`, `site_setup_source=migrated` on every existing site (INSERT OR IGNORE, idempotent, never overwrites a stored choice).
- `worker/site-profile/setup.js`: `getSetup`, `completeSetup`, `provisionSite` (preset, or copy of another site's export, applied as a numbered audited version by actor "provisioning"), `exportForClone`, `presetChoices`.
- Super API v16: `GET/POST /en/api/super/site-setup`, `GET /en/api/super/site-config-export`.
- Dashboard: `GET /api/v1/site-profile/setup`, `POST /api/v1/site-profile/setup/complete` (admin), first next-step "Confirm your site setup", welcome panel `#cfgSetup` on Configuration.
- Rule: a DIFFERENT preset while setup is pending is allowed only if nothing but "provisioning" has touched the configuration (new version, nothing deleted); `already_configured` once the owner has a draft or own version; `setup_not_pending` once complete.

## Operator guide
1. Migration order: deploy/migrate the tenant release with 0013 FIRST (all tenants), then apply control plane migration 0084 and deploy the control plane. Existing sites are marked complete by 0013, so no wizard appears on them.
2. New sites: on their first deploy the control plane seeds `site_setup_state=pending`, then applies the chosen preset (or clone). If that call fails the site stays live as the full platform with the wizard pending.
3. Plan defaults: staff `PUT /api/platform/site-presets/defaults` with `{scopeKind:"plan"|"product", scopeId, presetId}` (presetId null clears). Precedence: explicit request > plan default > product default > "full".
4. Retry: customer admin `POST /api/organizations/:org/sites/:id/setup/retry`; staff `POST /api/platform/saas/sites/:id/setup` with `{retry:true}`, `{preset}` or `{cloneFromTenantId, sections}`.
5. Rollback: a setup is a normal configuration version. Roll back from Configuration > history on the tenant. Nothing is deleted.

## Verification status
Tenant suite on the final tree: 135 files, 1980 tests, 0 failed. Control plane: 195 files, 2483 tests, 3 failed (zip-layout, also failing on the Phase 8 baseline). Not verified: real browser, real D1, real provisioning, live clone. See NOTES_PHASE_9.md.
