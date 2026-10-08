# Release: components for author, payment-method and research pages (tenant v13)

Built on tenant v12 (commit `1f9db20`). Control plane untouched.

## What was wrong

Under Dashboard > Components > "Assign Component to Page":
- **Author** and **payment-method** pages already show assigned components, but the Page Type list never offered them, so they could not be assigned from the dashboard.
- **Research** pages had the component slots in their templates, but the page code never loaded the assigned components, so nothing assigned there could appear.

## What changed

New Page Type choices (in the assign form and the filter list):

| Page type | Where it shows | Page Slug to use |
|---|---|---|
| Author (individual) `author` | an author's page | the author slug, or `*` |
| Author Listing `author_list` | `/en/author` | `author_list` or `*` |
| Payment Method (individual) `payment_method` | a payment method page | its slug, or `*` |
| Payment Methods Listing `payment_method_list` | `/en/payment-methods` | `payment_method_list` or `*` |
| Research item `research` | one research article | `type/slug`, for example `country/netherlands`, or `*` |
| Research Type Page `research_type_list` | `/en/research/<type>` | the type, for example `country`, or `*` |
| Research Hub `research_list` | `/en/research` | `research_list` or `*` |

The Page Slug box now has a short hint for the research formats. Research pages fill all five slots (top, content top, content bottom, bottom, sidebar), the same way other pages do. Nothing that was already assigned changes.

Not done: other page types that already render components but are not in the list (sportsbooks, affiliate partners, content landing pages, custom content types, comparisons, generic reviews, country and category sub-pages). Say the word and I will add them.

## Numbers

Counted with `git diff --numstat` against v10, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **3** | **122** | **0** |
| New files | 1 | 89 | 0 |
| Modified files | 2 | 33 | 0 |
| Deleted files | 0 | 0 | 0 |

Tests: 904 pass serially (`npm test -- --test-concurrency=1`); 14 are new, in `en/test/component-page-types.test.js` (each new page type is in both lists, the earlier ones are all kept, the research pages ask for and pass their components, exact and `*` slugs match, scopes do not leak). Nothing was run in a browser: the change is a list of options plus data passed to templates that already had the slots.

## Migrations

**None.**

## Deleted files

None.

## New files (1)

| File | + | - |
|---|---:|---:|
| `en/test/component-page-types.test.js` | 89 | 0 |

## Modified files (2)

| File | + | - |
|---|---:|---:|
| `en/templates/pages/admin/components.html` | 14 | 0 |
| `en/worker/controllers.js` | 19 | 0 |

## Install on the phone (Termux), pick ONE

Run these from inside the repo, not from `~`.

### A. Script
```bash
cd ~/lummet/lummet-tenant && git status --short
unzip -p ~/storage/downloads/lummet-tenant-v13-component-page-types-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh
bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v13-component-page-types-full.zip ~/lummet/lummet-tenant
bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v13-component-page-types-full.zip ~/lummet/lummet-tenant
```
### B. Patch
```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v13-component-page-types.patch
git apply ~/storage/downloads/lummet-tenant-v13-component-page-types.patch
```

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test test/component-page-types.test.js test/component-hero.test.js test/component-engine-banners.test.js 2>&1 | tail -12
cd ..
git add -A && git status --short && git diff --cached --stat | tail -1
git commit -m "Tenant: assign components to author, payment-method and research pages"
git push origin main
cd en && npx wrangler deploy
```
Look for `fail 0` in the test output (expect `pass 41`). If the deploy prints errors, send the last lines.

Then in Dashboard > Components > Assign Component to Page, pick "Research Hub", slug `research_list`, assign a text component, and open `/en/research`. Do the same for an Author or Payment Method page.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main && cd en && npx wrangler deploy
```
Saved values stay in `settings`; assignments made for the new page types stay in the database and simply stop showing.
