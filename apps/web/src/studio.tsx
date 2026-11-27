"use client";

import dynamic from "next/dynamic";
import { Activity, ArrowUpRight, LibraryBig, BarChart3, Compass, Film, FlaskConical, Menu, Play, Radar, RefreshCw, SlidersHorizontal, Sparkles, Workflow, X } from "lucide-react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { catalog, defaults, genres, items, personas, rank, type Event, type Kind, type Policy, type Ranking, type Row } from "./rank";
import { ClipCatalog } from "./clip-catalog";
import { PolicyControls, ScreeningRoom } from "./screening-room";
import type { LabView } from "./laboratory";

const Laboratory = dynamic(() => import("./laboratory").then((module) => module.Laboratory));

type View = "home" | "feed" | "catalog" | "watch" | "profile" | "why" | LabView;
type State = { persona: string; policy: Policy; events: Event[]; snapshot: Event[]; ranking?: Ranking; token?: string; live: boolean; catalogSize?: number };
const initial: State = { persona: "cold", policy: defaults, events: [], snapshot: [], live: false, catalogSize: catalog.length };
const queueSize = 12;
const storageKey = "feedcraft-v1";
const apiRoot = process.env.NEXT_PUBLIC_FEEDCRAFT_API || "";
const nav = [
  { view: "home", href: "/", label: "Discover", icon: Compass },
  { view: "feed", href: "/feed/", label: "For You", icon: Film },
  { view: "catalog", href: "/catalog/", label: "Catalog", icon: LibraryBig },
  { view: "profile", href: "/profile/", label: "Preferences", icon: SlidersHorizontal },
  { view: "why", href: "/why/current/", label: "Rank Inspector", icon: Radar },
  { view: "models", href: "/lab/models/", label: "Models", icon: FlaskConical },
  { view: "evaluation", href: "/lab/evaluation/", label: "Evaluation", icon: BarChart3 },
  { view: "simulator", href: "/lab/simulator/", label: "Policy Simulator", icon: Workflow },
] as const;
const personaIcons = [Compass, Film, Sparkles];

function Navigation({ view, persona, live }: { view: View; persona: string; live: boolean }) {
  const [expanded, setExpanded] = useState(false);
  return <header className="site-header">
    <div className="header-inner">
      <Link className="brand" href="/" aria-label="FeedCraft home">
        <span className="brand-mark"><Play size={17} fill="currentColor" /></span><span>Feed<em>Craft</em></span>
      </Link>
      <button className="icon-button menu-toggle" type="button" aria-expanded={expanded} aria-controls="primary-nav"
        aria-label={expanded ? "Close navigation" : "Open navigation"} onClick={() => setExpanded((open) => !open)}>
        {expanded ? <X size={21} /> : <Menu size={21} />}
      </button>
      <nav className={`primary-nav ${expanded ? "expanded" : ""}`} id="primary-nav" aria-label="Main"
        onKeyDown={(event) => { if (event.key === "Escape") setExpanded(false); }}>
        {nav.map(({ view: key, href, label, icon: Icon }) => <Link key={key} aria-current={view === key ? "page" : undefined} href={href}
          onClick={() => setExpanded(false)}><Icon size={16} aria-hidden="true" /><span>{label}</span></Link>)}
      </nav>
      <div className="header-session"><span className="mode"><i aria-hidden="true" />{live ? "Local API" : "Browser demo"}</span>
        <Link className="avatar" href="/profile/" title={persona} aria-label={`Profile: ${persona}`}>{persona.charAt(0)}</Link></div>
    </div>
  </header>;
}

