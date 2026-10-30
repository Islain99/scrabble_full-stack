# app/db/models.py
from datetime import datetime, timezone
from sqlalchemy import String, SmallInteger, Integer, DateTime, Boolean, ForeignKey, JSON, Float, Text, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# Valeurs par défaut des préférences — miroir de SettingsContext.jsx
DEFAULT_PREFERENCES: dict = {
    "difficulty":         "medium",
    "turnDuration":       0,
    "showScorePreview":   True,
    "showRemainingTiles": True,
    "showBonusLabels":    True,
    "autoSortRack":       False,
    "confirmValidation":  False,
    "boardSize":          "normal",
    "animationsEnabled":  True,
    "tutorialSeen":       False,
    # Notifications push (lot 7) : catégories reçues sur les appareils inscrits
    "pushInvites":        True,
    "pushFriends":        True,
    "pushMessages":       True,
    "pushTurn":           True,
}


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    firebase_uid: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(64), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    auth_provider: Mapped[str] = mapped_column(String(32), default="email")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_login_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    # Préférences de jeu — stockées en JSON, fusionnées avec DEFAULT_PREFERENCES
    game_preferences: Mapped[dict | None] = mapped_column(JSON, nullable=True, default=None)

    # Stats dénormalisées (évite les agrégations coûteuses sur le classement)
    games_played: Mapped[int] = mapped_column(Integer, default=0)
    games_won: Mapped[int] = mapped_column(Integer, default=0)
    total_score: Mapped[int] = mapped_column(Integer, default=0)
    best_score: Mapped[int] = mapped_column(Integer, default=0)
    best_word_score: Mapped[int] = mapped_column(Integer, default=0)
    best_word: Mapped[str | None] = mapped_column(String(32), nullable=True)
    average_score: Mapped[float] = mapped_column(Float, default=0.0)

    # Profile public
    first_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    age: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    country: Mapped[str | None] = mapped_column(String(100), nullable=True)
    profile_complete: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")

    # Code ami unique (ex. ALEX-4821), affiché dans la page Amis (lot 4)
    friend_code: Mapped[str | None] = mapped_column(String(12), unique=True, nullable=True, index=True)

    # Messagerie (lot 6) : rôle d'administrateur (modération) et sourdine temporaire
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    chat_muted_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Classement multijoueur (lot 7) — séparé des statistiques solo ci-dessus
    mp_rating:      Mapped[int] = mapped_column(Integer, default=1200, server_default="1200")
    mp_peak_rating: Mapped[int] = mapped_column(Integer, default=1200, server_default="1200")
    mp_games:       Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    mp_wins:        Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    mp_draws:       Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    mp_total_score: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    mp_best_score:  Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    game_histories: Mapped[list["GameHistory"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )

    def get_preferences(self) -> dict:
        """Retourne les préférences fusionnées avec les valeurs par défaut."""
        if not self.game_preferences:
            return DEFAULT_PREFERENCES.copy()
        return {**DEFAULT_PREFERENCES, **self.game_preferences}

    def set_preferences(self, patch: dict) -> dict:
        """
        Fusionne patch avec les préférences existantes.
        Ne garde que les clés connues pour éviter la pollution.
        Retourne les préférences complètes mises à jour.
        """
        current = self.get_preferences()
        for key, value in patch.items():
            if key in DEFAULT_PREFERENCES:
                current[key] = value
        self.game_preferences = current
        return current

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

    def update_mp_stats_after_game(self, score: int, result: float, rating_delta: int) -> None:
        """Partie multijoueur terminée (result : 1 victoire, 0.5 égalité, 0 défaite)."""
        self.mp_games = (self.mp_games or 0) + 1
        if result == 1:
            self.mp_wins = (self.mp_wins or 0) + 1
        elif result == 0.5:
            self.mp_draws = (self.mp_draws or 0) + 1
        self.mp_total_score = (self.mp_total_score or 0) + score
        self.mp_best_score = max(self.mp_best_score or 0, score)
        self.mp_rating = (self.mp_rating or 1200) + rating_delta
        self.mp_peak_rating = max(self.mp_peak_rating or 1200, self.mp_rating)

    @property
    def mp_win_rate(self) -> float:
        if not self.mp_games:
            return 0.0
        return round((self.mp_wins or 0) / self.mp_games * 100, 1)


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
    # Multijoueur (lot 7) : variation de cote Elo de cette partie
    rating_delta: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped["User"] = relationship(back_populates="game_histories")

    __table_args__ = (
        Index("ix_game_histories_user_created", "user_id", "created_at"),
    )