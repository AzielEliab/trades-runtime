import { RUNTIME_MANIFEST } from "../manifest.js";
import { LOCAL_SOFTWARES_LABEL, LOCAL_SOFTWARES_TRACK } from "./local-softwares-gate.js";
import { readIsolatePilot } from "./pilot-isolate.js";

/**
 * Option C start-gate conditions for the local desk.
 * Prep only. Every gate stays blocked-until. This module does not start a pilot
 * and does not implement Option D or cutover.
 */

export const OPTION_C_START_CLAIM =
  "Option C remains prep until a human operator starts a real pilot. This panel does not start it. Option D is out of scope. No cutover automation is on this desk. Local Softwares 1.0 prep stays green and does not flip this gate.";

export interface OptionCStartGateItem {
  id: string;
  label: string;
  detail: string;
  state: "blocked-until";
  required: true;
}

export interface OptionCStartGate {
  product: "trades-runtime";
  product_label: typeof LOCAL_SOFTWARES_LABEL;
  track: typeof LOCAL_SOFTWARES_TRACK;
  author: "Aziel Eliab";
  version: string;
  field_claim: false;
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

const GATE_COPY: readonly Omit<OptionCStartGateItem, "state" | "required">[] = [
  {
    id: "operator-box",
    label: "Operator box is the only host",
    detail:
      "Node.js 20 or newer on the operator machine. npm test and typecheck are the operator's check. This panel does not run them and does not start a pilot."
  },
  {
    id: "byo-inbound",
    label: "Inbound stays a local read-only drop",
    detail:
      "ServiceTitan and ProBooks files, if the operator places any, live under data/inbound on this machine. data/tenants is refused. Empty folders stay empty."
  },
  {
    id: "credentials-local",
    label: "Credentials and tenant data stay local",
    detail: "Nothing is copied to the authoring node, GitHub Pages, or the public Worker."
  },
  {
    id: "live-backends-false",
    label: "live_backends stays false",
    detail: "No hosted company OS and no live tenant pull from this desk."
  },
  {
    id: "writes-refused",
    label: "ServiceTitan and ProBooks writes stay refused",
    detail: "POST, PUT, and PATCH still throw. A visible checklist is not a write client."
  },
  {
    id: "shadow-sealed",
    label: "Mode stays SHADOW-SEALED until a human changes it",
    detail: "Auto-promote throws. An explicit mode change still does not set pilotStarted. Field launch stays false."
  },
  {
    id: "human-authority",
    label: "Human authority wins",
    detail: "A recommendation is not an order, a ticket, or a dispatch write. Human authority wins."
  },
  {
    id: "pages-off",
    label: "GitHub Pages stays off",
    detail: "No Pages workflow. docs/ is a local catalog."
  },
  {
    id: "no-invented-pilot",
    label: "No invented pilot result",
    detail: "No accuracy percent, no named GM result, and no sealed days against company actuals are claimed here."
  },
  {
    id: "human-starts-pilot",
    label: "A named human must start the real pilot",
    detail:
      "Blocked on this panel until a human runs npm run pilot:start -- --branch <branchId> on this box. This panel does not flip the gate. A mode change does not flip it."
  }
];

const ISOLATE_GATE_CLAIM =
  "This isolate records a human Option C start. This panel did not start it. Option D is out of scope. No cutover automation is on this desk. Not Field 1.0. Not Office Softwares 1.0. Not a live company OS.";

export function optionCStartGate(now: string, options?: { cwd?: string; instanceId?: string }): OptionCStartGate {
  const gate = catalogStartGate(now);
  if (!options?.cwd) return gate;
  const record = readIsolatePilot(options.cwd, options.instanceId);
  if (!record) return gate;
  return {
    ...gate,
    pilot_started: true,
    pilot: "started-local-isolate",
    optionC: "started-local-isolate",
    claim: ISOLATE_GATE_CLAIM,
    branch_id: record.branchId
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
    gates: GATE_COPY.map((gate) => ({
      ...gate,
      state: "blocked-until" as const,
      required: true as const
    }))
  };
}
