"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TableSelector } from "../components/TableSelector";
import { api } from "../lib/api";

type User = { id: number; name: string };
type Creature = {
  user_id: number;
  creature_type: string;
  creature_name: string;
  energy: number;
  stage: string;
  level: number;
  xp: number;
  xp_gained: number;
  xp_current_level: number;
  xp_next_level: number;
  xp_to_next_level: number;
  xp_progress: number;
  status_message: string;
  energy_gained: number;
  stage_message: string;
  reward_reasons: string[];
  total_questions_answered: number;
  total_sessions_completed: number;
  weekly_goal_days: number;
  weekly_practice_days_completed: number;
  weekly_goal_completed: boolean;
  unlocked_cosmetics: Cosmetic[];
  selected_cosmetic: string;
  new_unlocks: Cosmetic[];
};
type Cosmetic = { key: string; name: string; kind: string; unlock: string };
type Question = { fact_id: number; question_type: string; prompt: string; priority_score?: number };
type LearningEvent = { practiced_weak_fact: boolean; improved_fact_accuracy: boolean; practiced_division: boolean };
type CreatureSessionPayload = {
  questions_completed: number;
  mode: "practice" | "challenge";
  first_attempt_correct: number;
  second_attempt_correct: number;
  practiced_weak_fact: boolean;
  improved_fact_accuracy: boolean;
  practiced_division: boolean;
};
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
  creature_events: {
    first_attempt_correct: number;
    second_attempt_correct: number;
    practiced_weak_fact: boolean;
    improved_fact_accuracy: boolean;
    practiced_division: boolean;
  };
};
type ResultQuestion = {
  prompt: string;
  answer_given: string;
  correct_answer: number;
  is_correct: boolean;
  response_time_ms: number;
};
type Mode = "home" | "practice" | "challenge" | "profile" | "dashboard";
type PracticeSummary = {
  attempted: number;
  correct: number;
  secondTryCorrect: number;
  energyGained: number;
  xpGained: number;
  creatureStatus: string;
  creatureName: string;
  stageMessage: string;
  rewardReasons: string[];
  newUnlocks: Cosmetic[];
};

const DEFAULT_TABLES = [2, 3, 4, 5];
const CREATURE_TYPES = ["Blob", "Dragon", "Robot", "Forest Sprite", "Rock Golem", "Space Beast"];

