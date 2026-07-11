from __future__ import annotations

import json
from datetime import datetime, timezone

from .adaptive import as_aware_utc
from .config import local_date
from .models import User


CREATURE_TYPES = ["Blob", "Dragon", "Robot", "Forest Sprite", "Rock Golem", "Space Beast"]
WEEKLY_GOAL_DAYS = 4
STARTER_COSMETIC = "starter-star"
COSMETICS = {
    STARTER_COSMETIC: {"name": "Starter Star", "kind": "badge", "unlock": "Ready from the start"},
    "spark-hat": {"name": "Spark Hat", "kind": "hat", "unlock": "First practice session"},
    "training-badge": {"name": "Training Badge", "kind": "badge", "unlock": "5 total sessions"},
    "number-stones": {"name": "Number Stones", "kind": "decoration", "unlock": "10 total sessions"},
    "rhythm-stars": {"name": "Rhythm Stars", "kind": "background", "unlock": "Weekly goal completed"},
    "growth-trail": {"name": "Growth Trail", "kind": "trail", "unlock": "Improved a weak fact"},
    "challenge-crest": {"name": "Challenge Crest", "kind": "badge", "unlock": "Completed a challenge round"},
    "division-stones": {"name": "Division Stones", "kind": "decoration", "unlock": "Practised division facts"},
}


def energy_gain_for_questions(question_count: int) -> int:
    if question_count >= 20:
        return 35
    if question_count >= 10:
        return 20
    if question_count >= 5:
        return 10
    return 0


def xp_for_session(mode: str, question_count: int) -> int:
    if mode == "challenge" and question_count >= 20:
        return 35
    if question_count >= 10:
        return 20
    return 10


def xp_threshold_for_level(level: int) -> int:
    if level <= 1:
        return 0
    fixed = {2: 50, 3: 125, 4: 225, 5: 350}
    if level in fixed:
        return fixed[level]
    threshold = fixed[5]
    for current_level in range(6, level + 1):
        threshold += 150 + ((current_level - 6) * 50)
    return threshold


def level_for_xp(xp: int) -> int:
    level = 1
    while level < 50 and xp >= xp_threshold_for_level(level + 1):
        level += 1
    return level


def stage_for_level(level: int) -> str:
    if level >= 11:
        return "Champion"
    if level >= 7:
        return "Explorer"
    if level >= 4:
        return "Youngling"
    if level >= 2:
        return "Hatchling"
    return "Egg"


def decayed_energy(user: User, now: datetime | None = None) -> int:
    now = as_aware_utc(now or datetime.now(timezone.utc))
    energy = max(20, min(user.energy or 60, 100))
    if not user.last_practised_at:
        return energy

    days_since_practice = int((local_date(now) - local_date(as_aware_utc(user.last_practised_at))).days)
    decay = max(days_since_practice, 0) * 20
    return max(20, energy - decay)


def creature_stage(user: User) -> str:
    return stage_for_level(user.level or level_for_xp(user.xp or 0))


def creature_level(user: User) -> int:
    return user.level or level_for_xp(user.xp or 0)


def creature_status(name: str, energy: int) -> str:
    if energy >= 80:
        return f"{name} is full of energy and ready to train."
    if energy >= 50:
        return f"{name} is doing well. A quick practice will make them stronger."
    return f"{name} is resting. A short practice boost will wake them up."


def current_week_key(now: datetime | None = None) -> str:
    now = as_aware_utc(now or datetime.now(timezone.utc))
    year, week, _ = local_date(now).isocalendar()
    return f"{year}-W{week:02d}"


def parse_json_list(value: str | None) -> list[str]:
    if not value:
        return []
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return []
    return [str(item) for item in parsed if isinstance(item, str)]


def dump_json_list(values: list[str]) -> str:
    return json.dumps(sorted(set(values)))


def weekly_days_for_current_week(user: User, now: datetime | None = None) -> list[str]:
    now = as_aware_utc(now or datetime.now(timezone.utc))
    week_prefix = current_week_key(now)
    return [day for day in parse_json_list(user.weekly_practice_days) if day.startswith(week_prefix)]


def add_weekly_practice_day(user: User, now: datetime) -> tuple[int, bool]:
    week_key = current_week_key(now)
    day_key = f"{week_key}-{local_date(now).isoformat()}"
    days = weekly_days_for_current_week(user, now)
    if day_key not in days:
        days.append(day_key)
    user.weekly_practice_days = dump_json_list(days)
    user.last_weekly_reset_at = now
    completed = len(days) >= WEEKLY_GOAL_DAYS and user.weekly_goal_awarded_week != week_key
    if completed:
        user.weekly_goal_awarded_week = week_key
    return len(days), completed


def cosmetic_list(user: User) -> list[str]:
    unlocked = parse_json_list(user.unlocked_cosmetics)
    if STARTER_COSMETIC not in unlocked:
        unlocked.append(STARTER_COSMETIC)
    return unlocked


