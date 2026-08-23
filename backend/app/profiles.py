from __future__ import annotations

import json

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import (
    ChallengeAttempt,
    ChallengeSession,
    FactStat,
    LearningSession,
    QuestionAttempt,
    TrainingQuest,
    User,
)


def clean_tables(tables: list[int]) -> list[int]:
    return sorted({table for table in tables if 2 <= table <= 12})


def parse_required_tables(user: User) -> list[int]:
    try:
        parsed = json.loads(user.required_tables or "[]")
    except (TypeError, json.JSONDecodeError):
        return []
    if not isinstance(parsed, list):
        return []
    return clean_tables([item for item in parsed if isinstance(item, int) and not isinstance(item, bool)])


def effective_tables(user: User, requested_tables: list[int]) -> list[int]:
    tables = clean_tables(requested_tables + parse_required_tables(user))
    if not tables:
        raise HTTPException(status_code=400, detail="Select at least one table from 2 to 12")
    return tables


def user_payload(user: User) -> dict:
    return {
        "id": user.id,
        "name": user.name,
        "creature_type": user.creature_type,
        "creature_name": user.creature_name,
        "is_admin": bool(user.is_admin),
        "password_set": bool(user.password_hash),
        "required_tables": parse_required_tables(user),
    }


def reset_user_progress(db: Session, user: User) -> None:
    db.query(LearningSession).filter(LearningSession.user_id == user.id).delete(synchronize_session=False)
    challenge_ids = db.scalars(select(ChallengeSession.id).where(ChallengeSession.user_id == user.id)).all()
    if challenge_ids:
        db.query(ChallengeAttempt).filter(ChallengeAttempt.session_id.in_(challenge_ids)).delete(synchronize_session=False)
    db.query(ChallengeSession).filter(ChallengeSession.user_id == user.id).delete(synchronize_session=False)
    db.query(QuestionAttempt).filter(QuestionAttempt.user_id == user.id).delete(synchronize_session=False)
    db.query(FactStat).filter(FactStat.user_id == user.id).delete(synchronize_session=False)
    db.query(TrainingQuest).filter(TrainingQuest.user_id == user.id).delete(synchronize_session=False)
    user.energy = 60
    user.last_practised_at = None
    user.total_questions_answered = 0
    user.total_sessions_completed = 0
    user.xp = 0
    user.level = 1
    user.stage = "Egg"
    user.unlocked_cosmetics = '["starter-star"]'
    user.selected_cosmetic = "starter-star"
    user.weekly_practice_days = "[]"
    user.last_weekly_reset_at = None
    user.weekly_goal_awarded_week = ""
    user.mega_evolution_until = None
