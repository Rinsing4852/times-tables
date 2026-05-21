from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from random import choice

from .adaptive import QUESTION_TYPES, as_aware_utc, priority_score, question_for_fact
from .creatures import current_week_key
from .models import Fact, FactStat, TrainingQuest


APP_VERSION = "0.4.0"


@dataclass(frozen=True)
class QuestDefinition:
    quest_type: str
    title: str
    description: str
    question_count: int
    reward_xp: int
    reward_note: str
    fact_ids: list[int]


def dump_fact_ids(fact_ids: list[int]) -> str:
    return json.dumps(list(dict.fromkeys(fact_ids)))


def parse_fact_ids(value: str | None) -> list[int]:
    if not value:
        return []
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return []
    return [int(item) for item in parsed if isinstance(item, int)]


def stat_accuracy(stat: FactStat | None) -> float | None:
    if not stat:
        return None
    total = stat.correct_count + stat.incorrect_count
    if total == 0:
        return None
    return stat.correct_count / total


def stat_avg_ms(stat: FactStat | None) -> float | None:
    if not stat or not stat.response_count:
        return None
    return stat.total_response_time_ms / stat.response_count


def weakest_facts(facts: list[Fact], stats_by_fact_id: dict[int, FactStat], limit: int) -> list[Fact]:
    return sorted(facts, key=lambda fact: priority_score(stats_by_fact_id.get(fact.id)), reverse=True)[:limit]


def recent_mistake_facts(facts: list[Fact], stats_by_fact_id: dict[int, FactStat], limit: int) -> list[Fact]:
    with_failures = [fact for fact in facts if stats_by_fact_id.get(fact.id) and stats_by_fact_id[fact.id].last_failed_at]
    return sorted(
        with_failures,
        key=lambda fact: as_aware_utc(stats_by_fact_id[fact.id].last_failed_at or datetime.min.replace(tzinfo=timezone.utc)),
        reverse=True,
    )[:limit]


def slower_but_accurate_facts(facts: list[Fact], stats_by_fact_id: dict[int, FactStat], limit: int) -> list[Fact]:
    candidates = []
    for fact in facts:
        stat = stats_by_fact_id.get(fact.id)
        accuracy = stat_accuracy(stat)
        avg_ms = stat_avg_ms(stat)
        if accuracy is not None and avg_ms is not None and accuracy >= 0.75:
            candidates.append((fact, avg_ms))
    return [fact for fact, _ in sorted(candidates, key=lambda item: item[1], reverse=True)[:limit]]


def table_to_strengthen(facts: list[Fact], stats_by_fact_id: dict[int, FactStat]) -> int:
    table_scores = {}
    for fact in facts:
        table_scores.setdefault(fact.a, []).append(priority_score(stats_by_fact_id.get(fact.id)))
    if not table_scores:
        return 2
    return max(table_scores.items(), key=lambda item: sum(item[1]) / len(item[1]))[0]


def table_with_least_practice(facts: list[Fact], stats_by_fact_id: dict[int, FactStat]) -> int:
    table_counts = {}
    for fact in facts:
        stat = stats_by_fact_id.get(fact.id)
        table_counts.setdefault(fact.a, 0)
        table_counts[fact.a] += (stat.correct_count + stat.incorrect_count) if stat else 0
    if not table_counts:
        return 2
    return min(table_counts.items(), key=lambda item: (item[1], item[0]))[0]


