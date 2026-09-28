import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RUNTIME_MANIFEST } from "../src/manifest.js";
import { azInterfaceSuiteCard } from "../src/spine/azinterface-suite-card.js";
import { localSoftwaresGate, plainSoftwaresLead } from "../src/spine/local-softwares-gate.js";
import { healthLocal } from "../src/spine/health-local.js";
import { optionCStartGate } from "../src/spine/option-c-start-gate.js";
import { helpText, softwaresText, versionText } from "../src/cli.js";

describe("Track L Local Softwares 1.0 gate", () => {
  it("keeps the product law verbatim and lists green, open, and blocked ids", () => {
    const spec = readFileSync("specs/TR-1.0-GATE-2026-09-28.txt", "utf8");
    expect(spec).toMatch(/TRACK L — Local Softwares 1\.0 first/);
    expect(spec).toMatch(/KEEP: live_backends=false; pilot_started=false/);
    expect(spec).toMatch(/Do NOT flip pilot_started or live_backends for a version bump/);
    expect(spec).toMatch(/TRACK F — Field 1\.0 ONLY after a real Option C pilot/);
    expect(spec).toMatch(/Ladder today: A done, B done-in-software, C code-ready \/ pilot not started, D not started/);
    expect(spec).toMatch(/Aziel Eliab only/);

    const gate = localSoftwaresGate();
    expect(gate.version).toBe("1.0.0-local");
    expect(gate.version).toBe(RUNTIME_MANIFEST.version);
    expect(gate.product_label).toBe("Local Softwares 1.0");
    expect(gate.live_backends).toBe(false);
    expect(gate.pilot_started).toBe(false);
    expect(gate.field_claim).toBe(false);
    expect(gate.company_os_live).toBe(false);
    expect(gate.glama_make_release).toBe(false);
    expect(gate.observed_live_worker_version).toBe("0.4.12");
    expect(gate.items.filter((item) => item.state === "green").map((item) => item.id)).toEqual([
      "common-commands",
      "plain-softwares-list",
      "vibelock-worker-ui",
      "option-c-prep",
      "cite-lockstep",
      "honesty-flags",
      "desk-kept",
      "suite-card",
      "glama-parked",
      "pages-off"
    ]);
    expect(gate.items.filter((item) => item.state === "open").map((item) => item.id)).toEqual([
      "live-worker-deploy",
      "glama-public-badge",
      "azinterface-live-shell"
    ]);
    expect(gate.items.filter((item) => item.state === "blocked").map((item) => item.id)).toEqual([
      "option-c-pilot",
      "option-d",
      "field-1-0"
    ]);
    for (const item of gate.items) {
      const word = item.state === "green" ? "GREEN" : item.state === "open" ? "OPEN" : "BLOCKED";
      expect(spec).toContain(`${word} ${item.id}`);
    }
    expect(JSON.stringify(gate)).not.toMatch(/"pilot_started":true/);
    expect(JSON.stringify(gate)).not.toMatch(/"live_backends":true/);
  });

  it("publishes an AZInterface suite card for this separate package", () => {
    const card = azInterfaceSuiteCard();
    const file = JSON.parse(readFileSync("docs/azinterface-suite-card.json", "utf8")) as typeof card;
    expect(file).toEqual(card);
    expect(card.separate_package).toBe(true);
    expect(card.nested_in_aziel_runtime).toBe(false);
    expect(card.fraggate_engine).toBe(false);
    expect(card.fraggate_call).toBe(false);
    expect(card.door).toBe("none");
    expect(card.pilot_started).toBe(false);
    expect(card.live_backends).toBe(false);
    expect(card.field_claim).toBe(false);
    expect(card.company_os_live).toBe(false);
    expect(card.ui_port).toBe(4174);
    expect(card.commands).toEqual(["help", "softwares", "version", "health"]);
    expect(card.version).toBe(RUNTIME_MANIFEST.version);
  });

  it("keeps the plain list and the honesty card on the local label", () => {
    const lead = plainSoftwaresLead();
    expect(softwaresText().startsWith(lead)).toBe(true);
    expect(helpText()).toMatch(/Local Softwares 1\.0 \(installable\)/);
    expect(helpText()).toMatch(/without downloading first/);
    expect(versionText()).toMatch(/trades-runtime 1\.0\.0-local/);
    expect(versionText()).toMatch(/Not a Field 1\.0 claim/);
    expect(versionText()).toMatch(/live_backends false\. pilot_started false\./);
    const health = healthLocal();
    expect(health.product_label).toBe("Local Softwares 1.0");
    expect(health.track).toBe("L");
    expect(health.pilot_started).toBe(false);
    expect(health.field_claim).toBe(false);
    expect(health.company_os_live).toBe(false);
    const start = optionCStartGate("2026-09-28T00:00:00.000Z");
    expect(start.pilot_started).toBe(false);
    expect(start.pilotMayStart).toBe(false);
    expect(start.product_label).toBe("Local Softwares 1.0");
    expect(start.gates.every((item) => item.state === "blocked-until")).toBe(true);
  });
});
