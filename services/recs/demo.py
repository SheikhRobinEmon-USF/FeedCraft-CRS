"""Deterministic ranking for the fictional clip catalog."""

import json
from functools import lru_cache
from pathlib import Path

import numpy as np
from scipy.sparse import csr_matrix

from .models import SEED, solve_side

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"
CATALOG = json.loads((FIXTURES / "catalog.json").read_text())
PERSONAS = json.loads((FIXTURES / "personas.json").read_text())
SEED_EVENTS = json.loads((FIXTURES / "seed_events.json").read_text())
ITEMS = {item["id"]: item for item in CATALOG}
GENRES = sorted({genre for item in CATALOG for genre in item["genres"]})
WEIGHTS = {"play": 0.15, "finish": 1, "like": 1.2, "dislike": -1.2, "skip": -0.65,
           "save": 0.8, "unsave": -0.8}


@lru_cache(maxsize=1)
def synthetic_item_factors():
    rng = np.random.default_rng(SEED)
    matrix = []
    for _ in range(160):
        tastes = set(rng.choice(GENRES, size=2, replace=False))
        matrix.append([float(rng.random() < (0.77 if tastes.intersection(item["genres"]) else 0.13))
                       for item in CATALOG])
    matrix = csr_matrix(matrix)
    items = rng.normal(0, 0.08, (len(CATALOG), 4))
    for _ in range(12):
        items = solve_side(matrix.T.tocsr(), solve_side(matrix, items))
    return items


def profile_scores(events, model):
    if model != "als":
        return {}, "catalog-rules-v1"
    weights = {item_id: 0 for item_id in ITEMS}
    for event in events:
        weights[event["item_id"]] += WEIGHTS[event["event_type"]]
    observed = [float(weights[item_id] > 0) for item_id in ITEMS]
    if not any(observed):
        return {}, "catalog-rules-v1"
    factors = synthetic_item_factors()
    user = solve_side(csr_matrix([observed]), factors)[0]
    scores = np.clip(user @ factors.T, 0, 1)
    return dict(zip(ITEMS, scores, strict=True)), "synthetic-als-v1"


def rank(events, policy, n=6, model="rules"):
    retrieval, version = profile_scores(events, model)
    seen = {event["item_id"] for event in events if event["event_type"] in {"finish", "skip", "dislike"}}
    affinity = {}
    evidence = {}
    for event in events:
        item = ITEMS[event["item_id"]]
        for genre in item["genres"]:
            affinity[genre] = affinity.get(genre, 0) + WEIGHTS[event["event_type"]]
            evidence.setdefault(genre, {})[item["id"]] = item["title"]
    interest = set(policy["interests"])
    hidden = set(policy["hidden"])
    pool = set(policy["candidate_ids"]) if policy["candidate_ids"] is not None else set(ITEMS)
    exploration = policy["exploration"]
    removals = []
    available = []
    for item_id, item in ITEMS.items():
        tags = set(item["genres"])
        if item_id not in pool:
            reason = "outside frozen pool"
        elif hidden.intersection(tags):
            reason = "hidden genre"
        elif item["intensity"] > policy["intensity"]:
            reason = "intensity cap"
        elif policy["exclude_seen"] and item_id in seen:
            reason = "seen"
        else:
            available.append(item_id)
            continue
        removals.append({"item_id": item_id, "reason": reason})
    pending = []
    for item_id in available:
        item = ITEMS[item_id]
        tags = item["genres"]
        matches = sorted(interest.intersection(tags))
        net = sum(affinity.get(tag, 0) for tag in tags) / len(tags)
        contributions = {
            "Popularity": 0.54 * item["popularity"],
            "Selected interests": 0.52 * len(matches) / len(tags),
            "Session feedback": (1 - exploration) * 0.43 * max(-1, min(1, net / 3)),
            "Exploration": exploration * 0.85 * (1 - item["popularity"]),
            "Collaborative retrieval": 0.28 * float(retrieval.get(item_id, 0)),
            "Repeat exposure": -0.12 if item_id in seen else 0,
        }
        sources = sorted({title for tag in tags for title in evidence.get(tag, {}).values()})
        pending.append({"item_id": item_id, "trace": contributions, "matches": matches, "sources": sources})
    ranked = []
    used = {}
    while pending and len(ranked) < n:
        options = []
        for row in pending:
            tags = ITEMS[row["item_id"]]["genres"]
            diversity = -policy["diversity_lambda"] * max(used.get(tag, 0) for tag in tags) / max(1, len(ranked))
            score = sum(row["trace"].values()) + diversity
            options.append({**row, "trace": {**row["trace"], "Diversity adjustment": diversity}, "score": score})
        winner = min(options, key=lambda row: (-round(row["score"], 10), row["item_id"]))
        winner["rank"] = len(ranked) + 1
        ranked.append(winner)
        pending = [row for row in pending if row["item_id"] != winner["item_id"]]
        for tag in ITEMS[winner["item_id"]]["genres"]:
            used[tag] = used.get(tag, 0) + 1
    return {"items": ranked, "model_version": version, "candidate_ids": available,
            "cold_start": not interest and not events, "removals": removals}


def simulate(policy, n=4, model="rules"):
    low = rank(SEED_EVENTS, {**policy, "exploration": 0}, n, model)
    high = rank(SEED_EVENTS, {**policy, "exploration": 1, "candidate_ids": low["candidate_ids"]}, n, model)
    return {"synthetic": True, "events": SEED_EVENTS, "familiar": low, "exploratory": high}
