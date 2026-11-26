# MovieLens 100K evaluation

Run `make data-small train evaluate demo-export` using Python 3.12 and the pinned dependencies. The pipeline validates the archive digest, sorts events by timestamp, fits fixed-seed models, and produces `artifacts/evaluation.json`. The export copies the aggregate JSON to the web app.

## Temporal protocol

Global cutoffs are computed at the 70th and 85th percentiles of observed timestamps. All boundary ties stay on the later side. The run contains 69,997 train, 15,003 validation, and 15,000 test ratings. Validation ranks from train history. The fixed models are refitted on train plus validation for test. Selection is made by validation nDCG@10. ALS uses 24 factors, 12 iterations, confidence 1 + 20 for positive observations, regularization 0.2, and seed 42. ItemKNN retains 60 neighbors per item.

Each viewer gets one recommendation list at the cutoff. Candidates include every item observed before that cutoff except the viewer’s prior ratings. Ratings of four or five count as positives. Missing ratings are unjudged. The eligible population has prior history and an available, unseen positive in the evaluation window. Positive pairs for unavailable items and viewers with no history are counted separately. Item availability is inferred from the first historical observation, so an already available movie without a rating can be excluded. Popularity breaks model score ties before ascending item ID.

## Metrics

- **Recall@10** is retrieved positives divided by eligible positives. **nDCG@10** divides discounted binary gains by the ideal discounted gain for up to ten positives. **MRR@10** is reciprocal rank of the first hit, or zero. **Hit rate** is the share of viewers with at least one hit.
- **Catalog coverage** uses unique recommended items divided by the cutoff catalog. **Genre diversity** is mean pairwise Jaccard distance of MovieLens genre vectors. **Novelty** is mean smoothed self-information of recommended item popularity in bits. **Head share** is the recommendation share in the top popularity quintile.
- **Genre recall** is micro-averaged over eligible positive viewer–movie pairs tagged with each genre. Multi-genre pairs appear in each applicable slice.
- **Activity slices** use fewer than 20 prior ratings for sparse viewers. Head and long-tail recall use the same history-derived popularity quintile. The rater bootstrap reports a 95% percentile interval for mean nDCG, using 1,000 resamples.
- These metrics reflect an older explicit-rating sample. Filtering and the global cutoff substantially reduce evaluation cohort size. The uncertainty intervals are conditional on the chosen split and weighting. They omit model stability over alternative cutoffs and give no estimate of clip watch time or real engagement.

See the committed [evaluation JSON](apps/web/public/demo/evaluation.json) for both splits, sample sizes, and all model results.
