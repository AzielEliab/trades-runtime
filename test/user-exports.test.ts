import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mappingCheckPlan } from "../src/cli.js";
import { buildMappingCheckBoard, renderMappingCheckPanel } from "../src/desk/mapping-check.js";
import { readInboundRows } from "../src/modules/common.js";
import { admitDropInText, parseCsv } from "../src/spine/drop-in.js";
import { checkMappingText, loadMappingOverrides, mappingsDir, parseMappingOverride, writeStarterOverride } from "../src/spine/platforms/mapping-override.js";

const RECEIVED = "2026-10-19T00:00:00Z";
// Synthetic, shop-shaped columns that the built-in Successware mapper does not know.
const CSV = "# synthetic: true\nCall #,Booked For,Tech,Stage,Ticket Total\nSYN-UX-1,2026-10-01,Synthetic Tech,Done,100\n";
const OVERRIDE = { kind: "successware", csv: { job: { observed: ["booked for"], status: ["stage"], jobTotal: ["ticket total"] } } };

function shop(): string {
  const root = mkdtempSync(join(tmpdir(), "tr-user-exports-"));
  mkdirSync(join(root, "data", "inbound", "successware"), { recursive: true });
  writeFileSync(join(root, "data", "inbound", "successware", "calls.csv"), CSV);
  return root;
}

function withOverride(root: string, body: unknown = OVERRIDE): void {
  mkdirSync(mappingsDir(root, "local"), { recursive: true });
  writeFileSync(join(mappingsDir(root, "local"), "successware.json"), JSON.stringify(body));
}

describe("user-supplied exports and local mapping overrides", () => {
  it("a local override wins over the built-in mapper for a CSV export", () => {
    const before = admitDropInText(CSV, { receivedAt: RECEIVED, fileName: "calls.csv", preferClass: "successware" });
    expect(before.ok && before.records[0]?.observedAt).toBeUndefined();
    const override = parseMappingOverride("successware", OVERRIDE);
    const after = admitDropInText(CSV, { receivedAt: RECEIVED, fileName: "calls.csv", preferClass: "successware", mappingOverrides: { successware: override } });
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.profileId).toBe("successware-csv+local-override");
    expect(after.records[0]).toMatchObject({ externalId: "SYN-UX-1", observedAt: "2026-10-01", status: "Done", ticket: 100 });
    expect(after.live).toBe(false);
    expect(after.write).toBe(false);
    expect(after.verificationStatus).toBe("UNVERIFIED");
  });

  it("a JSON override can name a list the built-in mapper does not know", () => {
    const doc = JSON.stringify({ synthetic: true, workTickets: [{ ticketNo: "SYN-WT-1", when: "2026-10-02", tech: { name: "Synthetic Tech" } }] });
    const none = admitDropInText(doc, { receivedAt: RECEIVED, fileName: "export.json", preferClass: "wintac" });
    expect(none.ok).toBe(false);
    const override = parseMappingOverride("wintac", {
      collections: [{ path: "workTickets", entity: "job", id: ["ticketNo"], observed: ["when"], fields: { technicianName: ["tech.name"] } }]
    });
    const admitted = admitDropInText(doc, { receivedAt: RECEIVED, fileName: "export.json", preferClass: "wintac", mappingOverrides: { wintac: override } });
    expect(admitted.ok && admitted.records[0]).toMatchObject({ entity: "job", externalId: "SYN-WT-1", observedAt: "2026-10-02", technicianName: "Synthetic Tech" });
  });

  it("rejects malformed overrides with a reason, and the loader skips them", () => {
    expect(() => parseMappingOverride("successware", { kind: "jobber" })).toThrow(/does not match/);
    expect(() => parseMappingOverride("successware", { csv: { job: { price: ["x"] } } })).toThrow(/not a field/);
    expect(() => parseMappingOverride("successware", { collections: [{ path: "calls", entity: "job", id: [] }] })).toThrow(/id needs/);
    const root = shop();
    withOverride(root, { csv: { nope: {} } });
    const loaded = loadMappingOverrides(root, "local");
    expect(loaded.overrides.successware).toBeUndefined();
    expect(loaded.errors[0]?.error).toMatch(/not an entity/);
  });

  it("mapping check reports matched, unmatched, and missing required fields and writes a starter that never overwrites", () => {
    const check = checkMappingText("successware", "calls.csv", CSV, undefined, parseCsv);
    expect(check.matched).toEqual(["id <- call # (generic)", "technicianName <- tech (generic)"]);
    expect(check.unmatchedColumns).toEqual(["booked for", "stage", "ticket total"]);
    expect(check.missingRequired).toEqual(["observed"]);
    expect(check.mappingConfidence).toBe("guessed");
    const root = shop();
    const first = writeStarterOverride(root, "local", check);
    expect(first.endsWith(join("mappings", "successware.json"))).toBe(true);
    expect(() => parseMappingOverride("successware", JSON.parse(readFileSync(first, "utf8")))).not.toThrow();
    const second = writeStarterOverride(root, "local", check);
    expect(second.endsWith("successware.starter.json")).toBe(true);

    const fixed = checkMappingText("successware", "calls.csv", CSV, parseMappingOverride("successware", OVERRIDE, "x"), parseCsv);
    expect(fixed.missingRequired).toEqual([]);
    expect(fixed.matched).toContain("observed <- booked for (override)");
    expect(fixed.unmatchedColumns).toEqual([]);
  });

  it("npm run mapping:check plan exits 2 when required fields are missing and 0 after the override", () => {
    const root = shop();
    const plan = mappingCheckPlan("successware", "data/inbound/successware/calls.csv", root, false);
    expect(plan.kind === "text" && plan.exitCode).toBe(2);
    expect(plan.kind === "text" && plan.text).toMatch(/missing required: observed/);
    expect(existsSync(join(mappingsDir(root, "local"), "successware.json"))).toBe(true);
    withOverride(root);
    const again = mappingCheckPlan("successware", "data/inbound/successware/calls.csv", root, true);
    expect(again.kind === "text" && again.exitCode).toBe(0);
    expect(again.kind === "text" && again.text).toMatch(/local override in use/);
    const bad = mappingCheckPlan("not-a-platform", "x.csv", root, true);
    expect(bad.kind === "text" && bad.exitCode).toBe(1);
  });

  it("the desk panel and module rows use the same check and override", () => {
    const root = shop();
    let board = buildMappingCheckBoard(root, "local");
    expect(board.checks).toHaveLength(1);
    expect(board.checks[0]!.missingRequired).toEqual(["observed"]);
    expect(renderMappingCheckPanel(board)).toContain('data-missing="1"');
    withOverride(root);
    board = buildMappingCheckBoard(root, "local");
    expect(board.checks[0]!.missingRequired).toEqual([]);
    const html = renderMappingCheckPanel(board);
    expect(html).toContain('id="mapping-check"');
    expect(html).toContain("local override");
    const rows = readInboundRows({ cwd: root, instanceId: "local" }).filter((row) => row.peerClass === "successware");
    expect(rows[0]).toMatchObject({ profileId: "successware-csv+local-override", observedAt: "2026-10-01" });
  });

  it("override files and shop exports are gitignored", () => {
    const out = execFileSync("git", ["check-ignore", "-v", "data/runtime/local/mappings/successware.json", "data/inbound/successware/calls.csv"], { encoding: "utf8" });
    expect(out).toContain("data/runtime/local/mappings/successware.json");
    expect(out).toContain("data/inbound/successware/calls.csv");
  });
});
