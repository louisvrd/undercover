"""Undercover en console.

Un seul appareil passe de main en main : chacun découvre son mot en
privé, puis le groupe débat à voix haute et l'animateur saisit le nom du
joueur éliminé.

    python -m undercover.cli
"""

from __future__ import annotations

import os

from .core import MIN_PLAYERS, Game, Role, RuleError, Team, max_special_roles
from .words import OPTIONAL_THEMES, WordGenerator, theme_pairs

ROLE_LABELS = {
    Role.CIVILIAN: "Civil",
    Role.UNDERCOVER: "Undercover",
    Role.MR_WHITE: "Mr. White",
}


def clear_screen() -> None:
    os.system("cls" if os.name == "nt" else "clear")


def ask_int(prompt: str, minimum: int, maximum: int | None = None) -> int:
    while True:
        raw = input(prompt).strip()
        try:
            value = int(raw)
        except ValueError:
            print("Entrez un nombre.")
            continue
        if value < minimum:
            print(f"Minimum : {minimum}.")
        elif maximum is not None and value > maximum:
            print(f"Maximum : {maximum}.")
        else:
            return value


def ask_names(count: int) -> list[str]:
    names: list[str] = []
    for i in range(count):
        while True:
            name = input(f"Nom du joueur {i + 1} : ").strip()
            if not name:
                print("Le nom ne peut pas être vide.")
            elif name in names:
                print("Ce nom est déjà pris.")
            else:
                names.append(name)
                break
    return names


def ask_yes_no(prompt: str) -> bool:
    while True:
        answer = input(prompt).strip().casefold()
        if answer in ("o", "oui"):
            return True
        if answer in ("n", "non", ""):
            return False
        print("Répondez par o ou n.")


def ask_choice(prompt: str, choices: list[int]) -> int:
    while True:
        raw = input(prompt).strip()
        try:
            value = int(raw)
        except ValueError:
            print("Entrez un nombre.")
            continue
        if value in choices:
            return value
        print("Cette carte n'est pas libre.")


def ask_player(prompt: str, choices: tuple[str, ...]) -> str:
    lookup = {name.casefold(): name for name in choices}
    while True:
        answer = input(prompt).strip().casefold()
        if answer in lookup:
            return lookup[answer]
        print("Ce joueur n'est pas en jeu.")


def ask_guess(game: Game, name: str) -> bool:
    """Fait jouer la dernière main d'un Mr. White éliminé.

    Renvoie True s'il a trouvé. Le mot des civils n'est révélé que si la
    partie s'arrête là : l'annoncer alors qu'un Undercover est encore en
    jeu offrirait la réponse à toute la table.
    """
    print(f"\n{name}, vous sortez — mais vous avez une dernière chance.")
    print("Nommez le mot des civils et les imposteurs l'emportent.")

    while True:
        try:
            result = game.guess(input("\nVotre proposition : "))
            break
        except RuleError as error:
            print(error)

    if result.correct:
        print(f"\n« {result.word} » — c'était bien le mot !")
    else:
        print(f"\n« {result.word} » : raté.")
        if game.is_over:
            print(f"Le mot des civils était : {result.answer}")
    return result.correct


def setup_game() -> tuple[Game, list[str]]:
    clear_screen()
    print("=== Configuration de la partie ===\n")

    num_players = ask_int(f"Combien de joueurs ? (minimum {MIN_PLAYERS}) : ", MIN_PLAYERS)
    names = ask_names(num_players)

    allowed = max_special_roles(num_players)
    print(f"\nÀ {num_players} joueurs, {allowed} rôle(s) spécial(aux) au maximum.")
    num_undercover = ask_int("Combien d'Undercover ? : ", 0, allowed)
    num_mr_white = ask_int("Combien de Mr. White ? : ", 0, allowed - num_undercover)

    # Un thème exclusif remplace le dictionnaire au lieu de le compléter :
    # mélanger des personnages de jeu vidéo au reste laisserait la table
    # sans repère sur l'univers dans lequel elle joue.
    exclusif = OPTIONAL_THEMES[0]
    words = None
    if ask_yes_no(f"\nMode {exclusif} ? (o/n) : "):
        words = WordGenerator(pairs=theme_pairs(exclusif))

    return Game(num_players, num_undercover, num_mr_white, words=words), names


def deal_cards(game: Game, names: list[str]) -> None:
    """Chacun choisit une carte, puis découvre le mot qu'elle porte."""
    for name in names:
        free = [i for i, owner in enumerate(game.owners) if owner is None]

        clear_screen()
        print(f"{name}, choisissez une carte.\n")
        print("  " + "   ".join(f"[{i + 1}]" for i in free))
        choice = ask_choice("\nNuméro de la carte : ", [i + 1 for i in free])

        _, word = game.claim(choice - 1, name)
        clear_screen()
        if word is None:
            print(f"\n{name}, vous êtes Mr. White : vous n'avez aucun mot.")
            print("Écoutez les autres et faites semblant.")
        else:
            print(f"\n{name}, votre mot est : {word}")
        input("\nEntrée quand vous l'avez mémorisé (l'écran sera effacé)...")

    clear_screen()
    print(f"\n{game.first_speaker} commence le débat.")
    input("\nEntrée pour lancer la partie...")


def reveal(game: Game) -> None:
    print("\nRévélation des rôles :")
    for player in game.players:
        word = player.word if player.word is not None else "aucun mot"
        status = "" if player.name in game.active_players else " (éliminé)"
        print(f"  {player.name}{status} — {ROLE_LABELS[player.role]} — {word}")


def play(game: Game, names: list[str]) -> None:
    deal_cards(game, names)

    round_num = 1
    won_by_guess = False
    while not game.is_over:
        print(f"\n=== Manche {round_num} ===")
        # Dans l'ordre de parole : celui qui ouvre le débat en tête.
        still_in = set(game.active_players)
        print("\nEncore en jeu :")
        for name in game.speaking_order:
            if name in still_in:
                mark = " (commence)" if name == game.first_speaker else ""
                print(f"  - {name}{mark}")

        print("\nDébattez, puis désignez l'éliminé.")
        name = ask_player("Qui est éliminé ? : ", game.active_players)
        result = game.eliminate(name)

        print(f"\n{result.player} était {ROLE_LABELS[result.role]} !")
        if result.awaiting_guess:
            won_by_guess = ask_guess(game, result.player)

        # La partie peut se terminer sur l'élimination comme sur la
        # proposition qui la suit : c'est l'état du jeu qui tranche.
        if not game.is_over:
            input("\nEntrée pour la manche suivante...")
            clear_screen()
        round_num += 1

    if won_by_guess:
        print("\nMr. White a trouvé le mot en sortant : les imposteurs gagnent !")
    elif game.winner is Team.CIVILIANS:
        print("\nLes civils ont gagné : tous les imposteurs sont démasqués !")
    else:
        print("\nLes imposteurs ont gagné : ils ont tenu jusqu'au bout !")
    reveal(game)


def main() -> None:
    try:
        while True:
            try:
                play(*setup_game())
            except RuleError as error:
                print(f"\nConfiguration impossible : {error}")

            again = input("\nUne autre partie ? (o/n) : ").strip().casefold()
            if again != "o":
                break
    except (KeyboardInterrupt, EOFError):
        print("\n\nPartie interrompue.")
        return

    print("\nMerci d'avoir joué !")


if __name__ == "__main__":
    main()
