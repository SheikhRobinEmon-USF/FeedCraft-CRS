# FeedCraft

FeedCraft is a recommendation lab for short clips. Pick a fictional profile, swipe or use arrow keys in the screening room, and react to clips. Refresh to watch the playlist reorder, or freeze the candidate pool and change the exploration slider to compare ranks. The Control Room compares three MovieLens baselines and replays a fictional session against two ranking policies.

## Run the browser demo

With Node.js 24, npm, Python 3, and Make installed, run:

```sh
make demo
```

Open [localhost:3000](http://127.0.0.1:3000). Installation downloads locked npm dependencies. After the build, the app needs only its static files. The repository includes the recorded aggregate evaluation, six silent simulated clips with caption tracks, and a browser-local ranker. Preferences and feedback live in the current tab session.

## Run the optional API and research pipeline

Install Python 3.12 and [uv](https://docs.astral.sh/uv/), then run:

```sh
make setup
make data-small train evaluate demo-export
make test
```

Use separate terminals for `make api` and `make web`. Toggle **Use local API with synthetic ALS on refresh** in Preferences. The API docs are at [localhost:8000/docs](http://127.0.0.1:8000/docs). `docker compose up --build` can substitute for `make api` and publishes the API port only on loopback.

For browser tests, install Chromium with `cd apps/web && npx playwright install chromium` and run `make screenshots` from the root. For a disposable local HTTP load test, run `make benchmark`.

## Research records

- [Evaluation protocol](EVALUATION.md) defines the metrics, candidates, and cutoffs.
- [Architecture](ARCHITECTURE.md) describes the ranking stages, API boundaries, and data flow.
- [Data and media sources](DATA_LICENSES.md) documents what the repository distributes.
- [Build status](PROJECT_STATUS.md) records verification and release constraints.
- [FeedCraft specification](docs/BUILD_SPEC.md) preserves the project brief.

## Publish the static demo

Set the repository’s Pages source to **GitHub Actions**. Then run **Deploy browser demo** from the Actions tab. The deployment workflow builds the static export at the configured project path. The optional local API and the raw MovieLens dataset stay local.
