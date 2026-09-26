# Local BYO inbound

TR-BYO-2026-09-17 and TR-DESK-2026-09-25. Each user incorporates **their own** ServiceTitan, **their own** ProBooks, and other trades-app exports into **this** runtime on **this** machine.

Authoring node / GitHub is **not** a data custodian. Do not send tenant dumps upstream. Do not add a hosted uploader. Do not phone home.

## Layout

| Path | What the user places |
| --- | --- |
| `data/inbound/servicetitan/` | Their ST export or read-only API pull (jobs, pricebook, equipment, customer, appointments). Named peer class. |
| `data/inbound/probooks/` | Their ProBooks books / items / costs / vendor files or read-only pull. Named peer class. |
| `data/inbound/trades-app/` | Other field-service exports in the same class. Named profiles when the fingerprint matches; otherwise generic CSV/JSON. |
| `data/runtime/<instanceId>/` | Isolated receipts + ledger for this runtime instance only. |

Not `data/tenants/`. That word implies a hosted multi-tenant service.

The drop-in sniffs shape. A ServiceTitan-shaped or ProBooks-shaped file stays on that named peer even if it is dropped in `trades-app/`. A known mapping profile wins when its fingerprint matches (keys, CSV headers, or filename). If none match, the generic JSON or CSV sniff is used. There is still no per-vendor paper required for a new column layout that the generic sniff can read.

Named trades-app profiles (0.4.1, synthetic fixtures only — not live connectors):

| Profile | Fingerprint |
| --- | --- |
| ServiceM8 | `generated_job_id` plus `job_address`, `company_uuid`, or `uuid`. Filename `servicem8` or `service-m8`. |
| AccuLynx | `currentMilestone` plus job name, job number, or trade type. Filename `acculynx` or `accu-lynx`. |
| SuccessWare | `callId` plus agreement number, job class, or location id (calls normalize to jobs). Filename `successware` or `success-ware`. |
| Xero | Books-shaped `InvoiceID`, `Type` `ACCREC`, or `Contact.ContactID`. Filename `xero`. Not QuickBooks `QueryResponse`. |
| FieldEdge | Work-order number plus call reason, dispatch board, or agreement. Filename `fieldedge` or `field-edge`. |
| ServiceTrade | `serviceLine` plus store number or deficiencies. Filename `servicetrade` or `service-trade`. This is not ServiceTitan. |

Kept: Jobber, Housecall Pro, Service Fusion, QuickBooks Online, QuickBooks Desktop, generic CSV, generic JSON, ServiceTitan, ProBooks.

Each named profile normalizes into the same trades-app shadow entities (`job`, `pricebook`, `customer`, `appointment`, `invoice`, `technician`, `equipment`) and is admitted through FragGate as MEDIUM, `live:false`, `write:false`, UNVERIFIED. Wrapper ≠ verified. Receipt: [`specs/TR-VENDOR-2026-09-25.txt`](../../specs/TR-VENDOR-2026-09-25.txt).

## Law

- FragGate admits `servicetitan`, `probooks`, and `trades-app` as inbound (MEDIUM, hashed, `live:false`, `write:false`).
- `operator-file` stays LOW until origin is tagged `servicetitan`, `probooks`, or `trades-app`. Still hashed. Still not truth.
- `human` manager corrections go on Chain C with actor id.
- Wrapper ≠ verified. No silent promotion to VERIFIED.
- No compiled ST, ProBooks, or trades-app POST/PUT/PATCH.
- `scrape`, `central-dump`, and `hosted-upload` are refused.
- Tokens and exports stay on this machine or a sealed local vault.
- No tenant data on GitHub Pages, Workers, or a shared demo.

Copy `local.json.example` to `local.json` if you want path / read-endpoint hints. That file is gitignored. There is no cloud account field. Read-endpoint hints are not called by the runtime.

## Local alert rules (0.4.2)

Receipt: [`specs/TR-ALERTS-2026-09-25.txt`](../../specs/TR-ALERTS-2026-09-25.txt).

Copy [`../runtime/alerts.json.example`](../runtime/alerts.json.example) to `data/runtime/<instanceId>/alerts.json`. That copy is gitignored. `local.json` may set `alertsPath`, or an `alerts` object with the same shape. Missing file uses the example defaults.

Rules read desk scores already on the page: mission pace, evidence trust, verification, and booking block, plus the capacity series and unfinished jobs. They do not invent an accuracy percent. The in-desk banner, history, and acknowledge stay on this machine. A file hook is a local path. A webhook must be `127.0.0.1`, `localhost`, or `::1`. No phone-home.

## Option C prep (0.4.3)

Receipt: [`specs/TR-OPTION-C-PREP-2026-09-25.txt`](../../specs/TR-OPTION-C-PREP-2026-09-25.txt).

```bash
npm run pilot:prep
npm run health:local
```

`pilot:prep` checks these folders, copies `local.json.example` and `alerts.json.example` when the local copies are missing, admits synthetic fixtures in a temp tree, boots the desk on `127.0.0.1`, and prints a receipt. `pilot_started` stays false. It does not start a company pilot, does not fill these folders with fixtures, and does not write to ServiceTitan, ProBooks, or a trades app.

## Calls, digest, and receipt (0.4.5)

Receipt: [`specs/TR-CALLS-2026-09-26.txt`](../../specs/TR-CALLS-2026-09-26.txt).

The desk counts callback calls and warranty calls from explicit labels on admitted job rows (`callback`, `isCallback`, `warranty`, `isWarranty`, `jobType`, `tags`, and the same family). A row with no label stays in the not-classified bucket. Unknown is not warranty-covered and is not a callback. The empty inbound desk uses the in-repo multi-trade sample so the counts are non-zero and labeled as a fixture. `/api/alerts/digest.json` and `/api/alerts/digest.csv` download the current local rule hits. `/api/receipt` states what blocked booking. `pilot_started` stays false.

## Desk polish (0.4.4)

Receipt: [`specs/TR-DESK-POLISH-2026-09-25.txt`](../../specs/TR-DESK-POLISH-2026-09-25.txt).

The local desk page keeps the same honesty labels. A light or dark theme is stored in the browser under `trades-desk-theme`. `/api/receipt` on `127.0.0.1` is a printable snapshot of the desk and local receipt identifiers. Receipt bodies stay in the file. The lane view shows the capacity slot count, and a trade lane only when a row names `hvac`, `plumbing`, `electrical`, `sewer`, or `cross-trades`. A city name is not a lane. No map is drawn. Nothing phones home. `pilot_started` stays false.

## Open the human desk

From the repo root, after `npm install`:

```bash
npm run desk
```

The desk listens on `http://127.0.0.1:4174/`. It reads these folders locally, draws charts from admitted rows or from the synthetic demo when the folders are empty, and labels which one you are seeing. It does not write back to ServiceTitan, ProBooks, or any trades app.

Synthetic (not customer) fixtures for `npm run drop-in:demo` and `npm run byo:admit-demo` live in `test/fixtures/byo/`. Those demos copy fixtures into a **temp** inbound dir. Do not commit real exports here.
