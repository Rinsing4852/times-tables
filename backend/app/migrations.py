from __future__ import annotations

from collections.abc import Callable

from sqlalchemy import Engine, inspect, text


Migration = tuple[int, Callable[[Engine], None]]


def _add_missing_user_columns(engine: Engine) -> None:
    inspector = inspect(engine)
    if not inspector.has_table("users"):
        return
    existing = {column["name"] for column in inspector.get_columns("users")}
    columns = {
        "creature_type": "ALTER TABLE users ADD COLUMN creature_type VARCHAR(32) NOT NULL DEFAULT 'Blob'",
        "is_admin": "ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT 0",
        "password_hash": "ALTER TABLE users ADD COLUMN password_hash VARCHAR(128)",
        "password_salt": "ALTER TABLE users ADD COLUMN password_salt VARCHAR(32)",
        "password_updated_at": "ALTER TABLE users ADD COLUMN password_updated_at DATETIME",
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
        "required_tables": "ALTER TABLE users ADD COLUMN required_tables VARCHAR(64) NOT NULL DEFAULT '[]'",
        "mega_evolution_until": "ALTER TABLE users ADD COLUMN mega_evolution_until DATETIME",
    }
    with engine.begin() as connection:
        for name, statement in columns.items():
            if name not in existing:
                connection.execute(text(statement))
        connection.execute(
            text(
                "UPDATE users SET is_admin = 1 WHERE id = (SELECT id FROM users ORDER BY created_at, id LIMIT 1) "
                "AND NOT EXISTS (SELECT 1 FROM users WHERE is_admin = 1)"
            )
        )


def _add_first_attempt_speed_columns(engine: Engine) -> None:
    inspector = inspect(engine)
    if not inspector.has_table("fact_stats"):
        return
    existing = {column["name"] for column in inspector.get_columns("fact_stats")}
    with engine.begin() as connection:
        if "first_attempt_response_time_ms" not in existing:
            connection.execute(text("ALTER TABLE fact_stats ADD COLUMN first_attempt_response_time_ms INTEGER NOT NULL DEFAULT 0"))
        if "first_attempt_response_count" not in existing:
            connection.execute(text("ALTER TABLE fact_stats ADD COLUMN first_attempt_response_count INTEGER NOT NULL DEFAULT 0"))
        if {"total_response_time_ms", "response_count"}.issubset(existing):
            connection.execute(
                text(
                    "UPDATE fact_stats SET first_attempt_response_time_ms = total_response_time_ms, "
                    "first_attempt_response_count = response_count WHERE first_attempt_response_count = 0"
                )
            )
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_question_attempts_user_fact_created ON question_attempts (user_id, fact_id, created_at)"))


def _add_training_policy_columns(engine: Engine) -> None:
    inspector = inspect(engine)
    if not inspector.has_table("users"):
        return
    existing = {column["name"] for column in inspector.get_columns("users")}
    with engine.begin() as connection:
        if "required_tables" not in existing:
            connection.execute(text("ALTER TABLE users ADD COLUMN required_tables VARCHAR(64) NOT NULL DEFAULT '[]'"))
        if "mega_evolution_until" not in existing:
            connection.execute(text("ALTER TABLE users ADD COLUMN mega_evolution_until DATETIME"))


def _add_fact_learning_state(engine: Engine) -> None:
    inspector = inspect(engine)
    if inspector.has_table("fact_stats"):
        existing_stats = {column["name"] for column in inspector.get_columns("fact_stats")}
        stat_columns = {
            "learning_state": "ALTER TABLE fact_stats ADD COLUMN learning_state VARCHAR(16) NOT NULL DEFAULT 'unseen'",
            "due_at": "ALTER TABLE fact_stats ADD COLUMN due_at DATETIME",
            "interval_days": "ALTER TABLE fact_stats ADD COLUMN interval_days INTEGER NOT NULL DEFAULT 0",
            "successful_reviews": "ALTER TABLE fact_stats ADD COLUMN successful_reviews INTEGER NOT NULL DEFAULT 0",
            "lapse_count": "ALTER TABLE fact_stats ADD COLUMN lapse_count INTEGER NOT NULL DEFAULT 0",
            "last_retrieval_at": "ALTER TABLE fact_stats ADD COLUMN last_retrieval_at DATETIME",
        }
        with engine.begin() as connection:
            for name, statement in stat_columns.items():
                if name not in existing_stats:
                    connection.execute(text(statement))
            learning_columns = {"first_attempt_total", "first_attempt_correct", "current_streak", "last_seen"}
            if learning_columns.issubset(existing_stats):
                connection.execute(
                    text(
                        "UPDATE fact_stats SET learning_state = CASE "
                        "WHEN first_attempt_total >= 5 AND first_attempt_correct * 1.0 / first_attempt_total >= 0.8 "
                        "AND current_streak >= 2 THEN 'reviewing' ELSE 'acquiring' END, "
                        "last_retrieval_at = COALESCE(last_retrieval_at, last_seen), "
                        "interval_days = CASE WHEN first_attempt_total >= 5 AND first_attempt_correct * 1.0 / first_attempt_total >= 0.8 "
                        "AND current_streak >= 2 THEN MAX(interval_days, 1) ELSE interval_days END, "
                        "due_at = CASE WHEN first_attempt_total >= 5 AND first_attempt_correct * 1.0 / first_attempt_total >= 0.8 "
                        "AND current_streak >= 2 AND due_at IS NULL THEN datetime(last_seen, '+1 day') ELSE due_at END "
                        "WHERE first_attempt_total > 0 AND learning_state = 'unseen'"
                    )
                )
            elif {"correct_count", "incorrect_count"}.issubset(existing_stats):
                connection.execute(
                    text(
                        "UPDATE fact_stats SET learning_state = 'acquiring' "
                        "WHERE correct_count + incorrect_count > 0 AND learning_state = 'unseen'"
                    )
                )
            connection.execute(text("CREATE INDEX IF NOT EXISTS ix_fact_stats_user_due ON fact_stats (user_id, due_at)"))

    inspector = inspect(engine)
    if inspector.has_table("question_attempts"):
        existing_attempts = {column["name"] for column in inspector.get_columns("question_attempts")}
        with engine.begin() as connection:
            if "was_due_review" not in existing_attempts:
                connection.execute(text("ALTER TABLE question_attempts ADD COLUMN was_due_review BOOLEAN NOT NULL DEFAULT 0"))
            if "learning_state_before" not in existing_attempts:
                connection.execute(
                    text("ALTER TABLE question_attempts ADD COLUMN learning_state_before VARCHAR(16) NOT NULL DEFAULT 'unseen'")
                )
            connection.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_question_attempts_user_due_created "
                    "ON question_attempts (user_id, was_due_review, created_at)"
                )
            )


