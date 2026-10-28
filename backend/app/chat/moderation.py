# app/chat/moderation.py
#
# Filtre de contenu de la messagerie (lot 6) :
#   - mots grossiers FR/EN masqués par des astérisques (insensible à la casse et aux accents) ;
#   - liens refusés pour les comptes de moins de 24 h (spam).
# La liste est volontairement courte : elle sert de garde-fou, la modération
# humaine (signalements, administrateur) fait le reste.
from __future__ import annotations

import re
import unicodedata

BLOCKED_WORDS = (
    # français
    "connard", "connasse", "salope", "encule", "enculer", "pute", "putain", "batard",
    "fdp", "ntm", "pd", "nique", "niquer", "merde", "abruti", "debile", "salaud",
    # anglais
    "fuck", "fucking", "shit", "bitch", "asshole", "bastard", "cunt", "dick", "whore", "slut",
)

LINK_RE = re.compile(r"(https?://|www\.|\b[\w-]+\.(com|net|org|fr|ca|io|ly|gg|me|xyz|ru|info)\b)", re.IGNORECASE)


def _fold(text: str) -> str:
    """« Éncülé » → « encule » (pour comparer sans accents)."""
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()


_WORD_RE = re.compile(r"[\w']+", re.UNICODE)
_BLOCKED = set(BLOCKED_WORDS)


def mask_profanity(text: str) -> str:
    """Remplace chaque mot de la liste par des astérisques de même longueur."""
    def replace(match: re.Match) -> str:
        word = match.group(0)
        return "*" * len(word) if _fold(word) in _BLOCKED else word
    return _WORD_RE.sub(replace, text)


def contains_link(text: str) -> bool:
    return bool(LINK_RE.search(text))


def clean_body(raw: str) -> str:
    """Espaces de bord retirés, caractères de contrôle supprimés (retours à la ligne gardés, 3 au plus de suite)."""
    text = "".join(ch for ch in (raw or "") if ch == "\n" or ch.isprintable())
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()
