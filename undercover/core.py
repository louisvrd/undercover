"""Règles du jeu Undercover.

Les rôles sont distribués à des CARTES, pas à des joueurs : au moment du
tirage, personne n'a encore de nom. Les joueurs revendiquent ensuite une
carte de leur choix, ce qui déplace le hasard de l'application vers la
table.

Ce module est la seule source de vérité sur les règles côté Python. Il ne
fait aucune entrée / sortie — ni print, ni input, ni HTTP — pour que la
console et le portage JavaScript partagent le même comportement.
"""

from __future__ import annotations

import random
import re
import unicodedata
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


def normalize_word(word: str) -> str:
    """Forme canonique d'un mot, pour comparer une proposition tapée au doigt.

    Casse, accents et ponctuation sont ignorés : un Mr. White qui a trouvé
    « porte-clés » ne doit pas perdre parce qu'il a écrit « Porte cles »
    sur un clavier de téléphone. Ce qui reste — les lettres — doit
    correspondre exactement : c'est le mot qu'il faut deviner, pas une
    approximation.
    """
    folded = unicodedata.normalize("NFD", word.casefold())
    stripped = "".join(c for c in folded if not unicodedata.combining(c))
    return " ".join(re.findall(r"[a-z0-9]+", stripped))


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


@dataclass
class Card:
    """Un rôle et son mot, en attente d'un joueur."""

    role: Role
    word: str | None  # None pour Mr. White, qui ne reçoit aucun mot
    owner: str | None = None


@dataclass(frozen=True)
class Player:
    name: str
    role: Role
    word: str | None


@dataclass(frozen=True)
class Elimination:
    """Ce qui se passe après avoir sorti un joueur de la partie."""

    player: str
    role: Role
    game_over: bool
    winner: Team | None
    active_players: tuple[str, ...]
    awaiting_guess: bool = False
    """Un Mr. White vient de tomber : la partie attend sa proposition."""


@dataclass(frozen=True)
class Guess:
    """Le dernier souffle d'un Mr. White éliminé."""

    player: str
    word: str  # la proposition, telle qu'elle a été écrite
    correct: bool
    answer: str  # le mot de la majorité, à afficher une fois la main jouée
    game_over: bool
    winner: Team | None


