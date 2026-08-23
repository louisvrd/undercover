"""Génère les icônes de la PWA dans docs/icons/.

Un masque de loup rouge sur fond bleu nuit — les couleurs du jeu.
Aucune dépendance en ligne : tout est dessiné ici.

    python tools/gen_icons.py
"""

from __future__ import annotations

import pathlib

from PIL import Image, ImageDraw

BG = (44, 62, 80)  # --bg  #2c3e50
MASK = (231, 76, 60)  # --danger #e74c3c

ROOT = pathlib.Path(__file__).resolve().parent.parent
ICONS = ROOT / "docs" / "icons"

# On dessine en très grand puis on réduit : c'est ce qui donne des bords
# lisses sans avoir à gérer l'antialiasing à la main.
SUPERSAMPLE = 4


def draw_icon(size: int, *, scale: float, rounded: bool) -> Image.Image:
    """Dessine l'icône. `scale` rétrécit le motif pour la zone de sécurité
    des icônes maskable (Android peut rogner jusqu'à 20 % des bords)."""
    big = size * SUPERSAMPLE
    image = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    if rounded:
        draw.rounded_rectangle([0, 0, big - 1, big - 1], radius=big * 0.22, fill=BG)
    else:
        draw.rectangle([0, 0, big, big], fill=BG)

    c = big / 2
    w = big * 0.74 * scale  # largeur du masque
    h = big * 0.40 * scale  # hauteur du masque

    # Le bandeau, aux coins très arrondis.
    draw.rounded_rectangle(
        [c - w / 2, c - h / 2, c + w / 2, c + h / 2],
        radius=h * 0.42,
        fill=MASK,
    )

    # L'encoche du nez, taillée dans le bas du bandeau : c'est elle qui
    # fait lire la forme comme un loup plutôt qu'un simple rectangle.
    notch_w, notch_h = w * 0.26, h * 0.55
    draw.polygon(
        [
            (c - notch_w / 2, c + h / 2 + 1),
            (c + notch_w / 2, c + h / 2 + 1),
            (c, c + h / 2 - notch_h),
        ],
        fill=BG,
    )

    # Les yeux, évidés jusqu'au fond, légèrement inclinés vers le nez.
    eye_w, eye_h = w * 0.26, h * 0.40
    for direction in (-1, 1):
        x = c + direction * w * 0.21
        draw.ellipse(
            [x - eye_w / 2, c - eye_h * 0.62, x + eye_w / 2, c + eye_h * 0.38],
            fill=BG,
        )

    return image.resize((size, size), Image.LANCZOS)


def main() -> None:
    ICONS.mkdir(parents=True, exist_ok=True)

    targets = [
        ("icon-192.png", 192, 1.0, True, True),
        ("icon-512.png", 512, 1.0, True, True),
        # maskable : motif rétréci, fond plein bord à bord
        ("icon-maskable-512.png", 512, 0.78, False, True),
        # iOS applique lui-même le masque arrondi et refuse la transparence
        ("apple-touch-icon.png", 180, 1.0, False, False),
    ]

    for name, size, scale, rounded, alpha in targets:
        image = draw_icon(size, scale=scale, rounded=rounded)
        if not alpha:
            flat = Image.new("RGB", image.size, BG)
            flat.paste(image, mask=image.split()[3])
            image = flat
        path = ICONS / name
        image.save(path)
        print(f"{path.relative_to(ROOT)} : {size}x{size}")


if __name__ == "__main__":
    main()
