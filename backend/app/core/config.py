import os
try:
    from pydantic_settings import BaseSettings
except ImportError:
    from pydantic import BaseSettings  # type: ignore
from pydantic import validator
from typing import List

_backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_env_file = ".env" if os.path.exists(".env") else os.path.join(_backend_dir, ".env")


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./trustvault.db"
    SECRET_KEY: str = "dev-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    STORAGE_PATH: str = "./storage"
    APP_ENV: str = "development"
    ALLOWED_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5000,http://127.0.0.1:5000,https://trust-secure.vercel.app,https://trust-secure-lqjd2rjh4-nihas-projects-a495c765.vercel.app"    ALLOW_PUBLIC_REGISTRATION: bool = True
    PORT: int = 5000
    HOST: str = "127.0.0.1"

    @validator("DATABASE_URL", pre=True, always=True)
    def normalize_db_url(cls, v):
        if not v:
            v = "sqlite:///./trustvault.db"
        prefix = "sqlite:///"
        if v.startswith(prefix):
            path_part = v[len(prefix):]
            if not (os.path.isabs(path_part) or (len(path_part) > 1 and path_part[1] == ":")):
                clean_rel = path_part.lstrip("./").lstrip(".\\")
                abs_path = os.path.abspath(os.path.join(_backend_dir, clean_rel)).replace("\\", "/")
                return f"sqlite:///{abs_path}"
        return v

    @validator("STORAGE_PATH", pre=True, always=True)
    def normalize_storage_path(cls, v):
        if not v:
            v = "./storage"
        if not os.path.isabs(v):
            return os.path.abspath(os.path.join(_backend_dir, v))
        return v

    @property
    def allowed_origins_list(self) -> List[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",")]

    class Config:
        env_file = _env_file
        env_file_encoding = "utf-8"


settings = Settings()
