"""Undercover en console.

Un seul appareil passe de main en main : chacun découvre son mot en
privé, puis le groupe débat à voix haute et l'animateur saisit le nom du
joueur éliminé.

    python -m undercover.cli
"""

from __future__ import annotations

import os

from .core import MIN_PLAYERS, Game, Role, RuleError, Team, max_special_roles

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


def ask_player(prompt: str, choices: tuple[str, ...]) -> str:
    lookup = {name.casefold(): name for name in choices}
    while True:
        answer = input(prompt).strip().casefold()
        if answer in lookup:
            return lookup[answer]
        print("Ce joueur n'est pas en jeu.")


def setup_game() -> Game:
    clear_screen()
    print("=== Configuration de la partie ===\n")

    num_players = ask_int(f"Combien de joueurs ? (minimum {MIN_PLAYERS}) : ", MIN_PLAYERS)
    names = ask_names(num_players)

    allowed = max_special_roles(num_players)
    print(f"\nÀ {num_players} joueurs, {allowed} rôle(s) spécial(aux) au maximum.")
    num_undercover = ask_int("Combien d'Undercover ? : ", 0, allowed)
    num_mr_white = ask_int("Combien de Mr. White ? : ", 0, allowed - num_undercover)

    return Game(names, num_undercover, num_mr_white)


def show_words(game: Game) -> None:
    for name in game.names:
        clear_screen()
        input(f"{name}, appuyez sur Entrée pour voir votre mot...")
        clear_screen()
        word = game.word_of(name)
        if word is None:
            print(f"\n{name}, vous êtes Mr. White : vous n'avez aucun mot.")
            print("Écoutez les autres et faites semblant.")
        else:
            print(f"\n{name}, votre mot est : {word}")
        input("\nEntrée quand vous l'avez mémorisé (l'écran sera effacé)...")
    clear_screen()


def reveal(game: Game) -> None:
    print("\nRévélation des rôles :")
    for player in game.players:
        word = player.word if player.word is not None else "aucun mot"
        status = "" if player.name in game.active_players else " (éliminé)"
        print(f"  {player.name}{status} — {ROLE_LABELS[player.role]} — {word}")


def play(game: Game) -> None:
    show_words(game)

    round_num = 1
    while not game.is_over:
        print(f"\n=== Manche {round_num} ===")
        print("\nEncore en jeu :")
        for name in game.active_players:
            print(f"  - {name}")

        print("\nDébattez, puis désignez l'éliminé.")
        name = ask_player("Qui est éliminé ? : ", game.active_players)
        result = game.eliminate(name)

        print(f"\n{result.player} était {ROLE_LABELS[result.role]} !")
        if not result.game_over:
            input("\nEntrée pour la manche suivante...")
            clear_screen()
        round_num += 1

    if game.winner is Team.CIVILIANS:
        print("\nLes civils ont gagné : tous les imposteurs sont démasqués !")
    else:
        print("\nLes imposteurs ont gagné : ils ont tenu jusqu'au bout !")
    reveal(game)


def main() -> None:
    try:
        while True:
            try:
                play(setup_game())
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
