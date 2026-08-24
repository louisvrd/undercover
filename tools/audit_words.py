"""Audit du dictionnaire de paires.

Ne juge pas le sens — il sort les faits mesurables sur lesquels appuyer
une relecture : doublons, paires miroir, mots composés, paires trop
proches en surface.

    python tools/audit_words.py
"""

from __future__ import annotations

import collections
import difflib
import pathlib
import sys
import unicodedata

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from undercover.words import PAIRS_BY_THEME, WORD_PAIRS, theme_of  # noqa: E402

SIMILARITY_ALERT = 0.62


def strip_accents(word: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", word.lower())
        if unicodedata.category(c) != "Mn"
    )


def similarity(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, strip_accents(a), strip_accents(b)).ratio()


def section(title: str) -> None:
    print()
    print("=" * 62)
    print(title)
    print("=" * 62)


def main() -> None:
    words = [w for pair in WORD_PAIRS for w in pair]
    problems = 0

    section("VOLUME")
    print(f"  thèmes            : {len(PAIRS_BY_THEME)}")
    print(f"  paires            : {len(WORD_PAIRS)}")
    print(f"  mots utilisés     : {len(words)}")
    print(f"  mots distincts    : {len(set(words))}")
    print()
    for theme, pairs in PAIRS_BY_THEME.items():
        print(f"    {theme:<20} {len(pairs):>3} paires")

    # -- Paires en double (mêmes deux mots, ordre indifférent) ---------
    section("PAIRES EN DOUBLE")
    normalised = collections.Counter(frozenset(p) for p in WORD_PAIRS)
    duplicates = [p for p, n in normalised.items() if n > 1]
    if duplicates:
        problems += len(duplicates)
        for pair in duplicates:
            print(f"  {' / '.join(sorted(pair))}")
    else:
        print("  aucune")

    # -- Mots réutilisés ----------------------------------------------
    section("MOTS UTILISÉS DANS PLUSIEURS PAIRES")
    print("  Pas un défaut en soi, mais un mot qui revient trop souvent")
    print("  rend le jeu répétitif.")
    print()
    repeats = {w: n for w, n in collections.Counter(words).items() if n > 1}
    if repeats:
        for word, count in sorted(repeats.items(), key=lambda kv: -kv[1]):
            where = [
                f"{a}/{b}" for a, b in WORD_PAIRS if word in (a, b)
            ]
            print(f"  {word:<14} {count}x   {', '.join(where)}")
    else:
        print("  aucun — chaque mot n'apparaît qu'une fois")

    # -- Mots composés -------------------------------------------------
    section("MOTS COMPOSÉS OU SIGLES")
    print("  Plus durs à décrire en un seul indice.")
    print()
    compound = [
        (i, w) for i, pair in enumerate(WORD_PAIRS) for w in pair
        if " " in w or "-" in w or (w.isupper() and len(w) > 1)
    ]
    for i, w in compound:
        print(f"  {w:<18} {theme_of(i)}")
    print(f"  -> {len(compound)}")

    # -- Paires trop proches en surface --------------------------------
    section(f"PAIRES TROP PROCHES EN SURFACE (>= {SIMILARITY_ALERT})")
    print("  Mesure l'ORTHOGRAPHE, pas le sens : « chèvre / cheval » y")
    print("  remonte alors que les deux se décrivent très différemment.")
    print("  À lire comme une liste à inspecter, pas comme un verdict.")
    print()
    close = sorted(
        (
            (similarity(a, b), i, a, b)
            for i, (a, b) in enumerate(WORD_PAIRS)
            if similarity(a, b) >= SIMILARITY_ALERT
        ),
        reverse=True,
    )
    for score, i, a, b in close:
        print(f"  {score:.2f}  {a} / {b:<22} {theme_of(i)}")
    print(f"  -> {len(close)} sur {len(WORD_PAIRS)}")

    section("BILAN")
    print(f"  problèmes bloquants : {problems}")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
