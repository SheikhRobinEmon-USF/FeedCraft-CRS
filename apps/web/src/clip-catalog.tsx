"use client";

import Link from "next/link";
import { Play, Search } from "lucide-react";
import { useRef, useState } from "react";
import { GenreLabel, genreGuide } from "./genre-guide";
import { catalog, genres } from "./rank";
import { Cover } from "./screening-room";

const pageSize = 12;
const genreCounts = new Map(genres.map((genre) => [genre, catalog.filter((clip) => clip.genres.includes(genre)).length]));

export function ClipCatalog() {
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("");
  const [limit, setLimit] = useState(pageSize);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const term = query.trim().toLowerCase();
  const results = catalog.filter((clip) =>
    (!genre || clip.genres.includes(genre)) &&
    `${clip.title} ${clip.genres.join(" ")} ${clip.description}`.toLowerCase().includes(term));
  const shown = results.slice(0, limit);

  function chooseGenre(next: string) {
    setGenre(next);
    setLimit(pageSize);
  }

  function browseGenre(next: string) {
    setQuery("");
    chooseGenre(next);
    resultsHeading.current?.focus({ preventScroll: true });
    resultsHeading.current?.scrollIntoView({ block: "start" });
  }

  return <>
    <header className="intro">
      <div><h1>Clip catalog</h1><p>Browse {catalog.length} original simulated shorts across {genres.length} genres.</p></div>
    </header>
    <section className="genre-guide" aria-labelledby="genre-guide-heading">
      <h2 id="genre-guide-heading">Explore by genre</h2>
      <p>The highlighted label on each clip shows its main genre. The second tag shows what else it covers.</p>
      <ul className="genre-grid">
        {genreGuide.map(({ name, poster, subject }) => <li key={name}>
          <button className="genre-tile" type="button" data-genre={name} aria-pressed={genre === name}
            onClick={() => browseGenre(name)}>
            <span className="genre-tile-poster"><Cover id={poster} thumbnail /></span>
            <span className="genre-tile-copy"><strong>{name}</strong><small>{subject}</small></span>
          </button>
        </li>)}
      </ul>
    </section>
    <h2 className="catalog-results-title" ref={resultsHeading} tabIndex={-1}>{genre ? `${genre} clips` : "All clips"}</h2>
    <div className="panel catalog-filters">
      <div className="catalog-field"><label htmlFor="clip-search">Search clips</label><div className="catalog-search"><Search size={16} aria-hidden="true" />
        <input id="clip-search" type="search" placeholder="Title, genre, or subject" value={query}
          onChange={(event) => { setQuery(event.target.value); setLimit(pageSize); }} /></div></div>
      <div className="catalog-field"><label htmlFor="clip-genre">Genre</label><select id="clip-genre" value={genre} onChange={(event) => chooseGenre(event.target.value)}>
        <option value="">All genres</option>{genres.map((key) => <option value={key} key={key}>{key} ({genreCounts.get(key)})</option>)}
      </select></div>
    </div>
    <p className="catalog-tally micro" aria-live="polite">{shown.length} of {results.length} matching {results.length === 1 ? "clip" : "clips"}</p>
    {shown.length ? <ul className="catalog-grid">
      {shown.map((clip) => <li key={clip.id}>
        <Link className="panel catalog-card" href={`/watch/${clip.id}/`} prefetch={false}>
          <div className="catalog-poster"><Cover id={clip.id} thumbnail /><span aria-hidden="true"><Play size={16} fill="currentColor" /></span></div>
          <div className="catalog-card-copy">
            <div className="catalog-card-genres">{clip.genres.map((name, index) => <GenreLabel key={name} name={name} secondary={index > 0} />)}</div>
            <h3>{clip.title}</h3><p>{clip.seconds}s</p>
          </div>
        </Link>
      </li>)}
    </ul> : <div className="panel empty"><h2>No clips match your search</h2>
      <button className="button" type="button" onClick={() => { setQuery(""); setGenre(""); setLimit(pageSize); }}>Clear filters</button>
    </div>}
    {shown.length < results.length && <div className="catalog-more"><button className="button" type="button"
      onClick={() => setLimit((count) => count + pageSize)}>Show more clips</button></div>}
  </>;
}
