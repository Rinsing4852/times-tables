from __future__ import annotations

from datetime import datetime, timedelta, timezone

from .adaptive import as_aware_utc, choose_fact
from .models import Fact, FactStat, QuestionAttempt


REVIEW_INTERVALS = (1, 3, 7, 14, 30, 60)
SESSION_BUCKET_PATTERN = ("due", "acquisition", "due", "interleave", "acquisition", "due", "interleave", "due", "acquisition", "due")


def learning_state(stat: FactStat | None) -> str:
    return stat.learning_state if stat and stat.learning_state else "unseen"


def review_is_due(stat: FactStat | None, now: datetime | None = None) -> bool:
    if not stat or learning_state(stat) not in {"reviewing", "secure"} or not stat.due_at:
        return False
    current = as_aware_utc(now or datetime.now(timezone.utc))
    return as_aware_utc(stat.due_at) <= current


def practice_bucket_schedule(question_count: int) -> list[str]:
    return [SESSION_BUCKET_PATTERN[position % len(SESSION_BUCKET_PATTERN)] for position in range(question_count)]


def _first_attempt_results(recent_attempts: list[QuestionAttempt] | None) -> list[bool]:
    return [bool(attempt.is_correct) for attempt in (recent_attempts or []) if attempt.attempt_number == 1]


def _next_interval(current_interval: int) -> int:
    return next((interval for interval in REVIEW_INTERVALS if interval > current_interval), REVIEW_INTERVALS[-1])


def advance_fact_learning(
    stat: FactStat,
    is_correct: bool,
    attempt_number: int,
    recent_attempts: list[QuestionAttempt] | None = None,
    now: datetime | None = None,
) -> None:
    if attempt_number != 1:
        return

    current = as_aware_utc(now or datetime.now(timezone.utc))
    state_before = learning_state(stat)
    was_due = review_is_due(stat, current)
    stat.last_retrieval_at = current

    if state_before == "unseen":
        stat.learning_state = "acquiring"
        state_before = "acquiring"

    if state_before == "acquiring":
        results = [is_correct, *_first_attempt_results(recent_attempts)][:5]
        if is_correct and len(results) >= 3 and sum(results) >= 3 and all(results[:2]):
            stat.learning_state = "reviewing"
            stat.interval_days = REVIEW_INTERVALS[0]
            stat.successful_reviews = 0
            stat.due_at = current + timedelta(days=REVIEW_INTERVALS[0])
        return

    if not was_due:
        if not is_correct:
            stat.lapse_count += 1
            stat.learning_state = "reviewing"
            stat.interval_days = REVIEW_INTERVALS[0]
            stat.due_at = current + timedelta(days=REVIEW_INTERVALS[0])
        return

    if is_correct:
        completed_interval = stat.interval_days or REVIEW_INTERVALS[0]
        stat.successful_reviews += 1
        if completed_interval >= 30:
            stat.learning_state = "secure"
        next_interval = _next_interval(completed_interval)
        stat.interval_days = next_interval
        stat.due_at = current + timedelta(days=next_interval)
        return

    stat.lapse_count += 1
    stat.successful_reviews = 0
    if stat.lapse_count >= 2:
        stat.learning_state = "acquiring"
        stat.interval_days = 0
        stat.due_at = None
    else:
        stat.learning_state = "reviewing"
        stat.interval_days = REVIEW_INTERVALS[0]
        stat.due_at = current + timedelta(days=REVIEW_INTERVALS[0])


def fact_bucket(stat: FactStat | None, now: datetime | None = None) -> str:
    if review_is_due(stat, now):
        return "due"
    state = learning_state(stat)
    if state in {"unseen", "acquiring"}:
        return "acquisition"
    if stat:
        total = stat.first_attempt_total or 0
        error_rate = 1 - (stat.first_attempt_correct / total) if total else 1
        average_ms = (
            stat.first_attempt_response_time_ms / stat.first_attempt_response_count
            if stat.first_attempt_response_count
            else 0
        )
        if error_rate >= 0.35 or average_ms >= 5000:
            return "acquisition"
    return "interleave"


def choose_practice_fact(
    facts: list[Fact],
    stats_by_fact_id: dict[int, FactStat],
    recent_attempts_by_fact_id: dict[int, list[QuestionAttempt]],
    position: int,
    question_count: int,
    previous_fact_id: int | None = None,
    now: datetime | None = None,
) -> tuple[Fact, str]:
    current = now or datetime.now(timezone.utc)
    available = [fact for fact in facts if fact.id != previous_fact_id] if len(facts) > 1 else list(facts)
    requested_bucket = practice_bucket_schedule(question_count)[position]
    preferred = [fact for fact in available if fact_bucket(stats_by_fact_id.get(fact.id), current) == requested_bucket]
    candidates = preferred or available
    return choose_fact(candidates, stats_by_fact_id, recent_attempts_by_fact_id), requested_bucket if preferred else "adaptive"