function formatMs(ms: number) {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export default function Home() {
  const [users, setUsers] = useState<User[]>([]);
  const [activeUser, setActiveUser] = useState<User | null>(null);
  const [creature, setCreature] = useState<Creature | null>(null);
  const [name, setName] = useState("");
  const [tab, setTab] = useState<Mode>("home");
  const [tables, setTables] = useState<number[]>(DEFAULT_TABLES);
  const [status, setStatus] = useState("");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [practicePreset, setPracticePreset] = useState(10);
  const [challengePreset, setChallengePreset] = useState(20);

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

  useEffect(() => {
    if (!activeUser) {
      setCreature(null);
      return;
    }
    api<Creature>(`/users/${activeUser.id}/creature`).then(setCreature).catch((error) => setStatus(error.message));
  }, [activeUser]);

  async function createProfile(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    const user = await api<User>("/users", { method: "POST", body: JSON.stringify({ name }) });
    setName("");
    await loadUsers();
    setActiveUser(user);
  }

  async function updateCreature(creatureType: string, creatureName: string) {
    if (!activeUser || !creatureName.trim()) return;
    const updated = await api<Creature>(`/users/${activeUser.id}/creature`, {
      method: "PUT",
      body: JSON.stringify({ creature_type: creatureType, creature_name: creatureName })
    });
    setCreature(updated);
  }

  async function completeCreatureSession(payload: CreatureSessionPayload) {
    if (!activeUser) return null;
    const updated = await api<Creature>(`/users/${activeUser.id}/creature/session-complete`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    setCreature(updated);
    return updated;
  }

  async function selectCosmetic(selectedCosmetic: string) {
    if (!activeUser) return;
    const updated = await api<Creature>(`/users/${activeUser.id}/creature/cosmetic`, {
      method: "PUT",
      body: JSON.stringify({ selected_cosmetic: selectedCosmetic })
    });
    setCreature(updated);
  }

  function startPracticeSession(limit: number) {
    setPracticePreset(limit);
    setTab("practice");
  }

  function startChallengeRound(limit: number) {
    setChallengePreset(limit);
    setTab("challenge");
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Local practice engine</p>
          <h1>Recall Forge</h1>
        </div>
        <details className="settingsMenu">
          <summary>Settings</summary>
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
        </details>
      </header>

      <section className="workspace">
        <nav className="tabs" aria-label="Modes">
          {(["home", "practice", "challenge", "profile", "dashboard"] as const).map((item) => (
            <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)} type="button">
              {item[0].toUpperCase() + item.slice(1)}
            </button>
          ))}
        </nav>
        <label className="modeSelect">
          Mode
          <select value={tab} onChange={(event) => setTab(event.target.value as Mode)}>
            <option value="home">Home</option>
            <option value="practice">Practice</option>
            <option value="challenge">Challenge</option>
            <option value="profile">Profile</option>
            <option value="dashboard">Dashboard</option>
          </select>
        </label>

        {!activeUser ? (
          <div className="emptyState">Open settings to create a profile.</div>
        ) : (
          <>
            <details className="panel collapsiblePanel">
              <summary>Tables: {tables.join(", ")}</summary>
              <TableSelector selected={tables} onChange={setTables} />
            </details>

            {tab === "home" && (
              <CreatureHome
                creature={creature}
                onUpdateCreature={updateCreature}
                onStartPractice={startPracticeSession}
                onStartChallenge={startChallengeRound}
                onShowProfile={() => setTab("profile")}
              />
            )}
            {tab === "practice" && (
              <PracticeMode
                user={activeUser}
                tables={tables}
                initialLimit={practicePreset}
                creature={creature}
                onSessionComplete={completeCreatureSession}
                onShowDashboard={() => setTab("dashboard")}
              />
            )}
            {tab === "challenge" && (
              <ChallengeMode
                user={activeUser}
                tables={tables}
                initialCount={challengePreset}
                creature={creature}
                onSessionComplete={completeCreatureSession}
                onShowDashboard={() => setTab("dashboard")}
              />
            )}
            {tab === "profile" && <CreatureProfile creature={creature} onSelectCosmetic={selectCosmetic} />}
            {tab === "dashboard" && <DashboardView dashboard={dashboard} tables={tables} />}
          </>
        )}
        {status && <p className="error">{status}</p>}
      </section>
    </main>
  );
}

