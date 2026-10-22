# Release: "Pick a page" for navigation and homepage links (tenant v16)

Built on tenant v15.1 (commit `a623ecb`). Control plane untouched.

## What I found first

Both editors you asked about already work without code, so nothing was rebuilt:

- **Footer links**: Dashboard > Navigation Manager (table plus a form: label, address, location, position, enabled).
- **Homepage sections**: Dashboard > Settings > Homepage Content (sections, cards, buttons, reorder, enable).

What they lacked is picking: addresses had to be typed or pasted.

## What changed

A **Pick a page** button now sits next to these address fields:

- Navigation Manager: the item address (all locations, including the footer columns).
- Homepage Content: each section's button address and each card's address.

It opens the same search dialog as the Component Studio (pages, reviews, casinos, news, research, authors, updates, sportsbooks, affiliate partners, custom content) and fills the address. Typing an address by hand still works. The dialog code moved into `static/js/link-picker.js`, shared by the Studio and these two editors; the Studio behaves as before.

Notes: the picker uses the `components` read permission. A dashboard user without it sees "could not search" in the dialog and can still type the address.

## Numbers

Counted with `git diff --numstat` against v15.1, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **4** | **128** | **60** |
| New files | 1 | 106 | 0 |
| Modified files | 3 | 22 | 60 |
| Deleted files | 0 | 0 | 0 |

Tests: 945 pass serially; 3 new in `en/test/component-studio.test.js`. The nav picker was exercised in a real browser against the real pages query (pick, fill, close).

## Migrations

**None.** No files deleted.

## New files (1)

| File | + | - |
|---|---:|---:|
| `en/static/js/link-picker.js` | 106 | 0 |

## Modified files (3)

| File | + | - |
|---|---:|---:|
| `en/static/js/component-studio.js` | 3 | 60 |
| `en/templates/layout/base.html` | 1 | 0 |
| `en/test/component-studio.test.js` | 18 | 0 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v16-pick-a-page.patch
git apply ~/storage/downloads/lummet-tenant-v16-pick-a-page.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v16-pick-a-page-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v16-pick-a-page-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v16-pick-a-page-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test test/component-studio.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant: Pick a page button for navigation and homepage links"
git push origin main
cd en && npx wrangler deploy 2>&1 | tail -15
```
Expect `pass 25`.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main && cd en && npx wrangler deploy 2>&1 | tail -15
```
