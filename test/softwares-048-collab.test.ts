import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { flagCrossTradeBehavior } from "../src/domain/cross-trade-matrix.js";
import { buildFriction, frictionAsSkillScore, frictionAsTraining } from "../src/domain/friction.js";
import { flagRecognitionBehavior } from "../src/domain/recognition.js";
import {
  buildWorkTogether,
  nameCollaborations,
  SYNTHETIC_COLLABORATION_ASSIGNMENTS,
  syntheticDelayedHandoff,
  syntheticInstallFlag,
  workTogetherFromRevenue
} from "../src/domain/work-together.js";
import { buildOperatorSnapshot } from "../src/desk/snapshot.js";
import { renderDeskPage } from "../src/desk/render.js";
import { renderPrintableSnapshot } from "../src/desk/print.js";
import { startOperatorDesk } from "../src/desk/server.js";
import { defaultAlertConfig } from "../src/desk/alerts.js";

const NOW = "2026-09-27T15:00:00Z";

function emptyFolders(root: string) {
  return (["servicetitan", "probooks", "trades-app"] as const).map((preferClass) => {
    const dir = join(root, "inbound", preferClass);
    mkdirSync(dir, { recursive: true });
    return { dir, preferClass };
  });
}

describe("0.4.8 work together", () => {
  it("names service pairs and install handoffs from Chain D flags, and refuses revenue alone", () => {
    expect(() => workTogetherFromRevenue(900)).toThrow(/revenue alone is not a collaboration suggestion/);
    const raw = flagRecognitionBehavior({
      flagId: "raw-revenue",
      candidate: { kind: "successful-repair", revenue: 900, qualityOk: true, callbackAcceptable: true, rawRevenueOnly: true },
      fromRole: "van",
      toRole: "warehouse"
    });
    expect(raw).toBeUndefined();

    const flags = [
      flagCrossTradeBehavior({ signal: { origin: "hvac", receiving: "electrical", evidenceSupported: true, weight: 0.1 } }),
      flagCrossTradeBehavior({ signal: { origin: "plumbing", receiving: "sewer", evidenceSupported: false, weight: 0.4 } }),
      syntheticInstallFlag(NOW),
      syntheticDelayedHandoff()
    ];
    const board = buildWorkTogether({
      source: "synthetic-demo",
      collaborations: nameCollaborations({ flags, assignments: SYNTHETIC_COLLABORATION_ASSIGNMENTS })
    });
    expect(board.hostedHr).toBe(false);
    expect(board.companyExport).toBe(false);
    expect(board.notASkillScore).toBe(true);
    expect(board.trainingSeparate).toBe(true);
    expect(board.live_backends).toBe(false);
    expect(board.pairs.every((pair) => pair.lastPersonBlamed === false)).toBe(true);
    const service = board.suggestions.service.map((row) => row.text).join("\n");
    expect(service).toMatch(/When a service tech is needed, pair Maya Chen \(hvac\) with Priya Shah \(electrical\)/);
    expect(service).toMatch(/Do not pair Luis Ortega \(plumbing\) with Andre Cole \(sewer\)/);
    expect(service).toMatch(/Priya Shah \(electrical\) should hand off to Maya Chen \(hvac\)/);
    expect(service).not.toMatch(/When a service tech is needed, pair Luis Ortega/);
    expect(board.suggestions.install.map((row) => row.text).join("\n")).toMatch(
      /Hand install from Sam Okonkwo \(cross-trades\) to Maya Chen \(hvac\)/
    );
    expect(board.suggestions.service.every((row) => row.fromRevenueAlone === false)).toBe(true);
    expect(board.suggestions.install.every((row) => row.fromRevenueAlone === false)).toBe(true);
  });

  it("does not invent suggestions when flags are absent", () => {
    const board = buildWorkTogether({ source: "local-flags", collaborations: [] });
    expect(board.source).toBe("none");
    expect(board.suggestions.service).toEqual([]);
    expect(board.suggestions.install).toEqual([]);
    expect(board.note).toMatch(/not invented/);
  });
});

