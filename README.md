# Trades-Runtime

Private **TypeScript runtime** for a shadow-first AI operating system / company operating intelligence layer. Field trades: HVAC, plumbing, electrical, sewer, and cross-trades.

**Author / identity:** Aziel Eliab only  
**Version:** 0.3.0  
**Role:** `trades-runtime`  
**License:** Apache-2.0  
**Visibility:** this repository stays **private**  
**Status:** 0.3.0 lockstep with Property Intelligence v1.0 in-tree — live-pure core + honest stubs — **no** live ServiceTitan writes, Worker backends, DOIs, or production deployment

The product is the software in `src/`. `docs/` is a thin local catalog/UI. GitHub Pages stays **off** (`live_backends: false`). **PDFs are never published.** Implementer specs live at repo-root [`specs/`](specs/) (not under `docs/`).

Standing rule: every PDF Aziel sends is a spec to implement as coded software.

Paper trail: [`TR-AUDIT-2026-09-17`](specs/TR-AUDIT-2026-09-17.txt) · [`TR-CUT-2026-09-17`](specs/TR-CUT-2026-09-17.txt) · [`TR-BOT-2026-09-17`](specs/TR-BOT-2026-09-17.txt) (standing brief).

## Install, test, demo

```bash
npm install
npm test
npm run typecheck
npm run demo
npm run manifest
```

`npm test` runs constitutional rule tests including Human Authority, confidence≠truth, CrossTrade secondary-only routing, v0.2 recognition / pricebook lock / mission board / location economics, the 0.3.0 execution spine (FragGate inbound, durable receipts, `runAction`), and restart-replay of append-only JSONL receipts (`data/receipts.jsonl` or `{tmpdir}/tr-replay-*/receipts.jsonl`).

CI (`.github/workflows/ci.yml`) runs `npm ci`, `npm run typecheck`, and `npm test` on pull requests and pushes to `main`. Do not treat Pages deploy as the test gate.

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
| ServiceTitan shadow (read-only) | `src/spine/servicetitan-shadow.ts` | live-pure |
| Fulfillment state machine | `src/domain/fulfillment-machine.ts` | live-pure |
| Mission board clock | `src/domain/mission-board.ts` | live-pure |
| PI wired to jobs | `src/domain/property-jobs.ts` | live-pure |
| §18 freeze + v0.2 governing rules | `src/rules/constitution.ts` | live-pure |
| ServiceTitan / ProBooks live writes | — | refused |

Inherited names come only from [`specs/aziel-runtime-inheritance.txt`](specs/aziel-runtime-inheritance.txt). This is not a wholesale copy of aziel-runtime Softwares.

## Pages (off)

GitHub Pages stays **off**. `.github/workflows/pages.yml` is `workflow_dispatch` only so merges do not attempt deploy. Do not enable Pages. Do not treat a github.io URL as a live product surface.

Intended URL if Pages is later enabled (it is **not** enabled — TR-BOT-2026-09-17 / TR-AUDIT-2026-09-17):

**https://azieleliab.github.io/trades-runtime/**

Keep the repository private. Do not change visibility to public. Do not enable GitHub Pages. Do not add PDFs under `docs/`.

Local UI preview (Pages stay off):

```bash
python3 -m http.server 4173 --directory docs
```

Machine catalog: [`docs/v1/runtime.json`](docs/v1/runtime.json). Module UI: `/modules/`.

## What this is not (§1.2)

Not a simple dispatch optimizer. Not a revenue-as-skill leaderboard. Not a fixed morning route planner. Not an autonomous black box that silently overrules humans. Not photo-as-proof of misconduct. Not fuel-first. Not an automatic 30-day callback penalty. Not a PDF portal.

## License

Apache License 2.0. See [LICENSE](LICENSE).
