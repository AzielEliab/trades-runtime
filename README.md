# Trades-Runtime

Private **TypeScript runtime** for a shadow-first AI operating system / company operating intelligence layer. Field trades: HVAC, plumbing, electrical, sewer, and cross-trades.

**Author / identity:** Aziel Eliab only. See [`IDENTITY.md`](IDENTITY.md). No legal name, home, or county on exports.  
**Version:** 0.4.5  
**Role:** `trades-runtime`  
**License:** Apache-2.0  
**Visibility:** this repository stays **private**; public get is the giveaway Worker  
**Public Worker (if deployed):** https://trades-runtime.vibelock.workers.dev  
**Try on Glama (intended listing):** https://glama.ai/mcp/servers/AzielEliab/trades-runtime — pack is in-repo (`glama.json`, `Dockerfile`, `cli/mcp-stdio.mjs`). Do **not** treat Install Server as LIVE until a Glama admin Deploy + Make Release succeeds. Public Glama listing Version is **0.3.4** and Latest is **pre-0.4.4**. That badge is not this repo's 0.4.5 and not the Worker. See [`docs/GLAMA.md`](docs/GLAMA.md).  
**Status:** 0.4.5 local callback and warranty counts, alert-digest export, score explanations, and booking-block receipt (**pilot not started**) — 0.4.4 local operator desk polish (theme, lane view, printable snapshot; **pilot not started**) — 0.4.3 Option C BYO pilot prep (local runbook + `npm run pilot:prep`; **pilot not started**) — 0.4.2 local alert rules on the operator desk — 0.4.1 named trades-app vendor profiles on the 0.4.0 universal drop-in — lockstep with Property Intelligence v1.0 in-tree — live-pure core + honest stubs — **BYO** local ServiceTitan + ProBooks + trades-app inbound — **no** live writes, tenant data, ST/ProBooks write-back, phone-home, DOIs, hosted uploader, or production company-OS claim — **Option C code-ready / pilot not started** — **Option D not started**

The product is the software in `src/`. `docs/` is a thin local catalog/UI. GitHub Pages is **intentionally disabled** (`live_backends: false`). There is no Pages workflow. **PDFs are never published.** Implementer specs live at repo-root [`specs/`](specs/) (not under `docs/`).

Standing rule: every PDF Aziel sends is a spec to implement as coded software.

Paper trail: [`TR-CALLS-2026-09-26`](specs/TR-CALLS-2026-09-26.txt) (callback and warranty counts, alert digest, score why, booking-block receipt; pilot not started) · [`TR-DESK-POLISH-2026-09-25`](specs/TR-DESK-POLISH-2026-09-25.txt) (local desk polish; pilot not started) · [`TR-OPTION-C-PREP-2026-09-25`](specs/TR-OPTION-C-PREP-2026-09-25.txt) (Option C box prep; pilot not started) · [`TR-ALERTS-2026-09-25`](specs/TR-ALERTS-2026-09-25.txt) (local alert rules) · [`TR-VENDOR-2026-09-25`](specs/TR-VENDOR-2026-09-25.txt) (named vendor profiles) · [`TR-DESK-2026-09-25`](specs/TR-DESK-2026-09-25.txt) (universal drop-in + local human desk) · [`TR-AUDIT-2026-09-18C`](specs/TR-AUDIT-2026-09-18C.txt) · [`TR-AUDIT-2026-09-18B`](specs/TR-AUDIT-2026-09-18B.txt) · [`TR-AUDIT-2026-09-18`](specs/TR-AUDIT-2026-09-18.txt) · [`TR-AUDIT-2026-09-17`](specs/TR-AUDIT-2026-09-17.txt) · [`TR-CUT-2026-09-17`](specs/TR-CUT-2026-09-17.txt) · [`TR-BOT-2026-09-17`](specs/TR-BOT-2026-09-17.txt) (standing brief) · [`TR-BYO-2026-09-17`](specs/TR-BYO-2026-09-17.txt) (amends TR-BOT §9 and TR-CUT R2–R3).

