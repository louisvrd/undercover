import random

import pytest

from undercover.core import (
    MIN_PLAYERS,
    Game,
    Role,
    RuleError,
    Team,
    max_special_roles,
    normalize_word,
)
from undercover.words import (
    OPTIONAL_THEMES,
    PAIRS_BY_THEME,
    WORD_PAIRS,
    WordGenerator,
    theme_pairs,
)

NAMES = ["Alice", "Bob", "Chloé", "David", "Emma", "Farid", "Gaby", "Hugo"]


def make_game(players=6, undercover=1, mr_white=0, seed=0, claim=True):
    """Une partie prête à jouer : cartes distribuées, puis revendiquées
    dans l'ordre si `claim`."""
    game = Game(players, undercover, mr_white, rng=random.Random(seed))
    if claim:
        for i in range(players):
            game.claim(i, NAMES[i])
    return game


def role_named(game, role):
    return next(p.name for p in game.players if p.role is role)


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
        make_game(players=3)


def test_rejects_a_game_without_any_special_role():
    with pytest.raises(RuleError, match="au moins un Undercover"):
        make_game(undercover=0, mr_white=0)


def test_rejects_too_many_special_roles():
    with pytest.raises(RuleError, match="Trop de rôles"):
        make_game(players=4, undercover=1, mr_white=1)


def test_accepts_the_documented_maximum():
    game = make_game(players=6, undercover=1, mr_white=1)
    assert game.winner is None, "la partie ne doit pas être finie au coup d'envoi"


# -- Distribution sur les cartes ---------------------------------------


def test_deals_the_requested_roles():
    game = make_game(players=8, undercover=2, mr_white=1)
    roles = [p.role for p in game.players]

    assert roles.count(Role.UNDERCOVER) == 2
    assert roles.count(Role.MR_WHITE) == 1
    assert roles.count(Role.CIVILIAN) == 5


def test_cards_start_unclaimed():
    game = make_game(claim=False)
    assert game.card_count == 6
    assert game.owners == (None,) * 6
    assert game.all_claimed is False
    assert game.names == ()


def test_claim_reveals_the_word_and_takes_the_card():
    game = make_game(claim=False)
    role, word = game.claim(2, "Alice")

    assert game.owners[2] == "Alice"
    assert game.names == ("Alice",)
    assert (word is None) == (role is Role.MR_WHITE)


def test_cannot_claim_a_taken_card():
    game = make_game(claim=False)
    game.claim(0, "Alice")
    with pytest.raises(RuleError, match="déjà prise par Alice"):
        game.claim(0, "Bob")


def test_cannot_claim_two_cards():
    game = make_game(claim=False)
    game.claim(0, "Alice")
    with pytest.raises(RuleError, match="déjà pris une carte"):
        game.claim(1, "Alice")


def test_rejects_a_blank_name():
    game = make_game(claim=False)
    with pytest.raises(RuleError, match="ne peut pas être vide"):
        game.claim(0, "   ")


def test_rejects_an_unknown_card():
    game = make_game(claim=False)
    for bad in (-1, 6, 99):
        with pytest.raises(RuleError, match="n'existe pas"):
            game.claim(bad, "Alice")


def test_name_is_stripped():
    game = make_game(claim=False)
    game.claim(0, "  Alice ")
    assert game.names == ("Alice",)


def test_mr_white_gets_no_word():
    game = make_game(players=6, undercover=1, mr_white=1)
    assert game.word_of(role_named(game, Role.MR_WHITE)) is None


def test_civilians_share_a_word_and_undercovers_another():
    game = make_game(players=6, undercover=2)
    civilian_words = {p.word for p in game.players if p.role is Role.CIVILIAN}
    undercover_words = {p.word for p in game.players if p.role is Role.UNDERCOVER}

    assert len(civilian_words) == 1
    assert len(undercover_words) == 1
    assert civilian_words != undercover_words


