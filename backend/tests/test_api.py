from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.adaptive import question_for_fact
from app.database import Base, get_db
from app.main import _login_failures, app
from app.models import Fact, LearningSession, LearningSessionQuestion, User
from app.seed import seed_facts


@pytest.fixture()
def api(tmp_path: Path):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'test.db'}",
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(dbapi_connection, _connection_record):
        dbapi_connection.execute("PRAGMA foreign_keys=ON")

    testing_session = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    Base.metadata.create_all(engine)
    with testing_session() as db:
        seed_facts(db)

    def override_db():
        db = testing_session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_db
    client = TestClient(app)
    yield client, testing_session
    app.dependency_overrides.clear()
    engine.dispose()


def create_admin(client: TestClient) -> dict:
    response = client.post("/users", json={"name": "Parent", "password": "246824"})
    assert response.status_code == 200
    return response.json()


def login(client: TestClient, user_id: int, password: str = "") -> None:
    response = client.post("/auth/login", json={"user_id": user_id, "password": password})
    assert response.status_code == 200


def test_admin_routes_require_the_logged_in_admin(api) -> None:
    client, _ = api
    admin = create_admin(client)

    assert client.get(f"/admin/{admin['id']}/users").status_code == 401
    assert client.post("/auth/login", json={"user_id": admin["id"], "password": "wrong"}).status_code == 401

    login(client, admin["id"], "246824")
    child = client.post(f"/admin/{admin['id']}/users", json={"name": "Learner"}).json()
    assert client.get(f"/admin/{admin['id']}/users").status_code == 200

    client.post("/auth/logout")
    login(client, child["id"])
    assert client.get(f"/admin/{admin['id']}/users").status_code == 403
    assert client.get(f"/dashboard/{admin['id']}").status_code == 403


def test_first_admin_requires_a_passcode(api) -> None:
    client, _ = api
    response = client.post("/users", json={"name": "Parent"})
    assert response.status_code == 400
    assert "at least 6" in response.json()["detail"]


def test_admin_backup_is_a_sqlite_snapshot(api) -> None:
    client, _ = api
    admin = create_admin(client)
    login(client, admin["id"], "246824")

    response = client.get(f"/admin/{admin['id']}/backup")
    assert response.status_code == 200
    assert response.headers["content-disposition"].endswith('filename="recall-forge-backup.db"')
    assert response.content.startswith(b"SQLite format 3\x00")


def test_admin_promotion_requires_a_passcode(api) -> None:
    client, _ = api
    admin = create_admin(client)
    login(client, admin["id"], "246824")
    child = client.post(f"/admin/{admin['id']}/users", json={"name": "Learner"}).json()

    response = client.patch(
        f"/admin/{admin['id']}/users/{child['id']}",
        json={"is_admin": True},
    )
    assert response.status_code == 400


def test_admin_required_tables_are_locked_into_child_sessions(api) -> None:
    client, testing_session = api
    admin = create_admin(client)
    login(client, admin["id"], "246824")
    child = client.post(f"/admin/{admin['id']}/users", json={"name": "Learner"}).json()

    updated = client.put(
        f"/admin/{admin['id']}/users/{child['id']}/required-tables",
        json={"tables": [7, 4, 7]},
    )
    assert updated.status_code == 200
    assert updated.json()["required_tables"] == [4, 7]

    client.post("/auth/logout")
    login(client, child["id"])
    assert client.put(
        f"/admin/{admin['id']}/users/{child['id']}/required-tables",
        json={"tables": []},
    ).status_code == 403

    started = client.post(
        "/practice/start",
        json={"user_id": child["id"], "tables": [2], "question_mode": "mixed", "question_count": 1},
    )
    assert started.status_code == 200
    with testing_session() as db:
        session = db.get(LearningSession, started.json()["session_id"])
        assert session.selected_tables == "2,4,7"


def test_practice_session_awards_once_for_an_issued_question(api) -> None:
    client, testing_session = api
    admin = create_admin(client)
    login(client, admin["id"], "246824")

    started = client.post(
        "/practice/start",
        json={"user_id": admin["id"], "tables": [6], "question_mode": "mixed", "question_count": 1},
    ).json()
    question = client.post("/practice/question", json={"session_id": started["session_id"]}).json()
    with testing_session() as db:
        record = db.get(LearningSessionQuestion, question["question_id"])
        fact = db.get(Fact, record.fact_id)
        _, correct_answer = question_for_fact(fact, record.question_type)

    answer_payload = {
        "session_id": started["session_id"],
        "question_id": question["question_id"],
        "answer": str(correct_answer),
        "response_time_ms": 900,
    }
    completed = client.post("/practice/answer", json=answer_payload)
    assert completed.status_code == 200
    assert completed.json()["session_complete"] is True
    assert completed.json()["creature"]["xp_gained"] > 0

    assert client.post("/practice/answer", json=answer_payload).status_code == 409
    with testing_session() as db:
        user = db.get(User, admin["id"])
        assert user.total_sessions_completed == 1
        assert user.total_questions_answered == 1


