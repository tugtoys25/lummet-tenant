# GPWA Verification — Per-Tenant Settings

## What it is

Per-tenant, admin-configurable GPWA certification badge (seal +
verification script). Previously this was hardcoded to `level.casino`
directly in `base.html` / `footer.html`, which meant the shared worker
codebase could only be deployed for that one tenant. It's now driven
entirely from **Settings → GPWA Verification** in the dashboard — no
code or `wrangler.jsonc` changes needed per tenant.

## Where it lives

| Layer     | File                                     | Role                                                                                                     |
|-----------|-------------------------------------------|------------------------------------------------------------------------------------------------------------|
| Storage   | `settings` table                          | `gpwa_seal_enabled`, `gpwa_seal_html`, `gpwa_script_html`                                                  |
| Backend   | `worker/site-settings.js`                 | Reads/defaults those keys; `buildGpwaSeal()` / `buildGpwaScript()` return `""` unless enabled + populated  |
| Render    | `worker/render.js`                        | Exposes `gpwa_seal_enabled` / `gpwa_script_enabled` (bool) and `gpwa_seal_html` / `gpwa_script_html` (raw) to templates |
| Template  | `templates/layout/base.html`              | `{{#if gpwa_script_enabled}}` — script injected right after `<body>`                                       |
| Template  | `templates/layout/footer.html`            | `{{#if gpwa_seal_enabled}}` — seal in its own `.gpwa-seal-standalone` block, above the Install App button  |
| Style     | `static/css/main.css`                     | `.gpwa-seal-standalone` — full opacity (not dimmed like `.compliance-logos`), no forced sizing, `max-width: 100%` only |
| Admin UI  | `templates/pages/admin/settings.html`, `static/js/admin.js` | Checkbox + two textareas; picked up by the settings form's generic load/save logic, no custom JS needed per field |
| Auth      | `worker/api.js`                           | `/api/v1/settings/save` now requires `editor`/`admin` role (previously ungated)                            |
| Config    | `wrangler.jsonc`                          | Restored to multi-tenant — default (`freewin`) env plus `lummet`, `levelcasino`, `clustercasino`, `neuroodds`, `legendodds`, `brilliantodds` |

## Rendering guarantees

- **Exact markup, no mutation.** `buildGpwaSeal()`/`buildGpwaScript()`
  only `.trim()` the pasted value. Neither field is in the render
  layer's `CONTENT_FIELDS` sanitizer list, so `sanitizeHtml()` never
  touches them — no stripped `<script>` tags, no altered attributes.
  `{{{gpwa_seal_html}}}` / `{{{gpwa_script_html}}}` are raw
  triple-brace substitutions (no HTML-escaping). What the admin pastes
  is what ships, byte-for-byte, minus surrounding whitespace.
- **Empty by default.** An unconfigured tenant (box unchecked, or
  fields blank) renders neither block — not hidden via CSS, absent
  from the HTML entirely.
- **Seal placement.** Moved out of `.compliance-logos` (which dims
  logos to `opacity: 0.7` and shrinks them at every responsive
  breakpoint) into its own `.gpwa-seal-standalone` block, positioned
  above the "Install App" button. Full opacity, no forced width/height
  — sizing comes from whatever GPWA's own snippet specifies.
- **Script/seal dependency.** The seal's `onclick="return
  GPWAVerificationPopup(this)"` only works once GPWA's own script has
  defined that function client-side. Both fields are gated by the same
  enable checkbox, so pasting both together (not just the seal alone)
  is what keeps the popup functional.

## Who can configure it

Anyone with `editor` or `admin` role on that tenant's dashboard.
`viewer` role is rejected with `403` at the API level (`/api/v1/settings/save`),
not just hidden in the UI — this closes a prior gap where the save
endpoint had no role check at all.

## How to configure a tenant (e.g. level.casino)

1. Log into `https://level.casino/en/dashboard/settings`
2. Go to **GPWA Verification**
3. Check **GPWA Verification Enabled**
4. Paste the exact `<script>` GPWA issued for this domain into
   **GPWA Verification Script**
5. Paste the exact seal `<a>/<img>` snippet GPWA issued for this
   domain into **GPWA Seal Markup**
6. Save

Any tenant left unconfigured renders nothing GPWA-related — no code
differences between tenants required; it's purely a settings toggle.

## Deploy

```bash
cd ~/lummet/lummet-tenant

# 1. Confirm what's staged
git status
git diff --cached --stat

# 2. Commit
git commit -m "Move GPWA seal/script to per-tenant settings; standalone seal placement; restore multi-tenant wrangler.jsonc"

# 3. Push
git push

# 4. Deploy the default env (freewin)
npx wrangler deploy

# 5. Deploy each named tenant env
npx wrangler deploy --env levelcasino
npx wrangler deploy --env clustercasino
npx wrangler deploy --env neuroodds
npx wrangler deploy --env legendodds
npx wrangler deploy --env brilliantodds
npx wrangler deploy --env lummet
```

### Post-deploy check (level.casino only — the only certified tenant)

```bash
curl -s https://level.casino/ | grep -o 'GPWASeal'
curl -s https://level.casino/ | grep -o 'certify.gpwa.org/script'
```

Both should return a match once the settings above are saved. If they
don't:

- Confirm `gpwa_seal_enabled` is `"true"` in the `settings` table for
  that tenant.
- `saveSettings()` already calls
  `deleteCached(env, CACHE_KEYS.SITE_SETTINGS(hostname))` on save, so
  a stale response is more likely an edge/CDN cache in front of the
  worker than a stale origin.

## Rollback

If something looks wrong after deploy, disabling is a settings change,
not a redeploy — uncheck **GPWA Verification Enabled** and save. To
revert the code itself:

```bash
git revert <commit-hash>
git push
npx wrangler deploy --env levelcasino   # and other affected envs
```
