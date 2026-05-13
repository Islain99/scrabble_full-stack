# Fichier: backend/models.py
from pydantic import BaseModel
from typing import List, Dict, Optional
from enum import Enum # CORRECTION/AJOUT: Nécessaire pour définir GameStatus

# Définition des valeurs des lettres officielles du Scrabble
POINTS_LETTRES: Dict[str, int] = {
    'A': 1, 'B': 3, 'C': 3, 'D': 2, 'E': 1, 'F': 4, 'G': 2, 'H': 4,
    'I': 1, 'J': 8, 'K': 10, 'L': 1, 'M': 2, 'N': 1, 'O': 1, 'P': 3,
    'Q': 8, 'R': 1, 'S': 1, 'T': 1, 'U': 1, 'V': 4, 'W': 10, 'X': 10,
    'Y': 10, 'Z': 10, '*': 0 # * est le joker
}

class GameStatus(str, Enum):
    """Statuts possibles pour l'état de la partie."""
    SETUP = "SETUP"
    ACTIVE = "ACTIVE"
    FINISHED = "FINISHED"

# Modèle pour une seule tuile
class Tile(BaseModel):
    # La lettre (ex: 'A', 'Q', '*')
    letter: str
    # La valeur en points
    score: int

# Modèle pour un joueur
class Player(BaseModel):
    id: int
    name: str
    score: int = 0
    # Le rack de lettres du joueur
    rack: List[Tile] = []
    is_ai: bool = False # NOUVEAU: Pour identifier un joueur IA

# Modèle pour l'état du plateau. Le plateau est une grille 15x15.
# La valeur de la case est soit None (vide) soit un objet Tile.
class Board(BaseModel):
    # Initialisation du plateau 15x15 avec des cases vides
    # Utiliser un générateur de liste garantit que toutes les sous-listes sont distinctes
    grid: List[List[Optional[Tile]]] = [[None for _ in range(15)] for _ in range(15)]

# Modèle principal pour l'état du jeu
class GameState(BaseModel):
    game_id: str
    board: Board
    players: List[Player]
    # Indice du joueur dont c'est le tour (0, 1, etc.)
    current_player_index: int = 0
    # Liste des lettres restantes dans le sac
    remaining_tiles: List[str]
    # Nombre de tours passés consécutifs
    passes_count: int = 0
    # Suivi du statut de la partie
    status: GameStatus = GameStatus.ACTIVE 
    # Le nom du joueur gagnant (si la partie est FINISHED)
    winner_name: Optional[str] = None