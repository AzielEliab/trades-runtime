# Trades-Runtime private specs (not published)

These text extracts drive implementation. Original PDFs stay offline / in chat attachments only — never serve PDFs from GitHub Pages.

Standing rule: every PDF becomes coded software (current, prior, future).

[`TR-FIELD-FLAGS-2026-09-27`](TR-FIELD-FLAGS-2026-09-27.txt) extends local alert rules: field techs raise flags the office sees on the local desk banner, panel, acknowledge, and digest. Flags stay under `data/runtime/<instanceId>/field-flags/`. The giveaway Worker is not an alert bus. aziel-runtime Softwares stay untouched. `pilot_started` stays false. It does not deploy.

[`TR-DRIVE-2026-09-27`](TR-DRIVE-2026-09-27.txt) is the 0.4.8 Softwares cut: local miles driven and drive performance from an optional read-only file, and an employee and department performance board ranked best to worst. A missing miles file stays unknown. The empty-folder desk shows a labeled synthetic demo only. There is no live telematics or GPS vendor claim. The rank is an operator board. It is not a skill score and it does not set trainingNeeded. The same cut tracks how employees work together from Chain D, cross-trade, and recognition flags, and shows an employee friction rate beside the ranked board. Suggestions name who or which lane should pair or hand off for service techs when needed and for install. A silent export stays unknown. Friction is not a hosted HR system and it does not set trainingNeeded. A synthetic demo is not a company export. It does not start the Option C pilot and does not deploy the Worker. Public Glama listing Version stays 0.3.4 / Latest pre-0.4.4. The Worker already deployed remains 0.4.5. A 0.4.7 redeploy is separately in flight. This source does not claim the public Worker is already 0.4.8.

[`TR-SOFTWARES-2026-09-27`](TR-SOFTWARES-2026-09-27.txt) is the 0.4.7 Softwares cut: current and last part cost with regional market adaptation, per-tech trainingNeeded, good and bad inter-department behavior flags, and countable on-van and warehouse stock in a local file. Recommendations stay subordinate to humans. Locked prices still refuse auto-recalibrate. Training is not a skill score. The last person is not blamed by default. It is not a hosted inventory ERP. It does not start the Option C pilot and does not deploy the Worker. Public Glama listing Version stays 0.3.4 / Latest pre-0.4.4. The Worker already deployed stays 0.4.5 until this source is deployed.

[`TR-HUDDLE-2026-09-26`](TR-HUDDLE-2026-09-26.txt) is the 0.4.6 desk cut: a per-call classify reason, callbacks / warranty / not-classified filters, a loopback weekly callback rate by trade lane, and a tech morning huddle. It does not start the Option C pilot and does not deploy the Worker. Public Glama listing Version stays 0.3.4 / Latest pre-0.4.4. The Worker already deployed stays 0.4.5 until this source is deployed.

[`TR-CALLS-2026-09-26`](TR-CALLS-2026-09-26.txt) is the 0.4.5 desk cut: callback and warranty counts on local calls, an exportable alert digest, plain-language score bands, and a booking-block lane on the printable receipt. It does not start the Option C pilot and does not deploy the Worker. Public Glama listing Version stays 0.3.4 / Latest pre-0.4.4.

[`TR-DESK-POLISH-2026-09-25`](TR-DESK-POLISH-2026-09-25.txt) polishes the local operator desk (0.4.4): mission and tech boards, a capacity or known-trade lane (not a map), a light/dark theme in browser storage, and a printable local snapshot. It does not start the Option C pilot and does not deploy the Worker.

[`TR-OPTION-C-PREP-2026-09-25`](TR-OPTION-C-PREP-2026-09-25.txt) is the Option C BYO pilot prep checklist (0.4.3). It covers local install, inbound drop, synthetic admit, desk and alerts, SHADOW-SEALED expectations, refuse-write proof, and what not to do. `npm run pilot:prep` validates the operator box and prints a receipt with `pilot_started` false. It does not start a company pilot.

[`TR-ALERTS-2026-09-25`](TR-ALERTS-2026-09-25.txt) adds local alert rules on the operator desk (0.4.2): capacity, late jobs, trust-band, booking block, and verification stall. Thresholds live in a gitignored `data/runtime/<instanceId>/alerts.json` (example committed). In-desk banner, history, and acknowledge. File and loopback webhook hooks only. No phone-home. No accuracy percent.

[`TR-VENDOR-2026-09-25`](TR-VENDOR-2026-09-25.txt) adds named trades-app mapping profiles (ServiceM8, AccuLynx, SuccessWare, Xero, FieldEdge, ServiceTrade) on the 0.4.0 drop-in. Fingerprint match prefers the profile; otherwise the generic sniff remains. MEDIUM, `live:false`, `write:false`, UNVERIFIED. Wrapper ≠ verified.

[`TR-DESK-2026-09-25`](TR-DESK-2026-09-25.txt) adds the universal trades-app drop-in and the local human operator desk on top of the BYO laws. ServiceTitan and ProBooks stay named peers. The public Worker cites the desk install path and does not host tenant metrics.

[`TR-BYO-2026-09-17`](TR-BYO-2026-09-17.txt) amends [`TR-BOT-2026-09-17`](TR-BOT-2026-09-17.txt) §9 and [`TR-CUT-2026-09-17`](TR-CUT-2026-09-17.txt) R2–R3: BYO dual-source ingest on the user’s runtime, not a dump the authoring node runs.

[`TR-AUDIT-2026-09-18`](TR-AUDIT-2026-09-18.txt) is the post-merge operator audit (G1 orphan modules, G3 BYO admit proof, G5 Pages-off).

[`TR-AUDIT-2026-09-18B`](TR-AUDIT-2026-09-18B.txt) is the re-audit after 0.3.1 hygiene. Remaining H1 work is Option C software scaffolding (code-ready / pilot not started). Option D stays NO. Identity on exports is Aziel Eliab only (`IDENTITY.md`).
