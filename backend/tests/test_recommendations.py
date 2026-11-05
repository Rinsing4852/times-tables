from datetime import datetime, timedelta, timezone

from app.models import Fact, FactStat, QuestionAttempt
from app.recommendations import next_session_prescription, table_mastery_summary


def test_table_mastery_distinguishes_retained_and_building_tables() -> None:
    now = datetime.now(timezone.utc)
    facts = [
        Fact(id=1, a=2, b=1, product=2),
        Fact(id=2, a=2, b=2, product=4),
        Fact(id=3, a=7, b=1, product=7),
        Fact(id=4, a=7, b=2, product=14),
    ]
    stats = {
        1: FactStat(learning_state="secure", due_at=now + timedelta(days=20)),
        2: FactStat(learning_state="secure", due_at=now + timedelta(days=20)),
        3: FactStat(learning_state="acquiring"),
    }
    recent = {
        1: [QuestionAttempt(is_correct=True, attempt_number=1, response_time_ms=1200, created_at=now)],
        2: [QuestionAttempt(is_correct=True, attempt_number=1, response_time_ms=1600, created_at=now)],
    }

    result = table_mastery_summary(facts, stats, recent, now)

    assert result[0]["status"] == "retained"
    assert result[0]["mastery_score"] == 1.0
    assert result[0]["recent_median_time_ms"] == 1400
    assert result[1]["status"] == "building"
    assert result[1]["unseen_facts"] == 1


def test_due_review_is_the_next_session_before_new_learning() -> None:
    now = datetime.now(timezone.utc)
    facts = [Fact(id=1, a=4, b=6, product=24), Fact(id=2, a=7, b=8, product=56)]
    stats = {
        1: FactStat(learning_state="reviewing", due_at=now - timedelta(days=1), first_attempt_total=4, first_attempt_correct=3),
        2: FactStat(learning_state="unseen"),
    }
    mastery = table_mastery_summary(facts, stats, {}, now)

    result = next_session_prescription([4, 7], facts, stats, {}, mastery, now=now)

    assert result["reason"] == "due_review"
    assert result["tables"] == [4]
    assert result["facts"] == ["4×6"]


def test_ready_memory_test_has_priority_over_normal_practice() -> None:
    facts = [Fact(id=1, a=4, b=6, product=24)]
    mastery = table_mastery_summary(facts, {}, {})
    assessment = {
        "assessment_id": 9,
        "can_start": True,
        "next_round_label": "4-week check",
        "question_count": 20,
        "selected_tables": [4],
    }

    result = next_session_prescription([4], facts, {}, {}, mastery, [assessment])

    assert result["action"] == "memory_test"
    assert result["assessment_id"] == 9
