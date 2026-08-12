from datetime import datetime, timezone

from app.models import Fact, FactStat, TrainingQuest
from app.quests import ensure_available_quests, quest_completion_is_valid, quest_definitions, quest_questions, weakest_facts


def make_fact(fact_id: int, a: int, b: int) -> Fact:
    return Fact(id=fact_id, a=a, b=b, product=a * b)


def test_weakest_facts_prioritise_incorrect_and_slow() -> None:
    facts = [make_fact(1, 6, 7), make_fact(2, 2, 3)]
    stats = {
        1: FactStat(fact_id=1, correct_count=1, incorrect_count=4, total_response_time_ms=30000, response_count=5, current_streak=0),
        2: FactStat(fact_id=2, correct_count=10, incorrect_count=0, total_response_time_ms=8000, response_count=10, current_streak=10),
    }

    assert weakest_facts(facts, stats, 1)[0].id == 1


def test_quest_definitions_include_core_training_types() -> None:
    facts = [make_fact(index, 2 + (index % 4), 2 + index) for index in range(1, 8)]
    stats = {fact.id: FactStat(fact_id=fact.id, correct_count=1, incorrect_count=2, current_streak=0, last_failed_at=datetime.now(timezone.utc)) for fact in facts}

    definitions = quest_definitions(facts, stats)
    quest_types = {definition.quest_type for definition in definitions}

    assert {"tricky", "division", "speed", "mistake", "table", "mixed"}.issubset(quest_types)
    assert all(definition.reward_xp > 0 for definition in definitions)


def test_no_data_quest_has_high_reward_and_mega_target() -> None:
    facts = [make_fact(index, 4, index + 1) for index in range(1, 9)]

    definitions = quest_definitions(facts, {})
    discovery = next(definition for definition in definitions if definition.quest_type == "discovery")

    assert discovery.reward_xp == 60
    assert "Mega Form" in discovery.description


def test_accuracy_quests_target_incremental_bands() -> None:
    facts = [make_fact(1, 4, 5), make_fact(2, 4, 6), make_fact(3, 4, 7)]
    stats = {
        1: FactStat(fact_id=1, first_attempt_correct=4, first_attempt_total=10, current_streak=0),
        2: FactStat(fact_id=2, first_attempt_correct=5, first_attempt_total=10, current_streak=0),
        3: FactStat(fact_id=3, first_attempt_correct=9, first_attempt_total=10, current_streak=0),
    }

    definitions = quest_definitions(facts, stats)

    assert next(item for item in definitions if item.quest_type == "accuracy_40_50").fact_ids == [1]
    assert next(item for item in definitions if item.quest_type == "accuracy_50_60").fact_ids == [2]


def test_quest_questions_use_division_forms_for_division_boost() -> None:
    fact = make_fact(1, 6, 7)
    quest = TrainingQuest(
        id=1,
        user_id=1,
        quest_key="test-division",
        quest_type="division",
        title="Division Boost",
        description="Train division versions of facts you know.",
        target_fact_ids="[1]",
        question_count=4,
        reward_xp=30,
    )

    questions = quest_questions(quest, {1: fact})

    assert len(questions) == 4
    assert all("÷" in question["prompt"] for question in questions)


def test_quest_completion_requires_matching_count_and_target_facts() -> None:
    quest = TrainingQuest(
        id=1,
        user_id=1,
        quest_key="test-tricky",
        quest_type="tricky",
        title="Tricky Fact Tune-Up",
        description="Practise focused facts.",
        target_fact_ids="[1, 2, 3]",
        question_count=3,
        reward_xp=25,
    )

    assert quest_completion_is_valid(quest, 3, [1, 2, 3])
    assert not quest_completion_is_valid(quest, 2, [1, 2, 3])
    assert not quest_completion_is_valid(quest, 3, [1, 2])
    assert not quest_completion_is_valid(quest, 3, [1, 2, 99])


def test_old_unfinished_quests_expire_when_daily_quests_refresh() -> None:
    facts = [make_fact(index, 2, index + 1) for index in range(1, 8)]
    old = TrainingQuest(
        id=1,
        user_id=1,
        quest_key="2020-01-01-tricky",
        quest_type="tricky",
        title="Old quest",
        description="Old targets",
        target_fact_ids="[1]",
        question_count=8,
        reward_xp=25,
        status="available",
    )

    quests = ensure_available_quests(1, [old], facts, {})

    assert old.status == "expired"
    assert len([quest for quest in quests if quest.status == "available"]) >= 7
