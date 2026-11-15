# Conversion Postback & Import API

This covers the affiliate conversion ingestion surface: the universal
S2S postback endpoint, CSV/JSON imports, the outbound provider adapter
framework, and how they all feed the same attribution/commission/
reconciliation pipeline. It does **not** cover the general `/en/api/v1/*`
CRUD (affiliate partners/programs/offers/etc.) — see the admin dashboard
pages for those.

## Overview

```
Visitor → tracking link → click (click_id generated)
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                      │
   Live postback         CSV/JSON import       Scheduled API sync
  (network → us,        (you → us, one-off)   (us → network, on a
   real time)                                   schedule)
        │                     │                      │
        └─────────── same normalize/attribute/commission/dedup ──────────┘
                              │
                    analytics_conversions
                    (source: postback | manual | import)
                              │
                    Reconciliation report
              (source IN (postback,manual) vs source=import)
```

All three ingestion paths — postback, import, adapter sync — run
through the identical pipeline: normalize → validate → attribute (by
`click_id`) → resolve commercial term → calculate commission → dedupe
→ store. Nothing about attribution or commission math differs by
transport.

---

## 1. Live postback endpoint

```
POST /api/v1/conversions/postback/:endpoint_token
GET  /api/v1/conversions/postback/:endpoint_token
```

Unauthenticated at the session/cookie level — this route sits **before**
the normal login check. Each request authenticates itself against the
`postback_configs` row matching `:endpoint_token`, created via the
**Postback Integrations** admin page (`/en/dashboard/postback-configs`)
or `POST /api/v1/postback-config/create`.

An unknown or disabled token returns a generic `404` — the response
never distinguishes "wrong token" from "wrong auth" from "token
disabled", to avoid handing an attacker a probing oracle.

### Authentication

Configured per integration, one of:

