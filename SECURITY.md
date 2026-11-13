# Security policy

Supported version: **1.0.x** (current package pin `1.0.0`).

Releases before 1.0 are not supported.

## Security and privacy posture

Trades-Runtime is a local-first shadow runtime. The operator desk, inbound files, credentials, and approval decisions stay on the operator machine. This repository is not a data custodian and it does not phone home.

Public giveaway mode is the Worker at `https://trades-runtime.vibelock.workers.dev`. That surface is a human UI on the VibeLock host plus an optional counted tarball. It is not a hosted company OS and not a tenant host. In that public mode the cite and health documents keep:

- `pilot_started: false`
- `live_backends: false`
- `pages: "off"` (there is no GitHub Pages workflow, and Pages stays off)

The public Worker stores no tenant data. It does not perform ServiceTitan or ProBooks write-back. Its MCP and HTTP catalog routes are read-only. GitHub Pages is not a product surface.

Credentials are local only. No shop credential ships in this repository. Write-back to ServiceTitan, ProBooks, trades-app, or another configured backend runs only after a local operator approves that one call. Writes are off by default. The permission file defaults to selected mode with nothing enabled, which is the same as read-only. `autoApprove` is off by default and is ignored unless the operator has chosen all mode. An MCP caller cannot approve its own request. If no local backend is configured, the call returns `no-backend-configured` and does not report success.

The loopback operator desk (`npm run desk` on `127.0.0.1:4174`) is the human approval surface. `npm run approve` is the local CLI for the same gate.

## Reporting a vulnerability

Report privately. Do not open a public GitHub issue, discussion, or pull request that includes exploit details, proof-of-concept code, credentials, or shop or customer data.

- Email [collinhorton95@gmail.com](mailto:collinhorton95@gmail.com). This is Aziel Eliab's contact for this repository.
- Or open a [private GitHub security advisory](https://github.com/AzielEliab/trades-runtime/security/advisories/new) on `AzielEliab/trades-runtime`.

Include the version (`1.0.x`), whether you used the local desk, the CLI, or the public Worker, and the impact you observed. Redact secrets and customer or shop records. A report that only describes the public honesty flags (`pilot_started` false, `live_backends` false, Pages off, no tenant data on the Worker) is not a vulnerability.

## Out of scope

- Third-party shop exports a person supplies locally (ServiceTitan, ProBooks, trades-app, and other vendor files under `data/inbound/`). Those files stay on the operator machine. Defects in the vendor's product, or in the contents of an export the user chose to place there, are outside this repository.
- The public Worker is not a store for those exports and is not a custodian of them.
- Glama, the Official MCP Registry, Cloudflare's platform, and sister sites linked from the cite (`azieleliab.com`, `azielcorpuslibrary.net`, `godlock.uk`) are separate systems. Report those to their own operators unless trades-runtime's own code mishandles a response from them.
- A request to turn on `pilot_started`, `live_backends`, or Pages, or to deploy the Worker, is a product change. It is not a security report.