def unlock_cosmetics(user: User, keys: list[str]) -> list[str]:
    unlocked = cosmetic_list(user)
    new_unlocks = []
    for key in keys:
        if key in COSMETICS and key not in unlocked:
            unlocked.append(key)
            new_unlocks.append(key)
    user.unlocked_cosmetics = dump_json_list(unlocked)
    if user.selected_cosmetic not in unlocked:
        user.selected_cosmetic = STARTER_COSMETIC
    return new_unlocks


def session_rewards(
    *,
    mode: str,
    questions_completed: int,
    first_attempt_correct: int = 0,
    second_attempt_correct: int = 0,
    practiced_weak_fact: bool = False,
    improved_fact_accuracy: bool = False,
    practiced_division: bool = False,
    weekly_goal_completed: bool = False,
) -> tuple[int, list[str]]:
    xp = xp_for_session(mode, questions_completed)
    xp += first_attempt_correct * 2
    xp += second_attempt_correct * 3
    if practiced_weak_fact:
        xp += 5
    if improved_fact_accuracy:
        xp += 5
    if weekly_goal_completed:
        xp += 25

    reasons = [f"Session complete +{xp_for_session(mode, questions_completed)} XP"]
    if first_attempt_correct:
        reasons.append(f"First-time correct answers +{first_attempt_correct * 2} XP")
    if second_attempt_correct:
        reasons.append(f"Second-try fixes +{second_attempt_correct * 3} XP")
    if practiced_weak_fact:
        reasons.append("Practised a weak fact +5 XP")
    if improved_fact_accuracy:
        reasons.append("Improved a fact +5 XP")
    if weekly_goal_completed:
        reasons.append("Weekly training goal +25 XP")
    return xp, reasons


def sync_level_and_stage(user: User) -> tuple[int, str, int, str]:
    old_level = user.level or level_for_xp(user.xp or 0)
    old_stage = user.stage or stage_for_level(old_level)
    user.level = level_for_xp(user.xp or 0)
    user.stage = stage_for_level(user.level)
    return old_level, old_stage, user.level, user.stage


def creature_payload(
    user: User,
    energy_gained: int = 0,
    xp_gained: int = 0,
    reward_reasons: list[str] | None = None,
    new_unlocks: list[str] | None = None,
    stage_message: str = "",
    evolution_from: str | None = None,
    evolution_to: str | None = None,
) -> dict:
    current_energy = decayed_energy(user)
    name = user.creature_name or "Buddy"
    level = creature_level(user)
    current_stage = creature_stage(user)
    current_xp = user.xp or 0
    current_level_threshold = xp_threshold_for_level(level)
    next_level_threshold = xp_threshold_for_level(level + 1)
    next_stage_level = next((candidate for candidate in range(level + 1, 51) if stage_for_level(candidate) != current_stage), None)
    next_stage_xp = xp_threshold_for_level(next_stage_level) if next_stage_level else None
    weekly_days = weekly_days_for_current_week(user)
    unlocked_keys = cosmetic_list(user)
    return {
        "user_id": user.id,
        "creature_type": user.creature_type or "Blob",
        "creature_name": name,
        "energy": current_energy,
        "stage": current_stage,
        "level": level,
        "xp": current_xp,
        "xp_gained": xp_gained,
        "xp_current_level": current_level_threshold,
        "xp_next_level": next_level_threshold,
        "xp_to_next_level": max(next_level_threshold - current_xp, 0),
        "next_stage": stage_for_level(next_stage_level) if next_stage_level else None,
        "next_stage_level": next_stage_level,
        "xp_to_next_stage": max((next_stage_xp or current_xp) - current_xp, 0) if next_stage_xp is not None else 0,
        "xp_progress": 1
        if next_level_threshold == current_level_threshold
        else min(max((current_xp - current_level_threshold) / (next_level_threshold - current_level_threshold), 0), 1),
        "status_message": creature_status(name, current_energy),
        "energy_gained": energy_gained,
        "stage_message": stage_message,
        "evolution_from": evolution_from,
        "evolution_to": evolution_to,
        "reward_reasons": reward_reasons or [],
        "last_practised_at": user.last_practised_at.isoformat() if user.last_practised_at else None,
        "total_questions_answered": user.total_questions_answered or 0,
        "total_sessions_completed": user.total_sessions_completed or 0,
        "weekly_goal_days": WEEKLY_GOAL_DAYS,
        "weekly_practice_days_completed": len(weekly_days),
        "weekly_goal_completed": len(weekly_days) >= WEEKLY_GOAL_DAYS,
        "unlocked_cosmetics": [
            {"key": key, **COSMETICS[key]} for key in unlocked_keys if key in COSMETICS
        ],
        "selected_cosmetic": user.selected_cosmetic if user.selected_cosmetic in unlocked_keys else STARTER_COSMETIC,
        "new_unlocks": [
            {"key": key, **COSMETICS[key]} for key in (new_unlocks or []) if key in COSMETICS
        ],
    }
