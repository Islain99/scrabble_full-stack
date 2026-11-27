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
#   GET/POST/PATCH/DELETE /admin/tiers    niveaux d'abonnement (lot A3)
#   PUT    /admin/users/{id}/tier         attribuer un niveau, avec ou sans date de fin
#   POST   /admin/users/{id}/credits      créditer / débiter (motif obligatoire)
#   GET    /admin/users/{id}/transactions, /admin/transactions   grand livre
#   GET/PUT/DELETE /admin/economy         règles des crédits (gains, indices, palettes premium)
#   GET/PUT/DELETE /admin/chat            règles de la messagerie (lot A4)
#   GET/PUT/DELETE /admin/profile-fields  champs du profil exigés / montrés (lot A4)
#   /admin/announcements                  publications : brouillon, publier, retirer (lot A4)
#
# Les lots suivants ajouteront ici : paramètres globaux (A2), abonnements et
# crédits (A3), messagerie, profil, notifications et publications (A4).
from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, field_validator, model_validator
from sqlalchemy import and_, func, or_, select, true, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin.deps import log_action, require_admin
from app.admin.models import AdminAction
from app.chat.models import Message, MessageReport
from app.db.database import get_db
from app.db.models import GameHistory, User
from app.multiplayer.models import MultiplayerGame, RoomStatus
from app.economy import service as economy_service

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
    # Lot A3 : niveau en vigueur (None = défaut), attribution brute, crédits
    tier_id: Optional[int] = None
    assigned_tier_id: Optional[int] = None
    tier_expires_at: Optional[datetime] = None
    credits: int = 0

    @classmethod
    def of(cls, u: User) -> "UserRow":
        return cls(
            id=u.id, display_name=u.display_name, email=u.email, avatar_url=u.avatar_url,
            friend_code=u.friend_code, auth_provider=u.auth_provider or "email",
            is_active=bool(u.is_active), is_admin=bool(u.is_admin), profile_complete=bool(u.profile_complete),
            games_played=u.games_played or 0, mp_games=u.mp_games or 0, mp_rating=u.mp_rating or 1200,
            chat_muted_until=_as_utc(u.chat_muted_until),
            created_at=_as_utc(u.created_at), last_login_at=_as_utc(u.last_login_at),
            tier_id=u.effective_tier_id(), assigned_tier_id=u.tier_id,
            tier_expires_at=_as_utc(u.tier_expires_at), credits=u.credits or 0,
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
    "credits": User.credits.desc(),
}


@router.get("/users", response_model=UsersPage, summary="Liste des joueurs")
async def list_users(
    q: str = Query("", max_length=64, description="Pseudo, e-mail ou code ami"),
    status: Literal["all", "active", "disabled", "admin", "muted"] = "all",
    sort: Literal["created", "login", "games", "rating", "name", "credits"] = "created",
    tier: str = Query("all", pattern=r"^(all|default|\d+)$", description="Niveau : all, default ou id"),
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
    # Lot A3 : niveau en vigueur (un abonnement expiré compte comme le niveau par défaut)
    active_tier = or_(User.tier_expires_at.is_(None), User.tier_expires_at > _utcnow())
    if tier == "default":
        conditions.append(or_(User.tier_id.is_(None), ~active_tier))
    elif tier != "all":
        conditions.append(and_(User.tier_id == int(tier), active_tier))

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
    unlocked_palettes: list[str] = []


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
        unlocked_palettes=sorted(await economy_service.owned(db, user.id)),
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


# ── Abonnements (lot A3) ──────────────────────────────────────────

import re                                                                      # noqa: E402
from app.economy.models import CreditTransaction, SubscriptionTier, UserUnlock  # noqa: E402
from app.economy.router import TierOut, TransactionOut                        # noqa: E402
from app.economy.rules import ALL_KINDS, EconomyRules, builtin_rules           # noqa: E402

SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,31}$")
COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


class TierAdminOut(TierOut):
    users: int                     # abonnés en vigueur (pour le niveau par défaut : tous les autres)


