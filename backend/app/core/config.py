# app/core/config.py
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    APP_ENV: str = "development"
    ALLOWED_ORIGINS: str = (
        "http://localhost:5173,http://localhost:3000, http://localhost:8081,"
        "https://scrabble-full-stack.vercel.app,"
        "https://scrabble-full-stack-mup1.vercel.app,"
        "capacitor://localhost,http://localhost,https://localhost"
    )
    DATABASE_URL: str = ""
    FIREBASE_SERVICE_ACCOUNT_PATH: str = "./firebase-service-account.json"
    FIREBASE_SERVICE_ACCOUNT_JSON: str = ""
    # Dashboard admin : e-mails promus administrateurs à la connexion (séparés par des virgules).
    # Sert à nommer le premier administrateur ; retirer un e-mail ne rétrograde personne.
    ADMIN_EMAILS: str = ""

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    @property
    def admin_emails(self) -> set[str]:
        return {e.strip().lower() for e in self.ADMIN_EMAILS.split(",") if e.strip()}

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"

    @property
    def db_enabled(self) -> bool:
        """La DB est activée seulement si DATABASE_URL est défini."""
        return bool(self.DATABASE_URL)

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()