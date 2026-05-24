from datetime import datetime, timedelta, timezone

from app.creatures import (
    add_weekly_practice_day,
    creature_payload,
    creature_status,
    decayed_energy,
    energy_gain_for_questions,
    level_for_xp,
    session_rewards,
    stage_for_level,
    unlock_cosmetics,
    xp_threshold_for_level,
)


class DummyUser:
    id = 1
    creature_type = "Dragon"
    creature_name = "Bramble"
    energy = 80
    xp = 0
    level = 1
    stage = "Egg"
    last_practised_at = None
    total_questions_answered = 0
    total_sessions_completed = 0
    weekly_practice_days = "[]"
    last_weekly_reset_at = None
    weekly_goal_awarded_week = ""
    unlocked_cosmetics = '["starter-star"]'
    selected_cosmetic = "starter-star"


def test_energy_gain_matches_session_lengths() -> None:
    assert energy_gain_for_questions(5) == 10
    assert energy_gain_for_questions(10) == 20
    assert energy_gain_for_questions(20) == 35


def test_energy_decay_is_capped_and_never_below_twenty() -> None:
    user = DummyUser()
    now = datetime(2026, 5, 18, tzinfo=timezone.utc)
    user.energy = 30
    user.last_practised_at = now - timedelta(days=7)

    assert decayed_energy(user, now) == 20


def test_energy_decay_drops_twenty_per_day() -> None:
    user = DummyUser()
    now = datetime(2026, 5, 18, tzinfo=timezone.utc)
    user.energy = 100
    user.last_practised_at = now - timedelta(days=2)

    assert decayed_energy(user, now) == 60


def test_status_messages_stay_neutral_and_encouraging() -> None:
    assert creature_status("Bramble", 90) == "Bramble is full of energy and ready to train."
    assert creature_status("Bramble", 60) == "Bramble is doing well. A quick practice will make them stronger."
    assert creature_status("Bramble", 25) == "Bramble is resting. A short practice boost will wake them up."


def test_level_thresholds_and_stages_are_predictable() -> None:
    assert xp_threshold_for_level(1) == 0
    assert xp_threshold_for_level(2) == 50
    assert xp_threshold_for_level(5) == 350
    assert level_for_xp(124) == 2
    assert level_for_xp(125) == 3
    assert stage_for_level(1) == "Egg"
    assert stage_for_level(4) == "Youngling"
    assert stage_for_level(11) == "Champion"


def test_session_rewards_favour_effort_and_improvement() -> None:
    xp, reasons = session_rewards(
        mode="practice",
        questions_completed=10,
        first_attempt_correct=4,
        second_attempt_correct=2,
        practiced_weak_fact=True,
        improved_fact_accuracy=True,
        practiced_division=True,
        weekly_goal_completed=True,
    )

    assert xp == 69
    assert "Second-try fixes +6 XP" in reasons
    assert "Weekly training goal +25 XP" in reasons


def test_weekly_goal_awards_once_per_week() -> None:
    user = DummyUser()
    now = datetime(2026, 5, 18, tzinfo=timezone.utc)

    for offset in range(3):
        days, completed = add_weekly_practice_day(user, now + timedelta(days=offset))
        assert days == offset + 1
        assert completed is False

    days, completed = add_weekly_practice_day(user, now + timedelta(days=3))
    assert days == 4
    assert completed is True

    days, completed = add_weekly_practice_day(user, now + timedelta(days=4))
    assert days == 5
    assert completed is False


def test_unlock_cosmetics_only_returns_new_items() -> None:
    user = DummyUser()

    assert unlock_cosmetics(user, ["spark-hat", "spark-hat"]) == ["spark-hat"]
    assert unlock_cosmetics(user, ["spark-hat"]) == []


def test_creature_payload_includes_evolution_event() -> None:
    user = DummyUser()
    user.xp = 60
    user.level = 2
    user.stage = "Hatchling"

    payload = creature_payload(user, stage_message="Bramble has reached the Hatchling stage.", evolution_from="Egg", evolution_to="Hatchling")

    assert payload["evolution_from"] == "Egg"
    assert payload["evolution_to"] == "Hatchling"
