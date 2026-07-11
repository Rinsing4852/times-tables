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

    assert {"creature_type", "energy", "xp", "is_admin"}.issubset(user_columns)
    assert {"first_attempt_response_time_ms", "first_attempt_response_count"}.issubset(stat_columns)
    assert versions == [1, 2]
    assert is_admin == 1
