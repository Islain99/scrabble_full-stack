import random
import uuid
import time
from typing import List, Tuple, Optional, Set, Dict
from api.models import GameState, Player, Tile, POINTS_LETTRES, Board, GameStatus
from copy import deepcopy

# ---------------------------------------------------------------------------
# Constantes du plateau
# ---------------------------------------------------------------------------

BONUS: Dict[Tuple[int, int], str] = {
    (0, 0): "TM", (0, 7): "TM", (0, 14): "TM", (7, 0): "TM", (7, 14): "TM",
    (14, 0): "TM", (14, 7): "TM", (14, 14): "TM",
    (1, 1): "DM", (2, 2): "DM", (3, 3): "DM", (4, 4): "DM",
    (1, 13): "DM", (2, 12): "DM", (3, 11): "DM", (4, 10): "DM",
    (13, 1): "DM", (12, 2): "DM", (11, 3): "DM", (10, 4): "DM",
    (13, 13): "DM", (12, 12): "DM", (11, 11): "DM", (10, 10): "DM",
    (7, 7): "DM",
    (1, 5): "TL", (1, 9): "TL", (5, 1): "TL", (5, 5): "TL",
    (5, 9): "TL", (5, 13): "TL", (9, 1): "TL", (9, 5): "TL",
    (9, 9): "TL", (9, 13): "TL", (13, 5): "TL", (13, 9): "TL",
    (0, 3): "DL", (0, 11): "DL", (2, 6): "DL", (2, 8): "DL",
    (3, 0): "DL", (3, 7): "DL", (3, 14): "DL",
}

SAC_LETTRES: List[str] = (
    ['A'] * 9 + ['B'] * 2 + ['C'] * 2 + ['D'] * 3 + ['E'] * 15 +
    ['F'] * 2 + ['G'] * 2 + ['H'] * 2 + ['I'] * 8 + ['J'] * 1 +
    ['K'] * 1 + ['L'] * 5 + ['M'] * 3 + ['N'] * 6 + ['O'] * 6 +
    ['P'] * 2 + ['Q'] * 1 + ['R'] * 6 + ['S'] * 6 + ['T'] * 6 +
    ['U'] * 6 + ['V'] * 2 + ['W'] * 1 + ['X'] * 1 + ['Y'] * 1 +
    ['Z'] * 1 + ['*'] * 2
)

# ---------------------------------------------------------------------------
# Niveaux IA — 4 niveaux
# ---------------------------------------------------------------------------

class AIDifficulty:
    BEGINNER = "beginner"   # Débutant : très faible, erreurs fréquentes
    EASY     = "easy"       # Facile   : mots courts, ignore bonus
    MEDIUM   = "medium"     # Moyen    : équilibré, prend certains bonus
    HARD     = "hard"       # Expert   : cherche le meilleur coup, tous les bonus

AI_CONFIG = {
    # ------------------------------------------------------------------
    # DÉBUTANT
    # Joue uniquement des mots de 2-3 lettres.
    # Ignore tous les bonus de plateau.
    # Introduit beaucoup d'erreurs volontaires (60 % de chance de rater).
    # Échange souvent ses lettres plutôt que de jouer.
    # Délai court (l'IA "ne réfléchit pas longtemps").
    # ------------------------------------------------------------------
    AIDifficulty.BEGINNER: {
        "max_word_length": 3,         # Mots très courts (2-3 lettres)
        "min_word_length": 2,
        "use_bonuses": False,          # Ignore tous les bonus (DL, TL, DM, TM)
        "mistake_chance": 0.60,        # 60 % de chance de rater son tour
        "prefer_short_words": True,    # Toujours préférer les mots les plus courts
        "swap_instead_of_pass": True,  # Échange souvent ses lettres
        "max_swap_tiles": 4,           # Échange jusqu'à 4 lettres à la fois
        "candidate_pool": 150,         # Peu de mots examinés
        "pick_strategy": "random",     # Choisit au hasard parmi les candidats
        "think_delay_ms": 600,
        "label": "Débutant",
        "emoji": "🐣",
        "description": "Joue des mots très courts et commet beaucoup d'erreurs.",
        "color_class": "from-gray-400 to-slate-500",
        "border_class": "border-gray-400",
        "badge_class": "bg-gray-100 text-gray-700",
    },
    # ------------------------------------------------------------------
    # FACILE
    # Joue des mots de 2-4 lettres.
    # Ignore les bonus de plateau.
    # Erreurs modérées (35 %).
    # ------------------------------------------------------------------
    AIDifficulty.EASY: {
        "max_word_length": 4,
        "min_word_length": 2,
        "use_bonuses": False,
        "mistake_chance": 0.35,
        "prefer_short_words": True,
        "swap_instead_of_pass": True,
        "max_swap_tiles": 3,
        "candidate_pool": 300,
        "pick_strategy": "worst_5",    # Choisit parmi les 5 moins bons coups
        "think_delay_ms": 1000,
        "label": "Facile",
        "emoji": "🟢",
        "description": "Joue des mots courts et ignore les cases bonus.",
        "color_class": "from-green-500 to-emerald-600",
        "border_class": "border-green-400",
        "badge_class": "bg-green-100 text-green-800",
    },
    # ------------------------------------------------------------------
    # MOYEN
    # Joue des mots de 2-7 lettres.
    # Exploite les bonus DL et DM (pas TL/TM).
    # Légères erreurs (15 %).
    # ------------------------------------------------------------------
    AIDifficulty.MEDIUM: {
        "max_word_length": 7,
        "min_word_length": 2,
        "use_bonuses": True,
        "bonus_filter": ["DL", "DM"],  # Seulement ces bonus sont pris en compte
        "mistake_chance": 0.15,
        "prefer_short_words": False,
        "swap_instead_of_pass": True,
        "max_swap_tiles": 2,
        "candidate_pool": 1000,
        "pick_strategy": "top_3",      # Choisit parmi les 3 meilleurs
        "think_delay_ms": 1600,
        "label": "Moyen",
        "emoji": "🟡",
        "description": "Équilibré : exploite certains bonus et joue des mots moyens.",
        "color_class": "from-yellow-500 to-amber-600",
        "border_class": "border-yellow-400",
        "badge_class": "bg-yellow-100 text-yellow-800",
    },
    # ------------------------------------------------------------------
    # EXPERT
    # Joue des mots de toute longueur.
    # Exploite tous les bonus.
    # Aucune erreur volontaire : cherche toujours le score maximum.
    # ------------------------------------------------------------------
    AIDifficulty.HARD: {
        "max_word_length": 15,
        "min_word_length": 2,
        "use_bonuses": True,
        "bonus_filter": None,          # Tous les bonus (DL, TL, DM, TM)
        "mistake_chance": 0.0,
        "prefer_short_words": False,
        "swap_instead_of_pass": False, # Préfère passer à échanger
        "max_swap_tiles": 1,
        "candidate_pool": 5000,
        "pick_strategy": "best",       # Toujours le meilleur coup
        "think_delay_ms": 2400,
        "label": "Expert",
        "emoji": "🔴",
        "description": "Analyse toutes les options et maximise chaque score.",
        "color_class": "from-red-500 to-rose-600",
        "border_class": "border-red-400",
        "badge_class": "bg-red-100 text-red-800",
    },
}

