import { existsSync } from "node:fs";
import { runCatalogChecks } from "./catalog-checks";
import { describe, expect, it } from "vitest";
import { catalog, defaults, genres, rank, seedEvents } from "./rank";

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
    const originalIds = ["blue-hour", "night-shift", "the-ascent", "deep-listening", "flour-and-time", "wild-water"];
    const result = rank(seedEvents, { ...defaults, candidate_ids: originalIds, exclude_seen: true, intensity: 2, hidden: ["Food"] });
    expect(result.candidate_ids).toEqual(["night-shift", "wild-water"]);
    expect(result.removals).toHaveLength(catalog.length - 2);
  });

  it("uses the latest vote and bookmark state when replaying existing histories", () => {
    const like = { item_id: "blue-hour", event_type: "like" as const };
    const dislike = { ...like, event_type: "dislike" as const };
    const save = { ...like, event_type: "save" as const };
    const unsave = { ...like, event_type: "unsave" as const };
    const policy = { ...defaults, exclude_seen: true };
    expect(rank([like, like], policy)).toEqual(rank([like], policy));
    expect(rank([dislike, like], policy)).toEqual(rank([like], policy));
    expect(rank([like, dislike], policy)).toEqual(rank([dislike], policy));
    expect(rank([save, save, unsave], policy)).toEqual(rank([], policy));
  });

  it("promotes target genres across the expanded pool while excluding liked clips from the comparison", () => {
    const checks = runCatalogChecks();
    expect(checks.filter((check) => check.label.endsWith("preference")).every((check) => check.candidateCount === catalog.length)).toBe(true);
    expect(checks.filter((check) => check.label.endsWith("feedback")).every((check) => check.candidateCount === catalog.length - 2)).toBe(true);
    for (const check of checks) {
      expect(check.topK).toBe(10);
      expect(check.personalizedMatches).toBeGreaterThan(check.baselineMatches);
      expect(check.sharedClips).toBeLessThan(check.topK);
    }
  });
});

it("has a complete media triplet for each clip in the 10-genre catalog", () => {
  expect(new Set(catalog.map((clip) => clip.id)).size).toBe(catalog.length);
  expect(catalog.length).toBeGreaterThanOrEqual(100);
  expect(genres).toHaveLength(10);
  for (const { id } of catalog) {
    for (const extension of ["mp4", "webp", "vtt"]) {
      expect(existsSync(new URL(`../public/demo/${id}.${extension}`, import.meta.url)), `${id}.${extension}`).toBe(true);
    }
  }
});
