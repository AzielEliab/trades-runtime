import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createOneBranchShadowConfig, requestShadowModeChange } from "../src/core/shadow-branch.js";
import { planCli } from "../src/cli.js";
import { startOperatorDesk } from "../src/desk/server.js";
import { RUNTIME_MANIFEST } from "../src/manifest.js";
import { healthLocal } from "../src/spine/health-local.js";
import { OPTION_C_PREP_BRANCH } from "../src/spine/option-c-prep.js";
import { OPTION_C_START_REFUSAL, runOptionCPilotStart } from "../src/spine/option-c-pilot-start.js";
import { optionCStartGate } from "../src/spine/option-c-start-gate.js";
import { mayWriteProBooks } from "../src/spine/probooks-shadow.js";
import { mayWriteServiceTitan } from "../src/spine/servicetitan-shadow.js";
import { mayWriteTradesApp } from "../src/spine/trades-app-shadow.js";

const FIXTURES = join(process.cwd(), "test", "fixtures", "byo");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tsx = join(root, "node_modules", ".bin", "tsx");

function stageRoot(): string {
  const box = mkdtempSync(join(tmpdir(), "tr-option-c-start-"));
  mkdirSync(join(box, "data", "inbound"), { recursive: true });
  mkdirSync(join(box, "data", "runtime"), { recursive: true });
  writeFileSync(
    join(box, "data", "inbound", "local.json.example"),
    readFileSync(join(process.cwd(), "data", "inbound", "local.json.example"))
  );
  writeFileSync(
    join(box, "data", "runtime", "alerts.json.example"),
    readFileSync(join(process.cwd(), "data", "runtime", "alerts.json.example"))
  );
  return box;
}

function pilotPath(box: string): string {
  return join(box, "data", "runtime", "local", "pilot.json");
}

