from __future__ import annotations

import hashlib
import csv
import io
import json
import os
import secrets
import sqlite3
import tempfile
import threading
import time
from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from random import choice

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from starlette.background import BackgroundTask
from starlette.responses import FileResponse
from sqlalchemy import desc, func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from .adaptive import (
    as_aware_utc,
    choose_fact,
    heat_colour_accuracy,
    heat_colour_speed,
    normalize_answer,
    priority_score,
    question_types_for_mode,
    question_for_fact,
    rolling_accuracy_improvement,
)
from .creatures import (
    CREATURE_TYPES,
    cosmetic_list,
    creature_payload,
    decayed_energy,
    energy_gain_for_questions,
)
from .config import local_date
from .database import Base, SessionLocal, engine, get_db
from .migrations import run_migrations
from .models import (
    AuthSession,
    ChallengeAttempt,
    ChallengeSession,
    Fact,
    FactStat,
    LearningSession,
    LearningSessionQuestion,
    QuestionAttempt,
    RetentionAssessment,
    RetentionAssessmentAttempt,
    RetentionAssessmentQuestion,
    RetentionAssessmentRound,
    User,
)
from .models import TrainingQuest
from .learning import (
    award_learning_session,
    get_or_create_stat,
    learning_event_for_stat,
    recent_attempts_by_fact,
    record_stat,
)
from .profiles import clean_tables, effective_tables, parse_required_tables, reset_user_progress, user_payload
from .quests import APP_VERSION, ensure_available_quests, quest_payload, quest_questions
from .reports import evaluation_csv, retention_summary
from .retention import assessment_payload, build_question_specs
from .scheduler import choose_practice_fact, learning_state, review_is_due
from .schemas import (
    ChallengeStart,
    ChallengeSubmit,
    CreatureCosmeticUpdate,
    CreatureUpdate,
    LoginRequest,
    PracticeAnswer,
    PracticeQuestionRequest,
    PracticeStart,
    RequiredTablesUpdate,
    RetentionAssessmentCreate,
    RetentionAssessmentSubmit,
    TablesRequest,
    UserAdminUpdate,
    UserCreate,
)
from .seed import seed_facts

SESSION_COOKIE = "recall_forge_session"
SESSION_DAYS = 30
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"
ADMIN_PASSWORD_MIN_LENGTH = int(os.getenv("ADMIN_PASSWORD_MIN_LENGTH", "6"))
LOGIN_WINDOW_SECONDS = 5 * 60
LOGIN_MAX_FAILURES = 5
_login_failures: dict[tuple[str, int], list[float]] = defaultdict(list)
_login_lock = threading.Lock()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)
    run_migrations(engine)
    with SessionLocal() as db:
        seed_facts(db)
    yield


app = FastAPI(title="Recall Forge API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_user(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def authenticated_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise HTTPException(status_code=401, detail="Login required")
    session = db.scalar(select(AuthSession).where(AuthSession.token_hash == token_digest(token)))
    if not session or as_aware_utc(session.expires_at) <= datetime.now(timezone.utc):
        if session:
            db.delete(session)
            db.commit()
        raise HTTPException(status_code=401, detail="Login expired")
    return get_user(db, session.user_id)


def authorize_profile(current_user: User, user_id: int) -> User:
    if current_user.id != user_id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Profile access denied")
    return current_user


def authorize_admin(current_user: User, admin_user_id: int) -> User:
    if current_user.id != admin_user_id or not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin login required")
    return current_user


def set_user_password(user: User, password: str | None) -> None:
    if not password:
        user.password_hash = None
        user.password_salt = None
        user.password_updated_at = None
        return
    salt = secrets.token_hex(12)
    iterations = 600_000
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), iterations).hex()
    user.password_salt = salt
    user.password_hash = f"pbkdf2_sha256${iterations}${salt}${digest}"
    user.password_updated_at = datetime.now(timezone.utc)


def password_matches(user: User, password: str) -> bool:
    if not user.password_hash or not user.password_salt:
        return password == ""
    if user.password_hash.startswith("pbkdf2_sha256$"):
        try:
            _, iterations, salt, expected = user.password_hash.split("$", 3)
            digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), int(iterations)).hex()
            return secrets.compare_digest(digest, expected)
        except (TypeError, ValueError):
            return False
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), user.password_salt.encode("utf-8"), 120_000).hex()
    return secrets.compare_digest(digest, user.password_hash)


def create_local_user(db: Session, payload: UserCreate, allow_admin: bool) -> User:
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    existing = db.scalar(select(User).where(User.name == name))
    if existing:
        raise HTTPException(status_code=400, detail="Name already exists")
    has_users = db.scalar(select(User.id).limit(1)) is not None
    is_admin = not has_users or (allow_admin and payload.is_admin)
    if is_admin and len(payload.password or "") < ADMIN_PASSWORD_MIN_LENGTH:
        raise HTTPException(status_code=400, detail=f"Admin passcodes must be at least {ADMIN_PASSWORD_MIN_LENGTH} characters")
    user = User(name=name, is_admin=is_admin)
    set_user_password(user, payload.password if allow_admin or not has_users else None)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def facts_for_tables(db: Session, tables: list[int]) -> list[Fact]:
    tables = clean_tables(tables)
    if not tables:
        raise HTTPException(status_code=400, detail="Select at least one table from 2 to 12")
    return list(db.scalars(select(Fact).where(Fact.a.in_(tables))).all())


def get_learning_session(db: Session, session_id: str, current_user: User) -> LearningSession:
    learning_session = db.get(LearningSession, session_id)
    if not learning_session:
        raise HTTPException(status_code=404, detail="Learning session not found")
    authorize_profile(current_user, learning_session.user_id)
    return learning_session


def get_retention_assessment(db: Session, assessment_id: int, current_user: User) -> RetentionAssessment:
    assessment = db.get(RetentionAssessment, assessment_id)
    if not assessment:
        raise HTTPException(status_code=404, detail="Retention check not found")
    authorize_profile(current_user, assessment.user_id)
    return assessment


