"use client";

import { FormEvent, RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NumberPad } from "../components/NumberPad";
import { ProfileLogin } from "../components/ProfileLogin";
import { TableSelector } from "../components/TableSelector";
import { api } from "../lib/api";

type User = { id: number; name: string; is_admin: boolean; password_set: boolean; creature_type?: string; creature_name?: string };
type QuestionMode = "mixed" | "multiply" | "division";
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
  next_stage: string | null;
  next_stage_level: number | null;
  xp_to_next_stage: number;
  xp_progress: number;
  status_message: string;
  energy_gained: number;
  stage_message: string;
  evolution_from: string | null;
  evolution_to: string | null;
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
type Question = { question_id: number; fact_id: number; question_type: string; prompt: string; priority_score?: number };
type LearningEvent = { practiced_weak_fact: boolean; improved_fact_accuracy: boolean; practiced_division: boolean };
type TrainingQuest = {
  quest_id: number;
  quest_type: string;
  title: string;
  description: string;
  target_fact_ids: number[];
  question_count: number;
  reward_xp: number;
  reward_note: string;
  status: string;
  completed_at: string | null;
};
type QuestStart = { session_id: string; quest: TrainingQuest; questions: Question[] };
type QuestCompleteResult = {
  quest: TrainingQuest;
  creature: Creature;
  facts_practised: string[];
  learning_message: string;
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
  second_attempt_correct: number;
  second_attempt_total: number;
  priority_score: number;
};
type Dashboard = {
  totals: { correct: number; incorrect: number; accuracy: number | null; second_attempt_correct: number; second_attempt_total: number };
  cells: DashboardCell[];
  strengths: DashboardCell[];
  weaknesses: DashboardCell[];
  table_stats: { table: number; accuracy: number | null; average_time_ms: number | null; answers: number }[];
  needing_exposure: DashboardCell[];
  improving: DashboardCell[];
  recent_history: { prompt: string; is_correct: boolean; response_time_ms: number; mode: string; created_at: string }[];
  progress_over_time: { date: string; attempts: number; correct: number; accuracy: number | null; average_time_ms: number | null }[];
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
  personal_best_average_ms: number | null;
  recent_average_ms: number | null;
  beat_recent_average: boolean;
  creature: Creature;
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
type Mode = "home" | "practice" | "quest" | "challenge" | "profile" | "dashboard" | "evolution";
type EvolutionEvent = {
  creatureName: string;
  creatureType: string;
  fromStage: string;
  toStage: string;
};
type PracticeSummary = {
  attempted: number;
  correct: number;
  secondTryCorrect: number;
  energyGained: number;
  xpGained: number;
  creatureStatus: string;
  creatureName: string;
  stageMessage: string;
  evolutionFrom: string | null;
  evolutionTo: string | null;
  rewardReasons: string[];
  newUnlocks: Cosmetic[];
};

const DEFAULT_TABLES = [2, 3, 4, 5];
const ALL_TABLES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const CREATURE_TYPES = ["Blob", "Dragon", "Robot", "Forest Sprite", "Rock Golem", "Space Beast"];
const CREATURE_STAGES = [
  { name: "Egg", level: 1 },
  { name: "Hatchling", level: 2 },
  { name: "Youngling", level: 4 },
  { name: "Explorer", level: 7 },
  { name: "Champion", level: 11 }
];
const STAGE_SLUGS: Record<string, string> = {
  Egg: "egg",
  Hatchling: "hatchling",
  Youngling: "youngling",
  Explorer: "explorer",
  Champion: "champion"
};
const CREATURE_SLUGS: Record<string, string> = {
  Blob: "blob",
  Dragon: "dragon",
  Robot: "robot",
  "Forest Sprite": "forest-sprite",
  "Rock Golem": "rock-golem",
  "Space Beast": "space-beast"
};

function formatMs(ms: number) {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function readAnswer(inputRef: RefObject<HTMLInputElement | null>) {
  return inputRef.current?.value.trim() || "";
}

function setAnswerValue(inputRef: RefObject<HTMLInputElement | null>, value: string) {
  if (inputRef.current) inputRef.current.value = value;
}

function focusAnswer(inputRef: RefObject<HTMLInputElement | null>) {
  requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
}

function pressAnswerKey(inputRef: RefObject<HTMLInputElement | null>, key: string, submitAnswer: () => void, disabled = false) {
  if (disabled) return;
  const current = readAnswer(inputRef);
  if (key === "backspace") {
    setAnswerValue(inputRef, current.slice(0, -1));
    focusAnswer(inputRef);
    return;
  }
  if (key === "clear") {
    setAnswerValue(inputRef, "");
    focusAnswer(inputRef);
    return;
  }
  if (key === "enter") {
    submitAnswer();
    return;
  }
  setAnswerValue(inputRef, `${current}${key}`.slice(0, 4));
  focusAnswer(inputRef);
}

function creatureAsset(type: string, stage: string) {
  const typeSlug = CREATURE_SLUGS[type] || "blob";
  const stageSlug = STAGE_SLUGS[stage] || "egg";
  return `/assets/creatures/${typeSlug}-${stageSlug}.svg`;
}

function creatureSlug(type: string) {
  return CREATURE_SLUGS[type] || "blob";
}

export default function Home() {
  const [users, setUsers] = useState<User[]>([]);
  const [activeUser, setActiveUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [creature, setCreature] = useState<Creature | null>(null);
  const [name, setName] = useState("");
  const [bootstrapPassword, setBootstrapPassword] = useState("");
  const [tab, setTab] = useState<Mode>("home");
  const [tables, setTables] = useState<number[]>(DEFAULT_TABLES);
  const [questionMode, setQuestionMode] = useState<QuestionMode>("mixed");
  const [status, setStatus] = useState("");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [dashboardUserId, setDashboardUserId] = useState<number | null>(null);
  const [practicePreset, setPracticePreset] = useState(10);
  const [challengePreset, setChallengePreset] = useState(20);
  const [quests, setQuests] = useState<TrainingQuest[]>([]);
  const [activeQuest, setActiveQuest] = useState<QuestStart | null>(null);
  const [appVersion, setAppVersion] = useState("");
  const [adminUsers, setAdminUsers] = useState<User[]>([]);
  const [pendingEvolution, setPendingEvolution] = useState<EvolutionEvent | null>(null);
  const [postEvolutionTab, setPostEvolutionTab] = useState<Mode>("home");
  const focusMode = tab === "practice" || tab === "quest" || tab === "challenge" || tab === "evolution";

  function queueEvolution(updatedCreature: Creature | null) {
    if (!updatedCreature?.evolution_from || !updatedCreature.evolution_to) return;
    setPendingEvolution({
      creatureName: updatedCreature.creature_name,
      creatureType: updatedCreature.creature_type,
      fromStage: updatedCreature.evolution_from,
      toStage: updatedCreature.evolution_to
    });
  }

  function navigate(nextTab: Mode) {
    setSettingsOpen(false);
    if (pendingEvolution && tab !== "evolution") {
      setPostEvolutionTab(nextTab);
      setTab("evolution");
      return;
    }
    setTab(nextTab);
  }

  function continueAfterEvolution() {
    const nextTab = postEvolutionTab === "evolution" ? "home" : postEvolutionTab;
    setPendingEvolution(null);
    setPostEvolutionTab("home");
    setTab(nextTab);
  }

  async function loadUsers() {
    const data = await api<User[]>("/users");
    setUsers(data);
    setActiveUser((current) => (current ? data.find((user) => user.id === current.id) || null : null));
    return data;
  }

  useEffect(() => {
    loadUsers()
      .then(async (data) => {
        try {
          const loggedIn = await api<User>("/auth/me");
          setActiveUser(data.find((user) => user.id === loggedIn.id) || loggedIn);
          setDashboardUserId(loggedIn.id);
        } catch {
          setActiveUser(null);
        }
      })
      .catch((error) => setStatus(error.message))
      .finally(() => setAuthReady(true));
    api<{ version: string }>("/version").then((data) => setAppVersion(data.version)).catch(() => setAppVersion(""));
  }, []);

  useEffect(() => {
    const handleExpiredSession = () => {
      setActiveUser(null);
      setCreature(null);
      setQuests([]);
      setDashboard(null);
      setStatus("Your session expired. Please choose your profile again.");
    };
    window.addEventListener("recall-forge:auth-expired", handleExpiredSession);
    return () => window.removeEventListener("recall-forge:auth-expired", handleExpiredSession);
  }, []);

  async function login(userId: number, password: string) {
    setLoginError("");
    try {
      const loggedIn = await api<User>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ user_id: userId, password })
      });
      setActiveUser(loggedIn);
      setDashboardUserId(loggedIn.id);
      setTab("home");
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "That passcode was not accepted.");
    }
  }

  async function logout() {
    await api<{ logged_out: boolean }>("/auth/logout", { method: "POST" });
    setActiveUser(null);
    setCreature(null);
    setQuests([]);
    setDashboard(null);
    setDashboardUserId(null);
    setAdminUsers([]);
    setTab("home");
  }

  useEffect(() => {
    if (activeUser && dashboardUserId && tab === "dashboard") {
      let cancelled = false;
      api<Dashboard>(`/dashboard/${dashboardUserId}`)
        .then((data) => { if (!cancelled) setDashboard(data); })
        .catch((error) => { if (!cancelled) setStatus(error.message); });
      return () => { cancelled = true; };
    }
  }, [activeUser, dashboardUserId, tab]);

  const loadAdminUsers = useCallback(async () => {
    if (!activeUser?.is_admin) return;
    const data = await api<User[]>(`/admin/${activeUser.id}/users`);
    setAdminUsers(data);
  }, [activeUser]);

  const loadQuests = useCallback(async (userId = activeUser?.id) => {
    if (!userId) return;
    const data = await api<{ quests: TrainingQuest[] }>(`/users/${userId}/quests`);
    setQuests(data.quests);
  }, [activeUser?.id]);

  useEffect(() => {
    if (!activeUser) {
      setCreature(null);
      return;
    }
    let cancelled = false;
    api<Creature>(`/users/${activeUser.id}/creature`)
      .then((data) => { if (!cancelled) setCreature(data); })
      .catch((error) => { if (!cancelled) setStatus(error.message); });
    api<{ quests: TrainingQuest[] }>(`/users/${activeUser.id}/quests`)
      .then((data) => { if (!cancelled) setQuests(data.quests); })
      .catch((error) => { if (!cancelled) setStatus(error.message); });
    if (activeUser.is_admin) {
      api<User[]>(`/admin/${activeUser.id}/users`)
        .then((data) => { if (!cancelled) setAdminUsers(data); })
        .catch((error) => { if (!cancelled) setStatus(error.message); });
    }
    return () => { cancelled = true; };
  }, [activeUser]);

  async function createProfile(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setLoginError("");
    try {
      const user = await api<User>("/users", {
        method: "POST",
        body: JSON.stringify({ name, password: bootstrapPassword || undefined })
      });
      setName("");
      const password = bootstrapPassword;
      setBootstrapPassword("");
      await loadUsers();
      await login(user.id, password);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "The parent profile could not be created.");
    }
  }

  async function refreshActiveWorkspace() {
    const updatedUsers = await loadUsers();
    const currentUser = activeUser ? updatedUsers.find((user) => user.id === activeUser.id) || null : updatedUsers[0] || null;
    if (!currentUser) {
      setCreature(null);
      setQuests([]);
      setDashboard(null);
      setAdminUsers([]);
      return;
    }
    setActiveUser(currentUser);
    const updatedCreature = await api<Creature>(`/users/${currentUser.id}/creature`);
    setCreature(updatedCreature);
    await loadQuests(currentUser.id);
    if (currentUser.is_admin) {
      const adminList = await api<User[]>(`/admin/${currentUser.id}/users`);
      setAdminUsers(adminList);
    } else {
      setAdminUsers([]);
    }
    if (tab === "dashboard" && dashboardUserId) {
      const updatedDashboard = await api<Dashboard>(`/dashboard/${dashboardUserId}`);
      setDashboard(updatedDashboard);
    }
  }

  async function updateCreature(creatureType: string, creatureName: string) {
    if (!activeUser || !creatureName.trim()) return;
    const updated = await api<Creature>(`/users/${activeUser.id}/creature`, {
      method: "PUT",
      body: JSON.stringify({ creature_type: creatureType, creature_name: creatureName })
    });
    setCreature(updated);
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
    navigate("practice");
  }

  function startChallengeRound(limit: number) {
    setChallengePreset(limit);
    navigate("challenge");
  }

  async function startQuest(quest: TrainingQuest) {
    if (!activeUser) return;
    const data = await api<QuestStart>(`/users/${activeUser.id}/quests/${quest.quest_id}/start`, { method: "POST" });
    setActiveQuest(data);
    navigate("quest");
  }

  return (
    <main className={`shell ${focusMode ? "focusShell" : ""}`}>
      {!focusMode && <header className="topbar">
        <div>
          <p className="eyebrow">Local practice engine</p>
          <h1>Recall Forge</h1>
        </div>
        {activeUser && <details className="settingsMenu" open={settingsOpen} onToggle={(event) => setSettingsOpen(event.currentTarget.open)}>
          <summary>Settings</summary>
          <div className="settingsPanel">
          <div className="profileForm">
            <strong>{activeUser?.name}</strong>
            <button type="button" className="secondaryButton" onClick={logout}>Log out</button>
            {appVersion && <p className="versionLine">Recall Forge v{appVersion}</p>}
          </div>
          {activeUser && (
            <div className="settingsActions" aria-label="Settings pages">
              <button type="button" className={tab === "profile" ? "active" : ""} onClick={() => navigate("profile")}>
                Profile
              </button>
              <button type="button" className={tab === "dashboard" ? "active" : ""} onClick={() => {
                setDashboardUserId(activeUser.id);
                navigate("dashboard");
              }}>
                Dashboard
              </button>
            </div>
          )}
          {activeUser?.is_admin && (
            <AdminPanel
              adminUser={activeUser}
              users={adminUsers}
              onRefresh={refreshActiveWorkspace}
              onViewDashboard={(userId) => {
                setDashboard(null);
                setDashboardUserId(userId);
                navigate("dashboard");
              }}
            />
          )}
          </div>
        </details>}
      </header>}

      <section className="workspace">
        {!focusMode && <nav className="tabs" aria-label="Modes">
          {(["home", "practice", "challenge"] as const).map((item) => (
            <button key={item} className={tab === item ? "active" : ""} onClick={() => navigate(item)} type="button">
              {item[0].toUpperCase() + item.slice(1)}
            </button>
          ))}
        </nav>}
        {!focusMode && <label className="modeSelect">
          Mode
          <select value={tab === "profile" || tab === "dashboard" ? "home" : tab} onChange={(event) => navigate(event.target.value as Mode)}>
            <option value="home">Home</option>
            <option value="practice">Practice</option>
            <option value="challenge">Challenge</option>
          </select>
        </label>}

        {!authReady ? (
          <div className="emptyState">Loading profiles...</div>
        ) : !activeUser ? (
          <ProfileLogin
            users={users}
            error={loginError}
            onLogin={login}
            name={name}
            password={bootstrapPassword}
            onNameChange={setName}
            onPasswordChange={setBootstrapPassword}
            onCreate={createProfile}
          />
        ) : (
          <>
            {!focusMode && <details className="panel collapsiblePanel">
              <summary>Tables: {tables.join(", ")}</summary>
              <TableSelector selected={tables} onChange={setTables} />
            </details>}
            {!focusMode && <div className="panel compactPanel">
              <span className="fieldLabel">Question type</span>
              <div className="segmented modeSegment" aria-label="Question type">
                {([
                  ["mixed", "Mixed"],
                  ["multiply", "Multiplication"],
                  ["division", "Division"],
                ] as const).map(([value, label]) => (
                  <button key={value} type="button" className={questionMode === value ? "active" : ""} onClick={() => setQuestionMode(value)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>}

            {tab === "home" && (
              <CreatureHome
                creature={creature}
                onStartPractice={startPracticeSession}
                onStartChallenge={startChallengeRound}
                quests={quests}
                onStartQuest={startQuest}
              />
            )}
            {tab === "practice" && (
              <PracticeMode
                user={activeUser}
                tables={tables}
                questionMode={questionMode}
                initialLimit={practicePreset}
                creature={creature}
                onCreatureUpdate={(updated) => {
                  setCreature(updated);
                  queueEvolution(updated);
                }}
                onBackHome={() => navigate("home")}
                onRestart={() => navigate("practice")}
                onShowDashboard={() => navigate("dashboard")}
              />
            )}
            {tab === "quest" && activeQuest && (
              <QuestMode
                questStart={activeQuest}
                creature={creature}
                onCreatureUpdate={(updated) => {
                  setCreature(updated);
                  queueEvolution(updated);
                  loadQuests(activeUser.id).catch((error) => setStatus(error.message));
                }}
                onShowDashboard={() => navigate("dashboard")}
                onBackHome={() => navigate("home")}
              />
            )}
            {tab === "challenge" && (
              <ChallengeMode
                user={activeUser}
                tables={tables}
                questionMode={questionMode}
                initialCount={challengePreset}
                creature={creature}
                onCreatureUpdate={(updated) => {
                  setCreature(updated);
                  queueEvolution(updated);
                }}
                onBackHome={() => navigate("home")}
                onRestart={() => navigate("challenge")}
                onShowDashboard={() => navigate("dashboard")}
              />
            )}
            {tab === "profile" && <CreatureProfile creature={creature} onSelectCosmetic={selectCosmetic} onUpdateCreature={updateCreature} />}
            {tab === "dashboard" && (
              <DashboardView
                dashboard={dashboard}
                tables={tables}
                profileName={users.find((user) => user.id === dashboardUserId)?.name || activeUser.name}
              />
            )}
            {tab === "evolution" && pendingEvolution && (
              <EvolutionPage event={pendingEvolution} onContinue={continueAfterEvolution} />
            )}
          </>
        )}
        {status && <p className="error">{status}</p>}
      </section>
    </main>
  );
}

function CreatureHome({
  creature,
  onStartPractice,
  onStartChallenge,
  quests,
  onStartQuest
}: {
  creature: Creature | null;
  onStartPractice: (limit: number) => void;
  onStartChallenge: (limit: number) => void;
  quests: TrainingQuest[];
  onStartQuest: (quest: TrainingQuest) => void;
}) {
  if (!creature) return <section className="panel">Loading companion...</section>;

  return (
    <section className="creatureHome">
      <div className="creatureCard">
        <div className={`creatureAvatarWrap habitat-${creatureSlug(creature.creature_type)}`}>
          <CreatureAvatar type={creature.creature_type} stage={creature.stage} cosmetic={creature.selected_cosmetic} />
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
          {creature.next_stage && (
            <p className="creatureStatus">
              Next stage: {creature.next_stage} in {creature.xp_to_next_stage} XP.
            </p>
          )}
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
      <section className="panel questSection">
        <div className="sectionHeader">
          <h2>Training Quests</h2>
          <span className="quiet">{creature.creature_name} found some training quests.</span>
        </div>
        <div className="questGrid">
          {quests.slice(0, 4).map((quest) => (
            <article className="questCard" key={quest.quest_id}>
              <h3>{quest.title}</h3>
              <p>{quest.description}</p>
              <div className="questMeta">
                <span>{quest.question_count} questions</span>
                <span>Reward: {quest.reward_xp} XP</span>
              </div>
              <button type="button" onClick={() => onStartQuest(quest)}>
                Start quest
              </button>
            </article>
          ))}
        </div>
      </section>

    </section>
  );
}

function CreatureAvatar({ type, stage, cosmetic = "starter-star" }: { type: string; stage: string; cosmetic?: string }) {
  const stageAsset = creatureAsset(type, stage);
  return (
    <div className={`creatureAvatar ${type.toLowerCase().replaceAll(" ", "-")} stage-${stage.toLowerCase()} ${cosmetic}`} role="img" aria-label={`${type} ${stage} stage`}>
      <span className="creatureStageAsset" style={{ backgroundImage: `url(${stageAsset})` }} />
    </div>
  );
}

function EvolutionPrompt({ creatureName, toStage }: { creatureName: string; toStage: string }) {
  return (
    <div className="evolutionPrompt">
      <span>Something is happening...</span>
      <strong>It looks like {creatureName} is trying to evolve.</strong>
      <p>Next stop: {toStage}.</p>
    </div>
  );
}

function EvolutionPage({ event, onContinue }: { event: EvolutionEvent; onContinue: () => void }) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setRevealed(true), reducedMotion ? 100 : 2800);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <section className={`evolutionPage ${revealed ? "revealed" : "transforming"}`} aria-live="polite">
      <div className="evolutionStars" aria-hidden="true" />
      <p className="eyebrow">Evolution</p>
      <h2>{revealed ? `${event.creatureName} evolved!` : `${event.creatureName} is evolving...`}</h2>
      <div className="evolutionMorph" role="img" aria-label={`${event.creatureName} evolves from ${event.fromStage} to ${event.toStage}`}>
        <div className="evolutionForm evolutionBeforeForm" aria-hidden="true">
          <CreatureAvatar type={event.creatureType} stage={event.fromStage} />
        </div>
        <div className="evolutionBurst" aria-hidden="true"><span /></div>
        <div className="evolutionForm evolutionAfterForm" aria-hidden="true">
          <CreatureAvatar type={event.creatureType} stage={event.toStage} />
        </div>
      </div>
      {revealed && <div className="evolutionMessage visible">
        <strong>{event.creatureName} reached {event.toStage} stage.</strong>
        <p>Your practice helped {event.creatureName} grow stronger.</p>
      </div>}
      {revealed && <button type="button" className="startTestButton evolutionContinue" onClick={onContinue}>Continue</button>}
    </section>
  );
}