def _create_retention_assessment_tables(engine: Engine) -> None:
    statements = [
        """CREATE TABLE IF NOT EXISTS retention_assessments (
            id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            selected_tables VARCHAR(64) NOT NULL, question_mode VARCHAR(16) NOT NULL DEFAULT 'multiply',
            question_count INTEGER NOT NULL, status VARCHAR(24) NOT NULL DEFAULT 'baseline_ready',
            baseline_completed_at DATETIME, week4_due_at DATETIME, week8_due_at DATETIME,
            completed_at DATETIME, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)""",
        """CREATE TABLE IF NOT EXISTS retention_assessment_questions (
            id INTEGER PRIMARY KEY, assessment_id INTEGER NOT NULL REFERENCES retention_assessments(id) ON DELETE CASCADE,
            position INTEGER NOT NULL, fact_id INTEGER NOT NULL REFERENCES facts(id),
            question_type VARCHAR(32) NOT NULL, prompt VARCHAR(80) NOT NULL,
            CONSTRAINT uq_retention_assessment_position UNIQUE (assessment_id, position))""",
        """CREATE TABLE IF NOT EXISTS retention_assessment_rounds (
            id INTEGER PRIMARY KEY, assessment_id INTEGER NOT NULL REFERENCES retention_assessments(id) ON DELETE CASCADE,
            round_key VARCHAR(16) NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'active', due_at DATETIME,
            started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, completed_at DATETIME,
            total_time_ms INTEGER NOT NULL DEFAULT 0, correct_count INTEGER NOT NULL DEFAULT 0,
            CONSTRAINT uq_retention_assessment_round UNIQUE (assessment_id, round_key))""",
        """CREATE TABLE IF NOT EXISTS retention_assessment_attempts (
            id INTEGER PRIMARY KEY, round_id INTEGER NOT NULL REFERENCES retention_assessment_rounds(id) ON DELETE CASCADE,
            question_id INTEGER NOT NULL REFERENCES retention_assessment_questions(id) ON DELETE CASCADE,
            answer_given VARCHAR(32) NOT NULL, correct_answer INTEGER NOT NULL, is_correct BOOLEAN NOT NULL,
            response_time_ms INTEGER NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_retention_round_question UNIQUE (round_id, question_id))""",
        "CREATE INDEX IF NOT EXISTS ix_retention_assessments_user ON retention_assessments (user_id)",
        "CREATE INDEX IF NOT EXISTS ix_retention_questions_assessment ON retention_assessment_questions (assessment_id)",
        "CREATE INDEX IF NOT EXISTS ix_retention_rounds_assessment ON retention_assessment_rounds (assessment_id)",
        "CREATE INDEX IF NOT EXISTS ix_retention_attempts_round ON retention_assessment_attempts (round_id)",
    ]
    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))


def _add_retention_active_index(engine: Engine) -> None:
    if not inspect(engine).has_table("retention_assessments"):
        return
    with engine.begin() as connection:
        connection.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_retention_active_user "
                "ON retention_assessments (user_id) WHERE status != 'completed'"
            )
        )


MIGRATIONS: list[Migration] = [
    (1, _add_missing_user_columns),
    (2, _add_first_attempt_speed_columns),
    (3, _add_training_policy_columns),
    (4, _add_fact_learning_state),
    (5, _create_retention_assessment_tables),
    (6, _add_retention_active_index),
]


def run_migrations(engine: Engine) -> None:
    with engine.begin() as connection:
        connection.execute(
            text(
                "CREATE TABLE IF NOT EXISTS schema_migrations ("
                "version INTEGER PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)"
            )
        )
        applied = {row[0] for row in connection.execute(text("SELECT version FROM schema_migrations"))}

    for version, migration in MIGRATIONS:
        if version in applied:
            continue
        migration(engine)
        with engine.begin() as connection:
            connection.execute(text("INSERT INTO schema_migrations (version) VALUES (:version)"), {"version": version})