def retention_assessments_for_user(db: Session, user_id: int) -> list[RetentionAssessment]:
    return list(
        db.scalars(
            select(RetentionAssessment)
            .where(RetentionAssessment.user_id == user_id)
            .options(selectinload(RetentionAssessment.rounds).selectinload(RetentionAssessmentRound.attempts))
            .order_by(desc(RetentionAssessment.created_at), desc(RetentionAssessment.id))
        ).all()
    )


def learning_question_payload(question: LearningSessionQuestion) -> dict:
    return {
        "question_id": question.id,
        "fact_id": question.fact_id,
        "question_type": question.question_type,
        "prompt": question.prompt,
    }


def login_failure_key(request: Request, user_id: int) -> tuple[str, int]:
    return (request.client.host if request.client else "unknown", user_id)


def check_login_rate_limit(request: Request, user_id: int) -> None:
    key = login_failure_key(request, user_id)
    cutoff = time.monotonic() - LOGIN_WINDOW_SECONDS
    with _login_lock:
        failures = [timestamp for timestamp in _login_failures[key] if timestamp >= cutoff]
        _login_failures[key] = failures
        if len(failures) >= LOGIN_MAX_FAILURES:
            raise HTTPException(status_code=429, detail="Too many login attempts. Try again in a few minutes.")


def record_login_result(request: Request, user_id: int, succeeded: bool) -> None:
    key = login_failure_key(request, user_id)
    with _login_lock:
        if succeeded:
            _login_failures.pop(key, None)
        else:
            _login_failures[key].append(time.monotonic())


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.get("/version")
def version() -> dict:
    return {"name": "Recall Forge", "version": APP_VERSION}


@app.post("/auth/login")
def login(payload: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)) -> dict:
    check_login_rate_limit(request, payload.user_id)
    user = get_user(db, payload.user_id)
    if not password_matches(user, payload.password):
        record_login_result(request, payload.user_id, False)
        raise HTTPException(status_code=401, detail="Incorrect passcode")
    record_login_result(request, payload.user_id, True)
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    db.query(AuthSession).filter(AuthSession.expires_at <= now).delete(synchronize_session=False)
    expires_at = now + timedelta(days=SESSION_DAYS)
    db.add(AuthSession(user_id=user.id, token_hash=token_digest(token), expires_at=expires_at))
    db.commit()
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        max_age=SESSION_DAYS * 24 * 60 * 60,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="strict",
        path="/",
    )
    return user_payload(user)


