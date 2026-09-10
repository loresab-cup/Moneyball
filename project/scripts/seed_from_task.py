"""Дожить существующую задачу speech2text без повторной загрузки аудио.
Использование: python scripts/seed_from_task.py <TASK-ID> [title]"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

import requests

from app import models
from app.db import Base, SessionLocal, engine
from app.services import analyzer, pipeline, s2t

Base.metadata.create_all(bind=engine)

task_id = sys.argv[1]
title = sys.argv[2] if len(sys.argv) > 2 else f"Встреча {task_id[:8]}"

task = s2t.get_status(task_id)
if (task.get("status") or {}).get("code") != 200:
    sys.exit(f"задача не готова: {task.get('status')}")

result = s2t.get_result_json(task_id)
segments = pipeline.parse_s2t_result(result)
if not segments:
    sys.exit("пустой транскрипт — проверь парсер")
print(f"сегментов: {len(segments)}, длительность: {segments[-1]['end_sec']:.0f}с")

db = SessionLocal()
meeting = models.Meeting(title=title, s2t_task_id=task_id, status="analyzing")
db.add(meeting)
db.flush()

UPLOAD_DIR = Path(__file__).resolve().parents[1] / "backend" / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)
media_url = (task.get("resource") or {}).get("media")
if media_url:
    r = requests.get(media_url, headers=s2t._headers(), timeout=120)
    if not r.ok:
        r = requests.get(media_url, timeout=120)  # fallback без ключа
    if r.ok:
        path = UPLOAD_DIR / f"{meeting.id}.m4a"
        path.write_bytes(r.content)
        meeting.file_path = str(path)
        print("аудио скачано:", len(r.content), "байт")
    else:
        print("медиа недоступна:", r.status_code)

duration = pipeline._sec((task.get("file_meta") or {}).get("duration") or 0)
for s in segments:
    db.add(models.TranscriptSegment(meeting_id=meeting.id, start_sec=s["start_sec"],
                                    end_sec=s["end_sec"], speaker=s.get("speaker"), text=s["text"]))
if duration:
    meeting.duration_sec = duration
db.commit()

analysis = analyzer.extract(segments)
pipeline.store_analysis(db, meeting, analysis)
meeting.summary = analysis.get("summary")
meeting.status = "done"
db.commit()
print("GOTO: http://localhost:5173/#/projects?id=" + meeting.id)
db.close()
