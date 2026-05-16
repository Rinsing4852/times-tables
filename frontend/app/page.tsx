"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TableSelector } from "../components/TableSelector";
import { api } from "../lib/api";

type User = { id: number; name: string };
type Question = { fact_id: number; question_type: string; prompt: string; priority_score?: number };
type DashboardCell = {
  fact_id: number;
  a: number;
  b: number;
  label: string;
  accuracy_colour: string;
  speed_colour: string;
  accuracy: number | null;
  average_time_ms: number | null;
  correct_count: number;
  incorrect_count: number;
  priority_score: number;
};
type Dashboard = {
  totals: { correct: number; incorrect: number; accuracy: number | null };
  cells: DashboardCell[];
  strengths: DashboardCell[];
  weaknesses: DashboardCell[];
};
type ChallengeResult = {
  total_time_ms: number;
  average_time_ms: number;
  accuracy: number;
  correct_count: number;
  question_count: number;
  fastest: ResultQuestion;
  slowest: ResultQuestion;
  incorrect_answers: ResultQuestion[];
  previous_10: { id: number; accuracy: number; total_time_ms: number; average_time_ms: number; created_at: string }[];
};
type ResultQuestion = {
  prompt: string;
  answer_given: string;
  correct_answer: number;
  is_correct: boolean;
  response_time_ms: number;
};

const DEFAULT_TABLES = [2, 3, 4, 5];

function formatMs(ms: number) {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export default function Home() {
  const [users, setUsers] = useState<User[]>([]);
  const [activeUser, setActiveUser] = useState<User | null>(null);
  const [name, setName] = useState("");
  const [tab, setTab] = useState<"practice" | "challenge" | "dashboard">("practice");
  const [tables, setTables] = useState<number[]>(DEFAULT_TABLES);
  const [status, setStatus] = useState("");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);

  async function loadUsers() {
    const data = await api<User[]>("/users");
    setUsers(data);
    setActiveUser((current) => current || data[0] || null);
  }

  useEffect(() => {
    loadUsers().catch((error) => setStatus(error.message));
  }, []);

  useEffect(() => {
    if (activeUser && tab === "dashboard") {
      api<Dashboard>(`/dashboard/${activeUser.id}`).then(setDashboard).catch((error) => setStatus(error.message));
    }
  }, [activeUser, tab]);

  async function createProfile(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    const user = await api<User>("/users", { method: "POST", body: JSON.stringify({ name }) });
    setName("");
    await loadUsers();
    setActiveUser(user);
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Local practice engine</p>
          <h1>Recall Forge</h1>
        </div>
        <form className="profileForm" onSubmit={createProfile}>
          <select
            value={activeUser?.id || ""}
            onChange={(event) => setActiveUser(users.find((user) => user.id === Number(event.target.value)) || null)}
            aria-label="Active profile"
          >
            <option value="">Choose profile</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="New profile" />
          <button type="submit">Add</button>
        </form>
      </header>

      <section className="workspace">
        <nav className="tabs" aria-label="Modes">
          {(["practice", "challenge", "dashboard"] as const).map((item) => (
            <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)} type="button">
              {item[0].toUpperCase() + item.slice(1)}
            </button>
          ))}
        </nav>

        {!activeUser ? (
          <div className="emptyState">Create a profile to begin.</div>
        ) : (
          <>
            {tab !== "dashboard" && (
              <section className="panel">
                <div className="sectionHeader">
                  <h2>Tables</h2>
                </div>
                <TableSelector selected={tables} onChange={setTables} />
              </section>
            )}

            {tab === "practice" && <PracticeMode user={activeUser} tables={tables} />}
            {tab === "challenge" && <ChallengeMode user={activeUser} tables={tables} />}
            {tab === "dashboard" && <DashboardView dashboard={dashboard} />}
          </>
        )}
        {status && <p className="error">{status}</p>}
      </section>
    </main>
  );
}