function AdminPanel({
  adminUser,
  users,
  onRefresh,
  onViewDashboard
}: {
  adminUser: User;
  users: User[];
  onRefresh: () => Promise<void>;
  onViewDashboard: (userId: number) => void;
}) {
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newAdmin, setNewAdmin] = useState(false);
  const [message, setMessage] = useState("");

  async function createUser(event: FormEvent) {
    event.preventDefault();
    if (!newName.trim()) return;
    await api<User>(`/admin/${adminUser.id}/users`, {
      method: "POST",
      body: JSON.stringify({ name: newName, password: newPassword || null, is_admin: newAdmin }),
    });
    setNewName("");
    setNewPassword("");
    setNewAdmin(false);
    setMessage("Profile created.");
    await onRefresh();
  }

  function downloadBackup() {
    window.open(`/backend-api/admin/${adminUser.id}/backup`, "_blank", "noopener,noreferrer");
  }

  function exportProgress() {
    window.open(`/backend-api/admin/${adminUser.id}/progress.csv`, "_blank", "noopener,noreferrer");
  }

  return (
    <section className="adminPanel">
      <div className="adminHeader">
        <div>
          <h2>User management</h2>
          <p className="quiet">Create profiles, reset passcodes, and manage local access.</p>
        </div>
        <span>{users.length} profiles</span>
      </div>
      <div className="adminExportActions">
        <button type="button" className="secondaryButton" onClick={downloadBackup}>Download backup</button>
        <button type="button" className="secondaryButton" onClick={exportProgress}>Export progress CSV</button>
      </div>
      <form className="adminCreate" onSubmit={createUser}>
        <input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Profile name" />
        <input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="New passcode" type="password" />
        <label className="toggleRow">
          <input type="checkbox" checked={newAdmin} onChange={(event) => setNewAdmin(event.target.checked)} />
          Admin
        </label>
        <button type="submit">Create</button>
      </form>
      <div className="adminUserList">
        {users.map((user) => (
          <AdminUserRow key={user.id} adminUser={adminUser} user={user} onRefresh={onRefresh} onViewDashboard={onViewDashboard} />
        ))}
      </div>
      {message && <p className="feedback">{message}</p>}
    </section>
  );
}

