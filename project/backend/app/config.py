from pathlib import Path

from pydantic_settings import BaseSettings

ENV_PATH = Path(__file__).resolve().parents[1] / ".env"


class Settings(BaseSettings):
    s2t_api_key: str = ""
    gigachat_client_id: str = ""
    gigachat_client_secret: str = ""
    database_url: str = f"sqlite:///{(Path(__file__).resolve().parents[1] / 'requirex.db').as_posix()}"
    max_upload_mb: int = 200
    demo_mode: bool = False

    class Config:
        env_file = str(ENV_PATH)


settings = Settings()
