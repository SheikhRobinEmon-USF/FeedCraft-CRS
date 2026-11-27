"use client";

import Link from "next/link";
import { Play, Search } from "lucide-react";
import { useState } from "react";
import { catalog, genres } from "./rank";
import { Cover } from "./screening-room";

const pageSize = 12;

export function ClipCatalog() {
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("");
  const [limit, setLimit] = useState(pageSize);
  const term = query.trim().toLowerCase();
  const results = catalog.filter((clip) =>
    (!genre || clip.genres.includes(genre)) &&
    `${clip.title} ${clip.genres.join(" ")} ${clip.description}`.toLowerCase().includes(term));
  const shown = results.slice(0, limit);

  return <>
    <header className="intro">
      <div><h1>Clip catalog</h1><p>Browse {catalog.length} original simulated shorts by title or genre.</p></div>
    </header>
    <div className="panel catalog-filters">
      <div className="catalog-field"><label htmlFor="clip-search">Search clips</label><div className="catalog-search"><Search size={16} aria-hidden="true" />
        <input id="clip-search" type="search" placeholder="Title, genre, or subject" value={query}
          onChange={(event) => { setQuery(event.target.value); setLimit(pageSize); }} /></div></div>
      <div className="catalog-field"><label htmlFor="clip-genre">Genre</label><select id="clip-genre" value={genre} onChange={(event) => { setGenre(event.target.value); setLimit(pageSize); }}>
        <option value="">All genres</option>{genres.map((key) => <option key={key}>{key}</option>)}
      </select></div>
    </div>
    <p className="catalog-tally micro" aria-live="polite">{shown.length} of {results.length} matching {results.length === 1 ? "clip" : "clips"}</p>
    {shown.length ? <ul className="catalog-grid">
      {shown.map((clip) => <li key={clip.id}>
        <Link className="panel catalog-card" href={`/watch/${clip.id}/`} prefetch={false}>
          <div className="catalog-poster"><Cover id={clip.id} thumbnail /><span aria-hidden="true"><Play size={16} fill="currentColor" /></span></div>
          <div className="catalog-card-copy"><h2>{clip.title}</h2><p>{clip.genres.join(" · ")} <span aria-hidden="true">/</span> {clip.seconds}s</p></div>
        </Link>
      </li>)}
    </ul> : <div className="panel empty"><h2>No clips match your search</h2>
      <button className="button" type="button" onClick={() => { setQuery(""); setGenre(""); setLimit(pageSize); }}>Clear filters</button>
    </div>}
    {shown.length < results.length && <div className="catalog-more"><button className="button" type="button"
      onClick={() => setLimit((count) => count + pageSize)}>Show more clips</button></div>}
  </>;
}
