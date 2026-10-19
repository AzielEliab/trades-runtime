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

One path per platform (TR-PLATFORMS-ROUTE-2026-10-19): the ServiceM8, SuccessWare, and ServiceTrade fingerprints above still detect the file, but the file is admitted through that vendor's platform connector (`peerClass` `servicem8` / `successware` / `servicetrade`, the same mapper and source ids as a file dropped in `data/inbound/<kind>/`). A sniffed file and a file in the platform folder give the same records and hashes. A Successware CSV is admitted as profile `successware-csv`. Only a document that explicitly declares `"sourceKind": "trades-app"` keeps the older generic trades-app mapper. AccuLynx, Xero, FieldEdge, Jobber, Housecall Pro, Service Fusion, and QuickBooks profiles are not re-routed in this change.

Each named profile normalizes into the same trades-app shadow entities (`job`, `pricebook`, `customer`, `appointment`, `invoice`, `technician`, `equipment`) and is admitted through FragGate as MEDIUM, `live:false`, `write:false`, UNVERIFIED. Wrapper ≠ verified. Receipt: [`specs/TR-VENDOR-2026-09-25.txt`](../../specs/TR-VENDOR-2026-09-25.txt).

## Platform peers (TR-PLATFORMS-2026-10-19)

Six more platforms are named peer classes with their own FragGate `sourceKind` and folder. A file in one of these folders (or a JSON file with `"sourceKind": "<kind>"`) is mapped by that platform's mapper. A file that is clearly ServiceTitan or ProBooks still stays on that named peer. The older trades-app profiles for Jobber, Housecall Pro, Service Fusion, QuickBooks Online, and FieldEdge still work for files dropped in `trades-app/`.

| Folder | Platform | Documented objects mapped | Live pull |
| --- | --- | --- | --- |
| `data/inbound/jobber/` | Jobber | Job, Visit, Client, Invoice, Quote, PaymentRecord, User, LineItem | Optional. GraphQL queries only (`POST /api/graphql`, `X-JOBBER-GRAPHQL-VERSION`). |
| `data/inbound/housecallpro/` | Housecall Pro | jobs (+ schedule), customers, employees, estimates, invoices. Cents → dollars. | Optional. REST GETs. Vendor says the API needs the MAX plan. |
| `data/inbound/square/` | Square | Booking, Customer, Invoice, Payment, TeamMember. No job object, so no jobs. | Optional. List GETs + the documented read-only team-member search. |
| `data/inbound/quickbooks/` | QuickBooks Online | Customer, Invoice, Payment, Estimate, Employee, Item | Optional. `GET /v3/company/<realmId>/query` with `select` only. |
| `data/inbound/fieldedge/` | FieldEdge | work orders (+ assignment, customer, equipment), customers, invoices, estimates, technicians | None. FieldEdge API access is partner/member-gated through its developer portal, so this runtime ships file drop only. |
| `data/inbound/servicefusion/` | Service Fusion | jobs (+ techs), customers, estimates, invoices, equipment | Optional. REST GETs (`/v1/jobs` always sorted). Vendor says the API needs the Pro plan. |
| `data/inbound/successware/` | Successware | calls (+ equipment), customers/locations, invoices, technicians | None. No public API documentation; partner integrations only. |
| `data/inbound/workiz/` | Workiz | job (+ team), client, invoice, estimate (v2 camelCase) | Optional. v2 `GET /v2/jobs`, `/v2/clients`, `/v2/invoices`, `/v2/estimates` on `https://api.workiz.com/crm/api` with a Bearer API key (Developer API add-on). Jobs default to the last 30 days by scheduled date. |
| `data/inbound/servicetrade/` | ServiceTrade | job (+ location), appointment, location, company, invoice, quote, user, asset. Unix-second times converted. | Optional. `GET /api/job`, `appointment`, `location`, `company?isCustomer=true`, `invoice`, `quote`, `user?isTechOrHelper=true`, `asset` (first page each) with an OAuth2 bearer token. |
| `data/inbound/buildops/` | BuildOps | jobs (+ visits), customers/properties, invoices, quotes, employees, assets | None. API docs are invite-gated. |
| `data/inbound/fieldpulse/` | FieldPulse | jobs, customers, invoices, estimates, users | Optional. REST GETs with the `x-api-key` header (token from FieldPulse support). |
| `data/inbound/kickserv/` | Kickserv | jobs (+ customer, employees), customers, invoices, estimates, employees, items | Documented XML REST GETs (`/{accountSlug}/jobs.xml`, `customers.xml`, `employees.xml`, `items.xml`; first page of 30). HTTP Basic with the employee API token as user name and password. Premium plan. |
| `data/inbound/mhelpdesk/` | mHelpDesk | tickets, appointments, customers, invoices, estimates | None. No public API documentation found. |
| `data/inbound/servicem8/` | ServiceM8 | Job, JobActivity (scheduled only), Company, Staff, Material | Optional. `GET /api_1.0/<object>.json` with the `X-API-Key` header. |
| `data/inbound/simpro/` | Simpro | Job, Customer, Invoice, Quote, Employee | Optional. `GET /api/v1.0/companies/<companyId>/jobs/?columns=...` on your build host with an OAuth2 bearer token. |
| `data/inbound/commusoft/` | Commusoft | job (`recallOfParentJobID` feeds callback root cause), property, user, asset | Optional. v2 `GET /jobs`, `/properties`, `/users` with a Bearer API key (US or UK base). |
| `data/inbound/wintac/` | Wintac | work orders, customers, invoices, technicians, equipment (Excel → CSV) | None. Desktop software with no public API. |

