from datetime import datetime, timedelta, timezone

from app.adaptive import priority_score, question_for_fact
from app.models import Fact, FactStat


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


def test_question_variants_return_expected_answers():
    fact = Fact(a=3, b=7, product=21)

    assert question_for_fact(fact, "multiply_ab") == ("3 x 7 = ?", 21)
    assert question_for_fact(fact, "multiply_ba") == ("7 x 3 = ?", 21)
    assert question_for_fact(fact, "divide_product_by_a") == ("21 / 3 = ?", 7)
    assert question_for_fact(fact, "divide_product_by_b") == ("21 / 7 = ?", 3)
    assert question_for_fact(fact, "missing_b") == ("3 x ? = 21", 7)
    assert question_for_fact(fact, "missing_a") == ("? x 7 = 21", 3)
