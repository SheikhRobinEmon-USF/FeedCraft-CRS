"use client";

import { Download, Pause, Play } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { BarChart } from "echarts/charts";
import { AriaComponent, GridComponent, TooltipComponent } from "echarts/components";
import { init, use as registerCharts } from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import { asset, items, rank, seedEvents, type Policy, type Ranking } from "./rank";
import { modelTitles, type Model, type Report } from "./model-summary";

registerCharts([BarChart, AriaComponent, GridComponent, TooltipComponent, SVGRenderer]);

export type LabView = "models" | "evaluation" | "simulator";
const modelKeys = Object.keys(modelTitles) as Model[];
const metricLabels = {
  ndcg: "nDCG", recall: "Recall", mrr: "MRR", hit_rate: "Hit rate", coverage: "Catalog coverage",
  diversity: "Genre diversity", novelty_bits: "Novelty (bits)", head_share: "Head exposure",
  head_recall: "Head recall", tail_recall: "Long-tail recall",
} as const;
const chartMetrics = ["ndcg", "recall", "mrr", "coverage", "diversity"] as const;
type ChartMetric = typeof chartMetrics[number];
const display = (value: number | null) => value === null ? "—" : value.toFixed(3);
const date = (timestamp: number) => new Date(timestamp * 1000).toISOString().slice(0, 10);

function MetricChart({ report, split, metric }: { report: Report; split: "test" | "validation"; metric: ChartMetric }) {
  const host = useRef<HTMLDivElement>(null);
  const instance = useRef<ReturnType<typeof init>>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!host.current) return;
    const chart = init(host.current, null, { renderer: "svg" });
    instance.current = chart;
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(host.current);
    return () => { observer.disconnect(); chart.dispose(); instance.current = null; };
  }, []);
  useEffect(() => {
    instance.current?.setOption({
      aria: { enabled: true },
      animation: !reduced,
      animationDuration: 280,
      animationDurationUpdate: 320,
      grid: { left: 96, right: 24, top: 12, bottom: 28 },
      tooltip: { trigger: "axis", valueFormatter: (value: unknown) => Number(value).toFixed(3) },
      yAxis: { type: "category", inverse: true, data: modelKeys.map((name) => modelTitles[name]), axisLabel: { color: "#e2d7cc" } },
      xAxis: { type: "value", axisLabel: { color: "#bcb1a7" }, splitLine: { lineStyle: { color: "#35302b" } } },
      series: [{ name: metricLabels[metric], type: "bar", barMaxWidth: 22,
        data: modelKeys.map((name) => ({ value: report[split][name][metric],
          itemStyle: { color: name === report.selected ? "#ff8c59" : "#a19ab4", borderRadius: [0, 5, 5, 0] } })) }],
    });
  }, [report, split, metric, reduced]);
  return <div ref={host} className="chart" aria-hidden="true" />;
}

