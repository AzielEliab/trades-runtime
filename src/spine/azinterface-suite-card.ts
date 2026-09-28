import { RUNTIME_MANIFEST } from "../manifest.js";
import {
  LOCAL_SOFTWARES_LABEL,
  LOCAL_SOFTWARES_TRACK,
  OBSERVED_LIVE_WORKER_CHECKED,
  OBSERVED_LIVE_WORKER_VERSION,
  plainSoftwaresLead
} from "./local-softwares-gate.js";

/**
 * AZInterface suite shell entry for trades-runtime.
 * The product stays this package. The card does not register a FragGate engine
 * and it does not nest trades-runtime into aziel-runtime.
 */

export interface AzInterfaceSuiteCard {
  ok: true;
  kind: "azinterface-suite-card";
  role: "suite-shell-entry";
  separate_package: true;
  nested_in_aziel_runtime: false;
  fraggate_engine: false;
  fraggate_call: false;
  software_tab: false;
  name: "Trades-Runtime";
  slug: "trades-runtime";
  product_label: typeof LOCAL_SOFTWARES_LABEL;
  version: string;
  track: typeof LOCAL_SOFTWARES_TRACK;
  author: "Aziel Eliab";
  identity: "Aziel Eliab";
  bucket: "plain";
  door: "none";
  status: "installable-local";
  fraggate_status: "separate-package";
  local_only: true;
  ui_port: 4174;
  ui_cmd: "npx tsx src/cli.ts desk";
  commands: readonly ["help", "softwares", "version", "health"];
  download_url: "https://trades-runtime.vibelock.workers.dev/download";
  worker_home: "https://trades-runtime.vibelock.workers.dev/";
  github: "https://github.com/AzielEliab/trades-runtime";
  cite: "https://trades-runtime.vibelock.workers.dev/cite.json";
  live_backends: false;
  pilot_started: false;
  field_claim: false;
  company_os_live: false;
  pages: "off";
  glama_make_release: false;
  observed_live_worker_version: typeof OBSERVED_LIVE_WORKER_VERSION;
  observed_live_worker_checked: typeof OBSERVED_LIVE_WORKER_CHECKED;
  one_line: string;
  lead: string;
  note: string;
}

const ONE_LINE =
  "Installable Local Softwares 1.0 for field trades. Humans use the VibeLock Worker UI without downloading first. The operator desk stays on the operator machine. live_backends false. pilot_started false.";

const NOTE =
  "Suite shell entry only. This product stays a separate package. AZInterface may show the card. fraggate_call does not execute it. Field 1.0 is not this card. pilot_started false. live_backends false.";

export function azInterfaceSuiteCard(): AzInterfaceSuiteCard {
  return {
    ok: true,
    kind: "azinterface-suite-card",
    role: "suite-shell-entry",
    separate_package: true,
    nested_in_aziel_runtime: false,
    fraggate_engine: false,
    fraggate_call: false,
    software_tab: false,
    name: "Trades-Runtime",
    slug: "trades-runtime",
    product_label: LOCAL_SOFTWARES_LABEL,
    version: RUNTIME_MANIFEST.version,
    track: LOCAL_SOFTWARES_TRACK,
    author: "Aziel Eliab",
    identity: "Aziel Eliab",
    bucket: "plain",
    door: "none",
    status: "installable-local",
    fraggate_status: "separate-package",
    local_only: true,
    ui_port: 4174,
    ui_cmd: "npx tsx src/cli.ts desk",
    commands: ["help", "softwares", "version", "health"],
    download_url: "https://trades-runtime.vibelock.workers.dev/download",
    worker_home: "https://trades-runtime.vibelock.workers.dev/",
    github: "https://github.com/AzielEliab/trades-runtime",
    cite: "https://trades-runtime.vibelock.workers.dev/cite.json",
    live_backends: false,
    pilot_started: false,
    field_claim: false,
    company_os_live: false,
    pages: "off",
    glama_make_release: false,
    observed_live_worker_version: OBSERVED_LIVE_WORKER_VERSION,
    observed_live_worker_checked: OBSERVED_LIVE_WORKER_CHECKED,
    one_line: ONE_LINE,
    lead: plainSoftwaresLead(),
    note: NOTE
  };
}
