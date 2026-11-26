"""Evaluate one full-catalog, cutoff-time recommendation per eligible viewer."""

import json
import time
from pathlib import Path

import numpy as np

from .data import GENRES, load, temporal_split
from .models import MODELS, SEED, fit, score

ARTIFACTS = Path("artifacts")
K = 10


def evaluate(history, future, genres, model, name):
    catalog = np.unique(history[:, 1])
    popularity = model["popularity"]
    novelty = -np.log2((popularity + 1) / (popularity.sum() + len(popularity)))
    head = set(sorted(catalog, key=lambda item: (-popularity[item], item))[: max(1, len(catalog) // 5)])
    all_recommended = set()
    samples = []
    genre_hits = np.zeros(len(GENRES), dtype=int)
    genre_targets = genre_hits.copy()
    cold_users = 0
    cold_items = 0
    positives = 0
    genre_intersection = genres.astype(int) @ genres.astype(int).T
    genre_sizes = genres.sum(axis=1)
    for user in np.unique(future[:, 0]):
        past = history[history[:, 0] == user]
        observed = past[:, 1]
        relevant = np.unique(future[(future[:, 0] == user) & (future[:, 2] >= 4), 1])
        positives += len(relevant)
        cold_items += np.count_nonzero(~np.isin(relevant, catalog))
        if not len(past):
            cold_users += 1
            continue
        candidates = catalog[~np.isin(catalog, observed)]
        targets = np.intersect1d(relevant, candidates)
        if not len(targets):
            continue
        scores = score(model, name, int(user), past[past[:, 2] >= 4, 1])
        top = candidates[np.lexsort((candidates, -popularity[candidates], -scores[candidates]))[:K]]
        all_recommended.update(top)
        hits = np.isin(top, targets)
        genre_hits += genres[top[hits]].sum(axis=0)
        genre_targets += genres[targets].sum(axis=0)
        discounts = 1 / np.log2(np.arange(2, len(top) + 2))
        intersection = genre_intersection[np.ix_(top, top)]
        unions = genre_sizes[top, None] + genre_sizes[None, top] - intersection
        distances = 1 - np.divide(intersection, unions, out=np.ones_like(intersection, dtype=float), where=unions > 0)
        pairs = distances[np.triu_indices(len(top), 1)]
        samples.append({
            "history": len(past),
            "recall": float(hits.sum() / len(targets)),
            "ndcg": float((discounts * hits).sum() / discounts[: len(targets)].sum()),
            "mrr": float(1 / (np.argmax(hits) + 1)) if hits.any() else 0,
            "hit_rate": float(hits.any()),
            "diversity": float(pairs.mean()) if len(pairs) else 0,
            "novelty_bits": float(novelty[top].mean()),
            "head_share": float(np.isin(top, list(head)).mean()),
            "head_recall": float(np.isin(top, [t for t in targets if t in head]).sum() / sum(t in head for t in targets))
            if any(t in head for t in targets) else None,
            "tail_recall": float(np.isin(top, [t for t in targets if t not in head]).sum() / sum(t not in head for t in targets))
            if any(t not in head for t in targets) else None,
        })
    summary = {"users": len(samples), "cold_users": cold_users, "cold_positive_items": int(cold_items),
               "positive_pairs": positives, "catalog_size": len(catalog),
               "coverage": len(all_recommended) / max(1, len(catalog))}
    for key in ("recall", "ndcg", "mrr", "hit_rate", "diversity", "novelty_bits", "head_share", "head_recall", "tail_recall"):
        values = [sample[key] for sample in samples if sample[key] is not None]
        summary[key] = float(np.mean(values)) if values else None
        if key.endswith("_recall"):
            summary[f"{key}_users"] = len(values)
    rng = np.random.default_rng(SEED)
    ndcg = np.array([sample["ndcg"] for sample in samples])
    if len(ndcg):
        means = rng.choice(ndcg, size=(1000, len(ndcg)), replace=True).mean(axis=1)
        summary["ndcg_ci95"] = np.quantile(means, [0.025, 0.975]).tolist()
    summary["activity"] = {}
    for label, group in (("sparse", [s for s in samples if s["history"] < 20]),
                         ("active", [s for s in samples if s["history"] >= 20])):
        summary["activity"][label] = {"users": len(group),
                                      "ndcg": float(np.mean([s["ndcg"] for s in group])) if group else None}
    summary["by_genre"] = {genre: {"positive_pairs": int(total), "recall": float(hit / total) if total else None}
                           for genre, hit, total in zip(GENRES, genre_hits, genre_targets, strict=True)}
    return summary


def train():
    started = time.perf_counter()
    events, genres, digest = load()
    training, validation, test, validation_at, test_at = temporal_split(events)
    shape = (int(events[:, 0].max() + 1), len(genres))
    ARTIFACTS.mkdir(exist_ok=True)
    for label, history, cutoff in (("validation", training, validation_at),
                                    ("test", np.concatenate((training, validation)), test_at)):
        model = fit(history, shape)
        np.savez_compressed(ARTIFACTS / f"{label}.npz", **model, cutoff=cutoff, dataset_hash=digest)
    print(json.dumps({"train": len(training), "validation": len(validation), "test": len(test),
                      "validation_at": validation_at, "test_at": test_at, "fit_seconds": time.perf_counter() - started}))


def report():
    events, genres, digest = load()
    training, validation, test, validation_at, test_at = temporal_split(events)
    results = {}
    for label, history, future, cutoff in (
        ("validation", training, validation, validation_at),
        ("test", np.concatenate((training, validation)), test, test_at),
    ):
        with np.load(ARTIFACTS / f"{label}.npz", allow_pickle=False) as artifact:
            if artifact["cutoff"].item() != cutoff or artifact["dataset_hash"].item() != digest:
                raise ValueError("Model artifact does not match dataset or cutoff")
            model = {key: artifact[key] for key in artifact.files}
        results[label] = {name: evaluate(history, future, genres, model, name) for name in MODELS}
    document = {"dataset": "MovieLens 100K", "dataset_hash": f"sha256:{digest}", "version": "ml100k-v1",
                "k": K, "seed": SEED, "validation_cutoff": validation_at, "test_cutoff": test_at,
                "events": {"train": len(training), "validation": len(validation), "test": len(test)},
                "selected": max(MODELS, key=lambda name: results["validation"][name]["ndcg"]), **results}
    path = ARTIFACTS / "evaluation.json"
    path.write_text(json.dumps(document, indent=2) + "\n")
    print(path)
