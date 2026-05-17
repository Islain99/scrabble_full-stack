import random
import uuid
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

# ---------------------------------------------------------------------------
# Moteur de jeu
# ---------------------------------------------------------------------------

class GameEngine:
    def __init__(self, dictionary_path: str = "dictionnaire.txt"):
        self.valid_words: Set[str] = self._load_dictionary(dictionary_path)
        self.active_games: Dict[str, GameState] = {}
        self.current_word_placement: List[Tuple[int, int, str]] = []
        # Difficulté par partie : game_id -> AIDifficulty
        self.game_difficulty: Dict[str, str] = {}

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
        current_game: GameState,
        current_player: Player,
        difficulty: str,
    ) -> Optional[Tuple[List[Tuple[int, int, str]], int]]:
        """
        Cherche le meilleur coup pour l'IA selon son niveau.

        Paramètres clés par niveau (AI_CONFIG) :
          - max_word_length  : longueur maximale des mots examinés
          - min_word_length  : longueur minimale
          - use_bonuses      : prise en compte des cases bonus
          - bonus_filter     : sous-ensemble de bonus autorisés (None = tous)
          - mistake_chance   : probabilité de rater volontairement son tour
          - prefer_short_words : choisir les mots les plus courts en priorité
          - candidate_pool   : nb max de mots examinés (perf serveur)
          - pick_strategy    : 'random' | 'worst_5' | 'top_3' | 'best'
        """
        config = AI_CONFIG[difficulty]
        max_len       = config["max_word_length"]
        min_len       = config["min_word_length"]
        use_bonuses   = config["use_bonuses"]
        bonus_filter  = config.get("bonus_filter", None)
        mistake_chance = config["mistake_chance"]
        prefer_short  = config["prefer_short_words"]
        pool_size     = config["candidate_pool"]
        pick_strategy = config["pick_strategy"]

        anchors = self._get_anchor_squares(current_game.board)
        board_empty = all(
            current_game.board.grid[r][c] is None for r in range(15) for c in range(15)
        )

        # --- Filtre du dictionnaire ---
        rack_letter_list = [t.letter for t in current_player.rack]

        def rack_can_spell(word: str) -> bool:
            available = list(rack_letter_list)
            jokers = available.count('*')
            needed_jokers = 0
            for ch in word:
                if ch in available:
                    available.remove(ch)
                else:
                    needed_jokers += 1
                    if needed_jokers > jokers:
                        return False
            return True

        candidate_words = [
            w for w in self.valid_words
            if min_len <= len(w) <= max_len and rack_can_spell(w)
        ]

        if len(candidate_words) > pool_size:
            candidate_words = random.sample(candidate_words, pool_size)

        # Débutant/Facile : préférer les mots les plus courts (tri croissant)
        if prefer_short:
            candidate_words.sort(key=len)

        # --- Génération des coups candidats ---
        candidates: List[Tuple[List[Tuple[int, int, str]], int]] = []

        for word in candidate_words:
            for anchor_r, anchor_c in anchors:
                for horizontal in [True, False]:
                    word_len = len(word)
                    for offset in range(word_len):
                        if horizontal:
                            start_r, start_c = anchor_r, anchor_c - offset
                        else:
                            start_r, start_c = anchor_r - offset, anchor_c

                        if start_r < 0 or start_c < 0:
                            continue

                        if board_empty:
                            positions = []
                            for i in range(word_len):
                                if horizontal:
                                    positions.append((start_r, start_c + i))
                                else:
                                    positions.append((start_r + i, start_c))
                            if (7, 7) not in positions:
                                continue

                        result = self._try_place_word(
                            word, start_r, start_c, horizontal,
                            current_game.board, current_player.rack,
                            use_bonuses, bonus_filter
                        )
                        if result:
                            candidates.append(result)

        if not candidates:
            return None

        # --- Erreur volontaire (Débutant / Facile) ---
        if mistake_chance > 0 and random.random() < mistake_chance:
            return None

        # --- Stratégie de sélection ---
        candidates.sort(key=lambda x: x[1], reverse=True)

        if pick_strategy == "random":
            # Débutant : choisit complètement au hasard parmi tous les coups
            return random.choice(candidates)

        if pick_strategy == "worst_5":
            # Facile : choisit parmi les 5 coups avec le score le plus faible
            worst = candidates[-5:] if len(candidates) >= 5 else candidates
            return random.choice(worst)

        if pick_strategy == "top_3":
            # Moyen : choisit parmi les 3 meilleurs
            pool = candidates[:3]
            return random.choice(pool)

        # "best" — Expert : toujours le score maximum
        return candidates[0]

    def ai_play_turn(self, game_id: str, ai_player_id: int) -> Tuple[bool, str]:
        """Exécute le tour de l'IA avec la difficulté configurée pour cette partie."""
        current_game = self.get_game(game_id)
        if not current_game:
            return (False, "Partie non trouvée.")

        current_player = next(
            (p for p in current_game.players if p.id == ai_player_id), None
        )
        if not current_player:
            return (False, "Joueur IA non trouvé.")

        difficulty = self.get_difficulty(game_id)
        config = AI_CONFIG[difficulty]

        best_move = self._find_best_move(current_game, current_player, difficulty)

        if best_move:
            placements, score = best_move
            success, message = self.play_word(game_id, ai_player_id, placements)
            if success:
                label = config["label"]
                return (True, f"L'IA ({label}) joue un mot pour {score} points.")
            # Cas rare : play_word refuse (validation finale échoue)
            return self.pass_turn(game_id, ai_player_id)

        # --- Repli : échange ou passe ---
        can_swap = (
            config["swap_instead_of_pass"]
            and len(current_game.remaining_tiles) >= 7
            and len(current_player.rack) == 7
        )

        if can_swap:
            current_player.rack.sort(key=lambda t: t.score)
            n_swap = config["max_swap_tiles"]
            letters_to_swap = [t.letter for t in current_player.rack[:n_swap]]
            if letters_to_swap:
                success, message = self.swap_tiles(game_id, ai_player_id, letters_to_swap)
                if success:
                    label = config["label"]
                    return (True, f"L'IA ({label}) échange {n_swap} lettre(s).")

        return self.pass_turn(game_id, ai_player_id)
        
# Fin du fichier: backend/game_logic.py