from datetime import datetime, timedelta, timezone

from app.models import Fact, FactStat, QuestionAttempt
from app.scheduler import (
    advance_fact_learning,
    choose_practice_fact,
    fact_bucket,
    practice_bucket_schedule,
    review_is_due,
)


def attempt(correct: bool) -> QuestionAttempt:
    return QuestionAttempt(is_correct=correct, attempt_number=1, response_time_ms=1200)


def stat(**values) -> FactStat:
    defaults = {
        "correct_count": 0,
        "incorrect_count": 0,
        "first_attempt_correct": 0,
        "first_attempt_total": 0,
        "second_attempt_correct": 0,
        "second_attempt_total": 0,
        "total_response_time_ms": 0,
        "response_count": 0,
        "first_attempt_response_time_ms": 0,
        "first_attempt_response_count": 0,
        "current_streak": 0,
        "learning_state": "unseen",
        "interval_days": 0,
        "successful_reviews": 0,
        "lapse_count": 0,
    }
    defaults.update(values)
    return FactStat(**defaults)


def test_acquisition_moves_to_review_after_stable_first_recall() -> None:
    now = datetime.now(timezone.utc)
    item = stat(learning_state="acquiring")

    advance_fact_learning(item, True, 1, [attempt(True), attempt(True)], now)

    assert item.learning_state == "reviewing"
    assert item.interval_days == 1
    assert item.due_at == now + timedelta(days=1)


def test_due_reviews_advance_intervals_and_reach_secure_state() -> None:
    now = datetime.now(timezone.utc)
    item = stat(learning_state="reviewing", interval_days=14, due_at=now - timedelta(minutes=1))
    advance_fact_learning(item, True, 1, [], now)
    assert item.learning_state == "reviewing"
    assert item.interval_days == 30

    item.due_at = now - timedelta(minutes=1)
    advance_fact_learning(item, True, 1, [], now)
    assert item.learning_state == "secure"
    assert item.interval_days == 60


def test_second_attempt_does_not_advance_scheduled_review() -> None:
    now = datetime.now(timezone.utc)
    due_at = now - timedelta(hours=1)
    item = stat(learning_state="reviewing", interval_days=7, due_at=due_at)

    advance_fact_learning(item, True, 2, [], now)

    assert item.interval_days == 7
    assert item.due_at == due_at


def test_review_failures_shorten_then_reacquire() -> None:
    now = datetime.now(timezone.utc)
    item = stat(learning_state="secure", interval_days=60, due_at=now - timedelta(days=1))

    advance_fact_learning(item, False, 1, [], now)
    assert item.learning_state == "reviewing"
    assert item.interval_days == 1
    assert item.lapse_count == 1

    item.due_at = now - timedelta(minutes=1)
    advance_fact_learning(item, False, 1, [], now)
    assert item.learning_state == "acquiring"
    assert item.due_at is None
    assert item.lapse_count == 2


def test_session_composition_and_candidate_buckets() -> None:
    schedule = practice_bucket_schedule(10)
    assert schedule.count("due") == 5
    assert schedule.count("acquisition") == 3
    assert schedule.count("interleave") == 2

    now = datetime.now(timezone.utc)
    due = stat(learning_state="reviewing", due_at=now - timedelta(minutes=1), interval_days=3)
    new = stat(learning_state="unseen")
    secure = stat(
        learning_state="secure",
        due_at=now + timedelta(days=10),
        interval_days=30,
        first_attempt_total=10,
        first_attempt_correct=10,
        first_attempt_response_count=10,
        first_attempt_response_time_ms=15000,
    )
    assert review_is_due(due, now)
    assert fact_bucket(due, now) == "due"
    assert fact_bucket(new, now) == "acquisition"
    assert fact_bucket(secure, now) == "interleave"


def test_due_slot_selects_a_due_fact_when_available() -> None:
    now = datetime.now(timezone.utc)
    facts = [Fact(id=1, a=6, b=7, product=42), Fact(id=2, a=6, b=8, product=48)]
    stats = {
        1: stat(fact_id=1, learning_state="reviewing", due_at=now - timedelta(days=1), interval_days=3),
        2: stat(fact_id=2, learning_state="acquiring"),
    }

    selected, reason = choose_practice_fact(facts, stats, {}, 0, 10, now=now)

    assert selected.id == 1
    assert reason == "due"