class TierIn(BaseModel):
    slug: Optional[str] = None
    name_fr: Optional[str] = None
    name_en: Optional[str] = None
    description_fr: Optional[str] = None
    description_en: Optional[str] = None
    color: Optional[str] = None
    badge: Optional[str] = None
    sort_order: Optional[int] = None
    is_default: Optional[bool] = None

    @field_validator("slug")
    @classmethod
    def _slug(cls, v):
        if v is not None and not SLUG_RE.match(v):
            raise ValueError("Identifiant : 2 à 32 caractères, minuscules, chiffres et tirets.")
        return v

    @field_validator("name_fr", "name_en")
    @classmethod
    def _name(cls, v):
        if v is None:
            return v
        v = v.strip()
        if not 1 <= len(v) <= 40:
            raise ValueError("Le nom fait de 1 à 40 caractères.")
        return v

    @field_validator("description_fr", "description_en")
    @classmethod
    def _desc(cls, v):
        if v is None:
            return v
        v = v.strip()
        if len(v) > 300:
            raise ValueError("La description fait 300 caractères au plus.")
        return v

    @field_validator("color")
    @classmethod
    def _color(cls, v):
        if v is not None and not COLOR_RE.match(v):
            raise ValueError("Couleur au format #rrggbb.")
        return v.lower() if v else v

    @field_validator("badge")
    @classmethod
    def _badge(cls, v):
        if v is None:
            return v
        v = v.strip()
        if len(v) > 8:
            raise ValueError("Le badge fait 8 caractères au plus (un emoji ou un sigle).")
        return v

    @field_validator("sort_order")
    @classmethod
    def _order(cls, v):
        if v is not None and not -1000 <= v <= 1000:
            raise ValueError("Ordre entre -1000 et 1000.")
        return v


def _active_tier_condition(now: datetime):
    return or_(User.tier_expires_at.is_(None), User.tier_expires_at > now)


async def _tiers_out(db: AsyncSession) -> list[TierAdminOut]:
    now = _utcnow()
    counts = dict((await db.execute(
        select(User.tier_id, func.count(User.id)).where(User.tier_id.is_not(None), _active_tier_condition(now))
        .group_by(User.tier_id)
    )).all())
    total = await _count(db, select(func.count(User.id)))
    out = []
    for t in await economy_service.tiers(db):
        n = total - sum(counts.values()) if t.is_default else counts.get(t.id, 0)
        out.append(TierAdminOut(**TierOut.of(t).model_dump(), users=n))
    return out


async def _tier_or_404(db: AsyncSession, tier_id: int) -> SubscriptionTier:
    tier = await db.get(SubscriptionTier, tier_id)
    if tier is None:
        raise HTTPException(status_code=404, detail="Niveau introuvable.")
    return tier


async def _set_default(db: AsyncSession, tier: SubscriptionTier) -> None:
    for other in await economy_service.tiers(db):
        other.is_default = other.id == tier.id
    # Le niveau par défaut ne s'attribue pas : ses « abonnés » redeviennent sans niveau
    await db.execute(update(User).where(User.tier_id == tier.id).values(tier_id=None, tier_expires_at=None))