function CreatureHome({
  creature,
  onUpdateCreature,
  onStartPractice,
  onStartChallenge,
  onShowProfile
}: {
  creature: Creature | null;
  onUpdateCreature: (creatureType: string, creatureName: string) => Promise<void>;
  onStartPractice: (limit: number) => void;
  onStartChallenge: (limit: number) => void;
  onShowProfile: () => void;
}) {
  const [creatureType, setCreatureType] = useState(creature?.creature_type || "Blob");
  const [creatureName, setCreatureName] = useState(creature?.creature_name || "");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setCreatureType(creature?.creature_type || "Blob");
    setCreatureName(creature?.creature_name || "");
  }, [creature]);

  async function saveCreature(event: FormEvent) {
    event.preventDefault();
    await onUpdateCreature(creatureType, creatureName);
    setMessage(`${creatureName.trim()} is ready for training.`);
  }

  if (!creature) return <section className="panel">Loading companion...</section>;

  return (
    <section className="creatureHome">
      <div className="creatureCard">
        <div className="creatureAvatarWrap">
          <CreatureAvatar type={creature.creature_type} cosmetic={creature.selected_cosmetic} />
        </div>
        <div className="creatureInfo">
          <p className="eyebrow">{creature.creature_type}</p>
          <h2>{creature.creature_name}</h2>
          <p className="stageLine">
            Level {creature.level} · {creature.stage}
          </p>
          <div className="xpBar" aria-label={`XP progress ${Math.round(creature.xp_progress * 100)} percent`}>
            <span style={{ width: `${Math.round(creature.xp_progress * 100)}%` }} />
          </div>
          <strong>{creature.xp} XP · {creature.xp_to_next_level} XP to next level</strong>
          <div className="energyBar" aria-label={`Energy ${creature.energy} percent`}>
            <span style={{ width: `${creature.energy}%` }} />
          </div>
          <strong>{creature.energy} energy</strong>
          <p className="creatureStatus">{creature.status_message}</p>
          <p className="creatureStatus">
            Weekly training goal: {Math.min(creature.weekly_practice_days_completed, creature.weekly_goal_days)} of {creature.weekly_goal_days} practice days completed.
          </p>
        </div>
      </div>

      <div className="homeActions">
        <button type="button" onClick={() => onStartPractice(5)}>
          Quick Boost
          <span>5 questions</span>
        </button>
        <button type="button" onClick={() => onStartPractice(10)}>
          Training Session
          <span>10 questions</span>
        </button>
        <button type="button" onClick={() => onStartChallenge(20)}>
          Challenge Round
          <span>20 questions</span>
        </button>
      </div>
      <button className="secondaryButton profileButton" type="button" onClick={onShowProfile}>
        View creature profile
      </button>

      <form className="panel creatureSetup" onSubmit={saveCreature}>
        <h2>Companion setup</h2>
        <label>
          Creature
          <select value={creatureType} onChange={(event) => setCreatureType(event.target.value)}>
            {CREATURE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label>
          Name
          <input value={creatureName} onChange={(event) => setCreatureName(event.target.value)} placeholder="Creature name" />
        </label>
        <button type="submit">Save companion</button>
        {message && <p className="feedback">{message}</p>}
      </form>
    </section>
  );
}

function CreatureAvatar({ type, cosmetic = "starter-star" }: { type: string; cosmetic?: string }) {
  return (
    <div className={`creatureAvatar ${type.toLowerCase().replaceAll(" ", "-")} ${cosmetic}`}>
      <span className="eye left" />
      <span className="eye right" />
      <span className="mark" />
    </div>
  );
}

function CreatureProfile({ creature, onSelectCosmetic }: { creature: Creature | null; onSelectCosmetic: (key: string) => Promise<void> }) {
  const [message, setMessage] = useState("");

  if (!creature) return <section className="panel">Loading creature profile...</section>;

  async function chooseCosmetic(key: string) {
    await onSelectCosmetic(key);
    const selected = creature?.unlocked_cosmetics.find((item) => item.key === key);
    setMessage(`${selected?.name || "Cosmetic"} selected.`);
  }

  return (
    <section className="creatureProfile">
      <div className="creatureCard">
        <div className="creatureAvatarWrap">
          <CreatureAvatar type={creature.creature_type} cosmetic={creature.selected_cosmetic} />
        </div>
        <div className="creatureInfo">
          <p className="eyebrow">{creature.creature_type}</p>
          <h2>{creature.creature_name}</h2>
          <p className="stageLine">
            Level {creature.level} · {creature.stage}
          </p>
          <div className="xpBar" aria-label={`XP progress ${Math.round(creature.xp_progress * 100)} percent`}>
            <span style={{ width: `${Math.round(creature.xp_progress * 100)}%` }} />
          </div>
          <strong>
            {creature.xp} XP · {creature.xp_to_next_level} XP to Level {creature.level + 1}
          </strong>
          <p className="creatureStatus">The creature grows stronger as your maths brain grows stronger.</p>
        </div>
      </div>

      <div className="metricGrid">
        <Metric label="Sessions" value={`${creature.total_sessions_completed}`} />
        <Metric label="Questions" value={`${creature.total_questions_answered}`} />
        <Metric label="Weekly goal" value={`${Math.min(creature.weekly_practice_days_completed, creature.weekly_goal_days)}/${creature.weekly_goal_days}`} />
        <Metric label="Cosmetics" value={`${creature.unlocked_cosmetics.length}`} />
      </div>

      <section className="panel">
        <div className="sectionHeader">
          <h2>Cosmetics</h2>
          <span className="quiet">Selected: {creature.unlocked_cosmetics.find((item) => item.key === creature.selected_cosmetic)?.name || "Starter Star"}</span>
        </div>
        <div className="cosmeticGrid">
          {creature.unlocked_cosmetics.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`cosmeticItem ${creature.selected_cosmetic === item.key ? "selected" : ""}`}
              onClick={() => chooseCosmetic(item.key)}
            >
              <strong>{item.name}</strong>
              <span>{item.kind}</span>
              <small>{item.unlock}</small>
            </button>
          ))}
        </div>
        {message && <p className="feedback">{message}</p>}
      </section>
    </section>
  );
}

