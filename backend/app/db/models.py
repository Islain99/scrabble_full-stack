# app/db/models.py
#
# ⚡ Nouveaux champs vs version précédente :
#   - first_name, last_name   : prénom et nom
#   - age                     : âge (entier, optionnel)
#   - country                 : pays / localisation
#   - profile_complete        : flag — vrai quand tous les champs obligatoires sont remplis
#     Utilisé pour conditionner l'accès au jeu (ProtectedRoute + backend).

from datetime import datetime, timezone
from sqlalchemy import String, Integer, DateTime, Boolean, ForeignKey, Float, Text, Index, SmallInteger
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    # ── Identité Firebase ──────────────────────────────────────────
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    firebase_uid: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    auth_provider: Mapped[str] = mapped_column(String(32), default="email")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_login_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    # ── Profil public ──────────────────────────────────────────────
    display_name: Mapped[str] = mapped_column(String(64), nullable=False)
    first_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    age: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    country: Mapped[str | None] = mapped_column(String(100), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Flag : profil considéré complet quand first_name, last_name, age, country sont renseignés
    profile_complete: Mapped[bool] = mapped_column(Boolean, default=False)

    # ── Stats dénormalisées ───────────────────────────────────────
    games_played: Mapped[int] = mapped_column(Integer, default=0)
    games_won: Mapped[int] = mapped_column(Integer, default=0)
    total_score: Mapped[int] = mapped_column(Integer, default=0)
    best_score: Mapped[int] = mapped_column(Integer, default=0)
    best_word_score: Mapped[int] = mapped_column(Integer, default=0)
    best_word: Mapped[str | None] = mapped_column(String(32), nullable=True)
    average_score: Mapped[float] = mapped_column(Float, default=0.0)

    game_histories: Mapped[list["GameHistory"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )

    # ── Helpers ───────────────────────────────────────────────────

    def check_profile_complete(self) -> bool:
        """Recalcule et met à jour profile_complete."""
        complete = all([
            self.first_name,
            self.last_name,
            self.age is not None,
            self.country,
        ])
        self.profile_complete = complete
        return complete

    def update_stats_after_game(
        self, score: int, won: bool,
        best_word: str | None = None, best_word_score: int = 0
    ) -> None:
        self.games_played += 1
        if won:
            self.games_won += 1
        self.total_score += score
        self.average_score = round(self.total_score / self.games_played, 2)
        if score > self.best_score:
            self.best_score = score
        if best_word_score > self.best_word_score:
            self.best_word_score = best_word_score
            self.best_word = best_word

    @property
    def win_rate(self) -> float:
        if self.games_played == 0:
            return 0.0
        return round(self.games_won / self.games_played * 100, 1)


class GameHistory(Base):
    __tablename__ = "game_histories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    game_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    user_score: Mapped[int] = mapped_column(Integer, default=0)
    ai_name: Mapped[str] = mapped_column(String(64), default="HAL 9000")
    ai_score: Mapped[int] = mapped_column(Integer, default=0)
    ai_difficulty: Mapped[str] = mapped_column(String(16), default="medium")
    won: Mapped[bool] = mapped_column(Boolean, default=False)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    turns_count: Mapped[int] = mapped_column(Integer, default=0)
    best_word: Mapped[str | None] = mapped_column(String(32), nullable=True)
    best_word_score: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped["User"] = relationship(back_populates="game_histories")

    __table_args__ = (
        Index("ix_game_histories_user_created", "user_id", "created_at"),
    )