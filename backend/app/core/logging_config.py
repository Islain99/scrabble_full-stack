# app/core/logging_config.py
#
# Configuration centralisée du logging pour l'ensemble du backend.
# Appelée une seule fois dans app/main.py au démarrage.
#
# Format :
#   - dev  → lisible par un humain, coloré (via uvicorn)
#   - prod → JSON structuré, compatible Railway log explorer
#
import logging
import logging.config
import sys

from app.core.config import get_settings


def setup_logging() -> None:
    settings = get_settings()

    if settings.is_production:
        # ── Production : JSON structuré ───────────────────────────
        # Railway ingère les logs ligne-par-ligne ; un message JSON par ligne
        # est idéal pour le filtrage et les alertes.
        fmt = "%(asctime)s %(levelname)s %(name)s %(message)s"
        handlers_cfg: dict = {
            "console": {
                "class": "logging.StreamHandler",
                "stream": "ext://sys.stdout",
                "formatter": "json",
            }
        }
        formatters_cfg: dict = {
            "json": {
                "()": _JsonFormatter,
            }
        }
    else:
        # ── Développement : format lisible ────────────────────────
        fmt = "%(levelname)-8s %(name)s — %(message)s"
        handlers_cfg = {
            "console": {
                "class": "logging.StreamHandler",
                "stream": "ext://sys.stdout",
                "formatter": "dev",
            }
        }
        formatters_cfg = {
            "dev": {
                "format": fmt,
            }
        }

    logging.config.dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": formatters_cfg,
            "handlers": handlers_cfg,
            "root": {
                "handlers": ["console"],
                "level": "DEBUG" if not settings.is_production else "INFO",
            },
            "loggers": {
                # Réduire le bruit des bibliothèques tierces
                "uvicorn":            {"level": "INFO",    "propagate": True},
                "uvicorn.access":     {"level": "WARNING", "propagate": True},
                "sqlalchemy.engine":  {"level": "WARNING", "propagate": True},
                "firebase_admin":     {"level": "WARNING", "propagate": True},
            },
        }
    )


class _JsonFormatter(logging.Formatter):
    """Formatteur minimaliste JSON (sans dépendance python-json-logger)."""

    import json as _json

    def format(self, record: logging.LogRecord) -> str:
        import json
        payload = {
            "time":    self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
            "level":   record.levelname,
            "logger":  record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)