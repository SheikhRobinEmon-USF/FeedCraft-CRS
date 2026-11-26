# Project status

The source archive included specifications for three projects. The original FeedCraft brief is in [docs/BUILD_SPEC.md](docs/BUILD_SPEC.md). The starter prompt embedded in that brief describes the first delivery slice. The implementation covers the FeedCraft P0 milestones and the exploration, replay, and reporting work that those milestones depend on.

| Milestone | Implementation and acceptance checks |
| --- | --- |
| M0 | Locked dependencies, setup commands, original simulated media and licensing, CI definition, exported demo. |
| M1 | Checksum-validated MovieLens 100K ingestion, three time/availability leakage checks, catalog and event contract. |
| M2 | Popularity and itemKNN measured on the same full available catalog; the report shows cohort sizes and cutoffs. |
| M3 | Weighted implicit ALS fitted on real ratings for offline evaluation. A separate seeded synthetic ALS model supports the optional demo API. Candidate filters, cold-start rules, and additive score traces are exercised by unit and API tests. |
| M4 | Six playable simulated clips, three personas, saved clips and session history, feedback-aware refresh, content filters, and keyboard-accessible navigation. |
| M5 | Rank inspector, historical comparison, genre and activity slices, frozen-pool fictional replay, and downloadable experiment JSON. |
| M6 | Browser export, Pages and CI workflow definitions, local Docker API setup, accessibility and browser tests, and a disposable concurrent-request benchmark. GitHub Pages activation depends on repository settings. |

## Recorded verification

- `make data-small train evaluate demo-export` ran the complete pipeline. The archive checksum matched and the split contained 69,997 train, 15,003 validation, and 15,000 test ratings.
- Popularity led validation nDCG@10 at 0.1239 (104 eligible viewers). In the held-out test, nDCG@10 was 0.1554 for popularity, 0.1595 for itemKNN, and 0.1837 for ALS (76 eligible viewers). Selection remained based on validation.
- `make test` runs Ruff, Pytest, TypeScript, ESLint, and Vitest. Playwright runs the viewing and analysis journeys on desktop Chromium and a mobile Chromium profile, with automated axe checks on the discovery route.
- `make benchmark` measures startup to health, the first ALS request, and warm HTTP p50/p95 with 120 requests in batches of 24. The fixture returns six fictional clips for a request of up to 20. Results reflect the local runner and its workload.
- `npm audit` and `pip-audit` reported no known vulnerabilities in the pinned dependency sets at build time.

SQLite is scoped to the loopback demo. The simulator uses fictional popularity and genre overlap. A hosted multi-user API, real streaming platform integrations, neural rankers, and real traffic experiments are deferred.
