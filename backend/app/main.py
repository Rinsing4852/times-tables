from datetime import datetime, timezone
from random import choice

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import desc, inspect, select, text
from sqlalchemy.orm import Session

from .adaptive import (
    QUESTION_TYPES,
    choose_fact,
    heat_colour_accuracy,
    heat_colour_speed,
    normalize_answer,
    priority_score,
    question_for_fact,
)
from .creatures import (
    CREATURE_TYPES,
    add_weekly_practice_day,
    cosmetic_list,
    creature_payload,
    decayed_energy,
    energy_gain_for_questions,
    session_rewards,
    sync_level_and_stage,
    unlock_cosmetics,
)
from .database import Base, SessionLocal, engine, get_db
from .models import ChallengeAttempt, ChallengeSession, Fact, FactStat, QuestionAttempt, User
from .schemas import (
    ChallengeStart,
    ChallengeSubmit,
    CreatureCosmeticUpdate,
    CreatureSessionComplete,
    CreatureUpdate,
    PracticeAnswer,
    TablesRequest,
    UserCreate,
)
from .seed import seed_facts

app = FastAPI(title="Recall Forge API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(bind=engine)
    migrate_user_creature_columns()
    with SessionLocal() as db:
        seed_facts(db)


def migrate_user_creature_columns() -> None:
    inspector = inspect(engine)
    if not inspector.has_table("users"):
        return
    existing = {column["name"] for column in inspector.get_columns("users")}
    migrations = {
        "creature_type": "ALTER TABLE users ADD COLUMN creature_type VARCHAR(32) NOT NULL DEFAULT 'Blob'",
        "creature_name": "ALTER TABLE users ADD COLUMN creature_name VARCHAR(80) NOT NULL DEFAULT 'Buddy'",
        "energy": "ALTER TABLE users ADD COLUMN energy INTEGER NOT NULL DEFAULT 60",
        "last_practised_at": "ALTER TABLE users ADD COLUMN last_practised_at DATETIME",
        "total_questions_answered": "ALTER TABLE users ADD COLUMN total_questions_answered INTEGER NOT NULL DEFAULT 0",
        "total_sessions_completed": "ALTER TABLE users ADD COLUMN total_sessions_completed INTEGER NOT NULL DEFAULT 0",
        "xp": "ALTER TABLE users ADD COLUMN xp INTEGER NOT NULL DEFAULT 0",
        "level": "ALTER TABLE users ADD COLUMN level INTEGER NOT NULL DEFAULT 1",
        "stage": "ALTER TABLE users ADD COLUMN stage VARCHAR(32) NOT NULL DEFAULT 'Egg'",
        "unlocked_cosmetics": "ALTER TABLE users ADD COLUMN unlocked_cosmetics VARCHAR(512) NOT NULL DEFAULT '[\"starter-star\"]'",
        "selected_cosmetic": "ALTER TABLE users ADD COLUMN selected_cosmetic VARCHAR(64) NOT NULL DEFAULT 'starter-star'",
        "weekly_practice_days": "ALTER TABLE users ADD COLUMN weekly_practice_days VARCHAR(256) NOT NULL DEFAULT '[]'",
        "last_weekly_reset_at": "ALTER TABLE users ADD COLUMN last_weekly_reset_at DATETIME",
        "weekly_goal_awarded_week": "ALTER TABLE users ADD COLUMN weekly_goal_awarded_week VARCHAR(16) NOT NULL DEFAULT ''",
    }
    with engine.begin() as connection:
        for column, statement in migrations.items():
            if column not in existing:
                connection.execute(text(statement))


def get_user(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def facts_for_tables(db: Session, tables: list[int]) -> list[Fact]:
    clean_tables = sorted({table for table in tables if 2 <= table <= 12})
    if not clean_tables:
        raise HTTPException(status_code=400, detail="Select at least one table from 2 to 12")
    return list(db.scalars(select(Fact).where(Fact.a.in_(clean_tables))).all())


def get_or_create_stat(db: Session, user_id: int, fact_id: int) -> FactStat:
    stat = db.scalar(select(FactStat).where(FactStat.user_id == user_id, FactStat.fact_id == fact_id))
    if stat:
        return stat
    stat = FactStat(user_id=user_id, fact_id=fact_id)
    db.add(stat)
    db.flush()
    return stat


def record_stat(stat: FactStat, is_correct: bool, attempt_number: int, response_time_ms: int) -> None:
    now = datetime.now(timezone.utc)
    if is_correct:
        stat.correct_count += 1
        stat.current_streak += 1
    else:
        stat.incorrect_count += 1
        stat.current_streak = 0
        stat.last_failed_at = now

    if attempt_number == 1:
        stat.first_attempt_total += 1
        if is_correct:
            stat.first_attempt_correct += 1
    elif attempt_number == 2:
        stat.second_attempt_total += 1
        if is_correct:
            stat.second_attempt_correct += 1

    stat.total_response_time_ms += response_time_ms
    stat.response_count += 1
    stat.last_seen = now


def learning_event_for_stat(stat: FactStat, is_correct: bool, question_type: str) -> dict:
    total = stat.correct_count + stat.incorrect_count
    previous_accuracy = stat.correct_count / total if total else None
    previous_error_rate = stat.incorrect_count / total if total else 0
    next_correct = stat.correct_count + int(is_correct)
    next_incorrect = stat.incorrect_count + int(not is_correct)
    next_total = next_correct + next_incorrect
    next_accuracy = next_correct / next_total if next_total else 0
    return {
        "practiced_weak_fact": total >= 3 and previous_error_rate >= 0.35,
        "improved_fact_accuracy": bool(is_correct and previous_accuracy is not None and next_accuracy > previous_accuracy),
        "practiced_division": question_type.startswith("divide_"),
    }


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.get("/users")
def list_users(db: Session = Depends(get_db)) -> list[dict]:
    users = db.scalars(select(User).order_by(User.name)).all()
    return [
        {
            "id": user.id,
            "name": user.name,
            "creature_type": user.creature_type,
            "creature_name": user.creature_name,
        }
        for user in users
    ]


@app.post("/users")
def create_user(payload: UserCreate, db: Session = Depends(get_db)) -> dict:
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    existing = db.scalar(select(User).where(User.name == name))
    if existing:
        return {"id": existing.id, "name": existing.name}
    user = User(name=name)
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"id": user.id, "name": user.name}


@app.get("/creature-types")
def creature_types() -> dict:
    return {"creature_types": CREATURE_TYPES}


@app.get("/users/{user_id}/creature")
def get_creature(user_id: int, db: Session = Depends(get_db)) -> dict:
    user = get_user(db, user_id)
    return creature_payload(user)


@app.put("/users/{user_id}/creature")
def update_creature(user_id: int, payload: CreatureUpdate, db: Session = Depends(get_db)) -> dict:
    user = get_user(db, user_id)
    user.creature_type = payload.creature_type
    user.creature_name = payload.creature_name.strip()
    db.commit()
    db.refresh(user)
    return creature_payload(user)


@app.put("/users/{user_id}/creature/cosmetic")
def update_creature_cosmetic(user_id: int, payload: CreatureCosmeticUpdate, db: Session = Depends(get_db)) -> dict:
    user = get_user(db, user_id)
    if payload.selected_cosmetic not in cosmetic_list(user):
        raise HTTPException(status_code=400, detail="Cosmetic is not unlocked yet")
    user.selected_cosmetic = payload.selected_cosmetic
    db.commit()
    db.refresh(user)
    return creature_payload(user)


@app.post("/users/{user_id}/creature/session-complete")
def complete_creature_session(user_id: int, payload: CreatureSessionComplete, db: Session = Depends(get_db)) -> dict:
    user = get_user(db, user_id)
    now = datetime.now(timezone.utc)
    previous_level, previous_stage, _, _ = sync_level_and_stage(user)
    energy_gained = energy_gain_for_questions(payload.questions_completed)
    weekly_days_completed, weekly_goal_completed = add_weekly_practice_day(user, now)
    xp_gained, reward_reasons = session_rewards(
        mode=payload.mode,
        questions_completed=payload.questions_completed,
        first_attempt_correct=payload.first_attempt_correct,
        second_attempt_correct=payload.second_attempt_correct,
        practiced_weak_fact=payload.practiced_weak_fact,
        improved_fact_accuracy=payload.improved_fact_accuracy,
        practiced_division=payload.practiced_division,
        weekly_goal_completed=weekly_goal_completed,
    )
    user.energy = min(100, decayed_energy(user, now) + energy_gained)
    user.xp = (user.xp or 0) + xp_gained
    user.last_practised_at = now
    user.total_questions_answered = (user.total_questions_answered or 0) + payload.questions_completed
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
    if payload.improved_fact_accuracy or payload.practiced_weak_fact:
        cosmetic_keys.append("growth-trail")
    if payload.mode == "challenge":
        cosmetic_keys.append("challenge-crest")
    if payload.practiced_division:
        cosmetic_keys.append("division-stones")
    new_unlocks = unlock_cosmetics(user, cosmetic_keys)
    stage_message = ""
    if new_stage != previous_stage:
        stage_message = f"{user.creature_name} has reached the {new_stage} stage."
    elif new_level > previous_level:
        stage_message = f"{user.creature_name} grew stronger."
    db.commit()
    db.refresh(user)
    return creature_payload(
        user,
        energy_gained=energy_gained,
        xp_gained=xp_gained,
        reward_reasons=reward_reasons,
        new_unlocks=new_unlocks,
        stage_message=stage_message,
    )


@app.get("/facts")
def list_facts(db: Session = Depends(get_db)) -> list[dict]:
    facts = db.scalars(select(Fact).order_by(Fact.a, Fact.b)).all()
    return [{"id": fact.id, "a": fact.a, "b": fact.b, "product": fact.product} for fact in facts]


@app.post("/practice/question")
def next_practice_question(payload: TablesRequest, db: Session = Depends(get_db)) -> dict:
    get_user(db, payload.user_id)
    facts = facts_for_tables(db, payload.tables)
    stats = db.scalars(select(FactStat).where(FactStat.user_id == payload.user_id)).all()
    stats_by_fact_id = {stat.fact_id: stat for stat in stats}
    fact = choose_fact(facts, stats_by_fact_id)
    question_type = choice(QUESTION_TYPES)
    prompt, _ = question_for_fact(fact, question_type)
    return {
        "fact_id": fact.id,
        "a": fact.a,
        "b": fact.b,
        "question_type": question_type,
        "prompt": prompt,
        "priority_score": round(priority_score(stats_by_fact_id.get(fact.id)), 3),
    }


@app.post("/practice/answer")
def answer_practice_question(payload: PracticeAnswer, db: Session = Depends(get_db)) -> dict:
    get_user(db, payload.user_id)
    fact = db.get(Fact, payload.fact_id)
    if not fact:
        raise HTTPException(status_code=404, detail="Fact not found")

    prompt, correct_answer = question_for_fact(fact, payload.question_type)
    normalized = normalize_answer(payload.answer)
    is_correct = normalized == correct_answer
    attempt = QuestionAttempt(
        user_id=payload.user_id,
        fact_id=fact.id,
        question_type=payload.question_type,
        prompt=prompt,
        answer_given=payload.answer,
        correct_answer=correct_answer,
        is_correct=is_correct,
        attempt_number=payload.attempt_number,
        response_time_ms=payload.response_time_ms,
        mode="practice",
    )
    db.add(attempt)
    stat = get_or_create_stat(db, payload.user_id, fact.id)
    learning_event = learning_event_for_stat(stat, is_correct, payload.question_type)
    record_stat(stat, is_correct, payload.attempt_number, payload.response_time_ms)
    db.commit()
    return {"correct": is_correct, "correct_answer": correct_answer, "prompt": prompt, "learning_event": learning_event}


@app.post("/challenge/start")
def start_challenge(payload: ChallengeStart, db: Session = Depends(get_db)) -> dict:
    get_user(db, payload.user_id)
    facts = facts_for_tables(db, payload.tables)
    stats = db.scalars(select(FactStat).where(FactStat.user_id == payload.user_id)).all()
    stats_by_fact_id = {stat.fact_id: stat for stat in stats}
    questions = []
    for _ in range(payload.question_count):
        fact = choose_fact(facts, stats_by_fact_id)
        question_type = choice(QUESTION_TYPES)
        prompt, _ = question_for_fact(fact, question_type)
        questions.append(
            {
                "fact_id": fact.id,
                "a": fact.a,
                "b": fact.b,
                "question_type": question_type,
                "prompt": prompt,
            }
        )
    return {"questions": questions}


@app.post("/challenge/submit")
def submit_challenge(payload: ChallengeSubmit, db: Session = Depends(get_db)) -> dict:
    get_user(db, payload.user_id)
    selected_tables = ",".join(str(table) for table in sorted(set(payload.tables)))
    total_time = sum(answer.response_time_ms for answer in payload.answers)
    session = ChallengeSession(
        user_id=payload.user_id,
        question_count=len(payload.answers),
        selected_tables=selected_tables,
        total_time_ms=total_time,
    )
    db.add(session)
    db.flush()

    results = []
    correct_count = 0
    first_attempt_correct = 0
    practiced_weak_fact = False
    improved_fact_accuracy = False
    practiced_division = False
    for answer in payload.answers:
        fact = db.get(Fact, answer.fact_id)
        if not fact:
            raise HTTPException(status_code=404, detail="Fact not found")
        prompt, correct_answer = question_for_fact(fact, answer.question_type)
        is_correct = normalize_answer(answer.answer) == correct_answer
        correct_count += int(is_correct)
        first_attempt_correct += int(is_correct)
        db.add(
            ChallengeAttempt(
                session_id=session.id,
                fact_id=fact.id,
                question_type=answer.question_type,
                prompt=prompt,
                answer_given=answer.answer,
                correct_answer=correct_answer,
                is_correct=is_correct,
                response_time_ms=answer.response_time_ms,
            )
        )
        db.add(
            QuestionAttempt(
                user_id=payload.user_id,
                fact_id=fact.id,
                question_type=answer.question_type,
                prompt=prompt,
                answer_given=answer.answer,
                correct_answer=correct_answer,
                is_correct=is_correct,
                attempt_number=1,
                response_time_ms=answer.response_time_ms,
                mode="challenge",
            )
        )
        stat = get_or_create_stat(db, payload.user_id, fact.id)
        learning_event = learning_event_for_stat(stat, is_correct, answer.question_type)
        practiced_weak_fact = practiced_weak_fact or learning_event["practiced_weak_fact"]
        improved_fact_accuracy = improved_fact_accuracy or learning_event["improved_fact_accuracy"]
        practiced_division = practiced_division or learning_event["practiced_division"]
        record_stat(stat, is_correct, 1, answer.response_time_ms)
        results.append(
            {
                "prompt": prompt,
                "answer_given": answer.answer,
                "correct_answer": correct_answer,
                "is_correct": is_correct,
                "response_time_ms": answer.response_time_ms,
            }
        )

    session.correct_count = correct_count
    db.commit()

    previous = db.scalars(
        select(ChallengeSession)
        .where(ChallengeSession.user_id == payload.user_id, ChallengeSession.id != session.id)
        .order_by(desc(ChallengeSession.created_at))
        .limit(10)
    ).all()
    previous_summaries = [
        {
            "id": item.id,
            "accuracy": round(item.correct_count / item.question_count, 3) if item.question_count else 0,
            "total_time_ms": item.total_time_ms,
            "average_time_ms": round(item.total_time_ms / item.question_count) if item.question_count else 0,
            "created_at": item.created_at.isoformat(),
        }
        for item in previous
    ]

    fastest = min(results, key=lambda item: item["response_time_ms"])
    slowest = max(results, key=lambda item: item["response_time_ms"])
    incorrect = [item for item in results if not item["is_correct"]]
    return {
        "session_id": session.id,
        "total_time_ms": total_time,
        "average_time_ms": round(total_time / len(results)),
        "accuracy": round(correct_count / len(results), 3),
        "correct_count": correct_count,
        "question_count": len(results),
        "fastest": fastest,
        "slowest": slowest,
        "incorrect_answers": incorrect,
        "previous_10": previous_summaries,
        "creature_events": {
            "first_attempt_correct": first_attempt_correct,
            "second_attempt_correct": 0,
            "practiced_weak_fact": practiced_weak_fact,
            "improved_fact_accuracy": improved_fact_accuracy,
            "practiced_division": practiced_division,
        },
    }


@app.get("/dashboard/{user_id}")
def dashboard(user_id: int, db: Session = Depends(get_db)) -> dict:
    get_user(db, user_id)
    facts = db.scalars(select(Fact).order_by(Fact.a, Fact.b)).all()
    stats = db.scalars(select(FactStat).where(FactStat.user_id == user_id)).all()
    stats_by_fact_id = {stat.fact_id: stat for stat in stats}

    cells = []
    for fact in facts:
        stat = stats_by_fact_id.get(fact.id)
        avg_ms = None
        correct = incorrect = 0
        if stat:
            correct = stat.correct_count
            incorrect = stat.incorrect_count
            avg_ms = stat.total_response_time_ms / stat.response_count if stat.response_count else None
        cells.append(
            {
                "fact_id": fact.id,
                "a": fact.a,
                "b": fact.b,
                "label": f"{fact.a}x{fact.b}",
                "accuracy_colour": heat_colour_accuracy(correct, incorrect),
                "speed_colour": heat_colour_speed(avg_ms),
                "correct_count": correct,
                "incorrect_count": incorrect,
                "accuracy": round(correct / (correct + incorrect), 3) if correct + incorrect else None,
                "average_time_ms": round(avg_ms) if avg_ms is not None else None,
                "priority_score": round(priority_score(stat), 3),
                "last_seen": stat.last_seen.isoformat() if stat and stat.last_seen else None,
            }
        )

    attempted = [cell for cell in cells if cell["accuracy"] is not None]
    strengths = sorted(attempted, key=lambda item: (-(item["accuracy"] or 0), item["average_time_ms"] or 999999))[:5]
    weaknesses = sorted(attempted, key=lambda item: (-item["priority_score"], item["accuracy"] or 0))[:5]
    totals = {
        "correct": sum(cell["correct_count"] for cell in cells),
        "incorrect": sum(cell["incorrect_count"] for cell in cells),
    }
    total_answers = totals["correct"] + totals["incorrect"]
    totals["accuracy"] = round(totals["correct"] / total_answers, 3) if total_answers else None
    return {"totals": totals, "cells": cells, "strengths": strengths, "weaknesses": weaknesses}
