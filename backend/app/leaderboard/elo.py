# app/leaderboard/elo.py
#
# Classement multijoueur : cote Elo (lot 7).
#   - tout le monde commence à 1200 ;
#   - K = 40 pendant les 10 premières parties (la cote se cale vite), puis 24 ;
#   - victoire = 1, égalité = 0,5, défaite = 0 (abandon et victoire réclamée compris) ;
#   - la cote ne descend jamais sous 100.
from __future__ import annotations

START_RATING   = 1200
FLOOR          = 100
PROVISIONAL    = 10
K_PROVISIONAL  = 40
K_ESTABLISHED  = 24


def expected(rating: int, opponent: int) -> float:
    """Probabilité de victoire attendue de « rating » contre « opponent »."""
    return 1.0 / (1.0 + 10 ** ((opponent - rating) / 400))


def k_factor(games_before: int) -> int:
    return K_PROVISIONAL if games_before < PROVISIONAL else K_ESTABLISHED


def delta(rating: int, opponent: int, score: float, games_before: int) -> int:
    """Variation de cote d'un joueur (score : 1 victoire, 0.5 égalité, 0 défaite)."""
    change = round(k_factor(games_before) * (score - expected(rating, opponent)))
    return max(change, FLOOR - rating)
