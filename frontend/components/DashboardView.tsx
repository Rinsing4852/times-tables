"use client";

import { useMemo, useState } from "react";
import type { Dashboard, DashboardCell } from "../lib/types";
import { Metric } from "./Metric";

const ALL_TABLES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function formatMs(ms: number) {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function DashboardView({ dashboard, tables, profileName }: { dashboard: Dashboard | null; tables: number[]; profileName: string }) {
  const [view, setView] = useState<"overview" | "accuracy" | "speed" | "progress">("overview");
  const selectedTables = useMemo(() => [...tables].sort((a, b) => a - b), [tables]);
  const selectedCells = useMemo(() => (dashboard?.cells || []).filter((cell) => selectedTables.includes(cell.a)), [dashboard, selectedTables]);
  const selectedTotals = useMemo(() => {
    const correct = selectedCells.reduce((sum, cell) => sum + cell.correct_count, 0);
    const incorrect = selectedCells.reduce((sum, cell) => sum + cell.incorrect_count, 0);
    const secondAttemptCorrect = selectedCells.reduce((sum, cell) => sum + cell.second_attempt_correct, 0);
    const total = correct + incorrect;
    return { correct, incorrect, secondAttemptCorrect, accuracy: total ? correct / total : null };
  }, [selectedCells]);
  const selectedStrengths = useMemo(
    () => selectedCells.filter((cell) => cell.accuracy !== null).sort((a, b) => (b.accuracy || 0) - (a.accuracy || 0) || (a.average_time_ms || 999999) - (b.average_time_ms || 999999)).slice(0, 5),
    [selectedCells],
  );
  const selectedWeaknesses = useMemo(
    () => selectedCells.filter((cell) => cell.accuracy !== null).sort((a, b) => b.priority_score - a.priority_score).slice(0, 5),
    [selectedCells],
  );

  if (!dashboard) return <section className="panel">Loading dashboard...</section>;

  return (
    <section className="dashboard">
      <div className="sectionHeader"><div><p className="eyebrow">Progress dashboard</p><h2>{profileName}&apos;s progress</h2></div></div>
      <div className="dashboardTabs" aria-label="Dashboard view">
        {([['overview', 'Overview'], ['accuracy', 'Accuracy'], ['speed', 'Speed'], ['progress', 'Progress']] as const).map(([value, label]) => (
          <button type="button" key={value} className={view === value ? "active" : ""} onClick={() => setView(value)}>{label}</button>
        ))}
      </div>
      <div className="dashboardControls"><span className="quiet">Showing selected tables: {selectedTables.join(", ")}</span></div>
      {view === "overview" && (
        <>
          <div className="metricGrid">
            <Metric label="Answers" value={`${selectedTotals.correct + selectedTotals.incorrect}`} />
            <Metric label="Correct" value={`${selectedTotals.correct}`} />
            <Metric label="Incorrect" value={`${selectedTotals.incorrect}`} />
            <Metric label="Accuracy" value={selectedTotals.accuracy === null ? "-" : `${Math.round(selectedTotals.accuracy * 100)}%`} />
          </div>
          <p className="quiet">Accuracy uses first answers. Second-try fixes are tracked separately: {selectedTotals.secondAttemptCorrect}.</p>
          <div className="split"><FactList title="Strengths" facts={selectedStrengths} /><FactList title="Weaknesses" facts={selectedWeaknesses} /></div>
        </>
      )}
      {view === "accuracy" && <HeatMap title="Accuracy" cells={selectedCells} rows={selectedTables} columns={ALL_TABLES} valueKey="accuracy" />}
      {view === "speed" && <HeatMap title="Speed" cells={selectedCells} rows={selectedTables} columns={ALL_TABLES} valueKey="average_time_ms" speed />}
      {view === "progress" && <ParentStats dashboard={dashboard} />}
    </section>
  );
}

function ParentStats({ dashboard }: { dashboard: Dashboard }) {
  const retention = dashboard.retention;
  const accuracyLabel = (value: number | null) => value === null ? "Not enough data" : `${Math.round(value * 100)}%`;
  return (
    <section className="panel parentStats">
      <h2>Parent stats</h2>
      <h3>Learning and retention</h3>
      <div className="metricGrid retentionMetrics">
        <Metric label="Ready to review" value={`${retention.due}`} />
        <Metric label="Overdue" value={`${retention.overdue}`} />
        <Metric label="Secure facts" value={`${retention.state_counts.secure}`} />
        <Metric label="Acquiring" value={`${retention.state_counts.acquiring}`} />
        <Metric label="7-day review accuracy" value={accuracyLabel(retention.review_accuracy_7_days.accuracy)} />
        <Metric label="30-day review accuracy" value={accuracyLabel(retention.review_accuracy_30_days.accuracy)} />
      </div>
      <p className="quiet">
        Reviewing: {retention.state_counts.reviewing} · Unseen: {retention.state_counts.unseen} · Lapses after review: {retention.total_lapses}.
        Second-try fixes do not count as independent retained recall.
      </p>
      <div className="split">
        <div><h3>Facts needing more exposure</h3><FactMiniList facts={dashboard.needing_exposure} /></div>
        <div><h3>Facts improving</h3><FactMiniList facts={dashboard.improving} /></div>
      </div>
      <h3>Accuracy by table</h3>
      <div className="tableStatsGrid">
        {dashboard.table_stats.map((item) => (
          <div key={item.table} className="tableStat"><strong>{item.table}x</strong><span>{item.accuracy === null ? "-" : `${Math.round(item.accuracy * 100)}%`}</span><small>{item.average_time_ms ? formatMs(item.average_time_ms) : "No timing yet"} · {item.secure_facts} secure · {item.due_facts} due</small></div>
        ))}
      </div>
      <h3>Recent practice history</h3>
      {dashboard.recent_history.length === 0 ? <p className="quiet">No recent answers yet.</p> : (
        <ul className="plainList">
          {dashboard.recent_history.map((item, index) => <li key={`${item.prompt}-${index}`}>{item.prompt}: {item.is_correct ? "correct" : "reviewed"} · {formatMs(item.response_time_ms)} · {item.mode}</li>)}
        </ul>
      )}
      <h3>Progress over time</h3>
      {dashboard.progress_over_time.length === 0 ? <p className="quiet">No progress history yet.</p> : (
        <div className="progressGrid">
          {dashboard.progress_over_time.slice(-14).map((item) => (
            <div key={item.date} className="progressDay"><strong>{item.date.slice(5)}</strong><span>{item.accuracy === null ? "-" : `${Math.round(item.accuracy * 100)}%`}</span><small>{item.attempts} answers · {item.average_time_ms ? formatMs(item.average_time_ms) : "no timing"}</small></div>
          ))}
        </div>
      )}
    </section>
  );
}

function FactMiniList({ facts }: { facts: DashboardCell[] }) {
  if (facts.length === 0) return <p className="quiet">Not enough data yet.</p>;
  return <ul className="plainList">{facts.slice(0, 6).map((fact) => <li key={fact.fact_id}>{fact.label}: {fact.accuracy === null ? "new" : `${Math.round(fact.accuracy * 100)}%`} · {fact.average_time_ms ? formatMs(fact.average_time_ms) : "more practice helpful"}</li>)}</ul>;
}

function HeatMap({
  title,
  cells,
  rows,
  columns,
  valueKey,
  speed = false,
}: {
  title: string;
  cells: DashboardCell[];
  rows: number[];
  columns: number[];
  valueKey: "accuracy" | "average_time_ms";
  speed?: boolean;
}) {
  const cellByPair = new Map(cells.map((cell) => [`${cell.a}-${cell.b}`, cell]));

  function cellClass(cell: DashboardCell | undefined, value: number | null) {
    if (!cell || value === null) return "empty";
    if (speed) {
      if (value <= 2000) return "heat0";
      if (value <= 3500) return "heat1";
      if (value <= 5000) return "heat2";
      if (value <= 7000) return "heat3";
      return "heat4";
    }
    if (value >= 0.9) return "heat0";
    if (value >= 0.75) return "heat1";
    if (value >= 0.6) return "heat2";
    if (value >= 0.4) return "heat3";
    return "heat4";
  }

  return (
    <section className="panel">
      <div className="sectionHeader"><h2>{title}</h2></div>
      <div className="heatMapFrame">
        <div className="heatMap" style={{ gridTemplateColumns: `44px repeat(${columns.length}, minmax(42px, 1fr))` }}>
          <div className="heatCorner" />
          {columns.map((table) => <div key={`${title}-col-${table}`} className="heatHeader heatColumnHeader">{table}</div>)}
          {rows.map((row) => (
            <div className="heatRow" key={`${title}-row-${row}`} style={{ display: "contents" }}>
              <div className="heatHeader heatRowHeader">{row}</div>
              {columns.map((column) => {
                const cell = cellByPair.get(`${row}-${column}`);
                const value = cell ? cell[valueKey] : null;
                return <div key={`${title}-${row}-${column}`} className={`heatCell ${cellClass(cell, value as number | null)}`} aria-label={`${row} times ${column}: ${value === null ? "no data" : speed ? formatMs(value as number) : `${Math.round((value as number) * 100)} percent`}`} />;
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="heatLegend">
        {[["empty", "No data"], ["heat0", speed ? "Fast" : "90-100%"], ["heat1", speed ? "Quick" : "75-89%"], ["heat2", speed ? "Steady" : "60-74%"], ["heat3", speed ? "Building" : "40-59%"], ["heat4", speed ? "More practice" : "0-39%"]].map(([className, label]) => <span key={label} className={className}>{label}</span>)}
      </div>
    </section>
  );
}

function FactList({ title, facts }: { title: string; facts: DashboardCell[] }) {
  return (
    <div className="panel">
      <h2>{title}</h2>
      {facts.length === 0 ? <p className="quiet">Answer a few questions first.</p> : (
        <ul className="plainList">{facts.map((fact) => <li key={`${title}-${fact.fact_id}`}>{fact.label}: {fact.accuracy === null ? "-" : `${Math.round(fact.accuracy * 100)}%`} · {fact.average_time_ms ? formatMs(fact.average_time_ms) : "-"}</li>)}</ul>
      )}
    </div>
  );
}