def quest_definitions(facts: list[Fact], stats_by_fact_id: dict[int, FactStat]) -> list[QuestDefinition]:
    by_id = {fact.id: fact for fact in facts}
    weakest = weakest_facts(facts, stats_by_fact_id, 6)
    recent = recent_mistake_facts(facts, stats_by_fact_id, 6) or weakest[:4]
    speedy = slower_but_accurate_facts(facts, stats_by_fact_id, 6) or weakest[:5]
    table = table_to_strengthen(facts, stats_by_fact_id)
    table_facts = [fact for fact in facts if fact.a == table][:8] or weakest[:6]
    new_table = table_with_least_practice(facts, stats_by_fact_id)
    new_table_facts = [fact for fact in facts if fact.a == new_table][:8] or facts[:8]
    mixed_ids = [fact.id for fact in weakest[:4] + speedy[:3] + table_facts[:3] if fact.id in by_id]

    return [
        QuestDefinition(
            quest_type="new_table",
            title=f"New Table Explorer: {new_table}x",
            description=f"Try a table that has not had much practice yet.",
            question_count=10,
            reward_xp=40,
            reward_note="Quest reward: 40 XP",
            fact_ids=[fact.id for fact in new_table_facts],
        ),
        QuestDefinition(
            quest_type="tricky",
            title="Tricky Fact Tune-Up",
            description="Practise the facts that need a little more power.",
            question_count=8,
            reward_xp=25,
            reward_note="Quest reward: 25 XP",
            fact_ids=[fact.id for fact in weakest],
        ),
        QuestDefinition(
            quest_type="division",
            title="Division Boost",
            description="Train division versions of facts you know.",
            question_count=10,
            reward_xp=30,
            reward_note="Quest reward: 30 XP",
            fact_ids=[fact.id for fact in weakest[:6] or facts[:6]],
        ),
        QuestDefinition(
            quest_type="speed",
            title="Speed Builder",
            description="Practise facts you know, with a smooth rhythm.",
            question_count=10,
            reward_xp=25,
            reward_note="Quest reward: 25 XP",
            fact_ids=[fact.id for fact in speedy],
        ),
        QuestDefinition(
            quest_type="mistake",
            title="Mistake Fixer",
            description="Practise the facts that nearly caught you out.",
            question_count=6,
            reward_xp=20,
            reward_note="Quest reward: 20 XP",
            fact_ids=[fact.id for fact in recent],
        ),
        QuestDefinition(
            quest_type="table",
            title=f"Power Up Your {table}x Table",
            description=f"Give the {table}x table a focused training run.",
            question_count=10,
            reward_xp=25,
            reward_note="Quest reward: 25 XP",
            fact_ids=[fact.id for fact in table_facts],
        ),
        QuestDefinition(
            quest_type="mixed",
            title="Mixed Challenge",
            description="A balanced quest with different fact shapes.",
            question_count=12,
            reward_xp=30,
            reward_note="Quest reward: 30 XP",
            fact_ids=mixed_ids or [fact.id for fact in facts[:8]],
        ),
    ]


def ensure_available_quests(user_id: int, existing: list[TrainingQuest], facts: list[Fact], stats_by_fact_id: dict[int, FactStat]) -> list[TrainingQuest]:
    week_key = current_week_key()
    existing_keys = {quest.quest_key for quest in existing}
    quests = list(existing)
    for definition in quest_definitions(facts, stats_by_fact_id):
        quest_key = f"{week_key}-{definition.quest_type}"
        if quest_key in existing_keys:
            continue
        quests.append(
            TrainingQuest(
                user_id=user_id,
                quest_key=quest_key,
                quest_type=definition.quest_type,
                title=definition.title,
                description=definition.description,
                target_fact_ids=dump_fact_ids(definition.fact_ids),
                question_count=definition.question_count,
                reward_xp=definition.reward_xp,
                reward_note=definition.reward_note,
            )
        )
    return quests


def quest_completion_is_valid(quest: TrainingQuest, questions_completed: int, facts_practised: list[int]) -> bool:
    target_ids = set(parse_fact_ids(quest.target_fact_ids))
    practised_ids = set(facts_practised)
    required_fact_count = min(len(target_ids), quest.question_count)
    return (
        questions_completed == quest.question_count
        and required_fact_count > 0
        and len(practised_ids & target_ids) >= required_fact_count
        and practised_ids.issubset(target_ids)
    )


def quest_payload(quest: TrainingQuest) -> dict:
    return {
        "quest_id": quest.id,
        "quest_type": quest.quest_type,
        "title": quest.title,
        "description": quest.description,
        "target_fact_ids": parse_fact_ids(quest.target_fact_ids),
        "question_count": quest.question_count,
        "reward_xp": quest.reward_xp,
        "reward_note": quest.reward_note,
        "status": quest.status,
        "completed_at": quest.completed_at.isoformat() if quest.completed_at else None,
    }


def question_type_for_quest(quest_type: str) -> str:
    if quest_type == "division":
        return choice(["divide_product_by_a", "divide_product_by_b"])
    if quest_type == "tricky":
        return choice(QUESTION_TYPES)
    if quest_type == "mistake":
        return choice(["multiply_ab", "multiply_ba", "missing_a", "missing_b"])
    return choice(["multiply_ab", "multiply_ba", "divide_product_by_a", "missing_b"])


def quest_questions(quest: TrainingQuest, facts_by_id: dict[int, Fact]) -> list[dict]:
    target_ids = [fact_id for fact_id in parse_fact_ids(quest.target_fact_ids) if fact_id in facts_by_id]
    if not target_ids:
        return []
    questions = []
    for index in range(quest.question_count):
        fact = facts_by_id[target_ids[index % len(target_ids)]]
        question_type = question_type_for_quest(quest.quest_type)
        prompt, _ = question_for_fact(fact, question_type)
        questions.append(
            {
                "fact_id": fact.id,
                "a": fact.a,
                "b": fact.b,
                "question_type": question_type,
                "prompt": prompt,
            }
        )
    return questions