describe("Option C human pilot start", () => {
  it("keeps the start paper honest and the 1.0.0-local pin", () => {
    const spec = readFileSync("specs/TR-PILOT-START-2026-10-02.txt", "utf8");
    expect(spec).toMatch(/Aziel Eliab only/);
    expect(spec).toMatch(/npm run pilot:start -- --branch <branchId>/);
    expect(spec).toMatch(/pilot-start/);
    expect(spec).toMatch(/live_backends remains false/);
    expect(spec).toMatch(/does not claim Field Softwares 1\.0/);
    expect(spec).toMatch(/does not claim Office Softwares 1\.0/);
    expect(spec).toMatch(/1\.0\.0-local/);
    expect(spec).toMatch(/No Make Release/);
    expect(spec).toMatch(/does not deploy the Worker/i);
    expect(readFileSync("specs/README.md", "utf8")).toMatch(/TR-PILOT-START-2026-10-02/);
    expect(readFileSync("README.md", "utf8")).toMatch(/npm run pilot:start -- --branch <branchId>/);
    expect(readFileSync("README.md", "utf8")).toMatch(/Local Softwares 1\.0/);
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string; scripts: Record<string, string> };
    expect(pkg.version).toBe("1.0.0-local");
    expect(pkg.scripts["pilot:start"]).toBe("tsx src/cli.ts pilot-start");
    expect(RUNTIME_MANIFEST.version).toBe("1.0.0-local");
    expect(RUNTIME_MANIFEST.pilot_started).toBe(false);
    expect(RUNTIME_MANIFEST.product_label).toBe("Local Softwares 1.0");
    const worker = JSON.parse(readFileSync("workers/giveaway/package.json", "utf8")) as { version: string };
    const glama = JSON.parse(readFileSync("glama.json", "utf8")) as { version: string };
    expect(worker.version).toBe("1.0.0-local");
    expect(glama.version).toBe("1.0.0-local");
  });

  it("routes pilot-start and refuses a missing branch", async () => {
    const plan = planCli(["node", "cli.ts", "pilot-start", "--branch", "midwest-1", "--root", "/tmp/trades-box"]);
    expect(plan).toMatchObject({
      kind: "pilot-start",
      cwd: "/tmp/trades-box",
      branchIds: ["midwest-1"],
      claimCompany: false
    });
    expect(planCli(["node", "cli.ts", "pilot-start", "--branch", "a", "--branch", "b"]).kind).toBe("pilot-start");
    const box = stageRoot();
    const missing = await runOptionCPilotStart({ cwd: box, branchIds: [], now: "2026-10-02T15:00:00.000Z", bootDesk: false });
    expect(missing.accepted).toBe(false);
    expect(missing.pilot_started).toBe(false);
    expect(missing.refused).toBe(OPTION_C_START_REFUSAL.branch);
    expect(missing.company_os_live).toBe(false);
    expect(missing.live_backends).toBe(false);
    expect(existsSync(pilotPath(box))).toBe(false);

    const blank = await runOptionCPilotStart({
      cwd: box,
      branchId: "   ",
      now: "2026-10-02T15:00:01.000Z",
      bootDesk: false
    });
    expect(blank.refused).toBe(OPTION_C_START_REFUSAL.branch);
    expect(blank.pilot_started).toBe(false);

    const two = await runOptionCPilotStart({
      cwd: box,
      branchIds: ["midwest-1", "midwest-2"],
      now: "2026-10-02T15:00:02.000Z",
      bootDesk: false
    });
    expect(two.refused).toBe(OPTION_C_START_REFUSAL.oneBranch);
    expect(two.pilot_started).toBe(false);

    const prepBranch = await runOptionCPilotStart({
      cwd: box,
      branchId: OPTION_C_PREP_BRANCH,
      fixtureDir: FIXTURES,
      now: "2026-10-02T15:00:03.000Z",
      bootDesk: false
    });
    expect(prepBranch.refused).toBe(OPTION_C_START_REFUSAL.prepBranch);
    expect(prepBranch.pilot_started).toBe(false);
    expect(existsSync(pilotPath(box))).toBe(false);
  });

  it("refuses when prep would not be ready and does not flip the isolate", async () => {
    const box = mkdtempSync(join(tmpdir(), "tr-option-c-start-bare-"));
    const receipt = await runOptionCPilotStart({
      cwd: box,
      branchId: "midwest-1",
      fixtureDir: FIXTURES,
      now: "2026-10-02T15:01:00.000Z",
      bootDesk: false
    });
    expect(receipt.prep_ready).toBe(false);
    expect(receipt.accepted).toBe(false);
    expect(receipt.pilot_started).toBe(false);
    expect(receipt.refused).toBe(OPTION_C_START_REFUSAL.prep);
    expect(receipt.live_backends).toBe(false);
    expect(receipt.company_os_live).toBe(false);
    expect(receipt.field_claim).toBe(false);
    expect(receipt.office_softwares_1_0).toBe(false);
    expect(receipt.field_softwares_1_0).toBe(false);
    expect(existsSync(join(box, "data", "runtime", "local", "pilot.json"))).toBe(false);
    expect(healthLocal({ cwd: box }).pilot_started).toBe(false);
    expect(RUNTIME_MANIFEST.pilot_started).toBe(false);
  });

  it("starts one branch on this isolate only and leaves the catalog sealed", async () => {
    const box = stageRoot();
    const receipt = await runOptionCPilotStart({
      cwd: box,
      branchId: "midwest-1",
      fixtureDir: FIXTURES,
      now: "2026-10-02T15:02:00.000Z",
      bootDesk: false
    });
    expect(receipt.accepted).toBe(true);
    expect(receipt.pilot_started).toBe(true);
    expect(receipt.branchId).toBe("midwest-1");
    expect(receipt.live_backends).toBe(false);
    expect(receipt.writes).toBe(false);
    expect(receipt.pages).toBe("off");
    expect(receipt.mode).toBe("SHADOW-SEALED");
    expect(receipt.auto_promote).toBe(false);
    expect(receipt.field_claim).toBe(false);
    expect(receipt.field_launch).toBe(false);
    expect(receipt.company_os_live).toBe(false);
    expect(receipt.office_softwares_1_0).toBe(false);
    expect(receipt.field_softwares_1_0).toBe(false);
    expect(receipt.customer_data).toBe(false);
    expect(receipt.wrapper_is_verification).toBe(false);
    expect(receipt.verification_status).toBe("UNVERIFIED");
    expect(receipt.inbound).toBe("empty");
    expect(receipt.author).toBe("Aziel Eliab");
    expect(receipt.claim).toMatch(/not a company OS live claim/i);
    expect(receipt.claim).toMatch(/not Field 1\.0/);
    expect(receipt.claim).toMatch(/not Office Softwares 1\.0/);
    expect(receipt.claim).toMatch(/Empty is not a company drop/);
    expect(receipt.ledger.verified).toBe(true);
    expect(receipt.ledger.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.at).toBe("2026-10-02T15:02:00.000Z");

    const ledger = readFileSync(join(box, "data", "runtime", "local", "receipts.jsonl"), "utf8");
    expect(ledger).toMatch(/"event":"option-c-pilot-start"/);
    expect(ledger).toMatch(/"branchId":"midwest-1"/);
    expect(ledger).toMatch(/"pilot_started":true/);
    expect(ledger).toMatch(/"live_backends":false/);

    const stored = JSON.parse(readFileSync(pilotPath(box), "utf8")) as { pilot_started: boolean; branchId: string; mode: string };
    expect(stored.pilot_started).toBe(true);
    expect(stored.branchId).toBe("midwest-1");
    expect(stored.mode).toBe("SHADOW-SEALED");

    const health = healthLocal({ cwd: box });
    expect(health.pilot_started).toBe(true);
    expect(health.live_backends).toBe(false);
    expect(health.writes).toBe(false);
    expect(health.mode).toBe("SHADOW-SEALED");
    expect(health.field_claim).toBe(false);
    expect(health.field_launch).toBe(false);
    expect(health.company_os_live).toBe(false);
    expect(health.branch_id).toBe("midwest-1");
    expect(health.claim).toMatch(/Not Field 1\.0/);
    expect(health.claim).toMatch(/Not Office Softwares 1\.0/);
    expect(healthLocal().pilot_started).toBe(false);

    const gate = optionCStartGate("2026-10-02T15:02:00.000Z", { cwd: box });
    expect(gate.pilot_started).toBe(true);
    expect(gate.pilotMayStart).toBe(false);
    expect(gate.live_backends).toBe(false);
    expect(gate.writes).toBe(false);
    expect(gate.field_claim).toBe(false);
    expect(gate.company_os_live).toBe(false);
    expect(gate.optionD).toBe("out-of-scope");
    expect(gate.gates.every((item) => item.state === "blocked-until")).toBe(true);
    expect(gate.claim).toMatch(/Not Field 1\.0/);
    expect(gate.claim).toMatch(/Not Office Softwares 1\.0/);
    expect(optionCStartGate("2026-10-02T15:02:00.000Z").pilot_started).toBe(false);

    expect(RUNTIME_MANIFEST.pilot_started).toBe(false);
    expect(RUNTIME_MANIFEST.launch_options.C.pilot_started).toBe(false);
    expect(RUNTIME_MANIFEST.live_backends).toBe(false);
    expect(mayWriteServiceTitan()).toBe(false);
    expect(mayWriteProBooks()).toBe(false);
    expect(mayWriteTradesApp()).toBe(false);

    const again = await runOptionCPilotStart({
      cwd: box,
      branchId: "midwest-1",
      fixtureDir: FIXTURES,
      now: "2026-10-02T15:03:00.000Z",
      bootDesk: false
    });
    expect(again.accepted).toBe(true);
    expect(again.already_started).toBe(true);
    expect(again.pilot_started).toBe(true);
    expect(again.branchId).toBe("midwest-1");
    const ledgerAfter = readFileSync(join(box, "data", "runtime", "local", "receipts.jsonl"), "utf8");
    expect(ledgerAfter).toBe(ledger);

    const other = await runOptionCPilotStart({
      cwd: box,
      branchId: "midwest-2",
      fixtureDir: FIXTURES,
      now: "2026-10-02T15:04:00.000Z",
      bootDesk: false
    });
    expect(other.accepted).toBe(false);
    expect(other.pilot_started).toBe(false);
    expect(other.refused).toBe(OPTION_C_START_REFUSAL.otherBranch);
    expect(JSON.parse(readFileSync(pilotPath(box), "utf8")).branchId).toBe("midwest-1");

    const explicit = requestShadowModeChange(createOneBranchShadowConfig({ branchId: "midwest-1" }), "SHADOW-VISIBLE", {
      kind: "explicit"
    });
    expect(explicit.pilotStarted).toBe(false);
    expect(explicit.fieldLaunch).toBe(false);
    expect(explicit.mode).toBe("SHADOW-VISIBLE");
    expect(healthLocal({ cwd: box }).pilot_started).toBe(true);
    expect(RUNTIME_MANIFEST.pilot_started).toBe(false);

    const desk = await startOperatorDesk({ cwd: box, port: 0, persistAlertState: false });
    try {
      const deskHealth = (await (await fetch(new URL("/api/health", desk.url))).json()) as {
        pilot_started: boolean;
        live_backends: boolean;
        company_os_live: boolean;
        field_claim: boolean;
        mode: string;
      };
      expect(deskHealth.pilot_started).toBe(true);
      expect(deskHealth.live_backends).toBe(false);
      expect(deskHealth.company_os_live).toBe(false);
      expect(deskHealth.field_claim).toBe(false);
      expect(deskHealth.mode).toBe("SHADOW-SEALED");
      const deskGate = (await (await fetch(new URL("/api/option-c-start-gate", desk.url))).json()) as {
        pilot_started: boolean;
        pilotMayStart: boolean;
        gates: { state: string }[];
      };
      expect(deskGate.pilot_started).toBe(true);
      expect(deskGate.pilotMayStart).toBe(false);
      expect(deskGate.gates.every((item) => item.state === "blocked-until")).toBe(true);
    } finally {
      await desk.close();
    }
  });

  it("refuses a company claim when inbound is synthetic or empty", async () => {
    const empty = stageRoot();
    const emptyClaim = await runOptionCPilotStart({
      cwd: empty,
      branchId: "midwest-1",
      claimCompany: true,
      fixtureDir: FIXTURES,
      now: "2026-10-02T15:05:00.000Z",
      bootDesk: false
    });
    expect(emptyClaim.accepted).toBe(false);
    expect(emptyClaim.pilot_started).toBe(false);
    expect(emptyClaim.refused).toBe(OPTION_C_START_REFUSAL.companyClaim);
    expect(emptyClaim.company_os_live).toBe(false);
    expect(emptyClaim.inbound).toBe("empty");
    expect(existsSync(pilotPath(empty))).toBe(false);
    const emptyLedger = readFileSync(join(empty, "data", "runtime", "local", "receipts.jsonl"), "utf8");
    expect(emptyLedger).not.toMatch(/"pilot_started":true/);

    const synthetic = stageRoot();
    const inbound = join(synthetic, "data", "inbound", "servicetitan");
    mkdirSync(inbound, { recursive: true });
    writeFileSync(join(inbound, "servicetitan-export.json"), readFileSync(join(FIXTURES, "servicetitan-export.json")));
    const claimed = await runOptionCPilotStart({
      cwd: synthetic,
      branchId: "midwest-1",
      claimCompany: true,
      fixtureDir: FIXTURES,
      now: "2026-10-02T15:06:00.000Z",
      bootDesk: false
    });
    expect(claimed.accepted).toBe(false);
    expect(claimed.pilot_started).toBe(false);
    expect(claimed.inbound).toBe("synthetic-only");
    expect(claimed.refused).toBe(OPTION_C_START_REFUSAL.companyClaim);
    expect(claimed.claim).toMatch(/not a company drop/i);
    expect(claimed.company_os_live).toBe(false);
    expect(claimed.field_claim).toBe(false);
    expect(existsSync(pilotPath(synthetic))).toBe(false);
    expect(healthLocal({ cwd: synthetic }).pilot_started).toBe(false);

    const drill = await runOptionCPilotStart({
      cwd: synthetic,
      branchId: "midwest-1",
      fixtureDir: FIXTURES,
      now: "2026-10-02T15:07:00.000Z",
      bootDesk: false
    });
    expect(drill.accepted).toBe(true);
    expect(drill.pilot_started).toBe(true);
    expect(drill.synthetic_inbound).toBe(true);
    expect(drill.company_os_live).toBe(false);
    expect(drill.customer_data).toBe(false);
    expect(drill.claim).toMatch(/Synthetic inbound is not their books/);
    expect(drill.claim).toMatch(/not a company OS live claim/i);
  });

  it("does not let an explicit mode change start the pilot", () => {
    const box = stageRoot();
    const sealed = createOneBranchShadowConfig({ branchId: "midwest-1" });
    expect(() => requestShadowModeChange(sealed, "SHADOW-VISIBLE", { kind: "auto" })).toThrow(/never auto-promote/);
    const explicit = requestShadowModeChange(sealed, "SHADOW-VISIBLE", { kind: "explicit" });
    expect(explicit.pilotStarted).toBe(false);
    expect(explicit.fieldLaunch).toBe(false);
    expect(existsSync(pilotPath(box))).toBe(false);
    expect(healthLocal({ cwd: box }).pilot_started).toBe(false);
    expect(optionCStartGate("2026-10-02T15:08:00.000Z", { cwd: box }).pilot_started).toBe(false);
    expect(RUNTIME_MANIFEST.pilot_started).toBe(false);
  });

  it("prints a refusal receipt from the CLI when --branch is omitted", () => {
    const box = stageRoot();
    let status = 0;
    let stdout = "";
    try {
      stdout = execFileSync(tsx, ["src/cli.ts", "pilot-start", "--root", box], {
        cwd: root,
        encoding: "utf8"
      });
    } catch (error) {
      const failed = error as { status?: number; stdout?: string | Buffer };
      status = failed.status ?? 1;
      stdout = failed.stdout === undefined ? "" : String(failed.stdout);
    }
    expect(status).not.toBe(0);
    const receipt = JSON.parse(stdout) as { pilot_started: boolean; refused: string; live_backends: boolean; company_os_live: boolean };
    expect(receipt.pilot_started).toBe(false);
    expect(receipt.refused).toBe(OPTION_C_START_REFUSAL.branch);
    expect(receipt.live_backends).toBe(false);
    expect(receipt.company_os_live).toBe(false);
    expect(existsSync(pilotPath(box))).toBe(false);
  });
});
