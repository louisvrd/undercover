import random

import pytest

from undercover.core import (
    MIN_PLAYERS,
    Game,
    Role,
    RuleError,
    Team,
    max_special_roles,
)
from undercover.words import WORD_GROUPS, WordGenerator

FOUR = ["Alice", "Bob", "Chloé", "David"]
SIX = FOUR + ["Emma", "Farid"]
EIGHT = SIX + ["Gaby", "Hugo"]


def make_game(names=SIX, undercover=1, mr_white=0, seed=0):
    return Game(names, undercover, mr_white, rng=random.Random(seed))


# -- Nombre de rôles spéciaux ------------------------------------------


@pytest.mark.parametrize(
    "players,expected",
    [(4, 1), (5, 2), (6, 2), (7, 3), (8, 3), (9, 4), (10, 4)],
)
def test_max_special_roles(players, expected):
    assert max_special_roles(players) == expected


def test_max_special_keeps_civilians_in_majority():
    """Le maximum autorisé ne doit jamais rendre la partie déjà finie."""
    for players in range(MIN_PLAYERS, 21):
        specials = max_special_roles(players)
        assert specials < players - specials


# -- Validation du setup -----------------------------------------------


def test_rejects_too_few_players():
    with pytest.raises(RuleError, match="au moins 4 joueurs"):
        make_game(names=["Alice", "Bob", "Chloé"])


def test_rejects_duplicate_names():
    with pytest.raises(RuleError, match="uniques"):
        make_game(names=["Alice", "Bob", "Chloé", "Alice"])


def test_rejects_blank_names():
    with pytest.raises(RuleError, match="vides"):
        make_game(names=["Alice", "  ", "Chloé", "David"])


def test_strips_surrounding_whitespace():
    game = make_game(names=["  Alice ", "Bob", "Chloé", "David"], undercover=1)
    assert game.names[0] == "Alice"


def test_rejects_a_game_without_any_special_role():
    with pytest.raises(RuleError, match="au moins un Undercover"):
        make_game(undercover=0, mr_white=0)


def test_rejects_too_many_special_roles():
    with pytest.raises(RuleError, match="Trop de rôles"):
        make_game(names=FOUR, undercover=1, mr_white=1)


def test_accepts_the_documented_maximum():
    game = make_game(names=SIX, undercover=1, mr_white=1)
    assert game.winner is None, "la partie ne doit pas être finie au coup d'envoi"


# -- Distribution ------------------------------------------------------


def test_deals_the_requested_roles():
    # 8 joueurs : 3 rôles spéciaux permis, soit le maximum ici.
    game = make_game(names=EIGHT, undercover=2, mr_white=1)
    roles = [player.role for player in game.players]

    assert roles.count(Role.UNDERCOVER) == 2
    assert roles.count(Role.MR_WHITE) == 1
    assert roles.count(Role.CIVILIAN) == 5


def test_mr_white_gets_no_word():
    game = make_game(names=SIX, undercover=1, mr_white=1)
    mr_white = next(p for p in game.players if p.role is Role.MR_WHITE)
    assert mr_white.word is None
    assert game.word_of(mr_white.name) is None


def test_civilians_share_a_word_and_undercovers_another():
    game = make_game(names=SIX, undercover=2)
    civilian_words = {p.word for p in game.players if p.role is Role.CIVILIAN}
    undercover_words = {p.word for p in game.players if p.role is Role.UNDERCOVER}

    assert len(civilian_words) == 1
    assert len(undercover_words) == 1
    assert civilian_words != undercover_words


def test_player_order_follows_input_order():
    game = make_game(names=SIX)
    assert game.names == tuple(SIX)


def test_same_seed_deals_the_same_game():
    first = make_game(seed=7)
    second = make_game(seed=7)
    assert first.players == second.players


def test_unknown_player_is_rejected():
    game = make_game()
    with pytest.raises(RuleError, match="ne fait pas partie"):
        game.word_of("Mallory")


# -- Éliminations et victoire ------------------------------------------


def test_elimination_moves_player_out_of_the_active_list():
    game = make_game(names=SIX, undercover=1)
    game.eliminate("Bob")

    assert "Bob" not in game.active_players
    assert game.eliminated_players == ("Bob",)
    assert len(game.active_players) == 5