function PracticeMode({
  user,
  tables,
  initialLimit,
  creature,
  onSessionComplete,
  onShowDashboard
}: {
  user: User;
  tables: number[];
  initialLimit: number;
  creature: Creature | null;
  onSessionComplete: (payload: CreatureSessionPayload) => Promise<Creature | null>;
  onShowDashboard: () => void;
}) {
  const [question, setQuestion] = useState<Question | null>(null);
  const [answer, setAnswer] = useState("");
  const [attemptNumber, setAttemptNumber] = useState(1);
  const [feedback, setFeedback] = useState("");
  const [questionLimit, setQuestionLimit] = useState(initialLimit);
  const [completedCount, setCompletedCount] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [firstAttemptCorrectCount, setFirstAttemptCorrectCount] = useState(0);
  const [secondTryCorrectCount, setSecondTryCorrectCount] = useState(0);
  const [practicedWeakFact, setPracticedWeakFact] = useState(false);
  const [improvedFactAccuracy, setImprovedFactAccuracy] = useState(false);
  const [practicedDivision, setPracticedDivision] = useState(false);
  const [sessionDone, setSessionDone] = useState(false);
  const [summary, setSummary] = useState<PracticeSummary | null>(null);
  const startedAtRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

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
    setQuestionLimit(initialLimit);
  }, [initialLimit]);

  useEffect(() => {
    setCompletedCount(0);
    setCorrectCount(0);
    setFirstAttemptCorrectCount(0);
    setSecondTryCorrectCount(0);
    setPracticedWeakFact(false);
    setImprovedFactAccuracy(false);
    setPracticedDivision(false);
    setSessionDone(false);
    setSummary(null);
    loadQuestion().catch(() => setFeedback("Could not load a question."));
  }, [loadQuestion, questionLimit]);

  async function finishQuestion(delayMs: number, wasCorrect: boolean, event: LearningEvent | null) {
    const nextCount = completedCount + 1;
    const nextCorrect = correctCount + (wasCorrect ? 1 : 0);
    const nextFirstAttemptCorrect = firstAttemptCorrectCount + (wasCorrect && attemptNumber === 1 ? 1 : 0);
    const nextSecondTryCorrect = secondTryCorrectCount + (wasCorrect && attemptNumber === 2 ? 1 : 0);
    const nextPracticedWeakFact = practicedWeakFact || Boolean(event?.practiced_weak_fact);
    const nextImprovedFactAccuracy = improvedFactAccuracy || Boolean(event?.improved_fact_accuracy);
    const nextPracticedDivision = practicedDivision || Boolean(event?.practiced_division);
    setCompletedCount(nextCount);
    setCorrectCount(nextCorrect);
    setFirstAttemptCorrectCount(nextFirstAttemptCorrect);
    setSecondTryCorrectCount(nextSecondTryCorrect);
    setPracticedWeakFact(nextPracticedWeakFact);
    setImprovedFactAccuracy(nextImprovedFactAccuracy);
    setPracticedDivision(nextPracticedDivision);
    if (nextCount >= questionLimit) {
      let updatedCreature: Creature | null = null;
      try {
        updatedCreature = await onSessionComplete({
          questions_completed: questionLimit,
          mode: "practice",
          first_attempt_correct: nextFirstAttemptCorrect,
          second_attempt_correct: nextSecondTryCorrect,
          practiced_weak_fact: nextPracticedWeakFact,
          improved_fact_accuracy: nextImprovedFactAccuracy,
          practiced_division: nextPracticedDivision
        });
      } catch {
        updatedCreature = null;
      }
      setSessionDone(true);
      setQuestion(null);
      setSummary({
        attempted: questionLimit,
        correct: nextCorrect,
        secondTryCorrect: nextSecondTryCorrect,
        energyGained: updatedCreature?.energy_gained || 0,
        xpGained: updatedCreature?.xp_gained || 0,
        creatureStatus: updatedCreature?.status_message || `${creature?.creature_name || "Your companion"} gained energy from your practice.`,
        creatureName: updatedCreature?.creature_name || creature?.creature_name || "Your companion",
        stageMessage: updatedCreature?.stage_message || "",
        rewardReasons: updatedCreature?.reward_reasons || [],
        newUnlocks: updatedCreature?.new_unlocks || []
      });
      return;
    }
    setTimeout(loadQuestion, delayMs);
  }

  function restartSession() {
    setCompletedCount(0);
    setCorrectCount(0);
    setFirstAttemptCorrectCount(0);
    setSecondTryCorrectCount(0);
    setPracticedWeakFact(false);
    setImprovedFactAccuracy(false);
    setPracticedDivision(false);
    setSessionDone(false);
    setSummary(null);
    setFeedback("");
    setAnswer("");
    setAttemptNumber(1);
    setTimeout(loadQuestion, 0);
  }

  async function submitAnswer() {
    if (!question || answer.trim() === "") return;
    const elapsed = Date.now() - startedAtRef.current;
    const result = await api<{ correct: boolean; correct_answer: number; learning_event: LearningEvent }>("/practice/answer", {
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
      finishQuestion(650, true, result.learning_event).catch(() => setFeedback("Practice was recorded, but energy could not update."));
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
    finishQuestion(1100, false, result.learning_event).catch(() => setFeedback("Practice was recorded, but energy could not update."));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    submitAnswer();
  }

  function pressNumberPad(key: string) {
    if (sessionDone) return;
    if (key === "backspace") {
      setAnswer((current) => current.slice(0, -1));
      return;
    }
    if (key === "clear") {
      setAnswer("");
      return;
    }
    if (key === "enter") {
      submitAnswer();
      return;
    }
    setAnswer((current) => `${current}${key}`.slice(0, 4));
  }

  return (
    <section className="practiceSurface practiceSession">
        <div className="practiceControls">
        <div className="segmented" aria-label="Practice length">
          {[5, 10, 15, 20].map((limit) => (
            <button
              key={limit}
              className={questionLimit === limit ? "active" : ""}
              onClick={() => {
                setQuestionLimit(limit);
                setCompletedCount(0);
                setSessionDone(false);
              }}
              type="button"
            >
              {limit}
            </button>
          ))}
        </div>
        <strong>
          {completedCount} / {questionLimit}
        </strong>
      </div>

      {sessionDone ? (
        <div className="sessionComplete">
          <h2>Practice complete</h2>
          <p>{summary?.creatureName || "Your companion"} gained energy.</p>
          <p>Energy gained: +{summary?.energyGained ?? 0}</p>
          <p>XP gained: +{summary?.xpGained ?? 0}</p>
          {summary?.stageMessage && <p>{summary.stageMessage}</p>}
          <p>
            You answered {summary?.correct ?? correctCount} out of {summary?.attempted ?? questionLimit} correctly.
          </p>
          <p>You fixed {summary?.secondTryCorrect ?? secondTryCorrectCount} mistakes on your second try.</p>
          <p>{summary?.creatureStatus}</p>
          <p className="quiet">Mistakes help {summary?.creatureName || "your companion"} learn what to train next.</p>
          {summary?.newUnlocks && summary.newUnlocks.length > 0 && (
            <p className="quiet">Unlocked: {summary.newUnlocks.map((item) => item.name).join(", ")}</p>
          )}
          <div className="actionRow">
            <button type="button" onClick={restartSession}>
              Start again
            </button>
            <button type="button" className="secondaryButton" onClick={onShowDashboard}>
              See results
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="questionText">{question?.prompt || "Loading..."}</div>
          <form className="answerRow" onSubmit={submit}>
            <input
              ref={inputRef}
              inputMode="numeric"
              pattern="[0-9]*"
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submitAnswer();
                }
              }}
              aria-label="Answer"
            />
          </form>
          <NumberPad onPress={pressNumberPad} />
          <div className={`feedback ${feedback.startsWith("Answer") ? "wrong" : ""}`}>{feedback}</div>
        </>
      )}
    </section>
  );
}

