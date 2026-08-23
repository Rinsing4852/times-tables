from datetime import datetime, timedelta, timezone

from app.models import Fact, FactStat, QuestionAttempt
from app.reports import retention_summary


def test_retention_summary_counts_states_due_facts_and_review_accuracy() -> None:
    now = datetime.now(timezone.utc)
    facts = [Fact(id=index, a=2, b=index, product=2 * index) for index in range(2, 6)]
    stats = {
        2: FactStat(fact_id=2, learning_state="acquiring", lapse_count=0),
        3: FactStat(fact_id=3, learning_state="reviewing", due_at=now - timedelta(hours=2), lapse_count=1),
        4: FactStat(fact_id=4, learning_state="secure", due_at=now + timedelta(days=2), lapse_count=0),
    }
    attempts = [
        QuestionAttempt(was_due_review=True, attempt_number=1, is_correct=True, created_at=now - timedelta(days=2)),
        QuestionAttempt(was_due_review=True, attempt_number=1, is_correct=False, created_at=now - timedelta(days=8)),
    ]

    result = retention_summary(facts, stats, attempts, now)

    assert result["state_counts"] == {"unseen": 1, "acquiring": 1, "reviewing": 1, "secure": 1}
    assert result["due"] == 1
    assert result["overdue"] == 0
    assert result["review_accuracy_7_days"] == {"attempts": 1, "correct": 1, "accuracy": 1.0}
    assert result["review_accuracy_30_days"] == {"attempts": 2, "correct": 1, "accuracy": 0.5}
    assert result["total_lapses"] == 1
