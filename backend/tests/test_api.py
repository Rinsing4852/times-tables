from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.adaptive import question_for_fact
from app.database import Base, get_db
from app.main import _login_failures, app
from app.models import Fact, LearningSession, LearningSessionQuestion, RetentionAssessment, RetentionAssessmentQuestion, User
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

    dashboard = client.get(f"/dashboard/{admin['id']}").json()
    assert dashboard["retention"]["state_counts"]["acquiring"] == 1
    assert dashboard["retention"]["review_accuracy_7_days"]["accuracy"] is None


def test_evaluation_export_is_aggregate_and_omits_identity_and_answers(api) -> None:
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
    client.post(
        "/practice/answer",
        json={
            "session_id": started["session_id"],
            "question_id": question["question_id"],
            "answer": str(correct_answer),
            "response_time_ms": 1200,
        },
    )

    response = client.get(f"/admin/{admin['id']}/evaluation.csv")

    assert response.status_code == 200
    assert "profile_key,date,first_attempts" in response.text
    assert "Parent" not in response.text
    assert question["prompt"] not in response.text
    assert str(correct_answer) not in response.text.splitlines()[0]


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


def test_retention_check_repeats_the_fixed_test_at_four_and_eight_weeks(api) -> None:
    client, testing_session = api
    admin = create_admin(client)
    login(client, admin["id"], "246824")

    created_response = client.post(
        "/retention-assessments",
        json={"user_id": admin["id"], "tables": [4], "question_count": 5, "question_mode": "multiply"},
    )
    assert created_response.status_code == 200
    created = created_response.json()
    assert created["next_round_key"] == "baseline"
    assert created["can_start"] is True

    baseline = client.post(f"/retention-assessments/{created['assessment_id']}/start").json()
    baseline_prompts = [question["prompt"] for question in baseline["questions"]]
    baseline_answers = []
    with testing_session() as db:
        for index, question in enumerate(baseline["questions"]):
            record = db.get(RetentionAssessmentQuestion, question["question_id"])
            fact = db.get(Fact, record.fact_id)
            _, answer = question_for_fact(fact, record.question_type)
            baseline_answers.append(
                {
                    "question_id": question["question_id"],
                    "answer": str(answer) if index < 3 else "9999",
                    "response_time_ms": 3000,
                }
            )
    baseline_result = client.post(
        f"/retention-assessments/{created['assessment_id']}/submit",
        json={"round_id": baseline["round_id"], "answers": baseline_answers},
    )
    assert baseline_result.status_code == 200
    baseline_summary = baseline_result.json()["assessment"]
    assert baseline_summary["status"] == "week4_pending"
    assert baseline_summary["rounds"][0]["accuracy"] == 0.6
    assert baseline_summary["rounds"][0]["average_time_ms"] == 3000
    assert baseline_summary["rounds"][0]["median_time_ms"] == 3000
    baseline_completed_at = datetime.fromisoformat(baseline_summary["baseline_completed_at"])
    assert datetime.fromisoformat(baseline_summary["week4_due_at"]) - baseline_completed_at == timedelta(days=28)
    assert datetime.fromisoformat(baseline_summary["week8_due_at"]) - baseline_completed_at == timedelta(days=56)
    assert client.post(f"/retention-assessments/{created['assessment_id']}/start").status_code == 409

    with testing_session() as db:
        assessment = db.get(RetentionAssessment, created["assessment_id"])
        assessment.week4_due_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.commit()

    week4 = client.post(f"/retention-assessments/{created['assessment_id']}/start").json()
    assert [question["prompt"] for question in week4["questions"]] == baseline_prompts
    week4_answers = [
        {
            "question_id": question["question_id"],
            "answer": baseline_answers[index]["answer"] if index < 3 else ("9999" if index == 4 else str(4 * (index + 2))),
            "response_time_ms": 2000,
        }
        for index, question in enumerate(week4["questions"])
    ]
    # Resolve the fourth answer from the stored fixed question so the round improves to four correct.
    with testing_session() as db:
        record = db.get(RetentionAssessmentQuestion, week4["questions"][3]["question_id"])
        fact = db.get(Fact, record.fact_id)
        _, answer = question_for_fact(fact, record.question_type)
        week4_answers[3]["answer"] = str(answer)
    week4_result = client.post(
        f"/retention-assessments/{created['assessment_id']}/submit",
        json={"round_id": week4["round_id"], "answers": week4_answers},
    ).json()["assessment"]
    week4_summary = next(item for item in week4_result["rounds"] if item["round_key"] == "week4")
    assert week4_summary["accuracy"] == 0.8
    assert week4_summary["accuracy_change"] == 0.2
    assert week4_summary["average_time_change_ms"] == -1000

    with testing_session() as db:
        assessment = db.get(RetentionAssessment, created["assessment_id"])
        assessment.week8_due_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.commit()
    week8 = client.post(f"/retention-assessments/{created['assessment_id']}/start").json()
    assert [question["prompt"] for question in week8["questions"]] == baseline_prompts

    week8_answers = []
    with testing_session() as db:
        for question in week8["questions"]:
            record = db.get(RetentionAssessmentQuestion, question["question_id"])
            fact = db.get(Fact, record.fact_id)
            _, answer = question_for_fact(fact, record.question_type)
            week8_answers.append(
                {"question_id": question["question_id"], "answer": str(answer), "response_time_ms": 1000}
            )
    week8_result = client.post(
        f"/retention-assessments/{created['assessment_id']}/submit",
        json={"round_id": week8["round_id"], "answers": week8_answers},
    ).json()["assessment"]
    assert week8_result["status"] == "completed"
    week8_summary = next(item for item in week8_result["rounds"] if item["round_key"] == "week8")
    assert week8_summary["accuracy"] == 1
    assert week8_summary["accuracy_change"] == 0.4
    assert week8_summary["average_time_change_ms"] == -2000

    dashboard = client.get(f"/dashboard/{admin['id']}").json()
    assert dashboard["retention_assessments"][0]["status"] == "completed"
    assert client.post(f"/admin/{admin['id']}/users/{admin['id']}/reset-progress").status_code == 200
    assert client.get(f"/users/{admin['id']}/retention-assessments").json()["assessments"] == []


def test_only_an_admin_can_schedule_a_retention_check(api) -> None:
    client, _ = api
    admin = create_admin(client)
    login(client, admin["id"], "246824")
    child = client.post(f"/admin/{admin['id']}/users", json={"name": "Learner"}).json()
    client.post("/auth/logout")
    login(client, child["id"])

    response = client.post(
        "/retention-assessments",
        json={"user_id": child["id"], "tables": [4], "question_count": 10, "question_mode": "multiply"},
    )
    assert response.status_code == 403
    assert client.get(f"/users/{admin['id']}/retention-assessments").status_code == 403


def test_login_is_rate_limited_after_repeated_failures(api) -> None:
    client, _ = api
    admin = create_admin(client)
    try:
        for _ in range(5):
            assert client.post("/auth/login", json={"user_id": admin["id"], "password": "wrong"}).status_code == 401
        assert client.post("/auth/login", json={"user_id": admin["id"], "password": "wrong"}).status_code == 429
    finally:
        _login_failures.clear()
