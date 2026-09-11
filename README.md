# Trades-Runtime

Private architecture portal for **Trades-Runtime**: a shadow-first AI operating system / company operating intelligence layer for large multi-branch HVAC, plumbing, electrical, sewer, and cross-trades field service.

**Author / identity:** Aziel Eliab only  
**Version:** 0.1.0  
**Role:** `trades-runtime`  
**License:** Apache-2.0  
**Visibility:** this repository stays **private**  
**Status:** design / not live — no Worker backends, DOIs, or production APIs

Trades-Runtime does **not** begin by replacing ServiceTitan or ProBooks. It first shadows them: observe → sealed counterfactual → compare to actual outcomes. Authorized humans always win operationally. Disagreements are preserved as evidence.

Design target (not a live claim): ~13–15 branches, 750+ employees, Midwest multi-trade. Primary integration posture: tether ServiceTitan + ProBooks / authorized systems first; read-only or recommendation until evidence supports more autonomy.

This is a sibling product to [aziel-runtime](https://github.com/AzielEliab/aziel-runtime), not a public Softwares suite and not a FragGate engine dump.

## Source of truth

The committed design pack lives under [`docs/specs/`](docs/specs/):

| File | Role |
| --- | --- |
| [`docs/specs/architecture-v0.1.txt`](docs/specs/architecture-v0.1.txt) | **Canonical** Architecture & Operating Design (includes later sections labeled through v0.2 expansions) |
| [`docs/specs/architecture-v0.1-14p.txt`](docs/specs/architecture-v0.1-14p.txt) | Earlier 14-page snapshot — historical only |
| [`docs/specs/addendum-v0.7.txt`](docs/specs/addendum-v0.7.txt) | Universal Analytics & Human Review |
| [`docs/specs/addendum-v0.8.txt`](docs/specs/addendum-v0.8.txt) | Workforce Capacity & Demand-Aware Scheduling |
| [`docs/specs/addendum-v0.9.txt`](docs/specs/addendum-v0.9.txt) | Multi-Fabric, Multi-Pipeline |
| [`docs/specs/source/`](docs/specs/source/) | Original PDFs |

Site pages under `docs/` are a human-readable portal over that pack. [`docs/v1/runtime.json`](docs/v1/runtime.json) is the machine-readable design catalog (engines/ops marked `design` / `planned`).

## What this is not (§1.2)

- Not a simple dispatch optimizer
- Not a leaderboard that equates revenue with technician quality
- Not a fixed morning route planner
- Not an autonomous black box that can silently overrule humans
- Not an AI that treats a photo inference as proof of fault or misconduct
- Not a fuel-minimization system that sacrifices technical fit or customer outcome
- Not a system that assumes a 30-day return visit is automatically a technician callback

Also: not a public marketing site, not aziel-runtime, not a production API.

## Repository layout

```
docs/                      GitHub Pages root
  index.html               Homepage (operating intelligence, not a stub catalog)
  architecture/            v0.1 overview
  operating-model/         Canonical live state + heartbeat
  chains/                  A Full-Day Trajectory, B Call-to-Call Ledger,
                           C Human Override / Recalibration
  shadow/                  Proof framework + deployment ladder
  rules/                   §18 freeze list
  dispatch/                Call-Fit / Van intelligence
  workforce/               Addendum v0.8
  fabrics/                 Addendum v0.9
  analytics/               Addendum v0.7
  specs/                   Specs library (txt + PDF)
  trades/                  HVAC, plumbing, electrical, sewer, cross-trades
  catalog/                 Renders /v1/runtime.json
  v1/runtime.json          Design catalog
  cite.json · llms.txt
  robots.txt               Disallow all indexing
.github/workflows/pages.yml
```

## How to view the private Pages site

Intended URL after Pages is enabled and `main` has deployed:

**https://azieleliab.github.io/trades-runtime/**

Keep the GitHub repository private. Do not change visibility to public.

### First-time Pages enable (repo owner)

1. Merge this site to `main` (or push `main` directly).
2. Open **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. Run the **Deploy GitHub Pages** workflow if it did not start on the merge.
5. If your plan supports it, set Pages **Visibility** to **Private** so only people with repo access can open the site while signed into GitHub.

Collaborators need read access to this private repo. Sign into GitHub, then open the Pages URL. If the site 404s, the workflow has not deployed yet or Pages is not set to GitHub Actions.

`docs/robots.txt` and `noindex` meta tags discourage crawlers. That is not access control. Prefer private Pages visibility when the plan allows it.

## Local preview

From the repo root:

```bash
python3 -m http.server 4173 --directory docs
```

Open http://127.0.0.1:4173/

No build step. Edit HTML/CSS/JSON in `docs/` and refresh.

## How to contribute locally

1. Keep the repo private.
2. Treat `docs/specs/architecture-v0.1.txt` as canonical; do not prefer the 14-page snapshot.
3. Change portal pages and `runtime.json` together when the architecture story changes.
4. Preview with the local server. Click architecture pages, specs links, trades, and catalog.
5. Do not add live Worker URLs, fake DOIs, or copied aziel-runtime engines. Do not claim production deployment.
6. Open a pull request. After merge, Pages deploys from `main`.

Author of record remains Aziel Eliab.

## License

Apache License 2.0. See [LICENSE](LICENSE).
