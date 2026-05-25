# app/db/database.py
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.core.config import get_settings

settings = get_settings()

engine = None
AsyncSessionLocal = None


def init_db():
    """Initialise le moteur DB. Appelé au démarrage si DATABASE_URL est défini."""
    global engine, AsyncSessionLocal

    if not settings.db_enabled:
        print("⚠️  DATABASE_URL non défini — fonctionnalités DB désactivées.")
        return

    engine = create_async_engine(
        settings.DATABASE_URL,
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
    Lève une erreur claire si la DB n'est pas configurée.
    """
    if AsyncSessionLocal is None:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=503,
            detail="Base de données non disponible. Configurez DATABASE_URL."
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