from __future__ import annotations

from datetime import datetime, timezone
from statistics import median

from .adaptive import as_aware_utc, priority_score
from .models import Fact, FactStat, QuestionAttempt
from .scheduler import learning_state, review_is_due


STATE_WEIGHTS = {"unseen": 0.0, "acquiring": 0.25, "reviewing": 0.65, "secure": 1.0}


def table_mastery_summary(
    facts: list[Fact],
    stats_by_fact_id: dict[int, FactStat],
    recent_attempts_by_fact_id: dict[int, list[QuestionAttempt]],
    now: datetime | None = None,
) -> list[dict]:
    current = as_aware_utc(now or datetime.now(timezone.utc))
    summaries = []
    for table in sorted({fact.a for fact in facts}):
        table_facts = [fact for fact in facts if fact.a == table]
        states = [learning_state(stats_by_fact_id.get(fact.id)) for fact in table_facts]
        due = sum(1 for fact in table_facts if review_is_due(stats_by_fact_id.get(fact.id), current))
        recent_attempts = [
            attempt
            for fact in table_facts
            for attempt in recent_attempts_by_fact_id.get(fact.id, [])
            if attempt.attempt_number == 1
        ]
        recent_attempts.sort(key=lambda attempt: as_aware_utc(attempt.created_at), reverse=True)
        recent_window = recent_attempts[:30]
        recent_accuracy = (
            sum(int(attempt.is_correct) for attempt in recent_window) / len(recent_window)
            if recent_window
            else None
        )
        recent_median_ms = (
            round(median(attempt.response_time_ms for attempt in recent_window))
            if recent_window
            else None
        )
        counts = {state: states.count(state) for state in STATE_WEIGHTS}
        score = sum(STATE_WEIGHTS[state] for state in states) / len(states) if states else 0
        attempted = len(states) - counts["unseen"]
        if counts["secure"] == len(states) and due == 0:
            status = "retained"
            message = "Secure and remembered. Keep it in occasional mixed practice."
        elif counts["secure"] >= max(1, round(len(states) * 0.75)):
            status = "securing"
            message = "Nearly secure. Complete the scheduled reviews."
        elif attempted >= max(1, round(len(states) * 0.5)):
            status = "building"
            message = "Building recall. Continue short, varied practice."
        elif attempted:
            status = "starting"
            message = "A few facts have been introduced. Keep building coverage."
        else:
            status = "not_started"
            message = "Ready to begin when this table is selected."
        summaries.append(
            {
                "table": table,
                "status": status,
                "mastery_score": round(score, 3),
                "total_facts": len(states),
                "unseen_facts": counts["unseen"],
                "acquiring_facts": counts["acquiring"],
                "reviewing_facts": counts["reviewing"],
                "secure_facts": counts["secure"],
                "due_facts": due,
                "recent_accuracy": round(recent_accuracy, 3) if recent_accuracy is not None else None,
                "recent_median_time_ms": recent_median_ms,
                "message": message,
            }
        )
    return summaries


def next_session_prescription(
    selected_tables: list[int],
    facts: list[Fact],
    stats_by_fact_id: dict[int, FactStat],
    recent_attempts_by_fact_id: dict[int, list[QuestionAttempt]],
    table_mastery: list[dict],
    retention_assessments: list[dict] | None = None,
    now: datetime | None = None,
) -> dict:
    current = as_aware_utc(now or datetime.now(timezone.utc))
    selected = sorted(set(selected_tables))
    selected_facts = [fact for fact in facts if fact.a in selected]
    assessments = retention_assessments or []
    ready_test = next((item for item in assessments if item.get("can_start")), None)
    if ready_test:
        return {
            "action": "memory_test",
            "reason": "scheduled_retention_check",
            "title": f"{ready_test.get('next_round_label') or 'Memory'} test ready",
            "message": "Repeat the fixed questions to measure what stayed in long-term memory.",
            "question_count": ready_test["question_count"],
            "tables": ready_test["selected_tables"],
            "fact_ids": [],
            "facts": [],
            "assessment_id": ready_test["assessment_id"],
        }

    due_facts = [fact for fact in selected_facts if review_is_due(stats_by_fact_id.get(fact.id), current)]
    if due_facts:
        ranked_due = sorted(
            due_facts,
            key=lambda fact: priority_score(
                stats_by_fact_id.get(fact.id), current, recent_attempts_by_fact_id.get(fact.id, [])
            ),
            reverse=True,
        )
        targets = ranked_due[:5]
        labels = [f"{fact.a}×{fact.b}" for fact in targets]
        return {
            "action": "practice",
            "reason": "due_review",
            "title": f"{len(due_facts)} memory {'review' if len(due_facts) == 1 else 'reviews'} ready",
            "message": f"Start with {', '.join(labels[:3])} to help these facts stay available.",
            "question_count": max(5, min(10, len(due_facts))),
            "tables": sorted({fact.a for fact in targets}),
            "fact_ids": [fact.id for fact in targets],
            "facts": labels,
            "assessment_id": None,
        }

    selected_mastery = [item for item in table_mastery if item["table"] in selected]
    next_table = min(
        selected_mastery,
        key=lambda item: (item["mastery_score"], -item["due_facts"], item["table"]),
        default=None,
    )
    ranked = sorted(
        selected_facts,
        key=lambda fact: priority_score(
            stats_by_fact_id.get(fact.id), current, recent_attempts_by_fact_id.get(fact.id, [])
        ),
        reverse=True,
    )
    targets = [fact for fact in ranked if not next_table or fact.a == next_table["table"]][:5]
    labels = [f"{fact.a}×{fact.b}" for fact in targets]
    if next_table and next_table["unseen_facts"]:
        title = f"Build the {next_table['table']}× table"
        reason = "new_or_acquiring_facts"
        message = f"Introduce a few facts, then bring them back over spaced reviews. Start with {', '.join(labels[:3])}."
    else:
        title = "Keep recall flexible"
        reason = "interleaved_maintenance"
        message = "Mix accurate facts with a few less familiar ones so every fact stays available."
    return {
        "action": "practice",
        "reason": reason,
        "title": title,
        "message": message,
        "question_count": 10,
        "tables": [next_table["table"]] if next_table else selected,
        "fact_ids": [fact.id for fact in targets],
        "facts": labels,
        "assessment_id": None,
    }