CSV exports work in each folder. The entity comes from the file name (`customers.csv`, `invoices.csv`, `payments.csv`, `estimates.csv` / `quotes.csv`, `employees.csv` / `techs.csv`, anything else is jobs) and common column headers.

Live pull is off until you add `platforms.<kind>.pull` to `local.json` (see `local.json.example`). It names an environment variable that holds the token. Inline tokens, secrets, passwords, and keys are refused. `npm run pull -- <kind>` fetches the first page of each documented read, writes one `live-pull-<time>.json` into the platform folder on this machine, and the desk admits it like any drop (MEDIUM, UNVERIFIED). `npm run platforms` lists the peers. None of this has been tested against a live tenant.

Write-back for each platform is its own permission (`jobber.writeback`, `housecallpro.writeback`, `square.writeback`, `quickbooks.writeback`, `fieldedge.writeback`, `servicefusion.writeback`, and one `<kind>.writeback` for each wave-2 platform). Default off. Each call asks the operator yes or no. Without a backend in `data/runtime/<instanceId>/write-backends.json` and a token in the named env var the call returns `no-backend-configured` and writes nothing.

## Law

- FragGate admits `servicetitan`, `probooks`, `trades-app`, and the platform peers `jobber`, `housecallpro`, `square`, `quickbooks`, `fieldedge`, `servicefusion`, `successware`, `workiz`, `servicetrade`, `buildops`, `fieldpulse`, `kickserv`, `mhelpdesk`, `servicem8`, `simpro`, `commusoft`, `wintac` as inbound (MEDIUM, hashed, `live:false`, `write:false`).
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

## Compliance and revenue modules (TR-MODULES-B-2026-10-19)

Three local modules read the shop's own files plus any admitted inbound rows. Nothing is filed with a regulator or jurisdiction, and nothing is billed.

| Module | Local file | Inbound fields read on admitted job / equipment rows | Read tool / desk route | Write permission |
| --- | --- | --- | --- | --- |
| Refrigerant log | `data/runtime/<instanceId>/refrigerant.json` | `refrigerant`, `refrigerantLog`, `refrigerantEvents` on jobs; `fullChargeLbs` / `applianceType` on equipment | `trades_runtime_refrigerant`, `/api/refrigerant` | `refrigerant.write` |
| Permits and inspections | `data/runtime/<instanceId>/permits.json` | `permits` / `permit` on jobs | `trades_runtime_permits`, `/api/permits` | `permits.write` |
| Maintenance agreements | `data/runtime/<instanceId>/agreements.json` | `agreement`, `membership`, `servicePlan`, `service_plan` on jobs; completed jobs count as visits | `trades_runtime_agreements`, `/api/agreements` | `agreements.write` |

