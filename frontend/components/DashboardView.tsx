"use client";

import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import type { Dashboard, DashboardCell, QuestionMode, RetentionAssessment } from "../lib/types";
import { Metric } from "./Metric";
import { TableSelector } from "./TableSelector";

const ALL_TABLES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
export type DashboardSection = "overview" | "accuracy" | "speed" | "progress" | "retention";

function formatMs(ms: number) {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function DashboardView({
  dashboard,
  tables,
  profileName,
  initialView = "overview",
  canScheduleRetention,
  onScheduleRetention,
  onStartRetention,
}: {
  dashboard: Dashboard | null;
  tables: number[];
  profileName: string;
  initialView?: DashboardSection;
  canScheduleRetention: boolean;
  onScheduleRetention: (questionCount: number, questionMode: QuestionMode, testTables: number[]) => Promise<void>;
  onStartRetention: (assessment: RetentionAssessment) => void;
}) {
  const [view, setView] = useState<DashboardSection>(initialView);
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

  useEffect(() => setView(initialView), [initialView, profileName]);

  if (!dashboard) return <section className="panel">Loading dashboard...</section>;

  return (
    <section className="dashboard">
      <div className="sectionHeader"><div><p className="eyebrow">Progress dashboard</p><h2>{profileName}&apos;s progress</h2></div></div>
      <div className="dashboardTabs" aria-label="Dashboard view">
        {([['overview', 'Overview'], ['accuracy', 'Accuracy'], ['speed', 'Speed'], ['progress', 'Progress'], ['retention', 'Memory tests']] as const).map(([value, label]) => (
          <button type="button" key={value} className={view === value ? "active" : ""} onClick={() => setView(value)}>{label}</button>
        ))}
      </div>
      <div className="dashboardControls">
        <span className="quiet">
          {view === "progress" ? "Learning history across all tables" : view === "retention" ? "Baseline, 4-week and 8-week checks" : `Showing selected tables: ${selectedTables.join(", ")}`}
        </span>
      </div>
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
      {view === "retention" && (
        <RetentionAssessments
          assessments={dashboard.retention_assessments}
          selectedTables={selectedTables}
          profileName={profileName}
          canSchedule={canScheduleRetention}
          onSchedule={onScheduleRetention}
          onStart={onStartRetention}
        />
      )}
    </section>
  );
}

function formatDate(value: string | null) {
  if (!value) return "Not scheduled";
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function RetentionAssessments({
  assessments,
  selectedTables,
  profileName,
  canSchedule,
  onSchedule,
  onStart,
}: {
  assessments: RetentionAssessment[];
  selectedTables: number[];
  profileName: string;
  canSchedule: boolean;
  onSchedule: (questionCount: number, questionMode: QuestionMode, testTables: number[]) => Promise<void>;
  onStart: (assessment: RetentionAssessment) => void;
}) {
  const [questionCount, setQuestionCount] = useState(20);
  const [questionMode, setQuestionMode] = useState<QuestionMode>("multiply");
  const [testTables, setTestTables] = useState(selectedTables);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const startButtonRef = useRef<HTMLButtonElement>(null);
  const focusStartAfterSchedule = useRef(false);
  const activeAssessment = assessments.find((item) => item.status !== "completed");

  useEffect(() => {
    if (!activeAssessment?.can_start || !focusStartAfterSchedule.current) return;
    focusStartAfterSchedule.current = false;
    requestAnimationFrame(() => startButtonRef.current?.focus({ preventScroll: true }));
  }, [activeAssessment?.assessment_id, activeAssessment?.can_start]);

  async function schedule() {
    setSaving(true);
    setMessage("Scheduling baseline...");
    focusStartAfterSchedule.current = true;
    try {
      await onSchedule(questionCount, questionMode, testTables);
      setMessage(`Baseline ready for ${profileName}.`);
    } catch (error) {
      focusStartAfterSchedule.current = false;
      setMessage(error instanceof Error ? error.message : "Could not schedule the recall check.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel retentionDashboard">
      <div className="sectionHeader">
        <div><p className="eyebrow">Long-term retention</p><h2>Memory tests</h2></div>
      </div>
      <ol className="retentionSteps">
        <li><strong>Set up a baseline test.</strong> Choose the tables, question count and question type.</li>
        <li><strong>Complete the baseline.</strong> The Start test button appears here and on the learner home screen.</li>
        <li><strong>Repeat at 4 and 8 weeks.</strong> The same questions measure retained accuracy and recall speed.</li>
      </ol>
      {canSchedule && !activeAssessment && (
        <div className="retentionSetup">
          <div className="retentionTableChoice">
            <strong>Tables to test</strong>
            <TableSelector selected={testTables} onChange={setTestTables} />
          </div>
          <label>
            Questions
            <select value={questionCount} onChange={(event) => setQuestionCount(Number(event.target.value))}>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={30}>30</option>
            </select>
          </label>
          <label>
            Question type
            <select value={questionMode} onChange={(event) => setQuestionMode(event.target.value as QuestionMode)}>
              <option value="multiply">Multiplication</option>
              <option value="division">Division</option>
              <option value="mixed">Mixed</option>
            </select>
          </label>
          <button type="button" onClick={schedule} disabled={saving}>{saving ? "Creating test..." : "Create baseline test"}</button>
        </div>
      )}
      {activeAssessment && (
        <div className="retentionNotice">
          <span><strong>{activeAssessment.next_round_label}:</strong> {activeAssessment.can_start ? "ready to start now" : `planned for ${formatDate(activeAssessment.next_due_at)}`}.</span>
          {activeAssessment.can_start && <button ref={startButtonRef} type="button" onClick={() => onStart(activeAssessment)}>Start test</button>}
        </div>
      )}
      {message && <p className="feedback" role="status">{message}</p>}
      {assessments.length === 0 ? (
        <p className="quiet">No long-term memory test has been created yet.</p>
      ) : (
        <div className="retentionHistory">
          {assessments.map((assessment) => (
            <article className="retentionAssessmentCard" key={assessment.assessment_id}>
              <div className="retentionAssessmentHeader">
                <div><strong>Tables {assessment.selected_tables.join(", ")}</strong><span>{assessment.question_count} questions · {assessment.question_mode}</span></div>
                <span>{assessment.status === "completed" ? "Complete" : "In progress"}</span>
              </div>
              <div className="retentionTimeline" aria-label="Recall-check schedule">
                {([
                  ["baseline", "Baseline", assessment.baseline_completed_at],
                  ["week4", "4 weeks", assessment.week4_due_at],
                  ["week8", "8 weeks", assessment.week8_due_at],
                ] as const).map(([key, label, date]) => {
                  const round = assessment.rounds.find((item) => item.round_key === key);
                  return <div key={key} className={round ? "complete" : assessment.next_round_key === key && assessment.can_start ? "ready" : ""}><strong>{label}</strong><span>{round ? formatDate(round.completed_at) : key === "baseline" ? "Ready" : formatDate(date)}</span></div>;
                })}
              </div>
              {assessment.rounds.length > 0 && (
                <div className="retentionRoundList">
                  {assessment.rounds.map((round) => (
                    <div className="retentionRound" key={round.round_id}>
                      <strong>{round.label}</strong>
                      <span>{Math.round(round.accuracy * 100)}% accuracy</span>
                      <span>{formatMs(round.average_time_ms)} average</span>
                      <span>{formatMs(round.median_time_ms)} median</span>
                      <small>
                        {round.accuracy_change === null
                          ? "Starting point"
                          : `${round.accuracy_change >= 0 ? "+" : ""}${Math.round(round.accuracy_change * 100)} percentage points · ${round.average_time_change_ms !== null && round.average_time_change_ms < 0 ? `${formatMs(Math.abs(round.average_time_change_ms))} faster` : `${formatMs(round.average_time_change_ms || 0)} slower`}`}
                      </small>
                    </div>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ParentStats({ dashboard }: { dashboard: Dashboard }) {
  const retention = dashboard.retention;
  const accuracyLabel = (value: number | null) => value === null ? "Not enough data" : `${Math.round(value * 100)}%`;
  return (
    <section className="panel parentStats">
      <h2>Parent stats</h2>
      <h3>Memory reviews</h3>
      <div className="metricGrid retentionMetrics">
        <Metric label="Ready to review" value={`${retention.due}`} />
        <Metric label="Due for a while" value={`${retention.overdue}`} />
        <Metric label="Remembered facts" value={`${retention.state_counts.secure}`} />
        <Metric label="Building confidence" value={`${retention.state_counts.acquiring}`} />
        <Metric label="7-day review accuracy" value={accuracyLabel(retention.review_accuracy_7_days.accuracy)} />
        <Metric label="30-day review accuracy" value={accuracyLabel(retention.review_accuracy_30_days.accuracy)} />
      </div>
      <p className="quiet">
        In review: {retention.state_counts.reviewing} · Not practised yet: {retention.state_counts.unseen} · Facts returned to training: {retention.total_lapses}.
        Second-try fixes are recorded separately from first-try recall.
      </p>
      <p className="reviewSchedule"><strong>Review intervals</strong><span>1 · 3 · 7 · 14 · 30 · 60 days</span></p>
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
        <div className="heatMap" style={{ "--heat-columns": columns.length } as CSSProperties}>
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
