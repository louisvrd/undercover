"""Génération des paires de mots.

Chaque groupe rassemble des mots d'un même champ lexical. Les deux mots
tirés viennent toujours du même groupe : assez proches pour qu'un
Undercover puisse bluffer, assez distincts pour qu'il finisse par se
trahir.
"""

from __future__ import annotations

import random
from typing import Sequence

WordPair = tuple[str, str]

WORD_GROUPS: tuple[tuple[str, ...], ...] = (
    # Animaux
    ("chat", "chien", "lapin", "hamster", "souris", "rat", "cochon", "cheval", "vache", "mouton"),
    ("lion", "tigre", "panthère", "léopard", "guépard", "jaguar", "puma", "lynx", "ocelot", "caracal"),
    ("aigle", "faucon", "hibou", "chouette", "vautour", "corbeau", "pie", "perroquet", "colombe", "moineau"),
    ("dauphin", "baleine", "requin", "orque", "phoque", "morse", "otarie", "narval", "marsouin", "lamantin"),

    # Nourriture
    ("pomme", "poire", "banane", "orange", "citron", "pamplemousse", "mandarine", "kiwi", "fraise", "framboise"),
    ("carotte", "poireau", "oignon", "ail", "navet", "radis", "betterave", "céleri", "panais", "rutabaga"),
    ("boeuf", "porc", "poulet", "dinde", "canard", "agneau", "veau", "lapin", "cheval", "autruche"),
    ("pizza", "burger", "sandwich", "tacos", "kebab", "hot-dog", "burrito", "wrap", "panini", "croque"),

    # Vêtements
    ("chemise", "t-shirt", "pull", "sweat", "veste", "manteau", "blouson", "gilet", "cardigan", "polo"),
    ("pantalon", "jean", "short", "bermuda", "jupe", "robe", "legging", "jogging", "salopette", "combinaison"),
    ("chaussure", "basket", "botte", "sandale", "mocassin", "espadrille", "derby", "richelieu", "mule", "tong"),
    ("chapeau", "casquette", "bonnet", "béret", "cagoule", "bandana", "bob", "panama", "fedora", "borsalino"),

    # Maison
    ("salon", "cuisine", "chambre", "salle de bain", "bureau", "garage", "cave", "grenier", "buanderie", "véranda"),
    ("table", "chaise", "fauteuil", "canapé", "lit", "armoire", "commode", "buffet", "étagère", "bibliothèque"),
    ("fenêtre", "porte", "escalier", "balcon", "terrasse", "cheminée", "radiateur", "climatiseur", "volet", "store"),
    ("assiette", "verre", "tasse", "bol", "casserole", "poêle", "marmite", "passoire", "louche", "spatule"),

    # Transport
    ("voiture", "camion", "bus", "moto", "vélo", "scooter", "trottinette", "skateboard", "roller", "segway"),
    ("avion", "hélicoptère", "planeur", "dirigeable", "montgolfière", "drone", "ULM", "autogire", "jet", "biplan"),
    ("bateau", "voilier", "yacht", "péniche", "ferry", "paquebot", "catamaran", "kayak", "canot", "pédalo"),
    ("train", "métro", "tramway", "TGV", "RER", "locomotive", "wagon", "funiculaire", "téléphérique", "monorail"),

    # Nature
    ("arbre", "arbuste", "buisson", "herbe", "fleur", "fougère", "mousse", "lichen", "algue", "champignon"),
    ("montagne", "colline", "vallée", "plateau", "plaine", "canyon", "falaise", "volcan", "dune", "glacier"),
    ("rivière", "fleuve", "ruisseau", "torrent", "cascade", "lac", "étang", "mare", "océan", "mer"),
    ("forêt", "jungle", "savane", "désert", "toundra", "taïga", "steppe", "prairie", "marais", "mangrove"),

    # Sport
    ("football", "rugby", "basketball", "volleyball", "handball", "baseball", "cricket", "hockey", "tennis", "badminton"),
    ("natation", "plongée", "water-polo", "surf", "voile", "aviron", "canoë", "kayak", "planche", "ski nautique"),
    ("athlétisme", "gymnastique", "danse", "patinage", "boxe", "judo", "karaté", "taekwondo", "lutte", "escrime"),
    ("cyclisme", "VTT", "BMX", "skateboard", "roller", "trottinette", "motocross", "karting", "F1", "rallye"),

    # Métiers
    ("médecin", "infirmier", "dentiste", "pharmacien", "kiné", "ostéopathe", "psychologue", "psychiatre", "vétérinaire", "sage-femme"),
    ("professeur", "instituteur", "éducateur", "formateur", "coach", "mentor", "tuteur", "instructeur", "maître", "enseignant"),
    ("boulanger", "pâtissier", "boucher", "charcutier", "poissonnier", "fromager", "primeur", "épicier", "traiteur", "restaurateur"),
    ("architecte", "ingénieur", "technicien", "designer", "artiste", "graphiste", "photographe", "vidéaste", "développeur", "programmeur"),

    # Loisirs
    ("cinéma", "théâtre", "concert", "spectacle", "exposition", "musée", "galerie", "cirque", "opéra", "cabaret"),
    ("lecture", "écriture", "dessin", "peinture", "sculpture", "poterie", "broderie", "tricot", "couture", "crochet"),
    ("jardinage", "bricolage", "menuiserie", "mécanique", "électronique", "informatique", "robotique", "domotique", "impression 3D", "modélisme"),
    ("jeu vidéo", "puzzle", "échecs", "cartes", "dés", "dominos", "scrabble", "monopoly", "risk", "uno"),

    # Musique
    ("piano", "guitare", "violon", "batterie", "basse", "saxophone", "trompette", "flûte", "harpe", "accordéon"),
    ("rock", "jazz", "blues", "rap", "pop", "classique", "metal", "reggae", "funk", "soul"),
    ("concert", "festival", "récital", "opéra", "comédie musicale", "karaoké", "jam", "bal", "boîte", "discothèque"),
    ("orchestre", "groupe", "band", "chorale", "quartet", "trio", "duo", "soliste", "ensemble", "fanfare"),
)


class WordGenerator:
    """Tire une paire de mots proches dans un des groupes."""

    def __init__(
        self,
        groups: Sequence[Sequence[str]] = WORD_GROUPS,
        rng: random.Random | None = None,
    ) -> None:
        if not groups:
            raise ValueError("Il faut au moins un groupe de mots")
        undersized = [i for i, group in enumerate(groups) if len(set(group)) < 2]
        if undersized:
            raise ValueError(
                f"Ces groupes ont moins de 2 mots distincts : {undersized}"
            )
        self._groups = tuple(tuple(group) for group in groups)
        self._rng = rng or random.Random()

    def pair(self) -> WordPair:
        """Deux mots distincts, tirés dans un même groupe."""
        group = self._rng.choice(self._groups)
        first, second = self._rng.sample(group, 2)
        return first, second

    def pair_count(self) -> int:
        """Nombre total de paires possibles, tous groupes confondus."""
        return sum(len(group) * (len(group) - 1) // 2 for group in self._groups)