Refrigerant rules come from the eCFR as read on 2026-10-19:

- Leak rate: 40 CFR 82.152, annualizing or rolling-average method (one method per facility).
- Section 608 leak repair, 40 CFR 82.157: ODS (class I/II) refrigerant, full charge 50 lb or more. Trigger rates are 20% for commercial refrigeration, 30% for industrial process refrigeration, and 10% for comfort cooling and other appliances.
- AIM Act, 40 CFR 84.106, effective 2026-01-01: HFC (or substitute with GWP > 53) refrigerant, full charge 15 lb or more, at the same rates. Residential and light-commercial AC and heat pumps are excluded.
- Repair is due within 30 days (120 if an industrial process shutdown is needed). The repair-by date shown on the desk is a guide. The regulation is the authority.

Refrigerant class comes only from a built-in list of common ODS/HFC codes. Any other refrigerant is `undetermined` until the operator sets `refrigerantClass`. This is a record-keeping aid, not compliance advice.

Pricing is optional. Revenue at risk adds up only prices the shop supplies. Each at-risk agreement contributes one of two things:

- the `price` written on the agreement itself, or
- if it has none, the shop's own price for its plan in `settings.planPrices`, for example `{ "Gold plan": 189 }`. Plan names match case-insensitively.

An agreement with neither is counted as "price unknown", never as zero. Nothing is estimated. The board reports how many priced agreements used each source (`revenueAtRisk.pricedFrom`). The prices in `data/runtime/agreements.json.example` are labeled example data, are synthetic placeholders (111.11, 222.22, 199.99), and are not market rates.

Every write goes through the approval gate. Permissions are off by default, and the operator says yes or no each time.

## Ops modules (TR-MODULES-C-2026-10-19)

| Module | Local file | Inbound fields read on admitted job rows | Read tool / desk route | Write permission |
| --- | --- | --- | --- | --- |
| Manufacturer warranty claims | `data/runtime/<instanceId>/warranty-claims.json` | `parts` / `partsUsed` / `warrantyParts` / `lineItems` with `underWarranty`, or every part on a job labeled warranty; `equipment` manufacturer, model, serial | `trades_runtime_warranty_claims`, `/api/warranty-claims` | `warranty_claims.write` |
| Truck stock vs tomorrow | `data/runtime/<instanceId>/truck-stock.json` (vans, par, demand) plus `stock-counts.json` | `partsNeeded` / `parts` / `materials` / `lineItems` on jobs scheduled for tomorrow; `vanId` / `truckId`, or tech → van mapping | `trades_runtime_truck_stock`, `/api/truck-stock` | `truck_stock.write` |
| Callback root cause | `data/runtime/<instanceId>/callbacks.json` | callback / warranty labels (same rules as the weekly count); `originalJobId` / `parentJobId` / `callbackOf` / `relatedJobId`; `rootCause`, `installStep`, `failedPart` | `trades_runtime_callbacks`, `/api/callbacks` | `callbacks.write` |

- Manufacturer filing windows are not guessed. A days-left figure appears only for manufacturers listed in `settings.filingWindowDays`.
- On-van stock that was never counted is shown as unknown, not zero, and gets no restock suggestion. The suggested restock is need plus par minus the count. Nothing is ordered.
- A callback is linked to its original job only through an explicit reference or a local link. It is never linked by a time gap or an address. The roll-ups count by the original job's tech, and they are a list to review, not a skill score.

## Platform peers, wave 2 (TR-PLATFORMS-2-2026-10-19)

