import { describe, expect, it } from "vitest";
import { defaults, rank, seedEvents } from "./rank";

describe("browser ranking", () => {
  it("has a deterministic cold start and additive explanations", () => {
    const result = rank([], defaults);
    expect(result.items[0].item_id).toBe("blue-hour");
    expect(result.cold_start).toBe(true);
    expect(result).toEqual(rank([], defaults));
    for (const item of result.items) {
      expect(item.score).toBeCloseTo(Object.values(item.trace).reduce((sum, score) => sum + score, 0));
    }
  });

  it("reranks the same frozen pool when exploration changes", () => {
    const low = rank(seedEvents, { ...defaults, exploration: 0 });
    const high = rank(seedEvents, { ...defaults, candidate_ids: low.candidate_ids, exploration: 1 });
    expect(low.candidate_ids).toEqual(high.candidate_ids);
    expect(low.items.map((item) => item.item_id)).not.toEqual(high.items.map((item) => item.item_id));
  });

  it("applies seen, intensity, and genre policies before ranking", () => {
    const result = rank(seedEvents, { ...defaults, exclude_seen: true, intensity: 2, hidden: ["Food"] });
    expect(result.candidate_ids).toEqual(["night-shift", "wild-water"]);
    expect(result.removals).toHaveLength(4);
  });
});
