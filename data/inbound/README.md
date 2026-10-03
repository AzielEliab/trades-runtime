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

## Office shadow try

`npm run shadow:office` admits the fixtures in `test/fixtures/sample-branch/office/` (sample branch `sample-shop`). That run is local shadow software. It is not Office Softwares 1.0 and it does not read field flags. It does not start a pilot.

## Field flags (local shadow)

Receipt: [`specs/TR-FIELD-FLAGS-2026-09-27.txt`](../../specs/TR-FIELD-FLAGS-2026-09-27.txt).

A field tech raises a flag the local desk can show on the same banner, panel, history, acknowledge, and digest as the other alert rules. Kinds are `needsParts`, `safetyHold`, `customerEscalation`, `vanDown`, and `callbackRisk`. Severity is `info`, `watch`, or `hold`. `inventedAccuracy` is false. This is not Field 1.0 and it is not part of the office shadow command.

Copy [`../runtime/field-flags.json.example`](../runtime/field-flags.json.example) into `data/runtime/<instanceId>/field-flags/<flagId>.json` (gitignored). The example file itself is not a live flag. `POST /api/flags/raise` on `127.0.0.1` writes that file and nothing else. An admitted job row can name the same labels, or a `labels` array, or a `fieldFlags` array. A label without a van id is not a flag. Notes, descriptions, and tags are not scanned.

`npm run shadow:field` exercises the fixtures in `test/fixtures/sample-branch/field/` without a tenant. No SMS. No push. No ServiceTitan or ProBooks write. The public Worker does not receive these flags.

## Option C prep (0.4.3)

Receipt: [`specs/TR-OPTION-C-PREP-2026-09-25.txt`](../../specs/TR-OPTION-C-PREP-2026-09-25.txt).

```bash
npm run pilot:prep
npm run health:local
```

`pilot:prep` checks these folders, copies `local.json.example` and `alerts.json.example` when the local copies are missing, admits synthetic fixtures in a temp tree, boots the desk on `127.0.0.1`, and prints a receipt. `pilot_started` stays false. It does not start a company pilot, does not fill these folders with fixtures, and does not write to ServiceTitan, ProBooks, or a trades app.

## Time, coverage, and right tech (0.4.10)

Receipt: [`specs/TR-OPS-2026-09-27.txt`](../../specs/TR-OPS-2026-09-27.txt).

These stay on the Monitoring panel. `live_backends` stays false. Nothing writes to ServiceTitan or ProBooks. Suggestions do not dispatch.

- Time cards: copy [`../runtime/time-cards.json.example`](../runtime/time-cards.json.example) to `data/runtime/<instanceId>/time-cards.json` or to `data/inbound/time-cards.json`. `/api/time-tracking` recomputes elapsed and remaining. The desk also writes `time-tracking.json` and `time-tracking.jsonl` under `data/runtime/<instanceId>/`. Those copies are gitignored. A missing file stays empty once a local export is admitted. The empty-folder desk uses a labeled synthetic demo. Not a live GPS feed.
- Coverage: copy [`../runtime/coverage.json.example`](../runtime/coverage.json.example) to `data/runtime/<instanceId>/coverage.json` or to `data/inbound/coverage.json`. `/api/coverage` returns layer state and breakdowns for zip codes, counties, cities, and roads or highways. Switches persist in `coverage-layers.json` (`POST /api/coverage/layers`). Not a live map tile. The address map stays undrawn.
- Right tech: `/api/right-tech` and `/api/tech-fit` suggest a tech for an open or scheduled job (`?job=` optional). Reasons name distance, time remaining, skill fit, and friction flags. Suggestions only. No auto-dispatch. No write-back.

## Inbound quality, alert stubs, and Option C start gate (0.4.9)

Receipt: [`specs/TR-QUALITY-2026-09-27.txt`](../../specs/TR-QUALITY-2026-09-27.txt).

`npm run desk` still binds to `http://127.0.0.1:4174/`. Empty inbound folders use a labeled synthetic quality fixture. That fixture is not a company export and not a live tenant pull.

- The report scores ServiceTitan and ProBooks fragments already on this machine: completeness, schema fit, stale or missing fields, conflicting keys, thin evidence, and refused writes. The checklist score is not an accuracy percent.
- `/api/inbound-quality` is the machine JSON. `/api/inbound-quality.txt` is the human report. Both stay loopback. The desk also writes `data/runtime/<instanceId>/inbound-quality.json`, `.txt`, and `.jsonl`. Those copies are gitignored.
- A firing alert lists proposed actions as stubs: a label, a rationale, the required human authority, and `refused: write-back`. `/api/alert-actions` returns stubs only. Nothing calls ServiceTitan or ProBooks.
- The Option C start-gate panel lists what must be true before a real pilot may start. Every gate stays blocked-until. Option C remains prep until a human operator starts a real pilot. Option D is out of scope. There is no cutover.

`pilot_started` stays false. `live_backends` stays false. Nothing here writes to ServiceTitan or ProBooks.

The same desk has one Monitoring view at `/api/monitoring`. Copy [`../runtime/positions.json.example`](../runtime/positions.json.example) to `data/runtime/<instanceId>/positions.json` or to `data/inbound/positions.json` when you want local tech and truck pins. A missing file stays empty once a local export is admitted. The empty-folder desk shows a labeled synthetic demo. Coordinates on a miles file can move those pins, and mile totals still ignore them. Do not claim a live GPS feed or a telematics vendor. The call board, drive cards, tech scores, and KPI charts recompute from files already on this machine.