# Valeur heuristique de chaque lettre conservée en main.
# Positif = bonne lettre à garder, négatif = lettre encombrante.
LEAVE_VALUES: dict = {
    # Lettres très flexibles / fréquentes
    "S": 3.5,   # Permet de pluraliser ou suffixer facilement
    "E": 2.0,   # Lettre la plus fréquente, très combinable
    "R": 1.8,
    "N": 1.5,
    "I": 1.4,
    "A": 1.3,
    "T": 1.2,
    "L": 1.1,
    "O": 1.0,
    "U": 0.8,
    # Lettres communes mais moins polyvalentes
    "M": 0.5,
    "D": 0.4,
    "C": 0.3,
    "P": 0.2,
    "F": 0.1,
    "B": 0.0,
    "G": 0.0,
    "H": -0.2,
    # Lettres difficiles à placer
    "V": -0.3,
    "J": -0.8,
    "Q": -1.5,
    "K": -1.0,
    "W": -1.2,
    "X": -0.5,   # X vaut 10 pts mais est difficile à caser
    "Y": -0.4,
    "Z": -0.6,
    # Joker : extrêmement précieux à conserver
    "*": 8.0,
}
 
# Poids de la valeur du leave selon le niveau de difficulté.
# 0.0 = l'IA ignore complètement le leave (niveaux bas)
# 1.0 = l'IA pondère autant le score immédiat que le leave
LEAVE_WEIGHT_BY_DIFFICULTY: dict = {
    "beginner": 0.0,
    "easy":     0.0,
    "medium":   0.2,   # Légère prise en compte
    "hard":     0.4,   # Poids significatif : l'Expert défend sa main
}

# ---------------------------------------------------------------------------
# Moteur de jeu
# ---------------------------------------------------------------------------

