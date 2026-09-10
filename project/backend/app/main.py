from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import json

from .db import Base, engine
from .routers import meetings

Base.metadata.create_all(bind=engine)

app = FastAPI(title="REQUIREX API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(meetings.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/mock")
def mock():
    from pathlib import Path
    return json.loads((Path(__file__).resolve().parents[1] / "mock" / "mock_data.json").read_text(encoding="utf-8"))
