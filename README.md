# Trades-Runtime

Private **TypeScript runtime** for a shadow-first AI operating system / company operating intelligence layer. Field trades: HVAC, plumbing, electrical, sewer, and cross-trades.

**Author / identity:** Aziel Eliab only. See [`IDENTITY.md`](IDENTITY.md). No legal name, home, or county on exports.  
**Version:** 1.0.0 (**Local Softwares 1.0**, installable)  
**Role:** `trades-runtime`  
**License:** Apache-2.0  
**Release:** free software (Apache-2.0). Clone it and run the local shadow on your machine. Aziel Eliab is the author, not the operator, and is not running a company pilot.  
**Public Worker (if deployed):** https://trades-runtime.vibelock.workers.dev  
**Try on Glama (intended listing):** https://glama.ai/mcp/servers/AzielEliab/trades-runtime — pack is in-repo (`glama.json`, `Dockerfile`, `cli/mcp-stdio.mjs`). Do **not** treat Install Server as LIVE from this git tree alone. Checked 2026-10-02: Glama Latest/releaseVersion is **1.0.0**. The badge matches the Softwares cite tip. Local Softwares 1.0. That match is not a Field 1.0 claim and not Office Softwares 1.0. This cut does not Make Release. See [`docs/GLAMA.md`](docs/GLAMA.md).  
**Status:** 1.0.0 installable Local Softwares 1.0 (Track L gate; pilot not started; live_backends false; not a Field 1.0 claim) — 0.4.12 familiar commands (`help`, `softwares`, `version`, `health`) so a person can discover the product without reading the whole README; desk features stay frozen (**pilot not started**) — 0.4.11 giveaway human UI on the VibeLock Worker (browser / PWA) without downloading first; optional counted pack; operator desk still local (**pilot not started**) — 0.4.10 local time tracking, service-coverage switches, and right-tech suggestions on the Monitoring desk (**pilot not started**) — 0.4.9 local inbound quality report for ServiceTitan and ProBooks fragments, alert-to-action stubs with refused write-back, and an Option C start-gate prep panel (**pilot not started**) — 0.4.8 local miles driven and drive performance, a ranked employee and department performance board, work-together suggestions across departments, and an employee friction rate beside that board (**pilot not started**) — 0.4.7 part cost with regional market adaptation, per-tech trainingNeeded, good and bad department behavior flags, and local truck counts (**pilot not started**) — 0.4.6 per-call classify reasons, callback / warranty / not-classified filters, a loopback weekly callback-rate digest, and a tech morning huddle (**pilot not started**) — 0.4.5 local callback and warranty counts, alert-digest export, score explanations, and booking-block receipt (**pilot not started**) — 0.4.4 local operator desk polish (theme, lane view, printable snapshot; **pilot not started**) — 0.4.3 Option C BYO pilot prep (local runbook + `npm run pilot:prep`; **pilot not started**) — 0.4.2 local alert rules on the operator desk — 0.4.1 named trades-app vendor profiles on the 0.4.0 universal drop-in — lockstep with Property Intelligence v1.0 in-tree — live-pure core + honest stubs — **BYO** local ServiceTitan + ProBooks + trades-app inbound — **no** live writes, tenant data, ST/ProBooks write-back, phone-home, DOIs, hosted uploader, or production company-OS claim — **Option C code-ready / pilot not started** — **Option D not started**

The product is the software in `src/`. `docs/` is a thin local catalog/UI. GitHub Pages is **intentionally disabled** (`live_backends: false`). There is no Pages workflow. **PDFs are never published.** Implementer specs live at repo-root [`specs/`](specs/) (not under `docs/`).

Standing rule: every PDF Aziel sends is a spec to implement as coded software.

Paper trail: [`TR-1.0-GATE-2026-09-28`](specs/TR-1.0-GATE-2026-09-28.txt) (Track L Local Softwares 1.0 gate; pilot not started) · [`TR-COMMANDS-2026-09-27`](specs/TR-COMMANDS-2026-09-27.txt) (common CLI commands help, softwares, version, health; desk frozen; pilot not started) · [`TR-OPS-2026-09-27`](specs/TR-OPS-2026-09-27.txt) (local time tracking, coverage switches, right-tech suggestions; pilot not started) · [`TR-DESK-VIEW-2026-09-27`](specs/TR-DESK-VIEW-2026-09-27.txt) (local show/hide checkboxes; Softwares card grids unchanged; pilot not started) · [`TR-MOBILE-DESK-2026-09-27`](specs/TR-MOBILE-DESK-2026-09-27.txt) (phone-width local desk; Softwares cards unchanged; pilot not started) · [`TR-QUALITY-2026-09-27`](specs/TR-QUALITY-2026-09-27.txt) (inbound quality, alert-action stubs, Option C start gate; pilot not started) · [`TR-DRIVE-2026-09-27`](specs/TR-DRIVE-2026-09-27.txt) (miles driven, drive performance, ranked employee and department board; pilot not started) · [`TR-SOFTWARES-2026-09-27`](specs/TR-SOFTWARES-2026-09-27.txt) (part cost and market adaptation, trainingNeeded, department behavior flags, local truck counts; pilot not started) · [`TR-HUDDLE-2026-09-26`](specs/TR-HUDDLE-2026-09-26.txt) (per-call classify reason, call filters, weekly callback rate, morning huddle; pilot not started) · [`TR-CALLS-2026-09-26`](specs/TR-CALLS-2026-09-26.txt) (callback and warranty counts, alert digest, score why, booking-block receipt; pilot not started) · [`TR-DESK-POLISH-2026-09-25`](specs/TR-DESK-POLISH-2026-09-25.txt) (local desk polish; pilot not started) · [`TR-OPTION-C-PILOT-RUNBOOK-2026-10-02`](specs/TR-OPTION-C-PILOT-RUNBOOK-2026-10-02.txt) (human Option C start path; catalog pilot not started) · [`TR-PILOT-START-2026-10-02`](specs/TR-PILOT-START-2026-10-02.txt) (explicit `pilot:start --branch` on the operator isolate; not Field 1.0; not Office Softwares 1.0) · [`TR-OPTION-C-PREP-2026-09-25`](specs/TR-OPTION-C-PREP-2026-09-25.txt) (Option C box prep; pilot not started) · [`TR-ALERTS-2026-09-25`](specs/TR-ALERTS-2026-09-25.txt) (local alert rules) · [`TR-VENDOR-2026-09-25`](specs/TR-VENDOR-2026-09-25.txt) (named vendor profiles) · [`TR-DESK-2026-09-25`](specs/TR-DESK-2026-09-25.txt) (universal drop-in + local human desk) · [`TR-AUDIT-2026-09-18C`](specs/TR-AUDIT-2026-09-18C.txt) · [`TR-AUDIT-2026-09-18B`](specs/TR-AUDIT-2026-09-18B.txt) · [`TR-AUDIT-2026-09-18`](specs/TR-AUDIT-2026-09-18.txt) · [`TR-AUDIT-2026-09-17`](specs/TR-AUDIT-2026-09-17.txt) · [`TR-CUT-2026-09-17`](specs/TR-CUT-2026-09-17.txt) · [`TR-BOT-2026-09-17`](specs/TR-BOT-2026-09-17.txt) (standing brief) · [`TR-BYO-2026-09-17`](specs/TR-BYO-2026-09-17.txt) (amends TR-BOT §9 and TR-CUT R2–R3).

