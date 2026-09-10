import uuid
from datetime import datetime, timezone

from sqlalchemy import ForeignKey, String, Text, DateTime, Float, Boolean, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def _uuid() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Meeting(Base):
    __tablename__ = "meetings"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String(200), default="Встреча")
    description: Mapped[str] = mapped_column(Text, default="")
    file_hash: Mapped[str | None] = mapped_column(String(64), index=True)
    file_path: Mapped[str | None] = mapped_column(String(500))  # храним аудио: нужен плеер на экране
    s2t_task_id: Mapped[str | None] = mapped_column(String(64))
    duration_sec: Mapped[float | None] = mapped_column(Float)
    summary: Mapped[str | None] = mapped_column(Text)  # выжимка от ИИ
    # uploaded | transcribing | analyzing | done | error
    status: Mapped[str] = mapped_column(String(20), default="uploaded")
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    segments: Mapped[list["TranscriptSegment"]] = relationship(back_populates="meeting", cascade="all, delete-orphan")
    requirements: Mapped[list["Requirement"]] = relationship(back_populates="meeting", cascade="all, delete-orphan")
    open_questions: Mapped[list["OpenQuestion"]] = relationship(back_populates="meeting", cascade="all, delete-orphan")
    contradictions: Mapped[list["Contradiction"]] = relationship(back_populates="meeting", cascade="all, delete-orphan")


class TranscriptSegment(Base):
    __tablename__ = "transcript_segments"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    meeting_id: Mapped[str] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"))
    start_sec: Mapped[float] = mapped_column(Float)
    end_sec: Mapped[float] = mapped_column(Float)
    speaker: Mapped[str | None] = mapped_column(String(50))
    text: Mapped[str] = mapped_column(Text)

    meeting: Mapped[Meeting] = relationship(back_populates="segments")


class Requirement(Base):
    __tablename__ = "requirements"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    public_id: Mapped[str] = mapped_column(String(20), default=_uuid)  # REQ-001
    meeting_id: Mapped[str] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"))
    type: Mapped[str] = mapped_column(String(20), default="functional")  # functional|non-functional|constraint
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text, default="")
    priority: Mapped[str] = mapped_column(String(10), default="medium")  # high|medium|low
    confidence: Mapped[float] = mapped_column(Float, default=1.0)
    needs_clarification: Mapped[bool] = mapped_column(Boolean, default=False)
    source_text: Mapped[str | None] = mapped_column(Text)
    source_start_sec: Mapped[float | None] = mapped_column(Float)
    source_end_sec: Mapped[float | None] = mapped_column(Float)
    source_segment_id: Mapped[str | None] = mapped_column(ForeignKey("transcript_segments.id", ondelete="SET NULL"))
    for_roles: Mapped[str] = mapped_column(String(200), default="ALL")  # "ALL" или "Менеджер, Экспедитор"
    manual: Mapped[bool] = mapped_column(Boolean, default=False)

    meeting: Mapped[Meeting] = relationship(back_populates="requirements")
    user_stories: Mapped[list["UserStory"]] = relationship(back_populates="requirement", cascade="all, delete-orphan")


class UserStory(Base):
    __tablename__ = "user_stories"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    requirement_id: Mapped[str] = mapped_column(ForeignKey("requirements.id", ondelete="CASCADE"))
    role: Mapped[str] = mapped_column(String(100))
    action: Mapped[str] = mapped_column(String(300))
    goal: Mapped[str] = mapped_column(String(300))

    requirement: Mapped[Requirement] = relationship(back_populates="user_stories")


class OpenQuestion(Base):
    __tablename__ = "open_questions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    meeting_id: Mapped[str] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"))
    requirement_id: Mapped[str | None] = mapped_column(ForeignKey("requirements.id", ondelete="SET NULL"))
    description: Mapped[str] = mapped_column(Text)
    source_text: Mapped[str | None] = mapped_column(Text)
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)

    meeting: Mapped[Meeting] = relationship(back_populates="open_questions")


class Contradiction(Base):
    __tablename__ = "contradictions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    meeting_id: Mapped[str] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"))
    requirement_public_ids: Mapped[str] = mapped_column(String(200))  # "REQ-002,REQ-005"
    description: Mapped[str] = mapped_column(Text)
    recommendation: Mapped[str] = mapped_column(Text, default="")
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)

    meeting: Mapped[Meeting] = relationship(back_populates="contradictions")