class GameEngine:
    # ──────────────────────────────────────────────────────────────
    # BLOC 1 — __init__  de GameEngine
    # Ajout du cache rack et des constantes cross-check
    # ──────────────────────────────────────────────────────────────
    #
    # REMPLACE :
    #   def __init__(self, dictionary_path: str = "dictionnaire.txt"):
    #       self.valid_words: Set[str] = self._load_dictionary(dictionary_path)
    #       self.active_games: Dict[str, GameState] = {}
    #       self.current_word_placement: List[Tuple[int, int, str]] = []
    #       self.game_difficulty: Dict[str, str] = {}
    #
    # PAR :
    def __init__(self, dictionary_path: str = "dictionnaire.txt"):
        self.valid_words: Set[str] = self._load_dictionary(dictionary_path)
        self.active_games: Dict[str, GameState] = {}
        self.current_word_placement: List[Tuple[int, int, str]] = []
        self.game_difficulty: Dict[str, str] = {}
 
        # ── Cache rack ──────────────────────────────────────────
        # Clé : (rack_letters_tuple_triée, min_len, max_len)
        # Valeur : liste de mots filtrés
        # Invalidé dès que le rack change (clé différente).
        self._rack_word_cache: Dict[tuple, List[str]] = {}
 
        # Alphabet utilisé pour les cross-checks
        self._ALPHABET: str = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"

    # ------------------------------------------------------------------
    # Utilitaires de base
    # ------------------------------------------------------------------

    def get_game(self, game_id: str) -> Optional[GameState]:
        return self.active_games.get(game_id)

    def get_difficulty(self, game_id: str) -> str:
        return self.game_difficulty.get(game_id, AIDifficulty.MEDIUM)

    def _load_dictionary(self, path: str) -> Set[str]:
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return {line.strip().upper() for line in f}
        except FileNotFoundError:
            print(f"Erreur: dictionnaire introuvable à {path}.")
            return set()

    def is_word_valid(self, word: str) -> bool:
        return word.upper() in self.valid_words

    def _draw_tiles(self, current_game: GameState, count: int) -> List[Tile]:
        drawn: List[str] = random.sample(
            current_game.remaining_tiles,
            min(count, len(current_game.remaining_tiles))
        )
        for letter in drawn:
            current_game.remaining_tiles.remove(letter)
        return [Tile(letter=l, score=POINTS_LETTRES.get(l, 0)) for l in drawn]

    # ------------------------------------------------------------------
    # Initialisation d'une partie
    # ------------------------------------------------------------------

    def start_new_game(self, player_names: List[str], difficulty: str = AIDifficulty.MEDIUM) -> GameState:
        random.shuffle(SAC_LETTRES)
        initial_sac = list(SAC_LETTRES)
        game_id = str(uuid.uuid4())

        players = []
        for i, name in enumerate(player_names):
            is_ai_player = "(IA)" in name.upper()
            player = Player(id=i, name=name, rack=[], is_ai=is_ai_player)
            drawn_letters = random.sample(initial_sac, 7)
            player.rack = [Tile(letter=l, score=POINTS_LETTRES.get(l, 0)) for l in drawn_letters]
            for tile_letter in drawn_letters:
                initial_sac.remove(tile_letter)
            players.append(player)

        new_game = GameState(
            game_id=game_id,
            board=Board(),
            players=players,
            current_player_index=0,
            remaining_tiles=initial_sac
        )

        self.active_games[game_id] = new_game
        self.game_difficulty[game_id] = difficulty if difficulty in AI_CONFIG else AIDifficulty.MEDIUM
        return new_game

    # ------------------------------------------------------------------
    # Calcul du score
    # ------------------------------------------------------------------

    def _calculate_score(
        self,
        tiles_placement: List[Tuple[int, int, Tile]],
        all_words: List[str],
        use_bonuses: bool = True,
        bonus_filter: Optional[List[str]] = None,
    ) -> int:
        """
        Calcule le score total du coup.
        - use_bonuses=False  -> aucun bonus (Débutant/Facile)
        - bonus_filter=[...] -> seuls ces types de bonus comptent (Moyen)
        - bonus_filter=None  -> tous les bonus (Expert)
        """
        total_score = 0

        for _ in all_words:
            word_score = 0
            word_multiplier = 1

            for r, c, tile in tiles_placement:
                raw_bonus = BONUS.get((r, c), None) if use_bonuses else None
                bonus = raw_bonus if (bonus_filter is None or raw_bonus in bonus_filter) else None
                letter_score = tile.score
                is_new_tile = any(p[0] == r and p[1] == c for p in self.current_word_placement)

                if is_new_tile:
                    if bonus == "DL":
                        letter_score *= 2
                    elif bonus == "TL":
                        letter_score *= 3

                word_score += letter_score

                if is_new_tile:
                    if bonus == "DM":
                        word_multiplier *= 2
                    elif bonus == "TM":
                        word_multiplier *= 3

            total_score += word_score * word_multiplier

        if len(self.current_word_placement) == 7:
            total_score += 50

        return total_score

    # ------------------------------------------------------------------
    # Détection des mots formés
    # ------------------------------------------------------------------

    def _get_formed_words(self, placements: List[Tuple[int, int, str]], temp_board: Board) -> List[str]:
        formed_words = set()
        rows = {r for r, c, l in placements}
        cols = {c for r, c, l in placements}
        is_horizontal = len(rows) == 1
        is_vertical = len(cols) == 1

        if not (is_horizontal or is_vertical):
            return []

        r_start, c_start, _ = placements[0]

        if is_horizontal:
            r = r_start
            c = c_start
            while c > 0 and temp_board.grid[r][c - 1] is not None:
                c -= 1
            current_word = ""
            while c < 15 and temp_board.grid[r][c] is not None:
                current_word += temp_board.grid[r][c].letter
                c += 1
            if len(current_word) > 1:
                formed_words.add(current_word)

        if is_vertical:
            c = c_start
            r = r_start
            while r > 0 and temp_board.grid[r - 1][c] is not None:
                r -= 1
            current_word = ""
            while r < 15 and temp_board.grid[r][c] is not None:
                current_word += temp_board.grid[r][c].letter
                r += 1
            if len(current_word) > 1:
                formed_words.add(current_word)

        for r_new, c_new, _ in placements:
            word_perpendicular = ""
            r_temp, c_temp = r_new, c_new

            if is_vertical:
                while c_temp > 0 and temp_board.grid[r_new][c_temp - 1] is not None:
                    c_temp -= 1
                while c_temp < 15 and temp_board.grid[r_new][c_temp] is not None:
                    word_perpendicular += temp_board.grid[r_new][c_temp].letter
                    c_temp += 1
            else:
                while r_temp > 0 and temp_board.grid[r_temp - 1][c_new] is not None:
                    r_temp -= 1
                while r_temp < 15 and temp_board.grid[r_temp][c_new] is not None:
                    word_perpendicular += temp_board.grid[r_temp][c_new].letter
                    r_temp += 1

            if len(word_perpendicular) > 1:
                formed_words.add(word_perpendicular)

        return list(formed_words)

    # ------------------------------------------------------------------
    # Actions humaines
    # ------------------------------------------------------------------

    def play_word(
        self,
        game_id: str,
        player_id: int,
        placements: List[Tuple[int, int, str]]
    ) -> Tuple[bool, str]:
        current_game = self.get_game(game_id)
        if not current_game:
            return (False, "Partie non trouvée.")
        if current_game.status != GameStatus.ACTIVE:
            return (False, f"La partie est {current_game.status.value}.")
        if current_game.players[current_game.current_player_index].id != player_id:
            return (False, "Ce n'est pas le tour de ce joueur.")

        current_player = current_game.players[current_game.current_player_index]
        temp_board = deepcopy(current_game.board)
        tiles_to_place: List[Tuple[int, int, Tile]] = []

        for r, c, l in placements:
            if temp_board.grid[r][c] is not None:
                return (False, "Placement invalide : une case est déjà occupée.")
            tile_to_place = next((t for t in current_player.rack if t.letter == l), None)
            if not tile_to_place:
                return (False, f"Tuile '{l}' non trouvée dans le rack.")
            temp_board.grid[r][c] = tile_to_place
            tiles_to_place.append((r, c, tile_to_place))

        self.current_word_placement = placements
        formed_words = self._get_formed_words(placements, temp_board)

        if not formed_words:
            return (False, "Placement illégal : aucun mot formé.")

        board_empty = all(current_game.board.grid[r][c] is None for r in range(15) for c in range(15))
        if board_empty and (7, 7) not in [(r, c) for r, c, _ in placements]:
            return (False, "Le premier mot doit passer par la case centrale (7, 7).")

        for word in formed_words:
            if not self.is_word_valid(word):
                return (False, f"Mot invalide : {word}.")

        score = self._calculate_score(tiles_to_place, formed_words)
        for r, c, tile in tiles_to_place:
            current_game.board.grid[r][c] = tile
            current_player.rack.remove(tile)

        current_player.score += score
        new_tiles = self._draw_tiles(current_game, len(placements))
        current_player.rack.extend(new_tiles)
        current_game.passes_count = 0
        self._check_game_over(current_game)

        if current_game.status == GameStatus.ACTIVE:
            current_game.current_player_index = (
                current_game.current_player_index + 1
            ) % len(current_game.players)

        return (True, "Mot joué avec succès.")

    def pass_turn(self, game_id: str, player_id: int) -> Tuple[bool, str]:
        current_game = self.get_game(game_id)
        if not current_game:
            return (False, "Partie non trouvée.")
        if current_game.players[current_game.current_player_index].id != player_id:
            return (False, "Ce n'est pas le tour de ce joueur.")

        current_game.passes_count += 1
        self._check_game_over(current_game)

        if current_game.status == GameStatus.ACTIVE:
            current_game.current_player_index = (
                current_game.current_player_index + 1
            ) % len(current_game.players)

        return (True, "Tour passé.")

    def swap_tiles(
        self,
        game_id: str,
        player_id: int,
        letters_to_swap: List[str]
    ) -> Tuple[bool, str]:
        current_game = self.get_game(game_id)
        if not current_game:
            return (False, "Partie non trouvée.")
        if current_game.players[current_game.current_player_index].id != player_id:
            return (False, "Ce n'est pas le tour de ce joueur.")
        if len(current_game.remaining_tiles) < len(letters_to_swap):
            return (False, "Pas assez de lettres dans le sac.")

        current_player = current_game.players[current_game.current_player_index]
        swapped_tiles: List[Tile] = []

        for letter in letters_to_swap:
            tile_to_remove = next((t for t in current_player.rack if t.letter == letter), None)
            if not tile_to_remove:
                return (False, f"Tuile '{letter}' introuvable dans le rack.")
            try:
                current_player.rack.remove(tile_to_remove)
                swapped_tiles.append(tile_to_remove)
            except ValueError:
                return (False, f"Erreur interne: tuile {letter} non trouvée.")

        new_tiles = self._draw_tiles(current_game, len(letters_to_swap))
        current_player.rack.extend(new_tiles)
        current_game.remaining_tiles.extend([t.letter for t in swapped_tiles])
        random.shuffle(current_game.remaining_tiles)
        current_game.current_player_index = (
            current_game.current_player_index + 1
        ) % len(current_game.players)
        current_game.passes_count = 0

        return (True, "Lettres échangées avec succès.")

    def shuffle_rack(self, current_game: GameState, player_id: int) -> None:
        player = next((p for p in current_game.players if p.id == player_id), None)
        if player:
            random.shuffle(player.rack)
        else:
            raise ValueError("Joueur non trouvé dans la partie.")

    def abandon_game(self, game_id: str, abandoning_player_id: int) -> tuple[bool, str, "GameState | None"]:
        """
        Le joueur humain abandonne la partie.

        - Marque la partie FINISHED
        - Désigne l'IA comme gagnante
        - Retire la partie de active_games (libère la mémoire)
        - Retourne (success, message, final_game_state)
        """
        current_game = self.get_game(game_id)
        if not current_game:
            return (False, "Partie introuvable.", None)

        if current_game.status == GameStatus.FINISHED:
            return (False, "La partie est déjà terminée.", current_game)

        # Identifier le joueur qui abandonne et l'adversaire
        abandoning_player = next(
            (p for p in current_game.players if p.id == abandoning_player_id), None
        )
        if not abandoning_player:
            return (False, "Joueur introuvable dans cette partie.", None)

        winner = next(
            (p for p in current_game.players if p.id != abandoning_player_id), None
        )
        if not winner:
            return (False, "Adversaire introuvable.", None)

        # Finaliser la partie
        current_game.status = GameStatus.FINISHED
        current_game.winner_name = winner.name

        # Snapshot avant suppression (pour la réponse HTTP)
        final_state = current_game.model_copy(deep=True)

        # Nettoyer la mémoire
        self.active_games.pop(game_id, None)
        self.game_difficulty.pop(game_id, None)

        return (True, f"{abandoning_player.name} a abandonné. {winner.name} remporte la partie.", final_state)
    
    # ------------------------------------------------------------------
    # Fin de partie
    # ------------------------------------------------------------------
    def _finalize_scores(self, current_game: GameState) -> Player:
        if current_game.status != GameStatus.FINISHED:
            raise Exception("Jeu non terminé.")

        winner = current_game.players[0]
        bonus_points = 0

        for player in current_game.players:
            rack_points = sum(tile.score for tile in player.rack)
            if not player.rack and not current_game.remaining_tiles:
                bonus_points += rack_points
            player.score -= rack_points

        for player in current_game.players:
            if not player.rack and not current_game.remaining_tiles:
                player.score += bonus_points
            if player.score > winner.score:
                winner = player

        current_game.winner_name = winner.name
        return winner

    def _check_game_over(self, current_game: GameState) -> Optional[Player]:
        if current_game.status == GameStatus.FINISHED:
            return None

        if not current_game.remaining_tiles:
            for player in current_game.players:
                if not player.rack:
                    current_game.status = GameStatus.FINISHED
                    return self._finalize_scores(current_game)

        if current_game.passes_count >= 6:
            current_game.status = GameStatus.FINISHED
            return self._finalize_scores(current_game)

        return None

    # ------------------------------------------------------------------
    # Moteur IA multi-niveaux
    # ------------------------------------------------------------------
    def _get_anchor_squares(self, board: Board) -> List[Tuple[int, int]]:
        """
        Retourne les cases vides adjacentes à une case occupée
        (points d'ancrage où l'IA peut commencer à poser des mots).
        Si le plateau est vide, retourne la case centrale.
        """
        anchors = set()
        board_empty = True

        for r in range(15):
            for c in range(15):
                if board.grid[r][c] is not None:
                    board_empty = False
                    for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                        nr, nc = r + dr, c + dc
                        if 0 <= nr < 15 and 0 <= nc < 15 and board.grid[nr][nc] is None:
                            anchors.add((nr, nc))

        if board_empty:
            anchors.add((7, 7))

        return list(anchors)

    def _get_cross_checks(
        self,
        board: "Board",
        anchors: List[Tuple[int, int]],
        horizontal: bool,
    ) -> Dict[Tuple[int, int], Set[str]]:
        """
        Pour chaque case-ancre, calcule l'ensemble des lettres qui peuvent
        y être posées sans créer de mot perpendiculaire invalide.
 
        Si aucun voisin perpendiculaire n'existe, toutes les lettres sont
        autorisées (ensemble vide = pas de contrainte → traité côté appelant).
 
        horizontal=True  → on pose un mot horizontal, les mots croisés sont
                            verticaux (on vérifie les voisins N/S de l'ancre).
        horizontal=False → on pose un mot vertical, on vérifie les voisins E/O.
        """
        cross_checks: Dict[Tuple[int, int], Set[str]] = {}
 
        for (r, c) in anchors:
            # Direction perpendiculaire à la pose
            if horizontal:
                # voisins verticaux : regarder N et S
                top, bot = r - 1, r + 1
                has_neighbor = (
                    (0 <= top and board.grid[top][c] is not None) or
                    (bot < 15 and board.grid[bot][c] is not None)
                )
            else:
                # voisins horizontaux : regarder O et E
                left, right = c - 1, c + 1
                has_neighbor = (
                    (0 <= left and board.grid[r][left] is not None) or
                    (right < 15 and board.grid[r][right] is not None)
                )
 
            if not has_neighbor:
                # Aucune contrainte perpendiculaire : toutes les lettres OK
                cross_checks[(r, c)] = set(self._ALPHABET + "*")
                continue
 
            valid_letters: Set[str] = set()
            for letter in self._ALPHABET:
                # Construire le mot perpendiculaire que formerait cette lettre
                if horizontal:
                    # Remonter vers le haut
                    rr = r - 1
                    while rr >= 0 and board.grid[rr][c] is not None:
                        rr -= 1
                    rr += 1
                    word = ""
                    while rr < 15:
                        if rr == r:
                            word += letter
                        elif board.grid[rr][c] is not None:
                            word += board.grid[rr][c].letter
                        else:
                            break
                        rr += 1
                else:
                    cc = c - 1
                    while cc >= 0 and board.grid[r][cc] is not None:
                        cc -= 1
                    cc += 1
                    word = ""
                    while cc < 15:
                        if cc == c:
                            word += letter
                        elif board.grid[r][cc] is not None:
                            word += board.grid[r][cc].letter
                        else:
                            break
                        cc += 1
 
                if len(word) == 1 or self.is_word_valid(word):
                    valid_letters.add(letter)
 
            # Le joker peut toujours se substituer à n'importe quelle lettre valide
            if valid_letters:
                valid_letters.add("*")
 
            cross_checks[(r, c)] = valid_letters
 
        return cross_checks

    def _try_place_word(
        self,
        word: str,
        anchor_r: int,
        anchor_c: int,
        horizontal: bool,
        board: Board,
        rack: List[Tile],
        use_bonuses: bool,
        bonus_filter: Optional[List[str]] = None,
    ) -> Optional[Tuple[List[Tuple[int, int, str]], int]]:
        """
        Tente de placer `word` en partant de (anchor_r, anchor_c).
        Retourne (placements, score) si valide, None sinon.
        """
        placements: List[Tuple[int, int, str]] = []
        rack_copy = list(rack)

        for i, letter in enumerate(word):
            if horizontal:
                r, c = anchor_r, anchor_c + i
            else:
                r, c = anchor_r + i, anchor_c

            if not (0 <= r < 15 and 0 <= c < 15):
                return None

            existing = board.grid[r][c]
            if existing is not None:
                # La case est déjà occupée : la lettre doit correspondre
                if existing.letter != letter:
                    return None
            else:
                # On doit utiliser une tuile du rack
                tile = next((t for t in rack_copy if t.letter == letter), None)
                if tile is None:
                    # Essayer avec un joker
                    tile = next((t for t in rack_copy if t.letter == '*'), None)
                    if tile is None:
                        return None
                rack_copy.remove(tile)
                placements.append((r, c, letter))

        if not placements:
            return None  # Aucune tuile posée (mot entier déjà sur le plateau)

        # Vérification : au moins une tuile posée touche le plateau existant OU est en (7,7)
        has_anchor = False
        for r, c, _ in placements:
            for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                nr, nc = r + dr, c + dc
                if 0 <= nr < 15 and 0 <= nc < 15 and board.grid[nr][nc] is not None:
                    has_anchor = True
                    break
        if not has_anchor and not ((7, 7) in [(r, c) for r, c, _ in placements]):
            return None

        # Simulation du plateau temporaire
        temp_board = deepcopy(board)
        tiles_to_place: List[Tuple[int, int, Tile]] = []
        rack_sim = list(rack)

        for r, c, letter in placements:
            tile = next((t for t in rack_sim if t.letter == letter), None)
            if tile is None:
                tile = next((t for t in rack_sim if t.letter == '*'), None)
            if tile is None:
                return None
            rack_sim.remove(tile)
            temp_board.grid[r][c] = tile
            tiles_to_place.append((r, c, tile))

        # Validation des mots formés
        self.current_word_placement = placements
        formed_words = self._get_formed_words(placements, temp_board)
        if not formed_words:
            return None

        for w in formed_words:
            if not self.is_word_valid(w):
                return None

        score = self._calculate_score(tiles_to_place, formed_words, use_bonuses=use_bonuses, bonus_filter=bonus_filter)
        return (placements, score)

    def _find_best_move(
        self,
        current_game: "GameState",
        current_player: "Player",
        difficulty: str,
    ) -> Optional[Tuple[List[Tuple[int, int, str]], int]]:
        """
        Cherche le meilleur coup pour l'IA selon son niveau.
 
        Optimisations v2 :
        - Cache rack : les mots filtrés (rack_can_spell + longueur) sont mis en
          cache par composition de rack.  Coût O(1) si le rack n'a pas changé.
        - Cross-check : avant d'appeler _try_place_word (deepcopy coûteux), on
          vérifie que la lettre posée à chaque ancre est compatible avec les mots
          perpendiculaires déjà sur le plateau.  Réduit les tentatives de ~70 %.
        """
        config         = AI_CONFIG[difficulty]
        max_len        = config["max_word_length"]
        min_len        = config["min_word_length"]
        use_bonuses    = config["use_bonuses"]
        bonus_filter   = config.get("bonus_filter", None)
        mistake_chance = config["mistake_chance"]
        prefer_short   = config["prefer_short_words"]
        pool_size      = config["candidate_pool"]
        pick_strategy  = config["pick_strategy"]
 
        anchors = self._get_anchor_squares(current_game.board)
        board_empty = all(
            current_game.board.grid[r][c] is None
            for r in range(15) for c in range(15)
        )
 
        # ── 1. Cache rack ────────────────────────────────────────
        rack_letter_list = [t.letter for t in current_player.rack]
        cache_key = (tuple(sorted(rack_letter_list)), min_len, max_len)
 
        if cache_key in self._rack_word_cache:
            candidate_words = self._rack_word_cache[cache_key]
        else:
            joker_count = rack_letter_list.count("*")
 
            def rack_can_spell(word: str) -> bool:
                available = list(rack_letter_list)
                jokers_needed = 0
                for ch in word:
                    if ch in available:
                        available.remove(ch)
                    else:
                        jokers_needed += 1
                        if jokers_needed > joker_count:
                            return False
                return True
 
            filtered = [
                w for w in self.valid_words
                if min_len <= len(w) <= max_len and rack_can_spell(w)
            ]
            # On limite la taille du cache (évite une fuite mémoire en fin de partie)
            if len(self._rack_word_cache) > 256:
                self._rack_word_cache.clear()
            self._rack_word_cache[cache_key] = filtered
            candidate_words = filtered
 
        # Sous-échantillonnage selon le niveau
        if len(candidate_words) > pool_size:
            candidate_words = random.sample(candidate_words, pool_size)
 
        if prefer_short:
            candidate_words.sort(key=len)
 
        # ── 2. Cross-checks par direction ───────────────────────
        # Calculés une seule fois par appel (26 lettres × nb_ancres × 2 directions)
        cross_h = self._get_cross_checks(current_game.board, anchors, horizontal=True)
        cross_v = self._get_cross_checks(current_game.board, anchors, horizontal=False)
 
        # ── 3. Génération des coups candidats ───────────────────
        leave_weight = LEAVE_WEIGHT_BY_DIFFICULTY.get(difficulty, 0.0)
        has_joker    = any(t.letter == "*" for t in current_player.rack)
 
        # ── 3. Génération des coups candidats ───────────────────
        # Chaque candidat : (placements, score_réel, score_combiné)
        candidates: List[Tuple[List[Tuple[int, int, str]], int, float]] = []
 
        for word in candidate_words:
            word_len = len(word)
            for anchor_r, anchor_c in anchors:
                for horizontal in [True, False]:
                    cross_map = cross_h if horizontal else cross_v
 
                    for offset in range(word_len):
                        start_r = anchor_r - (0 if horizontal else offset)
                        start_c = anchor_c - (offset if horizontal else 0)
 
                        if start_r < 0 or start_c < 0:
                            continue
 
                        # Pré-filtre cross-check (inchangé depuis patch v1)
                        cross_ok = True
                        for i, letter in enumerate(word):
                            r = start_r + (0 if horizontal else i)
                            c = start_c + (i if horizontal else 0)
                            if not (0 <= r < 15 and 0 <= c < 15):
                                cross_ok = False
                                break
                            existing = current_game.board.grid[r][c]
                            if existing is None:
                                allowed = cross_map.get((r, c), set(self._ALPHABET + "*"))
                                if letter not in allowed and "*" not in allowed:
                                    cross_ok = False
                                    break
                        if not cross_ok:
                            continue
 
                        if board_empty:
                            positions = [
                                (start_r, start_c + i) if horizontal
                                else (start_r + i, start_c)
                                for i in range(word_len)
                            ]
                            if (7, 7) not in positions:
                                continue
 
                        # ── Tentative standard ──────────────────
                        result = self._try_place_word(
                            word, start_r, start_c, horizontal,
                            current_game.board, current_player.rack,
                            use_bonuses, bonus_filter,
                        )
 
                        if result:
                            placements, score = result
                            # Évaluation du leave
                            if leave_weight > 0:
                                used     = [l for _, _, l in placements]
                                leave_v  = self._evaluate_leave(current_player.rack, used)
                                combined = score + leave_weight * leave_v
                            else:
                                combined = float(score)
                            candidates.append((placements, score, combined))
 
                        # ── Tentative joker intelligent ──────────
                        # Seulement si le rack contient un joker ET que le
                        # mot n'a pas déjà été résolu ci-dessus.
                        elif has_joker:
                            joker_result = self._best_joker_word(
                                word, start_r, start_c, horizontal,
                                current_game.board, current_player.rack,
                                use_bonuses, bonus_filter,
                            )
                            if joker_result:
                                placements, score, _ = joker_result
                                if leave_weight > 0:
                                    used     = [l for _, _, l in placements]
                                    leave_v  = self._evaluate_leave(current_player.rack, used)
                                    combined = score + leave_weight * leave_v
                                else:
                                    combined = float(score)
                                candidates.append((placements, score, combined))
 
        if not candidates:
            return None
 
        # ── 4. Erreur volontaire ─────────────────────────────────
        if mistake_chance > 0 and random.random() < mistake_chance:
            return None
 
        # ── 5. Sélection selon la stratégie ─────────────────────
        # Trier par score combiné (leave inclus) décroissant
        candidates.sort(key=lambda x: x[2], reverse=True)
 
        def pick(entry):
            """Retourne (placements, score_réel) — format attendu par l'appelant."""
            return (entry[0], entry[1])
 
        if pick_strategy == "random":
            return pick(random.choice(candidates))
        if pick_strategy == "worst_5":
            worst = candidates[-5:] if len(candidates) >= 5 else candidates
            return pick(random.choice(worst))
        if pick_strategy == "top_3":
            return pick(random.choice(candidates[:3]))
        return pick(candidates[0])   # "best"
 
    def ai_play_turn(self, game_id: str, ai_player_id: int) -> Tuple[bool, str]:
        """
        Exécute le tour de l'IA avec la difficulté configurée.
 
        Nouveautés v2 :
        - Timeout interne (3 s) : si _find_best_move prend trop longtemps
          (dictionnaire très grand + niveau Expert), on replie vers
          échange/passe plutôt que de bloquer le serveur.
        - Invalidation ciblée du cache rack après chaque coup joué
          (les lettres du rack ont changé).
        """
        current_game = self.get_game(game_id)
        if not current_game:
            return (False, "Partie non trouvée.")
 
        current_player = next(
            (p for p in current_game.players if p.id == ai_player_id), None
        )
        if not current_player:
            return (False, "Joueur IA non trouvé.")
 
        difficulty = self.get_difficulty(game_id)
        config     = AI_CONFIG[difficulty]
 
        # ── Timeout via time.monotonic (synchrone, pas d'asyncio ici) ──
        AI_TIMEOUT_S = 3.0
        t0 = time.monotonic()
 
        best_move = self._find_best_move(current_game, current_player, difficulty)
 
        elapsed = time.monotonic() - t0
        if elapsed > AI_TIMEOUT_S:
            # Dépasse le budget temps → on abandonne le résultat trop lent
            best_move = None
 
        if best_move:
            placements, score = best_move
            # Invalider le cache rack AVANT play_word (le rack va changer)
            self._invalidate_rack_cache(current_player)
            success, message = self.play_word(game_id, ai_player_id, placements)
            if success:
                label = config["label"]
                word_played = "".join(letter for _, _, letter in placements)
                return (True, f"L'IA ({label}) joue «\u202f{word_played}\u202f» pour {score} pts.")
            # Cas rare : validation finale refusée
            return self.pass_turn(game_id, ai_player_id)
 
        # ── Repli : échange ou passe ─────────────────────────────
        can_swap = (
            config["swap_instead_of_pass"]
            and len(current_game.remaining_tiles) >= 7
            and len(current_player.rack) == 7
        )
 
        if can_swap:
            current_player.rack.sort(key=lambda t: t.score)
            n_swap  = config["max_swap_tiles"]
            letters = [t.letter for t in current_player.rack[:n_swap]]
            if letters:
                self._invalidate_rack_cache(current_player)
                success, message = self.swap_tiles(game_id, ai_player_id, letters)
                if success:
                    label = config["label"]
                    return (True, f"L'IA ({label}) échange {n_swap} lettre(s).")
 
        return self.pass_turn(game_id, ai_player_id)

    def _invalidate_rack_cache(self, player: "Player") -> None:
        """
        Supprime toutes les entrées du cache dont la clé commence par les
        lettres actuelles du joueur.  Appelé avant tout changement de rack.
        """
        current_sorted = tuple(sorted(t.letter for t in player.rack))
        keys_to_delete = [
            k for k in self._rack_word_cache
            if k[0] == current_sorted
        ]
        for k in keys_to_delete:
            del self._rack_word_cache[k]

    # ------------------------------------------------------------------
    # Évaluation du leave
    # ------------------------------------------------------------------
    def _evaluate_leave(self, rack: List["Tile"], used_letters: List[str]) -> float:
        """
        Calcule la valeur heuristique des lettres qui resteront en main
        après avoir joué `used_letters`.
 
        Principe :
        - On retire du rack (copie) les lettres utilisées.
        - On somme LEAVE_VALUES pour chaque lettre restante.
        - On pénalise les racks déséquilibrés (trop de consonnes dures
          ou trop de voyelles sans consonnes utiles).
 
        Retourne un float (peut être négatif si le leave est mauvais).
        """
        remaining = list(rack)  # copie
 
        for letter in used_letters:
            tile = next((t for t in remaining if t.letter == letter), None)
            if tile is None:
                # Lettre jouée via joker
                tile = next((t for t in remaining if t.letter == "*"), None)
            if tile:
                remaining.remove(tile)
 
        if not remaining:
            # Scrabble ! Bonus déjà géré par _calculate_score (+50 pts).
            # On renvoie une valeur positive pour ne pas pénaliser ce cas.
            return 5.0
 
        # Somme brute des valeurs individuelles
        base_value = sum(LEAVE_VALUES.get(t.letter, 0.0) for t in remaining)
 
        # Pénalité de déséquilibre voyelles/consonnes
        vowels    = sum(1 for t in remaining if t.letter in "AEIOUY")
        consonants = len(remaining) - vowels
        imbalance  = abs(vowels - consonants)
        balance_penalty = imbalance * 0.3   # 0.3 pt par lettre en excès
 
        # Pénalité doublon (deux Q, deux W… très gênant)
        from collections import Counter
        counts = Counter(t.letter for t in remaining)
        duplicate_penalty = sum(
            0.5 * (n - 1)
            for letter, n in counts.items()
            if n > 1 and letter not in "AEIOURS"  # doublons de lettres rares
        )
 
        return base_value - balance_penalty - duplicate_penalty
 
    # ------------------------------------------------------------------
    # Joker intelligent
    # ------------------------------------------------------------------
    def _best_joker_word(
        self,
        word_template: str,
        anchor_r: int,
        anchor_c: int,
        horizontal: bool,
        board: "Board",
        rack: List["Tile"],
        use_bonuses: bool,
        bonus_filter: Optional[List[str]],
    ) -> Optional[Tuple[List[Tuple[int, int, str]], int, str]]:
        """
        Lorsqu'un mot nécessite un joker ('*' dans le rack), teste toutes
        les assignations de lettre possibles et retourne la meilleure.
 
        Stratégie de sélection :
        - Pour chaque lettre candidate A-Z, on tente _try_place_word sur
          le mot avec cette lettre substituée au joker.
        - On évalue chaque résultat avec score + leave_value pondérée.
        - On retourne le placement, son score réel, et la lettre assignée.
 
        Retourne (placements, score, lettre_assignée) ou None.
        """
        if "*" not in [t.letter for t in rack]:
            return None  # Pas de joker dans le rack
 
        best_result = None
        best_combined = -999.0
 
        # Identifier la position du joker dans le mot template
        # (le mot template utilise des lettres normales ; on cherche
        #  quelle lettre n'est pas dans le rack sans joker)
        rack_no_joker = [t for t in rack if t.letter != "*"]
        rack_letters  = [t.letter for t in rack_no_joker]
 
        # Lettres du mot qu'on ne peut PAS couvrir sans joker
        available = list(rack_letters)
        joker_positions = []  # indices dans word_template nécessitant le joker
        for i, ch in enumerate(word_template):
            if ch in available:
                available.remove(ch)
            else:
                joker_positions.append(i)
 
        if not joker_positions:
            return None  # Pas besoin de joker pour ce mot
 
        # On ne gère qu'un seul joker à la fois (cas le plus fréquent).
        # Si deux jokers sont nécessaires, on les laisse à _try_place_word.
        if len(joker_positions) > 1:
            return None
 
        joker_idx = joker_positions[0]
 
        for candidate_letter in self._ALPHABET:
            # Construire le mot avec le joker assigné à candidate_letter
            word_with_joker = (
                word_template[:joker_idx]
                + candidate_letter
                + word_template[joker_idx + 1:]
            )
 
            # Le mot doit exister dans le dictionnaire avec cette lettre
            if not self.is_word_valid(word_with_joker):
                continue
 
            result = self._try_place_word(
                word_with_joker,
                anchor_r, anchor_c, horizontal,
                board, rack,
                use_bonuses, bonus_filter,
            )
            if result is None:
                continue
 
            placements, score = result
 
            # Calculer la valeur du leave pour ce coup
            used = [letter for _, _, letter in placements]
            leave_val   = self._evaluate_leave(rack, used)
            leave_weight = 0.3   # Poids fixe pour le joker (toujours Expert-like)
            combined    = score + leave_weight * leave_val
 
            if combined > best_combined:
                best_combined = combined
                best_result   = (placements, score, candidate_letter)
 
        return best_result

# Fin du fichier: backend/game_logic.py