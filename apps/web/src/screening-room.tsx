"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpRight, Bookmark, ChevronLeft, ChevronRight, CirclePlay, Clapperboard, Heart, Layers3, ListVideo, Play, SkipForward, SlidersHorizontal, ThumbsDown, X } from "lucide-react";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { GenreLabel } from "./genre-guide";
import { asset, items, type Kind, type Policy, type Ranking } from "./rank";

export function Cover({ id, priority = false, thumbnail = false }: { id: string; priority?: boolean; thumbnail?: boolean }) {
  const item = items[id];
  return <Image src={asset(id, "webp")} alt={thumbnail ? "" : item.alt} fill unoptimized priority={priority}
    sizes={thumbnail ? "112px" : "(max-width: 900px) 100vw, 72vw"} className="cover" />;
}

function Player({ id, onEvent }: { id: string; onEvent: (kind: Kind) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const present = useIsPresent();
  useEffect(() => { if (!present) video.current?.pause(); }, [present]);
  useEffect(() => {
    function pause() { if (document.hidden) video.current?.pause(); }
    document.addEventListener("visibilitychange", pause);
    return () => document.removeEventListener("visibilitychange", pause);
  }, []);

  return <video ref={video} aria-label={items[id].title} controls playsInline autoPlay muted preload="metadata"
    poster={asset(id, "webp")} onPlay={() => onEvent("play")} onEnded={() => onEvent("finish")}>
    <source src={asset(id, "mp4")} type="video/mp4" />
    <track src={asset(id, "vtt")} srcLang="en" label="English descriptions" kind="captions" />
  </video>;
}

type ScreeningProps = {
  heroId?: string;
  ranking: Ranking;
  comparison: string[];
  playing: boolean;
  watch: boolean;
  saved: boolean;
  reaction?: Kind;
  onPlay: (playing: boolean) => void;
  onSelect: (id: string) => void;
  onMove: (direction: number) => void;
  onEvent: (id: string, kind: Kind) => void;
  onSkip: (id: string) => void;
};

export function ScreeningRoom({ heroId, ranking, comparison, playing, watch, saved, reaction, onPlay, onSelect, onMove, onEvent, onSkip }: ScreeningProps) {
  const reduced = useReducedMotion();
  const queue = useRef<HTMLOListElement>(null);
  const gesture = useRef<{ x: number; y: number } | null>(null);
  const hero = heroId ? items[heroId] : undefined;
  const index = ranking.items.findIndex((row) => row.item_id === heroId);
  const first = index <= 0;
  const last = index < 0 || index >= ranking.items.length - 1;

  useEffect(() => {
    const list = queue.current;
    const active = list?.querySelector("[aria-pressed=true], [aria-current=page]");
    if (!list || !active) return;
    const bounds = list.getBoundingClientRect();
    const row = active.getBoundingClientRect();
    const left = row.left < bounds.left ? row.left - bounds.left : Math.max(0, row.right - bounds.right);
    const top = row.top < bounds.top ? row.top - bounds.top : Math.max(0, row.bottom - bounds.bottom);
    if (left || top) list.scrollBy({ left, top });
  }, [heroId, index]);

  return <div className="screening-layout">
    <section className="screening-column" aria-label="Clip player">
      {hero ? <>
        <div className="screen-stage" role="group" tabIndex={0} aria-label="Clip carousel. Use the left and right arrow keys to change clips."
          onKeyDown={(event) => {
            if (event.currentTarget !== event.target || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
            event.preventDefault();
            onMove(event.key === "ArrowLeft" ? -1 : 1);
          }}
          onTouchStart={(event) => {
            if (!playing) gesture.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
          }}
          onTouchCancel={() => { gesture.current = null; }}
          onTouchEnd={(event) => {
            const start = gesture.current;
            gesture.current = null;
            if (!start) return;
            const point = event.changedTouches[0];
            const dx = point.clientX - start.x;
            if (Math.abs(dx) > 55 && Math.abs(dx) > 1.35 * Math.abs(point.clientY - start.y)) onMove(dx < 0 ? 1 : -1);
          }}>
          <AnimatePresence initial={false}>
            <motion.article key={hero.id} className="screen-frame"
              initial={reduced ? false : { opacity: 0, scale: 1.025 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduced ? undefined : { opacity: 0 }}
              transition={{ duration: reduced ? 0 : 0.33, ease: "easeOut" }}
              aria-label={hero.title}>
              {playing ? <>
                <Player id={hero.id} onEvent={(kind) => onEvent(hero.id, kind)} />
                <button className="icon-button close-player" type="button" aria-label="Close clip playback" onClick={() => onPlay(false)}><X size={18} /></button>
              </> : <>
                <Cover id={hero.id} priority={index === 0} />
                <div className="frame-shadow" />
                <span className="film-type"><Clapperboard size={13} /> Simulated short</span>
                <div className="film-copy">
                  <div className="film-meta">{hero.genres.map((name, index) => <GenreLabel key={name} name={name} secondary={index > 0} />)}<span>0:{hero.seconds.toString().padStart(2, "0")}</span></div>
                  <h2>{hero.title}</h2>
                  <p>{hero.description}</p>
                  <button className="watch-button" type="button" aria-label={`Play ${hero.title}`} onClick={() => onPlay(true)}><Play size={16} fill="currentColor" /> Watch clip</button>
                </div>
              </>}
            </motion.article>
          </AnimatePresence>
        </div>
        <div className="screen-toolbar">
          <div className="clip-actions" aria-label="Clip feedback">
            <button type="button" aria-label="♡ Like" aria-pressed={reaction === "like"} onClick={() => onEvent(hero.id, "like")}><Heart size={17} /><span>Like</span></button>
            <button type="button" aria-label="Dislike" aria-pressed={reaction === "dislike"} onClick={() => onEvent(hero.id, "dislike")}><ThumbsDown size={16} /><span>Dislike</span></button>
            <button type="button" aria-label="Skip" onClick={() => onSkip(hero.id)}><SkipForward size={17} /><span>Skip</span></button>
            <button type="button" aria-label={saved ? "Saved" : "Save"} aria-pressed={saved} onClick={() => onEvent(hero.id, saved ? "unsave" : "save")}><Bookmark size={16} /><span>{saved ? "Saved" : "Save"}</span></button>
          </div>
          <div className="clip-navigation">
            <Link className="clip-details" href={watch ? "/feed/" : `/watch/${hero.id}/`}>{watch ? "Back to feed" : "Clip details"} <ArrowUpRight size={13} /></Link>
            <button className="icon-button" type="button" aria-label="Previous clip" disabled={first} onClick={() => onMove(-1)}><ChevronLeft size={18} /></button>
            <button className="icon-button" type="button" aria-label="Next clip" disabled={last} onClick={() => onMove(1)}><ChevronRight size={18} /></button>
          </div>
        </div>
      </> : <div className="panel empty"><CirclePlay size={32} /><h2>No clips match your filters</h2><Link href="/profile/">Change preferences <ArrowUpRight size={14} /></Link></div>}
    </section>
    <section className="panel lineup" aria-label="Ranked clips">
      <div className="lineup-head">
        <div className="lineup-title"><ListVideo size={19} /><h2>{watch ? "Related clips" : "Up next"}</h2></div>
        <span>{ranking.items.length} {ranking.items.length === 1 ? "clip" : "clips"}</span>
      </div>
      {ranking.items.length ? <ol ref={queue} className="lineup-list">
        {ranking.items.map((row) => {
          const clip = items[row.item_id];
          const current = row.item_id === heroId;
          const before = comparison.indexOf(clip.id);
          const entered = comparison.length > 0 && before < 0;
          const diff = before >= 0 ? before + 1 - row.rank : 0;
          const content = <>
            <span className="lineup-position">{current ? <Play size={13} fill="currentColor" aria-hidden="true" /> : row.rank.toString().padStart(2, "0")}</span>
            <span className="lineup-thumb"><Cover id={clip.id} thumbnail /></span>
            <span className="lineup-copy"><strong>{clip.title}</strong><small><span className="lineup-genre" data-genre={clip.genres[0]}>{clip.genres[0]}</span> <span>·</span> {clip.seconds}s</small></span>
            {entered ? <span className="rank-change new" aria-label="New in this queue">New</span> : diff !== 0 && <span className={`rank-change ${diff > 0 ? "up" : "down"}`} aria-label={`${Math.abs(diff)} places ${diff > 0 ? "up" : "down"}`}>{diff > 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}{Math.abs(diff)}</span>}
          </>;
          return <motion.li key={clip.id} layout={reduced ? false : "position"} transition={{ type: "spring", stiffness: 440, damping: 36 }}>
            {watch ? <Link href={`/watch/${clip.id}/`} className="lineup-row" aria-current={current ? "page" : undefined}>{content}</Link> :
              <button type="button" className="lineup-row" aria-pressed={current} onClick={() => onSelect(clip.id)}>{content}</button>}
          </motion.li>;
        })}
      </ol> : <p className="lineup-empty">The playlist is empty.</p>}
      <div className="lineup-foot"><Layers3 size={14} /><span>{ranking.items.length} picks from {ranking.candidate_ids.length} eligible</span><Link href="/catalog/">Browse all clips</Link></div>
    </section>
  </div>;
}

export function PolicyControls({ policy, onChange, freeze }: { policy: Policy; onChange: (patch: Partial<Policy>) => void; freeze: (active: boolean) => void }) {
  return <section className="panel policy">
    <div className="panel-title"><SlidersHorizontal size={17} /><h2>Feed tuning</h2></div>
    <div className="panel-body">
      <div className="policy-reading"><label htmlFor="feed-exploration">Exploration</label><output htmlFor="feed-exploration">{Math.round(policy.exploration * 100)}%</output></div>
      <input id="feed-exploration" type="range" min="0" max="1" step="0.05" value={policy.exploration} onChange={(event) => onChange({ exploration: Number(event.target.value) })} />
      <div className="scale"><span>Familiar</span><span>Exploratory</span></div>
      <label className="check"><input type="checkbox" checked={policy.candidate_ids !== null} onChange={(event) => freeze(event.target.checked)} /> Freeze candidate pool</label>
    </div>
  </section>;
}
