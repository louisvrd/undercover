"""Audit du dictionnaire de mots.

Ne juge pas le sens — il sort les faits mesurables sur lesquels appuyer
une relecture éditoriale : doublons, mots composés, mots rares, paires
trop proches en surface.

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

from undercover.words import THEMES, WORD_GROUPS, theme_of  # noqa: E402


def strip_accents(word: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", word.lower())
        if unicodedata.category(c) != "Mn"
    )


def similarity(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, strip_accents(a), strip_accents(b)).ratio()


def main() -> None:
    total_words = sum(len(g) for g in WORD_GROUPS)
    distinct = {w for g in WORD_GROUPS for w in g}

    print("=" * 62)
    print("VOLUME")
    print("=" * 62)
    print(f"  thèmes            : {len(THEMES)}")
    print(f"  groupes           : {len(WORD_GROUPS)}")
    print(f"  emplacements      : {total_words}")
    print(f"  mots distincts    : {len(distinct)}")
    print(f"  paires possibles  : {sum(len(g) * (len(g) - 1) // 2 for g in WORD_GROUPS)}")

    # -- Doublons entre groupes ---------------------------------------
    seen = collections.defaultdict(list)
    for i, group in enumerate(WORD_GROUPS):
        for word in group:
            seen[word].append(i)
    cross = {w: idx for w, idx in seen.items() if len(idx) > 1}

    print()
    print("=" * 62)
    print(f"DOUBLONS ENTRE GROUPES ({len(cross)})")
    print("=" * 62)
    print("  Un mot dans deux groupes n'est pas fatal, mais il rend")
    print("  l'indice ambigu : le joueur ignore de quel groupe il vient.")
    print()
    for word, idx in sorted(cross.items()):
        themes = " + ".join(f"{theme_of(i)}#{i}" for i in idx)
        print(f"  {word:<14} {themes}")

    # -- Doublons internes --------------------------------------------
    print()
    print("=" * 62)
    print("DOUBLONS DANS UN MÊME GROUPE")
    print("=" * 62)
    internal = [
        (i, w) for i, g in enumerate(WORD_GROUPS)
        for w, n in collections.Counter(g).items() if n > 1
    ]
    print(f"  {internal if internal else 'aucun'}")

    # -- Mots composés -------------------------------------------------
    print()
    print("=" * 62)
    print("MOTS COMPOSÉS OU SIGLES")
    print("=" * 62)
    print("  Plus durs à décrire en un seul indice.")
    print()
    compound = [
        (i, w) for i, g in enumerate(WORD_GROUPS) for w in g
        if " " in w or "-" in w or (w.isupper() and len(w) > 1)
    ]
    for i, w in compound:
        print(f"  {w:<18} {theme_of(i)}#{i}")
    print(f"  -> {len(compound)} au total")

    # -- Paires trop proches en surface --------------------------------
    print()
    print("=" * 62)
    print("PAIRES TROP PROCHES (ressemblance de forme >= 0.62)")
    print("=" * 62)
    print("  Si le tirage sort une de ces paires, l'Undercover est")
    print("  quasi indémasquable : les deux mots se decrivent pareil.")
    print()
    close = []
    for i, group in enumerate(WORD_GROUPS):
        for a_idx, a in enumerate(group):
            for b in group[a_idx + 1:]:
                score = similarity(a, b)
                if score >= 0.62:
                    close.append((score, i, a, b))
    for score, i, a, b in sorted(close, reverse=True):
        print(f"  {score:.2f}  {a} / {b:<20} {theme_of(i)}#{i}")
    print(f"  -> {len(close)} paires")

    # -- Groupes les plus homogènes ------------------------------------
    print()
    print("=" * 62)
    print("HOMOGÉNÉITÉ MOYENNE PAR GROUPE (10 pires)")
    print("=" * 62)
    print("  Une moyenne haute = groupe dont beaucoup de paires se")
    print("  ressemblent. À inspecter en priorite.")
    print()
    scores = []
    for i, group in enumerate(WORD_GROUPS):
        pairs = [
            similarity(a, b)
            for a_idx, a in enumerate(group) for b in group[a_idx + 1:]
        ]
        scores.append((sum(pairs) / len(pairs), i, group))
    for avg, i, group in sorted(scores, reverse=True)[:10]:
        print(f"  {avg:.3f}  {theme_of(i)}#{i:<3} {', '.join(group[:5])}…")


if __name__ == "__main__":
    main()
