from datetime import datetime, timezone

from app.models import Fact
from app.retention import build_question_specs, retention_due_at, retention_is_due


def test_fixed_retention_questions_are_balanced_across_selected_tables() -> None:
    facts = [
        Fact(id=1, a=2, b=1, product=2),
        Fact(id=2, a=2, b=2, product=4),
        Fact(id=3, a=3, b=1, product=3),
        Fact(id=4, a=3, b=2, product=6),
        Fact(id=5, a=4, b=1, product=4),
        Fact(id=6, a=4, b=2, product=8),
    ]

    first = build_question_specs(facts, 6, "multiply")
    repeated = build_question_specs(facts, 6, "multiply")

    assert [(fact.a, fact.b) for fact, _, _ in first] == [
        (2, 1),
        (3, 1),
        (4, 1),
        (2, 2),
        (3, 2),
        (4, 2),
    ]
    assert [(fact.id, question_type, prompt) for fact, question_type, prompt in first] == [
        (fact.id, question_type, prompt) for fact, question_type, prompt in repeated
    ]


def test_retention_check_unlocks_at_start_of_local_due_date() -> None:
    completed_at = datetime(2026, 10, 10, 18, 30, tzinfo=timezone.utc)
    due_at = retention_due_at(completed_at, 28)

    assert due_at == datetime(2026, 11, 7, 0, 0, tzinfo=timezone.utc)
    assert retention_is_due(due_at, datetime(2026, 11, 6, 23, 59, tzinfo=timezone.utc)) is False
    assert retention_is_due(due_at, datetime(2026, 11, 7, 0, 0, tzinfo=timezone.utc)) is True


def test_existing_exact_time_schedule_is_ready_any_time_on_its_local_date() -> None:
    old_style_due_at = datetime(2026, 11, 7, 18, 30, tzinfo=timezone.utc)

    assert retention_is_due(old_style_due_at, datetime(2026, 11, 7, 8, 0, tzinfo=timezone.utc)) is True
