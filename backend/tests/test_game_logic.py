# tests/test_game_logic.py
#
# Tests unitaires du moteur de jeu (api/game_logic.py), avec un mini
# dictionnaire pour des résultats déterministes.
#
# Lancer :
#   cd backend && pytest tests/test_game_logic.py -v
#
import pytest

from api.game_logic import BONUS, GameEngine, SAC_LETTRES
from api.models import POINTS_LETTRES, GameState, GameStatus, Tile

MOCK_DICTIONARY = ["TEST", "TESTS", "SCRABBLE", "HELLO", "WORLD", "ET", "TE", "ES"]


# ── Fixtures ──────────────────────────────────────────────────────

@pytest.fixture
def engine(tmp_path):
    """Moteur de jeu chargé avec un dictionnaire minimal (fichier temporaire)."""
    dict_file = tmp_path / "dict.txt"
    dict_file.write_text("\n".join(MOCK_DICTIONARY), encoding="utf-8")
    return GameEngine(dictionary_path=str(dict_file))


def _rack(letters: str) -> list[Tile]:
    return [Tile(letter=l, score=POINTS_LETTRES[l]) for l in letters]


@pytest.fixture
def game(engine):
    """Partie à deux joueurs humains ; le joueur 0 a un chevalet connu."""
    g = engine.start_new_game(["Alice", "Bob"])
    g.players[0].rack = _rack("TESTEAS")
    g.players[1].rack = _rack("ETSAEIO")
    return g


# ── Dictionnaire ──────────────────────────────────────────────────

def test_dictionary_loading(engine):
    assert engine.is_word_valid("TEST") is True
    assert engine.is_word_valid("UNKNOWN") is False
    assert engine.is_word_valid("Scrabble") is True  # insensible à la casse


def test_missing_dictionary_gives_empty_set(tmp_path):
    ge = GameEngine(dictionary_path=str(tmp_path / "absent.txt"))
    assert ge.valid_words == set()


# ── Initialisation ───────────────────────────────────────────────

def test_bag_is_french_distribution():
    assert len(SAC_LETTRES) == 102  # 100 lettres + 2 jokers (Scrabble FR)


def test_game_initialization(engine):
    g = engine.start_new_game(["Alice", "Bob"])

    assert isinstance(g, GameState)
    assert len(g.players) == 2
    assert all(len(p.rack) == 7 for p in g.players)
    assert len(g.remaining_tiles) == len(SAC_LETTRES) - 14
    assert g.status == GameStatus.ACTIVE
    assert g.game_id in engine.active_games


def test_ai_player_detected_by_name(engine):
    g = engine.start_new_game(["Alice", "HAL 9000 (IA)"])
    assert g.players[0].is_ai is False
    assert g.players[1].is_ai is True


def test_tile_points_french_values():
    assert POINTS_LETTRES["E"] == 1
    assert POINTS_LETTRES["Q"] == 8
    assert POINTS_LETTRES["K"] == 10
    assert POINTS_LETTRES["Z"] == 10
    assert POINTS_LETTRES["*"] == 0


# ── play_word : coups valides ────────────────────────────────────

def test_valid_first_word_through_center(engine, game):
    placements = [(7, 7, "T"), (7, 8, "E"), (7, 9, "S"), (7, 10, "T")]

    ok, msg = engine.play_word(game.game_id, 0, placements)

    assert ok is True, msg
    assert game.board.grid[7][7].letter == "T"
    assert game.board.grid[7][10].letter == "T"
    # T+E+S+T = 4, case centrale = mot compte double → 8
    assert game.players[0].score == 8
    assert len(game.players[0].rack) == 7          # rack recomplété
    assert game.current_player_index == 1          # tour passé à Bob


# ── play_word : coups refusés ────────────────────────────────────

def test_first_word_must_cover_center(engine, game):
    ok, msg = engine.play_word(game.game_id, 0, [(0, 0, "E"), (0, 1, "T")])
    assert ok is False
    assert "centrale" in msg


def test_invalid_word_rejected_and_state_unchanged(engine, game):
    rack_before = [t.letter for t in game.players[0].rack]

    ok, msg = engine.play_word(game.game_id, 0, [(7, 7, "S"), (7, 8, "S")])

    assert ok is False
    assert "invalide" in msg.lower()
    assert game.board.grid[7][7] is None
    assert [t.letter for t in game.players[0].rack] == rack_before
    assert game.players[0].score == 0