@app.post("/auth/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)) -> dict:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        session = db.scalar(select(AuthSession).where(AuthSession.token_hash == token_digest(token)))
        if session:
            db.delete(session)
            db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/", samesite="strict")
    return {"logged_out": True}


@app.get("/auth/me")
def auth_me(current_user: User = Depends(authenticated_user)) -> dict:
    return user_payload(current_user)


@app.get("/users")
def list_users(db: Session = Depends(get_db)) -> list[dict]:
    users = db.scalars(select(User).order_by(User.name)).all()
    return [user_payload(user) for user in users]


@app.post("/users")
def create_user(payload: UserCreate, request: Request, db: Session = Depends(get_db)) -> dict:
    has_users = db.scalar(select(User.id).limit(1)) is not None
    if has_users:
        current_user = authenticated_user(request, db)
        if not current_user.is_admin:
            raise HTTPException(status_code=403, detail="Admin login required")
    user = create_local_user(db, payload, allow_admin=False)
    return user_payload(user)


@app.get("/admin/{admin_user_id}/users")
def admin_list_users(admin_user_id: int, db: Session = Depends(get_db), current_user: User = Depends(authenticated_user)) -> list[dict]:
    authorize_admin(current_user, admin_user_id)
    users = db.scalars(select(User).order_by(User.created_at, User.id)).all()
    return [
        {
            **user_payload(user),
            "total_questions_answered": user.total_questions_answered or 0,
            "total_sessions_completed": user.total_sessions_completed or 0,
            "level": user.level or 1,
            "energy": decayed_energy(user),
        }
        for user in users
    ]


@app.post("/admin/{admin_user_id}/users")
def admin_create_user(admin_user_id: int, payload: UserCreate, db: Session = Depends(get_db), current_user: User = Depends(authenticated_user)) -> dict:
    authorize_admin(current_user, admin_user_id)
    user = create_local_user(db, payload, allow_admin=True)
    return user_payload(user)


@app.patch("/admin/{admin_user_id}/users/{target_user_id}")
def admin_update_user(admin_user_id: int, target_user_id: int, payload: UserAdminUpdate, db: Session = Depends(get_db), current_user: User = Depends(authenticated_user)) -> dict:
    authorize_admin(current_user, admin_user_id)
    user = get_user(db, target_user_id)
    if payload.name is not None:
        new_name = payload.name.strip()
        if not new_name:
            raise HTTPException(status_code=400, detail="Name is required")
        existing = db.scalar(select(User).where(User.name == new_name, User.id != user.id))
        if existing:
            raise HTTPException(status_code=400, detail="Name already exists")
        user.name = new_name
    if payload.is_admin is not None:
        if user.is_admin and not payload.is_admin:
            admin_count = db.scalar(select(func.count()).select_from(User).where(User.is_admin == True))  # noqa: E712
            if admin_count and admin_count <= 1:
                raise HTTPException(status_code=400, detail="At least one admin is required")
        if payload.is_admin and not user.password_hash and len(payload.password or "") < ADMIN_PASSWORD_MIN_LENGTH:
            raise HTTPException(status_code=400, detail="Set a passcode before making this profile an admin")
        user.is_admin = payload.is_admin
    if payload.password is not None:
        if user.is_admin and len(payload.password) < ADMIN_PASSWORD_MIN_LENGTH:
            raise HTTPException(status_code=400, detail=f"Admin passcodes must be at least {ADMIN_PASSWORD_MIN_LENGTH} characters")
        set_user_password(user, payload.password)
        db.query(AuthSession).filter(AuthSession.user_id == user.id).delete(synchronize_session=False)
    db.commit()
    db.refresh(user)
    return user_payload(user)


@app.put("/admin/{admin_user_id}/users/{target_user_id}/required-tables")
def admin_update_required_tables(
    admin_user_id: int,
    target_user_id: int,
    payload: RequiredTablesUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(authenticated_user),
) -> dict:
    authorize_admin(current_user, admin_user_id)
    user = get_user(db, target_user_id)
    invalid = [table for table in payload.tables if table < 2 or table > 12]
    if invalid:
        raise HTTPException(status_code=400, detail="Required tables must be between 2 and 12")
    user.required_tables = json.dumps(clean_tables(payload.tables))
    db.commit()
    db.refresh(user)
    return user_payload(user)


@app.post("/admin/{admin_user_id}/users/{target_user_id}/reset-progress")
def admin_reset_progress(admin_user_id: int, target_user_id: int, db: Session = Depends(get_db), current_user: User = Depends(authenticated_user)) -> dict:
    authorize_admin(current_user, admin_user_id)
    user = get_user(db, target_user_id)
    reset_user_progress(db, user)
    db.commit()
    db.refresh(user)
    return {"user": user_payload(user), "creature": creature_payload(user)}


@app.delete("/admin/{admin_user_id}/users/{target_user_id}")
def admin_delete_user(admin_user_id: int, target_user_id: int, db: Session = Depends(get_db), current_user: User = Depends(authenticated_user)) -> dict:
    authorize_admin(current_user, admin_user_id)
    if admin_user_id == target_user_id:
        raise HTTPException(status_code=400, detail="Admins cannot delete the active admin profile")
    user = get_user(db, target_user_id)
    if user.is_admin:
        admin_count = db.scalar(select(func.count()).select_from(User).where(User.is_admin == True))  # noqa: E712
        if admin_count and admin_count <= 1:
            raise HTTPException(status_code=400, detail="At least one admin is required")
    reset_user_progress(db, user)
    db.delete(user)
    db.commit()
    return {"deleted": True}


@app.get("/admin/{admin_user_id}/backup")
def admin_backup(admin_user_id: int, db: Session = Depends(get_db), current_user: User = Depends(authenticated_user)) -> Response:
    authorize_admin(current_user, admin_user_id)
    temporary = tempfile.NamedTemporaryFile(prefix="recall-forge-", suffix=".db", dir="/tmp", delete=False)
    temporary_path = temporary.name
    temporary.close()
    source = engine.raw_connection()
    destination = sqlite3.connect(temporary_path)
    try:
        source.driver_connection.backup(destination)
    finally:
        destination.close()
        source.close()
    return FileResponse(
        temporary_path,
        filename="recall-forge-backup.db",
        media_type="application/vnd.sqlite3",
        background=BackgroundTask(os.unlink, temporary_path),
    )



@app.get("/admin/{admin_user_id}/progress.csv")
def admin_progress_csv(admin_user_id: int, db: Session = Depends(get_db), current_user: User = Depends(authenticated_user)) -> Response:
    authorize_admin(current_user, admin_user_id)
    rows = db.execute(
        text(
            """
            SELECT users.name AS user_name,
                   facts.a AS table_a,
                   facts.b AS table_b,
                   facts.product AS product,
                   fact_stats.correct_count AS correct_count,
                   fact_stats.incorrect_count AS incorrect_count,
                   fact_stats.first_attempt_correct AS first_attempt_correct,
                   fact_stats.first_attempt_total AS first_attempt_total,
                   fact_stats.second_attempt_correct AS second_attempt_correct,
                   fact_stats.second_attempt_total AS second_attempt_total,
                   fact_stats.total_response_time_ms AS total_response_time_ms,
                   fact_stats.response_count AS response_count,
                   fact_stats.last_seen AS last_seen
            FROM fact_stats
            JOIN users ON users.id = fact_stats.user_id
            JOIN facts ON facts.id = fact_stats.fact_id
            ORDER BY users.name, facts.a, facts.b
            """
        )
    ).all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "user",
            "fact",
            "product",
            "correct",
            "incorrect",
            "accuracy",
            "first_attempt_accuracy",
            "second_attempt_accuracy",
            "average_response_ms",
            "last_seen",
        ]
    )
    for row in rows:
        total = row.correct_count + row.incorrect_count
        first_total = row.first_attempt_total or 0
        second_total = row.second_attempt_total or 0
        response_count = row.response_count or 0
        writer.writerow(
            [
                row.user_name,
                f"{row.table_a}x{row.table_b}",
                row.product,
                row.correct_count,
                row.incorrect_count,
                round(row.correct_count / total, 3) if total else "",
                round(row.first_attempt_correct / first_total, 3) if first_total else "",
                round(row.second_attempt_correct / second_total, 3) if second_total else "",
                round(row.total_response_time_ms / response_count) if response_count else "",
                row.last_seen or "",
            ]
        )
    return Response(
        output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="recall-forge-progress.csv"'},
    )


@app.get("/admin/{admin_user_id}/evaluation.csv")
def admin_evaluation_csv(
    admin_user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(authenticated_user),
) -> Response:
    authorize_admin(current_user, admin_user_id)
    users = list(db.scalars(select(User).order_by(User.id)).all())
    attempts = list(db.scalars(select(QuestionAttempt).order_by(QuestionAttempt.created_at)).all())
    return Response(
        evaluation_csv(users, attempts),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="recall-forge-evaluation.csv"'},
    )


@app.get("/creature-types")
def creature_types() -> dict:
    return {"creature_types": CREATURE_TYPES}


@app.get("/users/{user_id}/creature")
def get_creature(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(authenticated_user)) -> dict:
    authorize_profile(current_user, user_id)
    user = get_user(db, user_id)
    return creature_payload(user)


@app.put("/users/{user_id}/creature")
def update_creature(user_id: int, payload: CreatureUpdate, db: Session = Depends(get_db), current_user: User = Depends(authenticated_user)) -> dict:
    authorize_profile(current_user, user_id)
    user = get_user(db, user_id)
    user.creature_type = payload.creature_type
    user.creature_name = payload.creature_name.strip()
    db.commit()
    db.refresh(user)
    return creature_payload(user)