function ChallengeMode({
  user,
  tables,
  initialCount,
  creature,
  onSessionComplete,
  onShowDashboard
}: {
  user: User;
  tables: number[];
  initialCount: number;
  creature: Creature | null;
  onSessionComplete: (payload: CreatureSessionPayload) => Promise<Creature | null>;
  onShowDashboard: () => void;
}) {
  const [count, setCount] = useState(initialCount);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [answers, setAnswers] = useState<{ fact_id: number; question_type: string; answer: string; response_time_ms: number }[]>([]);
  const startedAtRef = useRef(0);
  const [result, setResult] = useState<ChallengeResult | null>(null);
  const [creatureReward, setCreatureReward] = useState<Creature | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCount(initialCount);
  }, [initialCount]);

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
    setCreatureReward(null);
    startedAtRef.current = Date.now();
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function submitAnswer() {
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
    let updatedCreature: Creature | null = null;
    try {
      updatedCreature = await onSessionComplete({
        questions_completed: nextAnswers.length,
        mode: "challenge",
        first_attempt_correct: data.creature_events.first_attempt_correct,
        second_attempt_correct: data.creature_events.second_attempt_correct,
        practiced_weak_fact: data.creature_events.practiced_weak_fact,
        improved_fact_accuracy: data.creature_events.improved_fact_accuracy,
        practiced_division: data.creature_events.practiced_division
      });
    } catch {
      updatedCreature = null;
    }
    setCreatureReward(updatedCreature);
    setQuestions([]);
    setResult(data);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    submitAnswer();
  }

  function pressNumberPad(key: string) {
    if (key === "backspace") {
      setAnswer((current) => current.slice(0, -1));
      return;
    }
    if (key === "clear") {
      setAnswer("");
      return;
    }
    if (key === "enter") {
      submitAnswer();
      return;
    }
    setAnswer((current) => `${current}${key}`.slice(0, 4));
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
            <input
              ref={inputRef}
              inputMode="numeric"
              pattern="[0-9]*"
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submitAnswer();
                }
              }}
            />
          </form>
          <NumberPad onPress={pressNumberPad} />
        </div>
      )}
      {result && (
        <ChallengeResults
          result={result}
          creatureName={creatureReward?.creature_name || creature?.creature_name || "Your companion"}
          creatureStatus={creatureReward?.status_message || ""}
          energyGained={creatureReward?.energy_gained || 0}
          xpGained={creatureReward?.xp_gained || 0}
          stageMessage={creatureReward?.stage_message || ""}
          newUnlocks={creatureReward?.new_unlocks || []}
          onRestart={start}
          onShowDashboard={onShowDashboard}
        />
      )}
    </section>
  );
}

