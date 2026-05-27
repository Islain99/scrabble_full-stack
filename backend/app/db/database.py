# app/db/database.py
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.core.config import get_settings

settings = get_settings()

engine = None
AsyncSessionLocal = None


def _fix_db_url(url: str) -> str:
    """
    Railway fournit DATABASE_URL avec le schéma 'postgresql://' ou 'postgres://'.
    SQLAlchemy async a besoin de 'postgresql+asyncpg://'.
    """
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


def init_db():
    """Initialise le moteur DB. Appelé au démarrage si DATABASE_URL est défini."""
    global engine, AsyncSessionLocal

    if not settings.db_enabled:
        print("⚠️  DATABASE_URL non défini — fonctionnalités DB désactivées.")
        return

    db_url = _fix_db_url(settings.DATABASE_URL)
    print(f"🔌 Connexion DB : {db_url[:40]}...")

    engine = create_async_engine(
        db_url,
        echo=not settings.is_production,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=10,
    )

    AsyncSessionLocal = async_sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
        autocommit=False,
    )
    print("✅ Base de données connectée.")


class Base(DeclarativeBase):
    pass


async def get_db():
    """
    Dependency FastAPI — injecte une session DB.
    Lève une erreur 503 claire si DATABASE_URL n'est pas configuré.
    """
    if AsyncSessionLocal is None:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=503,
            detail="Base de données non disponible. Vérifiez DATABASE_URL dans Railway."
        )
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()