"""Génère docs/words.js à partir de undercover/words.py.

La version web et la version console partagent ainsi exactement la même
liste de mots : elle n'est saisie qu'une fois, en Python.

    python tools/gen_words_js.py
"""

from __future__ import annotations

import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from undercover.words import WORD_GROUPS  # noqa: E402

HEADER = """\
// Généré par tools/gen_words_js.py — ne pas éditer à la main.
// La source est undercover/words.py.

export const WORD_GROUPS = [
"""

FOOTER = """\
];

/** Deux mots distincts, tirés dans un même groupe. */
export function drawPair(random = Math.random) {
  const group = WORD_GROUPS[Math.floor(random() * WORD_GROUPS.length)];
  const first = Math.floor(random() * group.length);
  let second = Math.floor(random() * (group.length - 1));
  if (second >= first) second += 1; // garantit second !== first
  return [group[first], group[second]];
}

/** Nombre total de paires possibles, tous groupes confondus. */
export function pairCount() {
  return WORD_GROUPS.reduce((total, g) => total + (g.length * (g.length - 1)) / 2, 0);
}
"""


def main() -> None:
    lines = [
        "  " + json.dumps(list(group), ensure_ascii=False) + ","
        for group in WORD_GROUPS
    ]
    target = ROOT / "docs" / "words.js"
    target.parent.mkdir(exist_ok=True)
    target.write_text(HEADER + "\n".join(lines) + "\n" + FOOTER, encoding="utf-8")

    words = sum(len(g) for g in WORD_GROUPS)
    print(f"{target.relative_to(ROOT)} : {len(WORD_GROUPS)} groupes, {words} mots")


if __name__ == "__main__":
    main()
