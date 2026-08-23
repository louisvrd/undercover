"""Serveur web du jeu Undercover.

Le navigateur ne connaît jamais les rôles : il demande le mot d'un joueur
au moment de l'afficher, et la distribution reste côté serveur jusqu'à la
révélation finale.

    python -m undercover.web
"""

from __future__ import annotations

import os
import secrets
import threading
import uuid
from collections import OrderedDict

from flask import Flask, jsonify, render_template, request, session

from .core import MIN_PLAYERS, Game, Role, RuleError, Team, max_special_roles

ROLE_LABELS = {
    Role.CIVILIAN: "Civil",
    Role.UNDERCOVER: "Undercover",
    Role.MR_WHITE: "Mr. White",
}

WINNER_MESSAGES = {
    Team.CIVILIANS: "Les civils ont gagné : tous les imposteurs sont démasqués !",
    Team.SPECIALS: "Les imposteurs ont gagné : ils ont tenu jusqu'au bout !",
}

# Au-delà, les parties les plus anciennes sont oubliées. Une partie ne
# pèse que quelques centaines d'octets, mais rien ne les supprime sinon.
MAX_CONCURRENT_GAMES = 200


class GameStore:
    """Les parties en cours, une par session navigateur."""

    def __init__(self, max_games: int = MAX_CONCURRENT_GAMES) -> None:
        self._games: OrderedDict[str, Game] = OrderedDict()
        self._lock = threading.Lock()
        self._max_games = max_games

    def put(self, game: Game) -> str:
        game_id = uuid.uuid4().hex
        with self._lock:
            self._games[game_id] = game
            while len(self._games) > self._max_games:
                self._games.popitem(last=False)
        return game_id

    def get(self, game_id: str | None) -> Game | None:
        if not game_id:
            return None
        with self._lock:
            game = self._games.get(game_id)
            if game is not None:
                self._games.move_to_end(game_id)
            return game

    def discard(self, game_id: str | None) -> None:
        if not game_id:
            return
        with self._lock:
            self._games.pop(game_id, None)


class NoActiveGame(Exception):
    """La session ne pointe sur aucune partie connue du serveur."""


def create_app() -> Flask:
    app = Flask(__name__)
    app.config["SECRET_KEY"] = _secret_key()
    store = GameStore()

    def current_game() -> Game:
        game = store.get(session.get("game_id"))
        if game is None:
            raise NoActiveGame
        return game

    def state_of(game: Game) -> dict:
        winner = game.winner
        return {
            "active": list(game.active_players),
            "eliminated": list(game.eliminated_players),
            "gameOver": winner is not None,
            "winner": winner.value if winner else None,
            "message": WINNER_MESSAGES[winner] if winner else None,
        }

    @app.errorhandler(NoActiveGame)
    def _no_game(_error: NoActiveGame):
        return jsonify({"error": "Aucune partie en cours. Relancez une partie."}), 404

    @app.errorhandler(RuleError)
    def _rule_error(error: RuleError):
        return jsonify({"error": str(error)}), 400

    @app.get("/")
    def index():
        return render_template("index.html", min_players=MIN_PLAYERS)

    @app.get("/api/rules")
    def rules():
        """Combien de rôles spéciaux sont permis pour un effectif donné."""
        try:
            players = int(request.args.get("players", MIN_PLAYERS))
        except ValueError:
            raise RuleError("Nombre de joueurs invalide") from None
        return jsonify(
            {
                "minPlayers": MIN_PLAYERS,
                "maxSpecialRoles": max_special_roles(players),
            }
        )

    @app.post("/api/game")
    def new_game():
        payload = request.get_json(silent=True) or {}
        names = payload.get("players")
        if not isinstance(names, list) or not all(isinstance(n, str) for n in names):
            raise RuleError("Liste de joueurs invalide")

        game = Game(
            names,
            _as_count(payload.get("undercover"), "Undercover"),
            _as_count(payload.get("mrWhite"), "Mr. White"),
        )

        store.discard(session.get("game_id"))
        session["game_id"] = store.put(game)
        return jsonify({"players": list(game.names), **state_of(game)}), 201

    @app.post("/api/word")
    def word():
        game = current_game()
        payload = request.get_json(silent=True) or {}
        name = payload.get("player")
        if not isinstance(name, str):
            raise RuleError("Joueur invalide")

        value = game.word_of(name)
        return jsonify({"player": name, "word": value, "isMrWhite": value is None})

    @app.get("/api/state")
    def state():
        return jsonify(state_of(current_game()))

    @app.post("/api/eliminate")
    def eliminate():
        game = current_game()
        payload = request.get_json(silent=True) or {}
        name = payload.get("player")
        if not isinstance(name, str):
            raise RuleError("Joueur invalide")

        result = game.eliminate(name)
        return jsonify(
            {
                "player": result.player,
                "role": ROLE_LABELS[result.role],
                **state_of(game),
            }
        )

    @app.get("/api/reveal")
    def revealed_roles():
        """Rôles et mots de tout le monde — seulement une fois la partie finie."""
        game = current_game()
        if not game.is_over:
            raise RuleError("La partie n'est pas terminée")
        return jsonify(
            [
                {
                    "name": player.name,
                    "role": ROLE_LABELS[player.role],
                    "word": player.word,
                    "eliminated": player.name in game.eliminated_players,
                }
                for player in game.players
            ]
        )

    return app


def _as_count(value: object, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise RuleError(f"Nombre de {label} invalide")
    return value


def _secret_key() -> str:
    """Clé de session : depuis l'environnement, sinon éphémère.

    Sans UNDERCOVER_SECRET_KEY, une clé neuve est tirée à chaque
    démarrage — les parties en cours sont alors perdues au redémarrage.
    """
    key = os.environ.get("UNDERCOVER_SECRET_KEY")
    if key:
        return key
    print(
        "UNDERCOVER_SECRET_KEY non définie : clé de session éphémère, "
        "les parties ne survivront pas à un redémarrage."
    )
    return secrets.token_hex(32)


def main() -> None:
    host = os.environ.get("UNDERCOVER_HOST", "127.0.0.1")
    port = int(os.environ.get("UNDERCOVER_PORT", "5000"))
    debug = os.environ.get("UNDERCOVER_DEBUG", "").lower() in {"1", "true", "yes"}

    if debug and host != "127.0.0.1":
        raise SystemExit(
            "Refus de démarrer : le mode debug expose un shell Python à qui "
            f"peut joindre {host}. Utilisez UNDERCOVER_HOST=127.0.0.1."
        )

    create_app().run(host=host, port=port, debug=debug)


if __name__ == "__main__":
    main()
