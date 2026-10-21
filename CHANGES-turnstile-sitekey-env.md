# Turnstile sitekey moved from hardcoded value to `env.TURNSTILE_SITEKEY`

The public Turnstile sitekey `0x4AAAAAAD0R3_fgyOTeUJ6l` was hardcoded in the
login and register templates. It is now read per-Worker from the
`TURNSTILE_SITEKEY` plaintext variable (Cloudflare dashboard →
Worker → Settings → Variables and Secrets → Variables). The code contains
no Turnstile credential values any more, only the variable names.

`TURNSTILE_SECRET` is unchanged: `worker/auth.js` already reads it from
`env.TURNSTILE_SECRET`, and no line of that file was touched.

## Summary

| | Count |
|---|---|
| Files modified | 5 |
| Files added to the repo (docs/patch only) | 2 |
| Files deleted | 0 |
| Lines added | 22 |
| Lines deleted | 6 (all 6 are the *old form* of a line that was re-added, see below) |

No backups, `.git`, `.wrangler`, workflows, migrations, tests, CSS/JS
assets or other files were modified or removed.

## Modified files (exact lines)

### 1. `en/templates/pages/login.html` — +2 / −2
Only the sitekey value inside two `data-sitekey` attributes changed. The
second occurrence is inside the existing HTML comment block and was
changed too so no hardcoded value remains anywhere in the file.

- Line 15
  - deleted: `<div class="cf-turnstile" data-sitekey="0x4AAAAAAD0R3_fgyOTeUJ6l" data-action="login" data-size="flexible"></div>`
  - added:   `<div class="cf-turnstile" data-sitekey="{{turnstile_sitekey}}" data-action="login" data-size="flexible"></div>`
- Line 19 (inside the HTML comment)
  - deleted: `data-sitekey="0x4AAAAAAD0R3_fgyOTeUJ6l"`
  - added:   `data-sitekey="{{turnstile_sitekey}}"`

### 2. `en/templates/pages/register.html` — +2 / −2
- Line 15
  - deleted: `<div class="cf-turnstile" data-sitekey="0x4AAAAAAD0R3_fgyOTeUJ6l" data-action="register" data-size="flexible"></div>`
  - added:   `<div class="cf-turnstile" data-sitekey="{{turnstile_sitekey}}" data-action="register" data-size="flexible"></div>`
- Line 19 (inside the HTML comment)
  - deleted: `data-sitekey="0x4AAAAAAD0R3_fgyOTeUJ6l"`
  - added:   `data-sitekey="{{turnstile_sitekey}}"`

### 3. `en/worker/controllers.js` — +10 / −2
Inside `renderLogin()` (login page):
- Line 3912
  - deleted: `        canonical: site.url("/en/login")`
  - added:   `        canonical: site.url("/en/login"),`  (trailing comma only)
- Lines 3913–3916 added:
  ```js

          // Public Turnstile sitekey — per-Worker dashboard variable
          // (Settings → Variables and Secrets), never hardcoded.
          turnstile_sitekey: escapeHtml(env.TURNSTILE_SITEKEY || "")
  ```

Inside `renderRegister()` (register page):
- Line 3948
  - deleted: `        canonical: site.url("/en/register")`
  - added:   `        canonical: site.url("/en/register"),`  (trailing comma only)
- Lines 3949–3952 added: the same blank line, two comment lines and
  `turnstile_sitekey: escapeHtml(env.TURNSTILE_SITEKEY || "")`.

The value goes through the file's existing `escapeHtml()` helper because
the template engine does not HTML-escape `{{vars}}`.

### 4. `wrangler.jsonc` — +4 / −0
Lines 6–9 added, right after `"compatibility_date"`: a blank line, two
comment lines and `"keep_vars": true,`.

### 5. `wrangler.account2.jsonc` — +4 / −0
Same four lines added at lines 6–9.

Why: neither config defines `vars`, and CI deploys with `wrangler deploy`.
Without `keep_vars`, Wrangler can remove dashboard-defined plaintext
variables on deploy, which would blank the sitekey after the next push.
Secrets (including `TURNSTILE_SECRET`) are never affected. `keep_vars` is a
top-level Wrangler key and applies to every `--env` deploy.

## Added files (documentation only, not used at runtime)
- `CHANGES-turnstile-sitekey-env.md` (this file)
- `turnstile-sitekey-env.patch` (unified diff of the five files above)

## Deleted
Nothing.

## Deployment steps (per Worker, no code change needed per site)
1. Worker → Settings → Variables and Secrets → add **Variable**
   `TURNSTILE_SITEKEY` = that site's public sitekey, type *Text* (plaintext).
2. `TURNSTILE_SECRET` stays as it is.
3. Deploy.

Each Worker (freewin, lummet, levelcasino, clustercasino, neuroodds,
legendodds, brilliantodds, on both accounts) needs its own
`TURNSTILE_SITEKEY` before or at the time of this deploy. If it is missing,
the login/register widget renders with an empty `data-sitekey` and will not
load. For the current site the value is `0x4AAAAAAD0R3_fgyOTeUJ6l`.

## Verification performed
- `node --check en/worker/controllers.js`: OK.
- `npm test` in `en/`: 719 tests, 719 pass, 0 fail.
- Rendered both templates through `Renderer.replaceVariables()` with a
  sample key, an empty key and a key containing `"` and `<`: the value is
  substituted in both the live tag and the commented tag, no `{{` is left
  over, and special characters are escaped.
- `grep` for `0x4AAAA` across all code, templates and configs (outside `.git`) returns nothing; the old key appears only in this document and the patch file, as the removed line.
