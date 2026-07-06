from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

QuestionMode = Literal["mixed", "multiply", "division"]

QuestionType = Literal[
    "multiply_ab",
    "multiply_ba",
    "divide_product_by_a",
    "divide_product_by_b",
    "missing_b",
    "missing_a",
]

CreatureType = Literal["Blob", "Dragon", "Robot", "Forest Sprite", "Rock Golem", "Space Beast"]


class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    is_admin: bool = False
    password: Optional[str] = Field(default=None, max_length=80)


class UserAdminUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    is_admin: Optional[bool] = None
    password: Optional[str] = Field(default=None, max_length=80)


class UserOut(BaseModel):
    id: int
    name: str

    model_config = {"from_attributes": True}


class LoginRequest(BaseModel):
    user_id: int
    password: str = Field(default="", max_length=80)


class TablesRequest(BaseModel):
    user_id: int
    tables: list[int] = Field(min_length=1)
    question_mode: QuestionMode = "mixed"


class PracticeStart(TablesRequest):
    question_count: int = Field(ge=1, le=100)


class PracticeQuestionRequest(BaseModel):
    session_id: str = Field(min_length=16, max_length=64)


class PracticeAnswer(BaseModel):
    session_id: str = Field(min_length=16, max_length=64)
    question_id: int
    answer: str = Field(max_length=32)
    response_time_ms: int = Field(ge=0, le=3_600_000)


class ChallengeStart(BaseModel):
    user_id: int
    tables: list[int] = Field(min_length=1)
    question_count: int = Field(ge=1, le=100)
    question_mode: QuestionMode = "mixed"


class ChallengeAnswer(BaseModel):
    question_id: int
    answer: str = Field(max_length=32)
    response_time_ms: int = Field(ge=0, le=3_600_000)


class ChallengeSubmit(BaseModel):
    session_id: str = Field(min_length=16, max_length=64)
    answers: list[ChallengeAnswer] = Field(min_length=1, max_length=100)


class CreatureUpdate(BaseModel):
    creature_type: CreatureType
    creature_name: str = Field(min_length=1, max_length=80)


class CreatureCosmeticUpdate(BaseModel):
    selected_cosmetic: str = Field(min_length=1, max_length=64)
