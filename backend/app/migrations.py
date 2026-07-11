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


MIGRATIONS: list[Migration] = [
    (1, _add_missing_user_columns),
    (2, _add_first_attempt_speed_columns),
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