def test_same_seed_deals_the_same_cards():
    assert make_game(seed=7).players == make_game(seed=7).players


def test_unknown_player_is_rejected():
    game = make_game()
    with pytest.raises(RuleError, match="ne fait pas partie"):
        game.word_of("Mallory")


# -- Qui ouvre le débat -------------------------------------------------


def test_first_speaker_is_never_mr_white():
    """Sans mot ni indice entendu, Mr. White devrait inventer à l'aveugle."""
    for seed in range(60):
        game = make_game(players=6, undercover=1, mr_white=1, seed=seed)
        assert game.role_of(game.first_speaker) is not Role.MR_WHITE


def test_first_speaker_varies_between_games():
    speakers = {make_game(seed=s).first_speaker for s in range(40)}
    assert len(speakers) > 1, "le premier joueur doit être tiré au sort"


def test_first_speaker_is_unknown_before_its_card_is_taken():
    game = make_game(claim=False)
    assert game.first_speaker is None


def test_speaking_order_starts_with_the_first_speaker():
    game = make_game(players=6, undercover=1)
    assert game.speaking_order[0] == game.first_speaker


def test_speaking_order_goes_around_the_table():
    """C'est une rotation de l'ordre des cartes, pas un nouveau tirage."""
    game = make_game(players=6, undercover=1)
    order = game.speaking_order
    names = game.names

    assert sorted(order) == sorted(names)
    start = names.index(order[0])
    assert order == names[start:] + names[:start]


def test_speaking_order_ignores_cards_still_free():
    game = make_game(players=6, undercover=1, claim=False)
    assert game.speaking_order == ()

    game.claim(0, "Alice")
    assert game.speaking_order == ("Alice",)


# -- Éliminations et victoire ------------------------------------------


def test_no_elimination_before_every_card_is_taken():
    game = make_game(claim=False)
    game.claim(0, "Alice")
    with pytest.raises(RuleError, match="distribution"):
        game.eliminate("Alice")


def test_elimination_moves_player_out_of_the_active_list():
    game = make_game(players=6, undercover=1)
    game.eliminate("Bob")

    assert "Bob" not in game.active_players
    assert game.eliminated_players == ("Bob",)
    assert len(game.active_players) == 5


def test_cannot_eliminate_twice():
    game = make_game(players=6, undercover=1)
    civilian = role_named(game, Role.CIVILIAN)
    game.eliminate(civilian)

    with pytest.raises(RuleError, match="déjà éliminé"):
        game.eliminate(civilian)


def test_civilians_win_when_the_last_special_falls():
    game = make_game(players=6, undercover=1)
    result = game.eliminate(role_named(game, Role.UNDERCOVER))

    assert result.game_over is True
    assert result.winner is Team.CIVILIANS
    assert game.is_over


def test_specials_win_once_they_equal_the_civilians():
    game = make_game(players=6, undercover=2)
    civilians = [p.name for p in game.players if p.role is Role.CIVILIAN]

    # 4 civils / 2 undercover : le groupe se trompe deux fois de suite.
    assert game.eliminate(civilians[0]).game_over is False
    result = game.eliminate(civilians[1])

    assert result.game_over is True
    assert result.winner is Team.SPECIALS


def test_cannot_eliminate_after_the_game_is_over():
    game = make_game(players=6, undercover=1)
    game.eliminate(role_named(game, Role.UNDERCOVER))

    with pytest.raises(RuleError, match="terminée"):
        game.eliminate(next(iter(game.active_players)))


# -- Le dernier mot de Mr. White ---------------------------------------


def test_eliminating_mr_white_suspends_the_game():
    """Les civils ne gagnent pas tant que Mr. White n'a pas proposé."""
    game = make_game(players=6, undercover=0, mr_white=1)
    result = game.eliminate(role_named(game, Role.MR_WHITE))

    assert result.awaiting_guess is True
    assert result.game_over is False  # le tableau dit civils, la règle dit "attends"
    assert result.winner is None
    assert game.is_over is False


