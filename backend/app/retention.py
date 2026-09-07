from __future__ import annotations

from datetime import datetime, timezone
from statistics import median

from .adaptive import as_aware_utc, question_for_fact, question_types_for_mode
from .models import Fact, RetentionAssessment, RetentionAssessmentRound


ROUND_ORDER = {"baseline": 0, "week4": 1, "week8": 2}
ROUND_LABELS = {"baseline": "Baseline", "week4": "4-week check", "week8": "8-week check"}


def selected_tables(assessment: RetentionAssessment) -> list[int]:
    return [int(value) for value in assessment.selected_tables.split(",") if value]


def build_question_specs(facts: list[Fact], question_count: int, question_mode: str) -> list[tuple[Fact, str, str]]:
    ordered_facts = sorted(facts, key=lambda fact: (fact.a, fact.b, fact.id))
    question_types = question_types_for_mode(question_mode)
    specs = []
    for position in range(question_count):
        fact = ordered_facts[position % len(ordered_facts)]
        question_type = question_types[position % len(question_types)]
        prompt, _ = question_for_fact(fact, question_type)
        specs.append((fact, question_type, prompt))
    return specs


def round_metrics(round_record: RetentionAssessmentRound, question_count: int) -> dict:
    attempts = list(round_record.attempts)
    average_time_ms = round(round_record.total_time_ms / question_count) if question_count else 0
    median_time_ms = round(median(attempt.response_time_ms for attempt in attempts)) if attempts else 0
    return {
        "round_id": round_record.id,
        "round_key": round_record.round_key,
        "label": ROUND_LABELS[round_record.round_key],
        "status": round_record.status,
        "due_at": round_record.due_at.isoformat() if round_record.due_at else None,
        "completed_at": round_record.completed_at.isoformat() if round_record.completed_at else None,
        "correct_count": round_record.correct_count,
        "question_count": question_count,
        "accuracy": round(round_record.correct_count / question_count, 3) if question_count else 0,
        "total_time_ms": round_record.total_time_ms,
        "average_time_ms": average_time_ms,
        "median_time_ms": median_time_ms,
    }


def assessment_payload(assessment: RetentionAssessment, now: datetime | None = None) -> dict:
    current = as_aware_utc(now or datetime.now(timezone.utc))
    rounds = sorted(assessment.rounds, key=lambda item: ROUND_ORDER[item.round_key])
    summaries = [round_metrics(item, assessment.question_count) for item in rounds if item.status == "completed"]
    baseline = next((item for item in summaries if item["round_key"] == "baseline"), None)
    for summary in summaries:
        summary["accuracy_change"] = (
            round(summary["accuracy"] - baseline["accuracy"], 3) if baseline and summary["round_key"] != "baseline" else None
        )
        summary["average_time_change_ms"] = (
            summary["average_time_ms"] - baseline["average_time_ms"]
            if baseline and summary["round_key"] != "baseline"
            else None
        )
        summary["median_time_change_ms"] = (
            summary["median_time_ms"] - baseline["median_time_ms"]
            if baseline and summary["round_key"] != "baseline"
            else None
        )

    active_round = next((item for item in rounds if item.status == "active"), None)
    if active_round:
        next_round_key = active_round.round_key
        next_due_at = active_round.due_at
        can_start = True
    elif assessment.status == "baseline_ready":
        next_round_key = "baseline"
        next_due_at = None
        can_start = True
    elif assessment.status == "week4_pending":
        next_round_key = "week4"
        next_due_at = assessment.week4_due_at
        can_start = bool(next_due_at and as_aware_utc(next_due_at) <= current)
    elif assessment.status == "week8_pending":
        next_round_key = "week8"
        next_due_at = assessment.week8_due_at
        can_start = bool(next_due_at and as_aware_utc(next_due_at) <= current)
    else:
        next_round_key = None
        next_due_at = None
        can_start = False

    return {
        "assessment_id": assessment.id,
        "user_id": assessment.user_id,
        "selected_tables": selected_tables(assessment),
        "question_mode": assessment.question_mode,
        "question_count": assessment.question_count,
        "status": assessment.status,
        "created_at": assessment.created_at.isoformat(),
        "baseline_completed_at": assessment.baseline_completed_at.isoformat() if assessment.baseline_completed_at else None,
        "week4_due_at": assessment.week4_due_at.isoformat() if assessment.week4_due_at else None,
        "week8_due_at": assessment.week8_due_at.isoformat() if assessment.week8_due_at else None,
        "completed_at": assessment.completed_at.isoformat() if assessment.completed_at else None,
        "next_round_key": next_round_key,
        "next_round_label": ROUND_LABELS[next_round_key] if next_round_key else None,
        "next_due_at": next_due_at.isoformat() if next_due_at else None,
        "can_start": can_start,
        "active_round_id": active_round.id if active_round else None,
        "rounds": summaries,
    }
