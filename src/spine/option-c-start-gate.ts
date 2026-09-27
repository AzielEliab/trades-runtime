import { RUNTIME_MANIFEST } from "../manifest.js";

/**
 * Option C start-gate conditions for the local desk.
 * Prep only. Every gate stays blocked-until. This module does not start a pilot
 * and does not implement Option D or cutover.
 */

export const OPTION_C_START_CLAIM =
  "Option C remains prep until a human operator starts a real pilot. This panel does not start it. Option D is out of scope. No cutover automation is on this desk.";

export interface OptionCStartGateItem {
  id: string;
  label: string;
  detail: string;
  state: "blocked-until";
  required: true;
}

export interface OptionCStartGate {
  product: "trades-runtime";
  author: "Aziel Eliab";
  version: string;
  generatedAt: string;
  live_backends: false;
  writes: false;
  phoneHome: false;
  pages: "off";
  pilot_started: false;
  pilotMayStart: false;
  pilot: "not-started";
  optionC: "prep-only";
  optionD: "out-of-scope";
  cutover: false;
  shadow: true;
  local: true;
  claim: typeof OPTION_C_START_CLAIM;
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
      "Blocked until that person starts a real Option C pilot outside this prep panel. This software does not flip the gate."
  }
];

export function optionCStartGate(now: string): OptionCStartGate {
  return {
    product: "trades-runtime",
    author: "Aziel Eliab",
    version: RUNTIME_MANIFEST.version,
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
