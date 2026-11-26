# app/admin/router.py
#
# Dashboard administrateur — lot A1 : vue d'ensemble, joueurs, journal.
#
#   GET    /admin/overview?days=30        chiffres clés + séries quotidiennes
#   GET    /admin/users                   liste (recherche, filtre, tri, pages)
#   GET    /admin/users/{id}              fiche complète d'un joueur
#   PATCH  /admin/users/{id}              activer / désactiver, rôle admin, pseudo
#   GET    /admin/actions                 journal des actions des administrateurs
#   GET/PUT/DELETE /admin/settings        politique des paramètres (lot A2)
#   GET/PUT/DELETE /admin/privacy-policy  politique de confidentialité (lot A2)
#
# Les lots suivants ajouteront ici : paramètres globaux (A2), abonnements et
# crédits (A3), messagerie, profil, notifications et publications (A4).
from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, field_validator
from sqlalchemy import and_, func, or_, select, true
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin.deps import log_action, require_admin
from app.admin.models import AdminAction
from app.chat.models import Message, MessageReport
from app.db.database import get_db
from app.db.models import GameHistory, User
from app.multiplayer.models import MultiplayerGame, RoomStatus

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin", tags=["Administration"])

MP_HISTORY_MODE = "multiplayer"     # = app/multiplayer/router.py HISTORY_MODE
WINDOWS = (7, 30, 90)               # périodes proposées par la vue d'ensemble (jours)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(dt: Optional[datetime]) -> Optional[datetime]:
    """SQLite rend des dates sans fuseau : on les considère en UTC."""
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _day_key(value) -> str:
    """date() rend un objet date (PostgreSQL) ou un texte (SQLite) : « AAAA-MM-JJ »."""
    return value.isoformat() if isinstance(value, date) else str(value)[:10]


async def _count(db: AsyncSession, stmt) -> int:
    return int((await db.execute(stmt)).scalar_one() or 0)


async def _per_day(db: AsyncSession, column, since: datetime, *where) -> dict[str, int]:
    day = func.date(column)
    rows = (await db.execute(
        select(day, func.count()).where(column >= since, *where).group_by(day)
    )).all()
    return {_day_key(d): int(n) for d, n in rows if d is not None}


# ── Vue d'ensemble ────────────────────────────────────────────────

class SeriesPoint(BaseModel):
    date: str
    signups: int
    solo: int
    multiplayer: int
    messages: int


class TopPlayer(BaseModel):
    id: int
    display_name: str
    mp_rating: int
    mp_games: int
    games_played: int


class Overview(BaseModel):
    generated_at: datetime
    days: int
    users: dict[str, int]
    games: dict[str, float]
    chat: dict[str, int]
    solo_by_difficulty: dict[str, int]
    series: list[SeriesPoint]
    top_players: list[TopPlayer]


