# Trades-Runtime

Private **TypeScript runtime** for a shadow-first AI operating system / company operating intelligence layer. Field trades: HVAC, plumbing, electrical, sewer, and cross-trades.

**Author / identity:** Aziel Eliab only  
**Version:** 0.2.0  
**Role:** `trades-runtime`  
**License:** Apache-2.0  
**Visibility:** this repository stays **private**  
**Status:** live-pure core + honest stubs — **no** live ServiceTitan writes, Worker backends, DOIs, or production deployment

The product is the software in `src/`. GitHub Pages is a thin private UI over that runtime. **PDFs are never published on Pages.** Implementer specs live at repo-root [`specs/`](specs/) (not under `docs/`).

Standing rule: every PDF Aziel sends is a spec to implement as coded software.

## Install, test, demo

```bash
npm install
npm test
npm run typecheck
npm run demo
npm run manifest
```

`npm test` runs constitutional rule tests including Human Authority, confidence≠truth, and CrossTrade secondary-only routing.

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
| Comms / recognition / mission board | `src/domain/comms.ts` | live-pure |
| Pricebook / van stock / fulfillment | `src/domain/pricebook-stock.ts` | live-pure |
| Weather / demand / lunar (experimental) | `src/domain/weather-demand.ts` | live-pure |
| Maintenance routing (demand-first) | `src/domain/maintenance-routing.ts` | live-pure |
| §18 freeze + v0.2 governing rules | `src/rules/constitution.ts` | live-pure |
| ServiceTitan / ProBooks connectors | — | stub |

Inherited names come only from [`specs/aziel-runtime-inheritance.txt`](specs/aziel-runtime-inheritance.txt). This is not a wholesale copy of aziel-runtime Softwares.

## Private Pages (thin UI)

Intended URL after Pages is enabled and `main` has deployed:

**https://azieleliab.github.io/trades-runtime/**

Keep the repository private. Do not change visibility to public. Do not add PDFs under `docs/`.

### First-time Pages enable (repo owner)

1. Merge to `main`.
2. Settings → Pages → Source: **GitHub Actions**.
3. If the plan allows it, set Pages visibility to **Private**.

Local UI preview:

```bash
python3 -m http.server 4173 --directory docs
```

Machine catalog: [`docs/v1/runtime.json`](docs/v1/runtime.json). Module UI: `/modules/`.

## What this is not (§1.2)

Not a simple dispatch optimizer. Not a revenue-as-skill leaderboard. Not a fixed morning route planner. Not an autonomous black box that silently overrules humans. Not photo-as-proof of misconduct. Not fuel-first. Not an automatic 30-day callback penalty. Not a PDF portal.

## License

Apache License 2.0. See [LICENSE](LICENSE).
