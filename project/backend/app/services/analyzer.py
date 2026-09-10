"""Пайплайн AI-анализа: извлечение требований + валидация цитат + противоречия."""
import json
import re
from pathlib import Path

from rapidfuzz import fuzz

from . import gigachat

PROMPT_PATH = Path(__file__).resolve().parents[3] / "docs" / "gigachat_prompt.md"

CONTRADICTION_PROMPT = """Ты — системный аналитик. Тебе даны транскрипция встречи и список
извлечённых требований. Найди противоречия: (1) требования конфликтуют между собой;
(2) говорящий менял решение по ходу разговора (ретракт: сначала согласился, потом отказался).
Верни СТРОГО JSON: {"contradictions": [{"requirement_texts": ["...", "..."], "description": "...", "recommendation": "..."}]}.
Если противоречий нет — верни {"contradictions": []}. Не выдумывай противоречия."""


def build_transcript_text(segments: list[dict]) -> str:
    return "\n".join(
        f"{_fmt(s['start_sec'])} — [{_fmt(s['end_sec'])}] {s.get('speaker') or 'Говорящий'}: {s['text']}"
        for s in segments
    )


def _fmt(sec: float) -> str:
    sec = int(sec)
    return f"{sec // 3600:02d}:{sec % 3600 // 60:02d}:{sec % 60:02d}"


def extract(segments: list[dict]) -> dict:
    system_prompt = PROMPT_PATH.read_text(encoding="utf-8")
    transcript = build_transcript_text(segments)
    data = gigachat.chat_json([
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"ТРАНСКРИПЦИЯ:\n{transcript}"},
    ])
    _validate_quotes(data, segments)
    data["contradictions"] = find_contradictions(data, segments)
    return data


def _validate_quotes(data: dict, segments: list[dict]) -> None:
    """confidence = фактическое совпадение цитаты с транскриптом, а не оценка LLM."""
    for item in _citable(data):
        quote = (item.get("source") or {}).get("text") or ""
        if not quote:
            item["confidence"] = 0.5
            item["needs_clarification"] = True
            continue
        best = max((fuzz.partial_ratio(_norm(quote), _norm(s["text"])) for s in segments), default=0)
        score = best / 100.0
        item["confidence"] = round(min(1.0, max(0.3, score)), 2)
        if score < 0.85:
            item["needs_clarification"] = True


def _citable(data: dict) -> list[dict]:
    items = list(data.get("requirements", []))
    items += list(data.get("constraints", []))
    items += list(data.get("open_questions", []))
    return items


def _norm(t: str) -> str:
    return re.sub(r"[^\wа-яё ]", "", t.lower(), flags=re.I).strip()


def find_contradictions(data: dict, segments: list[dict]) -> list[dict]:
    req_list = [{"id": r.get("id"), "description": r.get("description")}
                for r in data.get("requirements", [])]
    transcript = build_transcript_text(segments)
    try:
        result = gigachat.chat_json([
            {"role": "system", "content": CONTRADICTION_PROMPT},
            {"role": "user", "content": f"ТРЕБОВАНИЯ:\n{json.dumps(req_list, ensure_ascii=False)}\n\nТРАНСКРИПЦИЯ:\n{transcript}"},
        ])
        return result.get("contradictions", [])
    except Exception:
        return data.get("contradictions", []) or []