@router.get("/overview", response_model=Overview, summary="Chiffres clés du jeu")
async def overview(days: int = Query(30, description="7, 30 ou 90"), _admin: User = Depends(require_admin),
                   db: AsyncSession = Depends(get_db)):
    if days not in WINDOWS:
        raise HTTPException(status_code=422, detail="Période invalide (7, 30 ou 90 jours).")
    now = _utcnow()
    today = now.date()
    # Fenêtre en jours calendaires (UTC), aujourd'hui compris
    since = datetime.combine(today - timedelta(days=days - 1), datetime.min.time(), tzinfo=timezone.utc)
    solo_only = GameHistory.ai_difficulty != MP_HISTORY_MODE

    users = {
        "total":            await _count(db, select(func.count(User.id))),
        "new_period":       await _count(db, select(func.count(User.id)).where(User.created_at >= since)),
        "active_24h":       await _count(db, select(func.count(User.id)).where(User.last_login_at >= now - timedelta(hours=24))),
        "active_7d":        await _count(db, select(func.count(User.id)).where(User.last_login_at >= now - timedelta(days=7))),
        "active_period":    await _count(db, select(func.count(User.id)).where(User.last_login_at >= since)),
        "disabled":         await _count(db, select(func.count(User.id)).where(User.is_active.is_(False))),
        "admins":           await _count(db, select(func.count(User.id)).where(User.is_admin.is_(True))),
        "profile_complete": await _count(db, select(func.count(User.id)).where(User.profile_complete.is_(True))),
    }

    solo_total = await _count(db, select(func.count(GameHistory.id)).where(solo_only))
    solo_won = await _count(db, select(func.count(GameHistory.id)).where(solo_only, GameHistory.won.is_(True)))
    solo_avg = (await db.execute(select(func.avg(GameHistory.user_score)).where(solo_only))).scalar_one()
    games = {
        "solo_total":       solo_total,
        "solo_period":      await _count(db, select(func.count(GameHistory.id)).where(solo_only, GameHistory.created_at >= since)),
        "solo_win_rate":    round(solo_won / solo_total * 100, 1) if solo_total else 0.0,
        "solo_avg_score":   round(float(solo_avg or 0), 1),
        "mp_total":         await _count(db, select(func.count(MultiplayerGame.id)).where(MultiplayerGame.status == RoomStatus.FINISHED)),
        "mp_period":        await _count(db, select(func.count(MultiplayerGame.id)).where(
                                MultiplayerGame.status == RoomStatus.FINISHED, MultiplayerGame.finished_at >= since)),
        "mp_active":        await _count(db, select(func.count(MultiplayerGame.id)).where(MultiplayerGame.status == RoomStatus.ACTIVE)),
        "mp_waiting":       await _count(db, select(func.count(MultiplayerGame.id)).where(MultiplayerGame.status == RoomStatus.WAITING)),
    }

    chat = {
        "messages_period": await _count(db, select(func.count(Message.id)).where(Message.created_at >= since)),
        "reports_pending": await _count(db, select(func.count(MessageReport.id)).where(MessageReport.resolved_at.is_(None))),
        "muted_now":       await _count(db, select(func.count(User.id)).where(User.chat_muted_until > now)),
    }

    by_diff = (await db.execute(
        select(GameHistory.ai_difficulty, func.count()).where(solo_only, GameHistory.created_at >= since)
        .group_by(GameHistory.ai_difficulty)
    )).all()

    signups = await _per_day(db, User.created_at, since)
    solo = await _per_day(db, GameHistory.created_at, since, solo_only)
    mp = await _per_day(db, MultiplayerGame.finished_at, since, MultiplayerGame.status == RoomStatus.FINISHED)
    messages = await _per_day(db, Message.created_at, since)
    series = []
    for i in range(days):
        key = (today - timedelta(days=days - 1 - i)).isoformat()
        series.append(SeriesPoint(date=key, signups=signups.get(key, 0), solo=solo.get(key, 0),
                                  multiplayer=mp.get(key, 0), messages=messages.get(key, 0)))

    top = (await db.execute(
        select(User).where(User.mp_games > 0, User.is_active.is_(True))
        .order_by(User.mp_rating.desc(), User.mp_games.desc()).limit(5)
    )).scalars().all()

    return Overview(
        generated_at=now, days=days, users=users, games=games, chat=chat,
        solo_by_difficulty={d or "?": int(n) for d, n in by_diff},
        series=series,
        top_players=[TopPlayer(id=u.id, display_name=u.display_name, mp_rating=u.mp_rating or 1200,
                               mp_games=u.mp_games or 0, games_played=u.games_played or 0) for u in top],
    )


# ── Joueurs ───────────────────────────────────────────────────────