def test_cannot_eliminate_twice():
    game = make_game(names=SIX, undercover=1)
    # Un civil : sortir l'undercover terminerait la partie, et l'erreur
    # levée ne serait plus celle qu'on teste.
    civilian = next(p.name for p in game.players if p.role is Role.CIVILIAN)
    game.eliminate(civilian)

    with pytest.raises(RuleError, match="déjà éliminé"):
        game.eliminate(civilian)


def test_civilians_win_when_the_last_special_falls():
    game = make_game(names=SIX, undercover=1)
    undercover = next(p.name for p in game.players if p.role is Role.UNDERCOVER)

    result = game.eliminate(undercover)

    assert result.game_over is True
    assert result.winner is Team.CIVILIANS
    assert game.is_over


def test_specials_win_once_they_equal_the_civilians():
    game = make_game(names=SIX, undercover=2)
    civilians = [p.name for p in game.players if p.role is Role.CIVILIAN]

    # 4 civils / 2 undercover : le groupe se trompe deux fois de suite.
    assert game.eliminate(civilians[0]).game_over is False
    result = game.eliminate(civilians[1])

    assert result.game_over is True
    assert result.winner is Team.SPECIALS
    assert set(result.active_players) == set(game.active_players)


def test_elimination_reports_the_role_of_the_victim():
    game = make_game(names=SIX, undercover=1)
    undercover = next(p.name for p in game.players if p.role is Role.UNDERCOVER)
    assert game.eliminate(undercover).role is Role.UNDERCOVER


def test_cannot_eliminate_after_the_game_is_over():
    game = make_game(names=SIX, undercover=1)
    undercover = next(p.name for p in game.players if p.role is Role.UNDERCOVER)
    game.eliminate(undercover)

    with pytest.raises(RuleError, match="terminée"):
        game.eliminate(next(iter(game.active_players)))


# -- Annulation --------------------------------------------------------


def test_undo_puts_the_player_back_in_play():
    game = make_game(names=SIX, undercover=1)
    civilian = next(p.name for p in game.players if p.role is Role.CIVILIAN)
    game.eliminate(civilian)

    assert game.undo_last_elimination() == civilian
    assert civilian in game.active_players
    assert game.eliminated_players == ()


def test_undo_revives_a_finished_game():
    """Sortir le dernier imposteur finit la partie ; l'annuler la relance."""
    game = make_game(names=SIX, undercover=1)
    undercover = next(p.name for p in game.players if p.role is Role.UNDERCOVER)
    game.eliminate(undercover)
    assert game.is_over

    game.undo_last_elimination()

    assert not game.is_over
    assert game.winner is None
    # …et on peut rejouer le coup.
    assert game.eliminate(undercover).game_over is True


def test_undo_unwinds_one_step_at_a_time():
    game = make_game(names=SIX, undercover=2)
    civilians = [p.name for p in game.players if p.role is Role.CIVILIAN]
    game.eliminate(civilians[0])
    game.eliminate(civilians[1])

    game.undo_last_elimination()
    assert game.eliminated_players == (civilians[0],)


def test_undo_without_elimination_is_refused():
    game = make_game()
    assert game.can_undo is False
    with pytest.raises(RuleError, match="Aucune élimination"):
        game.undo_last_elimination()


# -- Générateur de mots ------------------------------------------------


def test_pair_is_two_distinct_words_from_one_group():
    generator = WordGenerator(rng=random.Random(1))
    for _ in range(200):
        first, second = generator.pair()
        assert first != second
        assert any({first, second} <= set(group) for group in WORD_GROUPS)


def test_pair_count_matches_the_groups():
    generator = WordGenerator(groups=[("a", "b", "c"), ("d", "e")])
    assert generator.pair_count() == 3 + 1


def test_rejects_a_group_too_small_to_draw_from():
    with pytest.raises(ValueError, match="moins de 2 mots"):
        WordGenerator(groups=[("a", "b"), ("solo",)])


def test_shipped_groups_are_all_usable():
    assert WordGenerator().pair_count() > 0
    for group in WORD_GROUPS:
        assert len(set(group)) >= 2
