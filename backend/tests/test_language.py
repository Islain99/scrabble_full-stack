# tests/test_language.py
#
# Langue de jeu (français / anglais) : dictionnaire, sac, valeurs des lettres,
# IA, routes solo et salles multijoueur.
#
# Lancer :
#   cd backend && pytest tests/test_language.py -v
#
import pytest

from api.game_logic import SAC_LETTRES, SAC_LETTRES_EN, GameEngine
from api.models import POINTS_LETTRES, POINTS_LETTRES_EN, GameState, Tile, letter_points

FR_WORDS = ["MAISON", "CHAT", "TE", "ET"]
EN_WORDS = ["HOUSE", "CAT", "CATS", "AT", "TA"]


@pytest.fixture
def engine(tmp_path):
    fr = tmp_path / "fr.txt"
    en = tmp_path / "en.txt"
    fr.write_text("\n".join(FR_WORDS), encoding="utf-8")
    en.write_text("\n".join(w.lower() for w in EN_WORDS), encoding="utf-8")   # ENABLE est en minuscules
    return GameEngine(dictionary_path=str(fr), extra_dictionaries={"en": str(en)})


def _rack(letters, points=POINTS_LETTRES_EN):
    return [Tile(letter=l, score=points[l]) for l in letters]


# ── Données du jeu anglais ────────────────────────────────────────

def test_english_bag_is_the_standard_one():
    assert len(SAC_LETTRES_EN) == 100
    assert SAC_LETTRES_EN.count("*") == 2
    assert SAC_LETTRES_EN.count("E") == 12
    assert sum(POINTS_LETTRES_EN[l] for l in SAC_LETTRES_EN) == 187   # total officiel


def test_english_letter_values_differ_from_french():
    assert (POINTS_LETTRES_EN["K"], POINTS_LETTRES["K"]) == (5, 10)
    assert (POINTS_LETTRES_EN["Q"], POINTS_LETTRES["Q"]) == (10, 8)
    assert letter_points("en") is POINTS_LETTRES_EN
    assert letter_points("xx") is POINTS_LETTRES        # inconnue → français


def test_french_bag_untouched():
    assert len(SAC_LETTRES) == 102


# ── Dictionnaires ─────────────────────────────────────────────────

def test_each_language_has_its_dictionary(engine):
    assert engine.is_word_valid("maison") and not engine.is_word_valid("house")
    assert engine.is_word_valid("house", "en") and not engine.is_word_valid("maison", "en")
    assert engine.supports_language("fr") and engine.supports_language("en")
    assert not engine.supports_language("de")


def test_missing_english_dictionary_is_reported(tmp_path):
    fr = tmp_path / "fr.txt"
    fr.write_text("CHAT", encoding="utf-8")
    ge = GameEngine(dictionary_path=str(fr), extra_dictionaries={"en": str(tmp_path / "absent.txt")})
    assert ge.supports_language("fr") and not ge.supports_language("en")


# ── Partie en anglais ─────────────────────────────────────────────

def test_english_game_uses_english_bag_and_values(engine):
    g = engine.start_new_game(["Alice", "Bob"], language="en")
    assert g.language == "en"
    assert len(g.remaining_tiles) == 100 - 14
    for p in g.players:
        for t in p.rack:
            assert t.score == POINTS_LETTRES_EN[t.letter]
    # Les lettres piochées ensuite gardent les valeurs anglaises
    drawn = engine._draw_tiles(g, 7)
    assert all(t.score == POINTS_LETTRES_EN[t.letter] for t in drawn)


def test_unknown_language_falls_back_to_french(engine):
    g = engine.start_new_game(["Alice", "Bob"], language="de")
    assert g.language == "fr" and len(g.remaining_tiles) == 102 - 14


def test_english_game_validates_english_words_only(engine):
    g = engine.start_new_game(["Alice", "Bob"], language="en")
    g.players[0].rack = _rack("CHATSEO")
    ok, msg = engine.play_word(g.game_id, 0, [(7, 7, "C"), (7, 8, "H"), (7, 9, "A"), (7, 10, "T")])
    assert not ok and "CHAT" in msg                          # mot français refusé
    ok, msg = engine.play_word(g.game_id, 0, [(7, 7, "C"), (7, 8, "A"), (7, 9, "T")])
    assert ok, msg
    assert g.players[0].score == (3 + 1 + 1) * 2             # C=3 A=1 T=1, case centrale ×2


def test_ai_plays_in_english(engine):
    g = engine.start_new_game(["Alice", "HAL (IA)"], difficulty="hard", language="en")
    g.players[1].rack = _rack("HOUSEXZ")
    g.current_player_index = 1
    ok, _ = engine.ai_play_turn(g.game_id, 1)
    assert ok
    move = engine.last_ai_move[g.game_id]
    assert move["kind"] == "play" and move["word"] in EN_WORDS


def test_rack_cache_is_kept_per_language(engine):
    """Même chevalet en français puis en anglais : pas de mots croisés entre langues."""
    fr_game = engine.start_new_game(["A", "HAL (IA)"], difficulty="hard")
    fr_game.players[1].rack = _rack("CHAT", POINTS_LETTRES)
    assert engine._find_best_move(fr_game, fr_game.players[1], "hard") is not None   # CHAT
    en_game = engine.start_new_game(["A", "HAL (IA)"], difficulty="hard", language="en")
    en_game.players[1].rack = _rack("CHAT")
    placements, _ = engine._find_best_move(en_game, en_game.players[1], "hard")
    word = "".join(l for _, _, l in sorted(placements))
    assert word.upper() in {"CAT", "AT", "TA"}


def test_saved_game_without_language_is_french():
    """Partie enregistrée avant l'anglais : le champ manque, elle reste en français."""
    g = GameState.model_validate({
        "game_id": "x", "board": {"grid": [[None] * 15 for _ in range(15)]},
        "players": [], "remaining_tiles": [],
    })
    assert g.language == "fr"


# ── Routes solo (vrais dictionnaires chargés par le lifespan) ────

@pytest.mark.anyio
async def test_start_english_solo_game(client):
    r = await client.post("/game/start", params={"difficulty": "easy", "language": "en"},
                          json=["Alice", "HAL 9000 (IA)"])
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["language"] == "en"
    assert len(body["remaining_tiles"]) == 100 - 14


@pytest.mark.anyio
async def test_start_solo_game_defaults_to_french(client):
    r = await client.post("/game/start", json=["Alice", "HAL 9000 (IA)"])
    assert r.status_code == 200 and r.json()["language"] == "fr"


@pytest.mark.anyio
async def test_start_solo_game_refuses_unknown_language(client):
    r = await client.post("/game/start", params={"language": "de"}, json=["Alice", "HAL 9000 (IA)"])
    assert r.status_code == 400


@pytest.mark.anyio
async def test_validate_word_by_language(client):
    r = await client.get("/game/validate", params={"word": "house", "language": "en"})
    assert r.status_code == 200 and r.json()["valid"] is True
    r = await client.get("/game/validate", params={"word": "maison", "language": "en"})
    assert r.json()["valid"] is False
    r = await client.get("/game/validate", params={"word": "maison"})
    assert r.json()["valid"] is True