function AdminUserRow({
  adminUser,
  user,
  onRefresh,
  onViewDashboard
}: {
  adminUser: User;
  user: User;
  onRefresh: () => Promise<void>;
  onViewDashboard: (userId: number) => void;
}) {
  const [name, setName] = useState(user.name);
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(user.is_admin);

  useEffect(() => {
    setName(user.name);
    setIsAdmin(user.is_admin);
  }, [user]);

  async function save() {
    await api<User>(`/admin/${adminUser.id}/users/${user.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name, is_admin: isAdmin, password: password || undefined }),
    });
    setPassword("");
    await onRefresh();
  }

  async function resetProgress() {
    if (!window.confirm(`Reset progress for ${user.name}? Creature XP, energy, attempts, and dashboard history will restart.`)) return;
    await api(`/admin/${adminUser.id}/users/${user.id}/reset-progress`, { method: "POST" });
    await onRefresh();
  }

  async function deleteUser() {
    if (!window.confirm(`Delete ${user.name}? This removes the profile and all progress.`)) return;
    await api(`/admin/${adminUser.id}/users/${user.id}`, { method: "DELETE" });
    await onRefresh();
  }

  return (
    <div className="adminUserRow">
      <div className="adminUserMeta">
        <strong>{user.name}</strong>
        <span>{user.is_admin ? "Admin" : "Learner"} · {user.password_set ? "Passcode set" : "No passcode"}</span>
      </div>
      <label>
        Name
        <input value={name} onChange={(event) => setName(event.target.value)} aria-label={`Rename ${user.name}`} />
      </label>
      <label>
        Passcode
        <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder={user.password_set ? "Reset passcode" : "Set passcode"} type="password" />
      </label>
      <label className="toggleRow adminToggle">
        <input type="checkbox" checked={isAdmin} onChange={(event) => setIsAdmin(event.target.checked)} />
        Admin
      </label>
      <div className="adminRowActions">
        <button type="button" className="secondaryButton" onClick={() => onViewDashboard(user.id)}>View dashboard</button>
        <button type="button" onClick={save}>Save</button>
        <button type="button" className="secondaryButton" onClick={resetProgress}>Reset progress</button>
        <button type="button" className="dangerButton" onClick={deleteUser} disabled={user.id === adminUser.id}>Delete</button>
      </div>
    </div>
  );
}

function CreatureProfile({
  creature,
  onSelectCosmetic,
  onUpdateCreature,
}: {
  creature: Creature | null;
  onSelectCosmetic: (key: string) => Promise<void>;
  onUpdateCreature: (creatureType: string, creatureName: string) => Promise<void>;
}) {
  const [message, setMessage] = useState("");
  const [creatureType, setCreatureType] = useState(creature?.creature_type || "Blob");
  const [creatureName, setCreatureName] = useState(creature?.creature_name || "");

  useEffect(() => {
    setCreatureType(creature?.creature_type || "Blob");
    setCreatureName(creature?.creature_name || "");
  }, [creature]);

  if (!creature) return <section className="panel">Loading creature profile...</section>;

  async function chooseCosmetic(key: string) {
    await onSelectCosmetic(key);
    const selected = creature?.unlocked_cosmetics.find((item) => item.key === key);
    setMessage(`${selected?.name || "Cosmetic"} selected.`);
  }

  async function saveCreature(event: FormEvent) {
    event.preventDefault();
    const trimmedName = creatureName.trim();
    if (!trimmedName) {
      setMessage("Choose a companion name first.");
      return;
    }
    await onUpdateCreature(creatureType, trimmedName);
    setMessage(`${trimmedName} is ready for training.`);
  }

  return (
    <section className="creatureProfile">
      <div className="creatureCard">
        <div className={`creatureAvatarWrap habitat-${creatureSlug(creature.creature_type)}`}>
          <CreatureAvatar type={creature.creature_type} stage={creature.stage} cosmetic={creature.selected_cosmetic} />
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
          {creature.next_stage && (
            <p className="creatureStatus">
              Next evolution: {creature.next_stage} at Level {creature.next_stage_level} · {creature.xp_to_next_stage} XP to go.
            </p>
          )}
          <p className="creatureStatus">The creature grows stronger as your maths brain grows stronger.</p>
        </div>
      </div>

      <section className="panel evolutionPathSection">
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Growth path</p>
            <h2>{creature.creature_name}&apos;s evolutions</h2>
          </div>
          <span className="quiet">Current stage: {creature.stage}</span>
        </div>
        <div className="evolutionPath" aria-label={`${creature.creature_name}'s evolution stages`}>
          {CREATURE_STAGES.map((item) => {
            const current = item.name === creature.stage;
            const reached = creature.level >= item.level;
            return (
              <div key={item.name} className={`evolutionStep ${current ? "current" : ""} ${reached ? "reached" : "future"}`}>
                <div className="evolutionThumbnail">
                  <CreatureAvatar type={creature.creature_type} stage={item.name} cosmetic="" />
                </div>
                <strong>{item.name}</strong>
                <span>Level {item.level}</span>
              </div>
            );
          })}
        </div>
      </section>

      <form className="panel creatureSetup" onSubmit={saveCreature}>
        <h2>Companion setup</h2>
        <div className="speciesField">
          <span className="fieldLabel">Creature</span>
          <div className="speciesPicker" role="group" aria-label="Choose creature">
            {CREATURE_TYPES.map((type) => (
              <button key={type} type="button" className={creatureType === type ? "selected" : ""} aria-pressed={creatureType === type} onClick={() => setCreatureType(type)}>
                <CreatureAvatar type={type} stage={creature.stage} cosmetic="" />
                <span>{type}</span>
              </button>
            ))}
          </div>
        </div>
        <label>
          Name
          <input
            value={creatureName}
            onChange={(event) => setCreatureName(event.target.value)}
            placeholder="Creature name"
            maxLength={80}
            required
          />
        </label>
        <button type="submit">Save companion</button>
      </form>

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
              aria-pressed={creature.selected_cosmetic === item.key}
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
  questionMode,
  initialLimit,
  creature,
  onCreatureUpdate,
  onBackHome,
  onRestart,
  onShowDashboard
}: {
  user: User;
  tables: number[];
  questionMode: QuestionMode;
  initialLimit: number;
  creature: Creature | null;
  onCreatureUpdate: (creature: Creature) => void;
  onBackHome: () => void;
  onRestart: () => void;
  onShowDashboard: () => void;
}) {
  const [question, setQuestion] = useState<Question | null>(null);
  const [sessionId, setSessionId] = useState("");
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
  const [isChecking, setIsChecking] = useState(false);
  const [started, setStarted] = useState(false);
  const startedAtRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);

  const loadQuestion = useCallback(async (activeSessionId = sessionId) => {
    if (!activeSessionId) return;
    const next = await api<Question>("/practice/question", {
      method: "POST",
      body: JSON.stringify({ session_id: activeSessionId })
    });
    setQuestion(next);
    setAnswerValue(inputRef, "");
    setAttemptNumber(1);
    setFeedback("");
    setIsChecking(false);
    startedAtRef.current = performance.now();
    submittingRef.current = false;
    focusAnswer(inputRef);
  }, [sessionId]);

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
    setIsChecking(false);
    setQuestion(null);
    setSessionId("");
    setStarted(false);
  }, [questionLimit, tables, questionMode, user.id]);

  async function startSession() {
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
    setIsChecking(false);
    try {
      const startedSession = await api<{ session_id: string }>("/practice/start", {
        method: "POST",
        body: JSON.stringify({ user_id: user.id, tables, question_mode: questionMode, question_count: questionLimit })
      });
      setSessionId(startedSession.session_id);
      setStarted(true);
      await loadQuestion(startedSession.session_id);
    } catch {
      setStarted(false);
      setFeedback("Could not start practice.");
    }
  }

  async function finishQuestion(delayMs: number, wasCorrect: boolean, event: LearningEvent | null, sessionComplete: boolean, updatedCreature: Creature | null) {
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
    if (sessionComplete) {
      if (updatedCreature) onCreatureUpdate(updatedCreature);
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
        evolutionFrom: updatedCreature?.evolution_from || null,
        evolutionTo: updatedCreature?.evolution_to || null,
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
    setIsChecking(false);
    setAnswerValue(inputRef, "");
    setAttemptNumber(1);
    setStarted(false);
    setSessionId("");
    startSession();
  }

  async function submitAnswer() {
    const submittedAnswer = readAnswer(inputRef);
    if (!question || submittedAnswer === "" || submittingRef.current) return;
    submittingRef.current = true;
    setIsChecking(true);
    const elapsed = Math.round(performance.now() - startedAtRef.current);
    try {
      const result = await api<{
        correct: boolean;
        correct_answer: number;
        attempt_number: number;
        session_complete: boolean;
        creature: Creature | null;
        learning_event: LearningEvent;
      }>("/practice/answer", {
        method: "POST",
        body: JSON.stringify({
          session_id: sessionId,
          question_id: question.question_id,
          answer: submittedAnswer,
          response_time_ms: elapsed
        })
      });
      if (result.correct) {
        setFeedback(attemptNumber === 1 ? "Correct." : "Got it on the second try.");
        finishQuestion(280, true, result.learning_event, result.session_complete, result.creature).catch(() => setFeedback("Practice was recorded, but the next question could not load."));
        return;
      }
      if (result.attempt_number === 1) {
        setAttemptNumber(2);
        setAnswerValue(inputRef, "");
        setFeedback("Try once more.");
        setIsChecking(false);
        startedAtRef.current = performance.now();
        submittingRef.current = false;
        focusAnswer(inputRef);
        return;
      }
      setFeedback(`Answer: ${result.correct_answer}`);
      finishQuestion(850, false, result.learning_event, result.session_complete, result.creature).catch(() => setFeedback("Practice was recorded, but the next question could not load."));
    } catch {
      setFeedback("Could not check that answer.");
      setIsChecking(false);
      submittingRef.current = false;
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    submitAnswer();
  }

  function pressNumberPad(key: string) {
    if (sessionDone) return;
    pressAnswerKey(inputRef, key, submitAnswer, isChecking);
  }

  function backHome() {
    if (started && !sessionDone && !window.confirm("Leave this practice session and go home? Current session progress will not be completed.")) return;
    onBackHome();
  }

  if (!started && !sessionDone) {
    return (
      <section className="practiceSetup panel">
        <button type="button" className="focusBackButton" onClick={onBackHome} aria-label="Back to home">
          Home
        </button>
        <p className="eyebrow">Practice setup</p>
        <h2>Choose your training run</h2>
        <div className="setupGrid">
          <div>
            <span className="fieldLabel">Questions</span>
            <div className="segmented" aria-label="Practice length">
              {[5, 10, 15, 20].map((limit) => (
                <button key={limit} className={questionLimit === limit ? "active" : ""} onClick={() => setQuestionLimit(limit)} type="button">
                  {limit}
                </button>
              ))}
            </div>
          </div>
          <Metric label="Tables" value={tables.join(", ")} />
          <Metric label="Type" value={questionMode === "multiply" ? "Multiplication" : questionMode === "division" ? "Division" : "Mixed"} />
        </div>
        <button type="button" className="startTestButton" onClick={startSession}>Start practice</button>
      </section>
    );
  }

  return (
    <section className="practiceSurface practiceSession">
      <button type="button" className="focusBackButton" onClick={backHome} aria-label="Back to home">
        Home
      </button>
      <div className="progressLine">
        {completedCount + 1 <= questionLimit ? completedCount + 1 : questionLimit} of {questionLimit}
      </div>

      {sessionDone ? (
        <div className="sessionComplete">
          <h2>Practice complete</h2>
          {summary?.evolutionFrom && summary.evolutionTo && (
            <EvolutionPrompt creatureName={summary.creatureName} toStage={summary.evolutionTo} />
          )}
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
            <button type="button" onClick={summary?.evolutionFrom && summary.evolutionTo ? onRestart : restartSession}>
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
              autoComplete="off"
              maxLength={4}
              aria-label="Answer"
              aria-busy={isChecking}
              readOnly={isChecking}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submitAnswer();
                }
              }}
            />
          </form>
          <NumberPad onPress={pressNumberPad} disabled={isChecking} />
          <div className={`feedback ${feedback.startsWith("Answer") ? "wrong" : ""}`}>{isChecking && !feedback ? "Checking..." : feedback}</div>
        </>
      )}
    </section>
  );
}

