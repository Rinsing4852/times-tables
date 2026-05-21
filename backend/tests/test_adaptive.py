from datetime import datetime, timedelta, timezone

from app.adaptive import priority_score, question_for_fact, question_types_for_mode
from app.models import Fact, FactStat, QuestionAttempt


def test_priority_is_high_for_unseen_fact():
    assert priority_score(None) == 2.4


def test_priority_increases_for_errors_and_recent_failure():
    now = datetime.now(timezone.utc)
    strong = FactStat(
        correct_count=10,
        incorrect_count=0,
        total_response_time_ms=18000,
        response_count=10,
        current_streak=8,
        last_seen=now - timedelta(hours=1),
    )
    weak = FactStat(
        correct_count=2,
        incorrect_count=8,
        total_response_time_ms=70000,
        response_count=10,
        current_streak=0,
        last_seen=now - timedelta(days=2),
        last_failed_at=now - timedelta(minutes=20),
    )

    assert priority_score(weak, now) > priority_score(strong, now)


def test_spacing_raises_priority_for_stale_fact():
    now = datetime.now(timezone.utc)
    fresh = FactStat(correct_count=6, incorrect_count=0, total_response_time_ms=12000, response_count=6, current_streak=6, last_seen=now)
    stale = FactStat(
        correct_count=6,
        incorrect_count=0,
        total_response_time_ms=12000,
        response_count=6,
        current_streak=6,
        last_seen=now - timedelta(days=9),
    )

    assert priority_score(stale, now) > priority_score(fresh, now)


def test_priority_handles_sqlite_naive_datetimes():
    now = datetime.now(timezone.utc)
    stat = FactStat(
        correct_count=1,
        incorrect_count=1,
        total_response_time_ms=8000,
        response_count=2,
        current_streak=0,
        last_seen=datetime.utcnow(),
        last_failed_at=datetime.utcnow(),
    )

    assert priority_score(stat, now) > 0


def test_question_variants_return_expected_answers():
    fact = Fact(a=3, b=7, product=21)

    assert question_for_fact(fact, "multiply_ab") == ("3 x 7 = ?", 21)
    assert question_for_fact(fact, "multiply_ba") == ("7 x 3 = ?", 21)
    assert question_for_fact(fact, "divide_product_by_a") == ("21 ÷ 3 = ?", 7)
    assert question_for_fact(fact, "divide_product_by_b") == ("21 ÷ 7 = ?", 3)
    assert question_for_fact(fact, "missing_b") == ("3 x ? = 21", 7)
    assert question_for_fact(fact, "missing_a") == ("? x 7 = 21", 3)


def test_question_mode_for_focused_table_keeps_table_in_prompt():
    assert question_types_for_mode("mixed", [10]) == ["multiply_ab", "divide_product_by_a", "missing_b"]
    assert question_types_for_mode("multiply", [10]) == ["multiply_ab", "missing_b"]
    assert question_types_for_mode("division", [10]) == ["divide_product_by_a"]


def test_recent_attempts_influence_priority_without_zeroing_mastered_facts():
    now = datetime.now(timezone.utc)
    stat = FactStat(
        correct_count=30,
        incorrect_count=0,
        total_response_time_ms=30000,
        response_count=30,
        current_streak=30,
        last_seen=now,
    )
    recent_slow_errors = [
        QuestionAttempt(fact_id=1, user_id=1, question_type="multiply_ab", prompt="6 x 7 = ?", answer_given="40", correct_answer=42, is_correct=False, attempt_number=1, response_time_ms=7000)
        for _ in range(5)
    ]

    assert priority_score(stat, now, recent_attempts=recent_slow_errors) > priority_score(stat, now)
    assert priority_score(stat, now) >= 0.08
