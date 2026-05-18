from datetime import datetime, timedelta, timezone

from app.creatures import creature_status, decayed_energy, energy_gain_for_questions


class DummyUser:
    energy = 80
    last_practised_at = None


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


def test_status_messages_stay_neutral_and_encouraging() -> None:
    assert creature_status("Bramble", 90) == "Bramble is full of energy and ready to train."
    assert creature_status("Bramble", 60) == "Bramble is doing well. A quick practice will make them stronger."
    assert creature_status("Bramble", 25) == "Bramble is resting. A short practice boost will wake them up."