function ChallengeResults({
  result,
  creatureName,
  creatureStatus,
  energyGained,
  xpGained,
  stageMessage,
  newUnlocks,
  onRestart,
  onShowDashboard
}: {
  result: ChallengeResult;
  creatureName: string;
  creatureStatus: string;
  energyGained: number;
  xpGained: number;
  stageMessage: string;
  newUnlocks: Cosmetic[];
  onRestart: () => void;
  onShowDashboard: () => void;
}) {
  return (
    <div className="results">
      <div className="creatureResult">
        <strong>{creatureName} gained {energyGained} energy and {xpGained} XP from your challenge.</strong>
        {stageMessage && <p>{stageMessage}</p>}
        {creatureStatus && <p>{creatureStatus}</p>}
        {newUnlocks.length > 0 && <p>Unlocked: {newUnlocks.map((item) => item.name).join(", ")}</p>}
      </div>
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
      <div className="actionRow">
        <button type="button" onClick={onRestart}>Run again</button>
        <button type="button" className="secondaryButton" onClick={onShowDashboard}>See dashboard</button>
      </div>
    </div>
  );
}

function NumberPad({ onPress }: { onPress: (key: string) => void }) {
  return (
    <div className="numberPad" aria-label="Number pad">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "backspace"].map((key) => (
        <button key={key} type="button" className={key.length > 1 ? "utility" : ""} onClick={() => onPress(key)}>
          {key === "backspace" ? "⌫" : key === "clear" ? "C" : key}
        </button>
      ))}
      <button type="button" className="enter" onClick={() => onPress("enter")}>
        Enter
      </button>
    </div>
  );
}

