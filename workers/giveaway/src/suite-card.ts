import {
  AUTHOR,
  IDENTITY,
  OBSERVED_LIVE_WORKER_CHECKED,
  OBSERVED_LIVE_WORKER_VERSION,
  PRODUCT_LABEL,
  PUBLIC_ORIGIN,
  REPOSITORY,
  VERSION
} from "./identity.js";

/** AZInterface suite shell entry. This product stays a separate package. */
export function suiteCardBody(): Record<string, unknown> {
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
    product_label: PRODUCT_LABEL,
    version: VERSION,
    track: "L",
    author: AUTHOR,
    identity: IDENTITY,
    bucket: "plain",
    door: "none",
    status: "installable-local",
    fraggate_status: "separate-package",
    local_only: true,
    ui_port: 4174,
    ui_cmd: "npx tsx src/cli.ts desk",
    commands: ["help", "softwares", "version", "health"],
    download_url: `${PUBLIC_ORIGIN}/download`,
    worker_home: `${PUBLIC_ORIGIN}/`,
    github: REPOSITORY,
    cite: `${PUBLIC_ORIGIN}/cite.json`,
    live_backends: false,
    pilot_started: false,
    field_claim: false,
    company_os_live: false,
    pages: "off",
    glama_make_release: false,
    observed_live_worker_version: OBSERVED_LIVE_WORKER_VERSION,
    observed_live_worker_checked: OBSERVED_LIVE_WORKER_CHECKED,
    one_line:
      "Installable Local Softwares 1.0 for field trades. Humans use the VibeLock Worker UI without downloading first. The operator desk stays on the operator machine. live_backends false. pilot_started false.",
    note:
      "Suite shell entry only. This product stays a separate package. AZInterface may show the card. fraggate_call does not execute it. Field 1.0 is not this card. pilot_started false. live_backends false."
  };
}
