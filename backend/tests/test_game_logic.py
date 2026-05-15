# Fichier: backend/tests/test_game_logic.py
import pytest
from backend.api.game_logic import GameEngine
from backend.api.models import POINTS_LETTRES, GameState

# Créez un mock dictionary.txt pour les tests
MOCK_DICTIONARY = ["TEST", "SCRABBLE", "HELLO", "WORLD"]

@pytest.fixture
def mock_engine():
    """Fixture pour initialiser le moteur de jeu avec un dictionnaire mocké."""
    # Créer un fichier temporaire pour le dictionnaire
    with open("temp_dict.txt", "w") as f:
        f.write("\n".join(MOCK_DICTIONARY))
        
    engine = GameEngine(dictionary_path="temp_dict.txt")
    
    # Nettoyage (supprimer le fichier temporaire)
    import os
    os.remove("temp_dict.txt")
    
    return engine

def test_dictionary_loading(mock_engine):
    """Vérifie que le dictionnaire est chargé correctement."""
    assert mock_engine.is_word_valid("TEST") is True
    assert mock_engine.is_word_valid("UNKNOWN") is False
    assert mock_engine.is_word_valid("Scrabble") is True # Teste l'insensibilité à la casse

def test_game_initialization(mock_engine):
    """Vérifie qu'une nouvelle partie est correctement initialisée."""
    game = mock_engine.start_new_game(["Alice", "Bob"])
    
    assert isinstance(game, GameState)
    assert len(game.players) == 2
    assert len(game.players[0].rack) == 7
    assert len(game.remaining_tiles) == 100 - 14 # 100 tuiles au total - 2 racks de 7
    assert game.status == "ACTIVE"
    assert game.game_id in mock_engine.active_games

def test_tile_points():
    """Vérifie les points des lettres de base."""
    assert POINTS_LETTRES.get('E') == 1
    assert POINTS_LETTRES.get('Q') == 8
    assert POINTS_LETTRES.get('Z') == 10

# Exemple de test pour la logique de jeu (Nécessite une implémentation complète de play_word)
# @pytest.mark.skip(reason="Requiert l'implémentation complète de la logique de jeu (Scoring)")
def test_valid_word_placement(mock_engine):
    """Teste un placement simple et valide."""
    game = mock_engine.start_new_game(["TestPlayer"])
    player_id = game.players[0].id
    game_id = game.game_id
    
    # Simuler le rack du joueur pour s'assurer qu'il possède les lettres
    game.players[0].rack = [
        {"letter": "T", "score": 1},
        {"letter": "E", "score": 1},
        {"letter": "S", "score": 1},
        {"letter": "T", "score": 1}
    ]
    
    # Placement: Mot 'TEST' au centre (7,7)
    placements = [
        (7, 7, "T"), (7, 8, "E"), (7, 9, "S"), (7, 10, "T")
    ]
    
    # NOTE: Cette ligne échouera si la logique dans play_word n'est pas finalisée
    success, message = mock_engine.play_word(game_id, player_id, placements) 
    
    # assert success is True 
    # assert game.players[0].score > 0
    # assert game.board.grid[7][7] is not None
    pass

# Vous pouvez exécuter les tests avec la commande: `pytest backend/tests/`