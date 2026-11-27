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


def banned_set(builtin: bool = True, extra: tuple[str, ...] | list[str] = ()) -> set[str]:
    """Mots interdits (repliés sans accents) : liste d'origine et/ou ajouts de l'admin (lot A4)."""
    words = set(_BLOCKED) if builtin else set()
    words.update(_fold(w) for w in extra)
    return words


def _phrases(words: set[str]) -> list[str]:
    return [w for w in words if " " in w]


def contains_banned(text: str, words: set[str]) -> bool:
    folded = _fold(text)
    if any(_fold(m.group(0)) in words for m in _WORD_RE.finditer(text)):
        return True
    return any(re.search(rf"(?<!\w){re.escape(p)}(?!\w)", folded) for p in _phrases(words))


def mask_profanity(text: str, words: set[str] | None = None) -> str:
    """Remplace chaque mot de la liste par des astérisques de même longueur."""
    words = _BLOCKED if words is None else words

    def replace(match: re.Match) -> str:
        word = match.group(0)
        return "*" * len(word) if _fold(word) in words else word
    out = _WORD_RE.sub(replace, text)
    # Expressions de plusieurs mots (ajoutées par l'admin) : masquées en bloc
    for phrase in _phrases(words):
        folded = _fold(out)
        for m in reversed(list(re.finditer(rf"(?<!\w){re.escape(phrase)}(?!\w)", folded))):
            if len(folded) == len(out):                       # positions fiables (pas de lettre décomposée)
                out = out[:m.start()] + "*" * (m.end() - m.start()) + out[m.end():]
    return out


def contains_link(text: str) -> bool:
    return bool(LINK_RE.search(text))


def clean_body(raw: str) -> str:
    """Espaces de bord retirés, caractères de contrôle supprimés (retours à la ligne gardés, 3 au plus de suite)."""
    text = "".join(ch for ch in (raw or "") if ch == "\n" or ch.isprintable())
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()