def test_mr_white_wins_by_naming_the_majority_word():
    game = make_game(players=6, undercover=0, mr_white=1)
    mr_white = role_named(game, Role.MR_WHITE)
    game.eliminate(mr_white)

    result = game.guess(game.majority_word)

    assert result.correct is True
    assert result.player == mr_white
    assert result.winner is Team.SPECIALS
    assert game.winner is Team.SPECIALS


def test_a_wrong_guess_hands_the_game_back_to_the_civilians():
    game = make_game(players=6, undercover=0, mr_white=1)
    game.eliminate(role_named(game, Role.MR_WHITE))

    result = game.guess("nimportequoi")

    assert result.correct is False
    assert result.answer == game.majority_word  # révélé pour la table
    assert game.winner is Team.CIVILIANS


def test_a_wrong_guess_lets_a_running_game_continue():
    """Mr. White tombe alors qu'un Undercover tient encore : on repart."""
    game = make_game(players=6, undercover=1, mr_white=1)
    game.eliminate(role_named(game, Role.MR_WHITE))

    assert game.guess("nimportequoi").game_over is False
    assert game.is_over is False
    assert game.awaiting_guess is None


def test_guess_ignores_case_accents_and_punctuation():
    """Le mot est tapé au doigt : « Porte-Clés » vaut « porte cles »."""
    assert normalize_word("Porte-Clés") == normalize_word("  porte cles ")
    assert normalize_word("Éclair") == normalize_word("eclair")
    assert normalize_word("chat") != normalize_word("chien")


def test_nothing_else_happens_until_mr_white_has_spoken():
    game = make_game(players=6, undercover=1, mr_white=1)
    mr_white = role_named(game, Role.MR_WHITE)
    game.eliminate(mr_white)

    assert game.awaiting_guess == mr_white
    with pytest.raises(RuleError, match="doit d'abord proposer"):
        game.eliminate(role_named(game, Role.CIVILIAN))


def test_only_an_eliminated_mr_white_may_guess():
    game = make_game(players=6, undercover=1, mr_white=0)
    with pytest.raises(RuleError, match="Personne n'attend"):
        game.guess("chat")

    game.eliminate(role_named(game, Role.CIVILIAN))
    with pytest.raises(RuleError, match="Personne n'attend"):
        game.guess("chat")


def test_an_empty_guess_is_refused():
    game = make_game(players=6, undercover=0, mr_white=1)
    game.eliminate(role_named(game, Role.MR_WHITE))

    with pytest.raises(RuleError, match="ne peut pas être vide"):
        game.guess("   ")
    assert game.awaiting_guess is not None  # la main reste à jouer


def test_each_mr_white_gets_his_own_guess():
    game = make_game(players=8, undercover=0, mr_white=2)
    whites = [p.name for p in game.players if p.role is Role.MR_WHITE]

    game.eliminate(whites[0])
    game.guess("nimportequoi")
    game.eliminate(whites[1])

    assert game.awaiting_guess == whites[1]
    assert game.guess(game.majority_word).winner is Team.SPECIALS


# -- Annulation --------------------------------------------------------


def test_undo_puts_the_player_back_in_play():
    game = make_game(players=6, undercover=1)
    civilian = role_named(game, Role.CIVILIAN)
    game.eliminate(civilian)

    assert game.undo_last_elimination() == civilian
    assert civilian in game.active_players
    assert game.eliminated_players == ()


def test_undo_revives_a_finished_game():
    """Sortir le dernier imposteur finit la partie ; l'annuler la relance."""
    game = make_game(players=6, undercover=1)
    undercover = role_named(game, Role.UNDERCOVER)
    game.eliminate(undercover)
    assert game.is_over

    game.undo_last_elimination()

    assert not game.is_over
    assert game.eliminate(undercover).game_over is True


