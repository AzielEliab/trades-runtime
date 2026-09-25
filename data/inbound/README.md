# Local BYO inbound

TR-BYO-2026-09-17 and TR-DESK-2026-09-25. Each user incorporates **their own** ServiceTitan, **their own** ProBooks, and other trades-app exports into **this** runtime on **this** machine.

Authoring node / GitHub is **not** a data custodian. Do not send tenant dumps upstream. Do not add a hosted uploader. Do not phone home.

## Layout

| Path | What the user places |
| --- | --- |
| `data/inbound/servicetitan/` | Their ST export or read-only API pull (jobs, pricebook, equipment, customer, appointments). Named peer class. |
| `data/inbound/probooks/` | Their ProBooks books / items / costs / vendor files or read-only pull. Named peer class. |
| `data/inbound/trades-app/` | Other field-service exports in the same class: Jobber, Housecall Pro, Service Fusion, QuickBooks Online or Desktop-shaped books, generic CSV/JSON job boards. |
| `data/runtime/<instanceId>/` | Isolated receipts + ledger for this runtime instance only. |

Not `data/tenants/`. That word implies a hosted multi-tenant service.

The drop-in sniffs shape. A ServiceTitan-shaped or ProBooks-shaped file stays on that named peer even if it is dropped in `trades-app/`. Mapping profiles cover the vendors above. A new vendor with job, customer, appointment, or pricebook columns can use the generic JSON or CSV profile. There is no per-vendor paper required for that.

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

## Open the human desk

From the repo root, after `npm install`:

```bash
npm run desk
```

The desk listens on `http://127.0.0.1:4174/`. It reads these folders locally, draws charts from admitted rows or from the synthetic demo when the folders are empty, and labels which one you are seeing. It does not write back to ServiceTitan, ProBooks, or any trades app.

Synthetic (not customer) fixtures for `npm run drop-in:demo` and `npm run byo:admit-demo` live in `test/fixtures/byo/`. Those demos copy fixtures into a **temp** inbound dir. Do not commit real exports here.
