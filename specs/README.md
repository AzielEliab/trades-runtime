# Trades-Runtime private specs (not published)

These text extracts drive implementation. Original PDFs stay offline / in chat attachments only — never serve PDFs from GitHub Pages.

Standing rule: every PDF becomes coded software (current, prior, future).

[`TR-OPTION-C-PREP-2026-09-25`](TR-OPTION-C-PREP-2026-09-25.txt) is the Option C BYO pilot prep checklist (0.4.3). It covers local install, inbound drop, synthetic admit, desk and alerts, SHADOW-SEALED expectations, refuse-write proof, and what not to do. `npm run pilot:prep` validates the operator box and prints a receipt with `pilot_started` false. It does not start a company pilot.

[`TR-ALERTS-2026-09-25`](TR-ALERTS-2026-09-25.txt) adds local alert rules on the operator desk (0.4.2): capacity, late jobs, trust-band, booking block, and verification stall. Thresholds live in a gitignored `data/runtime/<instanceId>/alerts.json` (example committed). In-desk banner, history, and acknowledge. File and loopback webhook hooks only. No phone-home. No accuracy percent.

[`TR-VENDOR-2026-09-25`](TR-VENDOR-2026-09-25.txt) adds named trades-app mapping profiles (ServiceM8, AccuLynx, SuccessWare, Xero, FieldEdge, ServiceTrade) on the 0.4.0 drop-in. Fingerprint match prefers the profile; otherwise the generic sniff remains. MEDIUM, `live:false`, `write:false`, UNVERIFIED. Wrapper ≠ verified.

[`TR-DESK-2026-09-25`](TR-DESK-2026-09-25.txt) adds the universal trades-app drop-in and the local human operator desk on top of the BYO laws. ServiceTitan and ProBooks stay named peers. The public Worker cites the desk install path and does not host tenant metrics.

[`TR-BYO-2026-09-17`](TR-BYO-2026-09-17.txt) amends [`TR-BOT-2026-09-17`](TR-BOT-2026-09-17.txt) §9 and [`TR-CUT-2026-09-17`](TR-CUT-2026-09-17.txt) R2–R3: BYO dual-source ingest on the user’s runtime, not a dump the authoring node runs.

[`TR-AUDIT-2026-09-18`](TR-AUDIT-2026-09-18.txt) is the post-merge operator audit (G1 orphan modules, G3 BYO admit proof, G5 Pages-off).

[`TR-AUDIT-2026-09-18B`](TR-AUDIT-2026-09-18B.txt) is the re-audit after 0.3.1 hygiene. Remaining H1 work is Option C software scaffolding (code-ready / pilot not started). Option D stays NO. Identity on exports is Aziel Eliab only (`IDENTITY.md`).
