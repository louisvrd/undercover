"""Génération des paires de mots.

Chaque groupe rassemble des mots d'un même champ lexical. Les deux mots
tirés viennent toujours du même groupe : assez proches pour qu'un
Undercover puisse bluffer, assez distincts pour qu'il finisse par se
trahir.

Quatre règles ont guidé la composition des groupes — `tools/audit_words.py`
vérifie les deux premières automatiquement :

1. **Aucun synonyme.** « développeur » et « programmeur » se décrivent
   identiquement : les civils ne peuvent structurellement pas gagner.
2. **Aucun hyperonyme.** Pas de « chaussure » à côté de « botte » : le
   joueur qui a le mot général ne peut rien dire qui ne s'applique pas
   aussi à l'autre.
3. **Pas de différence de taille seule.** « lac » et « étang », c'est la
   même chose en plus petit — indécidable en un indice.
4. **Que des mots connus.** Un joueur qui reçoit « caracal » ou
   « borsalino » ne joue pas, il se tait.
"""

from __future__ import annotations

import random
from typing import Sequence

WordPair = tuple[str, str]

# Les thèmes servent à l'audit et à la relecture ; le tirage, lui, ne
# regarde que les groupes.
THEMES: dict[str, tuple[tuple[str, ...], ...]] = {
    "Animaux": (
        ("chat", "chien", "lapin", "poule", "cochon", "cheval", "vache", "mouton", "chèvre", "âne"),
        ("lion", "tigre", "ours", "loup", "renard", "éléphant", "girafe", "zèbre", "singe", "kangourou"),
        ("aigle", "hibou", "pigeon", "perroquet", "manchot", "autruche", "flamant", "cygne", "mouette", "corbeau"),
        ("dauphin", "baleine", "requin", "pieuvre", "crabe", "tortue", "méduse", "hippocampe", "homard", "saumon"),
        ("souris", "écureuil", "hérisson", "grenouille", "serpent", "araignée", "papillon", "abeille", "fourmi", "escargot"),
    ),
    "Nourriture": (
        ("pomme", "banane", "orange", "citron", "fraise", "raisin", "cerise", "pastèque", "ananas", "poire"),
        ("carotte", "tomate", "oignon", "salade", "courgette", "poivron", "concombre", "champignon", "épinard", "haricot"),
        ("pizza", "burger", "sushi", "couscous", "lasagnes", "raclette", "paella", "crêpe", "quiche", "omelette"),
        ("gâteau", "glace", "chocolat", "bonbon", "croissant", "tarte", "macaron", "yaourt", "miel", "confiture"),
        ("eau", "café", "thé", "jus", "limonade", "soda", "bière", "vin", "lait", "sirop"),
    ),
    "Vêtements": (
        ("chemise", "pull", "veste", "manteau", "robe", "jupe", "pantalon", "short", "pyjama", "maillot"),
        ("basket", "botte", "sandale", "tong", "chausson", "casquette", "bonnet", "béret", "écharpe", "gant"),
        ("sac", "ceinture", "cravate", "lunettes", "montre", "bague", "collier", "bracelet", "parapluie", "portefeuille"),
    ),
    "Maison": (
        ("salon", "cuisine", "chambre", "garage", "cave", "grenier", "couloir", "balcon", "jardin", "escalier"),
        ("table", "chaise", "canapé", "lit", "armoire", "étagère", "bureau", "tabouret", "matelas", "coussin"),
        ("assiette", "verre", "fourchette", "couteau", "cuillère", "casserole", "poêle", "four", "frigo", "bouilloire"),
        ("douche", "baignoire", "savon", "serviette", "shampooing", "peigne", "rasoir", "éponge", "brosse", "miroir"),
    ),
    "Transport": (
        ("voiture", "camion", "bus", "moto", "vélo", "trottinette", "tracteur", "ambulance", "taxi", "caravane"),
        ("avion", "hélicoptère", "fusée", "montgolfière", "parachute", "drone", "planeur", "satellite", "ovni", "aéroport"),
        ("voilier", "yacht", "ferry", "péniche", "sous-marin", "canoë", "radeau", "pédalo", "barque", "gondole"),
    ),
    "Nature": (
        ("montagne", "volcan", "falaise", "canyon", "dune", "grotte", "île", "plage", "désert", "forêt"),
        ("océan", "lac", "rivière", "cascade", "source", "puits", "fontaine", "arrosoir", "robinet", "tuyau"),
        ("pluie", "neige", "vent", "orage", "brouillard", "arc-en-ciel", "nuage", "soleil", "grêle", "gel"),
        ("chêne", "sapin", "palmier", "cactus", "rose", "tulipe", "marguerite", "bambou", "lierre", "herbe"),
    ),
    "Sport et jeux": (
        ("football", "rugby", "basketball", "volley", "handball", "hockey", "tennis", "badminton", "ping-pong", "pétanque"),
        ("natation", "course", "saut", "escalade", "ski", "surf", "boxe", "judo", "danse", "yoga"),
        ("échecs", "dames", "cartes", "dés", "dominos", "scrabble", "monopoly", "puzzle", "loto", "billard"),
        ("ballon", "toboggan", "balançoire", "trampoline", "bille", "craie", "corde", "sifflet", "chronomètre", "médaille"),
    ),
    "Métiers": (
        ("médecin", "infirmier", "dentiste", "pharmacien", "vétérinaire", "chirurgien", "ambulancier", "opticien", "psychologue", "kiné"),
        ("boulanger", "boucher", "pêcheur", "agriculteur", "cuisinier", "serveur", "barman", "berger", "chocolatier", "fromager"),
        ("pompier", "policier", "militaire", "juge", "avocat", "facteur", "éboueur", "pilote", "marin", "douanier"),
        ("architecte", "ingénieur", "plombier", "électricien", "maçon", "peintre", "photographe", "journaliste", "acteur", "chanteur"),
    ),
    "Arts et culture": (
        ("piano", "guitare", "violon", "batterie", "saxophone", "trompette", "flûte", "harpe", "accordéon", "tambour"),
        ("rock", "jazz", "rap", "pop", "classique", "metal", "reggae", "techno", "country", "opéra"),
        ("cinéma", "théâtre", "concert", "cirque", "musée", "festival", "karaoké", "bal", "parade", "magie"),
        ("dessin", "peinture", "sculpture", "photo", "tricot", "poterie", "origami", "collage", "gravure", "mosaïque"),
    ),
    "École et bureau": (
        ("stylo", "crayon", "gomme", "règle", "cahier", "classeur", "ciseaux", "colle", "agrafeuse", "calculatrice"),
        ("professeur", "élève", "cantine", "récréation", "devoirs", "examen", "note", "tableau", "cartable", "cour"),
    ),
    "Ville et voyage": (
        ("parc", "marché", "église", "hôpital", "école", "mairie", "bibliothèque", "piscine", "stade", "gare"),
        ("valise", "passeport", "billet", "hôtel", "camping", "douane", "souvenir", "plan", "appareil", "boussole"),
    ),
}

WORD_GROUPS: tuple[tuple[str, ...], ...] = tuple(
    group for groups in THEMES.values() for group in groups
)


def theme_of(group_index: int) -> str:
    """Le thème auquel appartient le groupe d'indice donné."""
    seen = 0
    for theme, groups in THEMES.items():
        if group_index < seen + len(groups):
            return theme
        seen += len(groups)
    raise IndexError(group_index)


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