## Try it on your machine

Merging this repository does not start a pilot. Aziel Eliab wrote the software. He is not the operator, he is not a customer, and he is not running a shop on this repo. `live_backends` stays false. There is no write-back. A fresh clone needs no ServiceTitan or ProBooks tenant and no secrets.

```bash
git clone https://github.com/AzielEliab/trades-runtime.git
cd trades-runtime
npm install
npm test
npm run demo
npm run shadow:office
npm run shadow:field
npm run desk
```

What you will see:

- `npm run demo` prints a synthetic shadow day in the terminal. It is a fixture. It is not a company result and it does not print an accuracy percent.
- `npm run shadow:office` runs the office shadow on the sample branch named `sample-shop`. Fixtures are already in `test/fixtures/sample-branch/office/`. The receipt says `office_softwares_1_0: false`, `pilot_started: false`, and `live_backends: false`. You will see admitted sample jobs, a huddle count, inbound quality as a checklist, and alert stubs that refuse write-back. That command does not load field flags.
- `npm run shadow:field` runs the field shadow on the same sample branch, from `test/fixtures/sample-branch/field/`. You will see local flags (`needsParts`, `safetyHold`, `vanDown`, and a row that names a label without a van, which does not invent a van), a time card, coverage places, and a right-tech suggestion. `field_softwares_1_0` is false. It is not a live GPS feed and not Field 1.0. It is a separate command from the office shadow.
- `npm run desk` opens the local desk at http://127.0.0.1:4174/ . With empty inbound folders the page is labeled synthetic demo. It is not your company and not a live tenant. Dropping your own exports into `data/inbound/` is optional and stays on your machine.

When you have a real branch on your own machine, and only then:

```bash
npm run pilot:prep
npm run pilot:start -- --branch <branchId>
```

That is the only software path that sets `pilot_started` true, and it does it on your isolate only. It refuses a missing or bad branch, prep that is not ready, and `--claim-company` when inbound is empty or only synthetic. The shipped catalog stays `pilot_started` false. Mode stays SHADOW-SEALED. Writes require operator approval; default off. The receipt is not a live company OS, not Office Softwares 1.0, and not Field 1.0.

## Install, test, demo

```bash
npm install
npm test
npm run typecheck
npx tsx src/cli.ts help
npx tsx src/cli.ts softwares
npx tsx src/cli.ts version
npx tsx src/cli.ts health
npm run demo
npm run byo:admit-demo
npm run drop-in:demo
npm run desk
npm run shadow:office
npm run shadow:field
npm run pilot:prep
npm run pilot:start -- --branch <branchId>
npm run health:local
npm run shadow:sealed-demo
npm run manifest
npm run mcp
```

`help` prints the command list (`--help` and `-h` do the same). `softwares` lists each module's slug, status, and one line in plain language (`Softwares` matches in any letter case). `version` prints the product name and version, then one honesty line: live_backends false, pilot_started false (`--version` and `-V` do the same). `health` is the same local honesty card as `health-local`. An unknown command prints that it is unknown, then the help text, and exits non-zero. No command still prints help and exits zero.

`npm test` runs constitutional rule tests including Human Authority, confidence≠truth, CrossTrade secondary-only routing, v0.2 recognition / pricebook lock / mission board / location economics, the 0.3.3 execution spine (FragGate inbound, durable receipts, `runAction`), restart-replay of append-only JSONL receipts (`data/receipts.jsonl` or `{tmpdir}/tr-replay-*/receipts.jsonl`), the synthetic BYO admit demo, the universal drop-in demo, the local operator desk, Option C sealed-shadow scaffolding (no auto-promote, engagement drop-back, required settlement fields), and Option C pilot prep (machine checks, synthetic admit, desk boot, `pilot_started: false`).

CI (`.github/workflows/ci.yml`) runs `npm ci`, `npm run typecheck`, and `npm test` on pull requests and pushes to `main`. GitHub Pages is intentionally disabled — do not treat a github.io URL as a test gate.

`npm run demo` runs a synthetic shadow-day: Call-Fit, sealed counterfactual, human override, hash-chained receipts, trajectory rebase.

## Software map

