import random
import uuid 
from typing import List, Tuple, Optional, Set, Dict
from backend.api.models import GameState, Player, Tile, POINTS_LETTRES, Board, GameStatus
from copy import deepcopy # Utilisé pour copier l'état du plateau

# Poids des bonus de plateau
BONUS: Dict[Tuple[int, int], str] = {
    # Triple Mot (TM - Rouge)
    (0, 0): "TM", (0, 7): "TM", (0, 14): "TM", (7, 0): "TM", (7, 14): "TM", (14, 0): "TM", (14, 7): "TM", (14, 14): "TM",
    # Double Mot (DM - Rose/Jaune)
    (1, 1): "DM", (2, 2): "DM", (3, 3): "DM", (4, 4): "DM", (1, 13): "DM", (2, 12): "DM", (3, 11): "DM", (4, 10): "DM",
    (13, 1): "DM", (12, 2): "DM", (11, 3): "DM", (10, 4): "DM", (13, 13): "DM", (12, 12): "DM", (11, 11): "DM", (10, 10): "DM",
    (7, 7): "DM", # Case centrale
    # Triple Lettre (TL - Bleu foncé)
    (1, 5): "TL", (1, 9): "TL", (5, 1): "TL", (5, 5): "TL", (5, 9): "TL", (5, 13): "TL",
    (9, 1): "TL", (9, 5): "TL", (9, 9): "TL", (9, 13): "TL", (13, 5): "TL", (13, 9): "TL",
    # Double Lettre (DL - Bleu clair)
    (0, 3): "DL", (0, 11): "DL", (2, 6): "DL", (2, 8): "DL", (3, 0): "DL", (3, 7): "DL", (3, 14): "DL", 
}
    
# Répartition des tuiles pour le Scrabble français (simplifié)
SAC_LETTRES: List[str] = (
    ['A'] * 9 + ['B'] * 2 + ['C'] * 2 + ['D'] * 3 + ['E'] * 15 +
    ['F'] * 2 + ['G'] * 2 + ['H'] * 2 + ['I'] * 8 + ['J'] * 1 +
    ['K'] * 1 + ['L'] * 5 + ['M'] * 3 + ['N'] * 6 + ['O'] * 6 +
    ['P'] * 2 + ['Q'] * 1 + ['R'] * 6 + ['S'] * 6 + ['T'] * 6 +
    ['U'] * 6 + ['V'] * 2 + ['W'] * 1 + ['X'] * 1 + ['Y'] * 1 +
    ['Z'] * 1 + ['*'] * 2  # 2 Jokers
)

