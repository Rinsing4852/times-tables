from __future__ import annotations

from datetime import datetime, timezone

from .adaptive import as_aware_utc
from .models import User


CREATURE_TYPES = ["Blob", "Dragon", "Robot", "Forest Sprite", "Rock Golem", "Space Beast"]


def energy_gain_for_questions(question_count: int) -> int:
    if question_count >= 20:
        return 35
    if question_count >= 10:
        return 20
    if question_count >= 5:
        return 10
    return 0


def decayed_energy(user: User, now: datetime | None = None) -> int:
    now = as_aware_utc(now or datetime.now(timezone.utc))
    energy = max(20, min(user.energy or 60, 100))
    if not user.last_practised_at:
        return energy

    days_since_practice = int((now.date() - as_aware_utc(user.last_practised_at).date()).days)
    if days_since_practice <= 0:
        decay = 0
    elif days_since_practice == 1:
        decay = 5
    elif days_since_practice == 2:
        decay = 10
    else:
        decay = 20
    return max(20, energy - decay)


def creature_stage(user: User) -> str:
    answered = user.total_questions_answered or 0
    if answered >= 500:
        return "Mastery Stage"
    if answered >= 250:
        return "Power Stage"
    if answered >= 100:
        return "Training Stage"
    if answered >= 25:
        return "Spark Stage"
    return "Starter Stage"


def creature_level(user: User) -> int:
    return min(20, 1 + ((user.total_questions_answered or 0) // 50))


def creature_status(name: str, energy: int) -> str:
    if energy >= 80:
        return f"{name} is full of energy and ready to train."
    if energy >= 50:
        return f"{name} is doing well. A quick practice will make them stronger."
    return f"{name} is resting. A short practice boost will wake them up."


def creature_payload(user: User, energy_gained: int = 0) -> dict:
    current_energy = decayed_energy(user)
    name = user.creature_name or "Buddy"
    return {
        "user_id": user.id,
        "creature_type": user.creature_type or "Blob",
        "creature_name": name,
        "energy": current_energy,
        "stage": creature_stage(user),
        "level": creature_level(user),
        "status_message": creature_status(name, current_energy),
        "energy_gained": energy_gained,
        "last_practised_at": user.last_practised_at.isoformat() if user.last_practised_at else None,
        "total_questions_answered": user.total_questions_answered or 0,
        "total_sessions_completed": user.total_sessions_completed or 0,
    }
