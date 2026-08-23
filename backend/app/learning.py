from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from .adaptive import rolling_accuracy_improvement
from .creatures import (
    add_weekly_practice_day,
    creature_payload,
    decayed_energy,
    energy_gain_for_questions,
    session_rewards,
    sync_level_and_stage,
    unlock_cosmetics,
)
from .models import FactStat, LearningSession, QuestionAttempt, TrainingQuest, User
from .scheduler import advance_fact_learning


def recent_attempts_by_fact(db: Session, user_id: int, limit: int = 1500) -> dict[int, list[QuestionAttempt]]:
    attempts = db.scalars(
        select(QuestionAttempt).where(QuestionAttempt.user_id == user_id).order_by(desc(QuestionAttempt.created_at)).limit(limit)
    ).all()
    grouped: dict[int, list[QuestionAttempt]] = defaultdict(list)
    for attempt in attempts:
        if len(grouped[attempt.fact_id]) < 10:
            grouped[attempt.fact_id].append(attempt)
    return grouped


def get_or_create_stat(db: Session, user_id: int, fact_id: int) -> FactStat:
    stat = db.scalar(select(FactStat).where(FactStat.user_id == user_id, FactStat.fact_id == fact_id))
    if stat:
        return stat
    stat = FactStat(user_id=user_id, fact_id=fact_id)
    db.add(stat)
    db.flush()
    return stat


def record_stat(
    stat: FactStat,
    is_correct: bool,
    attempt_number: int,
    response_time_ms: int,
    recent_attempts: list[QuestionAttempt] | None = None,
    now: datetime | None = None,
) -> None:
    now = now or datetime.now(timezone.utc)
    advance_fact_learning(stat, is_correct, attempt_number, recent_attempts, now)
    if is_correct:
        stat.correct_count += 1
    else:
        stat.incorrect_count += 1
        stat.last_failed_at = now

    if attempt_number == 1:
        stat.first_attempt_total += 1
        stat.first_attempt_response_time_ms += response_time_ms
        stat.first_attempt_response_count += 1
        if is_correct:
            stat.first_attempt_correct += 1
            stat.current_streak += 1
        else:
            stat.current_streak = 0
    elif attempt_number == 2:
        stat.second_attempt_total += 1
        if is_correct:
            stat.second_attempt_correct += 1

    stat.total_response_time_ms += response_time_ms
    stat.response_count += 1
    stat.last_seen = now


def learning_event_for_stat(
    stat: FactStat,
    is_correct: bool,
    question_type: str,
    attempt_number: int,
    recent_attempts: list[QuestionAttempt] | None = None,
) -> dict:
    previous_error_rate = 1 - (stat.first_attempt_correct / stat.first_attempt_total) if stat.first_attempt_total else 0
    projected = list(recent_attempts or [])
    projected.insert(0, QuestionAttempt(is_correct=is_correct, attempt_number=attempt_number, response_time_ms=0))
    improvement = rolling_accuracy_improvement(projected)
    return {
        "practiced_weak_fact": attempt_number == 1 and stat.first_attempt_total >= 3 and previous_error_rate >= 0.35,
        "improved_fact_accuracy": bool(attempt_number == 1 and improvement is not None and improvement >= 0.2),
        "practiced_division": question_type.startswith("divide_"),
    }


def award_learning_session(db: Session, learning_session: LearningSession, user: User) -> dict:
    if learning_session.reward_applied:
        return creature_payload(user)
    now = datetime.now(timezone.utc)
    previous_level, previous_stage, _, _ = sync_level_and_stage(user)
    energy_gained = energy_gain_for_questions(learning_session.completed_questions)
    current_energy = decayed_energy(user, now)
    full_energy_bonus_xp = 5 if current_energy >= 100 else 0
    weekly_days_completed, weekly_goal_completed = add_weekly_practice_day(user, now)
    xp_gained, reward_reasons = session_rewards(
        mode="challenge" if learning_session.mode == "challenge" else "practice",
        questions_completed=learning_session.completed_questions,
        first_attempt_correct=learning_session.first_attempt_correct,
        second_attempt_correct=learning_session.second_attempt_correct,
        practiced_weak_fact=learning_session.practiced_weak_fact,
        improved_fact_accuracy=learning_session.improved_fact_accuracy,
        practiced_division=learning_session.practiced_division,
        weekly_goal_completed=weekly_goal_completed,
    )
    quest = db.get(TrainingQuest, learning_session.quest_id) if learning_session.quest_id else None
    mega_evolution_unlocked = False
    if quest and quest.status != "completed":
        quest.status = "completed"
        quest.completed_at = now
        xp_gained += quest.reward_xp
        reward_reasons.append(f"{quest.title} +{quest.reward_xp} XP")
        if (
            quest.quest_type == "discovery"
            and learning_session.expected_questions > 0
            and learning_session.first_attempt_correct / learning_session.expected_questions >= 0.5
        ):
            user.mega_evolution_until = now + timedelta(hours=24)
            mega_evolution_unlocked = True
            reward_reasons.append("Mega Form unlocked for 24 hours")
    if full_energy_bonus_xp:
        xp_gained += full_energy_bonus_xp
        reward_reasons.append(f"Full-energy training bonus +{full_energy_bonus_xp} XP")
    user.energy = min(100, current_energy + energy_gained)
    user.xp = (user.xp or 0) + xp_gained
    user.last_practised_at = now
    user.total_questions_answered = (user.total_questions_answered or 0) + learning_session.completed_questions
    user.total_sessions_completed = (user.total_sessions_completed or 0) + 1
    _, _, new_level, new_stage = sync_level_and_stage(user)
    cosmetic_keys = []
    if user.total_sessions_completed >= 1:
        cosmetic_keys.append("spark-hat")
    if user.total_sessions_completed >= 5:
        cosmetic_keys.append("training-badge")
    if user.total_sessions_completed >= 10:
        cosmetic_keys.append("number-stones")
    if weekly_goal_completed or weekly_days_completed >= 4:
        cosmetic_keys.append("rhythm-stars")
    if learning_session.improved_fact_accuracy or learning_session.practiced_weak_fact:
        cosmetic_keys.append("growth-trail")
    if learning_session.mode == "challenge":
        cosmetic_keys.append("challenge-crest")
    if learning_session.practiced_division:
        cosmetic_keys.append("division-stones")
    new_unlocks = unlock_cosmetics(user, cosmetic_keys)
    stage_message = ""
    if new_stage != previous_stage:
        stage_message = f"{user.creature_name} has reached the {new_stage} stage."
    elif new_level > previous_level:
        stage_message = f"{user.creature_name} grew stronger."
    learning_session.status = "completed"
    learning_session.completed_at = now
    learning_session.reward_applied = True
    return creature_payload(
        user,
        energy_gained=energy_gained,
        xp_gained=xp_gained,
        reward_reasons=reward_reasons,
        new_unlocks=new_unlocks,
        stage_message=stage_message,
        evolution_from=previous_stage if new_stage != previous_stage else None,
        evolution_to=new_stage if new_stage != previous_stage else None,
        mega_evolution_unlocked=mega_evolution_unlocked,
    )