class GameEngine:
    def __init__(self, dictionary_path: str = "dictionnaire.txt"):
        self.valid_words: Set[str] = self._load_dictionary(dictionary_path)
        self.active_games: Dict[str, GameState] = {} 
        # Variable temporaire utilisée uniquement pendant le calcul du score d'un coup
        self.current_word_placement: List[Tuple[int, int, str]] = []

    def get_game(self, game_id: str) -> Optional[GameState]:
        """Récupère l'état du jeu par son ID."""
        return self.active_games.get(game_id)

    def _load_dictionary(self, path: str) -> Set[str]:
        """Charge le dictionnaire à partir d'un fichier texte."""
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return {line.strip().upper() for line in f}
        except FileNotFoundError:
            # En environnement de production/test, cette erreur doit être gérée
            print(f"Erreur: Le fichier dictionnaire n'a pas été trouvé à l'adresse {path}.")
            return set()

    def is_word_valid(self, word: str) -> bool:
        """Vérifie si un mot est dans le dictionnaire."""
        return word.upper() in self.valid_words

    def _draw_tiles(self, current_game: GameState, count: int) -> List[Tile]:
        """CORRIGÉ: Tire un certain nombre de tuiles du sac pour le jeu donné."""
        drawn: List[str] = random.sample(current_game.remaining_tiles, 
                                          min(count, len(current_game.remaining_tiles)))
        
        # Mettre à jour le sac du jeu donné
        for letter in drawn:
            current_game.remaining_tiles.remove(letter)
            
        return [Tile(letter=l, score=POINTS_LETTRES.get(l, 0)) for l in drawn]

    def start_new_game(self, player_names: List[str]) -> GameState:
        """Initialise un nouvel état de jeu avec un ID unique."""
        random.shuffle(SAC_LETTRES)
        initial_sac = list(SAC_LETTRES)
        game_id = str(uuid.uuid4())
        
        players = []
        for i, name in enumerate(player_names):
            is_ai_player = "(IA)" in name.upper() # DÉTECTION DE L'IA
            
            player = Player(
                id=i, 
                name=name, 
                rack=[],
                is_ai=is_ai_player # Initialisation de la propriété is_ai
            ) 
            
            # Tirage initial de 7 lettres
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
        return new_game
    
    def _calculate_score(self, tiles_placement: List[Tuple[int, int, Tile]], all_words: List[str]) -> int:
        """
        CORRIGÉ: Calcule le score total pour le coup. 
        Note: self.current_word_placement est toujours utilisé ici, car il est mis à jour juste avant.
        """
        total_score = 0
        
        for word in all_words:
            word_score = 0
            word_multiplier = 1
            
            # Pour simplifier le parcours des tuiles pour le score,
            # nous devons normalement itérer sur les cases du plateau que le mot couvre.
            # En gardant la logique précédente, on suppose que tiles_placement couvre toutes les tuiles
            # nécessaires pour l'évaluation.
            
            for r, c, tile in tiles_placement:
                bonus = BONUS.get((r, c), None)
                letter_score = tile.score
                
                # Vérifie si la tuile a été posée DURANT ce tour (est dans la liste des placements temporaires)
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

    def _get_formed_words(self, placements: List[Tuple[int, int, str]], temp_board: Board) -> List[str]:
        """Détermine tous les mots formés (principal + perpendiculaires) par le coup."""
        formed_words = set()
        rows = {r for r, c, l in placements}
        cols = {c for r, c, l in placements}
        is_horizontal = len(rows) == 1
        is_vertical = len(cols) == 1
        
        if not (is_horizontal or is_vertical):
             return []

        # Logique de détection de mots (inchangée car elle ne dépend pas de l'état global du jeu)
        r_start, c_start, _ = placements[0]
        
        # Trouver le mot principal (horizontal)
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

        # Trouver le mot principal (vertical)
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
                
        # Trouver les mots perpendiculaires
        for r_new, c_new, _ in placements:
            word_perpendicular = ""
            r_temp, c_temp = r_new, c_new
            
            if is_vertical: # Vérifier horizontalement
                 while c_temp > 0 and temp_board.grid[r_new][c_temp - 1] is not None:
                     c_temp -= 1
                 while c_temp < 15 and temp_board.grid[r_new][c_temp] is not None:
                    word_perpendicular += temp_board.grid[r_new][c_temp].letter
                    c_temp += 1
            else: # Vérifier verticalement
                 while r_temp > 0 and temp_board.grid[r_temp - 1][c_new] is not None:
                     r_temp -= 1
                 while r_temp < 15 and temp_board.grid[r_temp][c_new] is not None:
                    word_perpendicular += temp_board.grid[r_temp][c_new].letter
                    r_temp += 1

            if len(word_perpendicular) > 1:
                formed_words.add(word_perpendicular)

        return list(formed_words)

    # --- MÉTHODES DE JEU (CORRIGÉES) ---
    
    def play_word(self, game_id: str, player_id: int, placements: List[Tuple[int, int, str]]) -> Tuple[bool, str]:
        """CORRIGÉ: Gère le placement d'un mot."""
        current_game = self.get_game(game_id)
        if not current_game:
             return (False, "Partie non trouvée.")
             
        if current_game.status != GameStatus.ACTIVE:
             return (False, f"La partie est {current_game.status.value}.")

        if current_game.players[current_game.current_player_index].id != player_id:
             return (False, "Ce n'est pas le tour de ce joueur.")
             
        current_player = current_game.players[current_game.current_player_index]

        # 2. Préparer le plateau temporaire et trouver les tuiles à placer
        # Utiliser deepcopy est essentiel pour ne pas modifier l'état du plateau avant validation
        temp_board = deepcopy(current_game.board) 
        tiles_to_place: List[Tuple[int, int, Tile]] = []
        
        for r, c, l in placements:
            if temp_board.grid[r][c] is not None:
                return (False, "Placement invalide : une case est déjà occupée.")
            
            tile_to_place = next((t for t in current_player.rack if t.letter == l), None)
            if not tile_to_place:
                 return (False, f"Tuile '{l}' non trouvée dans le rack ou déjà utilisée dans ce coup.")
            
            temp_board.grid[r][c] = tile_to_place
            tiles_to_place.append((r, c, tile_to_place))
            
        self.current_word_placement = placements # Mis à jour pour le calcul du score

        # 3. Validation
        # Vérification de connexion, alignement, et dictionnaire (via _get_formed_words)
        formed_words = self._get_formed_words(placements, temp_board)
        
        if not formed_words:
            return (False, "Placement illégal : aucun mot formé ou les tuiles ne sont pas connectées/linéaires.")
            
        # Vérification du premier coup
        if all(current_game.board.grid[r][c] is None for r in range(15) for c in range(15)) and \
           (7, 7) not in [(r, c) for r, c, _ in placements]:
            return (False, "Le premier mot doit passer par la case centrale (7, 7).")
            
        for word in formed_words:
            if not self.is_word_valid(word):
                return (False, f"Mot invalide trouvé : {word}.")

        # 4. Mise à jour de l'état du jeu (Score, Plateau, Rack, Sac)
        score = self._calculate_score(tiles_to_place, formed_words)
        
        for r, c, tile in tiles_to_place:
            current_game.board.grid[r][c] = tile # Mise à jour du plateau permanent
            current_player.rack.remove(tile) 
        
        current_player.score += score
        
        new_tiles = self._draw_tiles(current_game, len(placements)) # CORRIGÉ: Utilise current_game
        current_player.rack.extend(new_tiles)

        current_game.passes_count = 0
        self._check_game_over(current_game) # CORRIGÉ: Utilise current_game
        
        if current_game.status == GameStatus.ACTIVE:
            current_game.current_player_index = (current_game.current_player_index + 1) % len(current_game.players)
        
        return (True, "Mot joué avec succès.")
    
    def pass_turn(self, game_id: str, player_id: int) -> Tuple[bool, str]:
        """CORRIGÉ: Passe le tour et incrémente le compteur de passe."""
        current_game = self.get_game(game_id)
        if not current_game:
             return (False, "Partie non trouvée.")
             
        if current_game.players[current_game.current_player_index].id != player_id:
             return (False, "Ce n'est pas le tour de ce joueur.")
        
        current_game.passes_count += 1

        self._check_game_over(current_game) # CORRIGÉ: Utilise current_game
        
        if current_game.status == GameStatus.ACTIVE:
            current_game.current_player_index = (current_game.current_player_index + 1) % len(current_game.players)
            
        return (True, "Tour passé.")
    
    def swap_tiles(self, game_id: str, player_id: int, letters_to_swap: List[str]) -> Tuple[bool, str]:
        """CORRIGÉ: Échange des lettres dans le rack du joueur contre de nouvelles lettres du sac."""
        current_game = self.get_game(game_id)
        if not current_game:
             return (False, "Partie non trouvée.")

        if current_game.players[current_game.current_player_index].id != player_id:
             return (False, "Ce n'est pas le tour de ce joueur.")
             
        if len(current_game.remaining_tiles) < len(letters_to_swap):
             return (False, "Pas assez de lettres dans le sac pour effectuer l'échange.")
             
        current_player = current_game.players[current_game.current_player_index]
        
        # 1. Retirer les tuiles à échanger du rack
        swapped_tiles: List[Tile] = []
        for letter in letters_to_swap:
            tile_to_remove = next((t for t in current_player.rack if t.letter == letter), None)
            if not tile_to_remove:
                return (False, f"Tuile '{letter}' introuvable dans le rack.")
            
            # Utilisation d'un index pour s'assurer de supprimer la bonne tuile si des lettres sont identiques
            try:
                current_player.rack.remove(tile_to_remove)
                swapped_tiles.append(tile_to_remove)
            except ValueError:
                 return (False, f"Erreur interne: Tuile {letter} non trouvée dans le rack après recherche.")

        # 2. Tirer de nouvelles tuiles pour le joueur
        new_tiles = self._draw_tiles(current_game, len(letters_to_swap)) # CORRIGÉ: Utilise current_game
        current_player.rack.extend(new_tiles)
        
        # 3. Remettre les tuiles échangées dans le sac et mélanger
        current_game.remaining_tiles.extend([t.letter for t in swapped_tiles])
        random.shuffle(current_game.remaining_tiles)
        
        # 4. Passer le tour
        current_game.current_player_index = (current_game.current_player_index + 1) % len(current_game.players)
        current_game.passes_count = 0
        
        return (True, "Lettres échangées avec succès.")
    
    def _finalize_scores(self, current_game: GameState) -> Player:
        """CORRIGÉ: Finalise les scores lorsque la partie est terminée pour le jeu donné."""
        if current_game.status != GameStatus.FINISHED:
            raise Exception("Jeu non terminé ou état invalide pour la finalisation.")
        
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
        """CORRIGÉ: Vérifie les conditions de fin de partie pour le jeu donné."""
        
        if current_game.status == GameStatus.FINISHED:
            return None # Déjà terminé

        # Condition 1: Fin par 'Scrabble out'
        if not current_game.remaining_tiles:
            for player in current_game.players:
                if not player.rack:
                    current_game.status = GameStatus.FINISHED
                    return self._finalize_scores(current_game) 
        
        # Condition 2: Fin par passes consécutives
        if current_game.passes_count >= 6: 
            current_game.status = GameStatus.FINISHED
            return self._finalize_scores(current_game)

        return None
    
    def shuffle_rack(self, current_game: GameState, player_id: int) -> None:
        """Mélange les tuiles dans le rack du joueur."""
        player = next((p for p in current_game.players if p.id == player_id), None)
        
        if player:
            random.shuffle(player.rack)
        else:
            # Ici, vous devriez lever une exception (e.g., ValueError) au lieu de retourner False
            # car le caller (api.py) est dans un bloc try/except.
            raise ValueError("Joueur non trouvé dans la partie.")
        
    def _find_best_move(self, current_game: GameState, current_player: Player) -> Optional[Tuple[List[Tuple[int, int, str]], int]]:
        """
        Logique de l'IA : Recherche et retourne (placements, score) du meilleur coup.
        
        NOTE: Cette fonction est l'implémentation la plus complexe.
        Elle nécessiterait une recherche exhaustive et une structure de dictionnaire optimisée
        (DAWG ou Trie) pour générer des mots possibles à partir du rack et du plateau.
        
        Pour l'heure, nous simulons ici une IA qui joue rarement un coup réel.
        """
        # Dans un vrai moteur, ceci serait une fonction de recherche avancée
        
        # Simulation d'un score trouvé (pour démonstration):
        # Si le sac est presque vide, l'IA essaie de vider son rack.
        if len(current_game.remaining_tiles) < 5 and len(current_player.rack) > 4:
            # L'IA préfère ne rien faire si la partie est trop avancée
            # ou retourne None pour indiquer qu'elle n'a pas trouvé de coup > 0
            return None 

        # Si l'IA trouve un mot avec un score de 20 (simulé)
        # Exemple de retour: ([(7, 7, 'A'), (7, 8, 'T')], 20)
        
        # Pour le moment, l'IA ne joue jamais réellement de mot.
        return None

    def ai_play_turn(self, game_id: str, ai_player_id: int) -> Tuple[bool, str]:
        """NOUVEAU: Exécute le tour de l'IA."""
        current_game = self.get_game(game_id)
        if not current_game:
            return (False, "Partie non trouvée.")
            
        current_player = next(p for p in current_game.players if p.id == ai_player_id)
        if not current_player:
            return (False, "Joueur IA non trouvé.")

        # 1. Recherche du meilleur coup
        best_move = self._find_best_move(current_game, current_player)
        
        if best_move:
            placements, score = best_move
            # Si un coup est trouvé, l'IA le joue (via self.play_word, qui gère le reste)
            return self.play_word(game_id, ai_player_id, placements)
            
        # 2. Logique de repli (si aucun bon coup trouvé)
        
        # Tente d'échanger si le sac est plein (plus de 7 tuiles) et le rack est peu prometteur (simulé)
        if len(current_game.remaining_tiles) >= 7 and len(current_player.rack) == 7:
            # Échange les 3 tuiles les moins chères (simulé)
            current_player.rack.sort(key=lambda t: t.score)
            letters_to_swap = [t.letter for t in current_player.rack[:3]]
            
            if letters_to_swap:
                 # La méthode swap_tiles gère le passage au tour suivant
                 return self.swap_tiles(game_id, ai_player_id, letters_to_swap)

        # 3. Si aucun coup trouvé et pas d'échange possible/justifié, l'IA passe
        return self.pass_turn(game_id, ai_player_id)
    
# Fin du fichier: backend/game_logic.py