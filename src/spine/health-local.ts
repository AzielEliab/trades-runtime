import { engagementNotice } from "../core/engagement-rules.js";
import { RUNTIME_MANIFEST } from "../manifest.js";

/**
 * Local honesty card for the operator box.
 * This is not the public Worker /v1/health route and it does not start a pilot.
 */
export interface HealthLocal {
  ok: true;
  product: "trades-runtime";
  version: string;
  author: "Aziel Eliab";
  identity: "Aziel Eliab";
  surface: "health-local";
  live_backends: false;
  writes: false;
  pages: "off";
  phone_home: false;
  central_dump: false;
  tenant_data_on_worker: false;
  pilot_started: false;
  field_launch: false;
  option_c: "code-ready-pilot-not-started";
  option_d: "not-started";
  mode: "SHADOW-SEALED";
  auto_promote: false;
  wrapper_is_verification: false;
  engagement_notice: string;
  claim: "Option C prep only. Pilot not started. Not a live company pilot.";
}

export function healthLocal(): HealthLocal {
  return {
    ok: true,
    product: "trades-runtime",
    version: RUNTIME_MANIFEST.version,
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
    claim: "Option C prep only. Pilot not started. Not a live company pilot."
  };
}
