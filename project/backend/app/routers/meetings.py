import shutil
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, PlainTextResponse
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import settings
from ..db import get_db
from ..services import pipeline
from ..services.pipeline import UPLOAD_DIR

router = APIRouter(prefix="/api")

ALLOWED_EXT = {".mp3", ".wav", ".m4a", ".mp4"}


def _req_out(r: models.Requirement) -> schemas.RequirementOut:
    out = schemas.RequirementOut.model_validate(r)
    out.source = schemas.SourceOut(
        text=r.source_text,
        start_time=_fmt(r.source_start_sec), end_time=_fmt(r.source_end_sec))
    return out


def _fmt(sec: float | None) -> str | None:
    if sec is None:
        return None
    sec = int(sec)
    return f"{sec // 3600:02d}:{sec % 3600 // 60:02d}:{sec % 60:02d}"


@router.post("/meetings", response_model=schemas.MeetingOut)
async def create_meeting(background: BackgroundTasks, file: UploadFile = File(...),
                         title: str = Form("Встреча"), db: Session = Depends(get_db)):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, f"файл .{ext} не поддерживается, нужны: {sorted(ALLOWED_EXT)}")
    if not (1 <= len(title) <= 200):
        raise HTTPException(400, "название встречи 1-200 символов")

    UPLOAD_DIR.mkdir(exist_ok=True)
    path = UPLOAD_DIR / f"up_{abs(hash((file.filename, title))) % 10**12}{ext}"
    size = 0
    with open(path, "wb") as f:
        while chunk := await file.read(1 << 20):
            size += len(chunk)
            if size > settings.max_upload_mb * 1024 * 1024:
                f.close()
                path.unlink(missing_ok=True)
                raise HTTPException(413, f"файл больше {settings.max_upload_mb} МБ")
            f.write(chunk)
    if size == 0:
        path.unlink(missing_ok=True)
        raise HTTPException(400, "пустой файл")

    fhash = pipeline.file_hash(path)
    cached = pipeline.find_cached_meeting(db, fhash)
    if cached:
        if cached.file_path and Path(cached.file_path).exists():
            path.unlink(missing_ok=True)
        else:  # аудио у потерянной встречи дозаполняем повторно загруженным файлом
            keep = UPLOAD_DIR / f"{cached.id}{ext}"
            shutil.move(str(path), keep)
            cached.file_path = str(keep)
            db.commit()
        return _meeting_out(cached)

    meeting = models.Meeting(title=title[:200], file_hash=fhash, status="uploaded",
                             file_path=str(path))  # привязываем сразу: аудио доступно с момента загрузки
    db.add(meeting)
    db.commit()
    background.add_task(pipeline.process_meeting, meeting.id, path)
    return _meeting_out(meeting)


def _meeting_out(m: models.Meeting) -> schemas.MeetingOut:
    return schemas.MeetingOut.model_validate(m)


@router.get("/meetings")
def list_meetings(db: Session = Depends(get_db)):
    ms = db.query(models.Meeting).order_by(models.Meeting.created_at.desc()).all()
    return [{
        "id": m.id, "title": m.title, "status": m.status,
        "duration_sec": m.duration_sec, "created_at": m.created_at.isoformat(),
        "requirements_count": len(m.requirements),
    } for m in ms]


@router.get("/meetings/{meeting_id}", response_model=schemas.MeetingDetail)
def get_meeting(meeting_id: str, db: Session = Depends(get_db)):
    m = db.get(models.Meeting, meeting_id)
    if m is None:
        raise HTTPException(404, "встреча не найдена")
    reqs = [_req_out(r) for r in m.requirements if r.type != "constraint"]
    constraints = [_req_out(r) for r in m.requirements if r.type == "constraint"]
    roles = sorted({s.speaker for s in m.segments if s.speaker})
    return schemas.MeetingDetail(
        meeting=_meeting_out(m), requirements=reqs, roles=roles, constraints=constraints,
        open_questions=[schemas.OpenQuestionOut.model_validate(q) for q in m.open_questions],
        contradictions=[schemas.ContradictionOut.model_validate(x) for x in m.contradictions],
        counts={
            "requirements": len(reqs),
            "questions": sum(1 for q in m.open_questions if not q.resolved),
            "needs_clarification": sum(1 for r in m.requirements if r.needs_clarification),
            "contradictions": len(m.contradictions),
        },
    )


@router.delete("/meetings/{meeting_id}")
def delete_meeting(meeting_id: str, db: Session = Depends(get_db)):
    m = db.get(models.Meeting, meeting_id)
    if m is None:
        raise HTTPException(404, "встреча не найдена")
    path = m.file_path
    db.delete(m)
    db.commit()
    if path:
        still_used = db.query(models.Meeting).filter(models.Meeting.file_path == path).count()
        if not still_used:  # файл могут разделять несколько встреч (общий кэш)
            Path(path).unlink(missing_ok=True)
    return {"ok": True}