describe("0.4.8 employee friction rate", () => {
  it("keeps a silent export unknown and refuses skill and training use", () => {
    expect(() => frictionAsSkillScore()).toThrow(/not technician skill/);
    expect(() => frictionAsTraining()).toThrow(/not a training flag/);
    const silent = buildFriction({
      source: "admitted-rows",
      jobs: [
        { technicianId: "tech-ada", technicianName: "Ada", department: "hvac", callback: "unknown" },
        { technicianId: "tech-ben", technicianName: "Ben", department: "plumbing", callback: "unknown" }
      ],
      collaborations: []
    });
    expect(silent.source).toBe("unknown");
    expect(silent.hostedHr).toBe(false);
    expect(silent.employees.every((row) => row.frictionRate == null && row.frictionRank == null)).toBe(true);
    expect(silent.note).toMatch(/silent export/);
  });

  it("counts explicit callbacks when no handoff flags exist", () => {
    const board = buildFriction({
      source: "admitted-rows",
      jobs: [
        { technicianId: "tech-ada", technicianName: "Ada", department: "hvac", callback: "no" },
        { technicianId: "tech-ben", technicianName: "Ben", department: "plumbing", callback: "yes" }
      ],
      collaborations: []
    });
    expect(board.source).toBe("admitted-rows");
    expect(board.employees.map((row) => row.label)).toEqual(["Ben", "Ada"]);
    expect(board.employees[0]).toMatchObject({ frictionRank: 1, frictionRate: 1, callbacks: 1 });
    expect(board.employees[1]).toMatchObject({ frictionRank: 2, frictionRate: 0, callbacks: 0 });
  });
});

