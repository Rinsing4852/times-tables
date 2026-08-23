export type User = {
  id: number;
  name: string;
  is_admin: boolean;
  password_set: boolean;
  required_tables: number[];
  creature_type?: string;
  creature_name?: string;
};

export type QuestionMode = "mixed" | "multiply" | "division";

export type Cosmetic = { key: string; name: string; kind: string; unlock: string };

export type Creature = {
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
  mega_evolution_active: boolean;
  mega_evolution_until: string | null;
  mega_evolution_unlocked: boolean;
};

export type Question = { question_id: number; fact_id: number; question_type: string; prompt: string; priority_score?: number };
export type LearningEvent = { practiced_weak_fact: boolean; improved_fact_accuracy: boolean; practiced_division: boolean };

export type TrainingQuest = {
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

export type QuestStart = { session_id: string; quest: TrainingQuest; questions: Question[] };
export type QuestCompleteResult = {
  quest: TrainingQuest;
  creature: Creature;
  facts_practised: string[];
  learning_message: string;
};

export type DashboardCell = {
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
  learning_state: "unseen" | "acquiring" | "reviewing" | "secure";
  due_at: string | null;
  interval_days: number;
  successful_reviews: number;
  lapse_count: number;
};

export type Dashboard = {
  totals: { correct: number; incorrect: number; accuracy: number | null; second_attempt_correct: number; second_attempt_total: number };
  cells: DashboardCell[];
  strengths: DashboardCell[];
  weaknesses: DashboardCell[];
  table_stats: { table: number; accuracy: number | null; average_time_ms: number | null; answers: number; secure_facts: number; due_facts: number }[];
  needing_exposure: DashboardCell[];
  improving: DashboardCell[];
  recent_history: { prompt: string; is_correct: boolean; response_time_ms: number; mode: string; created_at: string }[];
  progress_over_time: { date: string; attempts: number; correct: number; accuracy: number | null; average_time_ms: number | null }[];
  retention: {
    state_counts: { unseen: number; acquiring: number; reviewing: number; secure: number };
    due: number;
    overdue: number;
    review_accuracy_7_days: { attempts: number; correct: number; accuracy: number | null };
    review_accuracy_30_days: { attempts: number; correct: number; accuracy: number | null };
    total_lapses: number;
  };
};

export type ResultQuestion = {
  prompt: string;
  answer_given: string;
  correct_answer: number;
  is_correct: boolean;
  response_time_ms: number;
};

export type ChallengeResult = {
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

export type Mode = "home" | "practice" | "quest" | "challenge" | "profile" | "dashboard" | "evolution";
export type EvolutionEvent = { creatureName: string; creatureType: string; fromStage: string; toStage: string };

export type PracticeSummary = {
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