def test_discovery_quest_can_unlock_temporary_mega_form(api) -> None:
    client, testing_session = api
    admin = create_admin(client)
    login(client, admin["id"], "246824")
    quests = client.get(f"/users/{admin['id']}/quests").json()["quests"]
    discovery = next(quest for quest in quests if quest["quest_type"] == "discovery")
    started = client.post(f"/users/{admin['id']}/quests/{discovery['quest_id']}/start").json()
    final_response = None

    for index, question in enumerate(started["questions"]):
        with testing_session() as db:
            record = db.get(LearningSessionQuestion, question["question_id"])
            fact = db.get(Fact, record.fact_id)
            _, correct_answer = question_for_fact(fact, record.question_type)
        answer = str(correct_answer) if index < len(started["questions"]) / 2 else "9999"
        final_response = client.post(
            "/practice/answer",
            json={
                "session_id": started["session_id"],
                "question_id": question["question_id"],
                "answer": answer,
                "response_time_ms": 900,
            },
        )
        if answer == "9999":
            final_response = client.post(
                "/practice/answer",
                json={
                    "session_id": started["session_id"],
                    "question_id": question["question_id"],
                    "answer": "9999",
                    "response_time_ms": 700,
                },
            )

    assert final_response is not None
    result = final_response.json()
    assert result["session_complete"] is True
    assert result["creature"]["mega_evolution_unlocked"] is True
    assert result["creature"]["mega_evolution_active"] is True
    assert result["creature"]["xp_gained"] >= 60


def test_dashboard_keeps_first_recall_and_second_try_recovery_separate(api) -> None:
    client, testing_session = api
    admin = create_admin(client)
    login(client, admin["id"], "246824")
    started = client.post(
        "/practice/start",
        json={"user_id": admin["id"], "tables": [6], "question_mode": "mixed", "question_count": 1},
    ).json()
    question = client.post("/practice/question", json={"session_id": started["session_id"]}).json()
    with testing_session() as db:
        record = db.get(LearningSessionQuestion, question["question_id"])
        fact = db.get(Fact, record.fact_id)
        _, correct_answer = question_for_fact(fact, record.question_type)

    first = client.post(
        "/practice/answer",
        json={"session_id": started["session_id"], "question_id": question["question_id"], "answer": "9999", "response_time_ms": 1500},
    )
    assert first.json()["question_complete"] is False
    second = client.post(
        "/practice/answer",
        json={"session_id": started["session_id"], "question_id": question["question_id"], "answer": str(correct_answer), "response_time_ms": 700},
    )
    assert second.json()["session_complete"] is True

    totals = client.get(f"/dashboard/{admin['id']}").json()["totals"]
    assert totals["correct"] == 0
    assert totals["incorrect"] == 1
    assert totals["accuracy"] == 0
    assert totals["second_attempt_correct"] == 1


def test_challenge_rejects_answers_not_matching_issued_order(api) -> None:
    client, _ = api
    admin = create_admin(client)
    login(client, admin["id"], "246824")
    started = client.post(
        "/challenge/start",
        json={"user_id": admin["id"], "tables": [4], "question_mode": "mixed", "question_count": 2},
    ).json()
    reversed_questions = list(reversed(started["questions"]))
    response = client.post(
        "/challenge/submit",
        json={
            "session_id": started["session_id"],
            "answers": [
                {"question_id": question["question_id"], "answer": "0", "response_time_ms": 500}
                for question in reversed_questions
            ],
        },
    )
    assert response.status_code == 400


def test_challenge_avoids_repeating_facts_while_pool_is_available(api) -> None:
    client, _ = api
    admin = create_admin(client)
    login(client, admin["id"], "246824")

    started = client.post(
        "/challenge/start",
        json={"user_id": admin["id"], "tables": [4], "question_mode": "mixed", "question_count": 10},
    ).json()

    assert len({question["fact_id"] for question in started["questions"]}) == 10


def test_login_is_rate_limited_after_repeated_failures(api) -> None:
    client, _ = api
    admin = create_admin(client)
    try:
        for _ in range(5):
            assert client.post("/auth/login", json={"user_id": admin["id"], "password": "wrong"}).status_code == 401
        assert client.post("/auth/login", json={"user_id": admin["id"], "password": "wrong"}).status_code == 429
    finally:
        _login_failures.clear()
