from sqlalchemy import create_engine, inspect, text

from app.migrations import run_migrations


def test_migrations_upgrade_legacy_schema_and_are_repeatable(tmp_path) -> None:
    engine = create_engine(f"sqlite:///{tmp_path / 'legacy.db'}")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY, name VARCHAR(80), created_at DATETIME)"))
        connection.execute(text("INSERT INTO users (id, name, created_at) VALUES (1, 'Parent', CURRENT_TIMESTAMP)"))
        connection.execute(
            text(
                "CREATE TABLE fact_stats (id INTEGER PRIMARY KEY, user_id INTEGER, fact_id INTEGER, "
                "correct_count INTEGER DEFAULT 0, incorrect_count INTEGER DEFAULT 0)"
            )
        )
        connection.execute(
            text(
                "CREATE TABLE question_attempts (id INTEGER PRIMARY KEY, user_id INTEGER, fact_id INTEGER, created_at DATETIME)"
            )
        )

    run_migrations(engine)
    run_migrations(engine)

    inspector = inspect(engine)
    user_columns = {column["name"] for column in inspector.get_columns("users")}
    stat_columns = {column["name"] for column in inspector.get_columns("fact_stats")}
    with engine.connect() as connection:
        versions = connection.execute(text("SELECT version FROM schema_migrations ORDER BY version")).scalars().all()
        is_admin = connection.execute(text("SELECT is_admin FROM users WHERE id = 1")).scalar_one()

    assert {"creature_type", "energy", "xp", "is_admin", "required_tables", "mega_evolution_until"}.issubset(user_columns)
    assert {
        "first_attempt_response_time_ms",
        "first_attempt_response_count",
        "learning_state",
        "due_at",
        "interval_days",
        "successful_reviews",
        "lapse_count",
        "last_retrieval_at",
    }.issubset(stat_columns)
    attempt_columns = {column["name"] for column in inspector.get_columns("question_attempts")}
    assert {"was_due_review", "learning_state_before"}.issubset(attempt_columns)
    assert {
        "retention_assessments",
        "retention_assessment_questions",
        "retention_assessment_rounds",
        "retention_assessment_attempts",
    }.issubset(set(inspector.get_table_names()))
    assert versions == [1, 2, 3, 4, 5, 6]
    assert is_admin == 1
