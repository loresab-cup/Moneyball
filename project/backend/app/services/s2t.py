"""Клиент speech2text.ru. Документация: 'API Speech2Text. Документация.pdf'.

Цикл: send_file -> task_id; poll status (200 = готово, 501 = ошибка); get result/json.
"""
import time

import requests

from ..config import settings

BASE = "https://api.speech2text.ru/api"


class S2TError(Exception):
    pass


def _headers() -> dict:
    if not settings.s2t_api_key:
        raise S2TError("S2T_API_KEY не задан в .env")
    return {"Authorization": f"Bearer {settings.s2t_api_key}"}


def send_file(path: str, lang: str = "ru", speakers: int | None = None,
              max_speakers: int | None = None) -> dict:
    data = {"lang": lang}
    if speakers is not None:
        data["speakers"] = speakers
    if max_speakers is not None:
        data["max_speakers"] = max_speakers
    with open(path, "rb") as f:
        r = requests.post(f"{BASE}/recognitions/task/file", headers=_headers(),
                          files={"file": f}, data=data, timeout=120)
    if r.status_code >= 400:
        raise S2TError(f"send_file {r.status_code}: {r.text[:300]}")
    return r.json()


def get_status(task_id: str) -> dict:
    r = requests.get(f"{BASE}/recognitions/{task_id}", headers=_headers(), timeout=30)
    if r.status_code >= 400:
        raise S2TError(f"get_status {r.status_code}: {r.text[:300]}")
    return r.json()


def wait_done(task_id: str, timeout_sec: int = 1800, interval_sec: int = 5) -> dict:
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        task = get_status(task_id)
        code = (task.get("status") or {}).get("code")
        if code == 200:
            return task
        if code in (501, 502, 404, 406, 407, 102):
            raise S2TError(f"задача {task_id} завершилась ошибкой: {task.get('status')}")
        time.sleep(interval_sec)
    raise S2TError(f"timeout ожидания транскрипции {task_id}")


def get_result_json(task_id: str) -> dict:
    r = requests.get(f"{BASE}/recognitions/{task_id}/result/json", headers=_headers(), timeout=120)
    if r.status_code >= 400:
        raise S2TError(f"result/json {r.status_code}: {r.text[:300]}")
    return r.json()


def transcribe(path: str, **kwargs) -> dict:
    """Блокирующий полный цикл. Возвращает {'task': ..., 'result': ...}."""
    task = send_file(path, **kwargs)
    task_id = task["id"]
    task = wait_done(task_id)
    return {"task": task, "result": get_result_json(task_id)}