class Game:
    """Une partie d'Undercover.

    À la construction, les rôles sont posés sur des cartes anonymes.
    `claim()` associe ensuite un joueur à une carte.
    """

    def __init__(
        self,
        player_count: int,
        num_undercover: int,
        num_mr_white: int,
        *,
        words: WordGenerator | None = None,
        rng: random.Random | None = None,
    ) -> None:
        self._validate(player_count, num_undercover, num_mr_white)
        self._rng = rng or random.Random()
        self._eliminated: list[str] = []
        self._pending_guess: str | None = None
        self._mr_white_won = False
        self._cards = self._deal(
            player_count,
            num_undercover,
            num_mr_white,
            words or WordGenerator(rng=self._rng),
        )

        # Mr. White n'a ni mot ni indice entendu : le faire ouvrir le
        # débat reviendrait à lui demander d'inventer à l'aveugle.
        eligible = [i for i, c in enumerate(self._cards) if c.role is not Role.MR_WHITE]
        self._first_card = self._rng.choice(eligible)

    # -- Construction ----------------------------------------------------

    @staticmethod
    def _validate(player_count: int, num_undercover: int, num_mr_white: int) -> None:
        if not isinstance(player_count, int) or isinstance(player_count, bool):
            raise RuleError("Nombre de joueurs invalide")
        if player_count < MIN_PLAYERS:
            raise RuleError(f"Il faut au moins {MIN_PLAYERS} joueurs")
        if num_undercover < 0 or num_mr_white < 0:
            raise RuleError("Les nombres de rôles ne peuvent pas être négatifs")

        total_special = num_undercover + num_mr_white
        if total_special < 1:
            raise RuleError("Il faut au moins un Undercover ou un Mr. White")

        allowed = max_special_roles(player_count)
        if total_special > allowed:
            raise RuleError(
                f"Trop de rôles spéciaux : {total_special} demandés, "
                f"{allowed} maximum à {player_count} joueurs"
            )

    def _deal(
        self,
        player_count: int,
        num_undercover: int,
        num_mr_white: int,
        words: WordGenerator,
    ) -> list[Card]:
        majority_word, undercover_word = words.pair()

        roles = (
            [Role.UNDERCOVER] * num_undercover
            + [Role.MR_WHITE] * num_mr_white
            + [Role.CIVILIAN] * (player_count - num_undercover - num_mr_white)
        )
        self._rng.shuffle(roles)

        word_of = {
            Role.CIVILIAN: majority_word,
            Role.UNDERCOVER: undercover_word,
            Role.MR_WHITE: None,
        }
        return [Card(role=role, word=word_of[role]) for role in roles]

    # -- Cartes ----------------------------------------------------------

    @property
    def card_count(self) -> int:
        return len(self._cards)

    @property
    def owners(self) -> tuple[str | None, ...]:
        """Qui détient chaque carte, ou None si elle est encore libre."""
        return tuple(card.owner for card in self._cards)

    @property
    def all_claimed(self) -> bool:
        return all(card.owner is not None for card in self._cards)

    def _card(self, index: int) -> Card:
        if not isinstance(index, int) or not 0 <= index < len(self._cards):
            raise RuleError("Cette carte n'existe pas")
        return self._cards[index]

    def claim(self, index: int, name: str) -> tuple[Role, str | None]:
        """Attribue une carte à un joueur et révèle son mot.

        Renvoie `(rôle, mot)` — le mot vaut None pour Mr. White.
        """
        card = self._card(index)
        if card.owner is not None:
            raise RuleError(f"Cette carte est déjà prise par {card.owner}")

        cleaned = name.strip()
        if not cleaned:
            raise RuleError("Le nom ne peut pas être vide")
        if cleaned in self.names:
            raise RuleError(f"{cleaned} a déjà pris une carte")

        card.owner = cleaned
        return card.role, card.word

    @property
    def first_speaker(self) -> str | None:
        """Le joueur qui ouvre le débat — jamais Mr. White."""
        return self._cards[self._first_card].owner

    @property
    def speaking_order(self) -> tuple[str, ...]:
        """Les joueurs dans l'ordre de parole, le premier orateur en tête.

        Le tour part de la carte tirée à la construction puis fait le tour
        de la table. Les cartes encore libres sont ignorées : l'ordre se
        complète au fur et à mesure de la distribution.
        """
        count = len(self._cards)
        tour = (self._cards[(self._first_card + i) % count] for i in range(count))
        return tuple(card.owner for card in tour if card.owner is not None)

    # -- Lecture ---------------------------------------------------------

    @property
    def players(self) -> tuple[Player, ...]:
        """Toutes les cartes prises, rôle et mot compris."""
        return tuple(
            Player(name=c.owner, role=c.role, word=c.word)
            for c in self._cards
            if c.owner is not None
        )

    @property
    def names(self) -> tuple[str, ...]:
        return tuple(c.owner for c in self._cards if c.owner is not None)

    @property
    def active_players(self) -> tuple[str, ...]:
        eliminated = set(self._eliminated)
        return tuple(name for name in self.names if name not in eliminated)

    @property
    def eliminated_players(self) -> tuple[str, ...]:
        return tuple(self._eliminated)

    def _player(self, name: str) -> Card:
        for card in self._cards:
            if card.owner == name:
                return card
        raise RuleError(f"{name!r} ne fait pas partie de la partie")

    def word_of(self, name: str) -> str | None:
        """Le mot du joueur, ou None s'il est Mr. White."""
        return self._player(name).word

    def role_of(self, name: str) -> Role:
        return self._player(name).role

    @property
    def majority_word(self) -> str:
        """Le mot des civils — la réponse que Mr. White doit deviner.

        Réservé au maître du jeu : le plafond des rôles spéciaux garantit
        qu'il reste toujours au moins un civil pour le porter.
        """
        for card in self._cards:
            if card.role is Role.CIVILIAN:
                return card.word
        raise RuleError("Cette partie n'a aucun civil")

    @property
    def winner(self) -> Team | None:
        """L'équipe gagnante, ou None si la partie continue."""
        if self._mr_white_won:
            return Team.SPECIALS  # trouvé le mot en sortant
        if not self.all_claimed:
            return None  # distribution en cours
        if self._pending_guess is not None:
            return None  # un Mr. White a encore une main à jouer

        active = [self._player(name) for name in self.active_players]
        specials = sum(1 for card in active if card.role is not Role.CIVILIAN)
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
        if not self.all_claimed:
            raise RuleError("La distribution des cartes n'est pas terminée")
        if self._pending_guess is not None:
            raise RuleError(f"{self._pending_guess} doit d'abord proposer un mot")
        if self.is_over:
            raise RuleError("La partie est terminée")

        card = self._player(name)
        if name in self._eliminated:
            raise RuleError(f"{name} est déjà éliminé")

        self._eliminated.append(name)

        # Un Mr. White démasqué a droit à une dernière main : s'il nomme
        # le mot des civils, il renverse la partie. Tant qu'il n'a pas
        # joué, `winner` reste None — même si le tableau désigne déjà les
        # civils, la partie n'est pas finie.
        if card.role is Role.MR_WHITE:
            self._pending_guess = name

        winner = self.winner
        return Elimination(
            player=name,
            role=card.role,
            game_over=winner is not None,
            winner=winner,
            active_players=self.active_players,
            awaiting_guess=self._pending_guess is not None,
        )

    @property
    def awaiting_guess(self) -> str | None:
        """Le Mr. White dont on attend la proposition, ou None."""
        return self._pending_guess

    def guess(self, word: str) -> Guess:
        """Joue la proposition du Mr. White éliminé.

        S'il nomme le mot des civils, les imposteurs gagnent sur-le-champ,
        quel que soit l'état du tableau. Sinon son élimination tient et la
        partie reprend son cours.
        """
        if self._pending_guess is None:
            raise RuleError("Personne n'attend de proposition")

        cleaned = word.strip()
        if not cleaned:
            raise RuleError("La proposition ne peut pas être vide")

        answer = self.majority_word
        correct = normalize_word(cleaned) == normalize_word(answer)

        player = self._pending_guess
        self._pending_guess = None
        self._mr_white_won = correct

        winner = self.winner
        return Guess(
            player=player,
            word=cleaned,
            correct=correct,
            answer=answer,
            game_over=winner is not None,
            winner=winner,
        )

    def undo_last_elimination(self) -> str:
        """Remet en jeu le dernier joueur éliminé.

        `winner` étant recalculé à partir des joueurs actifs, retirer le
        nom de la liste suffit : une partie déclarée finie redevient en
        cours. Le dernier éliminé étant le seul à avoir pu proposer un
        mot, annuler efface aussi sa proposition.
        """
        if not self._eliminated:
            raise RuleError("Aucune élimination à annuler")
        self._pending_guess = None
        self._mr_white_won = False
        return self._eliminated.pop()

    @property
    def can_undo(self) -> bool:
        return bool(self._eliminated)
