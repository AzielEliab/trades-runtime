import { engagementNotice } from "../core/engagement-rules.js";
import { RUNTIME_MANIFEST } from "../manifest.js";
import { LOCAL_SOFTWARES_LABEL, LOCAL_SOFTWARES_TRACK } from "./local-softwares-gate.js";
import { readIsolatePilot } from "./pilot-isolate.js";

/**
 * Local honesty card for the operator box.
 * This is not the public Worker /v1/health route and it does not start a pilot.
 */
export interface HealthLocal {
  ok: true;
  product: "trades-runtime";
  product_label: typeof LOCAL_SOFTWARES_LABEL;
  track: typeof LOCAL_SOFTWARES_TRACK;
  version: string;
  field_claim: false;
  company_os_live: false;
  author: "Aziel Eliab";
  identity: "Aziel Eliab";
  surface: "health-local";
  live_backends: false;
  writes: false;
  pages: "off";
  phone_home: false;
  central_dump: false;
  tenant_data_on_worker: false;
  pilot_started: boolean;
  field_launch: false;
  option_c: "code-ready-pilot-not-started" | "pilot-started-shadow-sealed";
  option_d: "not-started";
  mode: "SHADOW-SEALED";
  auto_promote: false;
  wrapper_is_verification: false;
  engagement_notice: string;
  claim: string;
  branch_id?: string;
  instance_id?: string;
  isolate_pilot?: true;
}

const NOT_STARTED_CLAIM = "Option C prep only. Pilot not started. Not a live company pilot.";
const STARTED_CLAIM =
  "Option C pilot started on this isolate by an explicit human command. SHADOW-SEALED. Not a live company pilot. Not Field 1.0. Not Office Softwares 1.0.";

export function healthLocal(options?: { cwd?: string; instanceId?: string }): HealthLocal {
  const card = catalogHealth();
  if (!options?.cwd) return card;
  const record = readIsolatePilot(options.cwd, options.instanceId);
  if (!record) return card;
  return {
    ...card,
    pilot_started: true,
    option_c: "pilot-started-shadow-sealed",
    claim: STARTED_CLAIM,
    branch_id: record.branchId,
    instance_id: record.instanceId,
    isolate_pilot: true
  };
}

function catalogHealth(): HealthLocal {
  return {
    ok: true,
    product: "trades-runtime",
    product_label: LOCAL_SOFTWARES_LABEL,
    track: LOCAL_SOFTWARES_TRACK,
    version: RUNTIME_MANIFEST.version,
    field_claim: false,
    company_os_live: false,
    author: "Aziel Eliab",
    identity: "Aziel Eliab",
    surface: "health-local",
    live_backends: false,
    writes: false,
    pages: "off",
    phone_home: false,
    central_dump: false,
    tenant_data_on_worker: false,
    pilot_started: false,
    field_launch: false,
    option_c: RUNTIME_MANIFEST.launch_options.C.status,
    option_d: "not-started",
    mode: "SHADOW-SEALED",
    auto_promote: false,
    wrapper_is_verification: false,
    engagement_notice: engagementNotice(),
    claim: NOT_STARTED_CLAIM
  };
}
