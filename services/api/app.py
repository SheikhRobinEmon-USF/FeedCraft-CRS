"""Loopback demo API. Each opaque bearer capability owns one fictional session."""

import hashlib
import json
import os
import secrets
import sqlite3
import time
from collections import deque
from contextlib import asynccontextmanager, closing, contextmanager
from pathlib import Path
from threading import Lock
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, field_validator
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from services.recs.demo import CATALOG, GENRES, ITEMS, PERSONAS, rank, simulate


@asynccontextmanager
async def lifespan(_app):
    with database() as connection:
        connection.execute("PRAGMA journal_mode=WAL")
        connection.executescript(SCHEMA)
    yield


app = FastAPI(title="FeedCraft", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
                   allow_methods=["GET", "POST"], allow_headers=["Authorization", "Content-Type"])
DB_PATH = Path(os.getenv("FEEDCRAFT_DB", "data/demo.db"))
REPORT = Path("apps/web/public/demo/evaluation.json")
app.state.rate_window = deque()
app.state.rate_lock = Lock()
app.state.write_lock = Lock()
SESSION_LIFETIME = 86_400
MAX_REQUESTS_PER_MINUTE = 1800
MAX_BODY = 16_384


class LimitRequests:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        with app.state.rate_lock:
            window = app.state.rate_window
            now = time.monotonic()
            while window and window[0] <= now - 60:
                window.popleft()
            limited = len(window) >= MAX_REQUESTS_PER_MINUTE
            if not limited:
                window.append(now)
        if limited:
            await JSONResponse({"detail": "Request limit reached"}, status_code=429)(scope, receive, send)
            return
        if scope["method"] != "POST":
            await self.app(scope, receive, send)
            return
        body = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body", b"")
            if len(body) + len(chunk) > MAX_BODY:
                await JSONResponse({"detail": "Request too large"}, status_code=413)(scope, receive, send)
                return
            body.extend(chunk)
            if not message.get("more_body"):
                break
        sent = False

        async def replay():
            nonlocal sent
            if sent:
                return await receive()
            sent = True
            return {"type": "http.request", "body": bytes(body), "more_body": False}

        await self.app(scope, replay, send)


app.add_middleware(LimitRequests)


SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY, profile_id TEXT NOT NULL, created REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
    seq INTEGER PRIMARY KEY, session TEXT REFERENCES sessions ON DELETE CASCADE,
    event_id TEXT NOT NULL, item_id TEXT NOT NULL, event_type TEXT NOT NULL,
    event_ts REAL NOT NULL, UNIQUE(session, event_id)
);
CREATE TABLE IF NOT EXISTS requests (
    request_id TEXT PRIMARY KEY, session TEXT REFERENCES sessions ON DELETE CASCADE,
    trace TEXT NOT NULL, created REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS requests_session_created ON requests(session, created);
CREATE INDEX IF NOT EXISTS sessions_created ON sessions(created);
"""

@contextmanager
def database():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(DB_PATH, timeout=5)) as connection, connection:
        connection.execute("PRAGMA foreign_keys=ON")
        yield connection


def digest(token):
    return hashlib.sha256(token.encode()).hexdigest()


def session(authorization: Annotated[str | None, Header()] = None):
    if not authorization or not authorization.startswith("Bearer ") or len(authorization) != 50:
        raise HTTPException(401, "A demo session token is required")
    session_key = digest(authorization[7:])
    with database() as connection:
        result = connection.execute("SELECT created FROM sessions WHERE token_hash = ?", (session_key,)).fetchone()
    if not result or result[0] <= time.time() - SESSION_LIFETIME:
        raise HTTPException(401, "Demo session expired or invalid")
    return session_key


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Profile(Strict):
    profile_id: Literal["cold", "focused", "curious"] = "cold"


class Event(Strict):
    event_id: str = Field(pattern=r"^[a-zA-Z0-9_-]{8,64}$")
    item_id: str = Field(min_length=1, max_length=40)
    event_type: Literal["play", "finish", "skip", "like", "dislike", "save", "unsave"]

    @field_validator("item_id")
    @classmethod
    def known_item(cls, value):
        if value not in ITEMS:
            raise ValueError("Unknown clip")
        return value


class Policy(Strict):
    exploration: float = Field(default=0.25, ge=0, le=1)
    diversity_lambda: float = Field(default=0.22, ge=0, le=1)
    interests: list[str] = Field(default_factory=list, max_length=len(GENRES))
    hidden: list[str] = Field(default_factory=list, max_length=len(GENRES))
    intensity: int = Field(default=3, ge=1, le=3)
    exclude_seen: bool = False
    candidate_ids: list[str] | None = Field(default=None, max_length=len(ITEMS))

    @field_validator("interests", "hidden")
    @classmethod
    def known_genres(cls, values):
        if not set(values).issubset(GENRES):
            raise ValueError("Unknown genre")
        return values

    @field_validator("candidate_ids")
    @classmethod
    def known_candidates(cls, values):
        if values is not None and not set(values).issubset(ITEMS):
            raise ValueError("Unknown candidate")
        return values


class Recommendation(Strict):
    n: int = Field(default=6, ge=1, le=20)
    ranking_policy: Policy = Field(default_factory=Policy)
    model_version: Literal["rules", "als"] = "rules"


def history(connection, key):
    return [{"item_id": item, "event_type": kind} for item, kind in connection.execute(
        "SELECT item_id, event_type FROM events WHERE session = ? ORDER BY seq", (key,)
    )]


@app.get("/health")
def health():
    return {"status": "ok", "mode": "local-fictional-demo"}


@app.get("/api/catalog")
def catalog(genre: str | None = None, cursor: int = Query(0, ge=0, le=10_000), limit: int = Query(6, ge=1, le=50)):
    if genre is not None and genre not in GENRES:
        raise HTTPException(422, "Unknown genre")
    items = [item for item in CATALOG if genre is None or genre in item["genres"]]
    end = cursor + limit
    return {"items": items[cursor:end], "next_cursor": end if end < len(items) else None}


@app.get("/api/demo/profiles")
def profiles():
    return PERSONAS


@app.post("/api/demo/session", status_code=201)
def open_session(profile: Profile):
    token = secrets.token_urlsafe(32)
    now = time.time()
    with app.state.write_lock, database() as connection:
        connection.execute("DELETE FROM sessions WHERE created <= ?", (now - SESSION_LIFETIME,))
        connection.execute("INSERT INTO sessions VALUES (?, ?, ?)", (digest(token), profile.profile_id, now))
    return {"token": token, "expires_in": SESSION_LIFETIME}


@app.post("/api/demo/reset")
def reset(key: str = Depends(session)):
    with app.state.write_lock, database() as connection:
        connection.execute("DELETE FROM events WHERE session = ?", (key,))
        connection.execute("DELETE FROM requests WHERE session = ?", (key,))
    return {"reset": True}


@app.post("/api/interactions")
def collect(event: Event, key: str = Depends(session)):
    with app.state.write_lock, database() as connection:
        connection.execute("BEGIN IMMEDIATE")
        old = connection.execute(
            "SELECT item_id, event_type FROM events WHERE session = ? AND event_id = ?", (key, event.event_id)
        ).fetchone()
        if old:
            if old != (event.item_id, event.event_type):
                raise HTTPException(409, "Event ID is already assigned")
            return {"accepted": True, "duplicate": True}
        count = connection.execute("SELECT count(*) FROM events WHERE session = ?", (key,)).fetchone()[0]
        if count >= 500:
            raise HTTPException(429, "Reset the demo to collect more events")
        connection.execute("INSERT INTO events(session, event_id, item_id, event_type, event_ts) VALUES (?, ?, ?, ?, ?)",
                           (key, event.event_id, event.item_id, event.event_type, time.time()))
    return {"accepted": True, "duplicate": False}


@app.post("/api/recommendations")
def recommend(payload: Recommendation, key: str = Depends(session)):
    started = time.perf_counter()
    request_id = secrets.token_urlsafe(16)
    with app.state.write_lock, database() as connection:
        connection.execute("BEGIN IMMEDIATE")
        events = history(connection, key)
        result = rank(events, payload.ranking_policy.model_dump(), payload.n, payload.model_version)
        result.update(request_id=request_id, latency_ms=(time.perf_counter() - started) * 1000,
                      dataset_hash=None, data_source="fictional catalog and demo events")
        connection.execute("INSERT INTO requests VALUES (?, ?, ?, ?)", (request_id, key, json.dumps(result), time.time()))
        connection.execute(
            """DELETE FROM requests WHERE session = ? AND request_id NOT IN
            (SELECT request_id FROM requests WHERE session = ? ORDER BY created DESC LIMIT 50)""", (key, key)
        )
    return result


@app.get("/api/recommendations/{request_id}/trace")
def trace(request_id: str, key: str = Depends(session)):
    with database() as connection:
        row = connection.execute("SELECT trace FROM requests WHERE request_id = ? AND session = ?",
                                 (request_id, key)).fetchone()
    if not row:
        raise HTTPException(404, "Trace not found")
    return json.loads(row[0])


@app.get("/api/models")
def models():
    return {"live_demo": ["rules", "als"], "historical_evaluation": ["popularity", "itemknn", "als"],
            "note": "Live demo ALS is trained on seeded fictional data. MovieLens metrics are separate."}


@app.get("/api/evaluations")
def evaluations(model_version: Literal["popularity", "itemknn", "als"] | None = None):
    if not REPORT.exists():
        raise HTTPException(404, "Run make demo-export first")
    report = json.loads(REPORT.read_text())
    if model_version:
        for key in ("validation", "test"):
            report[key] = {model_version: report[key][model_version]}
    return report


@app.post("/api/lab/replay")
def replay(payload: Recommendation, key: str = Depends(session)):
    return simulate(payload.ranking_policy.model_dump(), payload.n, payload.model_version)