@app.put("/users/{user_id}/creature/cosmetic")
def update_creature_cosmetic(user_id: int, payload: CreatureCosmeticUpdate, db: Session = Depends(get_db), current_user: User = Depends(authenticated_user)) -> dict:
    authorize_profile(current_user, user_id)
    user = get_user(db, user_id)
    if payload.selected_cosmetic not in cosmetic_list(user):
        raise HTTPException(status_code=400, detail="Cosmetic is not unlocked yet")
    user.selected_cosmetic = payload.selected_cosmetic
    db.commit()
    db.refresh(user)
    return creature_payload(user)


@app.get("/users/{user_id}/quests")
def list_training_quests(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(authenticated_user)) -> dict:
    authorize_profile(current_user, user_id)
    get_user(db, user_id)
    facts = db.scalars(select(Fact).order_by(Fact.a, Fact.b)).all()
    stats = db.scalars(select(FactStat).where(FactStat.user_id == user_id)).all()
    stats_by_fact_id = {stat.fact_id: stat for stat in stats}
    existing = db.scalars(select(TrainingQuest).where(TrainingQuest.user_id == user_id).order_by(desc(TrainingQuest.generated_at))).all()
    quests = ensure_available_quests(user_id, existing, facts, stats_by_fact_id)
    for quest in quests:
        if quest.id is None:
            db.add(quest)
    db.commit()
    refreshed = db.scalars(select(TrainingQuest).where(TrainingQuest.user_id == user_id).order_by(desc(TrainingQuest.generated_at))).all()
    active = [quest for quest in refreshed if quest.status == "available"][:7]
    completed = [quest for quest in refreshed if quest.status == "completed"][:6]
    return {"quests": [quest_payload(quest) for quest in active], "completed": [quest_payload(quest) for quest in completed]}


@app.post("/users/{user_id}/quests/{quest_id}/start")
def start_training_quest(user_id: int, quest_id: int, db: Session = Depends(get_db), current_user: User = Depends(authenticated_user)) -> dict:
    authorize_profile(current_user, user_id)
    get_user(db, user_id)
    quest = db.get(TrainingQuest, quest_id)
    if not quest or quest.user_id != user_id:
        raise HTTPException(status_code=404, detail="Quest not found")
    if quest.status != "available":
        raise HTTPException(status_code=409, detail="Quest is no longer available")
    facts = db.scalars(select(Fact)).all()
    questions = quest_questions(quest, {fact.id: fact for fact in facts})
    if not questions:
        raise HTTPException(status_code=400, detail="Quest has no facts to practise")
    prior_sessions = db.scalars(
        select(LearningSession).where(
            LearningSession.user_id == user_id,
            LearningSession.quest_id == quest.id,
            LearningSession.status == "active",
        )
    ).all()
    for prior in prior_sessions:
        prior.status = "abandoned"
    selected_tables = sorted({question["a"] for question in questions})
    learning_session = LearningSession(
        id=secrets.token_urlsafe(24),
        user_id=user_id,
        mode="quest",
        question_mode="mixed",
        selected_tables=",".join(str(table) for table in selected_tables),
        expected_questions=len(questions),
        quest_id=quest.id,
    )
    db.add(learning_session)
    db.flush()
    records = []
    for position, question in enumerate(questions):
        record = LearningSessionQuestion(
            session_id=learning_session.id,
            position=position,
            fact_id=question["fact_id"],
            question_type=question["question_type"],
            prompt=question["prompt"],
        )
        db.add(record)
        records.append(record)
    db.commit()
    for record in records:
        db.refresh(record)
    return {
        "session_id": learning_session.id,
        "quest": quest_payload(quest),
        "questions": [learning_question_payload(record) for record in records],
    }


@app.get("/facts")
def list_facts(db: Session = Depends(get_db)) -> list[dict]:
    facts = db.scalars(select(Fact).order_by(Fact.a, Fact.b)).all()
    return [{"id": fact.id, "a": fact.a, "b": fact.b, "product": fact.product} for fact in facts]


@app.post("/practice/start")
def start_practice(payload: PracticeStart, db: Session = Depends(get_db), current_user: User = Depends(authenticated_user)) -> dict:
    authorize_profile(current_user, payload.user_id)
    user = get_user(db, payload.user_id)
    tables = effective_tables(user, payload.tables)
    facts_for_tables(db, tables)
    learning_session = LearningSession(
        id=secrets.token_urlsafe(24),
        user_id=payload.user_id,
        mode="practice",
        question_mode=payload.question_mode,
        selected_tables=",".join(str(table) for table in tables),
        expected_questions=payload.question_count,
    )
    db.add(learning_session)
    db.commit()
    return {"session_id": learning_session.id, "question_count": learning_session.expected_questions}


@app.post("/practice/question")
def next_practice_question(payload: PracticeQuestionRequest, db: Session = Depends(get_db), current_user: User = Depends(authenticated_user)) -> dict:
    learning_session = get_learning_session(db, payload.session_id, current_user)
    if learning_session.status != "active":
        raise HTTPException(status_code=409, detail="Learning session is already complete")
    existing = db.scalar(
        select(LearningSessionQuestion)
        .where(LearningSessionQuestion.session_id == learning_session.id, LearningSessionQuestion.completed == False)  # noqa: E712
        .order_by(LearningSessionQuestion.position)
    )
    if existing:
        return learning_question_payload(existing)
    if learning_session.completed_questions >= learning_session.expected_questions:
        raise HTTPException(status_code=409, detail="No questions remain")
    tables = [int(table) for table in learning_session.selected_tables.split(",") if table]
    facts = facts_for_tables(db, tables)
    stats = db.scalars(select(FactStat).where(FactStat.user_id == learning_session.user_id)).all()
    stats_by_fact_id = {stat.fact_id: stat for stat in stats}
    recent_by_fact_id = recent_attempts_by_fact(db, learning_session.user_id)
    previous_fact_id = db.scalar(
        select(LearningSessionQuestion.fact_id)
        .where(LearningSessionQuestion.session_id == learning_session.id, LearningSessionQuestion.completed == True)  # noqa: E712
        .order_by(desc(LearningSessionQuestion.position))
        .limit(1)
    )
    fact, _ = choose_practice_fact(
        facts,
        stats_by_fact_id,
        recent_by_fact_id,
        position=learning_session.completed_questions,
        question_count=learning_session.expected_questions,
        previous_fact_id=previous_fact_id,
    )
    question_type = choice(question_types_for_mode(learning_session.question_mode, tables))
    prompt, _ = question_for_fact(fact, question_type)
    question = LearningSessionQuestion(
        session_id=learning_session.id,
        position=learning_session.completed_questions,
        fact_id=fact.id,
        question_type=question_type,
        prompt=prompt,
    )
    db.add(question)
    db.commit()
    db.refresh(question)
    return learning_question_payload(question)