## Install, test, demo

```bash
npm install
npm test
npm run typecheck
npm run demo
npm run byo:admit-demo
npm run drop-in:demo
npm run desk
npm run pilot:prep
npm run health:local
npm run shadow:sealed-demo
npm run manifest
npm run mcp
```

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
| Pricebook (ST shadow + LOCK) | `src/domain/pricebook.ts` | live-pure |
| Truck stock / fulfillment | `src/domain/truck-stock.ts` | live-pure |
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
| ServiceTitan shadow (read-only) | `src/spine/servicetitan-shadow.ts` | live-pure |
| ProBooks shadow (read-only, peer inbound) | `src/spine/probooks-shadow.ts` | live-pure |
| Local BYO inbound layout | `src/spine/inbound-layout.ts` | live-pure |
| Local inbound config (no cloud account) | `src/spine/local-inbound-config.ts` | live-pure |
| Universal trades-app drop-in | `src/spine/drop-in.ts` | live-pure |
| Trades-app shadow (read-only) | `src/spine/trades-app-shadow.ts` | live-pure |
| Local human operator desk | `src/desk/` | live-pure |
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
| ServiceTitan / ProBooks live writes | — | refused |

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

ServiceTitan and ProBooks stay named peer classes. A third inbound class, `trades-app`, admits the same family of exports without a new paper for each vendor. The drop-in sniffs JSON/CSV shape and applies a mapping profile. 0.4.1 prefers a named profile when keys, headers, or the filename match: Jobber, Housecall Pro, Service Fusion, QuickBooks Online, QuickBooks Desktop, ServiceM8, AccuLynx, SuccessWare, Xero, FieldEdge, and ServiceTrade. Otherwise it uses generic JSON or generic CSV. A file that still looks like ServiceTitan or ProBooks stays on that peer class. See [`TR-VENDOR-2026-09-25`](specs/TR-VENDOR-2026-09-25.txt).

```bash
npm run drop-in:demo
```

That demo copies synthetic fixtures from `test/fixtures/byo/` into a temp inbound tree, admits them through FragGate, hashes packets, writes temp isolate receipts, and proves writes still throw. It is not a customer dump.

Real exports stay in the gitignored drop folders. `data/inbound/local.json` (copied from `local.json.example`) may name paths and read-endpoint hints. Hints are documentation for the operator. This process does not fetch them.

## Human operator desk

The desk is the human surface. Agent MCP stays a read-only bridge without this chrome.

```bash
npm run desk
# http://127.0.0.1:4174/
```

It binds to `127.0.0.1` only. The page shows job/completion charts, a capacity chart, a mission board and a tech board, fulfillment progress, alerts, and scores. Callback calls, warranty calls, and a not-classified bucket sit on the metrics and the mission board. Each score and pace band includes a short why. Current alert-rule hits export as JSON or CSV from `/api/alerts/digest.json` and `/api/alerts/digest.csv` on this machine. `/api/receipt` prints what blocked booking when a block is present, and says when nothing is blocking. [`TR-DESK-POLISH-2026-09-25`](specs/TR-DESK-POLISH-2026-09-25.txt) adds spacing and type, a light/dark theme stored in this browser (`trades-desk-theme`), a lane view, and a printable snapshot at `/api/receipt`. The lane is a slot count, or a known trade token when the export names one (`hvac`, `plumbing`, `electrical`, `sewer`, `cross-trades`). A city name is not a lane. No map is drawn. The snapshot is HTML the operator can print or save as PDF. It cites local receipt identifiers and does not include receipt bodies. Nothing on that page phones home. Scores use mission pace, the evidence trust band, verification (`UNVERIFIED`), and `recommendBlock`. Prediction confidence stays withheld on a BYO drop. The recorded synthetic shadow-day confidence appears only on the synthetic demo, labeled as a fixture. An empty inbound folder shows that synthetic demo. Dropping a file updates the next SSE tick (about 2s) and the label switches to BYO-admitted, or BYO-admitted synthetic drill when every file declares `synthetic: true`.

