"""Règles du jeu Undercover.

Ce module est la seule source de vérité sur les règles : distribution des
rôles, éliminations, conditions de victoire. Il ne fait aucune entrée /
sortie — ni print, ni input, ni HTTP — pour que la console et le serveur
web partagent exactement le même comportement.
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from enum import Enum

from .words import WordGenerator

MIN_PLAYERS = 4


class Role(str, Enum):
    CIVILIAN = "civilian"
    UNDERCOVER = "undercover"
    MR_WHITE = "mr_white"


class Team(str, Enum):
    CIVILIANS = "civilians"
    SPECIALS = "specials"


class RuleError(ValueError):
    """Une règle du jeu est violée (setup invalide, coup impossible)."""


def max_special_roles(num_players: int) -> int:
    """Nombre maximum d'Undercover + Mr. White pour `num_players` joueurs.

    Les civils doivent rester strictement majoritaires au coup d'envoi :
    sinon la condition de victoire des rôles spéciaux est déjà remplie et
    la partie est finie avant d'avoir commencé.

        4 joueurs -> 1     7 joueurs -> 3
        5 joueurs -> 2     8 joueurs -> 3
        6 joueurs -> 2     9 joueurs -> 4
    """
    return max(0, (num_players - 1) // 2)


@dataclass(frozen=True)
class Player:
    name: str
    role: Role
    word: str | None  # None pour Mr. White, qui ne reçoit aucun mot


@dataclass(frozen=True)
class Elimination:
    """Ce qui se passe après avoir sorti un joueur de la partie."""

    player: str
    role: Role
    game_over: bool
    winner: Team | None
    active_players: tuple[str, ...]


class Game:
    """Une partie d'Undercover.

    Les rôles sont distribués au moment de la construction : un objet
    `Game` représente toujours une partie déjà prête à jouer.
    """

    def __init__(
        self,
        names: list[str],
        num_undercover: int,
        num_mr_white: int,
        *,
        words: WordGenerator | None = None,
        rng: random.Random | None = None,
    ) -> None:
        cleaned = self._validate(names, num_undercover, num_mr_white)
        self._rng = rng or random.Random()
        self._eliminated: list[str] = []
        self._players = self._deal(
            cleaned, num_undercover, num_mr_white, words or WordGenerator(rng=self._rng)
        )
        self._by_name = {player.name: player for player in self._players}

    # -- Construction ----------------------------------------------------

    @staticmethod
    def _validate(names: list[str], num_undercover: int, num_mr_white: int) -> list[str]:
        cleaned = [name.strip() for name in names]
        if any(not name for name in cleaned):
            raise RuleError("Les noms de joueurs ne peuvent pas être vides")
        if len(set(cleaned)) != len(cleaned):
            raise RuleError("Les noms de joueurs doivent être uniques")
        if len(cleaned) < MIN_PLAYERS:
            raise RuleError(f"Il faut au moins {MIN_PLAYERS} joueurs")
        if num_undercover < 0 or num_mr_white < 0:
            raise RuleError("Les nombres de rôles ne peuvent pas être négatifs")

        total_special = num_undercover + num_mr_white
        if total_special < 1:
            raise RuleError("Il faut au moins un Undercover ou un Mr. White")

        allowed = max_special_roles(len(cleaned))
        if total_special > allowed:
            raise RuleError(
                f"Trop de rôles spéciaux : {total_special} demandés, "
                f"{allowed} maximum à {len(cleaned)} joueurs"
            )
        return cleaned

    def _deal(
        self,
        names: list[str],
        num_undercover: int,
        num_mr_white: int,
        words: WordGenerator,
    ) -> tuple[Player, ...]:
        majority_word, undercover_word = words.pair()

        roles = (
            [Role.UNDERCOVER] * num_undercover
            + [Role.MR_WHITE] * num_mr_white
            + [Role.CIVILIAN] * (len(names) - num_undercover - num_mr_white)
        )
        self._rng.shuffle(roles)

        word_of = {
            Role.CIVILIAN: majority_word,
            Role.UNDERCOVER: undercover_word,
            Role.MR_WHITE: None,
        }
        # L'ordre des joueurs suit celui de la saisie ; c'est le tirage des
        # rôles qui est mélangé, pas la liste affichée.
        return tuple(
            Player(name=name, role=role, word=word_of[role])
            for name, role in zip(names, roles)
        )

    # -- Lecture ---------------------------------------------------------

    @property
    def players(self) -> tuple[Player, ...]:
        """Tous les joueurs, rôle et mot compris. Réservé au maître du jeu."""
        return self._players

    @property
    def names(self) -> tuple[str, ...]:
        return tuple(player.name for player in self._players)

    @property
    def active_players(self) -> tuple[str, ...]:
        eliminated = set(self._eliminated)
        return tuple(name for name in self.names if name not in eliminated)

    @property
    def eliminated_players(self) -> tuple[str, ...]:
        return tuple(self._eliminated)

    def _player(self, name: str) -> Player:
        try:
            return self._by_name[name]
        except KeyError:
            raise RuleError(f"{name!r} ne fait pas partie de la partie") from None

    def word_of(self, name: str) -> str | None:
        """Le mot du joueur, ou None s'il est Mr. White."""
        return self._player(name).word

    def role_of(self, name: str) -> Role:
        return self._player(name).role

    @property
    def winner(self) -> Team | None:
        """L'équipe gagnante, ou None si la partie continue."""
        active = [self._by_name[name] for name in self.active_players]
        specials = sum(1 for player in active if player.role is not Role.CIVILIAN)
        civilians = len(active) - specials

        if specials == 0:
            return Team.CIVILIANS
        if specials >= civilians:
            return Team.SPECIALS
        return None

    @property
    def is_over(self) -> bool:
        return self.winner is not None

    # -- Jeu -------------------------------------------------------------

    def eliminate(self, name: str) -> Elimination:
        """Sort un joueur de la partie et recalcule la condition de victoire."""
        if self.is_over:
            raise RuleError("La partie est terminée")

        player = self._player(name)
        if name in self._eliminated:
            raise RuleError(f"{name} est déjà éliminé")

        self._eliminated.append(name)
        winner = self.winner
        return Elimination(
            player=name,
            role=player.role,
            game_over=winner is not None,
            winner=winner,
            active_players=self.active_players,
        )
