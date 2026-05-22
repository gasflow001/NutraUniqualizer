"""Application settings loaded from .env."""
from __future__ import annotations

import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_DIR = Path(__file__).resolve().parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Gemini
    GEMINI_API_KEY: str = ""
    GEMINI_TEXT_MODEL: str = "gemini-2.5-flash"
    GEMINI_PROXY: str = ""  # http://user:pass@host:port — optional, if Gemini returns 403

    # Flow
    FLOW_PROJECT_ID: str = ""
    FLOW_PROXY: str = ""  # обычно не нужен; включать только если Flow выдаёт 403

    # Chrome
    CHROME_PATH: str = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
    CHROME_CDP_PORT: int = 9224
    CHROME_FLOW_PROFILE_DIR: str = "~/.chrome-nutra-flow"

    # Concurrency
    FLOW_API_SEMAPHORE: int = 5
    FLOW_CHROME_COUNT: int = 1

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    STORAGE_PATH: str = "./storage"
    DB_PATH: str = "./data/nutra.db"

    @property
    def storage_dir(self) -> Path:
        p = (BACKEND_DIR / self.STORAGE_PATH).resolve()
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def data_dir(self) -> Path:
        p = (BACKEND_DIR / "data").resolve()
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def db_url(self) -> str:
        db_file = (BACKEND_DIR / self.DB_PATH).resolve()
        db_file.parent.mkdir(parents=True, exist_ok=True)
        return f"sqlite+aiosqlite:///{db_file.as_posix()}"

    @property
    def chrome_profile_path(self) -> str:
        return os.path.expanduser(self.CHROME_FLOW_PROFILE_DIR)


settings = Settings()