@router.get("/tiers", response_model=list[TierAdminOut], summary="Niveaux d'abonnement")
async def admin_tiers(_admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    return await _tiers_out(db)


@router.post("/tiers", response_model=list[TierAdminOut], status_code=201, summary="Créer un niveau")
async def create_tier(body: TierIn, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    if not body.slug or not body.name_fr or not body.name_en:
        raise HTTPException(status_code=422, detail="Identifiant, nom français et nom anglais sont requis.")
    if (await db.execute(select(SubscriptionTier.id).where(SubscriptionTier.slug == body.slug))).first():
        raise HTTPException(status_code=409, detail="Cet identifiant est déjà pris.")
    existing = await economy_service.tiers(db)
    tier = SubscriptionTier(**body.model_dump(exclude_none=True, exclude={"is_default"}))
    db.add(tier)
    await db.flush()
    # Le premier niveau créé devient le niveau par défaut
    if body.is_default or not any(t.is_default for t in existing):
        await _set_default(db, tier)
    log_action(db, admin, "tier.create", target_type="tier", target_id=tier.id, details={"slug": tier.slug})
    await db.flush()
    return await _tiers_out(db)


@router.patch("/tiers/{tier_id}", response_model=list[TierAdminOut], summary="Modifier un niveau")
async def update_tier(tier_id: int, body: TierIn, admin: User = Depends(require_admin),
                      db: AsyncSession = Depends(get_db)):
    tier = await _tier_or_404(db, tier_id)
    changes = body.model_dump(exclude_none=True)
    if "slug" in changes and changes["slug"] != tier.slug:
        if (await db.execute(select(SubscriptionTier.id).where(SubscriptionTier.slug == changes["slug"]))).first():
            raise HTTPException(status_code=409, detail="Cet identifiant est déjà pris.")
    if changes.get("is_default") is False and tier.is_default:
        raise HTTPException(status_code=400, detail="Choisissez un autre niveau par défaut plutôt.")
    make_default = changes.pop("is_default", None)
    for field, value in changes.items():
        setattr(tier, field, value)
    if make_default and not tier.is_default:
        await _set_default(db, tier)
        changes["is_default"] = True
    if changes:
        log_action(db, admin, "tier.update", target_type="tier", target_id=tier.id,
                   details={"slug": tier.slug, "changed": sorted(changes)})
    await db.flush()
    return await _tiers_out(db)


@router.delete("/tiers/{tier_id}", response_model=list[TierAdminOut], summary="Supprimer un niveau")
async def delete_tier(tier_id: int, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    tier = await _tier_or_404(db, tier_id)
    if tier.is_default:
        raise HTTPException(status_code=400, detail="Le niveau par défaut ne se supprime pas.")
    moved = (await db.execute(
        update(User).where(User.tier_id == tier.id).values(tier_id=None, tier_expires_at=None)
    )).rowcount or 0
    log_action(db, admin, "tier.delete", target_type="tier", target_id=tier.id,
               details={"slug": tier.slug, "users": moved})
    await db.delete(tier)
    await db.flush()
    return await _tiers_out(db)


class TierAssignIn(BaseModel):
    tier_id: Optional[int] = None              # None = niveau par défaut
    expires_at: Optional[datetime] = None      # None = sans date de fin
    reason: Optional[str] = None


@router.put("/users/{user_id}/tier", response_model=UserDetail, summary="Attribuer un niveau d'abonnement")
async def assign_tier(user_id: int, body: TierAssignIn, admin: User = Depends(require_admin),
                      db: AsyncSession = Depends(get_db)):
    user = await _user_or_404(db, user_id)
    tier = await _tier_or_404(db, body.tier_id) if body.tier_id is not None else None
    if tier is not None and tier.is_default:
        tier = None                                         # le défaut = pas d'abonnement
    expires = _as_utc(body.expires_at) if tier else None
    if expires is not None and expires <= _utcnow():
        raise HTTPException(status_code=422, detail="La date de fin doit être dans le futur.")
    before = {"tier": user.tier_id, "expires_at": user.tier_expires_at.isoformat() if user.tier_expires_at else None}
    user.tier_id = tier.id if tier else None
    user.tier_expires_at = expires
    details = {"tier": tier.slug if tier else None, "expires_at": expires.isoformat() if expires else None,
               "from_tier_id": before["tier"]}
    if body.reason and body.reason.strip():
        details["reason"] = body.reason.strip()[:200]
    log_action(db, admin, "user.tier", target_type="user", target_id=user.id, details=details)
    await db.flush()
    return await _detail(db, user)


# ── Crédits (lot A3) ──────────────────────────────────────────────

class CreditAdjustIn(BaseModel):
    amount: int
    reason: str

    @field_validator("amount")
    @classmethod
    def _amount(cls, v):
        if v == 0 or abs(v) > 1_000_000:
            raise ValueError("Montant non nul, entre -1 000 000 et 1 000 000.")
        return v

    @field_validator("reason")
    @classmethod
    def _reason(cls, v):
        v = (v or "").strip()
        if not 3 <= len(v) <= 200:
            raise ValueError("Indiquez un motif (3 à 200 caractères).")
        return v


@router.post("/users/{user_id}/credits", response_model=UserDetail, summary="Créditer ou débiter un joueur")
async def adjust_credits(user_id: int, body: CreditAdjustIn, admin: User = Depends(require_admin),
                         db: AsyncSession = Depends(get_db)):
    user = await _user_or_404(db, user_id)
    kind = "admin_grant" if body.amount > 0 else "admin_debit"
    try:
        tx = await economy_service.apply(db, user, body.amount, kind, note=body.reason, admin_id=admin.id)
    except economy_service.InsufficientCredits as exc:
        raise HTTPException(status_code=400, detail=f"Débit impossible : le joueur n'a que {exc.balance} crédits.")
    log_action(db, admin, "user.credits", target_type="user", target_id=user.id,
               details={"amount": body.amount, "balance_after": tx.balance_after, "reason": body.reason})
    await db.flush()
    return await _detail(db, user)


class AdminTransactionOut(TransactionOut):
    user_id: int
    user_name: Optional[str] = None
    admin_name: Optional[str] = None


async def _transactions(db: AsyncSession, *where, limit: int = 50, before_id: Optional[int] = None):
    conditions = list(where)
    if before_id:
        conditions.append(CreditTransaction.id < before_id)
    rows = (await db.execute(
        select(CreditTransaction).where(*conditions).order_by(CreditTransaction.id.desc()).limit(limit)
    )).scalars().all()
    ids = {r.user_id for r in rows} | {r.admin_id for r in rows if r.admin_id}
    names = dict((await db.execute(select(User.id, User.display_name).where(User.id.in_(ids)))).all()) if ids else {}
    return [AdminTransactionOut(**TransactionOut.of(r).model_dump(), user_id=r.user_id,
                                user_name=names.get(r.user_id), admin_name=names.get(r.admin_id)) for r in rows]


@router.get("/users/{user_id}/transactions", response_model=list[AdminTransactionOut],
            summary="Mouvements de crédits d'un joueur")
async def user_transactions(user_id: int, limit: int = Query(30, ge=1, le=200),
                            before_id: Optional[int] = Query(None, ge=1),
                            _admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    await _user_or_404(db, user_id)
    return await _transactions(db, CreditTransaction.user_id == user_id, limit=limit, before_id=before_id)


@router.get("/transactions", response_model=list[AdminTransactionOut], summary="Grand livre des crédits")
async def all_transactions(kind: Optional[str] = Query(None), limit: int = Query(50, ge=1, le=200),
                           before_id: Optional[int] = Query(None, ge=1),
                           _admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    if kind and kind not in ALL_KINDS:
        raise HTTPException(status_code=422, detail="Type de mouvement inconnu.")
    where = [CreditTransaction.kind == kind] if kind else []
    return await _transactions(db, *where, limit=limit, before_id=before_id)


class EconomyAdminOut(BaseModel):
    rules: dict
    custom: bool
    updated_at: Optional[datetime] = None
    updated_by_name: Optional[str] = None
    stats: dict
    kept_unlocks: int = 0          # palettes devenues premium, gardées par ceux qui les utilisaient


class EconomyAdminIn(EconomyRules):
    note: Optional[str] = None


async def _economy_out(db: AsyncSession, kept: int = 0) -> EconomyAdminOut:
    config_service.invalidate()
    rules = await economy_service.get_rules(db)
    row = await db.get(config_service.AppConfig, economy_service.ECONOMY_KEY)
    since = economy_service.period_start(30)
    by_kind = dict((await db.execute(
        select(CreditTransaction.kind, func.coalesce(func.sum(CreditTransaction.amount), 0))
        .where(CreditTransaction.created_at >= since).group_by(CreditTransaction.kind)
    )).all())
    hints = await _count(db, select(func.count(CreditTransaction.id)).where(
        CreditTransaction.kind == "hint", CreditTransaction.created_at >= since))
    unlocks = dict((await db.execute(
        select(UserUnlock.item_key, func.count()).where(UserUnlock.item_type == "palette").group_by(UserUnlock.item_key)
    )).all())
    stats = {
        "circulation": int((await db.execute(select(func.coalesce(func.sum(User.credits), 0)))).scalar_one() or 0),
        "holders": await _count(db, select(func.count(User.id)).where(User.credits > 0)),
        "earned_30d": {k: int(v) for k, v in by_kind.items() if v > 0},
        "spent_30d": {k: -int(v) for k, v in by_kind.items() if v < 0},
        "hints_30d": hints,
        "palette_unlocks": {k: int(v) for k, v in unlocks.items()},
    }
    return EconomyAdminOut(
        rules=rules.model_dump(), custom=row is not None,
        updated_at=_as_utc(row.updated_at) if row else None,
        updated_by_name=await _name_of(db, row.updated_by) if row else None,
        stats=stats, kept_unlocks=kept,
    )


@router.get("/economy", response_model=EconomyAdminOut, summary="Règles et chiffres des crédits")
async def get_economy(_admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    return await _economy_out(db)


@router.put("/economy", response_model=EconomyAdminOut, summary="Modifier les règles des crédits")
async def put_economy(body: EconomyAdminIn, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    config_service.invalidate()
    before = await economy_service.get_rules(db)
    rules = EconomyRules(**body.model_dump(exclude={"note"}))
    await config_service.save(db, economy_service.ECONOMY_KEY, rules.model_dump(), admin.id)
    kept = await economy_service.keep_current_palettes(
        db, set(rules.premium_palettes) - set(before.premium_palettes))
    old, new = before.model_dump(), rules.model_dump()
    details = {"changed": [k for k in new if new[k] != old[k]]}
    if kept:
        details["kept_unlocks"] = kept
    if body.note and body.note.strip():
        details["reason"] = body.note.strip()[:200]
    log_action(db, admin, "config.economy", target_type="config", details=details)
    await db.flush()
    return await _economy_out(db, kept)


@router.delete("/economy", response_model=EconomyAdminOut, summary="Revenir aux règles d'origine")
async def reset_economy(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    if await config_service.delete(db, economy_service.ECONOMY_KEY):
        log_action(db, admin, "config.economy_reset", target_type="config")
        await db.flush()
    return await _economy_out(db)


# ── Messagerie (lot A4) ───────────────────────────────────────────

from app.chat.models import Conversation, ConversationKind                   # noqa: E402
from app.chat.settings import CHAT_KEY, ChatRules, get_chat_rules            # noqa: E402


class ChatAdminOut(BaseModel):
    rules: dict
    builtin_words: list[str]
    custom: bool
    updated_at: Optional[datetime] = None
    updated_by_name: Optional[str] = None
    slow_mode_s: int = 0
    stats: dict
    muted: list[dict]


class ChatAdminIn(ChatRules):
    note: Optional[str] = None


async def _chat_out(db: AsyncSession) -> ChatAdminOut:
    from app.chat.moderation import BLOCKED_WORDS
    config_service.invalidate()
    rules = await get_chat_rules(db)
    row = await db.get(config_service.AppConfig, CHAT_KEY)
    glob = (await db.execute(select(Conversation).where(Conversation.kind == ConversationKind.GLOBAL))).scalars().first()
    now = _utcnow()
    day = now - timedelta(days=1)
    week = now - timedelta(days=7)
    muted = (await db.execute(
        select(User.id, User.display_name, User.chat_muted_until).where(User.chat_muted_until > now)
        .order_by(User.chat_muted_until.desc()).limit(50)
    )).all()
    stats = {
        "messages_24h": await _count(db, select(func.count(Message.id)).where(Message.created_at >= day)),
        "messages_7d": await _count(db, select(func.count(Message.id)).where(Message.created_at >= week)),
        "global_7d": await _count(db, select(func.count(Message.id)).where(
            Message.created_at >= week, Message.conversation_id == (glob.id if glob else -1))),
        "authors_7d": await _count(db, select(func.count(func.distinct(Message.author_id))).where(Message.created_at >= week)),
        "reports_pending": await _count(db, select(func.count(MessageReport.id)).where(MessageReport.resolved_at.is_(None))),
    }
    return ChatAdminOut(
        rules=rules.model_dump(), builtin_words=list(BLOCKED_WORDS), custom=row is not None,
        updated_at=_as_utc(row.updated_at) if row else None,
        updated_by_name=await _name_of(db, row.updated_by) if row else None,
        slow_mode_s=glob.slow_mode_s if glob else 0, stats=stats,
        muted=[{"id": i, "display_name": n, "until": _as_utc(u)} for i, n, u in muted],
    )


@router.get("/chat", response_model=ChatAdminOut, summary="Règles et chiffres de la messagerie")
async def get_chat_admin(_admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    return await _chat_out(db)


@router.put("/chat", response_model=ChatAdminOut, summary="Modifier les règles de la messagerie")
async def put_chat_admin(body: ChatAdminIn, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    config_service.invalidate()
    before = (await get_chat_rules(db)).model_dump()
    rules = ChatRules(**body.model_dump(exclude={"note"}))
    await config_service.save(db, CHAT_KEY, rules.model_dump(), admin.id)
    after = rules.model_dump()
    details = {"changed": [k for k in after if after[k] != before[k]]}
    if body.note and body.note.strip():
        details["reason"] = body.note.strip()[:200]
    log_action(db, admin, "config.chat", target_type="config", details=details)
    await db.flush()
    return await _chat_out(db)


@router.delete("/chat", response_model=ChatAdminOut, summary="Revenir aux règles d'origine de la messagerie")
async def reset_chat_admin(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    if await config_service.delete(db, CHAT_KEY):
        log_action(db, admin, "config.chat_reset", target_type="config")
        await db.flush()
    return await _chat_out(db)


# ── Champs du profil (lot A4) ─────────────────────────────────────

from app.appconfig.profile import FIELDS as PROFILE_FIELDS, PROFILE_KEY, ProfileRules, get_profile_rules  # noqa: E402


class ProfileAdminOut(BaseModel):
    rules: dict
    fields: list[dict]                 # catalogue : nom, public possible, collecte d'origine
    custom: bool
    updated_at: Optional[datetime] = None
    updated_by_name: Optional[str] = None
    stats: dict
    recomputed: dict = {}


class ProfileAdminIn(ProfileRules):
    note: Optional[str] = None


async def _recompute_complete(db: AsyncSession, rules: ProfileRules) -> dict:
    """Statut « profil complet » de tous les comptes selon les nouveaux champs exigés."""
    from app.appconfig.profile import is_complete
    became, lost = 0, 0
    for user in (await db.execute(select(User))).scalars():
        now_complete = is_complete(user, rules)
        if now_complete != bool(user.profile_complete):
            became += now_complete
            lost += not now_complete
            user.profile_complete = now_complete
    await db.flush()
    return {"became_complete": became, "became_incomplete": lost}


async def _profile_out(db: AsyncSession, recomputed: Optional[dict] = None) -> ProfileAdminOut:
    config_service.invalidate()
    rules = await get_profile_rules(db)
    row = await db.get(config_service.AppConfig, PROFILE_KEY)
    total = await _count(db, select(func.count(User.id)))
    filled = {}
    for name in PROFILE_FIELDS:
        column = getattr(User, name)
        cond = column.is_not(None) if name == "age" else and_(column.is_not(None), column != "")
        filled[name] = await _count(db, select(func.count(User.id)).where(cond))
    return ProfileAdminOut(
        rules=rules.model_dump(),
        fields=[{"name": n, "origin": c, "can_be_public": p is not None} for n, (c, p) in PROFILE_FIELDS.items()],
        custom=row is not None,
        updated_at=_as_utc(row.updated_at) if row else None,
        updated_by_name=await _name_of(db, row.updated_by) if row else None,
        stats={"total": total, "complete": await _count(db, select(func.count(User.id)).where(User.profile_complete.is_(True))),
               "filled": filled},
        recomputed=recomputed or {},
    )


@router.get("/profile-fields", response_model=ProfileAdminOut, summary="Champs du profil")
async def get_profile_admin(_admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    return await _profile_out(db)


@router.put("/profile-fields", response_model=ProfileAdminOut, summary="Modifier les champs du profil")
async def put_profile_admin(body: ProfileAdminIn, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    config_service.invalidate()
    before = (await get_profile_rules(db)).model_dump()
    rules = ProfileRules(**body.model_dump(exclude={"note"}))
    await config_service.save(db, PROFILE_KEY, rules.model_dump(), admin.id)
    recomputed = await _recompute_complete(db, rules)
    after = rules.model_dump()
    changed = [n for n in after["fields"] if after["fields"][n] != before["fields"][n]]
    if after["min_age"] != before["min_age"]:
        changed.append("min_age")
    details = {"changed": changed, **{k: v for k, v in recomputed.items() if v}}
    if body.note and body.note.strip():
        details["reason"] = body.note.strip()[:200]
    log_action(db, admin, "config.profile", target_type="config", details=details)
    await db.flush()
    return await _profile_out(db, recomputed)


@router.delete("/profile-fields", response_model=ProfileAdminOut, summary="Revenir aux champs d'origine")
async def reset_profile_admin(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    from app.appconfig.profile import builtin_profile_rules
    recomputed = {}
    if await config_service.delete(db, PROFILE_KEY):
        recomputed = await _recompute_complete(db, builtin_profile_rules())
        log_action(db, admin, "config.profile_reset", target_type="config")
        await db.flush()
    return await _profile_out(db, recomputed)


# ── Publications (lot A4) ─────────────────────────────────────────

from app.announcements import service as ann_service                          # noqa: E402
from app.announcements.models import Announcement, AnnouncementStatus         # noqa: E402

ANN_KINDS = ("info", "event", "update", "maintenance", "promo")


class AnnouncementIn(BaseModel):
    title_fr: str
    title_en: str
    body_fr: str = ""
    body_en: str = ""
    kind: Literal["info", "event", "update", "maintenance", "promo"] = "info"
    link: Optional[str] = None
    audience_tiers: Optional[list[int]] = None      # None = tout le monde
    show_banner: bool = True
    notify: bool = False
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None

    @field_validator("title_fr", "title_en")
    @classmethod
    def _title(cls, v: str) -> str:
        v = " ".join((v or "").split())
        if not 1 <= len(v) <= 120:
            raise ValueError("Titre de 1 à 120 caractères (français et anglais).")
        return v

    @field_validator("body_fr", "body_en")
    @classmethod
    def _body(cls, v: str) -> str:
        v = "".join(ch for ch in (v or "") if ch == "\n" or ch.isprintable()).strip()
        if len(v) > 2000:
            raise ValueError("Texte de 2000 caractères au plus.")
        return v

    @field_validator("link")
    @classmethod
    def _link(cls, v: Optional[str]) -> Optional[str]:
        v = (v or "").strip()
        if not v:
            return None
        if len(v) > 300 or " " in v or not (v.startswith("#/") or v.startswith("https://")):
            raise ValueError("Lien : une page du jeu (#/…) ou une adresse https://.")
        return v

    @field_validator("audience_tiers")
    @classmethod
    def _aud(cls, v: Optional[list[int]]) -> Optional[list[int]]:
        if v is None:
            return None
        v = sorted(set(v))
        if not v:
            raise ValueError("Choisissez au moins un niveau, ou « tout le monde ».")
        return v

    @model_validator(mode="after")
    def _check(self) -> "AnnouncementIn":
        if not (self.show_banner or self.notify):
            raise ValueError("Choisissez au moins une diffusion : bandeau ou notification.")
        if self.starts_at and self.ends_at and _as_utc(self.ends_at) <= _as_utc(self.starts_at):
            raise ValueError("La date de fin doit suivre la date de début.")
        return self


class AnnouncementAdminOut(BaseModel):
    id: int
    title_fr: str
    title_en: str
    body_fr: str
    body_en: str
    kind: str
    link: Optional[str]
    audience_tiers: Optional[list[int]]
    show_banner: bool
    notify: bool
    status: str
    live: bool
    starts_at: Optional[datetime]
    ends_at: Optional[datetime]
    published_at: Optional[datetime]
    notified_count: int
    created_by_name: Optional[str]
    created_at: datetime
    updated_at: datetime


class AnnouncementsPage(BaseModel):
    items: list[AnnouncementAdminOut]
    devices: dict[str, int]          # appareils inscrits aux notifications push, par plateforme
    news_opt_out: int                # joueurs qui ont coupé les notifications « Annonces »


async def _ann_out(db: AsyncSession, rows: list[Announcement]) -> list[AnnouncementAdminOut]:
    ids = {a.created_by for a in rows if a.created_by}
    names = dict((await db.execute(select(User.id, User.display_name).where(User.id.in_(ids)))).all()) if ids else {}
    return [AnnouncementAdminOut(
        id=a.id, title_fr=a.title_fr, title_en=a.title_en, body_fr=a.body_fr or "", body_en=a.body_en or "",
        kind=a.kind, link=a.link, audience_tiers=a.audience_tiers, show_banner=a.show_banner, notify=a.notify,
        status=a.status, live=ann_service.is_live(a), starts_at=_as_utc(a.starts_at), ends_at=_as_utc(a.ends_at),
        published_at=_as_utc(a.published_at), notified_count=a.notified_count or 0,
        created_by_name=names.get(a.created_by), created_at=_as_utc(a.created_at), updated_at=_as_utc(a.updated_at),
    ) for a in rows]


async def _ann_or_404(db: AsyncSession, ann_id: int) -> Announcement:
    ann = await db.get(Announcement, ann_id)
    if ann is None:
        raise HTTPException(status_code=404, detail="Annonce introuvable.")
    return ann


async def _check_tiers(db: AsyncSession, tiers: Optional[list[int]]) -> None:
    if tiers is None:
        return
    known = set((await db.execute(select(SubscriptionTier.id).where(SubscriptionTier.id.in_(tiers)))).scalars())
    if known != set(tiers):
        raise HTTPException(status_code=422, detail="Niveau d'abonnement inconnu dans le public.")


@router.get("/announcements", response_model=AnnouncementsPage, summary="Publications")
async def list_announcements(status: Optional[Literal["draft", "published", "archived"]] = None,
                             _admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    query = select(Announcement)
    if status:
        query = query.where(Announcement.status == status)
    rows = (await db.execute(query.order_by(Announcement.id.desc()).limit(100))).scalars().all()
    devices, opt_out = {}, 0
    try:
        from app.push.models import PushToken
        async with db.begin_nested():
            devices = {p: int(n) for p, n in (await db.execute(
                select(PushToken.platform, func.count()).group_by(PushToken.platform))).all()}
    except Exception:
        devices = {}
    for prefs in (await db.execute(select(User.game_preferences).where(User.game_preferences.is_not(None)))).scalars():
        if (prefs or {}).get("pushNews") is False:
            opt_out += 1
    return AnnouncementsPage(items=await _ann_out(db, rows), devices=devices, news_opt_out=opt_out)


@router.post("/announcements", response_model=AnnouncementAdminOut, status_code=201, summary="Créer une annonce (brouillon)")
async def create_announcement(body: AnnouncementIn, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    await _check_tiers(db, body.audience_tiers)
    ann = Announcement(**body.model_dump(), status=AnnouncementStatus.DRAFT, created_by=admin.id)
    db.add(ann)
    await db.flush()
    log_action(db, admin, "announcement.create", target_type="announcement", target_id=ann.id,
               details={"title": ann.title_fr})
    await db.flush()
    await db.refresh(ann)
    return (await _ann_out(db, [ann]))[0]


@router.patch("/announcements/{ann_id}", response_model=AnnouncementAdminOut, summary="Modifier une annonce")
async def update_announcement(ann_id: int, body: AnnouncementIn, admin: User = Depends(require_admin),
                              db: AsyncSession = Depends(get_db)):
    ann = await _ann_or_404(db, ann_id)
    if ann.status == AnnouncementStatus.ARCHIVED:
        raise HTTPException(status_code=400, detail="Une annonce archivée ne se modifie plus.")
    await _check_tiers(db, body.audience_tiers)
    for field, value in body.model_dump().items():
        setattr(ann, field, value)
    log_action(db, admin, "announcement.update", target_type="announcement", target_id=ann.id,
               details={"title": ann.title_fr})
    await db.flush()
    await db.refresh(ann)
    return (await _ann_out(db, [ann]))[0]


@router.post("/announcements/{ann_id}/publish", response_model=AnnouncementAdminOut, summary="Publier une annonce")
async def publish_announcement(ann_id: int, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    ann = await _ann_or_404(db, ann_id)
    if ann.status == AnnouncementStatus.ARCHIVED:
        raise HTTPException(status_code=400, detail="Une annonce archivée ne se republie pas : dupliquez-la.")
    ends = _as_utc(ann.ends_at)
    if ends is not None and ends <= _utcnow():
        raise HTTPException(status_code=400, detail="La date de fin est déjà passée.")
    ann.status = AnnouncementStatus.PUBLISHED
    ann.published_at = ann.published_at or _utcnow()
    # Notification envoyée une seule fois, à la première publication
    if ann.notify and not ann.notified_count:
        ann.notified_count = await ann_service.notify_all(db, ann)
    log_action(db, admin, "announcement.publish", target_type="announcement", target_id=ann.id,
               details={"title": ann.title_fr, "notified": ann.notified_count})
    await db.flush()
    await db.refresh(ann)
    return (await _ann_out(db, [ann]))[0]


@router.post("/announcements/{ann_id}/archive", response_model=AnnouncementAdminOut, summary="Retirer une annonce")
async def archive_announcement(ann_id: int, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    ann = await _ann_or_404(db, ann_id)
    ann.status = AnnouncementStatus.ARCHIVED
    await ann_service.withdraw(db, ann)
    log_action(db, admin, "announcement.archive", target_type="announcement", target_id=ann.id,
               details={"title": ann.title_fr})
    await db.flush()
    await db.refresh(ann)
    return (await _ann_out(db, [ann]))[0]


@router.delete("/announcements/{ann_id}", status_code=204, summary="Supprimer une annonce")
async def delete_announcement(ann_id: int, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    ann = await _ann_or_404(db, ann_id)
    await ann_service.withdraw(db, ann)
    log_action(db, admin, "announcement.delete", target_type="announcement", target_id=ann.id,
               details={"title": ann.title_fr})
    await db.delete(ann)
    await db.flush()
