# Local BYO inbound

TR-BYO-2026-09-17. Each user incorporates **their own** ServiceTitan and **their own** ProBooks into **this** runtime on **this** machine.

Authoring node / GitHub is **not** a data custodian. Do not send tenant dumps upstream. Do not add a hosted uploader. Do not phone home.

## Layout

| Path | What the user places |
| --- | --- |
| `data/inbound/servicetitan/` | Their ST export or read-only API pull (jobs, pricebook, equipment, customer, appointments). |
| `data/inbound/probooks/` | Their ProBooks books / items / costs / vendor files or read-only pull. |
| `data/runtime/<instanceId>/` | Isolated receipts + ledger for this runtime instance only. |

Not `data/tenants/`. That word implies a hosted multi-tenant service.

## Law

- FragGate admits `servicetitan` and `probooks` as peer inbound (MEDIUM, hashed, `live:false`, `write:false`).
- `operator-file` stays LOW until origin is tagged. Still hashed. Still not truth.
- `human` manager corrections go on Chain C with actor id.
- Wrapper ≠ verified. No silent promotion to VERIFIED.
- No compiled ST or ProBooks POST/PUT/PATCH.
- Tokens and exports stay on this machine or a sealed local vault.
- No tenant data on GitHub Pages, Workers, or a shared demo.

Copy `local.json.example` to `local.json` if you want path / read-endpoint hints. That file is gitignored. There is no cloud account field.