| Area | Path | Status |
| --- | --- | --- |
| Canonical IDs / events / modes | `src/core/` | live-pure |
| Confidence ≠ truth | `src/core/confidence.ts` | live-pure |
| Chains A/B/C/D | `src/core/chains.ts` | live-pure |
| Human Authority | `src/core/human-authority.ts` | live-pure |
| TradesCoherence, EvidencePacket, DecisionGate, ReceiptLedger, Shadow, Trajectory | `src/inherited/` | live-pure |
| Call-Fit, economics, CrossTrade, Chain D, workforce, Decision Fabric, analytics | `src/domain/` | live-pure |
| Communications (event-stream channels) | `src/domain/communications.ts` | live-pure |
| Recognition (quality-gated) | `src/domain/recognition.ts` | live-pure |
| Daily mission board | `src/domain/mission-board.ts` | live-pure |
| Callback and warranty labels | `src/domain/call-class.ts` | live-pure |
| Morning huddle + trainingNeeded | `src/domain/huddle-board.ts` | live-pure |
| Miles driven and drive performance | `src/domain/drive-miles.ts` | live-pure |
| Ranked employee and department board | `src/domain/performance-board.ts` | live-pure |
| Work together and cross-department suggestions | `src/domain/work-together.ts` | live-pure |
| Employee friction rate | `src/domain/friction.ts` | live-pure |
| Inbound quality report | `src/domain/inbound-quality.ts` | live-pure |
| Alert action stubs | `src/desk/alert-actions.ts` | live-pure |
| Option C start gate | `src/spine/option-c-start-gate.ts` | live-pure |
| Local positions and Monitoring view | `src/domain/local-positions.ts` | live-pure |
| Pricebook (ST shadow + current/last cost + LOCK) | `src/domain/pricebook.ts` | live-pure |
| Truck stock counts / fulfillment | `src/domain/truck-stock.ts` | live-pure |
| Weather / demand / lunar (experimental) | `src/domain/weather-demand.ts` | live-pure |
| Maintenance routing (demand-first) | `src/domain/maintenance-routing.ts` | live-pure |
| Property Intelligence v1.0 | `src/domain/property-*.ts`, `neighborhood-*.ts`, `regional-recalibration.ts` | live-pure |
| FragGate inbound | `src/spine/fraggate-inbound.ts` | live-pure |
| Durable receipts | `src/spine/durable-receipts.ts` | live-pure |
| `runAction()` spine | `src/spine/run-action.ts` | live-pure |
| Actor / authority registry | `src/core/actor-registry.ts` | live-pure |
| Shadow modes | `src/core/shadow-modes.ts` | live-pure |
| Engagement rules (not an order) | `src/core/engagement-rules.ts` | live-pure |
| One-branch shadow config | `src/core/shadow-branch.ts` | live-pure |
| Settlement harness | `src/core/settlement-harness.ts` | live-pure |
| ServiceTitan shadow (ingest-only; write-back via approval gate) | `src/spine/servicetitan-shadow.ts` | live-pure |
| ProBooks shadow (ingest-only, peer inbound; write-back via approval gate) | `src/spine/probooks-shadow.ts` | live-pure |
| Local BYO inbound layout | `src/spine/inbound-layout.ts` | live-pure |
| Local inbound config (no cloud account) | `src/spine/local-inbound-config.ts` | live-pure |
| Universal trades-app drop-in | `src/spine/drop-in.ts` | live-pure |
| Trades-app shadow (ingest-only; write-back via approval gate) | `src/spine/trades-app-shadow.ts` | live-pure |
| Local human operator desk (AZTrades shell included) | `src/desk/` | live-pure |
| AZTrades field time (clock, meal, drive) | `src/desk/field-time.ts` | live-pure |
| AZTrades job price | `src/desk/job-price.ts` | live-pure |
| SupplyHouse public GET | `src/desk/supplyhouse-public.ts` | live-pure |
| AZTrades property card | `src/desk/property-card.ts` | live-pure |
| AZTrades local login | `src/desk/local-login.ts` | live-pure |
| AZTrades shell render | `src/desk/aztrades-render.ts` | live-pure |
| AZTrades hint prefs | `src/desk/hint-prefs.ts` | live-pure |
| Synthetic drop-in demo | `src/demo/drop-in.ts` | live-pure |
| Runtime isolate (per-instance receipts) | `src/spine/runtime-isolate.ts` | live-pure |
| Synthetic BYO admit demo | `src/demo/byo-admit.ts` | live-pure |
| Synthetic sealed-shadow demo | `src/demo/shadow-sealed.ts` | live-pure |
| Option C pilot prep | `src/spine/option-c-prep.ts` | live-pure |
| Local health card | `src/spine/health-local.ts` | live-pure |
| Fulfillment state machine | `src/domain/fulfillment-machine.ts` | live-pure |
| Mission board clock | `src/domain/mission-board.ts` | live-pure |
| PI wired to jobs | `src/domain/property-jobs.ts` | live-pure |
| §18 freeze + v0.2 governing rules | `src/rules/constitution.ts` | live-pure |
| Write permissions (all / selected, autoApprove off) | `src/approvals/permissions.ts` | live-pure |
| Approval gate (per-call yes/no, single-use, expiring, hash-chained log) | `src/approvals/gate.ts` | live-pure |
| Operator-configured write-back backends | `src/approvals/backends.ts` | live-pure (no backend ships) |
| Local MCP with approval-gated write tools | `src/approvals/local-mcp.ts` | live-pure |
| ServiceTitan / ProBooks live writes | `src/approvals/` | operator approval required; default off; no backend configured in this repo |

## Approval-gated writes

Writes require operator approval; default off.

Every write the runtime can make from a tool call or action goes through one gate, `src/approvals/gate.ts`. Nothing writes without an approval.

1. A write tool call creates a **pending approval request** that lists the tool, the target, and a payload summary. Nothing is written yet.
2. A local human operator answers **yes or no**, either in the **Write permissions and approvals** panel on the loopback desk (`http://127.0.0.1:4174/#approvals-board`) or from a terminal:

   ```bash
   npm run approvals                 # list pending requests
   npm run approve -- <id> yes       # run that one call once
   npm run approve -- <id> no        # refuse it; the refusal is recorded
   ```

3. A yes runs that one call **once**. Approvals are single-use. A pending request expires after `approvalTtlSeconds` (default 900). An expired approval fails.
4. Every request, refusal, decision, expiry, and result is appended to `data/runtime/<instanceId>/approvals.jsonl`. That file is a hash chain built on the existing durable receipt store (`src/spine/durable-receipts.ts`). Credentials are never written to it.
5. The requester can never approve its own request. The local MCP has no approve or deny tool. The desk's approve/deny and settings endpoints are loopback only. They need the per-process desk token embedded in the desk page, refuse any request that carries an `mcp-session-id`, and refuse cross-origin browser requests.