class UserRow(BaseModel):
    id: int
    display_name: str
    email: str
    avatar_url: Optional[str]
    friend_code: Optional[str]
    auth_provider: str
    is_active: bool
    is_admin: bool
    profile_complete: bool
    games_played: int
    mp_games: int
    mp_rating: int
    chat_muted_until: Optional[datetime]
    created_at: datetime
    last_login_at: datetime

    @classmethod
    def of(cls, u: User) -> "UserRow":
        return cls(
            id=u.id, display_name=u.display_name, email=u.email, avatar_url=u.avatar_url,
            friend_code=u.friend_code, auth_provider=u.auth_provider or "email",
            is_active=bool(u.is_active), is_admin=bool(u.is_admin), profile_complete=bool(u.profile_complete),
            games_played=u.games_played or 0, mp_games=u.mp_games or 0, mp_rating=u.mp_rating or 1200,
            chat_muted_until=_as_utc(u.chat_muted_until),
            created_at=_as_utc(u.created_at), last_login_at=_as_utc(u.last_login_at),
        )


class UsersPage(BaseModel):
    items: list[UserRow]
    total: int
    page: int
    page_size: int


SORTS = {
    "created": User.created_at.desc(),
    "login":   User.last_login_at.desc(),
    "games":   User.games_played.desc(),
    "rating":  User.mp_rating.desc(),
    "name":    func.lower(User.display_name).asc(),
}


@router.get("/users", response_model=UsersPage, summary="Liste des joueurs")
async def list_users(
    q: str = Query("", max_length=64, description="Pseudo, e-mail ou code ami"),
    status: Literal["all", "active", "disabled", "admin", "muted"] = "all",
    sort: Literal["created", "login", "games", "rating", "name"] = "created",
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=5, le=100),
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    conditions = []
    term = q.strip()
    if term:
        like = f"%{term.lower()}%"
        conditions.append(or_(
            func.lower(User.display_name).like(like),
            func.lower(User.email).like(like),
            func.lower(func.coalesce(User.friend_code, "")).like(like),
        ))
    if status == "active":
        conditions.append(User.is_active.is_(True))
    elif status == "disabled":
        conditions.append(User.is_active.is_(False))
    elif status == "admin":
        conditions.append(User.is_admin.is_(True))
    elif status == "muted":
        conditions.append(User.chat_muted_until > _utcnow())

    where = and_(*conditions) if conditions else true()
    total = await _count(db, select(func.count(User.id)).where(where))
    rows = (await db.execute(
        select(User).where(where).order_by(SORTS[sort], User.id.desc())
        .offset((page - 1) * page_size).limit(page_size)
    )).scalars().all()
    return UsersPage(items=[UserRow.of(u) for u in rows], total=total, page=page, page_size=page_size)


class RecentGame(BaseModel):
    game_id: str
    mode: str                 # solo | multiplayer
    opponent: str
    difficulty: Optional[str]
    user_score: int
    opponent_score: int
    won: bool
    rating_delta: Optional[int]
    created_at: datetime


class ActionOut(BaseModel):
    id: int
    action: str
    admin_id: Optional[int]
    admin_name: Optional[str]
    target_type: Optional[str]
    target_id: Optional[int]
    target_name: Optional[str]
    details: Optional[dict]
    created_at: datetime


class UserDetail(UserRow):
    first_name: Optional[str]
    last_name: Optional[str]
    age: Optional[int]
    country: Optional[str]
    bio: Optional[str]
    is_verified: bool
    stats: dict[str, float]
    best_word: Optional[str]
    privacy: dict
    messages_count: int
    reports_against: int
    reports_pending: int
    recent_games: list[RecentGame]
    actions: list[ActionOut]


async def _user_or_404(db: AsyncSession, user_id: int) -> User:
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Joueur introuvable.")
    return user