def test_wrong_turn_rejected(engine, game):
    ok, msg = engine.play_word(game.game_id, 1, [(7, 7, "E"), (7, 8, "T")])
    assert ok is False
    assert "tour" in msg


def test_tile_not_in_rack_rejected(engine, game):
    ok, msg = engine.play_word(game.game_id, 0, [(7, 7, "W"), (7, 8, "O")])
    assert ok is False
    assert "rack" in msg


def test_diagonal_placement_rejected(engine, game):
    ok, _ = engine.play_word(game.game_id, 0, [(7, 7, "E"), (8, 8, "T")])
    assert ok is False


def test_unknown_game(engine):
    ok, msg = engine.play_word("inexistante", 0, [(7, 7, "E")])
    assert ok is False


# ── Passer son tour ──────────────────────────────────────────────

def test_pass_turn_advances_player(engine, game):
    ok, _ = engine.pass_turn(game.game_id, 0)
    assert ok is True
    assert game.passes_count == 1
    assert game.current_player_index == 1


# ── Géométrie du coup : contiguïté et connexion ──────────────────

def test_placement_with_gap_rejected(engine, game):
    # "ET" au centre + un "S" isolé trois cases plus loin sur la même ligne
    ok, msg = engine.play_word(game.game_id, 0, [(7, 7, "E"), (7, 8, "T"), (7, 12, "S")])
    assert ok is False
    assert "continu" in msg
    assert game.board.grid[7][7] is None            # plateau inchangé


def test_word_must_connect_to_existing_tiles(engine, game):
    ok, msg = engine.play_word(game.game_id, 0, [(7, 7, "T"), (7, 8, "E"), (7, 9, "S"), (7, 10, "T")])
    assert ok, msg
    # Bob pose "ET" dans un coin, sans aucun contact avec "TEST"
    ok, msg = engine.play_word(game.game_id, 1, [(0, 0, "E"), (0, 1, "T")])
    assert ok is False
    assert "toucher" in msg


def test_word_connected_to_existing_tile_accepted(engine, game):
    ok, msg = engine.play_word(game.game_id, 0, [(7, 7, "T"), (7, 8, "E"), (7, 9, "S"), (7, 10, "T")])
    assert ok, msg
    # Bob pose un T sous le E de "TEST" → forme "ET" verticalement
    ok, msg = engine.play_word(game.game_id, 1, [(8, 8, "T")])
    assert ok, msg


def test_gap_filled_by_existing_tile_accepted(engine, game):
    ok, msg = engine.play_word(game.game_id, 0, [(7, 7, "E"), (7, 8, "T")])
    assert ok, msg
    # Poser une tuile de chaque côté de "ET" : les cases (7,7) et (7,8)
    # sont déjà occupées, donc ce n'est pas un trou.
    assert engine._validate_placement_geometry(game.board, [(7, 6, "T"), (7, 9, "S")]) is None


def test_same_letter_twice_needs_two_tiles(engine, game):
    """Un seul T sur le chevalet → impossible de poser deux T."""
    game.players[0].rack = _rack("TESEAS")[:6]      # un seul T
    ok, msg = engine.play_word(game.game_id, 0, [(7, 7, "T"), (7, 8, "E"), (7, 9, "S"), (7, 10, "T")])
    assert ok is False
    assert "non trouvée" in msg
    assert len(game.players[0].rack) == 6           # chevalet intact


# ── Calcul du score ───────────────────────────────────────────────
# Valeurs FR : T = E = S = 1 point. "TEST" posé en (7,7)→(7,10) vaut 8
# (case centrale = mot compte double).

def _play_test_at_center(engine, game):
    ok, msg = engine.play_word(game.game_id, 0, [(7, 7, "T"), (7, 8, "E"), (7, 9, "S"), (7, 10, "T")])
    assert ok, msg
    assert game.players[0].score == 8


def test_extension_counts_existing_letters(engine, game):
    """Prolonger TEST en TESTS : les 5 lettres comptent, pas seulement le S."""
    _play_test_at_center(engine, game)
    ok, msg = engine.play_word(game.game_id, 1, [(7, 11, "S")])
    assert ok, msg
    # T+E+S+T = 4 (déjà posées, sans bonus) + S sur lettre compte double (7,11) = 2
    assert game.players[1].score == 6


def test_cross_word_counts_existing_letter(engine, game):
    """Un T sous le E de TEST forme ET : le E existant compte aussi."""
    _play_test_at_center(engine, game)
    ok, msg = engine.play_word(game.game_id, 1, [(8, 8, "T")])
    assert ok, msg
    # E (déjà posé) = 1 + T sur lettre compte double (8,8) = 2
    assert game.players[1].score == 3


