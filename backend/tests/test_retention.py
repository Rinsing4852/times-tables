from app.models import Fact
from app.retention import build_question_specs


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
