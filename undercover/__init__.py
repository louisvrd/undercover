"""Undercover — le jeu de mots où il faut démasquer les imposteurs."""

from .core import (
    MIN_PLAYERS,
    Elimination,
    Game,
    Player,
    Role,
    RuleError,
    Team,
    max_special_roles,
)
from .words import WordGenerator

__all__ = [
    "MIN_PLAYERS",
    "Elimination",
    "Game",
    "Player",
    "Role",
    "RuleError",
    "Team",
    "WordGenerator",
    "max_special_roles",
]