## Miles and ranked performance (0.4.8)

Receipt: [`specs/TR-DRIVE-2026-09-27.txt`](../../specs/TR-DRIVE-2026-09-27.txt).

`npm run desk` still binds to `http://127.0.0.1:4174/`. Empty inbound folders use the in-repo sample, so miles and the ranked performance board are visible and labeled as a fixture. That fixture is not a company export and not a telematics feed.

- Optional miles file: copy [`../runtime/drive-miles.json.example`](../runtime/drive-miles.json.example) to `data/runtime/<instanceId>/drive-miles.json` (gitignored) or to `data/inbound/drive-miles.json` at this inbound root. The desk reads it and does not write it. Do not put it inside a vendor folder.
- A missing file stays unknown once a local export is admitted. Drive minutes or stops that the file does not name stay unknown. They are not treated as zero.
- A file that claims a live telematics vendor is refused. Coordinates on a row are ignored. No GPS vendor is integrated.
- `/api/drive` is the miles JSON. `/api/performance` is the ranked board JSON. `/api/receipt` prints both.
- The performance board ranks employees and departments best to worst (1…N) from avg ticket, recall rate, average sold, and current revenue when the job row names those fields. Missing money stays blank. The rank is not a skill score and it does not set trainingNeeded.
- Work together uses the same Chain D, cross-trade, and recognition flags. Positive collaboration is listed. Suggestions name who or which lane should pair or hand off for service techs when needed and for install. A silent export does not invent pairs or employee names. Revenue alone does not fire a suggestion. `/api/work-together` is the loopback JSON.
- Employee friction rate sits beside that board and at `/api/friction`. It counts handoff failures, coordination flags, explicit callbacks, and delayed handoffs. Delayed handoffs are inside the negative count, not added twice. Friction rank 1 is the highest known friction, not the best performance. Unknown callbacks with no handoff flags stay unknown. This is not a hosted HR system and it does not set trainingNeeded.

`pilot_started` stays false. Nothing here writes to ServiceTitan or ProBooks.

## Part cost, training, behavior, and truck counts (0.4.7)

Receipt: [`specs/TR-SOFTWARES-2026-09-27.txt`](../../specs/TR-SOFTWARES-2026-09-27.txt).

`npm run desk` still binds to `http://127.0.0.1:4174/`. Empty inbound folders use the in-repo sample, so part cost, trainingNeeded, department behavior, and truck counts are visible and labeled as a fixture.

- Part recommendations use current cost and last cost. Regional market adaptation weakens when evidence is thin, stale, or conflicted. The suggestion stays subordinate to a human. A locked price still refuses auto-recalibrate.
- The morning huddle shows trainingNeeded (severity and reason) from procedure observations. Revenue, margin, and contribution per hour are not a training flag and are not a skill score.
- Department behavior lists good handoffs and bad coordination from Chain D, cross-trade, and recognition. The last person is not blamed by default.
- `/api/stock` reads on-van and warehouse counts. A local file may live at `data/runtime/<instanceId>/stock-counts.json` (gitignored). Unknown counts are not treated as zero. This is not a hosted inventory ERP.

`pilot_started` stays false. Nothing here writes to ServiceTitan or ProBooks.

## Call reasons, week digest, and huddle (0.4.6)

Receipt: [`specs/TR-HUDDLE-2026-09-26.txt`](../../specs/TR-HUDDLE-2026-09-26.txt).

`npm run desk` still binds to `http://127.0.0.1:4174/`. Empty inbound folders use the in-repo multi-trade sample, so the call filters, the week digest, and the morning huddle are non-empty and labeled as a fixture.

- `/?calls=callback`, `/?calls=warranty`, and `/?calls=not-classified` filter the call list. The same query works on `/api/snapshot`, `/api/view`, `/api/receipt`, and `/api/events`. Headline counts stay the full desk.
- Each row prints the classify reason. A silent export stays not classified. Unknown is not a callback and is not warranty-covered.
- `/api/calls/week.json` is the trailing 7-day callback rate by trade lane. Loopback only.
- `/api/huddle` is the printable morning huddle. `/api/huddle.json` is the same board. Open jobs, late-risk count, callback share, warranty share, and capacity. Shares are not a skill score. Open slots stay blank when the export does not name them.

`pilot_started` stays false. Nothing here writes to ServiceTitan or ProBooks.

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

The desk listens on `http://127.0.0.1:4174/`. It reads these folders locally, draws charts from admitted rows or from the synthetic demo when the folders are empty, and labels which one you are seeing. It does not write back to ServiceTitan, ProBooks, or any trades app. At about 375px the same page keeps its Softwares cards, adds a domain nav, and scrolls wide tables and monitor charts inside their panels. Receipt: [`specs/TR-MOBILE-DESK-2026-09-27.txt`](../../specs/TR-MOBILE-DESK-2026-09-27.txt).

Synthetic (not customer) fixtures for `npm run drop-in:demo` and `npm run byo:admit-demo` live in `test/fixtures/byo/`. Those demos copy fixtures into a **temp** inbound dir. Do not commit real exports here.
