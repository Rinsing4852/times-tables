from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.adaptive import question_for_fact
from app.config import local_date
from app.database import Base, get_db
from app.main import _login_failures, app
from app.models import (
    Fact,
    FactStat,
    LearningSession,
    LearningSessionQuestion,
    QuestionAttempt,
    RetentionAssessment,
    RetentionAssessmentQuestion,
    User,
)
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
    assert updated.json()["selected_tables"] == [4, 7]

    client.post("/auth/logout")
    login(client, child["id"])
    assert client.put(
        f"/admin/{admin['id']}/users/{child['id']}/required-tables",
        json={"tables": []},
    ).status_code == 403

    selected = client.put(
        f"/users/{child['id']}/selected-tables",
        json={"tables": [2, 4]},
    )
    assert selected.status_code == 200
    assert selected.json()["selected_tables"] == [2, 4, 7]
    assert client.get("/auth/me").json()["selected_tables"] == [2, 4, 7]

    started = client.post(
        "/practice/start",
        json={"user_id": child["id"], "tables": [2, 4, 7], "question_mode": "mixed", "question_count": 1},
    )
    assert started.status_code == 200
    with testing_session() as db:
        session = db.get(LearningSession, started.json()["session_id"])
        assert session.selected_tables == "2,4,7"


def test_learner_cannot_change_another_profiles_table_choices(api) -> None:
    client, _ = api
    admin = create_admin(client)
    login(client, admin["id"], "246824")
    first = client.post(f"/admin/{admin['id']}/users", json={"name": "First learner"}).json()
    second = client.post(f"/admin/{admin['id']}/users", json={"name": "Second learner"}).json()

    client.post("/auth/logout")
    login(client, first["id"])
    response = client.put(f"/users/{second['id']}/selected-tables", json={"tables": [8]})

    assert response.status_code == 403


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


def test_quests_only_target_the_profiles_selected_tables(api) -> None:
    client, testing_session = api
    admin = create_admin(client)
    login(client, admin["id"], "246824")
    selected = client.put(f"/users/{admin['id']}/selected-tables", json={"tables": [7]})
    assert selected.status_code == 200

    quests = client.get(f"/users/{admin['id']}/quests").json()["quests"]
    target_ids = {fact_id for quest in quests for fact_id in quest["target_fact_ids"]}
    with testing_session() as db:
        target_tables = {db.get(Fact, fact_id).a for fact_id in target_ids}

    assert target_tables == {7}


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


def test_challenge_answers_are_saved_and_can_resume(api) -> None:
    client, _ = api
    admin = create_admin(client)
    login(client, admin["id"], "246824")
    started = client.post(
        "/challenge/start",
        json={"user_id": admin["id"], "tables": [4], "question_mode": "mixed", "question_count": 2},
    ).json()
    first = started["questions"][0]
    saved = client.post(
        "/challenge/answer",
        json={"session_id": started["session_id"], "question_id": first["question_id"], "answer": "12", "response_time_ms": 1400},
    )
    assert saved.status_code == 200
    resumed = client.get(f"/challenge/{started['session_id']}").json()
    assert resumed["saved_answers"] == [
        {"question_id": first["question_id"], "answer": "12", "response_time_ms": 1400}
    ]
    second = started["questions"][1]
    client.post(
        "/challenge/answer",
        json={"session_id": started["session_id"], "question_id": second["question_id"], "answer": "16", "response_time_ms": 1500},
    )
    submitted = client.post(
        "/challenge/submit",
        json={
            "session_id": started["session_id"],
            "answers": [
                {"question_id": first["question_id"], "answer": "12", "response_time_ms": 1400},
                {"question_id": second["question_id"], "answer": "16", "response_time_ms": 1500},
            ],
        },
    )
    assert submitted.status_code == 200
    assert submitted.json()["question_count"] == 2


def test_question_mode_is_saved_per_profile(api) -> None:
    client, _ = api
    admin = create_admin(client)
    login(client, admin["id"], "246824")
    updated = client.put(f"/users/{admin['id']}/question-mode", json={"question_mode": "division"})
    assert updated.status_code == 200
    assert updated.json()["question_mode"] == "division"
    assert client.get("/auth/me").json()["question_mode"] == "division"


