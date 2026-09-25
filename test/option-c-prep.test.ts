import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyEngagement } from "../src/core/engagement-rules.js";
import { RUNTIME_MANIFEST } from "../src/manifest.js";
import { DurableReceiptStore } from "../src/spine/durable-receipts.js";
import { recordEngagementDrop } from "../src/spine/engagement-receipt.js";
import { healthLocal } from "../src/spine/health-local.js";
import { runOptionCPrep } from "../src/spine/option-c-prep.js";
import { describeRuntimeIsolate } from "../src/spine/runtime-isolate.js";
import { startOperatorDesk } from "../src/desk/server.js";

const FIXTURES = join(process.cwd(), "test", "fixtures", "byo");

function stageRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "tr-option-c-prep-"));
  mkdirSync(join(root, "data", "inbound"), { recursive: true });
  mkdirSync(join(root, "data", "runtime"), { recursive: true });
  writeFileSync(
    join(root, "data", "inbound", "local.json.example"),
    readFileSync(join(process.cwd(), "data", "inbound", "local.json.example"))
  );
  writeFileSync(
    join(root, "data", "runtime", "alerts.json.example"),
    readFileSync(join(process.cwd(), "data", "runtime", "alerts.json.example"))
  );
  return root;
}

describe("Option C pilot prep", () => {
  it("keeps the prep runbook on the operator checklist", () => {
    const spec = readFileSync("specs/TR-OPTION-C-PREP-2026-09-25.txt", "utf8");
    expect(spec).toMatch(/Aziel Eliab only/);
    expect(spec).toMatch(/local install/i);
    expect(spec).toMatch(/data\/inbound\/servicetitan/);
    expect(spec).toMatch(/data\/inbound\/probooks/);
    expect(spec).toMatch(/data\/inbound\/trades-app/);
    expect(spec).toMatch(/SHADOW-SEALED/);
    expect(spec).toMatch(/refuse-write/i);
    expect(spec).toMatch(/npm run pilot:prep/);
    expect(spec).toMatch(/pilot_started false/);
    expect(spec).toMatch(/No central dump/);
    expect(spec).toMatch(/No Pages/);
    expect(spec).toMatch(/No live ServiceTitan writes/);
    expect(spec).toMatch(/does not start that pilot|does not start the pilot|Pilot not started/);
    expect(spec).not.toMatch(/pilot has started/i);
  });

  it("keeps health-local and the isolate layout honest", () => {
    const health = healthLocal();
    expect(health.surface).toBe("health-local");
    expect(health.author).toBe("Aziel Eliab");
    expect(health.pilot_started).toBe(false);
    expect(health.live_backends).toBe(false);
    expect(health.writes).toBe(false);
    expect(health.pages).toBe("off");
    expect(health.phone_home).toBe(false);
    expect(health.central_dump).toBe(false);
    expect(health.tenant_data_on_worker).toBe(false);
    expect(health.field_launch).toBe(false);
    expect(health.option_c).toBe("code-ready-pilot-not-started");
    expect(health.option_d).toBe("not-started");
    expect(health.mode).toBe("SHADOW-SEALED");
    expect(health.claim).toMatch(/Pilot not started/);
    expect(JSON.stringify(health)).not.toMatch(/"pilot_started":true/);

    const isolate = describeRuntimeIsolate("local");
    expect(isolate.inbound.servicetitan).toBe("data/inbound/servicetitan");
    expect(isolate.inbound.probooks).toBe("data/inbound/probooks");
    expect(isolate.inbound["trades-app"]).toBe("data/inbound/trades-app");
    expect(isolate.alertsExample).toBe("data/runtime/alerts.json.example");
    expect(isolate.alertsPath).toBe(join("data", "runtime", "local", "alerts.json"));
    expect(isolate.hostedTenantRefused).toBe(true);
    expect(isolate.hostedTenantLayout).toBe("data/tenants");
    expect(RUNTIME_MANIFEST.pilot_started).toBe(false);
    expect(RUNTIME_MANIFEST.launch_options.C.pilot_started).toBe(false);
    expect(RUNTIME_MANIFEST.launch_options.C.prep).toBe("local-runbook");
  });

  it("records an engagement drop and refuses to record a promotion", () => {
    const root = mkdtempSync(join(tmpdir(), "tr-engagement-receipt-"));
    const store = new DurableReceiptStore(join(root, "receipts.jsonl"));
    const dropped = applyEngagement("SHADOW-VISIBLE", { treatedAsTicket: true });
    const receipt = recordEngagementDrop({
      store,
      branchId: "tr:branch:midwest-3",
      decision: dropped,
      at: "2026-09-25T21:00:00Z",
      receiptId: "tr:receipt:engagement-drop:test"
    });
    expect(receipt.kind).toBe("lifecycle");
    expect(receipt.body.pilot_started).toBe(false);
    expect(receipt.body.mode).toBe("SHADOW-SEALED");
    expect(receipt.body.droppedToSealed).toBe(true);
    expect(store.verify()).toBe(true);
    expect(() =>
      recordEngagementDrop({
        store,
        branchId: "tr:branch:midwest-3",
        decision: applyEngagement("SHADOW-SEALED", {}),
        at: "2026-09-25T21:00:01Z",
        receiptId: "tr:receipt:engagement-drop:nope"
      })
    ).toThrow(/drop to SHADOW-SEALED only/);
  });

  it("validates a staged operator box and does not start the pilot", async () => {
    const root = stageRoot();
    const receipt = await runOptionCPrep({
      cwd: root,
      fixtureDir: FIXTURES,
      now: "2026-09-25T21:21:00Z"
    });
    expect(receipt.kind).toBe("option-c-pilot-prep");
    expect(receipt.ready).toBe(true);
    expect(receipt.pilot_started).toBe(false);
    expect(receipt.pilot).toBe("not-started");
    expect(receipt.optionC).toBe("code-ready-pilot-not-started");
    expect(receipt.optionD).toBe("not-started");
    expect(receipt.field_launch).toBe(false);
    expect(receipt.live_backends).toBe(false);
    expect(receipt.writes).toBe(false);
    expect(receipt.pages).toBe("off");
    expect(receipt.endpoints_called).toBe(false);
    expect(receipt.customer_data).toBe(false);
    expect(receipt.author).toBe("Aziel Eliab");
    expect(receipt.claim).toMatch(/pilot has not started/i);
    expect(receipt.config.exampleCopied).toBe(true);
    expect(receipt.config.copiedThisRun).toBe(true);
    expect(receipt.config.alertsExampleCopied).toBe(true);
    expect(receipt.config.endpointsCalled).toBe(false);
    expect(receipt.admit.verificationStatus).toBe("UNVERIFIED");
    expect(receipt.admit.wrapperIsVerification).toBe(false);
    expect(receipt.admit.sources).toEqual(["servicetitan", "probooks", "trades-app"]);
    expect(receipt.engagement.droppedToSealed).toBe(true);
    expect(receipt.engagement.mode).toBe("SHADOW-SEALED");
    expect(receipt.engagement.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.writeRefusals.some((line) => /ServiceTitan/.test(line))).toBe(true);
    expect(receipt.writeRefusals.some((line) => /ProBooks/.test(line))).toBe(true);
    expect(receipt.writeRefusals.some((line) => /trades-app/.test(line))).toBe(true);
    expect(receipt.desk.booted).toBe(true);
    expect(receipt.desk.host).toBe("127.0.0.1");
    expect(receipt.desk.health_pilot_started).toBe(false);
    expect(receipt.ledger.verified).toBe(true);
    expect(receipt.ledger.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(existsSync(join(root, "data", "inbound", "local.json"))).toBe(true);
    expect(existsSync(join(root, "data", "runtime", "local", "alerts.json"))).toBe(true);
    expect(existsSync(join(root, "data", "tenants"))).toBe(false);
    for (const dir of ["servicetitan", "probooks", "trades-app"]) {
      const names = readdirSync(join(root, "data", "inbound", dir));
      expect(names.filter((name) => name.endsWith(".json") || name.endsWith(".csv"))).toEqual([]);
    }
    const text = JSON.stringify(receipt);
    expect(text).toMatch(/"pilot_started":false/);
    expect(text).not.toMatch(/"pilot_started":true/);
    expect(text).not.toMatch(/pilot has started/i);

    const again = await runOptionCPrep({
      cwd: root,
      fixtureDir: FIXTURES,
      now: "2026-09-25T21:22:00Z"
    });
    expect(again.ready).toBe(true);
    expect(again.pilot_started).toBe(false);
    expect(again.config.copiedThisRun).toBe(false);
    expect(again.ledger.hash).not.toBe(receipt.ledger.hash);
  });

  it("refuses a hosted tenant layout and a missing example without claiming a pilot", async () => {
    const root = stageRoot();
    mkdirSync(join(root, "data", "tenants", "gm"), { recursive: true });
    const hosted = await runOptionCPrep({
      cwd: root,
      fixtureDir: FIXTURES,
      now: "2026-09-25T21:23:00Z",
      bootDesk: false
    });
    expect(hosted.ready).toBe(false);
    expect(hosted.pilot_started).toBe(false);
    expect(hosted.checks.find((item) => item.id === "no-hosted-tenants")?.ok).toBe(false);

    const bare = mkdtempSync(join(tmpdir(), "tr-option-c-prep-bare-"));
    const missing = await runOptionCPrep({
      cwd: bare,
      fixtureDir: FIXTURES,
      now: "2026-09-25T21:24:00Z",
      bootDesk: false
    });
    expect(missing.ready).toBe(false);
    expect(missing.pilot_started).toBe(false);
    expect(missing.checks.find((item) => item.id === "config-example-copied")?.ok).toBe(false);
    expect(missing.claim).toMatch(/not started/i);
  });

  it("serves health-local from the desk without tenant data", async () => {
    const root = stageRoot();
    const desk = await startOperatorDesk({ cwd: root, port: 0, persistAlertState: false });
    try {
      const health = (await (await fetch(new URL("/api/health", desk.url))).json()) as {
        pilot_started: boolean;
        live_backends: boolean;
        surface: string;
      };
      expect(health.surface).toBe("health-local");
      expect(health.pilot_started).toBe(false);
      expect(health.live_backends).toBe(false);
    } finally {
      await desk.close();
    }
  });
});
