import { describe, expect, it } from "vitest";
import { PLATFORM_KINDS, PLATFORM_SPECS } from "../src/spine/platforms/catalog.js";
import { LOCAL_PLATFORM_PEERS } from "../workers/giveaway/src/local-catalog.js";

describe("public Worker catalog stays in sync with the local platform specs", () => {
  it("lists every platform peer with the same mode and mapping confidence", () => {
    expect(LOCAL_PLATFORM_PEERS.map((p) => p.kind)).toEqual([...PLATFORM_KINDS]);
    for (const peer of LOCAL_PLATFORM_PEERS) {
      const spec = PLATFORM_SPECS[peer.kind as (typeof PLATFORM_KINDS)[number]];
      expect(peer.label).toBe(spec.label);
      expect(peer.mode).toBe(spec.api.livePull ? "file-drop+read-pull" : "file-drop");
      expect(peer.mappingConfidence).toBe(spec.mappingConfidence);
    }
  });
});