### Permission settings

The settings live in the desk panel, in `data/runtime/<instanceId>/permissions.json` (copy `data/runtime/permissions.json.example`), and in `npm run permissions`.

| Mode | What it does |
|---|---|
| `selected` (default) | Only the permissions you pick are on. **The default is `selected` with nothing picked, which is the same as read-only.** |
| `all` | Every write permission is on, and **each call still asks yes or no**. It skips the prompt only if you also set `autoApprove: true`. |

`autoApprove` is **off by default** and only works in `all` mode. In `selected` mode it is ignored. With it on, enabled writes run without a per-call yes or no, and each one is still logged.

```bash
npm run permissions                                        # show current settings
npm run permissions -- --enable field_events.write         # selected mode: turn one on
npm run permissions -- --disable field_events.write
npm run permissions -- --mode all                          # every permission on, still asks per call
npm run permissions -- --mode all --auto-approve on        # no per-call prompt (off by default)
```

Each permission maps to one real write path in this repo:

| Permission | Tool | Writes |
|---|---|---|
| `servicetitan.writeback` | `trades_runtime_servicetitan_writeback` | ServiceTitan API, only through an operator-configured local backend |
| `probooks.writeback` | `trades_runtime_probooks_writeback` | ProBooks API, only through an operator-configured local backend |
| `tradesapp.writeback` | `trades_runtime_tradesapp_writeback` | Another trades app API, only through an operator-configured local backend |
| `alerts.ack` | `trades_runtime_alert_ack` | Acknowledges a local desk alert (`alert-state.json`) |
| `field_flags.write` | `trades_runtime_field_flag_raise` | A local field flag under `field-flags/` |
| `field_events.write` | `trades_runtime_field_event_record` | A clock, meal, or drive event in `field-events.jsonl` |

A permission that is off returns a clear refusal, and that refusal is logged.

The desk's own buttons, such as job price, clock events, flags, coverage switches, and alert acknowledge, are the operator acting directly on this machine, so they don't go through the gate. The gate covers tool calls and agent actions.

### Write-back backends and credentials

No backend and no credential ship in this repo. `live_backends` stays false in the committed catalog. A ServiceTitan, ProBooks, or trades-app write-back runs only when both of these are true:

- the operator wrote `data/runtime/<instanceId>/write-backends.json` on their own machine (copy `data/runtime/write-backends.json.example`). It holds an https `baseUrl` and the **name** of an environment variable, never the secret itself. Inline tokens are refused.
- the operator approved that one call.

Otherwise the call returns `no-backend-configured` and writes nothing. A vendor error is reported as `vendor-error`. Neither one is ever turned into a success. The request shape (`method`, `path`, `body`) is passed to the vendor as given. This repo has not been tested against a live ServiceTitan or ProBooks tenant.

### Local MCP

`npm run desk` also serves JSON-RPC MCP at `POST http://127.0.0.1:4174/mcp`, loopback only. A stdio client can bridge to it:

```bash
TRADES_RUNTIME_URL=http://127.0.0.1:4174 npm run mcp
```

In `tools/list`, write tools carry `requiresApproval: true`, their `permission`, and `permissionEnabled`. Calling one returns `{ "status": "pending", "approvalId": ... }`, or a refusal when the permission is off. `trades_runtime_approvals_list` and `trades_runtime_approval_status` are read-only. The public giveaway Worker (`trades-runtime.vibelock.workers.dev`) stays read-only. It holds no tenant data, so it has nothing to write.

This does not claim Field 1.0 or Office Softwares 1.0, and it does not start a pilot. `pilot_started` stays false.

## BYO inbound (TR-BYO-2026-09-17)

Each user incorporates **their own** ServiceTitan and **their own** ProBooks into **their** local runtime. The authoring node / GitHub is **not** a data custodian. No central dump. No hosted uploader. No phone-home.

Local inbound on that machine (contents gitignored):

- `data/inbound/servicetitan/` — ST export or read-only pull the user places
- `data/inbound/probooks/` — ProBooks books / items / costs / vendor files the user places
- `data/inbound/trades-app/` — other field-service / job / pricebook / customer / appointment exports. Named profiles: Jobber, Housecall Pro, Service Fusion, QuickBooks-shaped books, ServiceM8, AccuLynx, SuccessWare, Xero, FieldEdge, ServiceTrade. Generic CSV/JSON when no fingerprint matches.
- `data/runtime/<instanceId>/receipts.jsonl` and `ledger.jsonl` — isolate per runtime instance

Not `data/tenants/` (that word implies a hosted multi-tenant service). Optional local config lists paths or read-endpoint hints only — **no cloud account**, and the runtime does not call those hints. Tokens stay on the user’s machine or their sealed vault.

FragGate first-class `sourceKind` values: `servicetitan` (MEDIUM, hashed, `live:false` `write:false`), `probooks` (same), `trades-app` (same, generic class), `operator-file` (LOW until origin tagged `servicetitan`, `probooks`, or `trades-app`; still not truth), `human` (manager correction on Chain C with actor id). Wrapper ≠ verified. Scrape, central-dump, hosted-upload, and silent promotion to VERIFIED are refused.

## Universal drop-in (TR-DESK-2026-09-25)

ServiceTitan and ProBooks stay named peer classes. A third inbound class, `trades-app`, admits the same family of exports without a new paper for each vendor. The drop-in sniffs JSON/CSV shape and applies a mapping profile. 0.4.1 prefers a named profile when keys, headers, or the filename match: Jobber, Housecall Pro, Service Fusion, QuickBooks Online, QuickBooks Desktop, ServiceM8, AccuLynx, SuccessWare, Xero, FieldEdge, and ServiceTrade. Otherwise it uses generic JSON or generic CSV. A file that still looks like ServiceTitan or ProBooks stays on that peer class. ServiceM8, SuccessWare, and ServiceTrade files are now admitted through their platform connectors, so each of those has one path (see `data/inbound/README.md`). See [`TR-VENDOR-2026-09-25`](specs/TR-VENDOR-2026-09-25.txt).