def test_undo_cancels_a_win_by_guess():
    game = make_game(players=6, undercover=0, mr_white=1)
    mr_white = role_named(game, Role.MR_WHITE)
    game.eliminate(mr_white)
    game.guess(game.majority_word)
    assert game.winner is Team.SPECIALS

    game.undo_last_elimination()

    assert game.winner is None
    assert mr_white in game.active_players


def test_undo_clears_a_guess_still_owed():
    game = make_game(players=6, undercover=1, mr_white=1)
    game.eliminate(role_named(game, Role.MR_WHITE))

    game.undo_last_elimination()

    assert game.awaiting_guess is None
    assert game.eliminate(role_named(game, Role.CIVILIAN)).game_over is False


def test_undo_without_elimination_is_refused():
    game = make_game()
    assert game.can_undo is False
    with pytest.raises(RuleError, match="Aucune élimination"):
        game.undo_last_elimination()


# -- Générateur de mots ------------------------------------------------


def test_pair_comes_from_the_dictionary():
    generator = WordGenerator(rng=random.Random(1))
    known = {frozenset(pair) for pair in WORD_PAIRS}

    for _ in range(300):
        first, second = generator.pair()
        assert first != second
        assert frozenset((first, second)) in known


def test_pair_order_is_drawn_too():
    """Sinon le mot de la majorité serait toujours le premier écrit, et
    connaître la liste révélerait son camp."""
    generator = WordGenerator(pairs=[("a", "b")], rng=random.Random(0))
    seen = {generator.pair() for _ in range(60)}
    assert seen == {("a", "b"), ("b", "a")}


def test_pair_count_is_the_number_of_pairs():
    assert WordGenerator(pairs=[("a", "b"), ("c", "d")]).pair_count() == 2


def test_rejects_a_malformed_pair():
    with pytest.raises(ValueError, match="deux mots distincts"):
        WordGenerator(pairs=[("a", "b"), ("solo", "solo")])
    with pytest.raises(ValueError, match="deux mots distincts"):
        WordGenerator(pairs=[("a", "b", "c")])


def test_shipped_pairs_are_all_usable():
    assert WordGenerator().pair_count() == len(WORD_PAIRS)
    for first, second in WORD_PAIRS:
        assert first != second


def test_optional_theme_stays_out_of_the_general_draw():
    """Un thème exclusif ne doit jamais tomber dans une partie normale."""
    general = {frozenset(pair) for pair in WORD_PAIRS}
    for theme in OPTIONAL_THEMES:
        for pair in theme_pairs(theme):
            assert frozenset(pair) not in general


def test_optional_theme_is_playable_alone():
    theme = OPTIONAL_THEMES[0]
    pairs = theme_pairs(theme)
    assert len(pairs) >= 20  # de quoi enchaîner les parties sans se répéter

    generator = WordGenerator(pairs=pairs, rng=random.Random(3))
    known = {frozenset(pair) for pair in pairs}
    for _ in range(120):
        assert frozenset(generator.pair()) in known


def test_optional_theme_pairs_are_well_formed():
    for theme in OPTIONAL_THEMES:
        pairs = theme_pairs(theme)
        assert len({frozenset(p) for p in pairs}) == len(pairs)
        for first, second in pairs:
            assert first != second
            assert " " not in first and " " not in second


def test_unknown_theme_is_rejected():
    with pytest.raises(KeyError, match="Thème inconnu"):
        theme_pairs("Thème qui n'existe pas")


def test_theme_of_never_names_an_optional_theme():
    """theme_of indexe le tirage général : les exclusifs en sont absents."""
    from undercover.words import theme_of

    for i in range(len(WORD_PAIRS)):
        assert theme_of(i) not in OPTIONAL_THEMES


def test_no_duplicate_pair():
    assert len({frozenset(p) for p in WORD_PAIRS}) == len(WORD_PAIRS)
