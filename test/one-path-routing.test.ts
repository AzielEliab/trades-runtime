import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { admitDropInDocument, admitDropInText, MAPPING_PROFILES } from "../src/spine/drop-in.js";

const RECEIVED = "2026-10-19T00:00:00Z";
const byo = (name: string) => JSON.parse(readFileSync(join(process.cwd(), "test", "fixtures", "byo", name), "utf8")) as Record<string, unknown>;

describe("ServiceM8, Successware, and ServiceTrade have one inbound path each", () => {
  it("the older app profiles route into the platform connector", () => {
    const routed = MAPPING_PROFILES.filter((profile) => profile.routeTo).map((profile) => [profile.id, profile.routeTo]);
    expect(routed).toEqual([
      ["servicem8", "servicem8"],
      ["successware", "successware"],
      ["servicetrade", "servicetrade"]
    ]);
  });

  for (const [file, kind] of [
    ["servicem8-export.json", "servicem8"],
    ["successware-export.json", "successware"],
    ["servicetrade-export.json", "servicetrade"]
  ] as const) {
    it(`${kind}: a sniffed file and a file in the ${kind}/ folder admit the same records`, () => {
      const doc = byo(file);
      const sniffed = admitDropInDocument(doc, { receivedAt: RECEIVED });
      const viaFolder = admitDropInDocument(doc, { receivedAt: RECEIVED, preferClass: kind });
      expect(sniffed.ok && viaFolder.ok).toBe(true);
      if (!sniffed.ok || !viaFolder.ok) return;
      expect(sniffed.peerClass).toBe(kind);
      expect(viaFolder.peerClass).toBe(kind);
      expect(sniffed.records.map((r) => [r.entity, r.externalId, r.shadowHash])).toEqual(viaFolder.records.map((r) => [r.entity, r.externalId, r.shadowHash]));
      expect(sniffed.live).toBe(false);
      expect(sniffed.write).toBe(false);
      expect(sniffed.verificationStatus).toBe("UNVERIFIED");
    });
  }

  it("keeps the older field coverage: ServiceM8 company and Successware technician on the job row", () => {
    const sm8 = admitDropInDocument(byo("servicem8-export.json"), { receivedAt: RECEIVED });
    expect(sm8.ok && sm8.records.find((r) => r.entity === "customer")?.externalId).toBe("SYN-CO-1");
    const sw = admitDropInDocument(byo("successware-export.json"), { receivedAt: RECEIVED });
    expect(sw.ok && sw.records.find((r) => r.entity === "technician")?.externalId).toBe("SYN-SW-T");
    expect(sw.ok && sw.records.find((r) => r.entity === "job")?.technicianName).toBe("Synthetic Tech");
  });

  it("a Successware call CSV goes through the Successware connector's CSV path", () => {
    const csv = readFileSync(join(process.cwd(), "test", "fixtures", "byo", "successware-calls.csv"), "utf8");
    const admitted = admitDropInText(csv, { receivedAt: RECEIVED, fileName: "successware-calls.csv" });
    expect(admitted.ok && admitted.peerClass).toBe("successware");
    expect(admitted.ok && admitted.profileId).toBe("successware-csv");
    expect(admitted.ok && admitted.records[0]?.externalId).toBe("SYN-SW-CSV");
    expect(admitted.ok && admitted.records[0]?.observedAt).toBe("2026-09-20");
  });
});
