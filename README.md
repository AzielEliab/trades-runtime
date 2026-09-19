# Trades-Runtime

Private **TypeScript runtime** for a shadow-first AI operating system / company operating intelligence layer. Field trades: HVAC, plumbing, electrical, sewer, and cross-trades.

**Author / identity:** Aziel Eliab only. See [`IDENTITY.md`](IDENTITY.md). No legal name, home, or county on exports.  
**Version:** 0.3.3  
**Role:** `trades-runtime`  
**License:** Apache-2.0  
**Visibility:** this repository stays **private**; public get is the giveaway Worker  
**Public Worker (if deployed):** https://trades-runtime.vibelock.workers.dev  
**Try on Glama (intended listing):** https://glama.ai/mcp/servers/AzielEliab/trades-runtime — pack is in-repo (`glama.json`, `Dockerfile`, `cli/mcp-stdio.mjs`). Do **not** treat Install Server as LIVE until a Glama admin Deploy + Make Release succeeds. See [`docs/GLAMA.md`](docs/GLAMA.md).  
**Status:** 0.3.3 public-giveaway cut — lockstep with Property Intelligence v1.0 in-tree — live-pure core + honest stubs — **BYO** local ServiceTitan + ProBooks inbound — **no** live writes, tenant data, ST/ProBooks write-back, DOIs, hosted uploader, or production company-OS claim — **Option C code-ready / pilot not started** — **Option D not started**

The product is the software in `src/`. `docs/` is a thin local catalog/UI. GitHub Pages is **intentionally disabled** (`live_backends: false`). There is no Pages workflow. **PDFs are never published.** Implementer specs live at repo-root [`specs/`](specs/) (not under `docs/`).

Standing rule: every PDF Aziel sends is a spec to implement as coded software.

Paper trail: [`TR-AUDIT-2026-09-18C`](specs/TR-AUDIT-2026-09-18C.txt) · [`TR-AUDIT-2026-09-18B`](specs/TR-AUDIT-2026-09-18B.txt) · [`TR-AUDIT-2026-09-18`](specs/TR-AUDIT-2026-09-18.txt) · [`TR-AUDIT-2026-09-17`](specs/TR-AUDIT-2026-09-17.txt) · [`TR-CUT-2026-09-17`](specs/TR-CUT-2026-09-17.txt) · [`TR-BOT-2026-09-17`](specs/TR-BOT-2026-09-17.txt) (standing brief) · [`TR-BYO-2026-09-17`](specs/TR-BYO-2026-09-17.txt) (amends TR-BOT §9 and TR-CUT R2–R3).

## Install, test, demo

```bash
npm install
npm test
npm run typecheck
npm run demo
npm run byo:admit-demo
npm run shadow:sealed-demo
npm run manifest
npm run mcp
```

`npm test` runs constitutional rule tests including Human Authority, confidence≠truth, CrossTrade secondary-only routing, v0.2 recognition / pricebook lock / mission board / location economics, the 0.3.3 execution spine (FragGate inbound, durable receipts, `runAction`), restart-replay of append-only JSONL receipts (`data/receipts.jsonl` or `{tmpdir}/tr-replay-*/receipts.jsonl`), the synthetic BYO admit demo, and Option C sealed-shadow scaffolding (no auto-promote, engagement drop-back, required settlement fields).

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
| Runtime isolate (per-instance receipts) | `src/spine/runtime-isolate.ts` | live-pure |
| Synthetic BYO admit demo | `src/demo/byo-admit.ts` | live-pure |
| Synthetic sealed-shadow demo | `src/demo/shadow-sealed.ts` | live-pure |
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
- `data/runtime/<instanceId>/receipts.jsonl` and `ledger.jsonl` — isolate per runtime instance

Not `data/tenants/` (that word implies a hosted multi-tenant service). Optional local config lists paths or read endpoints only — **no cloud account**. Tokens stay on the user’s machine or their sealed vault.

FragGate first-class `sourceKind` values: `servicetitan` (MEDIUM, hashed, `live:false` `write:false`), `probooks` (same), `operator-file` (LOW until origin tagged; still not truth), `human` (manager correction on Chain C with actor id). Wrapper ≠ verified. Scrape and silent promotion to VERIFIED are refused.

`npm run byo:admit-demo` is **operator-software proof** with synthetic fixtures under `test/fixtures/byo/`. It copies those fixtures into a temp inbound dir, admits via FragGate as `servicetitan` + `probooks`, hashes packets, writes isolate receipts under a temp `data/runtime/<id>/`, prints hashes, and proves wrapper ≠ VERIFIED while ST/ProBooks writes still throw. It is not a customer dump. The authoring node is not a data custodian.

Real user exports belong only on that user's machine under `data/inbound/{servicetitan,probooks}/` (gitignored except `.gitkeep`).

Inherited names come only from [`specs/aziel-runtime-inheritance.txt`](specs/aziel-runtime-inheritance.txt). This is not a wholesale copy of aziel-runtime Softwares.

## Ladder (honest)

| Option | Meaning | State |
| --- | --- | --- |
| A | Merge-only | done |
| B | Local spine | done in software |
| C | One-branch shadow | **code-ready / pilot not started** |
| D | Advise-lock pilot | **not started** |

Software for Option C exists (named branch, engagement rules, sealed settlement harness, synthetic demo). That is **not** a company or field pilot. Do not tell a GM the company OS is live. Do not fake Option C as a live company pilot. Option D is still NO.

Still human/operator-only: a real ServiceTitan path on their box, a named GM, and sealed days against their actuals. The authoring node does not hold that dump.

## Public giveaway Worker

Operator-authorized public surface is a Cloudflare Worker — **not** a hosted multi-tenant company OS:

**https://trades-runtime.vibelock.workers.dev**

Worker script name: `trades-runtime` (same `vibelock` workers.dev account pattern as `aziel-runtime.vibelock.workers.dev`). Source: [`workers/giveaway/`](workers/giveaway/).

What it is:

- Human landing + counted Apache-2.0 tarball download
- Thin read-only `/openapi.json` and `/mcp` for AI clients (health / stats / cite / skill only)
- Stdio MCP bridge for Glama / Claude Desktop / Cursor: `npm run mcp` → [`cli/mcp-stdio.mjs`](cli/mcp-stdio.mjs) (forwards to Worker `POST /mcp`)
- Honest Workers KV counters (`COUNTS`): `views` and `downloads` start at 0; increment only on successful 200 responses; no sampling, no seed, no inflation

What it is not:

- Not a ServiceTitan or ProBooks write API
- Not a central dump / hosted uploader / tenant store
- Not a production company OS claim (`live_backends: false`)
- Not GitHub Pages

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
# GET http://127.0.0.1:8787/  /download  /v1/health  /v1/stats
```

Counters: see [`workers/giveaway/README.md`](workers/giveaway/README.md).

## Glama (Install Server pack)

Intended listing: **[Try on Glama](https://glama.ai/mcp/servers/AzielEliab/trades-runtime)**

The listing URL is documented so agents and humans can find it. The Git pack (`glama.json` + `Dockerfile` + `cli/mcp-stdio.mjs`) is what Glama needs to index and host a stdio process. **Install Server is not LIVE until GitBaby / TradesBot (or a human signed in as `AzielEliab`) finish Glama admin: Score claim → Deploy → Make Release.** That cannot be done from git alone. Steps: [`docs/GLAMA.md`](docs/GLAMA.md).

Do not invent Glama TDQS scores. Do not claim the listing is already live.

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
