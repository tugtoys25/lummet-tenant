# Configuration load harness (Phase 10 / B2)

**Status: written and run offline only. It is not a capacity test and it does not prove production readiness.**

## What it is
`tools/load/config-load-harness.mjs` drives the real Worker entry point and the real configuration routes in one Node process.
An in-memory SQLite database (the same shim the test suite uses, every migration applied) stands in for D1, and a `Map` stands in for KV.

It measures and checks:

| Scenario | What it shows |
| --- | --- |
| `publicWarm` | public pages with a warm cache: latency, errors, and that the configuration layer adds **zero** D1 statements |
| `publicCold` | first requests for many tenants: one profile statement per tenant when requests arrive one at a time; never more than one per request when they arrive together |
| `resolverCached` | the cached resolver read alone |
| `switchOff` | master switch off: pages still served, zero profile statements |
| `apiState`, `apiSettings`, `apiExport` | staff configuration endpoints, each simulated person a different user |
| `exportBurst` | one person hammering export: the first 20 pass, the rest get 429 with `Retry-After` |
| size cap | a body over the import limit is refused with 413 before it is parsed |

Each page path is probed once, and later answers must equal the probed answer. A removed page answering 404 is correct under the news preset; a changed answer under load is an error.

## Run it
```bash
cd lummet-tenant
node tools/load/config-load-harness.mjs                              # defaults: 3000 requests, 25 in flight, 20 tenants
node tools/load/config-load-harness.mjs --requests 20000 --concurrency 50 --hosts 100 --json report.json
```
Options: `--requests`, `--concurrency`, `--hosts`, `--max-p95-ms` (default 50), `--max-error-rate` (default 0), `--json <file>`, `--quiet`.
Exit codes: `0` every check met, `1` a check failed, `2` bad usage. The unit test `test/config-load-harness.test.js` runs a tiny version.

## How to read the numbers
- **Reliable:** statement counts, error counts, status codes, the 429 and 413 behaviour. These are properties of the code.
- **Not reliable:** latency and requests per second. Node is single threaded, SQLite and the Map are in-memory, and there is no network. Use them only to compare one commit with another on the same machine.
- **Not covered:** real D1 and KV latency, Cloudflare isolate and CPU limits, cold isolate start, cache stampedes across isolates, real traffic mix, real browsers.

## Staging procedure (not yet carried out)
Run this before the system is switched on for all tenants. Nothing below has been done by the author of this document.

1. Deploy the tenant release to **one staging tenant** with the master switch ON and a non-default preset (for example News only).
2. Warm it: request `/en/news`, `/en/login` and one removed page (for example `/en/casino`) several times. Confirm the removed page answers as configured.
3. Public traffic: use the control plane's load tool against the staging tenant host, with the allow-list flag it requires
   (`lummet-control-plane/scripts/loadtest.mjs`, see `docs/LOAD_TESTING.md` there). Record p95 and error rate with the switch ON, then set `CONFIGURABLE_PLATFORM=off` and repeat. The two runs should be close; a large gap is a finding.
4. Cold behaviour: after a deploy (empty isolates), request 20 different hostnames or restart the staging worker, then compare D1 "rows read" in the Cloudflare dashboard for the `settings` table with the number of requests. Expected: roughly one read per tenant per cache lifetime (KV entry 60 s, per-isolate copy 15 s), not one per request. Several isolates each reading once is normal.
5. Configuration API: signed in as an administrator, press Export 25 times within ten minutes. Expect 429 with a `Retry-After` header from the 21st request, and normal service for a second administrator at the same time.
6. Oversized body: POST a file larger than 2 MB to the import check endpoint. Expect 413.
7. Record the results in a dated file and link it from `docs/RELEASE_CONFIGURABLE_PLATFORM.md`.

Stop and switch the system off (see `OPERATOR_CONFIGURATION.md`) if staging shows errors above 1 percent, a profile read on every request, or p95 more than double the switch-off figure.
