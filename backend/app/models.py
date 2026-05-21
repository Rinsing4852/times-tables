from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    is_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    password_hash: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    password_salt: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    password_updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    creature_type: Mapped[str] = mapped_column(String(32), nullable=False, default="Blob")
    creature_name: Mapped[str] = mapped_column(String(80), nullable=False, default="Buddy")
    energy: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    last_practised_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    total_questions_answered: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_sessions_completed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    xp: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    level: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    stage: Mapped[str] = mapped_column(String(32), nullable=False, default="Egg")
    unlocked_cosmetics: Mapped[str] = mapped_column(String(512), nullable=False, default='["starter-star"]')
    selected_cosmetic: Mapped[str] = mapped_column(String(64), nullable=False, default="starter-star")
    weekly_practice_days: Mapped[str] = mapped_column(String(256), nullable=False, default="[]")
    last_weekly_reset_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    weekly_goal_awarded_week: Mapped[str] = mapped_column(String(16), nullable=False, default="")

    attempts: Mapped[list["QuestionAttempt"]] = relationship(back_populates="user")


class Fact(Base):
    __tablename__ = "facts"
    __table_args__ = (UniqueConstraint("a", "b", name="uq_fact_pair"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    a: Mapped[int] = mapped_column(Integer, nullable=False)
    b: Mapped[int] = mapped_column(Integer, nullable=False)
    product: Mapped[int] = mapped_column(Integer, nullable=False)

    stats: Mapped[list["FactStat"]] = relationship(back_populates="fact")


class QuestionAttempt(Base):
    __tablename__ = "question_attempts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    fact_id: Mapped[int] = mapped_column(ForeignKey("facts.id"), nullable=False, index=True)
    question_type: Mapped[str] = mapped_column(String(32), nullable=False)
    prompt: Mapped[str] = mapped_column(String(80), nullable=False)
    answer_given: Mapped[str] = mapped_column(String(32), nullable=False)
    correct_answer: Mapped[int] = mapped_column(Integer, nullable=False)
    is_correct: Mapped[bool] = mapped_column(Boolean, nullable=False)
    attempt_number: Mapped[int] = mapped_column(Integer, nullable=False)
    response_time_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    mode: Mapped[str] = mapped_column(String(16), nullable=False, default="practice")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped["User"] = relationship(back_populates="attempts")
    fact: Mapped["Fact"] = relationship()


class FactStat(Base):
    __tablename__ = "fact_stats"
    __table_args__ = (UniqueConstraint("user_id", "fact_id", name="uq_user_fact_stat"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    fact_id: Mapped[int] = mapped_column(ForeignKey("facts.id"), nullable=False, index=True)
    correct_count: Mapped[int] = mapped_column(Integer, default=0)
    incorrect_count: Mapped[int] = mapped_column(Integer, default=0)
    first_attempt_correct: Mapped[int] = mapped_column(Integer, default=0)
    first_attempt_total: Mapped[int] = mapped_column(Integer, default=0)
    second_attempt_correct: Mapped[int] = mapped_column(Integer, default=0)
    second_attempt_total: Mapped[int] = mapped_column(Integer, default=0)
    total_response_time_ms: Mapped[int] = mapped_column(Integer, default=0)
    response_count: Mapped[int] = mapped_column(Integer, default=0)
    current_streak: Mapped[int] = mapped_column(Integer, default=0)
    last_seen: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_failed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    fact: Mapped["Fact"] = relationship(back_populates="stats")


class ChallengeSession(Base):
    __tablename__ = "challenge_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    question_count: Mapped[int] = mapped_column(Integer, nullable=False)
    selected_tables: Mapped[str] = mapped_column(String(64), nullable=False)
    total_time_ms: Mapped[int] = mapped_column(Integer, default=0)
    correct_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    attempts: Mapped[list["ChallengeAttempt"]] = relationship(back_populates="session")


class ChallengeAttempt(Base):
    __tablename__ = "challenge_attempts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("challenge_sessions.id"), nullable=False, index=True)
    fact_id: Mapped[int] = mapped_column(ForeignKey("facts.id"), nullable=False, index=True)
    question_type: Mapped[str] = mapped_column(String(32), nullable=False)
    prompt: Mapped[str] = mapped_column(String(80), nullable=False)
    answer_given: Mapped[str] = mapped_column(String(32), nullable=False)
    correct_answer: Mapped[int] = mapped_column(Integer, nullable=False)
    is_correct: Mapped[bool] = mapped_column(Boolean, nullable=False)
    response_time_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    session: Mapped["ChallengeSession"] = relationship(back_populates="attempts")
    fact: Mapped["Fact"] = relationship()


class TrainingQuest(Base):
    __tablename__ = "training_quests"
    __table_args__ = (UniqueConstraint("user_id", "quest_key", name="uq_user_quest_key"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    quest_key: Mapped[str] = mapped_column(String(64), nullable=False)
    quest_type: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[str] = mapped_column(String(200), nullable=False)
    target_fact_ids: Mapped[str] = mapped_column(String(512), nullable=False, default="[]")
    question_count: Mapped[int] = mapped_column(Integer, nullable=False)
    reward_xp: Mapped[int] = mapped_column(Integer, nullable=False)
    reward_note: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="available")
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship()