@app.post("/practice/answer")
def answer_practice_question(payload: PracticeAnswer, db: Session = Depends(get_db), current_user: User = Depends(authenticated_user)) -> dict:
    learning_session = get_learning_session(db, payload.session_id, current_user)
    if learning_session.status != "active":
        raise HTTPException(status_code=409, detail="Learning session is already complete")
    question = db.get(LearningSessionQuestion, payload.question_id)
    if not question or question.session_id != learning_session.id or question.completed:
        raise HTTPException(status_code=409, detail="Question is not active")
    if question.attempts >= 2:
        raise HTTPException(status_code=409, detail="Question already has two attempts")
    fact = db.get(Fact, question.fact_id)
    if not fact:
        raise HTTPException(status_code=404, detail="Fact not found")
    attempt_number = question.attempts + 1
    prompt, correct_answer = question_for_fact(fact, question.question_type)
    normalized = normalize_answer(payload.answer)
    is_correct = normalized == correct_answer
    recent_for_fact = recent_attempts_by_fact(db, learning_session.user_id).get(fact.id, [])
    stat = get_or_create_stat(db, learning_session.user_id, fact.id)
    state_before = learning_state(stat)
    was_due_review = attempt_number == 1 and review_is_due(stat)
    attempt = QuestionAttempt(
        user_id=learning_session.user_id,
        fact_id=fact.id,
        question_type=question.question_type,
        prompt=prompt,
        answer_given=payload.answer,
        correct_answer=correct_answer,
        is_correct=is_correct,
        attempt_number=attempt_number,
        response_time_ms=payload.response_time_ms,
        mode="quest" if learning_session.mode == "quest" else "practice",
        was_due_review=was_due_review,
        learning_state_before=state_before,
    )
    db.add(attempt)
    learning_event = learning_event_for_stat(stat, is_correct, question.question_type, attempt_number, recent_for_fact)
    record_stat(stat, is_correct, attempt_number, payload.response_time_ms, recent_for_fact)
    question.attempts = attempt_number
    question_complete = is_correct or attempt_number == 2
    creature = None
    quest_result = None
    if question_complete:
        question.completed = True
        learning_session.completed_questions += 1
        learning_session.first_attempt_correct += int(is_correct and attempt_number == 1)
        learning_session.second_attempt_correct += int(is_correct and attempt_number == 2)
    learning_session.practiced_weak_fact = learning_session.practiced_weak_fact or learning_event["practiced_weak_fact"]
    learning_session.improved_fact_accuracy = learning_session.improved_fact_accuracy or learning_event["improved_fact_accuracy"]
    learning_session.practiced_division = learning_session.practiced_division or learning_event["practiced_division"]
    if question_complete and learning_session.completed_questions >= learning_session.expected_questions:
        user = get_user(db, learning_session.user_id)
        creature = award_learning_session(db, learning_session, user)
        if learning_session.quest_id:
            quest = db.get(TrainingQuest, learning_session.quest_id)
            practised_fact_ids = list(
                db.scalars(
                    select(LearningSessionQuestion.fact_id)
                    .where(LearningSessionQuestion.session_id == learning_session.id)
                    .distinct()
                ).all()
            )
            facts = db.scalars(select(Fact).where(Fact.id.in_(practised_fact_ids))).all()
            quest_result = {
                "quest": quest_payload(quest) if quest else None,
                "creature": creature,
                "facts_practised": [f"{item.a} x {item.b}" for item in facts[:6]],
                "learning_message": "You gave these facts focused practice. That helps them become easier to remember next time.",
            }
    db.commit()
    return {
        "correct": is_correct,
        "correct_answer": correct_answer,
        "prompt": prompt,
        "attempt_number": attempt_number,
        "question_complete": question_complete,
        "session_complete": learning_session.status == "completed",
        "completed_questions": learning_session.completed_questions,
        "creature": creature,
        "quest_result": quest_result,
        "learning_event": learning_event,
    }


@app.post("/challenge/start")
def start_challenge(payload: ChallengeStart, db: Session = Depends(get_db), current_user: User = Depends(authenticated_user)) -> dict:
    authorize_profile(current_user, payload.user_id)
    user = get_user(db, payload.user_id)
    tables = effective_tables(user, payload.tables)
    facts = facts_for_tables(db, tables)
    stats = db.scalars(select(FactStat).where(FactStat.user_id == payload.user_id)).all()
    stats_by_fact_id = {stat.fact_id: stat for stat in stats}
    recent_by_fact_id = recent_attempts_by_fact(db, payload.user_id)
    learning_session = LearningSession(
        id=secrets.token_urlsafe(24),
        user_id=payload.user_id,
        mode="challenge",
        question_mode=payload.question_mode,
        selected_tables=",".join(str(table) for table in tables),
        expected_questions=payload.question_count,
    )
    db.add(learning_session)
    db.flush()
    questions = []
    unused_fact_ids = {fact.id for fact in facts}
    for position in range(payload.question_count):
        available = [fact for fact in facts if fact.id in unused_fact_ids]
        if not available:
            unused_fact_ids = {fact.id for fact in facts}
            if questions and len(facts) > 1:
                unused_fact_ids.discard(questions[-1].fact_id)
            available = [fact for fact in facts if fact.id in unused_fact_ids]
        fact = choose_fact(available, stats_by_fact_id, recent_by_fact_id)
        unused_fact_ids.discard(fact.id)
        question_type = choice(question_types_for_mode(payload.question_mode, tables))
        prompt, _ = question_for_fact(fact, question_type)
        question = LearningSessionQuestion(
            session_id=learning_session.id,
            position=position,
            fact_id=fact.id,
            question_type=question_type,
            prompt=prompt,
        )
        db.add(question)
        questions.append(question)
    db.commit()
    for question in questions:
        db.refresh(question)
    return {"session_id": learning_session.id, "questions": [learning_question_payload(question) for question in questions]}


