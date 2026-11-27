import { catalog, defaults, items, rank } from "./rank";

const scenarios: { label: string; genre: string; interests: string[]; feedback: string[] }[] = [
  { label: "Documentary preference", genre: "Documentary", interests: ["Documentary"], feedback: [] },
  { label: "Sports preference", genre: "Sports", interests: ["Sports"], feedback: [] },
  { label: "Food feedback", genre: "Food", interests: [], feedback: ["first-pour", "market-colors"] },
];

export function runCatalogChecks() {
  return scenarios.map(({ label, genre, interests, feedback }) => {
    // Remove the two liked items from both pools. A feedback gain must come from recommending different clips.
    const candidates = catalog.map(({ id }) => id).filter((id) => !feedback.includes(id));
    const policy = { ...defaults, candidate_ids: candidates };
    const baseline = rank([], policy, 10).items.map((row) => row.item_id);
    const events = feedback.map((item_id) => ({ item_id, event_type: "like" as const }));
    const personalized = rank(events, { ...policy, interests }, 10).items.map((row) => row.item_id);
    const countMatches = (ids: string[]) => ids.filter((id) => items[id].genres.includes(genre)).length;
    return {
      label, genre, candidateCount: candidates.length, topK: baseline.length,
      baselineMatches: countMatches(baseline), personalizedMatches: countMatches(personalized),
      sharedClips: baseline.filter((id) => personalized.includes(id)).length,
    };
  });
}
