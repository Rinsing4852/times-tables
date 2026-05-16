from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

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
