from __future__ import annotations

import csv
import hashlib
import io
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from statistics import median

from .adaptive import as_aware_utc
from .config import local_date
from .models import Fact, FactStat, QuestionAttempt, User
from .scheduler import learning_state, review_is_due


def retention_summary(
    facts: list[Fact],
    stats_by_fact_id: dict[int, FactStat],
    due_review_attempts: list[QuestionAttempt],
    now: datetime | None = None,
) -> dict:
    current = as_aware_utc(now or datetime.now(timezone.utc))
    counts = {"unseen": 0, "acquiring": 0, "reviewing": 0, "secure": 0}
    due = 0
    overdue = 0
    for fact in facts:
        stat = stats_by_fact_id.get(fact.id)
        state = learning_state(stat)
        counts[state if state in counts else "unseen"] += 1
        if review_is_due(stat, current):
            due += 1
            if stat and stat.due_at and as_aware_utc(stat.due_at) <= current - timedelta(days=1):
                overdue += 1

    def window(days: int) -> dict:
        cutoff = current - timedelta(days=days)
        attempts = [
            attempt
            for attempt in due_review_attempts
            if attempt.was_due_review and attempt.attempt_number == 1 and as_aware_utc(attempt.created_at) >= cutoff
        ]
        correct = sum(int(attempt.is_correct) for attempt in attempts)
        return {
            "attempts": len(attempts),
            "correct": correct,
            "accuracy": round(correct / len(attempts), 3) if attempts else None,
        }

    return {
        "state_counts": counts,
        "due": due,
        "overdue": overdue,
        "review_accuracy_7_days": window(7),
        "review_accuracy_30_days": window(30),
        "total_lapses": sum((stat.lapse_count or 0) for stat in stats_by_fact_id.values()),
    }


def evaluation_csv(users: list[User], attempts: list[QuestionAttempt]) -> str:
    users_by_id = {user.id: user for user in users}
    grouped: dict[tuple[int, str], list[QuestionAttempt]] = defaultdict(list)
    for attempt in attempts:
        if attempt.attempt_number == 1 and attempt.user_id in users_by_id:
            grouped[(attempt.user_id, local_date(attempt.created_at).isoformat())].append(attempt)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "profile_key",
            "date",
            "first_attempts",
            "first_attempt_correct",
            "first_attempt_accuracy",
            "median_response_time_ms",
            "scheduled_reviews",
            "scheduled_review_correct",
            "scheduled_review_accuracy",
            "scheduler",
        ]
    )
    for (user_id, day), rows in sorted(grouped.items(), key=lambda item: (item[0][1], item[0][0])):
        user = users_by_id[user_id]
        profile_key = hashlib.sha256(f"{user.id}:{user.created_at.isoformat()}".encode("utf-8")).hexdigest()[:12]
        correct = sum(int(row.is_correct) for row in rows)
        reviews = [row for row in rows if row.was_due_review]
        review_correct = sum(int(row.is_correct) for row in reviews)
        writer.writerow(
            [
                profile_key,
                day,
                len(rows),
                correct,
                round(correct / len(rows), 3),
                round(median(row.response_time_ms for row in rows)),
                len(reviews),
                review_correct,
                round(review_correct / len(reviews), 3) if reviews else "",
                "due-review-v1",
            ]
        )
    return output.getvalue()
