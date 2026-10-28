# app/friends/codes.py
#
# Code ami (lot 4) : 2 à 4 lettres tirées du pseudo + 4 chiffres, ex. ALEX-4821.
# Il distingue deux joueurs au même pseudo et se dicte facilement.
from __future__ import annotations

import re
import secrets
import unicodedata
from typing import Optional

CODE_RE = re.compile(r"^([A-Z]{2,4})-?(\d{4,6})$")
FALLBACK_PREFIX = "JOUE"


def code_prefix(display_name: str) -> str:
    """« Élodie » → « ELOD », « 李 » → « JOUE » (lettres latines seulement)."""
    ascii_name = unicodedata.normalize("NFKD", display_name or "").encode("ascii", "ignore").decode()
    letters = re.sub(r"[^A-Za-z]", "", ascii_name).upper()[:4]
    return letters if len(letters) >= 2 else FALLBACK_PREFIX


def random_code(display_name: str, digits: int = 4) -> str:
    number = secrets.randbelow(10 ** digits)
    return f"{code_prefix(display_name)}-{number:0{digits}d}"


def normalize_code(raw: str) -> Optional[str]:
    """« alex 4821 », « Alex-4821 » → « ALEX-4821 » ; None si ce n'est pas un code."""
    compact = re.sub(r"[\s_]", "", raw or "").upper()
    match = CODE_RE.match(compact)
    if not match:
        return None
    return f"{match.group(1)}-{match.group(2)}"