function QuestMode({
  questStart,
  creature,
  onCreatureUpdate,
  onShowDashboard,
  onBackHome
}: {
  questStart: QuestStart;
  creature: Creature | null;
  onCreatureUpdate: (creature: Creature) => void;
  onShowDashboard: () => void;
  onBackHome: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [attemptNumber, setAttemptNumber] = useState(1);
  const [feedback, setFeedback] = useState("");
  const [correctCount, setCorrectCount] = useState(0);
  const [firstAttemptCorrectCount, setFirstAttemptCorrectCount] = useState(0);
  const [secondTryCorrectCount, setSecondTryCorrectCount] = useState(0);
  const [result, setResult] = useState<QuestCompleteResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const startedAtRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);

  const current = questStart.questions[index];

  useEffect(() => {
    setIndex(0);
    setAnswerValue(inputRef, "");
    setAttemptNumber(1);
    setFeedback("");
    setResult(null);
    setIsChecking(false);
    startedAtRef.current = performance.now();
    submittingRef.current = false;
    focusAnswer(inputRef);
  }, [questStart.quest.quest_id]);

  async function finishQuestQuestion(wasCorrect: boolean, response: { session_complete: boolean; creature: Creature | null; quest_result: QuestCompleteResult | null }) {
    const nextCorrect = correctCount + (wasCorrect ? 1 : 0);
    const nextFirst = firstAttemptCorrectCount + (wasCorrect && attemptNumber === 1 ? 1 : 0);
    const nextSecond = secondTryCorrectCount + (wasCorrect && attemptNumber === 2 ? 1 : 0);
    setCorrectCount(nextCorrect);
    setFirstAttemptCorrectCount(nextFirst);
    setSecondTryCorrectCount(nextSecond);

    if (response.session_complete && response.quest_result && response.creature) {
      onCreatureUpdate(response.creature);
      setResult(response.quest_result);
      return;
    }

    setIndex((currentIndex) => currentIndex + 1);
    setAnswerValue(inputRef, "");
    setAttemptNumber(1);
    setFeedback("");
    setIsChecking(false);
    startedAtRef.current = performance.now();
    submittingRef.current = false;
    focusAnswer(inputRef);
  }

  async function submitAnswer() {
    const submittedAnswer = readAnswer(inputRef);
    if (!current || submittedAnswer === "" || submittingRef.current) return;
    submittingRef.current = true;
    setIsChecking(true);
    const elapsed = Math.round(performance.now() - startedAtRef.current);
    try {
      const response = await api<{
        correct: boolean;
        correct_answer: number;
        attempt_number: number;
        session_complete: boolean;
        creature: Creature | null;
        quest_result: QuestCompleteResult | null;
      }>("/practice/answer", {
        method: "POST",
        body: JSON.stringify({
          session_id: questStart.session_id,
          question_id: current.question_id,
          answer: submittedAnswer,
          response_time_ms: elapsed
        })
      });

      if (response.correct) {
        setFeedback(attemptNumber === 1 ? "Correct." : "Fixed on the second try.");
        setTimeout(() => finishQuestQuestion(true, response), 280);
        return;
      }
      if (response.attempt_number === 1) {
        setAttemptNumber(2);
        setAnswerValue(inputRef, "");
        setFeedback("Try once more.");
        setIsChecking(false);
        startedAtRef.current = performance.now();
        submittingRef.current = false;
        focusAnswer(inputRef);
        return;
      }
      setFeedback(`Answer: ${response.correct_answer}`);
      setTimeout(() => finishQuestQuestion(false, response), 650);
    } catch {
      setFeedback("Could not check that answer.");
      setIsChecking(false);
      submittingRef.current = false;
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    submitAnswer();
  }

  function backHome() {
    if (!result && !window.confirm("Leave this training quest and go home? Quest progress will not be completed.")) return;
    onBackHome();
  }

  if (result) {
    return (
      <section className="practiceSurface">
        <div className="sessionComplete">
          <h2>{creature?.creature_name || "Your companion"} completed a training quest.</h2>
          {result.creature.evolution_from && result.creature.evolution_to && (
            <EvolutionPrompt creatureName={result.creature.creature_name} toStage={result.creature.evolution_to} />
          )}
          <p>You practised {result.facts_practised.length} focused facts.</p>
          <p>
            You got {firstAttemptCorrectCount} right first time and fixed {secondTryCorrectCount} on your second try.
          </p>
          <p>{creature?.creature_name || "Your companion"} gained {result.creature.xp_gained} XP.</p>
          {result.creature.stage_message && <p>{result.creature.stage_message}</p>}
          <p className="quiet">{result.learning_message}</p>
          {result.facts_practised.length > 0 && <p className="quiet">Facts practised: {result.facts_practised.join(", ")}</p>}
          <div className="actionRow">
            <button type="button" onClick={onBackHome}>Back home</button>
            <button type="button" className="secondaryButton" onClick={onShowDashboard}>See results</button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="practiceSurface practiceSession">
      <button type="button" className="focusBackButton" onClick={backHome} aria-label="Back to home">
        Home
      </button>
      <div className="practiceControls">
        <strong>{index + 1} / {questStart.questions.length}</strong>
      </div>
      <div className="questionText">{current?.prompt || "Loading..."}</div>
      <form className="answerRow" onSubmit={submit}>
        <input
          ref={inputRef}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          maxLength={4}
          aria-busy={isChecking}
          readOnly={isChecking}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submitAnswer();
            }
          }}
          aria-label="Answer"
        />
      </form>
      <NumberPad onPress={(key) => pressAnswerKey(inputRef, key, submitAnswer, isChecking)} disabled={isChecking} />
      <div className={`feedback ${feedback.startsWith("Answer") ? "wrong" : ""}`}>{isChecking && !feedback ? "Checking..." : feedback}</div>
    </section>
  );
}

