from pydantic import BaseModel, ConfigDict, field_validator

from datetime import datetime

REQ_TYPES = {"functional", "non-functional", "constraint"}
PRIORITIES = {"high", "medium", "low"}


class SourceOut(BaseModel):
    start_time: str | None = None
    end_time: str | None = None
    text: str | None = None


class UserStoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    role: str
    action: str
    goal: str


class RequirementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    public_id: str
    type: str
    title: str
    description: str
    priority: str
    confidence: float
    needs_clarification: bool
    manual: bool
    for_roles: str = "ALL"
    source: SourceOut | None = None
    user_stories: list[UserStoryOut] = []


class RequirementPatch(BaseModel):
    title: str | None = None
    description: str | None = None
    priority: str | None = None
    type: str | None = None
    needs_clarification: bool | None = None

    @field_validator("priority")
    @classmethod
    def _prio(cls, v):
        if v is not None and v not in PRIORITIES:
            raise ValueError(f"priority must be one of {sorted(PRIORITIES)}")
        return v

    @field_validator("type")
    @classmethod
    def _type(cls, v):
        if v is not None and v not in REQ_TYPES:
            raise ValueError(f"type must be one of {sorted(REQ_TYPES)}")
        return v

    @field_validator("title")
    @classmethod
    def _title(cls, v):
        if v is not None and not (1 <= len(v.strip()) <= 300):
            raise ValueError("title must be 1-300 chars")
        return v


class RequirementCreate(BaseModel):
    title: str
    description: str = ""
    priority: str = "medium"
    type: str = "functional"


class SegmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    start_sec: float
    end_sec: float
    speaker: str | None
    text: str


class OpenQuestionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    description: str
    source_text: str | None
    resolved: bool


class ContradictionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    requirement_public_ids: str
    description: str
    recommendation: str
    resolved: bool = False


class MeetingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    description: str = ""
    status: str
    duration_sec: float | None
    summary: str | None = None
    error: str | None
    created_at: datetime


class QuestionCreate(BaseModel):
    description: str

    @field_validator("description")
    @classmethod
    def _desc(cls, v):
        if not (3 <= len(v.strip()) <= 2000):
            raise ValueError("вопрос 3-2000 символов")
        return v.strip()


class QuestionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    description: str
    requirement_id: str | None


class MeetingDetail(BaseModel):
    meeting: MeetingOut
    requirements: list[RequirementOut]
    roles: list[str]
    constraints: list[RequirementOut]
    open_questions: list[OpenQuestionOut]
    contradictions: list[ContradictionOut]
    counts: dict[str, int] = {}
