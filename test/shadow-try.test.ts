import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { helpText, planCli } from "../src/cli.js";
import { RUNTIME_MANIFEST } from "../src/manifest.js";
import { runFieldShadow } from "../src/shadow/field-try.js";
import { runOfficeShadow } from "../src/shadow/office-try.js";

describe("local shadow try", () => {
  it("keeps the shipped catalog from starting a pilot", () => {
    expect(RUNTIME_MANIFEST.version).toBe("1.0.0-local");
    expect(RUNTIME_MANIFEST.live_backends).toBe(false);
    expect(RUNTIME_MANIFEST.pilot_started).toBe(false);
    expect(RUNTIME_MANIFEST.field_claim).toBe(false);
    expect(RUNTIME_MANIFEST.company_os_live).toBe(false);
    const glama = JSON.parse(readFileSync("glama.json", "utf8")) as { version: string; description: string };
    expect(glama.version).toBe("1.0.0-local");
    expect(glama.description).toMatch(/1\.0\.0-local/);
    expect(glama.description).not.toMatch(/pre-0\.4\.4/);
    expect(glama.description).not.toMatch(/stays parked/);
    expect(readFileSync("README.md", "utf8")).toMatch(/npm run shadow:office/);
    expect(readFileSync("README.md", "utf8")).toMatch(/npm run pilot:start -- --branch <branchId>/);
    expect(readFileSync("README.md", "utf8")).toMatch(/Merging this repository does not start a pilot/);
    expect(readFileSync("README.md", "utf8")).not.toMatch(/pre-0\.4\.4/);
    expect(helpText()).toMatch(/shadow-office/);
    expect(helpText()).toMatch(/shadow-field/);
    expect(planCli(["node", "cli.ts", "shadow-office"])).toEqual({ kind: "shadow-office" });
    expect(planCli(["node", "cli.ts", "shadow-field"])).toEqual({ kind: "shadow-field" });
  });

  it("runs the office shadow on sample-shop fixtures without field flags", () => {
    const report = runOfficeShadow();
    expect(report.sampleBranch).toBe("sample-shop");
    expect(report.surface).toBe("office-shadow");
    expect(report.author).toBe("Aziel Eliab");
    expect(report.office_softwares_1_0).toBe(false);
    expect(report.field_softwares_1_0).toBe(false);
    expect(report.live_backends).toBe(false);
    expect(report.pilot_started).toBe(false);
    expect(report.writes).toBe(false);
    expect(report.servicetitanWrite).toBe(false);
    expect(report.probooksWrite).toBe(false);
    expect(report.dataLabel).toBe("byo-admitted-synthetic");
    expect(report.jobs).toBeGreaterThan(0);
    expect(report.huddleTechs).toBeGreaterThan(0);
    expect(report.qualityScoreIsAccuracyPercent).toBe(false);
    expect(report.fieldFlagsOnThisRun).toBe(0);
    expect(report.startGatePilot).toBe("not-started");
    expect(report.note).toMatch(/not the operator/);
  });

  it("runs the field shadow on sample-shop fixtures without claiming Field 1.0", () => {
    const report = runFieldShadow();
    expect(report.sampleBranch).toBe("sample-shop");
    expect(report.surface).toBe("field-shadow");
    expect(report.office_softwares_1_0).toBe(false);
    expect(report.field_softwares_1_0).toBe(false);
    expect(report.live_backends).toBe(false);
    expect(report.pilot_started).toBe(false);
    expect(report.writes).toBe(false);
    expect(report.inventedAccuracy).toBe(false);
    expect(report.notALiveGps).toBe(true);
    expect(report.flags.map((flag) => flag.kind).sort()).toEqual([
      "callbackRisk",
      "customerEscalation",
      "needsParts",
      "safetyHold",
      "vanDown"
    ]);
    expect(report.vanNotInvented).toEqual(["JOB-NO-VAN"]);
    expect(report.timeCards).toBeGreaterThan(0);
    expect(report.timeSource).toBe("local-file");
    expect(report.coveragePlaces).toBeGreaterThan(0);
    expect(report.coverageSource).toBe("local-file");
    expect(report.rightTech?.autoDispatch).toBe(false);
    expect(report.rightTech?.writeBack).toBe("refused");
    expect(JSON.stringify(report)).not.toMatch(/\d+%/);
  });
});