async def _actions(db: AsyncSession, *where, limit: int = 50, before_id: Optional[int] = None) -> list[ActionOut]:
    conditions = list(where)
    if before_id:
        conditions.append(AdminAction.id < before_id)
    rows = (await db.execute(
        select(AdminAction).where(*conditions).order_by(AdminAction.id.desc()).limit(limit)
    )).scalars().all()
    ids = {r.admin_id for r in rows if r.admin_id} | {r.target_id for r in rows if r.target_type == "user" and r.target_id}
    names = dict((await db.execute(select(User.id, User.display_name).where(User.id.in_(ids)))).all()) if ids else {}
    return [ActionOut(
        id=r.id, action=r.action, admin_id=r.admin_id, admin_name=names.get(r.admin_id),
        target_type=r.target_type, target_id=r.target_id,
        target_name=names.get(r.target_id) if r.target_type == "user" else None,
        details=r.details, created_at=_as_utc(r.created_at),
    ) for r in rows]


async def _detail(db: AsyncSession, user: User) -> UserDetail:
    from app.users.privacy import settings_of

    games = (await db.execute(
        select(GameHistory).where(GameHistory.user_id == user.id)
        .order_by(GameHistory.created_at.desc()).limit(10)
    )).scalars().all()
    own_messages = select(Message.id).where(Message.author_id == user.id)
    base = UserRow.of(user).model_dump()
    return UserDetail(
        **base,
        first_name=user.first_name, last_name=user.last_name, age=user.age, country=user.country,
        bio=user.bio, is_verified=bool(user.is_verified),
        stats={
            "games_played": user.games_played or 0, "games_won": user.games_won or 0,
            "win_rate": user.win_rate, "best_score": user.best_score or 0,
            "average_score": user.average_score or 0.0, "best_word_score": user.best_word_score or 0,
            "mp_games": user.mp_games or 0, "mp_wins": user.mp_wins or 0, "mp_draws": user.mp_draws or 0,
            "mp_win_rate": user.mp_win_rate, "mp_rating": user.mp_rating or 1200,
            "mp_peak_rating": user.mp_peak_rating or 1200, "mp_best_score": user.mp_best_score or 0,
        },
        best_word=user.best_word,
        privacy=settings_of(user).model_dump(),
        messages_count=await _count(db, select(func.count(Message.id)).where(Message.author_id == user.id)),
        reports_against=await _count(db, select(func.count(MessageReport.id)).where(MessageReport.message_id.in_(own_messages))),
        reports_pending=await _count(db, select(func.count(MessageReport.id)).where(
            MessageReport.message_id.in_(own_messages), MessageReport.resolved_at.is_(None))),
        recent_games=[RecentGame(
            game_id=g.game_id,
            mode="multiplayer" if g.ai_difficulty == MP_HISTORY_MODE else "solo",
            opponent=g.ai_name, difficulty=None if g.ai_difficulty == MP_HISTORY_MODE else g.ai_difficulty,
            user_score=g.user_score or 0, opponent_score=g.ai_score or 0, won=bool(g.won),
            rating_delta=g.rating_delta, created_at=_as_utc(g.created_at),
        ) for g in games],
        actions=await _actions(db, AdminAction.target_type == "user", AdminAction.target_id == user.id, limit=20),
    )


