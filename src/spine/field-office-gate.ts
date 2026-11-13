import { RUNTIME_MANIFEST } from "../manifest.js";
import { FIELD_OFFICE_RELEASE } from "./field-office-release.js";

/**
 * Field Softwares 1.0 and Office Softwares 1.0 self-serve gate.
 * Ready means a shop can implement on its own machine. It does not mean the
 * public demo is that shop, and it does not start Option D.
 */

export type FieldOfficeGateState = "green" | "standing" | "blocked";

export interface FieldOfficeGateItem {
  id: string;
  state: FieldOfficeGateState;
  label: string;
  detail: string;
}

export interface FieldOfficeGate {
  product: "trades-runtime";
  version: string;
  author: "Aziel Eliab";
  identity: "Aziel Eliab";
  field_softwares_1_0: typeof FIELD_OFFICE_RELEASE.field_softwares_1_0;
  office_softwares_1_0: typeof FIELD_OFFICE_RELEASE.office_softwares_1_0;
  implementation: typeof FIELD_OFFICE_RELEASE.implementation;
  central_operator_pilot: false;
  pilot_started: false;
  live_backends: false;
  field_claim: false;
  company_os_live: false;
  pages: "off";
  writes: "approval-gated-off";
  tenant_data_on_public: false;
  claim: string;
  items: FieldOfficeGateItem[];
}

const CLAIM =
  "Field Softwares 1.0 and Office Softwares 1.0 are ready. Each shop implements on its own machine with its own setup, exports, and credentials. There is no central operator pilot. The public demo stays pilot_started false and live_backends false. Writes require operator approval; default off. Not a live company OS.";

const ITEMS: readonly FieldOfficeGateItem[] = [
  {
    id: "field-1-0-ready",
    state: "green",
    label: "Field Softwares 1.0 is ready",
    detail:
      "Field flags, field time, coverage, right-tech suggestions, and the phone-width desk are in the tree for a shop to run locally. A fixture shadow is a sample. The shop start is npm run pilot:start on that shop's isolate."
  },
  {
    id: "office-1-0-ready",
    state: "green",
    label: "Office Softwares 1.0 is ready",
    detail:
      "The local operator desk is the office: monitoring, the call board, huddle, callbacks, inbound quality, and alert stubs. A shop runs it on 127.0.0.1. The public Worker does not serve that desk."
  },
  {
    id: "shop-self-serve",
    state: "green",
    label: "Shops implement themselves",
    detail:
      "There is no central operator-run pilot to wait for. Each shop places its own exports, keeps credentials on its own machine, and starts its own isolate."
  },
  {
    id: "pilot-start",
    state: "green",
    label: "pilot:start is the shop start",
    detail:
      "npm run pilot:start -- --branch <branchId> is the shop's Field and Office 1.0 start on that isolate. Prep that is not ready, a missing branch, and a company claim on empty or synthetic inbound still refuse."
  },
  {
    id: "public-demo-closed",
    state: "standing",
    label: "The public demo stays closed",
    detail:
      "The shipped catalog and the public giveaway Worker stay pilot_started false, field_claim false, and live_backends false. No tenant data on public Workers or Pages. A shop's local backends, if any, stay on that shop's machine."
  },
  {
    id: "writes-approval-gated",
    state: "standing",
    label: "Writes stay approval-gated",
    detail: "Writes require operator approval; default off. A yes covers one call. The public Worker has no write-back."
  },
  {
    id: "no-fake-signals",
    state: "standing",
    label: "No fake GPS, telematics, or accuracy percent",
    detail: "Local files and labeled synthetic demos stay labeled. A suggestion is not a dispatch. A checklist score is not an accuracy percent."
  },
  {
    id: "pages-off",
    state: "standing",
    label: "Pages stay off",
    detail: "GitHub Pages stays off. docs/ is a local catalog."
  },
  {
    id: "option-d",
    state: "blocked",
    label: "Option D has not started",
    detail: "Settlement against a live advise-lock, and Option D, stay later separate waves."
  },
  {
    id: "company-os-live",
    state: "blocked",
    label: "No live company OS",
    detail: "company_os_live stays false. A shop-local start is not a hosted company operating system."
  }
];

export function fieldOfficeGate(): FieldOfficeGate {
  return {
    product: "trades-runtime",
    version: RUNTIME_MANIFEST.version,
    author: "Aziel Eliab",
    identity: "Aziel Eliab",
    field_softwares_1_0: FIELD_OFFICE_RELEASE.field_softwares_1_0,
    office_softwares_1_0: FIELD_OFFICE_RELEASE.office_softwares_1_0,
    implementation: FIELD_OFFICE_RELEASE.implementation,
    central_operator_pilot: false,
    pilot_started: false,
    live_backends: false,
    field_claim: false,
    company_os_live: false,
    pages: "off",
    writes: "approval-gated-off",
    tenant_data_on_public: false,
    claim: CLAIM,
    items: ITEMS.map((item) => ({ ...item }))
  };
}
