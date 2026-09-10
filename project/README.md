# REQUIREX — разговор → ТЗ

AI-сервис для превращения записи встречи в проверяемое техническое задание: speech2text расшифровывает аудио с диаризацией спикеров, GigaChat извлекает требования, ограничения, открытые вопросы и противоречия, а каждое требование связывается с исходной репликой в записи (цитата + таймкод + переход к фрагменту аудио).

## Стек

- Backend: FastAPI + SQLite + requests (speech2text.ru, GigaChat/SberWave OAuth)
- Frontend: React 19 + Vite + TypeScript
- AI-анализ: GigaChat-3-Ultra (промпт — `docs/gigachat_prompt.md`)

## Как запустить

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows  (Linux/mac: source .venv/bin/activate)
pip install -r requirements.txt
copy .env.example .env          # заполнить ключи (см. ниже)
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev                     # http://localhost:5173, проксирует /api на :8000
```

Одним махом (dev): `python scripts/start_dev.py`

## Переменные окружения (`backend/.env`)

| Переменная | Назначение |
|---|---|
| `S2T_API_KEY` | ключ API speech2text.ru (расшифровка) |
| `GIGACHAT_CLIENT_ID` | SberWave client id для OAuth GigaChat |
| `GIGACHAT_CLIENT_SECRET` | SberWave client secret |
| `DATABASE_URL` | по умолчанию SQLite `./requirex.db` |
| `MAX_UPLOAD_MB` | лимит размера загрузки (200) |

Реальные значения в `.env` — НЕ коммитить и НЕ архивировать на показ (`.gitignore` закрыт).

## Основные эндпоинты

- `POST /api/meetings` — загрузка аудио (mp3/wav/m4a/mp4), фоновый пайплайн
- `GET /api/meetings/{id}` — статус + требования + вопросы + противоречия
- `GET /api/meetings/{id}/transcript` — транскрипция с таймкодами
- `GET /api/meetings/{id}/audio` — аудио для плеера
- `GET /api/meetings/{id}/export` — скачивание ТЗ (Markdown)
- CRUD: `PATCH/DELETE /api/requirements/{id}`, `POST /api/requirements/{id}/question`, `PATCH /api/contradictions/{id}/resolve`
- Демо без бэка: `GET /api/mock` → экран `#/projects?id=mock`