Successware was named by the owner. The other ten are field-service booking, dispatch, and job platforms that HVAC, plumbing, electrical, and sewer shops use. They were picked from public research, not usage data. No reliable market-share figures were found, so none are claimed. Each spec in `src/spine/platforms/catalog-wave2.ts` gives the reason for its pick and the public pages that informed it. The main ones are the Software Advice 2026 plumbing software list, an independent HVAC dispatch ranking (FieldServiceScout), and each vendor's own developer docs. Review counts quoted in a reason are the counts those pages showed on 2026-10-19.

| Platform | Mode |
| --- | --- |
| Workiz, ServiceTrade, FieldPulse, ServiceM8, Simpro, Commusoft | file drop + documented API pull (read-only GETs, first page) |
| Kickserv | file drop + documented XML API pull (read-only GETs, first page of 30; see below) |
| Successware, BuildOps | file drop only (no public API docs / invite-gated) |
| mHelpDesk, Wintac | file drop only (no public API) |

Every platform here is fixture-tested only. None has been tested against a live tenant.


### Mapping confidence (TR-PLATFORMS-MAPPING-2026-10-19)

Each platform spec carries a `mappingConfidence` field, with its sources in `mappingSources` and the details in `mappingNote` (`src/spine/platforms/mapping-verification.ts`). The desk shows the same list under "Platform peers and mapping confidence". `npm run platforms` prints it too.

- `documented`: the field names the mapper reads were checked against the vendor's published schema.
- `partial`: some field names come from a published source, such as request fields, report column lists, import templates, an SDK, or a docs mirror. The rest are guessed or were not re-checked.
- `guessed`: no published field list was found. Drop a real export and check the mapped fields before relying on them.

| Platform | Mapping confidence | Field names checked against | Needs a real shop export to confirm |
| --- | --- | --- | --- |
| FieldEdge | documented | FieldEdge Open API schemas (docs-dev.fieldedge.com): work orders, assignments, invoices, quotes, employees, customers | FieldEdge app report exports (no published columns); job totals |
| Workiz | documented | Workiz Developer API v2 OpenAPI (developer.workiz.com/v2) | CSV exports |
| ServiceTrade | documented | ServiceTrade OpenAPI 3.1 (api.servicetrade.com/openapi/openapi.json) | CSV exports |
| FieldPulse | partial | API create-request fields and the Job Report CSV columns (help.fieldpulse.com) | list-response-only fields (total, customer name, assignee name) |
| Kickserv | partial | Kickserv Swagger (app.kickserv.com/api-def) | the XML envelope; separate invoice/estimate exports |
| mHelpDesk | partial | CustomerList / ContactsList / InvoiceList report columns (ServiceTitan migration guide) and the mHelpDesk customer import template | ticket/job exports |
| Simpro | partial | Simpro apidoc via a docs mirror and a community SDK (vendor page is behind a browser challenge) | a direct check against the vendor apidoc |
| Successware | guessed | none published (backup-file migration; user-picked report columns) | everything |
| BuildOps | guessed | none readable (API reference invite-gated) | everything |
| Wintac | guessed | none published (backup-file migration) | everything |
| Jobber, Housecall Pro, Square, QuickBooks Online, Service Fusion, ServiceM8, Commusoft | partial | vendor API references, used in the original build | a field-by-field re-check (not done in this pass) |

"Documented" covers only the field names. None of these platforms has been tested against a live tenant.

Corrections made from these sources:
- **Workiz:** fields are now v2 camelCase (`uuid`, `status`, `date`, `totalPrice`, `clientInfo`, `team`). The base URL is `https://api.workiz.com/crm/api` with `/v2/...` paths, and the pull also reads clients, invoices, and estimates. The earlier PascalCase names and the `/api/v2` base were wrong.
- **FieldEdge:** fields are now `customerId`, `scheduledStart`, `serviceAddress`, `primaryAssignment`, `invoiceId`, and assignments with `technicianId`, `technicianName`, and `scheduleDateTime`. The earlier nested `customer` / `assignment` guesses were dropped.
- **ServiceTrade:** the pull now also reads appointments, customer companies, invoices, quotes, techs and helpers, and assets. The list keys are verified in the OpenAPI spec. Invoices and appointments link to `job.id`.
- **Simpro:** the pull sends the documented `columns` parameter, because list calls otherwise return only ID, Description, and Total.
- **FieldPulse:** the mapper now reads the assignee from `assignments[].assigned_members` and the invoice date from `invoiced_date`. Job Report CSVs with a `#ID` header are now read instead of being skipped as a comment.
- **mHelpDesk:** `InvoiceList.csv` now keys on Invoice Number, not Ticket ID.