function PracticeMode({ user, tables }: { user: User; tables: number[] }) {
  const [question, setQuestion] = useState<Question | null>(null);
  const [answer, setAnswer] = useState("");
  const [attemptNumber, setAttemptNumber] = useState(1);
  const [feedback, setFeedback] = useState("");
  const startedAtRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedTables = tables.join(",");

  const loadQuestion = useCallback(async () => {
    if (tables.length === 0) return;
    const next = await api<Question>("/practice/question", {
      method: "POST",
      body: JSON.stringify({ user_id: user.id, tables })
    });
    setQuestion(next);
    setAnswer("");
    setAttemptNumber(1);
    setFeedback("");
    startedAtRef.current = Date.now();
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [tables, user.id]);

  useEffect(() => {
    loadQuestion().catch(() => setFeedback("Could not load a question."));
  }, [loadQuestion]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!question || answer.trim() === "") return;
    const elapsed = Date.now() - startedAtRef.current;
    const result = await api<{ correct: boolean; correct_answer: number }>("/practice/answer", {
      method: "POST",
      body: JSON.stringify({
        user_id: user.id,
        fact_id: question.fact_id,
        question_type: question.question_type,
        answer,
        attempt_number: attemptNumber,
        response_time_ms: elapsed
      })
    });
    if (result.correct) {
      setFeedback(attemptNumber === 1 ? "Correct." : "Got it on the second try.");
      setTimeout(loadQuestion, 650);
      return;
    }
    if (attemptNumber === 1) {
      setAttemptNumber(2);
      setAnswer("");
      setFeedback("Try once more.");
      startedAtRef.current = Date.now();
      inputRef.current?.focus();
      return;
    }
    setFeedback(`Answer: ${result.correct_answer}`);
    setTimeout(loadQuestion, 1100);
  }

  return (
    <section className="practiceSurface">
      <div className="questionText">{question?.prompt || "Loading..."}</div>
      <form className="answerRow" onSubmit={submit}>
        <input
          ref={inputRef}
          inputMode="numeric"
          pattern="[0-9]*"
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          aria-label="Answer"
        />
        <button type="submit">Check</button>
      </form>
      <div className={`feedback ${feedback.startsWith("Answer") ? "wrong" : ""}`}>{feedback}</div>
    </section>
  );
}

function ChallengeMode({ user, tables }: { user: User; tables: number[] }) {
  const [count, setCount] = useState(20);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [answers, setAnswers] = useState<{ fact_id: number; question_type: string; answer: string; response_time_ms: number }[]>([]);
  const startedAtRef = useRef(0);
  const [result, setResult] = useState<ChallengeResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function start() {
    const data = await api<{ questions: Question[] }>("/challenge/start", {
      method: "POST",
      body: JSON.stringify({ user_id: user.id, tables, question_count: count })
    });
    setQuestions(data.questions);
    setIndex(0);
    setAnswers([]);
    setAnswer("");
    setResult(null);
    startedAtRef.current = Date.now();
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const current = questions[index];
    if (!current || answer.trim() === "") return;
    const nextAnswers = [
      ...answers,
      { fact_id: current.fact_id, question_type: current.question_type, answer, response_time_ms: Date.now() - startedAtRef.current }
    ];
    setAnswer("");
    if (index + 1 < questions.length) {
      setAnswers(nextAnswers);
      setIndex(index + 1);
      startedAtRef.current = Date.now();
      return;
    }
    const data = await api<ChallengeResult>("/challenge/submit", {
      method: "POST",
      body: JSON.stringify({ user_id: user.id, tables, answers: nextAnswers })
    });
    setQuestions([]);
    setResult(data);
  }

  const current = questions[index];

  return (
    <section className="panel">
      {questions.length === 0 && !result && (
        <div className="challengeSetup">
          <label>
            Questions
            <input type="number" min={1} max={100} value={count} onChange={(event) => setCount(Number(event.target.value))} />
          </label>
          <button type="button" onClick={start}>
            Start challenge
          </button>
        </div>
      )}
      {current && (
        <div className="practiceSurface compact">
          <div className="progressLine">
            {index + 1} of {questions.length}
          </div>
          <div className="questionText">{current.prompt}</div>
          <form className="answerRow" onSubmit={submit}>
            <input ref={inputRef} inputMode="numeric" pattern="[0-9]*" value={answer} onChange={(event) => setAnswer(event.target.value)} />
            <button type="submit">Next</button>
          </form>
        </div>
      )}
      {result && <ChallengeResults result={result} onRestart={start} />}
    </section>
  );
}

