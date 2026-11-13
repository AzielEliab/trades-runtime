import { RUNTIME_MANIFEST } from "../manifest.js";
import { LOCAL_SOFTWARES_LABEL, LOCAL_SOFTWARES_TRACK } from "./local-softwares-gate.js";
import { readIsolatePilot } from "./pilot-isolate.js";

/**
 * Option C start-gate for a shop's own Field and Office 1.0.
 * Standing rows stay in force. Shop rows wait on this machine's pilot:start.
 * This module does not start a pilot and does not implement Option D or cutover.
 */

export const OPTION_C_START_CLAIM =
  "Field Softwares 1.0 and Office Softwares 1.0 are ready for a shop to implement on this machine. Option C remains prep on the public catalog until that shop runs npm run pilot:start -- --branch <branchId> here. This panel does not start it. There is no central operator pilot. Option D is out of scope. No cutover automation is on this desk. live_backends stays false unless this shop configured its own local backends. Not a live company OS.";

export type OptionCGateState = "standing" | "shop-starts" | "shop-started";

export interface OptionCStartGateItem {
  id: string;
  label: string;
  detail: string;
  state: OptionCGateState;
  required: true;
}

export interface OptionCStartGate {
  product: "trades-runtime";
  product_label: typeof LOCAL_SOFTWARES_LABEL;
  track: typeof LOCAL_SOFTWARES_TRACK;
  author: "Aziel Eliab";
  version: string;
  field_claim: false;
  field_softwares_1_0: "ready" | "shop-local";
  office_softwares_1_0: "ready" | "shop-local";
  implementation: "shop-self-serve";
  central_operator_pilot: false;
  company_os_live: false;
  generatedAt: string;
  live_backends: false;
  writes: false;
  phoneHome: false;
  pages: "off";
  pilot_started: boolean;
  pilotMayStart: false;
  pilot: "not-started" | "started-local-isolate";
  optionC: "prep-only" | "started-local-isolate";
  branch_id?: string;
  optionD: "out-of-scope";
  cutover: false;
  shadow: true;
  local: true;
  claim: string;
  gates: OptionCStartGateItem[];
}

const GATE_COPY: readonly (Omit<OptionCStartGateItem, "state" | "required"> & { role: "standing" | "shop" })[] = [
  {
    id: "operator-box",
    role: "shop",
    label: "This shop's machine is the only host",
    detail:
      "Node.js 20 or newer on the shop machine. npm test and typecheck are that shop's check. This panel does not run them and does not start the shop."
  },
  {
    id: "byo-inbound",
    role: "shop",
    label: "Inbound stays a local read-only drop",
    detail:
      "ServiceTitan and ProBooks files, if the operator places any, live under data/inbound on this machine. data/tenants is refused. Empty folders stay empty."
  },
  {
    id: "credentials-local",
    role: "standing",
    label: "Credentials and tenant data stay local",
    detail: "Nothing is copied to the authoring node, GitHub Pages, or the public Worker."
  },
  {
    id: "live-backends-false",
    role: "standing",
    label: "Public live_backends stays false",
    detail:
      "The public demo has no shop backends. live_backends is true only on a shop machine that configured its own local backends. No hosted company OS and no tenant data on the public Worker."
  },
  {
    id: "writes-refused",
    role: "standing",
    label: "ServiceTitan and ProBooks writes require operator approval; default off",
    detail: "Direct POST, PUT, and PATCH still throw. Write-back runs only through the approval gate after an operator yes, and only with a locally configured backend. A visible checklist is not a write client."
  },
  {
    id: "shadow-sealed",
    role: "standing",
    label: "Mode stays SHADOW-SEALED until a human changes it",
    detail: "Auto-promote throws. An explicit mode change still does not set pilotStarted. Field launch stays false."
  },
  {
    id: "human-authority",
    role: "standing",
    label: "Human authority wins",
    detail: "A recommendation is not an order, a ticket, or a dispatch write. Human authority wins."
  },
  {
    id: "pages-off",
    role: "standing",
    label: "GitHub Pages stays off",
    detail: "No Pages workflow. docs/ is a local catalog."
  },
  {
    id: "no-invented-pilot",
    role: "standing",
    label: "No invented pilot result",
    detail: "No accuracy percent, no named GM result, and no sealed days against company actuals are claimed here."
  },
  {
    id: "human-starts-pilot",
    role: "shop",
    label: "This shop starts its own Field and Office 1.0",
    detail:
      "The shop runs npm run pilot:start -- --branch <branchId> on this machine. There is no central operator pilot. This panel does not flip the gate. A mode change does not flip it."
  }
];

const ISOLATE_GATE_CLAIM =
  "This shop started Field Softwares 1.0 and Office Softwares 1.0 on this isolate. Self-serve. This panel did not start it. Option D is out of scope. No cutover automation is on this desk. Not a live company OS. live_backends stays false unless this shop configured its own local backends.";

export function optionCStartGate(now: string, options?: { cwd?: string; instanceId?: string }): OptionCStartGate {
  const gate = catalogStartGate(now);
  if (!options?.cwd) return gate;
  const record = readIsolatePilot(options.cwd, options.instanceId);
  if (!record) return gate;
  return {
    ...gate,
    pilot_started: true,
    field_softwares_1_0: "shop-local",
    office_softwares_1_0: "shop-local",
    pilot: "started-local-isolate",
    optionC: "started-local-isolate",
    claim: ISOLATE_GATE_CLAIM,
    branch_id: record.branchId,
    gates: gateRows(true)
  };
}

function catalogStartGate(now: string): OptionCStartGate {
  return {
    product: "trades-runtime",
    product_label: LOCAL_SOFTWARES_LABEL,
    track: LOCAL_SOFTWARES_TRACK,
    author: "Aziel Eliab",
    version: RUNTIME_MANIFEST.version,
    field_claim: false,
    field_softwares_1_0: "ready",
    office_softwares_1_0: "ready",
    implementation: "shop-self-serve",
    central_operator_pilot: false,
    company_os_live: false,
    generatedAt: now,
    live_backends: false,
    writes: false,
    phoneHome: false,
    pages: "off",
    pilot_started: false,
    pilotMayStart: false,
    pilot: "not-started",
    optionC: "prep-only",
    optionD: "out-of-scope",
    cutover: false,
    shadow: true,
    local: true,
    claim: OPTION_C_START_CLAIM,
    gates: gateRows(false)
  };
}

function gateRows(started: boolean): OptionCStartGateItem[] {
  return GATE_COPY.map((gate) => ({
    id: gate.id,
    label: gate.label,
    detail: gate.detail,
    state: gate.role === "standing" ? "standing" : started ? "shop-started" : "shop-starts",
    required: true as const
  }));
}
