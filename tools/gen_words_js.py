"""Génère docs/words.js à partir de undercover/words.py.

La version web et la version console partagent ainsi exactement les
mêmes paires : elles ne sont saisies qu'une fois, en Python.

    python tools/gen_words_js.py
"""

from __future__ import annotations

import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from undercover.words import (  # noqa: E402
    OPTIONAL_THEMES,
    PAIRS_BY_THEME,
    WORD_PAIRS,
)

HEADER = """\
// Généré par tools/gen_words_js.py — ne pas éditer à la main.
// La source est undercover/words.py.

export const WORD_PAIRS = [
"""

MIDDLE = """];

/**
 * Thèmes exclusifs — ils ne rejoignent jamais le tirage général.
 *
 * Soit un thème est éteint et ses paires n'existent pas pour la partie,
 * soit il est allumé et c'est le seul dictionnaire. Les mélanger n'aurait
 * pas de sens : les indices d'un personnage de jeu vidéo et ceux d'un
 * légume ne se ressemblent en rien, et la table ne saurait plus dans
 * quel univers elle joue.
 */
export const OPTIONAL_THEMES = {
"""

FOOTER = """};

/**
 * Une paire au hasard, tirée de `pairs` — le dictionnaire général par
 * défaut, ou celui d'un thème exclusif.
 *
 * L'ordre est tiré lui aussi : sans cela, le mot de la majorité serait
 * toujours le premier écrit, et un joueur qui connaît la liste saurait
 * dans quel camp il est.
 */
export function drawPair(random = Math.random, pairs = WORD_PAIRS) {
  const [first, second] = pairs[Math.floor(random() * pairs.length)];
  return random() < 0.5 ? [first, second] : [second, first];
}

/** Nombre de paires du dictionnaire donné. */
export function pairCount(pairs = WORD_PAIRS) {
  return pairs.length;
}
"""


def main() -> None:
    lines: list[str] = []
    for theme, pairs in PAIRS_BY_THEME.items():
        if theme in OPTIONAL_THEMES:
            continue
        lines.append(f"  // {theme}")
        lines += [
            "  " + json.dumps(list(pair), ensure_ascii=False) + ","
            for pair in pairs
        ]

    extras: list[str] = []
    for theme in OPTIONAL_THEMES:
        extras.append(f"  {json.dumps(theme, ensure_ascii=False)}: [")
        extras += [
            "    " + json.dumps(list(pair), ensure_ascii=False) + ","
            for pair in PAIRS_BY_THEME[theme]
        ]
        extras.append("  ],")

    target = ROOT / "docs" / "words.js"
    target.parent.mkdir(exist_ok=True)
    target.write_text(
        HEADER + "\n".join(lines) + "\n" + MIDDLE + "\n".join(extras) + "\n" + FOOTER,
        encoding="utf-8",
    )

    words = {w for pair in WORD_PAIRS for w in pair}
    print(
        f"{target.relative_to(ROOT)} : {len(WORD_PAIRS)} paires, "
        f"{len(words)} mots distincts, {len(PAIRS_BY_THEME)} thèmes "
        f"(dont {len(OPTIONAL_THEMES)} exclusif)"
    )


if __name__ == "__main__":
    main()
