import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RUNTIME_MANIFEST } from "../src/manifest.js";
import { fieldOfficeGate } from "../src/spine/field-office-gate.js";
import { localBackendsConfigured } from "../src/spine/field-office-release.js";
import { healthLocal } from "../src/spine/health-local.js";
import { runOptionCPilotStart } from "../src/spine/option-c-pilot-start.js";
import { runOptionCPrep } from "../src/spine/option-c-prep.js";
import { isIsolatePilotRecord, writeIsolatePilot } from "../src/spine/pilot-isolate.js";

describe("Field and Office 1.0 self-serve release", () => {
  it("marks the catalog ready and keeps the public demo closed", () => {
    expect(RUNTIME_MANIFEST.field_softwares_1_0).toBe("ready");
    expect(RUNTIME_MANIFEST.office_softwares_1_0).toBe("ready");
    expect(RUNTIME_MANIFEST.implementation).toBe("shop-self-serve");
    expect(RUNTIME_MANIFEST.central_operator_pilot).toBe(false);
    expect(RUNTIME_MANIFEST.pilot_started).toBe(false);
    expect(RUNTIME_MANIFEST.live_backends).toBe(false);
    expect(RUNTIME_MANIFEST.field_claim).toBe(false);
    expect(RUNTIME_MANIFEST.company_os_live).toBe(false);
    expect(RUNTIME_MANIFEST.honesty).toMatch(/ready for shop self-implementation/);
    expect(RUNTIME_MANIFEST.honesty).toMatch(/no central operator pilot/i);
    expect(RUNTIME_MANIFEST.honesty).toMatch(/No tenant data on public Workers or Pages/);
    expect(RUNTIME_MANIFEST.honesty).toMatch(/Writes require operator approval; default off/);

    const cite = JSON.parse(readFileSync("docs/cite.json", "utf8")) as {
      field_softwares_1_0: string;
      office_softwares_1_0: string;
      implementation: string;
      central_operator_pilot: boolean;
      pilot_started: boolean;
      live_backends: boolean;
      field_claim: boolean;
    };
    expect(cite.field_softwares_1_0).toBe("ready");
    expect(cite.office_softwares_1_0).toBe("ready");
    expect(cite.implementation).toBe("shop-self-serve");
    expect(cite.central_operator_pilot).toBe(false);
    expect(cite.pilot_started).toBe(false);
    expect(cite.live_backends).toBe(false);
    expect(cite.field_claim).toBe(false);

    const runtime = JSON.parse(readFileSync("docs/v1/runtime.json", "utf8")) as typeof cite;
    expect(runtime.field_softwares_1_0).toBe("ready");
    expect(runtime.office_softwares_1_0).toBe("ready");
    expect(runtime.live_backends).toBe(false);
    expect(runtime.pilot_started).toBe(false);

    const gate = fieldOfficeGate();
    expect(gate.field_softwares_1_0).toBe("ready");
    expect(gate.office_softwares_1_0).toBe("ready");
    expect(gate.central_operator_pilot).toBe(false);
    expect(gate.tenant_data_on_public).toBe(false);
    expect(gate.writes).toBe("approval-gated-off");
    expect(gate.items.find((item) => item.id === "field-1-0-ready")?.state).toBe("green");
    expect(gate.items.find((item) => item.id === "office-1-0-ready")?.state).toBe("green");
    expect(gate.items.find((item) => item.id === "option-d")?.state).toBe("blocked");
    expect(gate.items.find((item) => item.id === "company-os-live")?.state).toBe("blocked");
    const spec = readFileSync("specs/TR-FIELD-OFFICE-SELF-SERVE-2026-11-13.txt", "utf8");
    expect(spec).toMatch(/Aziel Eliab only/);
    expect(spec).toMatch(/no central operator-run pilot/i);
    expect(spec).toMatch(/npm run pilot:start -- --branch <branchId>/);
    expect(spec).toMatch(/does not deploy the public Worker/i);
  });

  it("starts Field and Office 1.0 on the shop isolate and ignores a hosted claim", async () => {
    const box = mkdtempSync(join(tmpdir(), "tr-field-office-"));
    mkdirSync(join(box, "data", "inbound"), { recursive: true });
    mkdirSync(join(box, "data", "runtime"), { recursive: true });
    writeFileSync(join(box, "data", "inbound", "local.json.example"), readFileSync("data/inbound/local.json.example"));
    writeFileSync(join(box, "data", "runtime", "alerts.json.example"), readFileSync("data/runtime/alerts.json.example"));

    const started = await runOptionCPilotStart({
      cwd: box,
      branchId: "shop-1",
      now: "2026-11-13T12:00:00.000Z",
      bootDesk: false
    });
    expect(started.accepted).toBe(true);
    expect(started.field_softwares_1_0).toBe("shop-local");
    expect(started.office_softwares_1_0).toBe("shop-local");
    expect(started.live_backends).toBe(false);
    expect(started.company_os_live).toBe(false);
    expect(healthLocal({ cwd: box }).pilot_started).toBe(true);
    expect(healthLocal().pilot_started).toBe(false);
    expect(healthLocal().live_backends).toBe(false);
    expect(healthLocal().field_softwares_1_0).toBe("ready");
    expect(RUNTIME_MANIFEST.pilot_started).toBe(false);

    const hosted = mkdtempSync(join(tmpdir(), "tr-field-office-hosted-"));
    expect(() =>
      writeIsolatePilot(hosted, {
        kind: "option-c-pilot-isolate",
        author: "Aziel Eliab",
        identity: "Aziel Eliab",
        version: "1.0.0",
        product_label: "Local Softwares 1.0",
        track: "L",
        instanceId: "local",
        branchId: "shop-1",
        at: "2026-11-13T12:00:00.000Z",
        pilot_started: true,
        live_backends: false,
        writes: false,
        pages: "off",
        mode: "SHADOW-SEALED",
        auto_promote: false,
        field_claim: false,
        field_launch: false,
        company_os_live: true,
        office_softwares_1_0: "shop-local",
        field_softwares_1_0: "shop-local",
        implementation: "shop-self-serve",
        central_operator_pilot: false,
        phone_home: false,
        central_dump: false,
        inbound: "empty",
        customer_data: false,
        wrapper_is_verification: false,
        claim: "hosted"
      })
    ).toThrow(/refused/);
    expect(isIsolatePilotRecord({ company_os_live: true })).toBe(false);
  });

  it("reports live_backends only when this shop configured local backends", async () => {
    const box = mkdtempSync(join(tmpdir(), "tr-field-office-backends-"));
    expect(localBackendsConfigured(box)).toBe(false);
    expect(healthLocal({ cwd: box }).live_backends).toBe(false);
    expect(healthLocal({ cwd: box }).live_backends_scope).toBe("none");
    mkdirSync(join(box, "data", "inbound"), { recursive: true });
    mkdirSync(join(box, "data", "runtime", "local"), { recursive: true });
    writeFileSync(join(box, "data", "inbound", "local.json.example"), readFileSync("data/inbound/local.json.example"));
    writeFileSync(join(box, "data", "runtime", "alerts.json.example"), readFileSync("data/runtime/alerts.json.example"));
    writeFileSync(
      join(box, "data", "runtime", "local", "write-backends.json"),
      JSON.stringify({
        servicetitan: { baseUrl: "https://api.servicetitan.io", tokenEnv: "TRADES_RUNTIME_ST_TOKEN" }
      })
    );
    expect(localBackendsConfigured(box, "local")).toBe(true);
    const health = healthLocal({ cwd: box, instanceId: "local" });
    expect(health.live_backends).toBe(true);
    expect(health.live_backends_scope).toBe("shop-local");
    expect(health.local_backends_configured).toBe(true);
    expect(health.pilot_started).toBe(false);
    expect(RUNTIME_MANIFEST.live_backends).toBe(false);
    expect(healthLocal().live_backends).toBe(false);
    expect(healthLocal().live_backends_scope).toBe("public-demo");

    const prep = await runOptionCPrep({
      cwd: box,
      fixtureDir: join(process.cwd(), "test", "fixtures", "byo"),
      now: "2026-11-13T12:05:00.000Z",
      bootDesk: false
    });
    expect(prep.ready).toBe(true);
    expect(prep.pilot_started).toBe(false);
    expect(prep.live_backends).toBe(false);
    expect(healthLocal({ cwd: box, instanceId: "local" }).live_backends).toBe(true);
  });
});