### Kickserv XML pull (TR-PLATFORMS-KICKSERV-2026-10-19)

Kickserv's API is XML over HTTP. It is documented in its Swagger definition (`https://app.kickserv.com/api-def`, shown at `https://app.kickserv.com/api-docs`). The pull reads it with `src/spine/platforms/xml.ts`, a small reader with no dependencies. The reader refuses `DOCTYPE` and `ENTITY` declarations, so there is no external-entity fetch and no entity expansion. It caps response size and nesting depth. It follows Rails `to_xml` hints: `type="array"` becomes a list, `nil="true"` becomes null, and integer, decimal, and boolean values are coerced.

```json
"kickserv": {
  "path": "data/inbound/kickserv",
  "pull": { "tokenEnv": "TRADES_RUNTIME_KICKSERV_TOKEN", "accountSlug": "your-account-slug" }
}
```

- The token is the employee API token from Kickserv's employee management page, and it needs the Premium plan. It is sent as HTTP Basic, with the token as both user name and password. Kickserv documents that changing the employee's password changes the token.
- `accountSlug` is the name right after `app.kickserv.com/`. It is not a secret.
- The pull makes only GET requests: jobs (with `include=customer,employees`), customers, employees, and items. Each returns the first page of 30. The Swagger lists parameters and fields, but it does not publish the XML envelope. The reader therefore accepts both `<jobs type="array"><job/></jobs>` and `<jobs><job/></jobs>`.

## Your own export (TR-PLATFORMS-USER-EXPORTS-2026-10-19)

The export path is adopter-driven. This repo ships no shop exports. Each shop drops its own CSV or JSON export into `data/inbound/<kind>/`, where it stays local and gitignored. Fixtures under `test/fixtures/` are synthetic.

Guessed and partial mappings are confirmed by each shop's own export, not by this repo. Mapping confidence (documented / partial / guessed) describes the built-in mapper only.

How to add or fix a mapping:

1. Drop your export into `data/inbound/<kind>/` (for example `data/inbound/successware/calls.csv`).
2. Run `npm run mapping:check -- <kind> <file>`. It lists the matched fields (with the column each came from and whether it came from your override, the platform's published columns, or the generic aliases), the unmatched columns, and any missing required fields (`id` always; also `observed` for jobs, appointments, and invoices). It exits 2 while a required field is missing. It writes a starter override from the file's headers to `data/runtime/<instanceId>/mappings/<kind>.json`. If that file already exists, the starter goes to `<kind>.starter.json` instead; an existing override is never overwritten. Use `--no-write` to skip the starter.
3. Edit the override. For CSV, `csv.<entity>.<field>` lists your lower-cased header names. The fields are `id`, `status`, `observed`, `technicianName`, `technicianId`, `customerName`, `customerId`, `jobTotal`, and `serviceAddress`. `csvEntity` maps part of a file name to an entity. For JSON, `collections[]` gives the `path` to your list, the `entity`, the `id` and `observed`/`status` paths, and `fields` (normalized key → your paths). See `data/runtime/mapping-override.json.example` (synthetic).
4. Re-run the check. The override takes priority over the built-in mapper in the desk, the modules, and every admit. Admitted files show profile `<kind>+local-override` (or `<kind>-csv+local-override`). A malformed override is reported and ignored, never guessed at.

The desk shows the same check in "Your exports: mapping check" for every file in a platform folder. That panel is read-only and never writes a starter.

Override files live under `data/runtime/`, which is gitignored (`data/**`). No tenant data is committed. Everything stays local: `live_backends` is false, it has not been tested against a live tenant, and admitted rows stay UNVERIFIED.
