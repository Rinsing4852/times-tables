from pydantic import BaseModel, Field


class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class UserOut(BaseModel):
    id: int
    name: str

    model_config = {"from_attributes": True}


class TablesRequest(BaseModel):
    user_id: int
    tables: list[int] = Field(min_length=1)


class PracticeAnswer(BaseModel):
    user_id: int
    fact_id: int
    question_type: str
    answer: str
    attempt_number: int = Field(ge=1, le=2)
    response_time_ms: int = Field(ge=0)


class ChallengeStart(BaseModel):
    user_id: int
    tables: list[int] = Field(min_length=1)
    question_count: int = Field(ge=1, le=100)


class ChallengeAnswer(BaseModel):
    fact_id: int
    question_type: str
    answer: str
    response_time_ms: int = Field(ge=0)


class ChallengeSubmit(BaseModel):
    user_id: int
    tables: list[int] = Field(min_length=1)
    answers: list[ChallengeAnswer] = Field(min_length=1)
