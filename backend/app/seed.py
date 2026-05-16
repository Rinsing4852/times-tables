from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Fact


def seed_facts(db: Session) -> None:
    existing = db.scalar(select(Fact.id).limit(1))
    if existing:
        return

    for a in range(2, 13):
        for b in range(2, 13):
            db.add(Fact(a=a, b=b, product=a * b))
    db.commit()
