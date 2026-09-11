"use client";

import { FormEvent, RefObject, useCallback, useEffect, useRef, useState } from "react";
import { AdminPanel } from "../components/AdminPanel";
import { CreatureAvatar, CreatureHome, CreatureProfile, EvolutionPage, EvolutionPrompt } from "../components/CreatureExperience";
import { DashboardView, type DashboardSection } from "../components/DashboardView";
import { Metric } from "../components/Metric";
import { NumberPad } from "../components/NumberPad";
import { ProfileLogin } from "../components/ProfileLogin";
import { RetentionTest } from "../components/RetentionTest";
import { TableSelector } from "../components/TableSelector";
import { api } from "../lib/api";
import type {
  ChallengeResult,
  Cosmetic,
  Creature,
  Dashboard,
  EvolutionEvent,
  LearningEvent,
  Mode,
  PracticeSummary,
  Question,
  QuestionMode,
  QuestCompleteResult,
  QuestStart,
  RetentionAssessment,
  TrainingQuest,
  User,
} from "../lib/types";

const DEFAULT_TABLES = [2, 3, 4, 5];
const ALL_TABLES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

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
  const [homeDashboard, setHomeDashboard] = useState<Dashboard | null>(null);
  const [dashboardUserId, setDashboardUserId] = useState<number | null>(null);
  const [dashboardSection, setDashboardSection] = useState<DashboardSection>("overview");
  const [practicePreset, setPracticePreset] = useState(10);
  const [challengePreset, setChallengePreset] = useState(20);
  const [quests, setQuests] = useState<TrainingQuest[]>([]);
  const [activeQuest, setActiveQuest] = useState<QuestStart | null>(null);
  const [appVersion, setAppVersion] = useState("");
  const [adminUsers, setAdminUsers] = useState<User[]>([]);
  const [pendingEvolution, setPendingEvolution] = useState<EvolutionEvent | null>(null);
  const [activeRetention, setActiveRetention] = useState<RetentionAssessment | null>(null);
  const [postEvolutionTab, setPostEvolutionTab] = useState<Mode>("home");
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  const focusMode = tab === "practice" || tab === "quest" || tab === "challenge" || tab === "retention" || tab === "evolution";

  useEffect(() => {
    if (!settingsOpen) return;

    function closeOnOutsidePress(event: PointerEvent) {
      if (!settingsMenuRef.current?.contains(event.target as Node)) setSettingsOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setSettingsOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [settingsOpen]);

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
      setHomeDashboard(null);
      setActiveRetention(null);
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
      setSettingsOpen(false);
      setTab("home");
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "That passcode was not accepted.");
    }
  }

  async function logout() {
    await api<{ logged_out: boolean }>("/auth/logout", { method: "POST" });
    setSettingsOpen(false);
    setActiveUser(null);
    setCreature(null);
    setQuests([]);
    setDashboard(null);
    setHomeDashboard(null);
    setDashboardUserId(null);
    setAdminUsers([]);
    setActiveRetention(null);
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

  useEffect(() => {
    if (!activeUser || tab !== "home") return;
    let cancelled = false;
    api<Dashboard>(`/dashboard/${activeUser.id}`)
      .then((data) => { if (!cancelled) setHomeDashboard(data); })
      .catch((error) => { if (!cancelled) setStatus(error.message); });
    return () => { cancelled = true; };
  }, [activeUser, tab]);

  const loadAdminUsers = useCallback(async () => {
    if (!activeUser?.is_admin) return;
    const data = await api<User[]>(`/admin/${activeUser.id}/users`);
    setAdminUsers(data);
  }, [activeUser]);

  useEffect(() => {
    if (!activeUser) return;
    const required = activeUser.required_tables || [];
    setTables((current) => Array.from(new Set([...current, ...required])).sort((a, b) => a - b));
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
      setHomeDashboard(null);
      setAdminUsers([]);
      return;
    }
    setActiveUser(currentUser);
    const updatedCreature = await api<Creature>(`/users/${currentUser.id}/creature`);
    setCreature(updatedCreature);
    const updatedHomeDashboard = await api<Dashboard>(`/dashboard/${currentUser.id}`);
    setHomeDashboard(updatedHomeDashboard);
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

  function startRetentionCheck(assessment: RetentionAssessment) {
    setActiveRetention(assessment);
    navigate("retention");
  }

  function openMemoryTests() {
    if (!activeUser) return;
    setDashboardUserId(activeUser.id);
    setDashboardSection("retention");
    navigate("dashboard");
  }

  async function scheduleRetentionCheck(questionCount: number, mode: QuestionMode, testTables: number[]) {
    if (!activeUser?.is_admin || !dashboardUserId) return;
    await api<RetentionAssessment>("/retention-assessments", {
      method: "POST",
      body: JSON.stringify({ user_id: dashboardUserId, tables: testTables, question_count: questionCount, question_mode: mode }),
    });
    const updated = await api<Dashboard>(`/dashboard/${dashboardUserId}`);
    setDashboard(updated);
    if (dashboardUserId === activeUser.id) setHomeDashboard(updated);
  }

  async function retentionCompleted(assessment: RetentionAssessment) {
    setActiveRetention(assessment);
    if (!activeUser) return;
    const updatedHome = await api<Dashboard>(`/dashboard/${activeUser.id}`);
    setHomeDashboard(updatedHome);
    if (dashboardUserId === activeUser.id) setDashboard(updatedHome);
  }

  async function startQuest(quest: TrainingQuest) {
    if (!activeUser) return;
    const data = await api<QuestStart>(`/users/${activeUser.id}/quests/${quest.quest_id}/start`, { method: "POST" });
    setActiveQuest(data);
    navigate("quest");
  }

  return (
    <>
    <a className="skipLink" href="#main-content">Skip to main content</a>
    <main id="main-content" tabIndex={-1} className={`shell ${focusMode ? "focusShell" : ""} ${tab === "dashboard" ? "dashboardShell" : ""}`}>
      {!focusMode && <header className="topbar">
        <div>
          <p className="eyebrow">Local practice engine</p>
          <h1>Recall Forge</h1>
        </div>
        {activeUser && <div className={`settingsMenu ${settingsOpen ? "open" : ""}`} ref={settingsMenuRef}>
          <button
            type="button"
            className="settingsToggle"
            aria-label="Settings"
            aria-expanded={settingsOpen}
            aria-controls="settings-panel"
            onClick={() => setSettingsOpen((open) => !open)}
          >
            Settings
          </button>
          {settingsOpen && <div className="settingsPanel" id="settings-panel" role="dialog" aria-label="Settings menu">
          <div className="settingsPanelHeader">
            <strong>Settings</strong>
            <button type="button" className="secondaryButton" onClick={() => setSettingsOpen(false)}>Close</button>
          </div>
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
                setDashboardSection("overview");
                navigate("dashboard");
              }}>
                Dashboard
              </button>
              <button type="button" onClick={() => {
                setDashboardUserId(activeUser.id);
                setDashboardSection("retention");
                navigate("dashboard");
              }}>
                Memory tests
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
                setDashboardSection("overview");
                navigate("dashboard");
              }}
            />
          )}
          </div>}
        </div>}
      </header>}

      <section className="workspace">
        {!focusMode && tab === "home" && <nav className="tabs" aria-label="Modes">
          {(["home", "practice", "challenge"] as const).map((item) => (
            <button key={item} className={tab === item ? "active" : ""} aria-current={tab === item ? "page" : undefined} onClick={() => navigate(item)} type="button">
              {item[0].toUpperCase() + item.slice(1)}
            </button>
          ))}
        </nav>}
        {!focusMode && tab === "home" && <label className="modeSelect">
          Mode
          <select value={tab} onChange={(event) => navigate(event.target.value as Mode)}>
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
            {tab === "home" && <details className="panel collapsiblePanel">
              <summary>Tables: {tables.join(", ")}</summary>
              <TableSelector selected={tables} locked={activeUser.required_tables || []} onChange={setTables} />
              {(activeUser.required_tables || []).length > 0 && (
                <p className="quiet">Required by admin: {activeUser.required_tables.join(", ")}. These tables stay selected.</p>
              )}
            </details>}
            {tab === "home" && <div className="panel compactPanel">
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
                learningDashboard={homeDashboard}
                selectedTables={tables}
                onStartRetention={startRetentionCheck}
                onOpenRetention={openMemoryTests}
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
            {tab === "retention" && activeRetention && (
              <RetentionTest
                assessment={activeRetention}
                onBackHome={() => navigate("home")}
                onComplete={retentionCompleted}
                onShowDashboard={() => {
                  setDashboardUserId(activeUser.id);
                  navigate("dashboard");
                }}
              />
            )}
            {tab === "profile" && (
              <>
                <button type="button" className="utilityBackButton" onClick={() => navigate("home")}>Back home</button>
                <CreatureProfile creature={creature} onSelectCosmetic={selectCosmetic} onUpdateCreature={updateCreature} />
              </>
            )}
            {tab === "dashboard" && (
              <>
                <button type="button" className="utilityBackButton" onClick={() => navigate("home")}>Back home</button>
                <DashboardView
                  dashboard={dashboard}
                  tables={tables}
                  profileName={users.find((user) => user.id === dashboardUserId)?.name || activeUser.name}
                  initialView={dashboardSection}
                  canScheduleRetention={activeUser.is_admin}
                  onScheduleRetention={scheduleRetentionCheck}
                  onStartRetention={startRetentionCheck}
                />
              </>
            )}
            {tab === "evolution" && pendingEvolution && (
              <EvolutionPage event={pendingEvolution} onContinue={continueAfterEvolution} />
            )}
          </>
        )}
        {status && <p className="error" role="alert">{status}</p>}
      </section>
    </main>
    </>
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
          <span aria-hidden="true">←</span>
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
        <span aria-hidden="true">←</span>
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
          <p>You practised {result.facts_practised.length} focused {result.facts_practised.length === 1 ? "fact" : "facts"}.</p>
          <p>
            You got {firstAttemptCorrectCount} right first time and fixed {secondTryCorrectCount} on your second try.
          </p>
          <p>{creature?.creature_name || "Your companion"} gained {result.creature.xp_gained} XP.</p>
          {result.creature.mega_evolution_unlocked && (
            <div className="megaUnlock">
              <CreatureAvatar type={result.creature.creature_type} stage={result.creature.stage} mega />
              <strong>Mega Form unlocked for 24 hours.</strong>
            </div>
          )}
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
        <span aria-hidden="true">←</span>
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
    <section className={`panel ${questions.length === 0 && !result ? "challengeSetupPage" : ""}`}>
      {!result && (
        <button type="button" className="focusBackButton" onClick={backHome} aria-label="Back to home">
          <span aria-hidden="true">←</span>
        </button>
      )}
      {questions.length === 0 && !result && (
        <div className="challengeSetup">
          <div className="challengeSetupHeading">
            <p className="eyebrow">Challenge setup</p>
            <h2>Choose your challenge length</h2>
            <p className="quiet">The timer stays hidden while you answer.</p>
          </div>
          <div className="segmented" aria-label="Challenge length">
            {[10, 15, 20].map((limit) => (
              <button key={limit} type="button" className={count === limit ? "active" : ""} onClick={() => setCount(limit)}>
                {limit}
              </button>
            ))}
          </div>
          <label className="customQuestionCount">
            Custom questions
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
