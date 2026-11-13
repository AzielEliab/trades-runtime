import { engagementNotice } from "../core/engagement-rules.js";
import { RUNTIME_MANIFEST } from "../manifest.js";
import {
  FIELD_OFFICE_SHOP_LOCAL,
  FIELD_SOFTWARES_1_0_READY,
  liveBackendsScope,
  localBackendsConfigured,
  OFFICE_SOFTWARES_1_0_READY,
  SHOP_IMPLEMENTATION,
  type LiveBackendsScope
} from "./field-office-release.js";
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
  /** False on the public catalog. True on a shop machine only when that shop configured local backends. */
  live_backends: boolean;
  local_backends_configured: boolean;
  live_backends_scope: LiveBackendsScope;
  field_softwares_1_0: typeof FIELD_SOFTWARES_1_0_READY | typeof FIELD_OFFICE_SHOP_LOCAL;
  office_softwares_1_0: typeof OFFICE_SOFTWARES_1_0_READY | typeof FIELD_OFFICE_SHOP_LOCAL;
  implementation: typeof SHOP_IMPLEMENTATION;
  central_operator_pilot: false;
  /** No write runs by default. A write runs only through the approval gate after an operator yes. */
  writes: false;
  write_policy: "Writes require operator approval; default off.";
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

const NOT_STARTED_CLAIM =
  "Option C prep only. Pilot not started. Not a live company pilot. Field Softwares 1.0 and Office Softwares 1.0 are ready for shop self-implementation.";
const STARTED_CLAIM =
  "This shop started Field Softwares 1.0 and Office Softwares 1.0 on this isolate. Self-serve. SHADOW-SEALED. Not a live company OS. The public demo is not this shop.";

export function healthLocal(options?: { cwd?: string; instanceId?: string }): HealthLocal {
  const card = catalogHealth();
  if (!options?.cwd) return card;
  const configured = localBackendsConfigured(options.cwd, options.instanceId);
  const shopCard: HealthLocal = {
    ...card,
    live_backends: configured,
    local_backends_configured: configured,
    live_backends_scope: liveBackendsScope(configured, "shop")
  };
  const record = readIsolatePilot(options.cwd, options.instanceId);
  if (!record) return shopCard;
  return {
    ...shopCard,
    pilot_started: true,
    field_softwares_1_0: FIELD_OFFICE_SHOP_LOCAL,
    office_softwares_1_0: FIELD_OFFICE_SHOP_LOCAL,
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
    local_backends_configured: false,
    live_backends_scope: "public-demo",
    field_softwares_1_0: FIELD_SOFTWARES_1_0_READY,
    office_softwares_1_0: OFFICE_SOFTWARES_1_0_READY,
    implementation: SHOP_IMPLEMENTATION,
    central_operator_pilot: false,
    writes: false,
    write_policy: "Writes require operator approval; default off.",
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
