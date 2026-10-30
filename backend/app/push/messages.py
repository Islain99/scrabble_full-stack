# app/push/messages.py
#
# Textes des notifications push, en français et en anglais (langue de l'appareil
# au moment de l'inscription du jeton). {name}, {score}… sont remplacés à l'envoi.
from __future__ import annotations

TEXTS: dict[str, dict[str, tuple[str, str]]] = {
    "fr": {
        "game_invite":     ("Invitation à jouer", "{name} vous invite à une partie de Scrabble."),
        "friend_request":  ("Demande d'ami", "{name} veut vous ajouter en ami."),
        "friend_accepted": ("Nouvel ami", "{name} a accepté votre demande d'ami."),
        "message":         ("{title}", "{preview}"),
        "your_turn":       ("À vous de jouer", "{name} a joué. C'est votre tour."),
        "game_started":    ("La partie commence", "{name} a rejoint votre salle."),
        "game_won":        ("Victoire !", "Vous avez battu {name} {me}–{them}."),
        "game_lost":       ("Partie terminée", "{name} l'emporte {them}–{me}."),
        "game_draw":       ("Égalité", "Match nul contre {name}, {me}–{them}."),
        "test":            ("Notifications activées", "Vous recevrez ici vos invitations et messages."),
    },
    "en": {
        "game_invite":     ("Game invitation", "{name} invites you to a game of Scrabble."),
        "friend_request":  ("Friend request", "{name} wants to add you as a friend."),
        "friend_accepted": ("New friend", "{name} accepted your friend request."),
        "message":         ("{title}", "{preview}"),
        "your_turn":       ("Your turn", "{name} has played. It's your turn."),
        "game_started":    ("The game is on", "{name} joined your room."),
        "game_won":        ("You won!", "You beat {name} {me}–{them}."),
        "game_lost":       ("Game over", "{name} wins {them}–{me}."),
        "game_draw":       ("Draw", "Draw against {name}, {me}–{them}."),
        "test":            ("Notifications on", "Your invitations and messages will show up here."),
    },
}


class _Safe(dict):
    def __missing__(self, key: str) -> str:
        return ""


def render(kind: str, locale: str, params: dict) -> tuple[str, str]:
    table = TEXTS.get(locale) or TEXTS["fr"]
    title, body = table.get(kind) or TEXTS["fr"][kind]
    values = _Safe({k: ("" if v is None else str(v)) for k, v in params.items()})
    return title.format_map(values)[:120], body.format_map(values)[:240]
