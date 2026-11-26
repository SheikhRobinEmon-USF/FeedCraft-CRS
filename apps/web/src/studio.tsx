"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { asset, defaults, genres, items, personas, rank, type Event, type Kind, type Policy, type Ranking, type Row } from "./rank";
import type { LabView } from "./laboratory";

const Laboratory = dynamic(() => import("./laboratory").then((module) => module.Laboratory));

type View = "home" | "feed" | "watch" | "profile" | "why" | LabView;
type State = { persona: string; policy: Policy; events: Event[]; snapshot: Event[]; ranking?: Ranking; token?: string; live: boolean };
const initial: State = { persona: "cold", policy: defaults, events: [], snapshot: [], live: false };
const storageKey = "feedcraft-v1";
const apiRoot = process.env.NEXT_PUBLIC_FEEDCRAFT_API || "";
const feedMarks: Record<string, string> = { home: "◈", feed: "▤", profile: "◉", why: "≋", models: "◇", evaluation: "▥", simulator: "⊞" };
const nav: [View, string, string][] = [
  ["home", "/", "Discover"], ["feed", "/feed/", "For You"], ["profile", "/profile/", "Preferences"],
  ["why", "/why/current/", "Rank Inspector"], ["models", "/lab/models/", "Models"],
  ["evaluation", "/lab/evaluation/", "Evaluation"], ["simulator", "/lab/simulator/", "Policy Simulator"],
];

async function api<T>(path: string, body: unknown, token?: string): Promise<T> {
  const response = await fetch(`${apiRoot}/api/${path}`, {
    method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body), signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(String(response.status));
  return response.json() as Promise<T>;
}

function Cover({ itemId, priority }: { itemId: string; priority?: boolean }) {
  const item = items[itemId];
  return <Image src={asset(itemId, "webp")} className="cover" alt={item.alt} fill sizes="(max-width: 760px) 100vw, 65vw" unoptimized priority={priority} />;
}

function Player({ id, onEvent }: { id: string; onEvent: (kind: Kind) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    function pause() { if (document.hidden) video.current?.pause(); }
    document.addEventListener("visibilitychange", pause);
    return () => document.removeEventListener("visibilitychange", pause);
  }, []);
  return <video ref={video} aria-label={items[id].title} controls playsInline autoPlay muted preload="metadata"
    poster={asset(id, "webp")} onPlay={() => onEvent("play")} onEnded={() => onEvent("finish")}>
    <source src={asset(id, "mp4")} type="video/mp4" />
    <track src={asset(id, "vtt")} srcLang="en" label="English descriptions" kind="captions" />
    Your browser could not play this clip.
  </video>;
}

function Inspector({ row, ranking, detailed = false }: { row?: Row; ranking: Ranking; detailed?: boolean }) {
  return <aside className={detailed ? "panel inspector full-inspector" : "panel inspector"} aria-label="Rank inspector">
    <div className="panel-title"><span aria-hidden="true">≋</span><h2>Rank Inspector</h2>{!detailed && <Link href="/why/current/" className="icon-link" aria-label="Open full rank inspector">↗</Link>}</div>
    <div className="inspector-body">
      {row ? <>
        <p className="eyebrow">WHY THIS CLIP</p>
        <div className="reason-title"><h3>{items[row.item_id].title}</h3><b>#{row.rank}</b></div>
        <p className="micro">{ranking.cold_start ? "Cold start · Popularity, exploration, and diversity guide this ranking." :
          row.sources.length ? `Session evidence: ${row.sources.join(", ")}.` : "The current preferences and catalog policy guide this ranking."}</p>
        {!!row.matches.length && <p className="micro">Matches {row.matches.join(" · ")}</p>}
        <div className="score-head"><h4>Score breakdown</h4><strong>{row.score.toFixed(3)}</strong></div>
        <div className="bars">
          {Object.entries(row.trace).map(([label, value]) => <div className="bar-row" key={label}>
            <div><span>{label}</span><code>{value > 0 ? "+" : ""}{value.toFixed(3)}</code></div>
            <div className="track" aria-hidden="true"><i className={value < 0 ? "negative" : ""} style={{ width: `${Math.abs(value) * 100}%` }} /></div>
          </div>)}
        </div>
      </> : <p className="muted">No ranked clips match your selection.</p>}
      <div className="trace-footer"><span>Candidate pool</span><b>{ranking.candidate_ids.length} clips</b></div>
      <div className="trace-footer"><span>Ranker</span><code>{ranking.model_version}</code></div>
      {detailed && <>
        <div className="trace-footer"><span>Trace</span><code>{ranking.request_id || "Browser computation"}</code></div>
        {ranking.latency_ms !== undefined && <div className="trace-footer"><span>Server compute and queue</span><code>{ranking.latency_ms.toFixed(1)} ms</code></div>}
        <h3 className="section-small">Filter removals</h3>
        {ranking.removals.length ? <ul className="trace-list">{ranking.removals.map(({ item_id, reason }) =>
          <li key={item_id}>{items[item_id].title}<span>{reason}</span></li>)}</ul> : <p className="muted">All clips passed the active filters.</p>}
      </>}
    </div>
  </aside>;
}