def test_dashboard_speed_uses_recent_median_and_has_weekly_summary(api) -> None:
    client, testing_session = api
    admin = create_admin(client)
    login(client, admin["id"], "246824")
    with testing_session() as db:
        fact = db.query(Fact).filter(Fact.a == 4, Fact.b == 7).one()
        db.add(
            FactStat(
                user_id=admin["id"],
                fact_id=fact.id,
                first_attempt_correct=3,
                first_attempt_total=3,
                first_attempt_response_time_ms=903000,
                first_attempt_response_count=3,
            )
        )
        for response_time_ms in (1000, 2000, 900000):
            db.add(
                QuestionAttempt(
                    user_id=admin["id"],
                    fact_id=fact.id,
                    question_type="multiply_ab",
                    prompt="4 x 7 = ?",
                    answer_given="28",
                    correct_answer=28,
                    is_correct=True,
                    attempt_number=1,
                    response_time_ms=response_time_ms,
                    mode="practice",
                )
            )
        db.commit()
    dashboard = client.get(f"/dashboard/{admin['id']}").json()
    cell = next(item for item in dashboard["cells"] if item["a"] == 4 and item["b"] == 7)
    assert cell["average_time_ms"] == 2000
    assert dashboard["weekly_summary"]["answers"] == 3
    assert dashboard["weekly_summary"]["median_time_ms"] == 2000
    table_mastery = next(item for item in dashboard["table_mastery"] if item["table"] == 4)
    assert table_mastery["recent_accuracy"] == 1.0
    assert table_mastery["recent_median_time_ms"] == 2000
    assert dashboard["next_session"]["action"] == "practice"
    assert dashboard["next_session"]["tables"]


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
    assert baseline_summary["rounds"][0]["table_results"] == [
        {
            "table": 4,
            "questions": 5,
            "correct": 3,
            "accuracy": 0.6,
            "median_time_ms": 3000,
            "accuracy_change": None,
            "median_time_change_ms": None,
        }
    ]
    baseline_completed_at = datetime.fromisoformat(baseline_summary["baseline_completed_at"])
    assert local_date(datetime.fromisoformat(baseline_summary["week4_due_at"])) - local_date(baseline_completed_at) == timedelta(days=28)
    assert local_date(datetime.fromisoformat(baseline_summary["week8_due_at"])) - local_date(baseline_completed_at) == timedelta(days=56)
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


def test_learner_can_complete_an_admin_assigned_retention_check(api) -> None:
    client, testing_session = api
    admin = create_admin(client)
    login(client, admin["id"], "246824")
    learner = client.post(f"/admin/{admin['id']}/users", json={"name": "Recall Learner"}).json()

    created_response = client.post(
        "/retention-assessments",
        json={"user_id": learner["id"], "tables": [4], "question_count": 5, "question_mode": "multiply"},
    )
    assert created_response.status_code == 200
    assessment_id = created_response.json()["assessment_id"]

    client.post("/auth/logout")
    login(client, learner["id"])
    listed = client.get(f"/users/{learner['id']}/retention-assessments")
    assert listed.status_code == 200
    assert listed.json()["assessments"][0]["can_start"] is True

    started_response = client.post(f"/retention-assessments/{assessment_id}/start")
    assert started_response.status_code == 200
    started = started_response.json()
    answers = []
    with testing_session() as db:
        for question in started["questions"]:
            record = db.get(RetentionAssessmentQuestion, question["question_id"])
            fact = db.get(Fact, record.fact_id)
            _, answer = question_for_fact(fact, record.question_type)
            answers.append({"question_id": question["question_id"], "answer": str(answer), "response_time_ms": 1500})

    saved = client.post(
        f"/retention-assessments/{assessment_id}/answer",
        json={"round_id": started["round_id"], **answers[0]},
    )
    assert saved.status_code == 200
    resumed = client.post(f"/retention-assessments/{assessment_id}/start").json()
    assert resumed["round_id"] == started["round_id"]
    assert resumed["saved_answers"] == [answers[0]]
    for answer in answers[1:]:
        assert client.post(
            f"/retention-assessments/{assessment_id}/answer",
            json={"round_id": started["round_id"], **answer},
        ).status_code == 200

    submitted = client.post(
        f"/retention-assessments/{assessment_id}/submit",
        json={"round_id": started["round_id"], "answers": answers},
    )
    assert submitted.status_code == 200
    result = submitted.json()["assessment"]
    assert result["rounds"][0]["accuracy"] == 1
    assert result["status"] == "week4_pending"


def test_login_is_rate_limited_after_repeated_failures(api) -> None:
    client, _ = api
    admin = create_admin(client)
    try:
        for _ in range(5):
            assert client.post("/auth/login", json={"user_id": admin["id"], "password": "wrong"}).status_code == 401
        assert client.post("/auth/login", json={"user_id": admin["id"], "password": "wrong"}).status_code == 429
    finally:
        _login_failures.clear()
