import { RUNTIME_MANIFEST } from "../manifest.js";

/**
 * Track L gate for installable Local Softwares 1.0.
 * Green items are true in this tree. Open items are still unfinished for that
 * local label. Blocked items are Track F and stay out of this cut.
 * This module does not flip pilot_started or live_backends.
 */

export const LOCAL_SOFTWARES_LABEL = "Local Softwares 1.0" as const;
export const LOCAL_SOFTWARES_TRACK = "L" as const;

/** Already-running giveaway Worker, checked 2026-09-28. This cut does not deploy. */
export const OBSERVED_LIVE_WORKER_VERSION = "0.4.12" as const;
export const OBSERVED_LIVE_WORKER_CHECKED = "2026-09-28" as const;

export type LocalSoftwaresGateState = "green" | "open" | "blocked";

export interface LocalSoftwaresGateItem {
  id: string;
  state: LocalSoftwaresGateState;
  label: string;
  detail: string;
}

export interface LocalSoftwaresGate {
  product: "trades-runtime";
  product_label: typeof LOCAL_SOFTWARES_LABEL;
  version: string;
  track: typeof LOCAL_SOFTWARES_TRACK;
  author: "Aziel Eliab";
  identity: "Aziel Eliab";
  live_backends: false;
  pilot_started: false;
  field_launch: false;
  field_claim: false;
  company_os_live: false;
  pages: "off";
  glama_make_release: false;
  observed_live_worker_version: typeof OBSERVED_LIVE_WORKER_VERSION;
  observed_live_worker_checked: typeof OBSERVED_LIVE_WORKER_CHECKED;
  claim: string;
  items: LocalSoftwaresGateItem[];
}

const CLAIM =
  "Local Softwares 1.0 is the installable product label. It is not a Field 1.0 claim and it is not a live company OS. pilot_started stays false. live_backends stays false. Track F stays blocked until a human starts a real Option C pilot.";

const ITEMS: readonly LocalSoftwaresGateItem[] = [
  {
    id: "common-commands",
    state: "green",
    label: "Common commands are on the local CLI",
    detail: "help, softwares, version, and health (an alias of health-local) are already in the tree from 0.4.12."
  },
  {
    id: "plain-softwares-list",
    state: "green",
    label: "Plain Softwares list",
    detail:
      "softwares prints each module as a slug, a status, and one line. The lead matches the VibeLock-first giveaway: humans use the Worker UI without downloading first."
  },
  {
    id: "vibelock-worker-ui",
    state: "green",
    label: "VibeLock-first giveaway UI",
    detail:
      "The public giveaway leads with the Worker UI on the VibeLock host. The counted pack is optional. The operator desk still installs on the operator machine."
  },
  {
    id: "option-c-prep",
    state: "green",
    label: "Option C prep is code-ready",
    detail:
      "npm run pilot:prep checks the operator box and prints a receipt with pilot_started false. It does not start the pilot. Ladder: A done, B done-in-software, C code-ready / pilot not started."
  },
  {
    id: "cite-lockstep",
    state: "green",
    label: "Cite lockstep in this repo",
    detail:
      "package.json, the runtime manifest, glama.json, and the giveaway Worker source pin share one version. glama.json is the in-repo claim file. It is not the public Glama badge."
  },
  {
    id: "honesty-flags",
    state: "green",
    label: "Honesty flags stay off",
    detail:
      "live_backends false. pilot_started false. field_launch false. Pages off. ServiceTitan and ProBooks writes stay refused. No fake telematics and no hosted analytics."
  },
  {
    id: "desk-kept",
    state: "green",
    label: "Desk Softwares stay",
    detail: "Prior desk features stay. This cut is gate, polish, and surface lockstep. It does not freeze-break into Track F."
  },
  {
    id: "suite-card",
    state: "green",
    label: "AZInterface suite card is in this repo",
    detail:
      "The card is a suite shell entry for this separate package. FragGate door is none. fraggate_call does not execute this product. The live AZInterface catalog is a different surface."
  },
  {
    id: "glama-parked",
    state: "green",
    label: "Glama stays parked",
    detail: "No Make Release in this cut. The claim-file pin moves with the repo. The public badge is not treated as this version."
  },
  {
    id: "pages-off",
    state: "green",
    label: "Pages stay off",
    detail: "No Pages workflow. docs/ remains a local catalog."
  },
  {
    id: "live-worker-deploy",
    state: "open",
    label: "Already-running Worker is still the previous pin",
    detail:
      "Checked 2026-09-28: https://trades-runtime.vibelock.workers.dev/v1/health is still 0.4.12. This cut does not deploy. Do not cite that live Worker as 1.0.0-local."
  },
  {
    id: "glama-public-badge",
    state: "open",
    label: "Public Glama badge is still stale",
    detail:
      "Checked 2026-09-27: public Glama listing Version is 0.3.4 and Latest is pre-0.4.4 (releaseVersion 0.3.4). Parked. No Make Release."
  },
  {
    id: "azinterface-live-shell",
    state: "open",
    label: "Live AZInterface shell has not consumed this card",
    detail:
      "The card lives in this package. Checked 2026-09-28: GET https://aziel-runtime.vibelock.workers.dev/v1/software does not list trades-runtime as a suite row. Its sister cite was still 0.4.9. Open until that shell reads this card."
  },
  {
    id: "option-c-pilot",
    state: "blocked",
    label: "Option C pilot has not started",
    detail: "Blocked until an operator starts a real pilot (pilot_started true with real Option C). This checklist does not flip that flag."
  },
  {
    id: "option-d",
    state: "blocked",
    label: "Option D has not started",
    detail: "Advise-lock pilot is not started. Settlement path and Option D are separate Softwares waves."
  },
  {
    id: "field-1-0",
    state: "blocked",
    label: "Track F Field 1.0 is blocked",
    detail: "Field 1.0 waits on a real Option C pilot. It is not mixed into this Track L cut."
  }
];

export function localSoftwaresGate(): LocalSoftwaresGate {
  return {
    product: "trades-runtime",
    product_label: LOCAL_SOFTWARES_LABEL,
    version: RUNTIME_MANIFEST.version,
    track: LOCAL_SOFTWARES_TRACK,
    author: "Aziel Eliab",
    identity: "Aziel Eliab",
    live_backends: false,
    pilot_started: false,
    field_launch: false,
    field_claim: false,
    company_os_live: false,
    pages: "off",
    glama_make_release: false,
    observed_live_worker_version: OBSERVED_LIVE_WORKER_VERSION,
    observed_live_worker_checked: OBSERVED_LIVE_WORKER_CHECKED,
    claim: CLAIM,
    items: ITEMS.map((item) => ({ ...item }))
  };
}

export function plainSoftwaresLead(): string {
  return [
    `${RUNTIME_MANIFEST.product} — ${LOCAL_SOFTWARES_LABEL} (installable)`,
    `version ${RUNTIME_MANIFEST.version}. Author: ${RUNTIME_MANIFEST.author}.`,
    "Humans use the giveaway Worker UI on the VibeLock host without downloading first.",
    "This list is the installable local catalog. The operator desk still installs on this machine.",
    "Common commands: help, softwares, version, health.",
    "live_backends false. pilot_started false.",
    "Local Softwares 1.0 is not a Field 1.0 claim and it is not a live company OS."
  ].join("\n");
}
