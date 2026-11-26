export const modelTitles = { popularity: "Popularity", itemknn: "ItemKNN", als: "Implicit ALS" } as const;
export type Model = keyof typeof modelTitles;

export type Metrics = {
  users: number; cold_users: number; cold_positive_items: number; catalog_size: number; positive_pairs: number;
  ndcg: number; recall: number; mrr: number; hit_rate: number; coverage: number; diversity: number;
  novelty_bits: number; head_share: number; head_recall: number | null; tail_recall: number | null;
  head_recall_users: number; tail_recall_users: number;
  by_genre: Record<string, { positive_pairs: number; recall: number | null }>;
  ndcg_ci95: [number, number]; activity: Record<string, { users: number; ndcg: number | null }>;
};

export type Report = {
  dataset: string; dataset_hash: string; version: string; k: number; seed: number; selected: Model;
  validation_cutoff: number; test_cutoff: number; events: Record<string, number>;
  test: Record<Model, Metrics>; validation: Record<Model, Metrics>;
};
