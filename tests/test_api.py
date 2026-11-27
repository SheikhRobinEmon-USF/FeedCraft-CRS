import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from services.api import app as server
from services.recs.demo import CATALOG, SEED_EVENTS, rank


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setattr(server, "DB_PATH", tmp_path / "demo.db")
    server.app.state.rate_window.clear()
    with TestClient(server.app) as client:
        yield client


def session(client):
    response = client.post("/api/demo/session", json={"profile_id": "cold"})
    assert response.status_code == 201
    return {"Authorization": f"Bearer {response.json()['token']}"}


def test_bounded_input_and_model_allowlist(client):
    assert client.post("/api/recommendations", json={}).status_code == 401
    auth = session(client)
    for payload in ({"n": 21}, {"ranking_policy": {"exploration": 1.5}}, {"model_version": "../elsewhere"},
                    {"profile_id": "other"}, {"ranking_policy": {"hidden": ["unknown"]}}):
        assert client.post("/api/recommendations", headers=auth, json=payload).status_code == 422
    assert client.post("/api/recommendations", headers=auth, content=b"x" * 17_000).status_code == 413


def test_session_isolation_idempotency_and_reset(client):
    auth, stranger = session(client), session(client)
    event = {"item_id": "wild-water", "event_type": "like", "event_id": "sample-000"}
    assert client.post("/api/interactions", headers=auth, json=event).json()["duplicate"] is False
    assert client.post("/api/interactions", headers=auth, json=event).json()["duplicate"] is True
    assert client.post("/api/interactions", headers=auth, json={**event, "event_type": "skip"}).status_code == 409
    ranking = client.post("/api/recommendations", headers=auth, json={"model_version": "als"}).json()
    assert ranking["model_version"] == "synthetic-als-v1"
    assert any(row["trace"]["Collaborative retrieval"] > 0 for row in ranking["items"])
    trace = f"/api/recommendations/{ranking['request_id']}/trace"
    assert client.get(trace, headers=auth).json() == ranking
    assert client.get(trace, headers=stranger).status_code == 404
    assert client.post("/api/recommendations", headers=stranger, json={}).json()["cold_start"]
    assert client.post("/api/demo/reset", headers=auth).json()["reset"]
    assert client.get(trace, headers=auth).status_code == 404
    assert client.post("/api/recommendations", headers=auth, json={"model_version": "als"}).json()["model_version"] == "catalog-rules-v1"


def test_catalog_and_simulator(client):
    page = client.get("/api/catalog?limit=2").json()
    second = client.get(f"/api/catalog?cursor={page['next_cursor']}&limit=2").json()
    assert not ({row["id"] for row in page["items"]} & {row["id"] for row in second["items"]})
    result = client.post("/api/lab/replay", json={"n": 4}, headers=session(client)).json()
    assert result["synthetic"]
    assert result["familiar"]["candidate_ids"] == result["exploratory"]["candidate_ids"]
    assert result["familiar"]["items"] != result["exploratory"]["items"]


def test_catalog_pages_and_frozen_pool_include_every_clip(client):
    expected = [clip["id"] for clip in CATALOG]
    assert len(expected) >= 100
    ids = []
    cursor = 0
    while cursor is not None:
        page = client.get(f"/api/catalog?limit=50&cursor={cursor}").json()
        ids.extend(clip["id"] for clip in page["items"])
        cursor = page["next_cursor"]
    assert ids == expected

    response = client.post("/api/recommendations", headers=session(client),
                           json={"n": 20, "ranking_policy": {"candidate_ids": ids}})
    assert response.status_code == 200
    ranked = response.json()
    assert ranked["candidate_ids"] == expected
    assert len({row["item_id"] for row in ranked["items"]}) == 20


def test_trace_contributions_and_filters():
    result = rank(SEED_EVENTS, server.Policy(exclude_seen=True, hidden=["Food"], intensity=2).model_dump())
    assert result == rank(SEED_EVENTS, server.Policy(exclude_seen=True, hidden=["Food"], intensity=2).model_dump())
    assert {"blue-hour", "deep-listening", "the-ascent", "flour-and-time"}.isdisjoint(result["candidate_ids"])
    for row in result["items"]:
        assert row["score"] == pytest.approx(sum(row["trace"].values()))


def test_committed_contracts_match_backend():
    for name, model in (("interaction", server.Event), ("recommendations", server.Recommendation)):
        path = Path(f"packages/contracts/{name}.schema.json")
        assert json.loads(path.read_text()) == model.model_json_schema()