def test_bonus_squares_already_used_do_not_count_again(engine, game):
    """La case centrale (mot compte double) n'est plus doublée une fois occupée."""
    _play_test_at_center(engine, game)
    ok, msg = engine.play_word(game.game_id, 1, [(8, 7, "E")])  # T(7,7) + E → "TE"
    assert ok, msg
    assert game.players[1].score == 2


def test_bonus_map_matches_official_board():
    counts = {}
    for kind in BONUS.values():
        counts[kind] = counts.get(kind, 0) + 1
    assert counts == {"TM": 8, "DM": 17, "TL": 12, "DL": 24}
    # Plateau symétrique horizontalement, verticalement et en diagonale
    for (r, c), kind in BONUS.items():
        assert BONUS.get((c, r)) == kind
        assert BONUS.get((14 - r, c)) == kind
        assert BONUS.get((r, 14 - c)) == kind


# ── Joker ─────────────────────────────────────────────────────────
# Convention : lettre minuscule = joker joué comme cette lettre.

def test_joker_played_as_letter(engine, game):
    game.players[0].rack = _rack("TES*AAA")          # pas de second T : le joker le remplace
    ok, msg = engine.play_word(game.game_id, 0, [(7, 7, "T"), (7, 8, "E"), (7, 9, "S"), (7, 10, "t")])
    assert ok, msg
    joker = game.board.grid[7][10]
    assert joker.letter == "T" and joker.is_joker is True and joker.score == 0
    # T(1)+E(1)+S(1)+joker(0) = 3, case centrale mot compte double → 6
    assert game.players[0].score == 6
    assert all(t.letter != "*" for t in game.players[0].rack[:3])  # le joker a quitté le chevalet


def test_joker_letter_extends_existing_word(engine, game):
    game.players[0].rack = _rack("TEST*AA")
    ok, msg = engine.play_word(game.game_id, 0, [(7, 7, "T"), (7, 8, "E"), (7, 9, "S"), (7, 10, "t")])
    assert ok, msg
    game.players[1].rack = _rack("S*AEIOU")
    # Bob prolonge TEST → TESTS avec son vrai S : le joker existant compte 0
    ok, msg = engine.play_word(game.game_id, 1, [(7, 11, "S")])
    assert ok, msg
    # T+E+S+joker(0) = 3 + S sur lettre compte double (7,11) = 2 → 5
    assert game.players[1].score == 5


def test_joker_requires_joker_in_rack(engine, game):
    game.players[0].rack = _rack("TESTAAA")          # aucun joker
    ok, msg = engine.play_word(game.game_id, 0, [(7, 7, "T"), (7, 8, "E"), (7, 9, "S"), (7, 10, "t")])
    assert ok is False
    assert "joker" in msg.lower()


def test_raw_joker_symbol_rejected(engine, game):
    """Envoyer '*' sans choisir de lettre est refusé avec un message clair."""
    game.players[0].rack = _rack("TES*AAA")
    ok, msg = engine.play_word(game.game_id, 0, [(7, 7, "T"), (7, 8, "E"), (7, 9, "S"), (7, 10, "*")])
    assert ok is False
    assert "joker" in msg.lower()
    assert len(game.players[0].rack) == 7


def test_ai_can_use_joker(engine):
    """Avec seulement T + joker, l'IA ne peut jouer qu'en utilisant le joker (ET / TE)."""
    g = engine.start_new_game(["Alice", "HAL (IA)"], difficulty="hard")
    ai = g.players[1]
    ai.rack = _rack("T*")
    g.current_player_index = 1
    move = engine._find_best_move(g, ai, "hard")
    assert move is not None
    placements, _score = move
    letters = [l for _, _, l in placements]
    assert any(l.islower() for l in letters), letters
    ok, msg = engine.play_word(g.game_id, ai.id, placements)
    assert ok, msg



def test_ai_move_is_reported_structured(engine):
    """Le coup de l'IA est exposé sous forme structurée (mot complet, points)."""
    g = engine.start_new_game(["Alice", "HAL (IA)"], difficulty="hard")
    g.players[1].rack = _rack("TEST")
    g.current_player_index = 1
    ok, _ = engine.ai_play_turn(g.game_id, 1)
    assert ok
    move = engine.last_ai_move[g.game_id]
    assert move["kind"] == "play"
    assert move["word"] in MOCK_DICTIONARY
    assert move["score"] == g.players[1].score