function ChallengeMode({
  user,
  tables,
  questionMode,
  initialCount,
  creature,
  onCreatureUpdate,
  onBackHome,
  onRestart,
  onShowDashboard
}: {
  user: User;
  tables: number[];
  questionMode: QuestionMode;
  initialCount: number;
  creature: Creature | null;
  onCreatureUpdate: (creature: Creature) => void;
  onBackHome: () => void;
  onRestart: () => void;
  onShowDashboard: () => void;
}) {
  const [count, setCount] = useState(initialCount);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<{ question_id: number; answer: string; response_time_ms: number }[]>([]);
  const startedAtRef = useRef(0);
  const [result, setResult] = useState<ChallengeResult | null>(null);
  const [feedback, setFeedback] = useState("");
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    setCount(initialCount);
  }, [initialCount]);

  async function start() {
    const safeCount = Math.min(Math.max(Number.isFinite(count) ? count : initialCount, 1), 100);
    setCount(safeCount);
    setFeedback("");
    try {
      const data = await api<{ session_id: string; questions: Question[] }>("/challenge/start", {
        method: "POST",
        body: JSON.stringify({ user_id: user.id, tables, question_count: safeCount, question_mode: questionMode })
      });
      setQuestions(data.questions);
      setSessionId(data.session_id);
      setIndex(0);
      setAnswers([]);
      setAnswerValue(inputRef, "");
      setResult(null);
      setIsSubmittingAnswer(false);
      startedAtRef.current = performance.now();
      submittingRef.current = false;
      focusAnswer(inputRef);
    } catch {
      setFeedback("Could not start the challenge.");
    }
  }

  async function submitAnswer() {
    const current = questions[index];
    const submittedAnswer = readAnswer(inputRef);
    if (!current || submittedAnswer === "" || submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmittingAnswer(true);
    const nextAnswers = [
      ...answers,
      { question_id: current.question_id, answer: submittedAnswer, response_time_ms: Math.round(performance.now() - startedAtRef.current) }
    ];
    setAnswerValue(inputRef, "");
    if (index + 1 < questions.length) {
      setAnswers(nextAnswers);
      setIndex(index + 1);
      startedAtRef.current = performance.now();
      setIsSubmittingAnswer(false);
      submittingRef.current = false;
      focusAnswer(inputRef);
      return;
    }
    try {
      const data = await api<ChallengeResult>("/challenge/submit", {
        method: "POST",
        body: JSON.stringify({ session_id: sessionId, answers: nextAnswers })
      });
      onCreatureUpdate(data.creature);
      setQuestions([]);
      setResult(data);
    } catch {
      setAnswerValue(inputRef, submittedAnswer);
      setFeedback("Could not save the challenge. Your answer is still here.");
      setIsSubmittingAnswer(false);
      submittingRef.current = false;
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    submitAnswer();
  }

  function pressNumberPad(key: string) {
    pressAnswerKey(inputRef, key, submitAnswer, isSubmittingAnswer);
  }

  function backHome() {
    if (questions.length > 0 && !result && !window.confirm("Leave this challenge and go home? Current challenge answers will not be submitted.")) return;
    onBackHome();
  }

  const current = questions[index];

  return (
    <section className="panel">
      <button type="button" className="focusBackButton" onClick={backHome} aria-label="Back to home">
        Home
      </button>
      {questions.length === 0 && !result && (
        <div className="challengeSetup">
          <div className="segmented" aria-label="Challenge length">
            {[10, 15, 20].map((limit) => (
              <button key={limit} type="button" className={count === limit ? "active" : ""} onClick={() => setCount(limit)}>
                {limit}
              </button>
            ))}
          </div>
          <label>
            Questions
            <input
              type="number"
              min={1}
              max={100}
              value={Number.isFinite(count) ? count : ""}
              onChange={(event) => {
                const next = Number(event.target.value);
                setCount(Number.isFinite(next) ? next : initialCount);
              }}
            />
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
              autoComplete="off"
              maxLength={4}
              aria-label="Answer"
              aria-busy={isSubmittingAnswer}
              readOnly={isSubmittingAnswer}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submitAnswer();
                }
              }}
            />
          </form>
          <NumberPad onPress={pressNumberPad} disabled={isSubmittingAnswer} />
          <div className={`feedback ${feedback ? "wrong" : ""}`}>{isSubmittingAnswer && !feedback ? "Accepted..." : feedback}</div>
        </div>
      )}
      {feedback && !current && <p className="error">{feedback}</p>}
      {result && (
        <ChallengeResults
          result={result}
          creatureName={result.creature?.creature_name || creature?.creature_name || "Your companion"}
          creatureStatus={result.creature?.status_message || ""}
          energyGained={result.creature?.energy_gained || 0}
          xpGained={result.creature?.xp_gained || 0}
          stageMessage={result.creature?.stage_message || ""}
          evolutionFrom={result.creature?.evolution_from || null}
          evolutionTo={result.creature?.evolution_to || null}
          newUnlocks={result.creature?.new_unlocks || []}
          onRestart={result.creature?.evolution_from && result.creature.evolution_to ? onRestart : start}
          onBackHome={onBackHome}
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
  evolutionFrom,
  evolutionTo,
  newUnlocks,
  onRestart,
  onBackHome,
  onShowDashboard
}: {
  result: ChallengeResult;
  creatureName: string;
  creatureStatus: string;
  energyGained: number;
  xpGained: number;
  stageMessage: string;
  evolutionFrom: string | null;
  evolutionTo: string | null;
  newUnlocks: Cosmetic[];
  onRestart: () => void;
  onBackHome: () => void;
  onShowDashboard: () => void;
}) {
  return (
    <div className="results">
      {evolutionFrom && evolutionTo && (
        <EvolutionPrompt creatureName={creatureName} toStage={evolutionTo} />
      )}
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
      <div className="creatureResult">
        <strong>{result.beat_recent_average ? "You beat your recent average." : "Challenge rhythm recorded."}</strong>
        <p>
          Recent average: {result.recent_average_ms ? formatMs(result.recent_average_ms) : "not enough data yet"} · Personal best average:{" "}
          {result.personal_best_average_ms ? formatMs(result.personal_best_average_ms) : "not enough data yet"}
        </p>
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
        <button type="button" className="secondaryButton" onClick={onBackHome}>Home</button>
        <button type="button" onClick={onRestart}>Run again</button>
        <button type="button" className="secondaryButton" onClick={onShowDashboard}>See dashboard</button>
      </div>
    </div>
  );
}