@app.post("/challenge/submit")
def submit_challenge(payload: ChallengeSubmit, db: Session = Depends(get_db), current_user: User = Depends(authenticated_user)) -> dict:
    learning_session = get_learning_session(db, payload.session_id, current_user)
    if learning_session.mode != "challenge" or learning_session.status != "active":
        raise HTTPException(status_code=409, detail="Challenge is not active")
    questions = list(
        db.scalars(
            select(LearningSessionQuestion)
            .where(LearningSessionQuestion.session_id == learning_session.id)
            .order_by(LearningSessionQuestion.position)
        ).all()
    )
    if len(payload.answers) != learning_session.expected_questions or [answer.question_id for answer in payload.answers] != [question.id for question in questions]:
        raise HTTPException(status_code=400, detail="Challenge answers do not match the issued questions")
    selected_tables = learning_session.selected_tables
    total_time = sum(answer.response_time_ms for answer in payload.answers)
    session = ChallengeSession(
        user_id=learning_session.user_id,
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
    for answer, question in zip(payload.answers, questions):
        fact = db.get(Fact, question.fact_id)
        if not fact:
            raise HTTPException(status_code=404, detail="Fact not found")
        prompt, correct_answer = question_for_fact(fact, question.question_type)
        is_correct = normalize_answer(answer.answer) == correct_answer
        recent_for_fact = recent_attempts_by_fact(db, learning_session.user_id).get(fact.id, [])
        correct_count += int(is_correct)
        first_attempt_correct += int(is_correct)
        stat = get_or_create_stat(db, learning_session.user_id, fact.id)
        state_before = learning_state(stat)
        was_due_review = review_is_due(stat)
        db.add(
            ChallengeAttempt(
                session_id=session.id,
                fact_id=fact.id,
                question_type=question.question_type,
                prompt=prompt,
                answer_given=answer.answer,
                correct_answer=correct_answer,
                is_correct=is_correct,
                response_time_ms=answer.response_time_ms,
            )
        )
        db.add(
            QuestionAttempt(
                user_id=learning_session.user_id,
                fact_id=fact.id,
                question_type=question.question_type,
                prompt=prompt,
                answer_given=answer.answer,
                correct_answer=correct_answer,
                is_correct=is_correct,
                attempt_number=1,
                response_time_ms=answer.response_time_ms,
                mode="challenge",
                was_due_review=was_due_review,
                learning_state_before=state_before,
            )
        )
        learning_event = learning_event_for_stat(stat, is_correct, question.question_type, 1, recent_for_fact)
        practiced_weak_fact = practiced_weak_fact or learning_event["practiced_weak_fact"]
        improved_fact_accuracy = improved_fact_accuracy or learning_event["improved_fact_accuracy"]
        practiced_division = practiced_division or learning_event["practiced_division"]
        record_stat(stat, is_correct, 1, answer.response_time_ms, recent_for_fact)
        question.attempts = 1
        question.completed = True
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
    learning_session.completed_questions = len(questions)
    learning_session.first_attempt_correct = first_attempt_correct
    learning_session.practiced_weak_fact = practiced_weak_fact
    learning_session.improved_fact_accuracy = improved_fact_accuracy
    learning_session.practiced_division = practiced_division
    user = get_user(db, learning_session.user_id)
    creature = award_learning_session(db, learning_session, user)
    db.commit()

    previous = db.scalars(
        select(ChallengeSession)
        .where(ChallengeSession.user_id == learning_session.user_id, ChallengeSession.id != session.id)
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
    previous_average_times = [item["average_time_ms"] for item in previous_summaries if item["average_time_ms"]]
    current_average_time = round(total_time / len(results))

    fastest = min(results, key=lambda item: item["response_time_ms"])
    slowest = max(results, key=lambda item: item["response_time_ms"])
    incorrect = [item for item in results if not item["is_correct"]]
    return {
        "session_id": session.id,
        "total_time_ms": total_time,
        "average_time_ms": current_average_time,
        "accuracy": round(correct_count / len(results), 3),
        "correct_count": correct_count,
        "question_count": len(results),
        "fastest": fastest,
        "slowest": slowest,
        "incorrect_answers": incorrect,
        "previous_10": previous_summaries,
        "personal_best_average_ms": min(previous_average_times) if previous_average_times else None,
        "recent_average_ms": round(sum(previous_average_times) / len(previous_average_times)) if previous_average_times else None,
        "beat_recent_average": bool(previous_average_times and current_average_time < (sum(previous_average_times) / len(previous_average_times))),
        "creature": creature,
        "creature_events": {
            "first_attempt_correct": first_attempt_correct,
            "second_attempt_correct": 0,
            "practiced_weak_fact": practiced_weak_fact,
            "improved_fact_accuracy": improved_fact_accuracy,
            "practiced_division": practiced_division,
        },
    }


@app.get("/users/{user_id}/retention-assessments")
def list_retention_assessments(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(authenticated_user),
) -> dict:
    authorize_profile(current_user, user_id)
    get_user(db, user_id)
    return {"assessments": [assessment_payload(item) for item in retention_assessments_for_user(db, user_id)]}


@app.post("/retention-assessments")
def create_retention_assessment(
    payload: RetentionAssessmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(authenticated_user),
) -> dict:
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin login required")
    authorize_profile(current_user, payload.user_id)
    user = get_user(db, payload.user_id)
    existing = db.scalar(
        select(RetentionAssessment).where(
            RetentionAssessment.user_id == payload.user_id,
            RetentionAssessment.status != "completed",
        )
    )
    if existing:
        raise HTTPException(status_code=409, detail="This profile already has an active long-term retention check")

    tables = effective_tables(user, payload.tables)
    facts = facts_for_tables(db, tables)
    assessment = RetentionAssessment(
        user_id=user.id,
        selected_tables=",".join(str(table) for table in tables),
        question_mode=payload.question_mode,
        question_count=payload.question_count,
    )
    db.add(assessment)
    db.flush()
    for position, (fact, question_type, prompt) in enumerate(
        build_question_specs(facts, payload.question_count, payload.question_mode)
    ):
        assessment.questions.append(
            RetentionAssessmentQuestion(
                position=position,
                fact_id=fact.id,
                question_type=question_type,
                prompt=prompt,
            )
        )
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(status_code=409, detail="This profile already has an active long-term retention check") from error
    db.refresh(assessment)
    return assessment_payload(assessment)


@app.post("/retention-assessments/{assessment_id}/start")
def start_retention_assessment(
    assessment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(authenticated_user),
) -> dict:
    assessment = get_retention_assessment(db, assessment_id, current_user)
    active_round = next((item for item in assessment.rounds if item.status == "active"), None)
    if active_round:
        round_record = active_round
    else:
        round_key_by_status = {
            "baseline_ready": "baseline",
            "week4_pending": "week4",
            "week8_pending": "week8",
        }
        round_key = round_key_by_status.get(assessment.status)
        if not round_key:
            raise HTTPException(status_code=409, detail="This retention check has no round ready to start")
        due_at = None
        if round_key == "week4":
            due_at = assessment.week4_due_at
        elif round_key == "week8":
            due_at = assessment.week8_due_at
        if due_at and as_aware_utc(due_at) > datetime.now(timezone.utc):
            raise HTTPException(status_code=409, detail=f"The {round_key} retention check is not due yet")
        round_record = RetentionAssessmentRound(
            assessment_id=assessment.id,
            round_key=round_key,
            due_at=due_at,
        )
        assessment.rounds.append(round_record)
        assessment.status = f"{round_key}_active"
        db.commit()
        db.refresh(round_record)

    questions = sorted(assessment.questions, key=lambda item: item.position)
    return {
        "assessment": assessment_payload(assessment),
        "round_id": round_record.id,
        "round_key": round_record.round_key,
        "questions": [
            {
                "question_id": question.id,
                "fact_id": question.fact_id,
                "question_type": question.question_type,
                "prompt": question.prompt,
            }
            for question in questions
        ],
    }


@app.post("/retention-assessments/{assessment_id}/submit")
def submit_retention_assessment(
    assessment_id: int,
    payload: RetentionAssessmentSubmit,
    db: Session = Depends(get_db),
    current_user: User = Depends(authenticated_user),
) -> dict:
    assessment = get_retention_assessment(db, assessment_id, current_user)
    round_record = db.get(RetentionAssessmentRound, payload.round_id)
    if not round_record or round_record.assessment_id != assessment.id:
        raise HTTPException(status_code=400, detail="Retention-check round does not match this assessment")
    if round_record.status != "active":
        raise HTTPException(status_code=409, detail="This retention-check round is not active")

    questions = sorted(assessment.questions, key=lambda item: item.position)
    if len(payload.answers) != assessment.question_count or [item.question_id for item in payload.answers] != [
        item.id for item in questions
    ]:
        raise HTTPException(status_code=400, detail="Retention-check answers do not match the issued questions")

    now = datetime.now(timezone.utc)
    correct_count = 0
    total_time_ms = 0
    recent_by_fact_id = recent_attempts_by_fact(db, assessment.user_id)
    for answer, question in zip(payload.answers, questions):
        fact = db.get(Fact, question.fact_id)
        if not fact:
            raise HTTPException(status_code=404, detail="Fact not found")
        _, correct_answer = question_for_fact(fact, question.question_type)
        is_correct = normalize_answer(answer.answer) == correct_answer
        correct_count += int(is_correct)
        total_time_ms += answer.response_time_ms
        round_record.attempts.append(
            RetentionAssessmentAttempt(
                question_id=question.id,
                answer_given=answer.answer,
                correct_answer=correct_answer,
                is_correct=is_correct,
                response_time_ms=answer.response_time_ms,
            )
        )
        stat = get_or_create_stat(db, assessment.user_id, fact.id)
        state_before = learning_state(stat)
        was_due_review = review_is_due(stat, now)
        db.add(
            QuestionAttempt(
                user_id=assessment.user_id,
                fact_id=fact.id,
                question_type=question.question_type,
                prompt=question.prompt,
                answer_given=answer.answer,
                correct_answer=correct_answer,
                is_correct=is_correct,
                attempt_number=1,
                response_time_ms=answer.response_time_ms,
                mode="retention",
                was_due_review=was_due_review,
                learning_state_before=state_before,
            )
        )
        record_stat(stat, is_correct, 1, answer.response_time_ms, recent_by_fact_id.get(fact.id, []), now)

    round_record.status = "completed"
    round_record.completed_at = now
    round_record.correct_count = correct_count
    round_record.total_time_ms = total_time_ms
    if round_record.round_key == "baseline":
        assessment.baseline_completed_at = now
        assessment.week4_due_at = now + timedelta(days=28)
        assessment.week8_due_at = now + timedelta(days=56)
        assessment.status = "week4_pending"
    elif round_record.round_key == "week4":
        assessment.status = "week8_pending"
    else:
        assessment.status = "completed"
        assessment.completed_at = now

    user = get_user(db, assessment.user_id)
    user.energy = min(100, decayed_energy(user, now) + energy_gain_for_questions(assessment.question_count))
    user.total_questions_answered = (user.total_questions_answered or 0) + assessment.question_count
    user.total_sessions_completed = (user.total_sessions_completed or 0) + 1
    user.last_practised_at = now
    db.commit()
    db.refresh(assessment)
    return {"assessment": assessment_payload(assessment), "completed_round_key": round_record.round_key}


@app.get("/dashboard/{user_id}")
def dashboard(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(authenticated_user)) -> dict:
    authorize_profile(current_user, user_id)
    get_user(db, user_id)
    facts = db.scalars(select(Fact).order_by(Fact.a, Fact.b)).all()
    stats = db.scalars(select(FactStat).where(FactStat.user_id == user_id)).all()
    stats_by_fact_id = {stat.fact_id: stat for stat in stats}
    recent_by_fact_id = recent_attempts_by_fact(db, user_id)

    cells = []
    for fact in facts:
        stat = stats_by_fact_id.get(fact.id)
        avg_ms = None
        correct = incorrect = 0
        second_correct = second_total = 0
        if stat:
            correct = stat.first_attempt_correct
            incorrect = max(stat.first_attempt_total - stat.first_attempt_correct, 0)
            second_correct = stat.second_attempt_correct
            second_total = stat.second_attempt_total
            if stat.first_attempt_response_count:
                avg_ms = stat.first_attempt_response_time_ms / stat.first_attempt_response_count
            elif stat.response_count:
                avg_ms = stat.total_response_time_ms / stat.response_count
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
                "second_attempt_correct": second_correct,
                "second_attempt_total": second_total,
                "accuracy": round(correct / (correct + incorrect), 3) if correct + incorrect else None,
                "average_time_ms": round(avg_ms) if avg_ms is not None else None,
                "priority_score": round(priority_score(stat, recent_attempts=recent_by_fact_id.get(fact.id, [])), 3),
                "improvement_delta": rolling_accuracy_improvement(recent_by_fact_id.get(fact.id, [])),
                "last_seen": stat.last_seen.isoformat() if stat and stat.last_seen else None,
                "learning_state": learning_state(stat),
                "due_at": stat.due_at.isoformat() if stat and stat.due_at else None,
                "interval_days": stat.interval_days if stat else 0,
                "successful_reviews": stat.successful_reviews if stat else 0,
                "lapse_count": stat.lapse_count if stat else 0,
            }
        )

    attempted = [cell for cell in cells if cell["accuracy"] is not None]
    strengths = sorted(attempted, key=lambda item: (-(item["accuracy"] or 0), item["average_time_ms"] or 999999))[:5]
    weaknesses = sorted(attempted, key=lambda item: (-item["priority_score"], item["accuracy"] or 0))[:5]
    totals = {
        "correct": sum(cell["correct_count"] for cell in cells),
        "incorrect": sum(cell["incorrect_count"] for cell in cells),
        "second_attempt_correct": sum(cell["second_attempt_correct"] for cell in cells),
        "second_attempt_total": sum(cell["second_attempt_total"] for cell in cells),
    }
    total_answers = totals["correct"] + totals["incorrect"]
    totals["accuracy"] = round(totals["correct"] / total_answers, 3) if total_answers else None

    table_stats = []
    for table in range(2, 13):
        table_cells = [cell for cell in cells if cell["a"] == table]
        correct = sum(cell["correct_count"] for cell in table_cells)
        incorrect = sum(cell["incorrect_count"] for cell in table_cells)
        table_fact_ids = {cell["fact_id"] for cell in table_cells}
        speed_total = sum(
            stat.first_attempt_response_time_ms
            for stat in stats
            if stat.fact_id in table_fact_ids and stat.first_attempt_response_count
        )
        speed_count = sum(
            stat.first_attempt_response_count
            for stat in stats
            if stat.fact_id in table_fact_ids and stat.first_attempt_response_count
        )
        total = correct + incorrect
        table_stats.append(
            {
                "table": table,
                "accuracy": round(correct / total, 3) if total else None,
                "average_time_ms": round(speed_total / speed_count) if speed_count else None,
                "answers": total,
                "secure_facts": sum(1 for cell in table_cells if cell["learning_state"] == "secure"),
                "due_facts": sum(
                    1
                    for cell in table_cells
                    if stats_by_fact_id.get(cell["fact_id"]) and review_is_due(stats_by_fact_id[cell["fact_id"]])
                ),
            }
        )

    needing_exposure = sorted(
        cells,
        key=lambda item: ((item["correct_count"] + item["incorrect_count"]), item["last_seen"] or ""),
    )[:8]
    improving = sorted(
        [cell for cell in cells if cell["improvement_delta"] is not None and cell["improvement_delta"] > 0],
        key=lambda item: (-item["improvement_delta"], -((item["accuracy"] or 0))),
    )[:8]
    recent_attempts = db.scalars(
        select(QuestionAttempt).where(QuestionAttempt.user_id == user_id).order_by(desc(QuestionAttempt.created_at)).limit(12)
    ).all()
    recent_history = [
        {
            "prompt": attempt.prompt,
            "is_correct": attempt.is_correct,
            "response_time_ms": attempt.response_time_ms,
            "mode": attempt.mode,
            "created_at": attempt.created_at.isoformat(),
        }
        for attempt in recent_attempts
    ]
    progress_attempts = db.scalars(
        select(QuestionAttempt)
        .where(QuestionAttempt.user_id == user_id, QuestionAttempt.attempt_number == 1)
        .order_by(desc(QuestionAttempt.created_at))
        .limit(5000)
    ).all()
    daily: dict[str, dict[str, int]] = defaultdict(lambda: {"attempts": 0, "correct": 0, "total_time_ms": 0})
    for attempt in progress_attempts:
        day = local_date(attempt.created_at).isoformat()
        daily[day]["attempts"] += 1
        daily[day]["correct"] += int(attempt.is_correct)
        daily[day]["total_time_ms"] += attempt.response_time_ms
    progress_over_time = [
        {
            "date": day,
            "attempts": values["attempts"],
            "correct": values["correct"],
            "accuracy": round(values["correct"] / values["attempts"], 3),
            "average_time_ms": round(values["total_time_ms"] / values["attempts"]),
        }
        for day, values in sorted(daily.items())[-30:]
    ]
    due_review_attempts = list(
        db.scalars(
            select(QuestionAttempt).where(
                QuestionAttempt.user_id == user_id,
                QuestionAttempt.attempt_number == 1,
                QuestionAttempt.was_due_review == True,  # noqa: E712
                QuestionAttempt.created_at >= datetime.now(timezone.utc) - timedelta(days=30),
            )
        ).all()
    )
    return {
        "totals": totals,
        "cells": cells,
        "strengths": strengths,
        "weaknesses": weaknesses,
        "table_stats": table_stats,
        "needing_exposure": needing_exposure,
        "improving": improving,
        "recent_history": recent_history,
        "progress_over_time": progress_over_time,
        "retention": retention_summary(facts, stats_by_fact_id, due_review_attempts),
        "retention_assessments": [
            assessment_payload(item) for item in retention_assessments_for_user(db, user_id)[:5]
        ],
    }