@router.get("/users/{user_id}", response_model=UserDetail, summary="Fiche d'un joueur")
async def get_user(user_id: int, _admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    return await _detail(db, await _user_or_404(db, user_id))


class UserPatch(BaseModel):
    is_active: Optional[bool] = None
    is_admin: Optional[bool] = None
    display_name: Optional[str] = None
    reason: Optional[str] = None          # note libre, gardée dans le journal

    @field_validator("display_name")
    @classmethod
    def _name(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip()
        if not 2 <= len(v) <= 32:
            raise ValueError("Le pseudo doit contenir de 2 à 32 caractères.")
        return v

    @field_validator("reason")
    @classmethod
    def _reason(cls, v: Optional[str]) -> Optional[str]:
        v = (v or "").strip()
        return v[:200] or None


def _set_firebase_disabled(firebase_uid: str, disabled: bool) -> None:
    """Bloque (ou rouvre) la connexion côté Firebase ; sans Firebase (tests, dev) : rien."""
    from app.core.firebase import is_firebase_ready
    if not is_firebase_ready():
        return
    from firebase_admin import auth as firebase_auth
    try:
        firebase_auth.update_user(firebase_uid, disabled=disabled)
        if disabled:
            firebase_auth.revoke_refresh_tokens(firebase_uid)
    except Exception as exc:                      # le compte reste bloqué côté API quoi qu'il arrive
        logger.warning("Firebase : blocage du compte %s impossible : %s", firebase_uid, exc)


@router.patch("/users/{user_id}", response_model=UserDetail, summary="Modifier un joueur")
async def update_user(user_id: int, body: UserPatch, admin: User = Depends(require_admin),
                      db: AsyncSession = Depends(get_db)):
    user = await _user_or_404(db, user_id)
    is_self = user.id == admin.id
    note = {"reason": body.reason} if body.reason else {}

    if body.is_active is not None and body.is_active != bool(user.is_active):
        if is_self:
            raise HTTPException(status_code=400, detail="Vous ne pouvez pas désactiver votre propre compte.")
        user.is_active = body.is_active
        log_action(db, admin, "user.enable" if body.is_active else "user.disable",
                   target_type="user", target_id=user.id, details=note)
        await asyncio.to_thread(_set_firebase_disabled, user.firebase_uid, not body.is_active)

    if body.is_admin is not None and body.is_admin != bool(user.is_admin):
        if is_self:
            raise HTTPException(status_code=400, detail="Vous ne pouvez pas changer votre propre rôle.")
        if not body.is_admin:
            admins = await _count(db, select(func.count(User.id)).where(User.is_admin.is_(True)))
            if admins <= 1:
                raise HTTPException(status_code=400, detail="Il doit rester au moins un administrateur.")
        user.is_admin = body.is_admin
        log_action(db, admin, "user.promote" if body.is_admin else "user.demote",
                   target_type="user", target_id=user.id, details=note)

    if body.display_name is not None and body.display_name != user.display_name:
        log_action(db, admin, "user.rename", target_type="user", target_id=user.id,
                   details={"from": user.display_name, "to": body.display_name, **note})
        user.display_name = body.display_name

    await db.flush()
    logger.info("Admin %d a modifié le joueur %d : %s", admin.id, user.id, body.model_dump(exclude_none=True))
    return await _detail(db, user)


# ── Journal ───────────────────────────────────────────────────────

@router.get("/actions", response_model=list[ActionOut], summary="Journal des actions des administrateurs")
async def list_actions(limit: int = Query(50, ge=1, le=200), before_id: Optional[int] = Query(None, ge=1),
                       _admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    return await _actions(db, limit=limit, before_id=before_id)


# ── Paramètres globaux (lot A2) ───────────────────────────────────

from app.appconfig import service as config_service                          # noqa: E402
from app.appconfig.catalog import SettingsPolicy, catalog_out, builtin_policy  # noqa: E402
from app.appconfig.privacy_doc import PrivacyPolicyDoc                        # noqa: E402


class SettingsAdminOut(BaseModel):
    catalog: list[dict]
    policy: dict
    custom: bool
    updated_at: Optional[datetime] = None
    updated_by_name: Optional[str] = None
    privacy_updates: dict[str, int] = {}       # comptes ramenés au défaut lors de l'enregistrement


class SettingsAdminIn(SettingsPolicy):
    note: Optional[str] = None


async def _name_of(db: AsyncSession, user_id: Optional[int]) -> Optional[str]:
    if not user_id:
        return None
    return (await db.execute(select(User.display_name).where(User.id == user_id))).scalar_one_or_none()


async def _settings_out(db: AsyncSession, policy: SettingsPolicy, privacy_updates=None) -> SettingsAdminOut:
    row = await db.get(config_service.AppConfig, config_service.SETTINGS_KEY)
    return SettingsAdminOut(
        catalog=catalog_out(),
        policy={k: p.model_dump() for k, p in policy.settings.items()},
        custom=row is not None,
        updated_at=_as_utc(row.updated_at) if row else None,
        updated_by_name=await _name_of(db, row.updated_by) if row else None,
        privacy_updates=privacy_updates or {},
    )


def _changed_keys(before: SettingsPolicy, after: SettingsPolicy) -> list[str]:
    return [k for k in after.settings if before.settings[k] != after.settings[k]]


@router.get("/settings", response_model=SettingsAdminOut, summary="Politique des paramètres")
async def get_settings_policy(_admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    config_service.invalidate()                  # toujours la version en base
    return await _settings_out(db, await config_service.get_policy(db))


@router.put("/settings", response_model=SettingsAdminOut, summary="Modifier la politique des paramètres")
async def put_settings_policy(body: SettingsAdminIn, admin: User = Depends(require_admin),
                              db: AsyncSession = Depends(get_db)):
    config_service.invalidate()
    before = await config_service.get_policy(db)
    policy = SettingsPolicy(settings=body.settings)       # déjà complétée et validée
    await config_service.save(db, config_service.SETTINGS_KEY,
                              {"settings": {k: p.model_dump() for k, p in policy.settings.items()}}, admin.id)
    updates = await config_service.enforce_privacy(db, policy)
    changed = _changed_keys(before, policy)
    log_action(db, admin, "config.settings", target_type="config",
               details={"changed": changed, **({"privacy_updates": updates} if updates else {}),
                        **({"reason": body.note.strip()[:200]} if body.note and body.note.strip() else {})})
    await db.flush()
    logger.info("Admin %d : politique des paramètres modifiée (%s)", admin.id, changed)
    return await _settings_out(db, policy, updates)


@router.delete("/settings", response_model=SettingsAdminOut, summary="Revenir aux paramètres d'origine")
async def reset_settings_policy(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    if await config_service.delete(db, config_service.SETTINGS_KEY):
        log_action(db, admin, "config.settings_reset", target_type="config")
        await db.flush()
    return await _settings_out(db, builtin_policy())


# ── Politique de confidentialité (lot A2) ─────────────────────────

class PrivacyAdminOut(BaseModel):
    custom: bool
    document: Optional[dict] = None
    updated_at: Optional[datetime] = None
    updated_by_name: Optional[str] = None


async def _privacy_out(db: AsyncSession) -> PrivacyAdminOut:
    row = await db.get(config_service.AppConfig, config_service.PRIVACY_KEY)
    if row is None:
        return PrivacyAdminOut(custom=False)
    return PrivacyAdminOut(custom=True, document={k: v for k, v in row.value.items() if k != "note"},
                           updated_at=_as_utc(row.updated_at), updated_by_name=await _name_of(db, row.updated_by))


@router.get("/privacy-policy", response_model=PrivacyAdminOut, summary="Politique de confidentialité (admin)")
async def get_privacy_policy(_admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    return await _privacy_out(db)


@router.put("/privacy-policy", response_model=PrivacyAdminOut, summary="Publier la politique de confidentialité")
async def put_privacy_policy(body: PrivacyPolicyDoc, admin: User = Depends(require_admin),
                             db: AsyncSession = Depends(get_db)):
    await config_service.save(db, config_service.PRIVACY_KEY, body.model_dump(mode="json", exclude={"note"}), admin.id)
    note = (body.note or "").strip()
    log_action(db, admin, "config.privacy_policy", target_type="config",
               details={"updated_on": body.updated_on.isoformat(), **({"reason": note[:200]} if note else {})})
    await db.flush()
    return await _privacy_out(db)


@router.delete("/privacy-policy", response_model=PrivacyAdminOut, summary="Revenir au texte d'origine")
async def reset_privacy_policy(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    if await config_service.delete(db, config_service.PRIVACY_KEY):
        log_action(db, admin, "config.privacy_policy_reset", target_type="config")
        await db.flush()
    return await _privacy_out(db)
