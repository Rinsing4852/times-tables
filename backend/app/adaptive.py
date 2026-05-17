from __future__ import annotations

from datetime import datetime, timezone
from math import exp
from random import choices

from .models import Fact, FactStat


QUESTION_TYPES = [
    "multiply_ab",
    "multiply_ba",
    "divide_product_by_a",
    "divide_product_by_b",
    "missing_b",
    "missing_a",
]


def as_aware_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def question_for_fact(fact: Fact, question_type: str) -> tuple[str, int]:
    if question_type == "multiply_ab":
        return f"{fact.a} x {fact.b} = ?", fact.product
    if question_type == "multiply_ba":
        return f"{fact.b} x {fact.a} = ?", fact.product
    if question_type == "divide_product_by_a":
        return f"{fact.product} ÷ {fact.a} = ?", fact.b
    if question_type == "divide_product_by_b":
        return f"{fact.product} ÷ {fact.b} = ?", fact.a
    if question_type == "missing_b":
        return f"{fact.a} x ? = {fact.product}", fact.b
    if question_type == "missing_a":
        return f"? x {fact.b} = {fact.product}", fact.a
    raise ValueError(f"Unknown question type: {question_type}")


def normalize_answer(answer: str) -> int | None:
    try:
        return int(str(answer).strip())
    except (TypeError, ValueError):
        return None


def priority_score(stat: FactStat | None, now: datetime | None = None) -> float:
    now = as_aware_utc(now or datetime.now(timezone.utc))
    if stat is None or (stat.correct_count + stat.incorrect_count) == 0:
        return 2.4

    total = stat.correct_count + stat.incorrect_count
    error_rate = stat.incorrect_count / total

    avg_ms = stat.total_response_time_ms / stat.response_count if stat.response_count else 5000
    slowness_score = min(max((avg_ms - 2500) / 5000, 0), 1)

    if stat.last_seen:
        days_since_seen = max((now - as_aware_utc(stat.last_seen)).total_seconds() / 86400, 0)
        spacing_score = min(days_since_seen / 7, 1)
    else:
        spacing_score = 1

    recent_failure_boost = 0
    if stat.last_failed_at:
        hours_since_failure = max((now - as_aware_utc(stat.last_failed_at)).total_seconds() / 3600, 0)
        recent_failure_boost = 0.8 * exp(-hours_since_failure / 24)

    mastery_discount = min(stat.current_streak * 0.12, 0.8)
    return max(0.05, error_rate + slowness_score + spacing_score + recent_failure_boost - mastery_discount)


def choose_fact(facts: list[Fact], stats_by_fact_id: dict[int, FactStat]) -> Fact:
    weights = [priority_score(stats_by_fact_id.get(fact.id)) for fact in facts]
    return choices(facts, weights=weights, k=1)[0]


def heat_colour_accuracy(correct: int, incorrect: int) -> str:
    total = correct + incorrect
    if total == 0:
        return "empty"
    accuracy = correct / total
    if accuracy >= 0.85:
        return "green"
    if accuracy >= 0.6:
        return "amber"
    return "red"


def heat_colour_speed(avg_ms: float | None) -> str:
    if avg_ms is None:
        return "empty"
    if avg_ms <= 2500:
        return "green"
    if avg_ms <= 5000:
        return "amber"
    return "red"
