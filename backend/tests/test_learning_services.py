from fastapi import HTTPException
import pytest

from app.learning import learning_event_for_stat, record_stat
from app.models import FactStat, QuestionAttempt, User
from app.profiles import clean_tables, effective_tables, parse_required_tables


def test_table_policy_merges_required_tables_and_rejects_empty_selection() -> None:
    user = User(required_tables="[7, 4, 7, true, 13]")

    assert clean_tables([12, 2, 2, 1, 13]) == [2, 12]
    assert parse_required_tables(user) == [4, 7]
    assert effective_tables(user, [2, 4]) == [2, 4, 7]

    with pytest.raises(HTTPException, match="Select at least one table"):
        effective_tables(User(required_tables="[]"), [])


def test_record_stat_keeps_first_and_second_attempt_measures_separate() -> None:
    stat = FactStat(
        correct_count=0,
        incorrect_count=0,
        first_attempt_correct=0,
        first_attempt_total=0,
        second_attempt_correct=0,
        second_attempt_total=0,
        total_response_time_ms=0,
        response_count=0,
        first_attempt_response_time_ms=0,
        first_attempt_response_count=0,
        current_streak=0,
    )

    record_stat(stat, is_correct=False, attempt_number=1, response_time_ms=4200)
    record_stat(stat, is_correct=True, attempt_number=2, response_time_ms=1800)

    assert stat.correct_count == 1
    assert stat.incorrect_count == 1
    assert stat.first_attempt_total == 1
    assert stat.first_attempt_correct == 0
    assert stat.second_attempt_total == 1
    assert stat.second_attempt_correct == 1
    assert stat.total_response_time_ms == 6000
    assert stat.response_count == 2


def test_learning_event_rewards_improvement_and_division_practice() -> None:
    stat = FactStat(first_attempt_total=6, first_attempt_correct=3)
    recent = [
        QuestionAttempt(is_correct=value, attempt_number=1, response_time_ms=1000)
        for value in [True, True, True, True, False, False, False, False, False, False]
    ]

    event = learning_event_for_stat(stat, True, "divide_product_by_a", 1, recent)

    assert event == {
        "practiced_weak_fact": True,
        "improved_fact_accuracy": True,
        "practiced_division": True,
    }