function ChallengeResults({ result, onRestart }: { result: ChallengeResult; onRestart: () => void }) {
  return (
    <div className="results">
      <div className="metricGrid">
        <Metric label="Accuracy" value={`${Math.round(result.accuracy * 100)}%`} />
        <Metric label="Total time" value={formatMs(result.total_time_ms)} />
        <Metric label="Average" value={formatMs(result.average_time_ms)} />
        <Metric label="Score" value={`${result.correct_count}/${result.question_count}`} />
      </div>
      <div className="split">
        <div>
          <h3>Fastest</h3>
          <p>{result.fastest.prompt} · {formatMs(result.fastest.response_time_ms)}</p>
        </div>
        <div>
          <h3>Slowest</h3>
          <p>{result.slowest.prompt} · {formatMs(result.slowest.response_time_ms)}</p>
        </div>
      </div>
      <h3>Incorrect answers</h3>
      {result.incorrect_answers.length === 0 ? (
        <p className="quiet">None this time.</p>
      ) : (
        <ul className="plainList">
          {result.incorrect_answers.map((item, index) => (
            <li key={`${item.prompt}-${index}`}>
              {item.prompt} You said {item.answer_given}; answer {item.correct_answer}.
            </li>
          ))}
        </ul>
      )}
      <h3>Previous 10</h3>
      {result.previous_10.length === 0 ? (
        <p className="quiet">No earlier challenges yet.</p>
      ) : (
        <div className="history">
          {result.previous_10.map((item) => (
            <span key={item.id}>{Math.round(item.accuracy * 100)}% · {formatMs(item.average_time_ms)}</span>
          ))}
        </div>
      )}
      <button type="button" onClick={onRestart}>Run again</button>
    </div>
  );
}

function DashboardView({ dashboard }: { dashboard: Dashboard | null }) {
  const accuracyRows = useMemo(() => groupRows(dashboard?.cells || []), [dashboard]);

  if (!dashboard) return <section className="panel">Loading dashboard...</section>;

  return (
    <section className="dashboard">
      <div className="metricGrid">
        <Metric label="Answers" value={`${dashboard.totals.correct + dashboard.totals.incorrect}`} />
        <Metric label="Correct" value={`${dashboard.totals.correct}`} />
        <Metric label="Incorrect" value={`${dashboard.totals.incorrect}`} />
        <Metric label="Accuracy" value={dashboard.totals.accuracy === null ? "-" : `${Math.round(dashboard.totals.accuracy * 100)}%`} />
      </div>
      <HeatMap title="Accuracy" rows={accuracyRows} colourKey="accuracy_colour" valueKey="accuracy" />
      <HeatMap title="Speed" rows={accuracyRows} colourKey="speed_colour" valueKey="average_time_ms" speed />
      <div className="split">
        <FactList title="Strengths" facts={dashboard.strengths} />
        <FactList title="Weaknesses" facts={dashboard.weaknesses} />
      </div>
    </section>
  );
}

function groupRows(cells: DashboardCell[]) {
  return Array.from({ length: 11 }, (_, index) => {
    const table = index + 2;
    return cells.filter((cell) => cell.a === table);
  });
}

function HeatMap({
  title,
  rows,
  colourKey,
  valueKey,
  speed = false
}: {
  title: string;
  rows: DashboardCell[][];
  colourKey: "accuracy_colour" | "speed_colour";
  valueKey: "accuracy" | "average_time_ms";
  speed?: boolean;
}) {
  return (
    <section className="panel">
      <div className="sectionHeader">
        <h2>{title}</h2>
      </div>
      <div className="heatMap">
        {rows.flat().map((cell) => (
          <div key={`${title}-${cell.fact_id}`} className={`heatCell ${cell[colourKey]}`} title={cell.label}>
            <span>{cell.label}</span>
            <small>{cell[valueKey] === null ? "-" : speed ? formatMs(cell[valueKey] as number) : `${Math.round((cell[valueKey] as number) * 100)}%`}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function FactList({ title, facts }: { title: string; facts: DashboardCell[] }) {
  return (
    <div className="panel">
      <h2>{title}</h2>
      {facts.length === 0 ? (
        <p className="quiet">Answer a few questions first.</p>
      ) : (
        <ul className="plainList">
          {facts.map((fact) => (
            <li key={`${title}-${fact.fact_id}`}>
              {fact.label}: {fact.accuracy === null ? "-" : `${Math.round(fact.accuracy * 100)}%`} · {fact.average_time_ms ? formatMs(fact.average_time_ms) : "-"}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
