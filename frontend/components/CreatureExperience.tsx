"use client";

import { FormEvent, useEffect, useState } from "react";
import { CREATURE_STAGES, CREATURE_TYPES, creatureAsset, creatureSlug } from "../lib/creatures";
import type { Creature, Dashboard, EvolutionEvent, RetentionAssessment, TrainingQuest } from "../lib/types";
import { Metric } from "./Metric";

export function CreatureHome({
  creature,
  onStartPractice,
  onStartChallenge,
  quests,
  onStartQuest,
  learningDashboard,
  selectedTables,
  onStartRetention,
}: {
  creature: Creature | null;
  onStartPractice: (limit: number) => void;
  onStartChallenge: (limit: number) => void;
  quests: TrainingQuest[];
  onStartQuest: (quest: TrainingQuest) => void;
  learningDashboard: Dashboard | null;
  selectedTables: number[];
  onStartRetention: (assessment: RetentionAssessment) => void;
}) {
  const [openedAt] = useState(() => Date.now());
  if (!creature) return <section className="panel">Loading companion...</section>;

  const selectedFacts = (learningDashboard?.cells || []).filter((cell) => selectedTables.includes(cell.a));
  const dueFacts = selectedFacts.filter((cell) => cell.due_at && new Date(cell.due_at).getTime() <= openedAt);
  const futureReviews = selectedFacts
    .map((cell) => cell.due_at ? new Date(cell.due_at) : null)
    .filter((date): date is Date => Boolean(date && date.getTime() > openedAt))
    .sort((left, right) => left.getTime() - right.getTime());
  const rememberedFacts = selectedFacts.filter((cell) => cell.learning_state === "secure").length;
  const currentRetention = (learningDashboard?.retention_assessments || []).find((item) => item.status !== "completed");

  function nextReviewLabel(date: Date | undefined) {
    if (!date) return "No reviews are waiting yet. New facts will be scheduled as you practise.";
    const today = new Date(openedAt);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const dateKey = date.toLocaleDateString("en-CA");
    if (dateKey === today.toLocaleDateString("en-CA")) return "Your next memory review is later today.";
    if (dateKey === tomorrow.toLocaleDateString("en-CA")) return "Your next memory review is tomorrow.";
    return `Your next memory review is ${date.toLocaleDateString(undefined, { day: "numeric", month: "short" })}.`;
  }

  return (
    <section className="creatureHome">
      <div className="creatureCard">
        <div className={`creatureAvatarWrap habitat-${creatureSlug(creature.creature_type)}`}>
          <CreatureAvatar type={creature.creature_type} stage={creature.stage} cosmetic={creature.selected_cosmetic} mega={creature.mega_evolution_active} />
        </div>
        <div className="creatureInfo">
          <p className="eyebrow">{creature.creature_type}</p>
          <h2>{creature.creature_name}</h2>
          <p className="stageLine">Level {creature.level} · {creature.stage}</p>
          {creature.mega_evolution_active && <strong className="megaStatus">Mega Form active</strong>}
          <div className="xpBar" aria-label={`XP progress ${Math.round(creature.xp_progress * 100)} percent`}>
            <span style={{ width: `${Math.round(creature.xp_progress * 100)}%` }} />
          </div>
          <strong>{creature.xp} XP · {creature.xp_to_next_level} XP to next level</strong>
          {creature.next_stage && <p className="creatureStatus">Next stage: {creature.next_stage} in {creature.xp_to_next_stage} XP.</p>}
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
        <button type="button" onClick={() => onStartPractice(5)}>Quick Boost<span>5 questions</span></button>
        <button type="button" onClick={() => onStartPractice(10)}>Training Session<span>10 questions</span></button>
        <button type="button" onClick={() => onStartChallenge(20)}>Challenge Round<span>20 questions</span></button>
      </div>

      <section className={`panel memoryReview ${dueFacts.length > 0 ? "reviewReady" : ""}`}>
        <div>
          <p className="eyebrow">Memory review</p>
          <h2>{dueFacts.length > 0 ? `${dueFacts.length} ${dueFacts.length === 1 ? "fact is" : "facts are"} ready` : "Your reviews are planned"}</h2>
          <p>
            {dueFacts.length > 0
              ? "Revisit these facts now to help them stick."
              : nextReviewLabel(futureReviews[0])}
          </p>
          {rememberedFacts > 0 && <span className="quiet">{rememberedFacts} selected-table {rememberedFacts === 1 ? "fact" : "facts"} remembered.</span>}
        </div>
        {dueFacts.length > 0 && <button type="button" onClick={() => onStartPractice(5)}>Review 5 facts</button>}
      </section>

      {currentRetention && (
        <section className={`panel retentionHomeCard ${currentRetention.can_start ? "reviewReady" : ""}`}>
          <div>
            <p className="eyebrow">Long-term recall check</p>
            <h2>{currentRetention.can_start ? `${currentRetention.next_round_label} ready` : `${currentRetention.next_round_label} is planned`}</h2>
            <p>
              {currentRetention.can_start
                ? `Answer the same ${currentRetention.question_count} questions without a countdown clock.`
                : `The next check is on ${new Date(currentRetention.next_due_at || "").toLocaleDateString(undefined, { day: "numeric", month: "long" })}. Keep practising normally until then.`}
            </p>
          </div>
          {currentRetention.can_start && (
            <button type="button" onClick={() => onStartRetention(currentRetention)}>Start recall check</button>
          )}
        </section>
      )}

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
              <button type="button" onClick={() => onStartQuest(quest)}>Start quest</button>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

export function CreatureAvatar({ type, stage, cosmetic = "starter-star", mega = false }: { type: string; stage: string; cosmetic?: string; mega?: boolean }) {
  const displayedStage = mega ? "Mega" : stage;
  const stageAsset = creatureAsset(type, displayedStage);
  return (
    <div className={`creatureAvatar ${type.toLowerCase().replaceAll(" ", "-")} stage-${displayedStage.toLowerCase()} ${cosmetic} ${mega ? "mega" : ""}`} role="img" aria-label={`${type} ${mega ? "temporary Mega Form" : `${stage} stage`}`}>
      <span className="creatureStageAsset" style={{ backgroundImage: `url(${stageAsset})` }} />
    </div>
  );
}

export function EvolutionPrompt({ creatureName, toStage }: { creatureName: string; toStage: string }) {
  return (
    <div className="evolutionPrompt">
      <span>Something is happening...</span>
      <strong>It looks like {creatureName} is trying to evolve.</strong>
      <p>Next stop: {toStage}.</p>
    </div>
  );
}

export function EvolutionPage({ event, onContinue }: { event: EvolutionEvent; onContinue: () => void }) {
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
      {revealed && (
        <div className="evolutionMessage visible">
          <strong>{event.creatureName} reached {event.toStage} stage.</strong>
          <p>Your practice helped {event.creatureName} grow stronger.</p>
        </div>
      )}
      {revealed && <button type="button" className="startTestButton evolutionContinue" onClick={onContinue}>Continue</button>}
    </section>
  );
}

export function CreatureProfile({
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
          <CreatureAvatar type={creature.creature_type} stage={creature.stage} cosmetic={creature.selected_cosmetic} mega={creature.mega_evolution_active} />
        </div>
        <div className="creatureInfo">
          <p className="eyebrow">{creature.creature_type}</p>
          <h2>{creature.creature_name}</h2>
          <p className="stageLine">Level {creature.level} · {creature.stage}</p>
          {creature.mega_evolution_active && <strong className="megaStatus">Temporary Mega Form active</strong>}
          <div className="xpBar" aria-label={`XP progress ${Math.round(creature.xp_progress * 100)} percent`}>
            <span style={{ width: `${Math.round(creature.xp_progress * 100)}%` }} />
          </div>
          <strong>{creature.xp} XP · {creature.xp_to_next_level} XP to Level {creature.level + 1}</strong>
          {creature.next_stage && <p className="creatureStatus">Next evolution: {creature.next_stage} at Level {creature.next_stage_level} · {creature.xp_to_next_stage} XP to go.</p>}
          <p className="creatureStatus">The creature grows stronger as your maths brain grows stronger.</p>
        </div>
      </div>

      <section className="panel evolutionPathSection">
        <div className="sectionHeader">
          <div><p className="eyebrow">Growth path</p><h2>{creature.creature_name}&apos;s evolutions</h2></div>
          <span className="quiet">Current stage: {creature.stage}</span>
        </div>
        <div className="evolutionPath" aria-label={`${creature.creature_name}'s evolution stages`}>
          {CREATURE_STAGES.map((item) => {
            const current = item.name === creature.stage;
            const reached = creature.level >= item.level;
            return (
              <div key={item.name} className={`evolutionStep ${current ? "current" : ""} ${reached ? "reached" : "future"}`}>
                <div className="evolutionThumbnail"><CreatureAvatar type={creature.creature_type} stage={item.name} cosmetic="" /></div>
                <strong>{item.name}</strong><span>Level {item.level}</span>
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
                <CreatureAvatar type={type} stage={creature.stage} cosmetic="" /><span>{type}</span>
              </button>
            ))}
          </div>
        </div>
        <label>Name<input value={creatureName} onChange={(event) => setCreatureName(event.target.value)} placeholder="Creature name" maxLength={80} required /></label>
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
            <button key={item.key} type="button" className={`cosmeticItem ${creature.selected_cosmetic === item.key ? "selected" : ""}`} onClick={() => chooseCosmetic(item.key)} aria-pressed={creature.selected_cosmetic === item.key}>
              <strong>{item.name}</strong><span>{item.kind}</span><small>{item.unlock}</small>
            </button>
          ))}
        </div>
        {message && <p className="feedback">{message}</p>}
      </section>
    </section>
  );
}