function DashboardView({ dashboard, tables }: { dashboard: Dashboard | null; tables: number[] }) {
  const [showFactLabels, setShowFactLabels] = useState(false);
  const selectedTables = useMemo(() => [...tables].sort((a, b) => a - b), [tables]);
  const selectedCells = useMemo(
    () => (dashboard?.cells || []).filter((cell) => selectedTables.includes(cell.a) && selectedTables.includes(cell.b)),
    [dashboard, selectedTables]
  );
  const selectedTotals = useMemo(() => {
    const correct = selectedCells.reduce((sum, cell) => sum + cell.correct_count, 0);
    const incorrect = selectedCells.reduce((sum, cell) => sum + cell.incorrect_count, 0);
    const total = correct + incorrect;
    return { correct, incorrect, accuracy: total ? correct / total : null };
  }, [selectedCells]);
  const selectedStrengths = useMemo(
    () => selectedCells.filter((cell) => cell.accuracy !== null).sort((a, b) => (b.accuracy || 0) - (a.accuracy || 0) || (a.average_time_ms || 999999) - (b.average_time_ms || 999999)).slice(0, 5),
    [selectedCells]
  );
  const selectedWeaknesses = useMemo(
    () => selectedCells.filter((cell) => cell.accuracy !== null).sort((a, b) => b.priority_score - a.priority_score).slice(0, 5),
    [selectedCells]
  );

  if (!dashboard) return <section className="panel">Loading dashboard...</section>;

  return (
    <section className="dashboard">
      <div className="metricGrid">
        <Metric label="Answers" value={`${selectedTotals.correct + selectedTotals.incorrect}`} />
        <Metric label="Correct" value={`${selectedTotals.correct}`} />
        <Metric label="Incorrect" value={`${selectedTotals.incorrect}`} />
        <Metric label="Accuracy" value={selectedTotals.accuracy === null ? "-" : `${Math.round(selectedTotals.accuracy * 100)}%`} />
      </div>
      <div className="dashboardControls">
        <label className="toggleRow">
          <input type="checkbox" checked={showFactLabels} onChange={(event) => setShowFactLabels(event.target.checked)} />
          Show facts in heat map boxes
        </label>
      </div>
      <HeatMap title="Accuracy" cells={selectedCells} tables={selectedTables} colourKey="accuracy_colour" valueKey="accuracy" showFactLabels={showFactLabels} />
      <HeatMap title="Speed" cells={selectedCells} tables={selectedTables} colourKey="speed_colour" valueKey="average_time_ms" showFactLabels={showFactLabels} speed />
      <div className="split">
        <FactList title="Strengths" facts={selectedStrengths} />
        <FactList title="Weaknesses" facts={selectedWeaknesses} />
      </div>
    </section>
  );
}

