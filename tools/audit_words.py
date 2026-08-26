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

from undercover.words import (  # noqa: E402
    OPTIONAL_THEMES,
    PAIRS_BY_THEME,
    WORD_PAIRS,
    theme_of,
)

SIMILARITY_ALERT = 0.62

# Un mot peut servir dans plusieurs paires — c'est voulu, cf. la règle 7
# de words.py. Au-delà, il revient trop souvent et le jeu se répète.
MAX_PAIRS_PER_WORD = 3

# À 2500 paires, les listes complètes noient le signal : on n'affiche que
# les cas les plus extrêmes de chaque section.
TOP = 25


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
        exclusif = "  (exclusif)" if theme in OPTIONAL_THEMES else ""
        print(f"    {theme:<20} {len(pairs):>3} paires{exclusif}")

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
    section("MOTS DANS PLUSIEURS PAIRES")
    print("  Voulu : un mot qui n'aurait qu'un seul partenaire rendrait")
    print("  la paire devinable dès qu'on connaît la liste (règle 7).")
    print(f"  Au-delà de {MAX_PAIRS_PER_WORD}, il revient trop souvent.")
    print()
    counts = collections.Counter(words)
    spread = collections.Counter(counts.values())
    for n in sorted(spread):
        print(f"    dans {n} paire(s) : {spread[n]:>5} mots")

    over = {w: n for w, n in counts.items() if n > MAX_PAIRS_PER_WORD}
    print()
    if over:
        problems += len(over)
        for word, count in sorted(over.items(), key=lambda kv: -kv[1]):
            where = [f"{a}/{b}" for a, b in WORD_PAIRS if word in (a, b)]
            print(f"  {word:<14} {count}x   {', '.join(where)}")
    else:
        print(f"  aucun mot au-dessus de {MAX_PAIRS_PER_WORD} paires")

    # -- Mots composés -------------------------------------------------
    section("MOTS COMPOSÉS OU SIGLES")
    print("  Plus durs à décrire en un seul indice.")
    print()
    print("  Un mot avec un ESPACE est un défaut : l'indice unique")
    print("  porterait sur deux idées. Le trait d'union, lui, passe.")
    print()
    spaced = sorted({w for pair in WORD_PAIRS for w in pair if " " in w})
    if spaced:
        problems += len(spaced)
        for w in spaced:
            print(f"  espace : {w}")
    else:
        print("  aucun mot à espace")

    hyphen = sorted({w for pair in WORD_PAIRS for w in pair if "-" in w})
    print(f"\n  traits d'union : {len(hyphen)}")
    print("  " + ", ".join(hyphen[:TOP]) + (" ..." if len(hyphen) > TOP else ""))

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
    for score, i, a, b in close[:TOP]:
        print(f"  {score:.2f}  {a} / {b:<22} {theme_of(i)}")
    if len(close) > TOP:
        print(f"  ... et {len(close) - TOP} autres")
    print(f"  -> {len(close)} sur {len(WORD_PAIRS)}")

    # -- Thèmes exclusifs ----------------------------------------------
    section("THÈMES EXCLUSIFS")
    print("  Hors du tirage général : soit éteints, soit seuls en piste.")
    print("  Ils obéissent aux mêmes règles de forme.")
    print()
    for theme in OPTIONAL_THEMES:
        pairs = PAIRS_BY_THEME[theme]
        mots = [w for pair in pairs for w in pair]
        doubles = [
            p for p, n in collections.Counter(frozenset(p) for p in pairs).items() if n > 1
        ]
        trop = {w: n for w, n in collections.Counter(mots).items() if n > MAX_PAIRS_PER_WORD}
        espaces = sorted({w for w in mots if " " in w})

        print(f"  {theme} : {len(pairs)} paires, {len(set(mots))} mots distincts")
        for label, faute in (
            ("paires en double", [" / ".join(sorted(p)) for p in doubles]),
            (f"mots au-delà de {MAX_PAIRS_PER_WORD} paires", sorted(trop)),
            ("mots à espace", espaces),
        ):
            if faute:
                problems += len(faute)
                print(f"    {label} : {', '.join(faute)}")
        if not (doubles or trop or espaces):
            print("    rien à signaler")

    section("BILAN")
    print(f"  problèmes bloquants : {problems}")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