describe("0.4.8 desk collaboration and friction", () => {
  it("shows suggestions and friction beside the synthetic performance board", async () => {
    const root = mkdtempSync(join(tmpdir(), "tr-collab-"));
    const folders = emptyFolders(root);
    const snapshot = buildOperatorSnapshot({
      cwd: root,
      now: NOW,
      folders,
      alertConfig: defaultAlertConfig(),
      persistAlertState: false
    });
    expect(snapshot.workTogether.source).toBe("synthetic-demo");
    expect(snapshot.workTogether.hostedHr).toBe(false);
    expect(snapshot.workTogether.suggestions.service.some((row) => row.text.includes("pair Maya Chen"))).toBe(true);
    expect(snapshot.workTogether.suggestions.install.some((row) => row.text.includes("Hand install from Sam Okonkwo"))).toBe(true);
    expect(snapshot.workTogether.suggestions.service.some((row) => row.basis === "quality-gate-miss")).toBe(false);
    expect(snapshot.friction.source).toBe("synthetic-demo");
    expect(snapshot.friction.hostedHr).toBe(false);
    const byName = Object.fromEntries(snapshot.friction.employees.map((row) => [row.label, row]));
    expect(byName["Andre Cole"]?.frictionRank).toBe(1);
    expect(byName["Luis Ortega"]?.frictionRank).toBe(2);
    expect(byName["Andre Cole"]?.frictionRate).toBe(byName["Luis Ortega"]?.frictionRate);
    expect(byName["Andre Cole"]?.frictionRate).toBeCloseTo(0.6667, 4);
    expect(byName["Priya Shah"]?.frictionRate).toBe(0.5);
    expect(byName["Maya Chen"]).toMatchObject({ frictionRate: 0.3333, negativeFlags: 1, delayedHandoffs: 1 });
    expect(byName["Sam Okonkwo"]).toMatchObject({ frictionRate: 0, negativeFlags: 0, frictionRank: 5 });
    expect(snapshot.performance.employees[0]?.id).toBe("tech-sam");
    expect(byName["Sam Okonkwo"]?.frictionRank).not.toBe(1);
    const priya = snapshot.huddle.techs.find((tech) => tech.id === "tech-priya");
    expect(priya?.trainingNeeded.severity).toBe("needed");
    expect(snapshot.friction.employees.every((row) => row.trainingSeparate && row.notASkillScore && row.lastPersonBlamed === false)).toBe(true);
    expect(snapshot.friction.departments.some((row) => row.id === "warehouse")).toBe(true);
    expect(snapshot.performance.departments.some((row) => row.id === "warehouse")).toBe(false);

    const html = renderDeskPage(snapshot);
    expect(html).toContain("Work together");
    expect(html).toContain("Friction, highest first");
    expect(html).toContain("Friction rate");
    expect(html).toContain("/api/work-together");
    expect(html).toContain("/api/friction");
    expect(html).toContain("When a service tech is needed, pair Maya Chen");
    expect(html).toContain("Hand install from Sam Okonkwo");
    expect(html).toContain("hosted HR false");
    const receipt = renderPrintableSnapshot(snapshot);
    expect(receipt).toContain("Work together");
    expect(receipt).toContain("Friction, highest first");
    expect(receipt).toContain("Andre Cole");
    expect(receipt).toContain("Hand install from Sam Okonkwo");

    const desk = await startOperatorDesk({
      port: 0,
      cwd: root,
      folders,
      now: NOW,
      alertConfig: defaultAlertConfig(),
      alertStatePath: join(root, "alert-state.json"),
      persistAlertState: false
    });
    try {
      const together = (await (await fetch(`${desk.url}api/work-together`)).json()) as {
        live_backends: boolean;
        writes: boolean;
        phoneHome: boolean;
        pilot_started: boolean;
        hostedHr: boolean;
        notASkillScore: boolean;
        workTogether: { suggestions: { install: { text: string }[] } };
      };
      expect(together.live_backends).toBe(false);
      expect(together.writes).toBe(false);
      expect(together.phoneHome).toBe(false);
      expect(together.pilot_started).toBe(false);
      expect(together.hostedHr).toBe(false);
      expect(together.notASkillScore).toBe(true);
      expect(together.workTogether.suggestions.install[0]?.text).toMatch(/Sam Okonkwo/);
      const friction = (await (await fetch(`${desk.url}api/friction`)).json()) as {
        hostedHr: boolean;
        trainingSeparate: boolean;
        companyExport: boolean;
        friction: { employees: { label: string; frictionRank: number }[]; source: string };
      };
      expect(friction.hostedHr).toBe(false);
      expect(friction.trainingSeparate).toBe(true);
      expect(friction.companyExport).toBe(false);
      expect(friction.friction.source).toBe("synthetic-demo");
      expect(friction.friction.employees[0]?.label).toBe("Andre Cole");
    } finally {
      await desk.close();
    }
  });

  it("keeps admitted desks from inventing pairs, and uses explicit callbacks for friction", () => {
    const root = mkdtempSync(join(tmpdir(), "tr-collab-byo-"));
    const folders = emptyFolders(root);
    writeFileSync(
      join(folders[2]!.dir, "jobs.json"),
      JSON.stringify({
        synthetic: true,
        records: [
          {
            job_id: "JOB-1",
            status: "completed",
            trade: "hvac",
            technicianId: "tech-ada",
            technicianName: "Ada",
            scheduled_at: "2026-09-27T15:00:00Z",
            isCallback: false,
            ticket: 500,
            revenue: 500
          },
          {
            job_id: "JOB-2",
            status: "completed",
            trade: "plumbing",
            technicianId: "tech-ben",
            technicianName: "Ben",
            scheduled_at: "2026-09-27T15:00:00Z",
            isCallback: true,
            ticket: 200,
            revenue: 200
          }
        ]
      })
    );
    const admitted = buildOperatorSnapshot({
      cwd: root,
      now: NOW,
      folders,
      alertConfig: defaultAlertConfig(),
      persistAlertState: false
    });
    expect(admitted.workTogether.source).toBe("none");
    expect(admitted.workTogether.suggestions.service).toEqual([]);
    expect(admitted.workTogether.suggestions.install).toEqual([]);
    expect(admitted.friction.source).toBe("admitted-rows");
    expect(admitted.friction.employees.map((row) => row.label)).toEqual(["Ben", "Ada"]);
    expect(admitted.performance.employees[0]?.label).not.toBe(admitted.friction.employees[0]?.label);

    const silentRoot = mkdtempSync(join(tmpdir(), "tr-collab-silent-"));
    const silentFolders = emptyFolders(silentRoot);
    writeFileSync(
      join(silentFolders[2]!.dir, "jobs.json"),
      JSON.stringify({
        synthetic: true,
        records: [
          {
            job_id: "JOB-S",
            status: "completed",
            trade: "hvac",
            technicianId: "tech-ada",
            technicianName: "Ada",
            scheduled_at: "2026-09-27T15:00:00Z"
          }
        ]
      })
    );
    const silent = buildOperatorSnapshot({
      cwd: silentRoot,
      now: NOW,
      folders: silentFolders,
      alertConfig: defaultAlertConfig(),
      persistAlertState: false
    });
    expect(silent.workTogether.source).toBe("none");
    expect(silent.friction.source).toBe("unknown");
    expect(silent.friction.employees[0]?.frictionRate).toBeNull();
    expect(silent.friction.employees[0]?.frictionRank).toBeNull();
  });
});
