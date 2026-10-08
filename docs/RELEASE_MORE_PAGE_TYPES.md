# Release: every page type that shows components can be assigned (tenant v14)

Built on tenant v13 (commit `000281c`). Control plane untouched.

## What changed

Under Dashboard > Components > "Assign Component to Page" (and the filter list under "Current Page Assignments"), these page types that already render components are now offered. Write the Page Slug as shown.

| Page type | Page Slug |
|---|---|
| Sportsbook (individual) `sportsbook` | its slug, or `*` |
| Sportsbook Listing `sportsbook_list` | `sportsbook_list` or `*` |
| Affiliate Partner (individual) `affiliate_partner` | its slug, or `*` |
| Affiliate Partner Listing `affiliate_partner_list` | `affiliate_partner_list` or `*` |
| Content Landing Page `content_landing_page` | its slug, or `*` |
| Generic Review `generic_review` | its slug, or `*` |
| Country sub-page `country_custom_page` (SEO pages) | `RW/best-casinos` (country code / page slug), or `*` |
| Category + country page `category_country_page` (SEO pages) | `crypto/RW` (category / country code), or `*` |
| Comparison `compare_casino`, `compare_sportsbook`, `compare_affiliate_partner` | its slug, or `*` |
| Comparison list `compare_casino_list`, `compare_sportsbook_list`, `compare_affiliate_partner_list` | the page type itself, or `*` |
| **Your custom content types** `custom_<type>`, `custom_<type>_list`, `compare_<type>`, `compare_<type>_list` | listed automatically from Custom Types, at the bottom of the Page Type list |

- Custom types are read from your Custom Types list when the page opens; a type with an unsafe name is skipped.
- Comparison and Generic Review pages did not show the "Content Top" injection point (their templates had no slot for it). They do now; nothing else on those pages moves.
- Already-assigned components, earlier page types and the controllers are untouched. Page Slug hints were extended for the new formats.

## Numbers

Counted with `git diff --numstat` against v10, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **5** | **102** | **1** |
| New files | 0 | 0 | 0 |
| Modified files | 5 | 102 | 1 |
| Deleted files | 0 | 0 | 0 |

Tests: 920 pass serially (`npm test -- --test-concurrency=1`); 16 are new, in `en/test/component-page-types.test.js` (each new type is in both lists and has a controller that renders components for it, custom types are added by script without innerHTML, the two templates have the slot). The custom-type options were also checked in a real browser with a stand-in Custom Types list (an unsafe slug was skipped).

## Migrations

**None.**

## Deleted files

None.

## New files (0)

| File | + | - |
|---|---:|---:|
| _none_ | 0 | 0 |

## Modified files (5)

| File | + | - |
|---|---:|---:|
| `en/static/js/component-admin.js` | 38 | 0 |
| `en/templates/pages/admin/components.html` | 35 | 1 |
| `en/templates/pages/comparison.html` | 1 | 0 |
| `en/templates/pages/generic-review.html` | 1 | 0 |
| `en/test/component-page-types.test.js` | 27 | 0 |

## Install on the phone (Termux), pick ONE

Run these from inside the repo, not from `~`.

### A. Script
```bash
cd ~/lummet/lummet-tenant && git status --short
unzip -p ~/storage/downloads/lummet-tenant-v14-more-page-types-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh
bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v14-more-page-types-full.zip ~/lummet/lummet-tenant
bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v14-more-page-types-full.zip ~/lummet/lummet-tenant
```
### B. Patch
```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v14-more-page-types.patch
git apply ~/storage/downloads/lummet-tenant-v14-more-page-types.patch
```

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test test/component-page-types.test.js test/component-hero.test.js test/component-engine-banners.test.js 2>&1 | tail -12
cd ..
git add -A && git status --short && git diff --cached --stat | tail -1
git commit -m "Tenant: offer every component page type, including custom types"
git push origin main
cd en && npx wrangler deploy
```
Look for `fail 0` in the test output (expect `pass 57`). If the deploy prints errors, send the last lines.

Then in Components > Assign Component to Page, scroll to the bottom of Page Type: "More content types" and your custom types should be there. Assign a text component to one (slug `*`) and open that page.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main && cd en && npx wrangler deploy
```
Saved values stay in `settings`; assignments made for the new page types stay in the database and simply stop showing in the dropdown.