export default function Studio({ view, item }: { view: View; item?: string }) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const stateRef = useRef(initial);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState("");
  const [playing, setPlaying] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  function commit(next: State) {
    stateRef.current = next;
    setState(next);
    try { sessionStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* render from memory */ }
  }

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const serialized = sessionStorage.getItem(storageKey);
        if (serialized) {
          const next = JSON.parse(serialized) as State;
          stateRef.current = next;
          setState(next);
        }
        setSelected(sessionStorage.getItem(`${storageKey}-selection`) || "");
      } catch { /* storage is optional */ }
      setReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const policy = state.policy;
  const ranking = state.ranking ?? rank(state.snapshot, policy);
  const currentRow = ranking.items.find((row) => row.item_id === selected) ?? ranking.items[0];
  const heroId = view === "watch" ? item : currentRow?.item_id;
  const hero = heroId ? items[heroId] : undefined;
  const persona = personas.find((entry) => entry.id === state.persona) ?? personas[0];
  const saved = new Set(state.events.reduce<string[]>((list, event) => event.event_type === "save"
    ? [...list, event.item_id] : event.event_type === "unsave" ? list.filter((id) => id !== event.item_id) : list, []));
  const feedback = state.events.length - state.snapshot.length;

  function select(id: string) {
    setSelected(id);
    setPlaying("");
    try { sessionStorage.setItem(`${storageKey}-selection`, id); } catch { /* storage is optional */ }
  }

  function updatePolicy(patch: Partial<Policy>) {
    const value = stateRef.current;
    commit({ ...value, policy: { ...value.policy, ...patch }, ranking: undefined });
  }

  async function choose(id: string, launch = false) {
    const entry = personas.find((option) => option.id === id) ?? personas[0];
    const existing = stateRef.current;
    if (existing.token) {
      setBusy(true);
      try { await api("demo/reset", {}, existing.token); }
      catch (error) {
        if (!(error instanceof Error) || error.message !== "401") {
          setStatus("Could not clear the previous API session. Retry while the API is online.");
          return;
        }
      }
      finally { setBusy(false); }
    }
    commit({ ...initial, live: existing.live, persona: entry.id,
      policy: { ...defaults, interests: entry.interests, exploration: entry.exploration } });
    select("");
    setStatus(`${entry.label} session started.`);
    if (launch) router.push("/feed/");
  }

  function record(id: string, kind: Kind) {
    const current = stateRef.current;
    if (current.events.length >= 500) {
      setStatus("Reset the demo to collect more feedback.");
      return;
    }
    if (kind === "play" && current.events.some((event) => event.item_id === id && event.event_type === kind)) return;
    const random = new Uint32Array(4);
    crypto.getRandomValues(random);
    const event = { item_id: id, event_type: kind, event_id: [...random].map((value) => value.toString(16).padStart(8, "0")).join("") };
    commit({ ...current, events: [...current.events, event] });
    const labels: Record<Kind, string> = { play: "Playback started", finish: "Clip finished", skip: "Clip skipped",
      like: "Liked", dislike: "Disliked", save: "Saved", unsave: "Removed from saved clips" };
    setStatus(`${labels[kind]} · ${items[id].title}`);
  }

  async function refresh() {
    const before = stateRef.current;
    setBusy(true);
    try {
      let next: Ranking;
      let token = before.token;
      if (apiRoot && before.live) {
        if (!token) {
          ({ token } = await api<{ token: string }>("demo/session", { profile_id: before.persona }));
          commit({ ...stateRef.current, token });
        }
        for (const event of before.events) await api("interactions", event, token);
        next = await api<Ranking>("recommendations", { ranking_policy: before.policy, model_version: "als" }, token);
      } else {
        next = rank(before.events, before.policy);
      }
      const latest = stateRef.current;
      const updated = latest.policy === before.policy ? next : undefined;
      commit({ ...latest, snapshot: before.events, ranking: updated, token });
      select((updated ?? rank(before.events, latest.policy)).items[0]?.item_id ?? "");
      const previous = before.ranking ?? rank(before.snapshot, before.policy);
      const moved = next.items.filter((row, index) => row.item_id !== previous.items[index]?.item_id).length;
      setStatus(`Feed refreshed · ${next.items.length} ranked clips · ${moved ? `${moved} positions changed` : "same order"}`);
    } catch (error) {
      if (error instanceof Error && error.message === "401") {
        commit({ ...stateRef.current, token: undefined });
        setStatus("The API session expired. Refresh again to open a new session.");
      } else {
        setStatus("The local API is unavailable. You can retry or switch to browser ranking in Preferences.");
      }
    } finally { setBusy(false); }
  }

  function skip(id: string) {
    record(id, "skip");
    const index = ranking.items.findIndex((row) => row.item_id === id);
    if (view === "watch") router.push("/feed/");
    select(ranking.items[(index + 1) % ranking.items.length]?.item_id ?? "");
  }

  const toggle = (current: string[], value: string) => current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value];
  const allModes = view === "feed" || view === "home" || view === "watch";
  const labView = view === "models" || view === "evaluation" || view === "simulator";

  return <div className="studio">
    <a className="skip-link" href="#content">Skip to content</a>
    <nav className="sidebar" aria-label="Main">
      <Link className="brand" href="/"><span className="brand-mark" aria-hidden="true">▶</span><span>Feed<span>Craft</span><small>RECOMMENDATION LAB</small></span></Link>
      <div className="navigation">
        <p>WATCH</p>
        {nav.slice(0, 3).map(([key, href, label]) => <Link key={key} aria-current={view === key ? "page" : undefined} href={href}>
          <span aria-hidden="true">{feedMarks[key]}</span>{label}</Link>)}
        <p>CONTROL ROOM</p>
        {nav.slice(3).map(([key, href, label]) => <Link key={key} aria-current={view === key ? "page" : undefined} href={href}>
          <span aria-hidden="true">{feedMarks[key]}</span>{label}</Link>)}
      </div>
      <div className="sidebar-footer"><span className="avatar" aria-hidden="true">{persona.label.charAt(0)}</span>
        <div><strong>{persona.label}</strong><small>Fictional profile</small></div></div>
    </nav>
    <div className="surface">
      <header className="topbar">
        <span>{labView || view === "why" ? "CONTROL ROOM" : "DISCOVERY STUDIO"}</span>
        <span className="mode"><i aria-hidden="true" />{state.live ? "Local API enabled" : "Browser demo"}</span>
      </header>
      <main id="content" className="content" tabIndex={-1}>
        {allModes && <>
          <div className="intro">
            <div><p className="eyebrow accent">{view === "watch" ? "CLIP DETAIL" : "THE DISCOVERY FEED"}</p>
              <h1>{view === "home" ? "Find your next watch." : view === "watch" ? hero?.title : "For You"}</h1>
              <p>{view === "watch" ? hero?.description : "Watch, react, and see how your feedback reshapes the feed."}</p></div>
            {view !== "watch" && <button className="primary" type="button" onClick={refresh} disabled={busy || !ready || feedback === 1}>
              {busy ? "Refreshing…" : "↻  Refresh for You"}</button>}
          </div>
          {view === "home" && <section className="persona-strip" aria-label="Launch demo profile">
            {personas.map((entry) => <button type="button" key={entry.id} onClick={() => choose(entry.id, true)} disabled={!ready || busy}>
              <span aria-hidden="true">{entry.id === "cold" ? "◔" : entry.id === "focused" ? "◎" : "✧"}</span>
              <span><strong>{entry.label}</strong><small>{entry.description}</small></span>
            </button>)}
          </section>}
          <div className="feed-layout">
            <div className="feed-column">
              {hero ? <>
                <article className="hero">
                  {playing === hero.id ? <Player id={hero.id} onEvent={(kind) => record(hero.id, kind)} /> : <>
                    <Cover itemId={hero.id} priority />
                    <div className="hero-shade" />
                    <span className="clip-label">SIMULATED CLIP</span>
                    <button className="play" type="button" aria-label={`Play ${hero.title}`} onClick={() => setPlaying(hero.id)}>▶</button>
                    <div className="hero-copy"><div>{hero.genres.join(" / ")} <span>•</span> {hero.seconds}s</div>
                      <h2>{hero.title}</h2><p>{hero.description}</p>
                    </div>
                  </>}
                </article>
                <div className="actions" aria-label="Clip feedback">
                  <button type="button" onClick={() => record(hero.id, "like")}>♡ Like</button>
                  <button type="button" onClick={() => record(hero.id, "dislike")}>Dislike</button>
                  <button type="button" onClick={() => skip(hero.id)}>Skip</button>
                  <button type="button" aria-pressed={saved.has(hero.id)} onClick={() => record(hero.id, saved.has(hero.id) ? "unsave" : "save")}>
                    {saved.has(hero.id) ? "✓ Saved" : "＋ Save"}</button>
                  {view !== "watch" ? <Link href={`/watch/${hero.id}/`}>Clip details</Link> : <Link href="/feed/">Back to feed</Link>}
                </div>
              </> : <div className="panel empty"><h2>No clips match your filters</h2><Link href="/profile/">Change preferences</Link></div>}
              <div className="policy panel">
                <div><label htmlFor="feed-exploration">Exploration</label><output htmlFor="feed-exploration">{Math.round(policy.exploration * 100)}%</output></div>
                <input id="feed-exploration" type="range" min="0" max="1" step="0.05" value={policy.exploration} onChange={(event) => updatePolicy({ exploration: Number(event.target.value) })} />
                <div className="scale"><span>Familiar</span><span>Exploratory</span></div>
                <label className="check"><input type="checkbox" checked={policy.candidate_ids !== null}
                  onChange={(event) => updatePolicy({ candidate_ids: event.target.checked ? ranking.candidate_ids : null })} /> Freeze candidate pool</label>
              </div>
              <div className="queue-head"><h2>{view === "watch" ? "Related clips" : "Up next"}</h2><span>{ranking.items.length} ranked</span></div>
              <div className="queue" aria-label="Ranked clips">
                {ranking.items.filter((row) => row.item_id !== hero?.id).map((row) => {
                  const entry = items[row.item_id];
                  return view === "watch" ? <Link className="tile" key={entry.id} href={`/watch/${entry.id}/`}>
                    <div><Cover itemId={entry.id} /></div><strong>{entry.title}</strong><small>{entry.genres[0]}</small>
                  </Link> : <button className="tile" key={entry.id} type="button" onClick={() => select(entry.id)}>
                    <div><Cover itemId={entry.id} /><span>#{row.rank}</span></div><strong>{entry.title}</strong><small>{entry.genres[0]}</small>
                  </button>;
                })}
              </div>
            </div>
            <div className="feed-aside">
              <Inspector ranking={ranking} row={view === "watch" ? ranking.items.find((row) => row.item_id === heroId) : currentRow} />
              <div className="panel activity">
                <h2>Session activity</h2><p>{feedback ? `${feedback} new ${feedback === 1 ? "interaction" : "interactions"}` : "No new feedback"}</p>
                <p className="micro">{feedback === 1 ? "Add one more interaction to refresh." : "Likes, skips, saves, and plays shape the next refresh."}</p>
              </div>
            </div>
          </div>
        </>}
        {view === "profile" && <>
          <div className="intro"><div><p className="eyebrow accent">VIEWER SETTINGS</p><h1>Preferences</h1><p>Set your interests, choose what to hide, and review your session.</p></div>
            <button type="button" className="primary" disabled={busy || !ready} onClick={() => choose(state.persona)}>Reset demo</button></div>
          <div className="config-grid">
            <section className="panel settings"><h2>Demo profile</h2><div className="button-group">{personas.map((entry) =>
              <button type="button" key={entry.id} aria-pressed={state.persona === entry.id} disabled={busy || !ready} onClick={() => choose(entry.id)}>{entry.label}</button>)}</div>
              {apiRoot && <label className="check"><input type="checkbox" checked={state.live} onChange={(event) =>
                commit({ ...stateRef.current, live: event.target.checked, ranking: undefined })} /> Use local API with synthetic ALS on refresh</label>}
            </section>
            <section className="panel settings"><h2>Interests</h2><div className="button-group">{genres.map((genre) => <button
              key={genre} type="button" aria-pressed={policy.interests.includes(genre)} onClick={() => updatePolicy({ interests: toggle(policy.interests, genre) })}>{genre}</button>)}</div></section>
            <section className="panel settings"><h2>Content filters</h2><p>Hide topics</p><div className="button-group">{genres.map((genre) => <button
              key={genre} type="button" aria-pressed={policy.hidden.includes(genre)} onClick={() => updatePolicy({ hidden: toggle(policy.hidden, genre) })}>{genre}</button>)}</div>
              <label>Maximum intensity <select value={policy.intensity} onChange={(event) => updatePolicy({ intensity: Number(event.target.value) })}><option value="1">Calm</option><option value="2">Moderate</option><option value="3">All levels</option></select></label>
              <label className="check"><input type="checkbox" checked={policy.exclude_seen} onChange={(event) => updatePolicy({ exclude_seen: event.target.checked })} /> Exclude finished, skipped, and disliked clips</label>
              <label className="check"><input type="checkbox" checked={policy.candidate_ids !== null} onChange={(event) =>
                updatePolicy({ candidate_ids: event.target.checked ? ranking.candidate_ids : null })} /> Freeze candidate pool</label>
            </section>
            <section className="panel settings"><h2>Saved clips</h2>{saved.size ? <ul className="trace-list">{[...saved].map((id) => <li key={id}><Link href={`/watch/${id}/`}>{items[id].title}</Link>
              <button type="button" aria-label={`Remove ${items[id].title} from saved clips`} onClick={() => record(id, "unsave")}>Remove</button></li>)}</ul> : <p className="muted">No saved clips yet.</p>}</section>
            <section className="panel settings"><h2>Session history</h2>{state.events.length ? <ul className="trace-list">{state.events.slice(-20).toReversed().map((event) =>
              <li key={event.event_id}>{items[event.item_id].title}<span>{event.event_type}</span></li>)}</ul> : <p className="muted">No activity yet.</p>}</section>
          </div>
        </>}
        {view === "why" && <>
          <div className="intro"><div><p className="eyebrow accent">CONTROL ROOM</p><h1>Rank Inspector</h1><p>Follow a clip from the candidate pool to its final score.</p></div></div>
          <div className="config-grid"><Inspector ranking={ranking} row={currentRow} detailed />
            <section className="panel settings"><h2>Ranked results</h2><ol className="trace-list">{ranking.items.map((row) => <li key={row.item_id}>
              <button type="button" aria-pressed={row.item_id === currentRow?.item_id} onClick={() => select(row.item_id)}>#{row.rank} {items[row.item_id].title}</button><code>{row.score.toFixed(3)}</code></li>)}</ol>
              <p className="micro">The diversity adjustment uses the clips already placed above this result. A score is a sum of contributions at that decision step.</p>
            </section></div>
        </>}
        {labView && <Laboratory view={view} policy={policy} />}
        <p className="sr-only" role="status">{status}</p>
        {status && <p className="status-note">{status}</p>}
        <footer className="foot"><span>FeedCraft</span><span>Fictional viewing sessions · Original simulated media</span></footer>
      </main>
    </div>
  </div>;
}
