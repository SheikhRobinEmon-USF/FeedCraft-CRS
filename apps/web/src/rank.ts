import catalog from "../../../fixtures/catalog.json";
import personas from "../../../fixtures/personas.json";
import seed from "../../../fixtures/seed_events.json";

export { catalog, personas };
export const genres = [...new Set(catalog.flatMap((item) => item.genres))].sort();
export const items = Object.fromEntries(catalog.map((item) => [item.id, item]));
export const weights = { play: 0.15, finish: 1, like: 1.2, dislike: -1.2, skip: -0.65, save: 0.8, unsave: -0.8 };
export type Kind = keyof typeof weights;
type Signal = { item_id: string; event_type: Kind };
export type Event = Signal & { event_id: string };
export type Policy = {
  exploration: number; diversity_lambda: number; interests: string[]; hidden: string[];
  intensity: number; exclude_seen: boolean; candidate_ids: string[] | null;
};
export type Row = { item_id: string; score: number; rank: number; matches: string[]; sources: string[]; trace: Record<string, number> };
export type Ranking = {
  items: Row[]; model_version: string; candidate_ids: string[]; cold_start: boolean;
  removals: { item_id: string; reason: string }[]; request_id?: string; latency_ms?: number;
};
export const defaults: Policy = { exploration: 0.25, diversity_lambda: 0.22, interests: [], hidden: [],
  intensity: 3, exclude_seen: false, candidate_ids: null };
export const seedEvents = seed as Pick<Event, "item_id" | "event_type">[];
export const base = process.env.NEXT_PUBLIC_BASE_PATH || "";

export function asset(id: string, ext: string) {
  return `${base}/demo/${id}.${ext}`;
}

function effectiveSignals(events: Signal[]) {
  const reactions = new Set<string>();
  const saves = new Set<string>();
  return events.toReversed().filter(({ item_id, event_type }) => {
    if (event_type === "like" || event_type === "dislike") {
      if (reactions.has(item_id)) return false;
      reactions.add(item_id);
    } else if (event_type === "save" || event_type === "unsave") {
      if (saves.has(item_id)) return false;
      saves.add(item_id);
      return event_type === "save";
    }
    return true;
  }).reverse();
}

export function rank(events: Signal[], policy: Policy, n = 6): Ranking {
  const signals = effectiveSignals(events);
  const seen = new Set(signals.filter((event) => ["finish", "skip", "dislike"].includes(event.event_type)).map((event) => event.item_id));
  const affinity = new Map<string, number>();
  const evidence = new Map<string, Set<string>>();
  for (const event of signals) {
    const item = items[event.item_id];
    for (const tag of item.genres) {
      affinity.set(tag, (affinity.get(tag) ?? 0) + weights[event.event_type]);
      const titles = evidence.get(tag) ?? new Set<string>();
      titles.add(item.title);
      evidence.set(tag, titles);
    }
  }
  const removals: Ranking["removals"] = [];
  const pending = catalog.flatMap((item) => {
    const reason = policy.candidate_ids !== null && !policy.candidate_ids.includes(item.id) ? "outside frozen pool"
      : item.genres.some((tag) => policy.hidden.includes(tag)) ? "hidden genre"
      : item.intensity > policy.intensity ? "intensity cap"
      : policy.exclude_seen && seen.has(item.id) ? "seen" : null;
    if (reason) {
      removals.push({ item_id: item.id, reason });
      return [];
    }
    const matches = item.genres.filter((tag) => policy.interests.includes(tag)).sort();
    const net = item.genres.reduce((sum, tag) => sum + (affinity.get(tag) ?? 0), 0) / item.genres.length;
    const trace: Row["trace"] = {
      Popularity: 0.54 * item.popularity,
      "Selected interests": 0.52 * matches.length / item.genres.length,
      "Session feedback": (1 - policy.exploration) * 0.43 * Math.max(-1, Math.min(1, net / 3)),
      Exploration: policy.exploration * 0.85 * (1 - item.popularity),
      "Collaborative retrieval": 0,
      "Repeat exposure": seen.has(item.id) ? -0.12 : 0,
    };
    return [{ item_id: item.id, matches, trace, sources: [...new Set(item.genres.flatMap((tag) => [...(evidence.get(tag) ?? [])]))].sort() }];
  });
  const candidate_ids = pending.map((row) => row.item_id);
  const result: Row[] = [];
  const used = new Map<string, number>();
  const comparable = (value: number) => Math.round(value * 1e10);
  while (pending.length && result.length < n) {
    const options = pending.map((row, index) => {
      const adjustment = -policy.diversity_lambda * Math.max(...items[row.item_id].genres.map((tag) => used.get(tag) ?? 0)) / Math.max(1, result.length);
      const score = Object.values(row.trace).reduce((sum, value) => sum + value, adjustment);
      return { ...row, index, score, trace: { ...row.trace, "Diversity adjustment": adjustment } };
    });
    options.sort((a, b) => comparable(b.score) - comparable(a.score) || (a.item_id < b.item_id ? -1 : 1));
    const { index, ...winner } = options[0];
    pending.splice(index, 1);
    result.push({ ...winner, rank: result.length + 1 });
    for (const tag of items[winner.item_id].genres) used.set(tag, (used.get(tag) ?? 0) + 1);
  }
  return { items: result, model_version: "catalog-rules-v1", candidate_ids, removals,
    cold_start: !signals.length && !policy.interests.length, request_id: "local-current" };
}