async function api<T>(path: string, body: unknown, token?: string): Promise<T> {
  const response = await fetch(`${apiRoot}/api/${path}`, {
    method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body), signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(String(response.status));
  return response.json() as Promise<T>;
}

function Inspector({ row, ranking, detailed = false }: { row?: Row; ranking: Ranking; detailed?: boolean }) {
  return <aside className={detailed ? "panel inspector full-inspector" : "panel inspector"} aria-label="Rank inspector">
    <div className="panel-title"><Radar size={18} aria-hidden="true" /><h2>Rank Inspector</h2>{!detailed && <Link href="/why/current/" className="icon-link" aria-label="Open full rank inspector">Inspect <ArrowUpRight size={14} /></Link>}</div>
    <div className="inspector-body">
      {row ? <>
        <p className="eyebrow">WHY THIS CLIP</p>
        <div className="reason-title"><h3>{items[row.item_id].title}</h3><b>#{row.rank}</b></div>
        <p className="micro">{ranking.cold_start ? "Cold start · Popularity, exploration, and diversity guide this ranking." :
          row.sources.length ? `Session evidence: ${row.sources.join(", ")}.` : "The current preferences and catalog policy guide this ranking."}</p>
        {!!row.matches.length && <p className="micro">Matches {row.matches.join(" · ")}</p>}
        <div className="score-head"><h4>Score breakdown</h4><motion.strong key={row.score} initial={{ opacity: 0.55 }} animate={{ opacity: 1 }}>{row.score.toFixed(3)}</motion.strong></div>
        <div className="bars">
          {Object.entries(row.trace).map(([label, value]) => <div className="bar-row" key={label}>
            <div><span>{label}</span><code>{value > 0 ? "+" : ""}{value.toFixed(3)}</code></div>
            <div className="track" aria-hidden="true"><motion.i className={value < 0 ? "negative" : ""} initial={false} animate={{ width: `${Math.min(100, Math.abs(value) * 100)}%` }} transition={{ duration: 0.32 }} /></div>
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
  const [comparison, setComparison] = useState<string[]>([]);

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
          const saved = JSON.parse(serialized) as State;
          const next = saved.catalogSize === catalog.length ? saved : {
            ...saved,
            policy: { ...saved.policy, candidate_ids: null },
            ranking: undefined,
            catalogSize: catalog.length,
          };
          if (next !== saved) sessionStorage.setItem(storageKey, JSON.stringify(next));
          stateRef.current = next;
          setState(next);
        }
        setSelected(sessionStorage.getItem(`${storageKey}-selection`) || "");
      } catch { /* storage is optional */ }
      setReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(""), 5500);
    return () => clearTimeout(timer);
  }, [status]);

  const policy = state.policy;
  const ranking = state.ranking ?? rank(state.snapshot, policy, queueSize);
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
    setComparison([]);
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
        next = await api<Ranking>("recommendations", { ranking_policy: before.policy, model_version: "als", n: queueSize }, token);
      } else {
        next = rank(before.events, before.policy, queueSize);
      }
      const latest = stateRef.current;
      const updated = latest.policy === before.policy ? next : undefined;
      commit({ ...latest, snapshot: before.events, ranking: updated, token });
      select((updated ?? rank(before.events, latest.policy, queueSize)).items[0]?.item_id ?? "");
      const previous = before.ranking ?? rank(before.snapshot, before.policy, queueSize);
      setComparison(previous.items.map((row) => row.item_id));
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

  function move(direction: number) {
    const position = ranking.items.findIndex((row) => row.item_id === heroId);
    const next = ranking.items[position + direction];
    if (!next) return;
    if (view === "watch") router.push(`/watch/${next.item_id}/`);
    else select(next.item_id);
  }

  function freeze(active: boolean) {
    setComparison(active ? ranking.items.map((row) => row.item_id) : []);
    updatePolicy({ candidate_ids: active ? ranking.candidate_ids : null });
  }

  const toggle = (current: string[], value: string) => current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value];
  const allModes = view === "feed" || view === "home" || view === "watch";
  const labView = view === "models" || view === "evaluation" || view === "simulator";
  const reaction = state.events.findLast((event) => event.item_id === heroId && (event.event_type === "like" || event.event_type === "dislike"))?.event_type;
  const feedIntro = view === "home" ? "Short films, ranked for you. Every reaction changes what comes next." :
    view === "watch" ? hero?.description : "Watch, react, and refresh to see what moves in your queue.";

  return <MotionConfig reducedMotion="user"><div className="studio">
    <a className="skip-link" href="#content">Skip to content</a>
    <Navigation view={view} persona={persona.label} live={state.live} />
    <main id="content" className="content" tabIndex={-1}>
        {allModes && <>
          <div className="intro feed-intro">
            <div><p className="eyebrow accent"><span className="section-line" />{view === "watch" ? "THE SCREENING ROOM" : "DISCOVERY STUDIO"}</p>
              <h1>{view === "home" ? <>The <em>discovery</em> feed.</> : view === "watch" ? hero?.title : "For You"}</h1>
              <p>{feedIntro}</p></div>
            {view !== "watch" && <div className="refresh-box">
              <button className="primary refresh-button" type="button" onClick={refresh} disabled={busy || !ready || feedback === 1}>
                <RefreshCw size={16} className={busy ? "spinning" : undefined} aria-hidden="true" />
                {busy ? "Refreshing…" : "Refresh for You"}
                {feedback > 0 && <span className="pending-count" aria-label={`${feedback} pending signals`}>{feedback}</span>}
              </button>
              {feedback === 1 && <small>One more interaction to refresh</small>}
            </div>}
          </div>
          <ScreeningRoom heroId={heroId} ranking={ranking} comparison={comparison} playing={!!hero && playing === hero.id}
            watch={view === "watch"} saved={!!hero && saved.has(hero.id)} reaction={reaction}
            onPlay={(active) => setPlaying(active && heroId ? heroId : "")} onSelect={select} onMove={move}
            onEvent={record} onSkip={skip} />
          <div className="section-header"><h2>Tune your recommendations</h2><Link href="/profile/">All preferences <ArrowUpRight size={15} /></Link></div>
          <div className="workspace-grid">
            <div className="tuning-column">
              <PolicyControls policy={policy} onChange={updatePolicy} freeze={freeze} />
              <section className="panel activity"><div className="panel-title"><Activity size={17} /><h2>Session signals</h2>
                <span className="panel-meta">{feedback} pending</span></div>
                <div className="panel-body">{state.events.length ? <ul className="signal-list">
                  {state.events.slice(-4).toReversed().map((event) => <li key={event.event_id}><span>{items[event.item_id].title}</span><code>{event.event_type}</code></li>)}
                </ul> : <p className="micro">Watch or react to a clip to start shaping your feed.</p>}</div>
              </section>
            </div>
            <Inspector ranking={ranking} row={view === "watch" ? ranking.items.find((row) => row.item_id === heroId) : currentRow} />
            <section className="panel persona-panel" aria-label="Launch demo profile">
              <div className="panel-title"><Compass size={17} /><h2>Demo profiles</h2></div>
              <div className="persona-strip">
                {personas.map((entry, index) => {
                  const Icon = personaIcons[index];
                  return <button type="button" key={entry.id} aria-pressed={state.persona === entry.id} onClick={() => choose(entry.id, true)} disabled={!ready || busy}>
                    <Icon size={20} /><span><strong>{entry.label}</strong><small>{entry.description}</small></span><ArrowUpRight size={14} />
                  </button>;
                })}
              </div>
            </section>
          </div>
        </>}
        {view === "catalog" && <ClipCatalog />}
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
        <AnimatePresence initial={false}>
          {status && <motion.div key={status} className="status-note" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
            <span>{status}</span><button type="button" aria-label="Dismiss notification" onClick={() => setStatus("")}><X size={16} /></button>
          </motion.div>}
        </AnimatePresence>
        <footer className="foot"><span>FeedCraft</span><span>Fictional viewing sessions · Original simulated media</span></footer>
    </main>
  </div></MotionConfig>;
}