@router.get("/meetings/{meeting_id}/transcript")
def get_transcript(meeting_id: str, db: Session = Depends(get_db)):
    m = db.get(models.Meeting, meeting_id)
    if m is None:
        raise HTTPException(404, "встреча не найдена")
    segs = sorted(m.segments, key=lambda s: s.start_sec)
    return [schemas.SegmentOut.model_validate(s) for s in segs]


@router.post("/meetings/{meeting_id}/requirements", response_model=schemas.RequirementOut)
def add_requirement(meeting_id: str, body: schemas.RequirementCreate, db: Session = Depends(get_db)):
    m = db.get(models.Meeting, meeting_id)
    if m is None:
        raise HTTPException(404, "встреча не найдена")
    n = len(m.requirements) + 1
    r = models.Requirement(meeting_id=m.id, public_id=f"REQ-{n:03d}", title=body.title,
                           description=body.description, priority=body.priority,
                           type=body.type, manual=True, confidence=1.0)
    db.add(r)
    db.commit()
    return _req_out(r)


@router.patch("/requirements/{req_id}", response_model=schemas.RequirementOut)
def patch_requirement(req_id: str, body: schemas.RequirementPatch, db: Session = Depends(get_db)):
    r = db.get(models.Requirement, req_id)
    if r is None:
        raise HTTPException(404, "требование не найдено")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(r, k, v)
    db.commit()
    return _req_out(r)


@router.delete("/requirements/{req_id}")
def delete_requirement(req_id: str, db: Session = Depends(get_db)):
    r = db.get(models.Requirement, req_id)
    if r is None:
        raise HTTPException(404, "требование не найдено")
    db.delete(r)
    db.commit()
    return {"ok": True}


@router.patch("/open-questions/{q_id}")
def resolve_question(q_id: str, db: Session = Depends(get_db)):
    q = db.get(models.OpenQuestion, q_id)
    if q is None:
        raise HTTPException(404, "вопрос не найден")
    q.resolved = not q.resolved
    db.commit()
    return {"id": q.id, "resolved": q.resolved}


@router.post("/requirements/{req_id}/question", response_model=schemas.QuestionOut)
def ask_about_requirement(req_id: str, body: schemas.QuestionCreate, db: Session = Depends(get_db)):
    r = db.get(models.Requirement, req_id)
    if r is None:
        raise HTTPException(404, "требование не найдено")
    q = models.OpenQuestion(meeting_id=r.meeting_id, requirement_id=r.id, description=body.description)
    r.needs_clarification = True
    db.add(q)
    db.commit()
    return q


@router.get("/meetings/{meeting_id}/audio")
def get_audio(meeting_id: str, db: Session = Depends(get_db)):
    m = db.get(models.Meeting, meeting_id)
    if m is None or not m.file_path or not Path(m.file_path).exists():
        raise HTTPException(404, "аудио недоступно")
    return FileResponse(m.file_path)


@router.patch("/contradictions/{x_id}/resolve")
def resolve_contradiction(x_id: str, db: Session = Depends(get_db)):
    x = db.get(models.Contradiction, x_id)
    if x is None:
        raise HTTPException(404, "противоречие не найдено")
    x.resolved = not x.resolved
    db.commit()
    return {"id": x.id, "resolved": x.resolved}


@router.get("/meetings/{meeting_id}/export", response_class=PlainTextResponse)
def export_tz(meeting_id: str, db: Session = Depends(get_db)):
    m = db.get(models.Meeting, meeting_id)
    if m is None:
        raise HTTPException(404, "встреча не найдена")
    lines = [f"# Техническое задание — {m.title}", "",
             f"_Сформировано REQUIREX из разговора. Дата встречи: {m.created_at:%d.%m.%Y}_", ""]
    groups = [("Функциональные требования", "functional"), ("Нефункциональные требования", "non-functional")]
    for header, typ in groups:
        items = [r for r in m.requirements if r.type == typ]
        if not items:
            continue
        lines += [f"## {header}", ""]
        for r in items:
            mark = " ⚠️ требует уточнения" if r.needs_clarification else ""
            lines += [f"### {r.public_id}. {r.title}{mark}", r.description,
                      f"*Приоритет: {r.priority} · Уверенность: {int(r.confidence * 100)}%*", ""]
    cons = [r for r in m.requirements if r.type == "constraint"]
    if cons:
        lines += ["## Ограничения"] + [f"- {c.description}" for c in cons] + [""]
    qs = [q for q in m.open_questions if not q.resolved]
    if qs:
        lines += ["## Открытые вопросы"] + [f"- {q.description}" for q in qs] + [""]
    xs = m.contradictions
    if xs:
        lines += ["## Обнаруженные противоречия"]
        for x in xs:
            lines += [f"- **[{x.requirement_public_ids}]** {x.description}",
                      f"  Рекомендация: {x.recommendation}"]
        lines += [""]
    us = [us for r in m.requirements for us in r.user_stories]
    if us:
        lines += ["## User Stories"] + [f"- Как {u.role}, я хочу {u.action}, чтобы {u.goal}" for u in us]
    return "\n".join(lines)
