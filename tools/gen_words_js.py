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

from undercover.words import PAIRS_BY_THEME, WORD_PAIRS  # noqa: E402

HEADER = """\
// Généré par tools/gen_words_js.py — ne pas éditer à la main.
// La source est undercover/words.py.

export const WORD_PAIRS = [
"""

FOOTER = """\
];

/**
 * Une paire au hasard.
 *
 * L'ordre est tiré lui aussi : sans cela, le mot de la majorité serait
 * toujours le premier écrit, et un joueur qui connaît la liste saurait
 * dans quel camp il est.
 */
export function drawPair(random = Math.random) {
  const [first, second] = WORD_PAIRS[Math.floor(random() * WORD_PAIRS.length)];
  return random() < 0.5 ? [first, second] : [second, first];
}

/** Nombre de paires du dictionnaire. */
export function pairCount() {
  return WORD_PAIRS.length;
}
"""


def main() -> None:
    lines: list[str] = []
    for theme, pairs in PAIRS_BY_THEME.items():
        lines.append(f"  // {theme}")
        lines += [
            "  " + json.dumps(list(pair), ensure_ascii=False) + ","
            for pair in pairs
        ]

    target = ROOT / "docs" / "words.js"
    target.parent.mkdir(exist_ok=True)
    target.write_text(HEADER + "\n".join(lines) + "\n" + FOOTER, encoding="utf-8")

    words = {w for pair in WORD_PAIRS for w in pair}
    print(
        f"{target.relative_to(ROOT)} : {len(WORD_PAIRS)} paires, "
        f"{len(words)} mots distincts, {len(PAIRS_BY_THEME)} thèmes"
    )


if __name__ == "__main__":
    main()
