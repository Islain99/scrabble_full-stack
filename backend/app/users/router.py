# app/users/router.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from pydantic import BaseModel, ConfigDict, field_validator
from datetime import datetime

from app.db.database import get_db
from app.db.models import User, GameHistory
from app.auth.dependencies import get_current_user, get_current_user_optional
from app.users.privacy import can_see, friend_ids_of
from app.auth.router import UserOut

import logging
logger = logging.getLogger(__name__)
router = APIRouter(prefix="/users", tags=["Utilisateurs"])


# ── Schemas ────────────────────────────────────────────────────────

def _clean_text(v: str | None, limit: int, label: str) -> str | None:
    if v is None:
        return None
    v = " ".join("".join(ch for ch in v if ch.isprintable()).split())
    if len(v) > limit:
        raise ValueError(f"{label} : {limit} caractères au plus.")
    return v or None


class UpdateProfileRequest(BaseModel):
    """
    Mise à jour partielle du profil. Un champ absent ne change pas ; un champ
    envoyé vide (ou null) est effacé — sauf le pseudo, obligatoire.
    """
    display_name: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    age: int | None = None
    country: str | None = None
    bio: str | None = None
    avatar_url: str | None = None

    @field_validator("display_name")
    @classmethod
    def validate_name(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = " ".join(v.split())
        if len(v) < 2:
            raise ValueError("Le pseudo doit contenir au moins 2 caractères.")
        if len(v) > 32:
            raise ValueError("Le pseudo ne peut pas dépasser 32 caractères.")
        return v

    @field_validator("first_name", "last_name")
    @classmethod
    def validate_names(cls, v: str | None) -> str | None:
        return _clean_text(v, 64, "Nom")

    @field_validator("country")
    @classmethod
    def validate_country(cls, v: str | None) -> str | None:
        return _clean_text(v, 100, "Pays")

    @field_validator("age")
    @classmethod
    def validate_age(cls, v: int | None) -> int | None:
        if v is None or v == 0:
            return None
        if v < 5 or v > 120:
            raise ValueError("L'âge doit être compris entre 5 et 120 ans.")
        return v

    @field_validator("bio")
    @classmethod
    def validate_bio(cls, v: str | None) -> str | None:
        if v and len(v.strip()) > 280:
            raise ValueError("La bio ne peut pas dépasser 280 caractères.")
        return (v or "").strip() or None

    @field_validator("avatar_url")
    @classmethod
    def validate_avatar(cls, v: str | None) -> str | None:
        v = (v or "").strip()
        if v and (len(v) > 512 or not v.startswith("https://")):
            raise ValueError("Adresse de photo invalide.")
        return v or None


# Profil complet : les champs demandés par la bannière « Complétez votre profil ».
# Depuis le lot A4, l'administrateur choisit les champs exigés (app/appconfig/profile.py) ;
# cette liste est celle d'origine.
PROFILE_REQUIRED = ("display_name", "first_name", "last_name", "age", "country")


def is_profile_complete(user: User, rules=None) -> bool:
    if rules is None:
        return all(getattr(user, f, None) not in (None, "") for f in PROFILE_REQUIRED)
    from app.appconfig.profile import is_complete
    return is_complete(user, rules)


class GameHistoryOut(BaseModel):
    id: int
    game_id: str
    user_score: int
    ai_name: str
    ai_score: int
    ai_difficulty: str
    won: bool
    duration_seconds: int | None
    turns_count: int
    best_word: str | None
    best_word_score: int
    rating_delta: int | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SaveGameRequest(BaseModel):
    """Appelé par le frontend à la fin de chaque partie."""
    game_id: str
    user_score: int
    ai_name: str = "HAL 9000"
    ai_score: int
    ai_difficulty: str = "medium"
    won: bool
    duration_seconds: int | None = None
    turns_count: int = 0
    best_word: str | None = None
    best_word_score: int = 0


class PreferencesResponse(BaseModel):
    """Préférences de jeu d'un utilisateur."""
    difficulty:         str
    gameLanguage:       str = "fr"
    turnDuration:       int
    showScorePreview:   bool
    showRemainingTiles: bool
    showBonusLabels:    bool
    autoSortRack:       bool
    confirmValidation:  bool
    boardSize:          str
    animationsEnabled:  bool
    tutorialSeen:       bool = False
    pushInvites:        bool = True
    pushFriends:        bool = True
    pushMessages:       bool = True
    pushNews:           bool = True
    pushTurn:           bool = True
    # Apparence — None = jamais choisi sur un appareil connecté :
    # le client garde alors son choix local et l'envoie au serveur.
    themeMode:          str | None = None
    colorPalette:       str | None = None


# Doit rester aligné sur PALETTES (frontend/src/context/ThemeContext.jsx)
# et sur les blocs de frontend/src/styles/palettes.css.
THEME_MODES = {"light", "dark", "system"}
COLOR_PALETTES = {
    "vintage", "classique", "ocean", "bordeaux", "ardoise",
    "lavande", "foret", "terracotta", "tournesol", "contraste",
}


class PreferencesPatchRequest(BaseModel):
    """
    Mise à jour partielle des préférences.
    Seuls les champs fournis sont mis à jour (PATCH sémantique).
    """
    difficulty:         str | None = None
    gameLanguage:       str | None = None
    turnDuration:       int | None = None
    showScorePreview:   bool | None = None
    showRemainingTiles: bool | None = None
    showBonusLabels:    bool | None = None
    autoSortRack:       bool | None = None
    confirmValidation:  bool | None = None
    boardSize:          str | None = None
    animationsEnabled:  bool | None = None
    tutorialSeen:       bool | None = None
    pushInvites:        bool | None = None
    pushFriends:        bool | None = None
    pushMessages:       bool | None = None
    pushNews:           bool | None = None
    pushTurn:           bool | None = None
    themeMode:          str | None = None
    colorPalette:       str | None = None

    @field_validator("themeMode")
    @classmethod
    def validate_theme_mode(cls, v: str | None) -> str | None:
        if v is not None and v not in THEME_MODES:
            raise ValueError(f"Mode invalide. Valeurs autorisées : {sorted(THEME_MODES)}")
        return v

    @field_validator("colorPalette")
    @classmethod
    def validate_color_palette(cls, v: str | None) -> str | None:
        if v is not None and v not in COLOR_PALETTES:
            raise ValueError(f"Palette invalide. Valeurs autorisées : {sorted(COLOR_PALETTES)}")
        return v

    @field_validator("gameLanguage")
    @classmethod
    def validate_game_language(cls, v: str | None) -> str | None:
        if v is not None and v not in ("fr", "en"):
            raise ValueError("Langue de jeu invalide. Valeurs autorisées : fr, en")
        return v

    @field_validator("difficulty")
    @classmethod
    def validate_difficulty(cls, v: str | None) -> str | None:
        if v is None:
            return v
        # Les 5 niveaux de AIDifficulty (api/game_logic.py). Liste recopiée ici :
        # importer game_logic au chargement du routeur serait trop lourd.
        allowed = {"beginner", "easy", "medium", "hard_minus", "hard"}
        if v not in allowed:
            raise ValueError(f"Difficulté invalide. Valeurs autorisées : {allowed}")
        return v

    @field_validator("turnDuration")
    @classmethod
    def validate_turn_duration(cls, v: int | None) -> int | None:
        if v is None:
            return v
        allowed = {0, 60, 120, 180, 300}
        if v not in allowed:
            raise ValueError(f"Durée invalide. Valeurs autorisées : {allowed}")
        return v

    @field_validator("boardSize")
    @classmethod
    def validate_board_size(cls, v: str | None) -> str | None:
        if v is None:
            return v
        if v not in {"normal", "large"}:
            raise ValueError("boardSize doit être 'normal' ou 'large'.")
        return v


# ── Routes ─────────────────────────────────────────────────────────

@router.get("/me", response_model=UserOut)
async def get_profile(current_user: User = Depends(get_current_user)):
    """Profil complet + stats de l'utilisateur connecté."""
    return UserOut.from_user(current_user)


@router.patch("/me", response_model=UserOut)
async def update_profile(
    payload: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Met à jour le profil : pseudo, prénom, nom, âge, pays, présentation, photo.
    Le profil est « complet » dès que pseudo, prénom, nom, âge et pays sont remplis.
    """
    from app.appconfig.profile import get_profile_rules
    rules = await get_profile_rules(db)
    changes = payload.model_dump(exclude_unset=True)
    if "display_name" in changes and changes["display_name"] is None:
        changes.pop("display_name")                 # le pseudo ne s'efface pas
    # Lot A4 : champ que l'administrateur ne demande plus → ignoré
    for field in rules.off():
        changes.pop(field, None)
    if changes.get("age") is not None and changes["age"] < rules.min_age:
        raise HTTPException(status_code=422, detail=f"L'âge minimal est de {rules.min_age} ans.")
    for field, value in changes.items():
        setattr(current_user, field, value)
    current_user.profile_complete = is_profile_complete(current_user, rules)

    await db.flush()
    await db.refresh(current_user)
    return UserOut.from_user(current_user)


@router.get("/me/history", response_model=list[GameHistoryOut])
async def get_history(
    limit: int = 20,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Historique paginé des parties de l'utilisateur."""
    result = await db.execute(
        select(GameHistory)
        .where(GameHistory.user_id == current_user.id)
        .order_by(desc(GameHistory.created_at))
        .limit(min(limit, 50))
        .offset(offset)
    )
    return result.scalars().all()


@router.post("/me/games", response_model=GameHistoryOut, status_code=status.HTTP_201_CREATED)
async def save_game(
    payload: SaveGameRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Sauvegarde une partie terminée et met à jour les stats du joueur.
    Appelé automatiquement par le frontend quand status === 'FINISHED'.
    Idempotent : une deuxième requête avec le même game_id retourne 409.
    """
    # Les parties multijoueur sont enregistrées par le serveur, jamais par le client
    if payload.ai_difficulty == "multiplayer" or payload.game_id.startswith("mp:"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail="Les parties multijoueur sont enregistrées par le serveur.")

    # Éviter les doublons
    existing = await db.execute(
        select(GameHistory).where(GameHistory.game_id == payload.game_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cette partie a déjà été enregistrée.",
        )

    game = GameHistory(
        game_id=payload.game_id,
        user_id=current_user.id,
        user_score=payload.user_score,
        ai_name=payload.ai_name,
        ai_score=payload.ai_score,
        ai_difficulty=payload.ai_difficulty,
        won=payload.won,
        duration_seconds=payload.duration_seconds,
        turns_count=payload.turns_count,
        best_word=payload.best_word,
        best_word_score=payload.best_word_score,
    )
    db.add(game)

    # Mettre à jour les stats dénormalisées
    current_user.update_stats_after_game(
        score=payload.user_score,
        won=payload.won,
        best_word=payload.best_word,
        best_word_score=payload.best_word_score,
    )

    await db.flush()
    await _credit_solo_win(db, current_user, payload.game_id)
    await db.refresh(game)
    return game


async def _credit_solo_win(db: AsyncSession, user: User, game_id: str) -> None:
    """
    Lot A3 : crédits d'une victoire en solo. Le résultat envoyé par le client ne
    suffit pas : on vérifie la partie gardée par le serveur (terminée, gagnée par
    le joueur humain) et on prend la difficulté qu'elle avait vraiment.
    """
    from app.economy import service as economy
    from app.solo.models import SoloGame
    try:
        async with db.begin_nested():
            row = await db.get(SoloGame, game_id)
            state = (row.state or {}) if row else {}
            if row is None or str(state.get("status")) != "FINISHED":
                return
            humans = [p for p in state.get("players", []) if not p.get("is_ai")]
            if len(humans) != 1 or state.get("winner_id") != humans[0].get("id"):
                return
            rules = await economy.get_rules(db)
            await economy.earn_for_game(db, user, "solo_win", game_id,
                                        rules.solo_win.get(row.difficulty, 0), rules)
    except Exception as exc:
        logger.warning("Crédits de victoire solo non versés (user %d, %s) : %s", user.id, game_id, exc)


class PublicProfileOut(BaseModel):
    """
    Profil public : ce que les autres voient, selon les réglages de
    confidentialité du joueur (lot 8). Jamais d'e-mail, de nom, de prénom ni d'âge.
    Une partie masquée vaut null ; `hidden` dit lesquelles.
    """
    id: int
    display_name: str
    avatar_url: str | None = None
    bio: str | None = None
    country: str | None = None
    friend_code: str | None = None
    games_played: int | None = None
    games_won: int | None = None
    total_score: int | None = None
    best_score: int | None = None
    best_word: str | None = None
    best_word_score: int | None = None
    average_score: float | None = None
    win_rate: float | None = None
    mp_rating: int | None = None
    mp_peak_rating: int | None = None
    mp_games: int | None = None
    mp_wins: int | None = None
    mp_draws: int | None = None
    mp_best_score: int | None = None
    mp_win_rate: float | None = None
    created_at: datetime
    # Lot A3 : niveau d'abonnement en vigueur (badge à côté du pseudo) ; None = défaut
    tier_id: int | None = None
    hidden: list[str] = []


PROFILE_PART = ("avatar_url", "bio", "country", "friend_code")
STATS_PART = ("games_played", "games_won", "total_score", "best_score", "best_word", "best_word_score",
              "average_score", "win_rate", "mp_rating", "mp_peak_rating", "mp_games", "mp_wins", "mp_draws",
              "mp_best_score", "mp_win_rate")


@router.get("/{user_id}/profile", response_model=PublicProfileOut)
async def get_public_profile(user_id: int, db: AsyncSession = Depends(get_db),
                             viewer: User | None = Depends(get_current_user_optional)):
    """Profil public d'un joueur (lisible sans connexion), filtré par ses réglages de confidentialité."""
    result = await db.execute(
        select(User).where(User.id == user_id, User.is_active == True)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Utilisateur introuvable.")
    is_self = viewer is not None and viewer.id == user.id
    is_friend = viewer is not None and not is_self and bool(await friend_ids_of(db, viewer.id, [user.id]))
    data = {**UserOut.from_user(user).model_dump(), "friend_code": user.friend_code}
    hidden = []
    if not can_see(user.privacy_profile, is_self=is_self, is_friend=is_friend):
        hidden.append("profile")
        for k in PROFILE_PART:
            data[k] = None
    if not can_see(user.privacy_stats, is_self=is_self, is_friend=is_friend):
        hidden.append("stats")
        for k in STATS_PART:
            data[k] = None
    # Lot A4 : champs que l'administrateur ne montre pas aux autres (bio, pays, photo)
    if not is_self:
        from app.appconfig.profile import get_profile_rules
        for field in sorted((await get_profile_rules(db)).hidden_public()):
            data[field] = None
            hidden.append(field)
    return PublicProfileOut.model_validate({**data, "hidden": hidden})


# ── Préférences de jeu ─────────────────────────────────────────────

@router.get("/me/preferences", response_model=PreferencesResponse)
async def get_preferences(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """
    Retourne les préférences de jeu de l'utilisateur connecté.
    Les valeurs manquantes sont complétées par les défauts, puis la politique de
    l'administrateur s'applique (réglages verrouillés ou masqués, options retirées).
    """
    from app.appconfig.service import get_policy
    policy = await get_policy(db)
    prefs = current_user.get_preferences(policy)
    return PreferencesResponse(**await _without_locked_palette(db, current_user, prefs, policy))


async def _without_locked_palette(db: AsyncSession, user: User, prefs: dict, policy) -> dict:
    """
    Lot A3 : palette premium que le joueur n'a pas débloquée → défaut de
    l'administrateur (None : le client garde celle de l'appareil, s'il y a droit).
    """
    from app.economy.service import locked_palettes
    palette = prefs.get("colorPalette")
    default = policy.settings["colorPalette"].default
    if palette and palette != default and palette in await locked_palettes(db, user):
        prefs = {**prefs, "colorPalette": default}
    return prefs


@router.put("/me/preferences", response_model=PreferencesResponse)
async def update_preferences(
    payload: PreferencesPatchRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Met à jour les préférences de jeu (PATCH sémantique).
    Seuls les champs fournis dans le body sont modifiés.
    Les préférences sont fusionnées avec les valeurs existantes.
    """
    from app.appconfig.catalog import filter_patch
    from app.appconfig.service import get_policy
    policy = await get_policy(db)
    patch = {k: v for k, v in payload.model_dump().items() if v is not None}
    # Lot A2 : un réglage verrouillé / masqué ou une option retirée n'est pas enregistré
    # (ignoré sans erreur : un ancien client peut encore envoyer toutes ses valeurs)
    patch, refused = filter_patch(patch, policy)
    # Lot A3 : palette premium pas encore débloquée → refusée
    from app.economy.service import locked_palettes
    if patch.get("colorPalette") and patch["colorPalette"] != policy.settings["colorPalette"].default \
            and patch["colorPalette"] in await locked_palettes(db, current_user):
        refused.append("colorPalette")
        patch.pop("colorPalette")
    if refused:
        logger.info("Préférences refusées par la politique (user %d) : %s", current_user.id, refused)

    if not patch:
        # Rien à modifier — retourner les préférences actuelles
        return PreferencesResponse(**await _without_locked_palette(db, current_user, current_user.get_preferences(policy), policy))

    updated = await _without_locked_palette(db, current_user, current_user.set_preferences(patch, policy), policy)

    # Force SQLAlchemy à détecter la mutation du champ JSON
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(current_user, "game_preferences")

    await db.flush()
    return PreferencesResponse(**updated)