function Evaluations({ view }: { view: "models" | "evaluation" }) {
  const [report, setReport] = useState<Report>();
  const [error, setError] = useState(false);
  const [split, setSplit] = useState<"test" | "validation">("test");
  const [metric, setMetric] = useState<ChartMetric>("ndcg");
  useEffect(() => {
    const controller = new AbortController();
    fetch(asset("evaluation", "json"), { signal: controller.signal }).then((response) => {
      if (!response.ok) throw new Error("Evaluation report unavailable");
      return response.json() as Promise<Report>;
    }).then(setReport).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, []);
  if (error) return <div className="panel empty" role="alert"><h2>Evaluation unavailable</h2><p>Generate and export the MovieLens report with <code>make evaluate demo-export</code>.</p></div>;
  if (!report) return <p role="status">Loading recorded evaluation…</p>;
  const models = report[split];
  return <div className="lab-grid">
    <section className="panel settings model-head">
      <div><p className="eyebrow accent">RECORDED OFFLINE RUN</p><h2>{report.dataset} <small>{report.version}</small></h2>
        <p>Three models ranked the same available, unseen movies. {modelTitles[report.selected]} was selected on validation nDCG.</p></div>
      <label>Split <select value={split} onChange={(event) => setSplit(event.target.value as "test" | "validation")}>
        <option value="test">Test</option><option value="validation">Validation</option></select></label>
    </section>
    <section className="panel settings">
      <div className="lab-panel-head"><h2>Ranking quality</h2><label>Chart metric <select value={metric} onChange={(event) => setMetric(event.target.value as ChartMetric)}>
        {chartMetrics.map((key) => <option key={key} value={key}>{metricLabels[key]}</option>)}
      </select></label></div>
      <div className="model-tiles">
        {modelKeys.map((name) => <div key={name}><span>{modelTitles[name]}</span>
          <motion.strong key={`${split}-${metric}`} initial={{ opacity: .5 }} animate={{ opacity: 1 }}>{display(models[name][metric])}</motion.strong>
          <small>{name === report.selected ? "Selected on validation" : metricLabels[metric]}</small>
        </div>)}
      </div>
      <MetricChart report={report} split={split} metric={metric} />
      <div className="table-wrap"><table><caption>MovieLens {split} metrics at {report.k}</caption><thead><tr>
        <th scope="col">Metric</th>{modelKeys.map((name) => <th scope="col" key={name}>{modelTitles[name]}</th>)}</tr></thead>
        <tbody>{Object.entries(metricLabels).map(([key, label]) =>
          <tr key={key}><th scope="row">{label}</th>{modelKeys.map((name) => <td key={name}>{display(models[name][key as keyof typeof metricLabels])}</td>)}</tr>)}
          <tr><th scope="row">nDCG 95% interval</th>{modelKeys.map((name) => <td key={name}>{models[name].ndcg_ci95.map(display).join("–")}</td>)}</tr>
          <tr><th scope="row">Eligible viewers</th>{modelKeys.map((name) => <td key={name}>{models[name].users}</td>)}</tr>
          <tr><th scope="row">Head / tail viewers</th>{modelKeys.map((name) => <td key={name}>{models[name].head_recall_users} / {models[name].tail_recall_users}</td>)}</tr>
        </tbody></table></div>
    </section>
    {view === "models" ? <section className="panel settings"><h2>How each model ranks</h2><dl className="definitions">
      <dt>Popularity</dt><dd>Counts historical ratings of four stars or more for each movie.</dd>
      <dt>ItemKNN</dt><dd>Scores movies by cosine similarity to a viewer’s positively rated history.</dd>
      <dt>Implicit ALS</dt><dd>Fits user and item vectors from positive ratings. The score is their dot product. Viewers with no positive history receive popularity scores.</dd>
    </dl></section> : <section className="panel settings">
      <h2>Split and limitations</h2>
      <dl className="definitions"><dt>Global time cutoffs (UTC)</dt><dd>Validation begins {date(report.validation_cutoff)}. Test begins {date(report.test_cutoff)}. Ties stay on the later side.</dd>
        <dt>Ratings per split</dt><dd>{report.events.train} training · {report.events.validation} validation · {report.events.test} test</dd>
        <dt>Candidate protocol</dt><dd>Full available catalog at each cutoff. All prior ratings are excluded from candidates. Held-out ratings of four or five count as relevant.</dd>
        <dt>Cold-start exclusions</dt><dd>{models.popularity.cold_users} viewers without prior ratings · {models.popularity.cold_positive_items} held-out positive user-item pairs for unavailable items.</dd>
        <dt>Activity slices · nDCG@{report.k}</dt><dd>
          {modelKeys.map((name) => <p key={name}>{modelTitles[name]} · {Object.entries(models[name].activity).map(([key, row]) =>
            `${key} ${display(row.ndcg)} (n=${row.users})`).join(" · ")}</p>)}</dd>
        <dt>Uncertainty</dt><dd>The interval bootstraps eligible viewers from this split. Ratings measure explicit preferences. Live viewing, skips, and watch time are outside this evaluation.</dd>
        <dt>Dataset fingerprint · seed {report.seed}</dt><dd><code className="wordwrap">{report.dataset_hash}</code></dd></dl>
      <details className="genre-details"><summary>Recall by genre</summary><div className="table-wrap"><table>
        <caption>Micro-averaged recall across eligible positive viewer–movie pairs</caption>
        <thead><tr><th scope="col">Genre</th><th scope="col">Positive pairs</th>
          {modelKeys.map((name) => <th scope="col" key={name}>{modelTitles[name]}</th>)}</tr></thead>
        <tbody>{Object.entries(models.popularity.by_genre).map(([genre, row]) => <tr key={genre}>
          <th scope="row">{genre}</th><td>{row.positive_pairs}</td>
          {modelKeys.map((name) => <td key={name}>{display(models[name].by_genre[genre].recall)}</td>)}</tr>)}</tbody>
      </table></div></details>
      <a className="button" download="feedcraft-evaluation.json" href={asset("evaluation", "json")}>Download evaluation JSON</a>
    </section>}
  </div>;
}

function summarize(result: Ranking, preferred: Set<string>) {
  const ranked = result.items.map((row) => items[row.item_id]);
  if (!ranked.length) return { novelty: 0, diversity: 0, proxy: 0, coverage: 0, head: 0 };
  const distances = ranked.flatMap((item, index) => ranked.slice(index + 1).map((other) =>
    1 - item.genres.filter((tag) => other.genres.includes(tag)).length / new Set([...item.genres, ...other.genres]).size));
  return {
    novelty: ranked.reduce((sum, item) => sum + 1 - item.popularity, 0) / ranked.length,
    diversity: distances.reduce((sum, value) => sum + value, 0) / Math.max(1, distances.length),
    proxy: ranked.filter((item) => item.genres.some((tag) => preferred.has(tag))).length / ranked.length,
    coverage: ranked.length / Math.max(1, result.candidate_ids.length),
    head: ranked.filter((item) => item.popularity >= 0.75).length / ranked.length,
  };
}

function Simulator({ policy }: { policy: Policy }) {
  const [step, setStep] = useState(seedEvents.length);
  const [running, setRunning] = useState(false);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(() => {
      const next = step + 1;
      setStep(next);
      if (next >= seedEvents.length) setRunning(false);
    }, 900);
    return () => clearTimeout(timer);
  }, [running, step]);
  const [exploration, setExploration] = useState(0.8);
  const [diversity, setDiversity] = useState(policy.diversity_lambda);
  const events = seedEvents.slice(0, step);
  const replayPolicy = { ...policy, diversity_lambda: diversity, candidate_ids: null };
  const low = rank(events, { ...replayPolicy, exploration: 0 }, 4);
  const high = rank(events, { ...replayPolicy, exploration, candidate_ids: low.candidate_ids }, 4);
  const preferred = new Set(events.filter((event) => ["like", "finish"].includes(event.event_type)).flatMap((event) => items[event.item_id].genres));
  const comparisons = [{ name: "Familiar policy", ranking: low }, { name: "Exploration policy", ranking: high }]
    .map((entry) => ({ ...entry, metrics: summarize(entry.ranking, preferred) }));
  const labels = { coverage: "Candidate coverage", diversity: "Genre diversity", novelty: "Mean novelty",
    proxy: "Interest-match proxy", head: "Popular clip share" } as const;

  function exportCard() {
    const blob = new Blob([JSON.stringify({ source: "fictional session replay", top_k: 4, events,
      policies: [{ ...replayPolicy, exploration: 0 }, { ...replayPolicy, exploration, candidate_ids: low.candidate_ids }],
      comparisons }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "feedcraft-experiment.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className="lab-grid">
    <section className="panel settings">
      <p className="eyebrow accent">SYNTHETIC REPLAY</p>
      <div className="lab-panel-head"><h2>Session events</h2>
        <button className="button" type="button" onClick={() => {
          if (running) { setRunning(false); return; }
          if (step >= seedEvents.length) setStep(0);
          setRunning(true);
        }}>{running ? <Pause size={15} /> : <Play size={15} />}{running ? "Pause replay" : "Play replay"}</button>
      </div>
      <p>Move through the same fictional session while both policies rank the same {low.candidate_ids.length} eligible clips.</p>
      <div className="button-group">{Array.from({ length: seedEvents.length + 1 }, (_, index) =>
        <button key={index} type="button" aria-pressed={step === index} onClick={() => { setRunning(false); setStep(index); }}>{index === 0 ? "Before feedback" : `After event ${index}`}</button>)}</div>
      <ol className="trace-list">{events.map((event, index) => <li key={index}>{items[event.item_id].title}<span>{event.event_type}</span></li>)}</ol>
      <div className="slider-pair">
        <label>Exploration <output>{Math.round(exploration * 100)}%</output><input type="range" min="0" max="1" step="0.05" value={exploration} onChange={(event) => setExploration(Number(event.target.value))} /></label>
        <label>Diversity penalty <output>{Math.round(diversity * 100)}%</output><input type="range" min="0" max="1" step="0.05" value={diversity} onChange={(event) => setDiversity(Number(event.target.value))} /></label>
      </div>
    </section>
    <div className="config-grid">{comparisons.map(({ name, ranking, metrics }) => <section className="panel settings" key={name}>
      <h2>{name}</h2><ol className="trace-list">{ranking.items.map((row) =>
        <motion.li layout={reduced ? false : "position"} key={row.item_id}>#{row.rank} {items[row.item_id].title}<code>{row.score.toFixed(3)}</code></motion.li>)}</ol>
      <dl className="policy-metrics">{Object.entries(labels).map(([key, label]) =>
        <div key={key}><dt>{label}</dt><dd>{Math.round(metrics[key as keyof typeof labels] * 100)}%</dd></div>)}</dl>
    </section>)}</div>
    <section className="panel settings"><h2>Experiment card</h2><p>Interest match measures overlap with genres from liked or finished clips. Novelty uses preset fictional popularity. Both are simulation assumptions.</p>
      <button type="button" className="primary" onClick={exportCard}><Download size={16} /> Export experiment JSON</button></section>
  </div>;
}

export function Laboratory({ view, policy }: { view: LabView; policy: Policy }) {
  const titles = { models: "Models", evaluation: "Evaluation", simulator: "Policy Simulator" };
  const subtitles = { models: "Compare three baselines on the same chronological split.",
    evaluation: "Inspect the dataset, candidate protocol, and measured results.",
    simulator: "Replay one fictional session and compare two ranking policies." };
  return <><div className="intro"><div><p className="eyebrow accent">CONTROL ROOM</p><h1>{titles[view]}</h1><p>{subtitles[view]}</p></div></div>
    {view === "simulator" ? <Simulator policy={policy} /> : <Evaluations view={view} />}</>;
}