function HeatMap({
  title,
  cells,
  tables,
  colourKey,
  valueKey,
  showFactLabels,
  speed = false
}: {
  title: string;
  cells: DashboardCell[];
  tables: number[];
  colourKey: "accuracy_colour" | "speed_colour";
  valueKey: "accuracy" | "average_time_ms";
  showFactLabels: boolean;
  speed?: boolean;
}) {
  const cellByPair = new Map(cells.map((cell) => [`${cell.a}-${cell.b}`, cell]));

  function cellClass(cell: DashboardCell | undefined, value: number | null) {
    if (!cell || value === null) return "empty";
    if (!speed) return cell[colourKey];
    if (value <= 1000) return "speed0";
    if (value <= 2000) return "speed1";
    if (value <= 3000) return "speed2";
    if (value <= 4000) return "speed3";
    if (value <= 5000) return "speed4";
    if (value <= 6000) return "speed5";
    if (value <= 7000) return "speed6";
    if (value <= 8000) return "speed7";
    if (value <= 9000) return "speed8";
    if (value <= 10000) return "speed9";
    return "speed10";
  }

  return (
    <section className="panel">
      <div className="sectionHeader">
        <h2>{title}</h2>
      </div>
      <div className="heatMapFrame">
        <div className="heatMap" style={{ gridTemplateColumns: `54px repeat(${tables.length}, minmax(58px, 1fr)) 54px` }}>
          <div className="heatCorner" />
          {tables.map((table) => (
            <div key={`${title}-col-${table}`} className="heatHeader">
              {table}
            </div>
          ))}
          <div className="heatCorner" />
          {tables.map((row) => (
            <div className="heatRow" key={`${title}-row-${row}`} style={{ display: "contents" }}>
              <div className="heatHeader">{row}</div>
              {tables.map((column) => {
                const cell = cellByPair.get(`${row}-${column}`);
                const value = cell ? cell[valueKey] : null;
                return (
                  <div key={`${title}-${row}-${column}`} className={`heatCell ${cellClass(cell, value as number | null)}`} title={`${row} x ${column}`}>
                    {showFactLabels && <span>{row} x {column}</span>}
                    <small>{value === null ? "No data" : speed ? formatMs(value as number) : `${Math.round((value as number) * 100)}%`}</small>
                  </div>
                );
              })}
              <div className="heatHeader">{row}</div>
            </div>
          ))}
        </div>
      </div>
      {speed && (
        <div className="heatLegend">
          {[
            ["empty", "No data"],
            ["speed0", "0 - 1 s"],
            ["speed1", "1 - 2 s"],
            ["speed2", "2 - 3 s"],
            ["speed3", "3 - 4 s"],
            ["speed4", "4 - 5 s"],
            ["speed5", "5 - 6 s"],
            ["speed6", "6 - 7 s"],
            ["speed7", "7 - 8 s"],
            ["speed8", "8 - 9 s"],
            ["speed9", "9 - 10 s"],
            ["speed10", "> 10 s"]
          ].map(([className, label]) => (
            <span key={label} className={className}>{label}</span>
          ))}
        </div>
      )}
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
