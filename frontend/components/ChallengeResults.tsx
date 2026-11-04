"use client";

import type { ChallengeResult, Cosmetic } from "../lib/types";
import { EvolutionPrompt } from "./CreatureExperience";
import { Metric } from "./Metric";

function formatMs(ms: number) {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function ChallengeResults({
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
  onShowDashboard,
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
      {evolutionFrom && evolutionTo && <EvolutionPrompt creatureName={creatureName} toStage={evolutionTo} />}
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
      <p className="nextLearningStep"><strong>Next focus:</strong> {result.next_recommendation.message}</p>
      <div className="split">
        <div><h3>Fastest</h3><p>{result.fastest.prompt} · {formatMs(result.fastest.response_time_ms)}</p></div>
        <div><h3>Slowest</h3><p>{result.slowest.prompt} · {formatMs(result.slowest.response_time_ms)}</p></div>
      </div>
      <h3>Incorrect answers</h3>
      {result.incorrect_answers.length === 0 ? (
        <p className="quiet">None this time.</p>
      ) : (
        <ul className="plainList">
          {result.incorrect_answers.map((item, index) => (
            <li key={`${item.prompt}-${index}`}>{item.prompt} You said {item.answer_given}; answer {item.correct_answer}.</li>
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