function DashboardView({ dashboard, tables, profileName }: { dashboard: Dashboard | null; tables: number[]; profileName: string }) {
  const [showFactLabels, setShowFactLabels] = useState(false);
  const [view, setView] = useState<"overview" | "accuracy" | "speed" | "progress">("overview");
  const selectedTables = useMemo(() => [...tables].sort((a, b) => a - b), [tables]);
  const selectedCells = useMemo(
    () => (dashboard?.cells || []).filter((cell) => selectedTables.includes(cell.a)),
    [dashboard, selectedTables]
  );
  const selectedTotals = useMemo(() => {
    const correct = selectedCells.reduce((sum, cell) => sum + cell.correct_count, 0);
    const incorrect = selectedCells.reduce((sum, cell) => sum + cell.incorrect_count, 0);
    const secondAttemptCorrect = selectedCells.reduce((sum, cell) => sum + cell.second_attempt_correct, 0);
    const total = correct + incorrect;
    return { correct, incorrect, secondAttemptCorrect, accuracy: total ? correct / total : null };
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
      <div className="sectionHeader">
        <div>
          <p className="eyebrow">Progress dashboard</p>
          <h2>{profileName}&apos;s progress</h2>
        </div>
      </div>
      <div className="dashboardTabs" aria-label="Dashboard view">
        {([
          ["overview", "Overview"],
          ["accuracy", "Accuracy"],
          ["speed", "Speed"],
          ["progress", "Progress"]
        ] as const).map(([value, label]) => (
          <button type="button" key={value} className={view === value ? "active" : ""} onClick={() => setView(value)}>
            {label}
          </button>
        ))}
      </div>
      <div className="dashboardControls">
        <span className="quiet">Showing selected tables: {selectedTables.join(", ")}</span>
        {(view === "accuracy" || view === "speed") && (
          <label className="toggleRow">
            <input type="checkbox" checked={showFactLabels} onChange={(event) => setShowFactLabels(event.target.checked)} />
            Show facts in heat map boxes
          </label>
        )}
      </div>
      {view === "overview" && <>
      <div className="metricGrid">
        <Metric label="Answers" value={`${selectedTotals.correct + selectedTotals.incorrect}`} />
        <Metric label="Correct" value={`${selectedTotals.correct}`} />
        <Metric label="Incorrect" value={`${selectedTotals.incorrect}`} />
        <Metric label="Accuracy" value={selectedTotals.accuracy === null ? "-" : `${Math.round(selectedTotals.accuracy * 100)}%`} />
      </div>
      <p className="quiet">Accuracy uses first answers. Second-try fixes are tracked separately: {selectedTotals.secondAttemptCorrect}.</p>
      <div className="split">
        <FactList title="Strengths" facts={selectedStrengths} />
        <FactList title="Weaknesses" facts={selectedWeaknesses} />
      </div>
      </>}
      {view === "accuracy" && (
        <HeatMap title="Accuracy" cells={selectedCells} rows={selectedTables} columns={ALL_TABLES} colourKey="accuracy_colour" valueKey="accuracy" showFactLabels={showFactLabels} />
      )}
      {view === "speed" && (
        <HeatMap title="Speed" cells={selectedCells} rows={selectedTables} columns={ALL_TABLES} colourKey="speed_colour" valueKey="average_time_ms" showFactLabels={showFactLabels} speed />
      )}
      {view === "progress" && <ParentStats dashboard={dashboard} />}
    </section>
  );
}

function ParentStats({ dashboard }: { dashboard: Dashboard }) {
  return (
    <section className="panel parentStats">
      <h2>Parent stats</h2>
      <div className="split">
        <div>
          <h3>Facts needing more exposure</h3>
          <FactMiniList facts={dashboard.needing_exposure} />
        </div>
        <div>
          <h3>Facts improving</h3>
          <FactMiniList facts={dashboard.improving} />
        </div>
      </div>
      <h3>Accuracy by table</h3>
      <div className="tableStatsGrid">
        {dashboard.table_stats.map((item) => (
          <div key={item.table} className="tableStat">
            <strong>{item.table}x</strong>
            <span>{item.accuracy === null ? "-" : `${Math.round(item.accuracy * 100)}%`}</span>
            <small>{item.average_time_ms ? formatMs(item.average_time_ms) : "No timing yet"}</small>
          </div>
        ))}
      </div>
      <h3>Recent practice history</h3>
      {dashboard.recent_history.length === 0 ? (
        <p className="quiet">No recent answers yet.</p>
      ) : (
        <ul className="plainList">
          {dashboard.recent_history.map((item, index) => (
            <li key={`${item.prompt}-${index}`}>
              {item.prompt}: {item.is_correct ? "correct" : "reviewed"} · {formatMs(item.response_time_ms)} · {item.mode}
            </li>
          ))}
        </ul>
      )}
      <h3>Progress over time</h3>
      {dashboard.progress_over_time.length === 0 ? (
        <p className="quiet">No progress history yet.</p>
      ) : (
        <div className="progressGrid">
          {dashboard.progress_over_time.slice(-14).map((item) => (
            <div key={item.date} className="progressDay">
              <strong>{item.date.slice(5)}</strong>
              <span>{item.accuracy === null ? "-" : `${Math.round(item.accuracy * 100)}%`}</span>
              <small>{item.attempts} answers · {item.average_time_ms ? formatMs(item.average_time_ms) : "no timing"}</small>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function FactMiniList({ facts }: { facts: DashboardCell[] }) {
  if (facts.length === 0) return <p className="quiet">Not enough data yet.</p>;
  return (
    <ul className="plainList">
      {facts.slice(0, 6).map((fact) => (
        <li key={fact.fact_id}>
          {fact.label}: {fact.accuracy === null ? "new" : `${Math.round(fact.accuracy * 100)}%`} · {fact.average_time_ms ? formatMs(fact.average_time_ms) : "more practice helpful"}
        </li>
      ))}
    </ul>
  );
}

function HeatMap({
  title,
  cells,
  rows,
  columns,
  colourKey,
  valueKey,
  showFactLabels,
  speed = false
}: {
  title: string;
  cells: DashboardCell[];
  rows: number[];
  columns: number[];
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
        <div className="heatMap" style={{ gridTemplateColumns: `54px repeat(${columns.length}, minmax(58px, 1fr)) 54px` }}>
          <div className="heatCorner" />
          {columns.map((table) => (
            <div key={`${title}-col-${table}`} className="heatHeader heatColumnHeader">
              {table}
            </div>
          ))}
          <div className="heatCorner" />
          {rows.map((row) => (
            <div className="heatRow" key={`${title}-row-${row}`} style={{ display: "contents" }}>
              <div className="heatHeader heatRowHeader">{row}</div>
              {columns.map((column) => {
                const cell = cellByPair.get(`${row}-${column}`);
                const value = cell ? cell[valueKey] : null;
                return (
                  <div key={`${title}-${row}-${column}`} className={`heatCell ${cellClass(cell, value as number | null)}`} title={`${row} x ${column}`}>
                    {showFactLabels && <span>{row} x {column}</span>}
                    <small>{value === null ? "No data" : speed ? formatMs(value as number) : `${Math.round((value as number) * 100)}%`}</small>
                  </div>
                );
              })}
              <div className="heatHeader heatRowHeader heatRowHeaderEnd">{row}</div>
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