| `auth_method` | How it's verified |
|---|---|
| `hmac_sha256` | HMAC-SHA256 over the raw request body (or the timestamp param if there's no body), hex-encoded, sent in the param named by `signature_param` |
| `signed_query` | HMAC-SHA256 over the canonical query string (all params except the signature itself, sorted by key, `key=value` joined with `&`) |
| `shared_secret` | A static secret sent verbatim in `signature_param`, compared with a constant-time check |
| `api_key` | Same as `shared_secret`, different semantic name |

The actual secret is **never** stored in the database. `credential_reference`
on the integration is a pointer to a Cloudflare Worker secret:

```
wrangler secret put GGBET_POSTBACK_SECRET
```

then set `credential_reference` to `GGBET_POSTBACK_SECRET` when
creating the integration. If that secret isn't bound, every request
fails closed with `credential_not_configured` — there is no "no auth
required" fallback state.

**Replay protection**: if the integration has a `timestamp_param`
configured, every request must include a timestamp within
`timestamp_tolerance_seconds` (default 300) of the server's clock, or
it's rejected as `timestamp_out_of_tolerance`.

**IP allowlisting**: optional, exact-match against a JSON array of IPs
on the integration.

### Parameters

Field names are fully configurable per integration (`field_mapping_json`),
so a network can send whatever field names it already uses. Without any
mapping, these aliases are tried automatically:

| Canonical field | Recognized aliases |
|---|---|
| `click_id` | `click_id`, `clickid`, `subid`, `sub_id`, `aff_click_id` |
| `conversion_type` | `conversion_type`, `event`, `type` |
| `status` | `status` |
| `reported_value` | `reported_value`, `amount`, `value`, `revenue` |
| `currency` | `currency` (defaults to `USD`) |
| `country_code` | `country_code`, `country`, `geo` |
| `external_reference` | `external_reference`, `transaction_id`, `conversion_id` |
| `occurred_at` | `occurred_at`, `timestamp` |
| `reported_commission` | `reported_commission`, `commission` (statement/import context only — see §4) |
| `casino_id` | `casino_id` (fallback attribution when there's no `click_id` — see §5) |
| `external_player_id` | `external_player_id`, `player_id`, `customer_id`, `user_id` (optional — see §6) |

A `field_mapping_json` can also remap *values*, not just field names:

```json
{
  "click_id": "subid",
  "conversion_type": "event",
  "conversion_type_map": { "reg": "registration", "dep1": "ftd" },
  "status_map": { "approved": "confirmed", "declined": "rejected" }
}
```

### Conversion types

`registration`, `qualified_lead`, `ftd`, `deposit`, `cpa_conversion`,
`revshare`, `hybrid`, `adjustment`, `refund`, `chargeback`

### Statuses

`pending` (default if omitted), `confirmed`, `rejected`

### Example request

```
POST /api/v1/conversions/postback/8f3a1c2b9e7d4f60a1b2c3d4e5f60718
Content-Type: application/json
```
```json
{
  "click_id": "abc123",
  "event": "ftd",
  "status": "confirmed",
  "amount": 100,
  "currency": "EUR",
  "transaction_id": "GG-998877",
  "sig": "…hex hmac…"
}
```

### Response

Always `200` for a well-formed, authenticated request — a duplicate or
an unattributed conversion is a legitimate outcome, not an error a
provider's retry logic should act on:

```json
{ "success": true, "outcome": "accepted", "conversion_id": 4821, "attributed": true }
```

`outcome` is one of `accepted`, `duplicate`, `unattributed`.

| HTTP status | Meaning |
|---|---|
| `200` | Processed (see `outcome`) |
| `400` | Malformed body, or validation failed (`details` array explains why) |
| `401` | Signature/secret/timestamp/IP check failed |
| `404` | Unknown or disabled `endpoint_token` |
| `429` | Rate limit exceeded (default 120/minute per integration) |
| `500` | Internal error processing the conversion (logged, never exposes internals) |

### Deduplication

A conversion is deduplicated on `(account_id, external_reference, source)`.
Sending the same `external_reference` twice through the **same**
integration is silently treated as `outcome: "duplicate"`, not an
error. The `source` column is part of the key deliberately — see §4:
a live postback and a later statement import for the *same* underlying
transaction are expected to coexist, not collide.

### Attribution

Exact `click_id` match only, against the same event stream the
tracking redirect writes to. No time-window or last-touch guessing. If
`click_id` doesn't match anything (or wasn't sent), the conversion is
still recorded — with `outcome: "unattributed"` and `click_id: null` —
never silently dropped, and never guessed.

**Security boundary**: if a `click_id` *does* match, but the matched
tracking link belongs to a different program than the integration's
own account, the conversion is recorded as unattributed rather than
credited — this stops a leaked postback URL for one program from being
able to attribute (and get paid for) a different program's traffic.

---

## 2. CSV / JSON import

```
POST /api/v1/imports/conversions
```
```json
{
  "account_id": 100,
  "format": "csv",
  "content": "transaction_id,event,status,amount,currency,commission\nGG-1,ftd,confirmed,100,EUR,35",
  "field_mapping": null,
  "label": "March statement"
}
```

Runs every row through the exact same normalize/attribute/commission/
dedupe pipeline as a live postback, with `source: "import"`. A bad row
never aborts the batch — it's reported per-row in the response and in
the batch's history:

```json
{
  "success": true, "batchId": 12, "totalRows": 200,
  "importedCount": 197, "duplicateCount": 2, "unattributedCount": 8,
  "errorCount": 1, "errors": [{ "row": 84, "message": "conversion_type must be one of: ..." }]
}
```

Because imports often carry a network's own commission figure, this
path additionally reads `reported_commission` (default alias:
`commission`) into a dedicated column — **never** into
`calculated_commission`, which this platform always computes itself
from `affiliate_commercial_terms`. The two are compared side by side in
the Reconciliation report (§4).

Import rows frequently have no `click_id` at all (a statement lists
the casino/brand, not your click IDs). If the row's `casino_id` field
(or `casino_id_map` in `field_mapping_json`, for translating a
provider's own brand code) is present, it's used as attribution
fallback when click-based attribution finds nothing.

See `GET /api/v1/imports/list` and `GET /api/v1/import/get?id=` for
history, or the **Import History** dashboard page.

---

## 3. Outbound provider adapters

For networks with their own reporting API rather than an inbound
postback. Configured via `POST /api/v1/provider-adapter/create` or the
**Provider API Adapters** dashboard page, then either synced on a
schedule (cron, off by default — see below) or on demand via
`POST /api/v1/provider-adapter/sync-now`.

Only one adapter ships: `generic_rest` — a configurable "GET a JSON
array of conversions for a date range, static auth header" client.
There is deliberately no GG.BET/PIN-UP/BetMGM/etc.-specific adapter:
each of those needs that network's actual, documented API and real
credentials to implement correctly, and this isn't the place to guess.
Adding one is: implement `worker/adapters/base.js`'s
`BaseAffiliateProvider` interface (`authenticate`, `fetchConversions`,
`fetchRevenue`, `fetchCommissions`, `fetchReports`,
`normalizeConversion`, `healthCheck`) and register it in
`worker/adapters/registry.js`.

A sync run is recorded in the same `import_batches` history as a
manual CSV upload (`format: "api"`), and every conversion it writes is
`source: "import"` — reconciliation doesn't distinguish a scheduled API
pull from a hand-uploaded statement; both are "what the network's own
report says", as opposed to "what we received live" (postbacks).

The scheduled sync itself is gated by `system_settings.provider_sync_cron_enabled`
(default `'false'`) — it will not make outbound network calls until an
operator has actually configured a real integration and turned this on.

---

## 4. Reconciliation

Not a separate API — it's report type `reconciliation` on the existing
report engine (`POST /api/v1/report/run`, after creating a
`report_definitions` row with that type), so it inherits CSV/HTML/JSON
export for free. Compares, per casino/account/currency:

- **Internal** (`source IN ('postback','manual')`): clicks,
  registrations, FTDs, deposits, revenue, and `calculated_commission`
  (this platform's own figure, from commercial terms).
- **Reported** (`source = 'import'`): revenue and `reported_commission`
  (whatever the network's own statement/API said).

A scope/period with **no** import data at all is reported as `status:
"missing"` — never a fabricated zero-difference match. Once both sides
exist, `status` is `matched` (within tolerance, default 2%),
`underpaid` (we expected more than they reported), or `overpaid` (they
reported more than we expected).

---

## 5. Cohort analysis

Also a report type (`cohort_analysis`), not a separate endpoint.
`filters.cohortMetric` is one of:

- `registration_to_ftd` / `ftd_to_deposit` — cohort = every `click_id`
  whose earliest event of the "from" type falls in the requested date
  range; reports cohort size, how many later converted to the "to"
  type, and the average days between.
- `revenue_by_cohort` — cohort = every `click_id`'s earliest conversion
  of any type; reports total revenue/commission across **all** of that
  click_id's later conversions, keyed by the acquisition date.

`filters.groupByDimension` (`casino` | `geo` | `campaign`) splits each
cohort further. Fields that don't apply to the requested metric come
back as `null`, never `0` — e.g. `revenue_by_cohort` never reports an
`avg_days_to_convert`.

`click_id` is the only cross-conversion identifier this platform has;
a cohort is only as accurate as click-level attribution allows (see
§1's attribution rules), and rows with no `click_id` are excluded
rather than merged into a misleading "no cohort" bucket.

---

## 6. Player LTV

Report type `ltv_analysis`. One row per `external_player_id` acquired
(their earliest conversion) within the requested date range — same
acquisition-date framing as cohort analysis, keyed by the provider's
own player/customer reference instead of `click_id`.

`external_player_id` is optional and almost always absent — it's only
populated when a provider's postback/import/adapter response includes
one of the aliases in §1's field table. It is stored verbatim, never
decoded or enriched (brief §18: "do NOT introduce unnecessary PII").

Per player: `ftd_value`, `deposit_value`, revenue in the 7-day and
30-day windows following acquisition, and total revenue/commission
to date.

**If this tenant has never recorded a single conversion with an
`external_player_id`** (no configured integration currently sends
one), the report returns exactly one row with every numeric column
`null` and a `note` explaining that plainly — never an empty table
that could be misread as "zero players, zero revenue" versus "this
feature has no data source configured" (brief §18/§29). A tenant that
does have player-level data, just none acquired in the requested date
range, gets a genuinely empty result instead — that really is a zero.

---

## Testing an integration before going live

`POST /api/v1/postback-config/test` runs the exact same pipeline a
live postback would, in dry-run mode — nothing is ever written to
`analytics_conversions`. Response shape:

```json
{
  "success": true, "outcome": "would_accept",
  "steps": {
    "click_found": true, "tracking_link_resolved": true, "casino_resolved": true,
    "partner_resolved": true, "account_resolved": true, "program_mismatch": false,
    "commercial_term_resolved": true, "commission_calculated": true
  },
  "calculated_commission": 40, "term_id": 7
}
```

The **Postback Integrations** dashboard page renders this as a ✓/✗
checklist.


---

## Core tracking updates (click handoff, status updates, live log)

**Click-ID handoff.** Each tracking link can set `click_id_param` (the name the operator expects, e.g. `sub_id`, `aff_click_id`, `anid`) and `sub_param_map` (forward inbound `sub1..sub10` under the operator's names). Macros in the destination URL are filled in any syntax: `{click_id}`, `{{click_id}}`, `[click_id]`, `${click_id}`. Inbound `sub1..sub10`, `utm_*` and common ad-click ids are stored on the click. Needs migration `0017_click_handoff.sql` on each tenant database; links keep working without it.

**Field names.** Extra built-in aliases: `cid anid afp dyn` (click id), `et` (event), `sum deposit_sum` (amount), `txid tid order_id` (transaction id), `payout` (commission), `userid trader_id` (player). Event synonyms (`lead`, `fd`, `sale`, `rs` ...) and status synonyms (`approved`, `declined`, `hold` ...) are mapped. `status=lead|sale` is read as the event. Unix seconds or milliseconds timestamps are accepted.

**Status updates.** A repeat postback with the same transaction id updates the stored conversion: pending → confirmed → rejected, never backwards; a changed amount recomputes the commission. Response outcome is `updated`. Chargebacks, refunds and adjustments are keyed separately from the original. One-off events (registration, ftd) without a transaction id are de-duplicated per click. Repeatable events without one return a `no_transaction_id` warning.

**Authentication.** `hmac_sha256` on a GET signs the canonical query (parameters sorted, signature parameter excluded). If `timestamp_param` is set, the old timestamp-only signature is still accepted. `allowed_ips` accepts IPv4 CIDR; a malformed list rejects every request (`ip_allowlist_invalid`).

**Dashboard.** Postbacks page: Copy URL, Recent postbacks log (`GET /en/api/v1/postback-logs/list`), and Live test (`POST /en/api/v1/postback-config/live-test`), which signs a request with the real secret and runs real authentication without saving a conversion.

---

## Connect-a-program wizard and presets

Dashboard → Postbacks → **Connect a program**. Pick a program, an affiliate account and a label. The wizard creates the integration (shared-secret auth, with a generated Worker secret name and value), works out the postback URL for each event, and offers to set the right click-ID name on your tracking links.

Presets (`worker/postback/presets.js`): Pin-Up, Parimatch, Magic Click, 1xBet, Melbet, 1win, Betwinner, Affilka, Cellxpert, Income Access, MyAffiliates, Scaleo (and programs built on it), and Keitaro, Binom and Voluum style postbacks. Each preset records the click-ID name, the macro syntax, the parameters the program should send, and whether events arrive as separate URLs, one URL with an event parameter, or `status=lead|sale`.

Every preset carries a **confidence** label: `documented` (public documentation), `partial` (click-ID name and event style known, macro names usual) or `typical` (usual shape; confirm the macro names in the manager's panel). Most programs publish their macros only to affiliates, so confirm them before going live and use the Live test.

**Custom program**: describe, per value, the parameter name you want in the URL and the program's macro. Macro styles `{x}`, `{{x}}`, `[x]`, `${x}` and plain names are supported.

Endpoints: `GET /en/api/v1/postback-config/presets`, `POST /en/api/v1/postback-config/build` (`preset_id` or `custom`, optional `config_id`), `POST /en/api/v1/tracking-link/handoff` (`ids`, `click_id_param`; keeps each link's sub-id map).

The secret must exist as a Worker secret with the name the wizard shows (`npx wrangler secret put NAME`); until then postbacks are refused and the Live test says so.

---

## Earnings & Payouts (dashboard → Partners & Tracking → Earnings & Payouts)

Admin-only. Needs migration `0018_earnings.sql` (new tables `payouts`, `promo_codes`, `creatives`, `conversion_promo`).

- **Funnel**: clicks → registrations → first deposits → deposits per program, with click-to-registration and registration-to-first-deposit rates, and confirmed and pending commission per currency. Rejected conversions are never counted as registrations or deposits.
- **By sub-ID**: the same numbers grouped by `sub1`–`sub10`, `utm_*`, country or tracking link. Each conversion is matched to the click it came from, so you see which source actually pays.
- **Payouts and invoices**: balances per program and currency (confirmed commission, pending, invoiced, paid, outstanding). Creating an invoice totals the confirmed commission of a program for a period, records it as an invoiced payout with a number like `INV-202610-10-0001`, and opens a printable invoice. A period overlapping an earlier invoice is refused. Record payments and mark invoices paid to keep the outstanding figure right. Currencies are never added together.
- **Promo codes**: a registry of codes, optionally bound to a program and a tracking link. A conversion counts for a code when the postback reports it (parameters `promo`, `promo_code`, `promocode`, `bonus_code`, `coupon`) or when it came through the bound tracking link. Codes are not yet shown on public pages.
- **Creatives**: banners, text links and landing pages tied to a tracking link, with a Copy embed code button and conversions per link.

API: everything under `/en/api/v1/earnings/…` (`funnel`, `subids`, `payouts/list|save|delete`, `invoice/create`, `promo-codes/list|save|delete`, `creatives/list|save|delete`).