### Local alert rules (TR-ALERTS-2026-09-25)

The same scores drive local thresholds: capacity (open slots, only when a lane exists), late jobs (unfinished rows against the mission clock), trust-band (evidence-trust floor or a drop remembered on this machine), booking block (`recommendBlock`), and verification stall (the verification score stays `UNVERIFIED` or `CONFLICTED` for N minutes from the oldest observation). No accuracy percent is computed. A missing clock does not invent a stall. Blank open slots on a BYO desk do not invent a utilization percent.

Copy [`data/runtime/alerts.json.example`](data/runtime/alerts.json.example) to `data/runtime/<instanceId>/alerts.json` (gitignored). `data/inbound/local.json` may set `alertsPath` or an `alerts` object. The desk banner shows unacknowledged rules. The alerts panel shows active rules, history, and acknowledge. Acknowledge is a local POST on `127.0.0.1` and writes only `alert-state.json`. Optional hooks append a local JSONL file or POST to loopback (`127.0.0.1`, `localhost`, `::1`). Any other webhook host is refused. No phone-home.

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

[`TR-OPTION-C-PREP-2026-09-25`](specs/TR-OPTION-C-PREP-2026-09-25.txt) is the operator-box checklist: local install, inbound drop folders, example config, synthetic admit, desk and alerts, SHADOW-SEALED expectations, refuse-write proof, and what not to do. `npm run pilot:prep` runs those checks and prints a receipt. `ready: true` means the machine passed. `pilot_started` stays `false`. The command does not open a sealed day against company actuals and does not write to ServiceTitan, ProBooks, or a trades app.

Still human/operator-only: a real ServiceTitan path on their box, a named GM, and sealed days against their actuals. The authoring node does not hold that dump. A prep receipt is not that pilot.

## Public giveaway Worker

Operator-authorized public surface is a Cloudflare Worker:

**https://trades-runtime.vibelock.workers.dev**

Worker script name: `trades-runtime` (same `vibelock` workers.dev account pattern as `aziel-runtime.vibelock.workers.dev`). Source: [`workers/giveaway/`](workers/giveaway/).

What it is:

- Human landing + counted Apache-2.0 tarball download
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

The listing URL is documented so agents and humans can find it. The Git pack (`glama.json` + `Dockerfile` + `cli/mcp-stdio.mjs`) is what Glama needs to index and host a stdio process. **Install Server is not LIVE until GitBaby / TradesBot (or a human signed in as `AzielEliab`) finish Glama admin: Score claim → Deploy → Make Release.** That cannot be done from git alone. Steps: [`docs/GLAMA.md`](docs/GLAMA.md).

Do not invent Glama TDQS scores. Do not claim the listing is already live.

Public Glama listing Version is 0.3.4 and Latest is pre-0.4.4. Do not cite that badge as 0.4.4 or 0.4.5. `glama.json` version is the in-repo claim file (0.4.5). The Worker source in this repo is 0.4.5. The Worker already deployed is 0.4.4 until this source is deployed. Those are separate surfaces.

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

Keep the repository private. Do not change visibility to public. Public get is the Worker download. Do not enable GitHub Pages. Do not add PDFs under `docs/`.

Local UI preview (Pages stay off):

```bash
python3 -m http.server 4173 --directory docs
```

Machine catalog: [`docs/v1/runtime.json`](docs/v1/runtime.json). Module UI: `/modules/`.

## What this is not (§1.2)

Not a simple dispatch optimizer. Not a revenue-as-skill leaderboard. Not a fixed morning route planner. Not an autonomous black box that silently overrules humans. Not photo-as-proof of misconduct. Not fuel-first. Not an automatic 30-day callback penalty. Not a PDF portal.

## License

Apache License 2.0. See [LICENSE](LICENSE).