```bash
npm run drop-in:demo
```

That demo copies synthetic fixtures from `test/fixtures/byo/` into a temp inbound tree, admits them through FragGate, hashes packets, writes temp isolate receipts, and proves writes still throw. It is not a customer dump.

Real exports stay in the gitignored drop folders. `data/inbound/local.json` (copied from `local.json.example`) may name paths and read-endpoint hints. Hints are documentation for the operator. This process does not fetch them.

## Platform peers (TR-PLATFORMS-2026-10-19)

Jobber, Housecall Pro, Square, QuickBooks Online, FieldEdge, Service Fusion, and (wave 2, TR-PLATFORMS-2-2026-10-19) Successware, Workiz, ServiceTrade, BuildOps, FieldPulse, Kickserv, mHelpDesk, ServiceM8, Simpro, Commusoft, and Wintac are first-class inbound peers. Successware was named by the owner. The other ten were picked from public research (Software Advice 2026 plumbing list, an independent HVAC dispatch ranking, vendor developer docs), not usage data. No market share is claimed. The reasons and sources for each are in `src/spine/platforms/catalog-wave2.ts`. Each one has its own folder, `data/inbound/<kind>/`. Drop a JSON or CSV export into that folder, and it is mapped to the vendor's documented object names, then admitted as MEDIUM, unverified, `live: false`.

You can also pull data yourself with `npm run pull -- <platform>`. This is a read-only call against the vendor's documented public API. The env var that holds the token is named in `data/inbound/local.json`. No credential is kept in the repo, in Pages, or in the Worker.

| Platform | Mode | Why |
| --- | --- | --- |
| Jobber | file drop + documented API pull | Public GraphQL API (`X-JOBBER-GRAPHQL-VERSION`). |
| Housecall Pro | file drop + documented API pull | Public REST API; the vendor offers it on the MAX plan. |
| Square | file drop + documented API pull | Public REST API (customers, payments, invoices, bookings, team). Square has no job object, so none is invented. |
| QuickBooks Online | file drop + documented API pull | Public Accounting API query endpoint. |
| Service Fusion | file drop + documented API pull | Public REST API; the vendor offers it on the Pro plan. |
| FieldEdge | file drop only | The API is gated behind a partner program, so no pull is shipped. |
| Workiz | file drop + documented API pull | Public REST API v2 at `https://api.workiz.com/crm/api` (Bearer key; Developer API add-on). |
| ServiceTrade | file drop + documented API pull | Public REST API (OAuth2 bearer). |
| FieldPulse | file drop + documented API pull | Public REST API (`x-api-key`, token from FieldPulse support). |
| ServiceM8 | file drop + documented API pull | Public JSON REST API (`X-API-Key`). |
| Simpro | file drop + documented API pull | Public REST API per build; you set your build URL and company id. |
| Commusoft | file drop + documented API pull | Public REST API v2 (Bearer key); recall jobs link to their parent job. |
| Successware | file drop only | No public API documentation; integrations only through partners. |
| BuildOps | file drop only | API docs are invite-gated. |
| Kickserv | file drop + documented API pull | XML REST API (Basic auth with the employee API token; Premium plan), read by a small reader with no dependencies. |
| mHelpDesk | file drop only | No public API found. |
| Wintac | file drop only | Desktop software; export to CSV. |

Each platform also carries a mapping confidence: `documented`, `partial`, or `guessed`. Documented: FieldEdge, Workiz, ServiceTrade. Partial: FieldPulse, Kickserv, mHelpDesk, Simpro, and the platforms not re-checked in this pass. Guessed: Successware, BuildOps, Wintac. The desk platform list shows which mappers need a real shop export to confirm. Sources and details are in `data/inbound/README.md`.

Shop exports are supplied by each shop; none ship in this repo. Drop your own export into `data/inbound/<kind>/`, then run `npm run mapping:check -- <kind> <file>`. It reports the matched, unmatched, and missing required fields and writes a starter override to `data/runtime/<instanceId>/mappings/<kind>.json`. That file is local and gitignored, and it wins over the built-in mapper. Guessed mappings are confirmed by your export, not by this repo. See "Your own export" in `data/inbound/README.md`.

All of this is tested against fixtures only. **Not tested against a live tenant.** Each platform's `<kind>.writeback` goes through the approval gate. It is off by default and asks yes or no on every call. When no backend is configured, it returns `no-backend-configured`. It never reports a success that didn't happen. Run `npm run platforms` to list them.

## Local compliance, revenue, and ops modules (TR-MODULES-2026-10-19)

Each module reads a local file, `data/runtime/<instanceId>/<module>.json` (gitignored; examples in `data/runtime/*.json.example`), plus whatever admitted inbound rows already carry the data. Each one has a desk panel on `http://127.0.0.1:4174/`, a JSON route, and a read tool on the local MCP. Writes need their own permission and a yes from the operator on each call.

| Module | Desk route / read tool | Write permission |
| --- | --- | --- |
| Refrigerant log (EPA 608 / AIM Act) | `/api/refrigerant` · `trades_runtime_refrigerant` | `refrigerant.write` |
| Permits and inspections | `/api/permits` · `trades_runtime_permits` | `permits.write` |
| Maintenance agreements | `/api/agreements` · `trades_runtime_agreements` | `agreements.write` |
| Manufacturer warranty claims | `/api/warranty-claims` · `trades_runtime_warranty_claims` | `warranty_claims.write` |
| Truck stock vs tomorrow | `/api/truck-stock` · `trades_runtime_truck_stock` | `truck_stock.write` |
| Callback root cause | `/api/callbacks` · `trades_runtime_callbacks` | `callbacks.write` |

Refrigerant rules, as read on the eCFR on 2026-10-19:

- The leak rate is calculated per [40 CFR 82.152](https://www.ecfr.gov/current/title-40/chapter-I/subchapter-C/part-82/subpart-F/section-82.152).
- Section 608 leak repair covers ODS refrigerant at a full charge of 50 lb or more ([40 CFR 82.157](https://www.ecfr.gov/current/title-40/chapter-I/subchapter-C/part-82/subpart-F/section-82.157)).
- The AIM Act rule covers HFC refrigerant at a full charge of 15 lb or more, from 2026-01-01. It excludes residential and light-commercial AC ([40 CFR 84.106](https://www.ecfr.gov/current/title-40/chapter-I/subchapter-C/part-84/subpart-C/section-84.106)).
- Trigger rates are 20% for commercial refrigeration, 30% for industrial process, and 10% for comfort cooling and other appliances.

This is a record-keeping aid. It is not an EPA filing and not legal advice.

The modules never estimate a number:

- Revenue at risk uses only prices the shop supplies: a price on each agreement, or an optional plan price list (`settings.planPrices`). An agreement without either is counted as price unknown. The example prices are synthetic placeholders.
- Warranty filing windows show up only when the shop enters them.
- A van that was never counted is unknown, not zero.
- A callback links to its original job only through an explicit reference.

`live_backends` and `pilot_started` both stay false.

## Human operator desk

The desk is the human surface. The public Worker MCP stays a read-only bridge without this chrome. On the operator machine, the desk's loopback `POST /mcp` lets an agent request writes. Writes require operator approval; default off. See [Approval-gated writes](#approval-gated-writes).

```bash
npm run desk
# http://127.0.0.1:4174/
```

`npm run shadow:field` and `npm run shadow:office` print one local shadow read of that same desk snapshot. Both commands, and the desk page, read `data/runtime/<instanceId>/field-events.jsonl` (Clock in, Clock out, Start Meal, End Meal, Drive time home) and the job price record in `data/runtime/<instanceId>/job-prices.json` (typed part cost, labor, task fees, margin, locked discount). They do not keep a second event log. The AZTrades shell on this desk is Local Softwares only. live_backends false. pilot_started false. Not Field 1.0. This is not Office Softwares 1.0. ServiceTitan, Jobber, and other bring-your-own profiles are ingested read-only. Writes require operator approval; default off. SupplyHouse is a public GET when a number returns; the typed cost remains when unavailable (403 or no number); no order path. This read does not invent a price. Other named suppliers stay empty until a permitted account. The property card is company history only. Zillow, Redfin, and a county assessor are not connected until a permitted source. Local login: the first user is okayed; later users need higher approval. No ServiceTitan or Jobber write-back from this shell.

It binds to `127.0.0.1` only. The page shows job/completion charts, a capacity chart, a mission board and a tech board, a morning huddle, fulfillment progress, alerts, and scores. Callback calls, warranty calls, and a not-classified bucket sit on the metrics and the mission board. Each call row carries the classify reason when the export named a label, and says not classified when the export is silent. Filters are `?calls=callback`, `?calls=warranty`, and `?calls=not-classified` on the page, `/api/snapshot`, `/api/view`, `/api/receipt`, and the SSE stream. `/api/calls/week.json` is the trailing-week callback rate by trade lane. `/api/huddle` prints the morning huddle and `/api/huddle.json` is the same board as JSON. The huddle names trainingNeeded (severity and reason) from procedure observations. It is not a skill score. Part cost, department behavior, and truck counts are on the same page. `/api/stock` reads on-van and warehouse counts. Miles driven and drive performance sit beside a ranked employee and department performance board. `/api/drive` and `/api/performance` are the loopback JSON for those boards. An optional miles file is `data/runtime/<instanceId>/drive-miles.json` or `data/inbound/drive-miles.json`. A missing file stays unknown once a local export is admitted. The empty-folder desk labels a synthetic demo. That demo is not a company export and not a telematics feed. The rank is not a skill score and it does not set trainingNeeded. No GPS vendor is claimed. Work together lists positive collaboration from Chain D, cross-trade, and recognition flags and names who or which lane should pair or hand off for service techs when needed and for install. `/api/work-together` is that board. Employee friction rate sits on the same performance board and at `/api/friction`. It counts handoff failures, coordination flags, explicit callbacks, and delayed handoffs on this machine. A silent export stays unknown. Friction rank 1 is the highest known friction, not the best performance. It is not a hosted HR system and it does not set trainingNeeded. Those routes stay on this machine. Each score and pace band includes a short why. Current alert-rule hits export as JSON or CSV from `/api/alerts/digest.json` and `/api/alerts/digest.csv` on this machine. `/api/receipt` prints what blocked booking when a block is present, and says when nothing is blocking. [`TR-DESK-POLISH-2026-09-25`](specs/TR-DESK-POLISH-2026-09-25.txt) adds spacing and type, a light/dark theme stored in this browser (`trades-desk-theme`), a lane view, and a printable snapshot at `/api/receipt`. The lane is a slot count, or a known trade token when the export names one (`hvac`, `plumbing`, `electrical`, `sewer`, `cross-trades`). A city name is not a lane. No map is drawn. The snapshot is HTML the operator can print or save as PDF. It cites local receipt identifiers and does not include receipt bodies. Nothing on that page phones home. Scores use mission pace, the evidence trust band, verification (`UNVERIFIED`), and `recommendBlock`. Prediction confidence stays withheld on a BYO drop. The recorded synthetic shadow-day confidence appears only on the synthetic demo, labeled as a fixture. An empty inbound folder shows that synthetic demo. Dropping a file updates the next SSE tick (about 2s) and the label switches to BYO-admitted, or BYO-admitted synthetic drill when every file declares `synthetic: true`.

### Local alert rules (TR-ALERTS-2026-09-25)

The same scores drive local thresholds: capacity (open slots, only when a lane exists), late jobs (unfinished rows against the mission clock), trust-band (evidence-trust floor or a drop remembered on this machine), booking block (`recommendBlock`), and verification stall (the verification score stays `UNVERIFIED` or `CONFLICTED` for N minutes from the oldest observation). No accuracy percent is computed. A missing clock does not invent a stall. Blank open slots on a BYO desk do not invent a utilization percent.

Copy [`data/runtime/alerts.json.example`](data/runtime/alerts.json.example) to `data/runtime/<instanceId>/alerts.json` (gitignored). `data/inbound/local.json` may set `alertsPath` or an `alerts` object. The desk banner shows unacknowledged rules. The alerts panel shows active rules, history, and acknowledge. Acknowledge is a local POST on `127.0.0.1` and writes only `alert-state.json`. Optional hooks append a local JSONL file or POST to loopback (`127.0.0.1`, `localhost`, `::1`). Any other webhook host is refused. No phone-home.

### Inbound quality, alert stubs, and Option C start gate (TR-QUALITY-2026-09-27)

`/api/inbound-quality` and `/api/inbound-quality.txt` score ServiceTitan and ProBooks fragments already on this machine. The desk charts volume by sourceKind, checklist-score distribution, and top defect classes from that local report. Empty folders use a labeled synthetic fixture. The checklist is not an accuracy percent and not a live tenant pull. Files land at `data/runtime/<instanceId>/inbound-quality.json`, `.txt`, and `.jsonl`.

`/api/alert-actions` returns stubs only. A firing alert expands to a label, a rationale, the required human authority, and `refused: write-back`. The Human Authority Rule is on the panel. Stubs do not call ServiceTitan or ProBooks.

`/api/option-c-start-gate` lists the start conditions. Every gate stays blocked-until. Option C remains prep until a human operator starts a real pilot. Option D is out of scope. There is no cutover. The shipped catalog keeps `pilot_started` false. `live_backends` stays false. The panel does not start the pilot.

`/api/monitoring` is one desk view: local or demo tech and truck pins, time cards, a coverage livemap, right-tech suggestions, drive score cards, tech score cards, a dispatch-style call board, and KPI charts. Pins come from `data/runtime/<instanceId>/positions.json`, `data/inbound/positions.json`, or coordinates copied off a local miles file. Copy `data/runtime/positions.json.example`. An empty folder uses a labeled synthetic demo. A refused file is not replaced by that demo. Mile totals still ignore coordinates. The address map stays undrawn. This is not a live GPS feed and not a telematics vendor. The view recomputes when local files change. Monitoring only. The Human Authority Rule stays on the panel. Nothing writes back to ServiceTitan or ProBooks.

`/api/time-tracking` is the local time board: clocked time on the current call, elapsed, estimated remaining, and idle or travel segments. Copy `data/runtime/time-cards.json.example` to `data/runtime/<instanceId>/time-cards.json` or `data/inbound/time-cards.json`. The desk writes `time-tracking.json` and `time-tracking.jsonl` under `data/runtime/<instanceId>/`. A missing file stays empty once a local export is admitted. The empty-folder desk labels a synthetic demo. That demo is not a company timeclock and not a GPS feed.

`/api/coverage` is zip codes, counties, cities, and roads or highways, with on/off switches. Copy `data/runtime/coverage.json.example` to `data/runtime/<instanceId>/coverage.json` or `data/inbound/coverage.json`. Switches persist in `coverage-layers.json` on this machine (`POST /api/coverage/layers`). Counts are places, jobs, and techs from that local file. Not a live map-tile vendor. The address map stays undrawn.

`/api/right-tech` (and `/api/tech-fit`) ranks techs for an open or scheduled job from geolocation, estimated time remaining, and skill fit. Optional `?job=`. Suggestions only. No auto-dispatch. No write-back. Friction and heavy local drive minutes are flags. Geography is not the only factor.

The operator can turn boards, metrics, KPIs, techs, scores, charts, lanes, alerts, call columns, and mission measures on or off. Every box starts on. The choice is stored in this browser under `trades-desk-view` and is not sent off the machine. [`TR-DESK-VIEW-2026-09-27`](specs/TR-DESK-VIEW-2026-09-27.txt).

The same page is usable at about 375px. A sticky domain nav jumps to each board. Header links, monitor charts, and wide tables scroll inside the page instead of widening it. Theme, filters, acknowledge, the stub disclosure, print, and any `input`, `select`, or `textarea` are at least 44px tall, with safe-area padding. Wide-window Softwares card grids stay as they are. There is still no tenant data-entry form. [`TR-MOBILE-DESK-2026-09-27`](specs/TR-MOBILE-DESK-2026-09-27.txt). The public Worker cards are not part of this cut.

The public Worker may cite `npx tsx src/cli.ts desk` and `/local-desk` as install notes. It does not host the desk, the alert hooks, or tenant metrics. This repo does not deploy the Worker.

`npm run byo:admit-demo` is **operator-software proof** with synthetic fixtures under `test/fixtures/byo/`. It copies those fixtures into a temp inbound dir, admits via FragGate as `servicetitan` + `probooks`, hashes packets, writes isolate receipts under a temp `data/runtime/<id>/`, prints hashes, and proves wrapper ≠ VERIFIED while ST/ProBooks writes still throw. It is not a customer dump. The authoring node is not a data custodian.

Real user exports belong only on that user's machine under `data/inbound/{servicetitan,probooks,trades-app}/` (gitignored except `.gitkeep`).

Inherited names come only from [`specs/aziel-runtime-inheritance.txt`](specs/aziel-runtime-inheritance.txt). This is not a wholesale copy of aziel-runtime Softwares.

## Ladder (honest)

| Option | Meaning | State |
| --- | --- | --- |
| A | Merge-only | done |
| B | Local spine | done in software |
| C | One-branch shadow | **code-ready / pilot not started** |
| D | Advise-lock pilot | **not started** |

Software for Option C exists (named branch, engagement rules, sealed settlement harness, synthetic demo). That is **not** a company or field pilot. Do not tell a GM the company OS is live. Do not fake Option C as a live company pilot. Option D is still NO.

[`TR-OPTION-C-PREP-2026-09-25`](specs/TR-OPTION-C-PREP-2026-09-25.txt) is the operator-box checklist: local install, inbound drop folders, example config, synthetic admit, desk and alerts, SHADOW-SEALED expectations, refuse-write proof, and what not to do. `npm run pilot:prep` runs those checks and prints a receipt. `ready: true` means the machine passed. That receipt keeps `pilot_started` false. The command does not open a sealed day against company actuals and does not write to ServiceTitan, ProBooks, or a trades app.

[`TR-OPTION-C-PILOT-RUNBOOK-2026-10-02`](specs/TR-OPTION-C-PILOT-RUNBOOK-2026-10-02.txt) is how an operator starts a real pilot with the shipped command. After prep is green, a person on the operator box runs `npm run pilot:start -- --branch <branchId>` (CLI `pilot-start`). One named branch is required. The command reuses the prep checks. It refuses a missing or bad branch, prep that is not ready, and `--claim-company` when inbound is empty or only synthetic. Success writes `data/runtime/<instanceId>/pilot.json` and a line on `receipts.jsonl` for that isolate only. The shipped catalog, default health, `glama.json`, and the giveaway Worker pin stay `1.0.0` with `pilot_started` false. Mode stays SHADOW-SEALED. `live_backends` stays false. Writes require operator approval; default off. An explicit mode change does not start the pilot. The receipt says this is not a live company OS, not Field 1.0, and not Office Softwares 1.0. Merging this documentation does not start a pilot. A human must run the command on a real prep-ready branch. [`TR-PILOT-START-2026-10-02`](specs/TR-PILOT-START-2026-10-02.txt) is the cut that shipped the command. This repository does not deploy the Worker and does not Make Release.

Still human/operator-only: a real ServiceTitan path on their box, a named GM, and sealed days against their actuals. The authoring node does not hold that dump. A prep receipt is not that pilot.

## Public giveaway Worker

Operator-authorized public surface is a Cloudflare Worker:

**https://trades-runtime.vibelock.workers.dev**

Worker script name: `trades-runtime` (same `vibelock` workers.dev account pattern as `aziel-runtime.vibelock.workers.dev`). Source: [`workers/giveaway/`](workers/giveaway/).

What it is:

- Human giveaway UI on this VibeLock host (browser / PWA): honesty, cite, MCP, skill, and stats, usable without downloading first
- Optional counted Apache-2.0 tarball at `GET /download` (increments only after a verified gzip 200)
- `/local-desk` cites the local `npx tsx src/cli.ts desk` install. It does not host tenant metrics or a live company board
- Thin read-only `/openapi.json` and `POST /mcp` for AI clients (health / stats / cite / skill only)
- Growth-ON crawl surfaces: `/robots.txt` (full Allow + Content-Signal), `/sitemap.xml`, `/ai.txt`, `/humans.txt`, `/.well-known/mcp.json`, `/person.jsonld`, `/graph.jsonld`
- Stdio MCP bridge for Glama / Claude Desktop / Cursor: `npm run mcp` → [`cli/mcp-stdio.mjs`](cli/mcp-stdio.mjs) (forwards to Worker `POST /mcp`)
- Honest Workers KV counters (`COUNTS`): `views` and `downloads` start at 0; increment only on successful 200 responses; no sampling, no seed, no inflation

### Deploy (operator / box with wrangler auth)

This repository does not deploy the Worker. First time on the `vibelock` account:

```bash
npm ci
npm test
cd workers/giveaway
npm ci
npx wrangler kv namespace create COUNTS
# paste the printed id into wrangler.jsonc kv_namespaces[0].id
npm run pack
npx wrangler deploy
```

Later deploys from repo root:

```bash
npm run giveaway:pack
cd workers/giveaway && npx wrangler deploy
```

Local smoke (Miniflare KV, no Cloudflare auth required):

```bash
npm run giveaway:pack
cd workers/giveaway
npx wrangler dev
# GET http://127.0.0.1:8787/  /download  /v1/health  /v1/stats  /robots.txt  /sitemap.xml  /ai.txt
```

Counters: see [`workers/giveaway/README.md`](workers/giveaway/README.md).

## Glama (Install Server pack)

Intended listing: **[Try on Glama](https://glama.ai/mcp/servers/AzielEliab/trades-runtime)**

The listing URL is documented so agents and humans can find it. The Git pack (`glama.json` + `Dockerfile` + `cli/mcp-stdio.mjs`) is what Glama needs to index and host a stdio process. **Install Server is not claimed LIVE from this git tree alone.** Steps: [`docs/GLAMA.md`](docs/GLAMA.md).

Do not invent Glama TDQS scores. The listing Latest matches the Softwares cite tip. That match is not Field 1.0 and not Office Softwares 1.0.

Checked 2026-10-02: Glama Latest/releaseVersion is 1.0.0 (`latestRelease.version` on https://glama.ai/mcp/servers/@AzielEliab/trades-runtime). The badge matches the Softwares cite tip. Local Softwares 1.0. That match is not a Field 1.0 claim and not Office Softwares 1.0. `glama.json` version is the in-repo claim file (1.0.0) and matches that badge. The Worker source in this repo is 1.0.0. The giveaway Worker version pin is 1.0.0. Checked 2026-09-28: the already-running Worker is still 0.4.12. This cut does not deploy and does not Make Release. pilot_started false. live_backends false.

Local / Docker:

```bash
npm run mcp
# or
node cli/mcp-stdio.mjs
docker build -t trades-runtime-mcp .
docker run --rm -i trades-runtime-mcp
```

## Pages (intentionally disabled)

GitHub Pages is **intentionally disabled**. There is no `.github/workflows/pages.yml`. Do not add a Pages deploy workflow. Do not enable Pages on the repository. Do not treat a github.io URL as a live product surface.

The software is free to clone. GitHub Pages stays off. Do not enable Pages. Do not add PDFs under `docs/`. A browser UI, if a Worker is already deployed, is https://trades-runtime.vibelock.workers.dev. This repository does not deploy that Worker. The counted tarball is optional.

Local UI preview (Pages stay off):

```bash
python3 -m http.server 4173 --directory docs
```

Machine catalog: [`docs/v1/runtime.json`](docs/v1/runtime.json). Module UI: `/modules/`.

## What this is not (§1.2)

Not a simple dispatch optimizer. Not a revenue-as-skill leaderboard. Not a fixed morning route planner. Not an autonomous black box that silently overrules humans. Not photo-as-proof of misconduct. Not fuel-first. Not an automatic 30-day callback penalty. Not a PDF portal.

## License

Apache License 2.0. See [LICENSE](LICENSE).
