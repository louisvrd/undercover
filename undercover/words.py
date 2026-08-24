"""Les paires de mots du jeu.

Chaque paire est écrite à la main. C'est le remplacement d'un système
par groupes de dix où l'on tirait deux mots au hasard : sur 45
combinaisons possibles par groupe, certaines étaient bonnes et d'autres
non, sans moyen de trier. Ici, **chaque tirage est une paire validée**.

Ce qui fait une bonne paire :

1. **Même nature.** Deux fruits, deux métiers, deux instruments — pas
   « gare » et « piscine », dont les indices n'ont rien en commun.
2. **Une seule différence saillante.** « courgette » et « concombre » se
   ressemblent, mais l'un se cuit et l'autre se croque. C'est cette
   unique différence qui permet de démasquer l'Undercover.
3. **Aucun synonyme.** « développeur » et « programmeur » se décrivent
   identiquement : les civils ne peuvent structurellement pas gagner.
4. **Aucun hyperonyme.** Pas de « chaussure » face à « botte » : le
   joueur qui a le mot général ne peut rien dire qui ne s'applique pas
   aussi à l'autre.
5. **Pas de différence de taille seule.** « lac » et « étang », c'est la
   même chose en plus petit — indécidable en un indice.
6. **Que des mots connus.** Un joueur qui reçoit « caracal » ne joue pas,
   il se tait.

`tools/audit_words.py` vérifie ce qui est vérifiable automatiquement :
doublons, paires miroir, mots composés, ressemblance de forme.
"""

from __future__ import annotations

import random
from typing import Sequence

WordPair = tuple[str, str]

# Les thèmes servent à la relecture et à l'audit ; le tirage, lui, pioche
# uniformément dans WORD_PAIRS.
PAIRS_BY_THEME: dict[str, tuple[WordPair, ...]] = {
    "Animaux": (
        ("chat", "chien"), ("lapin", "hamster"), ("cheval", "âne"),
        ("vache", "chèvre"), ("mouton", "cochon"), ("poule", "canard"),
        ("lion", "tigre"), ("loup", "renard"), ("éléphant", "rhinocéros"),
        ("girafe", "zèbre"), ("singe", "gorille"), ("ours", "panda"),
        ("kangourou", "koala"), ("aigle", "vautour"), ("pigeon", "mouette"),
        ("manchot", "autruche"), ("cygne", "flamant"), ("hibou", "corbeau"),
        ("dauphin", "requin"), ("baleine", "orque"), ("pieuvre", "méduse"),
        ("crabe", "homard"), ("tortue", "escargot"), ("souris", "écureuil"),
        ("grenouille", "lézard"), ("serpent", "ver"), ("araignée", "scorpion"),
        ("abeille", "guêpe"), ("papillon", "libellule"), ("hérisson", "taupe"),
    ),
    "Nourriture": (
        ("pomme", "poire"), ("banane", "ananas"), ("orange", "citron"),
        ("fraise", "cerise"), ("raisin", "myrtille"), ("pastèque", "melon"),
        ("carotte", "navet"), ("tomate", "poivron"), ("oignon", "ail"),
        ("salade", "épinard"), ("courgette", "concombre"), ("champignon", "truffe"),
        ("pizza", "quiche"), ("burger", "sandwich"), ("sushi", "nem"),
        ("couscous", "paella"), ("lasagnes", "gratin"), ("raclette", "fondue"),
        ("crêpe", "gaufre"), ("omelette", "soufflé"), ("gâteau", "tarte"),
        ("glace", "sorbet"), ("chocolat", "caramel"), ("bonbon", "sucette"),
        ("croissant", "brioche"), ("macaron", "meringue"), ("yaourt", "fromage"),
        ("miel", "confiture"), ("café", "thé"), ("jus", "soda"),
        ("bière", "vin"), ("lait", "crème"),
    ),
    "Vêtements": (
        ("chemise", "polo"), ("pull", "gilet"), ("veste", "manteau"),
        ("robe", "jupe"), ("pantalon", "short"), ("jean", "legging"),
        ("pyjama", "peignoir"), ("maillot", "combinaison"), ("basket", "botte"),
        ("sandale", "tong"), ("chausson", "chaussette"), ("casquette", "bonnet"),
        ("béret", "turban"), ("écharpe", "foulard"), ("gant", "moufle"),
        ("ceinture", "bretelles"), ("lunettes", "masque"), ("montre", "bracelet"),
        ("bague", "collier"), ("sac", "valise"), ("parapluie", "parasol"),
    ),
    "Maison": (
        ("salon", "véranda"), ("cave", "grenier"), ("chambre", "bureau"),
        ("balcon", "terrasse"), ("couloir", "escalier"), ("table", "comptoir"),
        ("chaise", "tabouret"), ("canapé", "fauteuil"), ("lit", "hamac"),
        ("armoire", "commode"), ("étagère", "placard"), ("coussin", "couverture"),
        ("rideau", "store"), ("tapis", "paillasson"), ("lampe", "bougie"),
        ("assiette", "bol"), ("verre", "tasse"), ("fourchette", "cuillère"),
        ("couteau", "ciseaux"), ("casserole", "poêle"), ("four", "micro-ondes"),
        ("frigo", "congélateur"), ("bouilloire", "cafetière"), ("douche", "baignoire"),
        ("savon", "shampooing"), ("serviette", "éponge"), ("peigne", "brosse"),
        ("miroir", "fenêtre"),
    ),
    "Transport": (
        ("voiture", "camion"), ("bus", "tramway"), ("moto", "scooter"),
        ("vélo", "trottinette"), ("tracteur", "bulldozer"), ("ambulance", "taxi"),
        ("caravane", "tente"), ("avion", "hélicoptère"), ("fusée", "navette"),
        ("montgolfière", "parachute"), ("drone", "satellite"), ("planeur", "deltaplane"),
        ("voilier", "yacht"), ("ferry", "péniche"), ("sous-marin", "torpille"),
        ("canoë", "pédalo"), ("radeau", "barque"), ("train", "métro"),
        ("gare", "aéroport"),
    ),
    "Nature": (
        ("montagne", "volcan"), ("falaise", "canyon"), ("dune", "plage"),
        ("grotte", "tunnel"), ("île", "oasis"), ("désert", "savane"),
        ("forêt", "jungle"), ("pluie", "neige"), ("tonnerre", "éclair"),
        ("brouillard", "nuage"), ("arc-en-ciel", "éclipse"), ("soleil", "lune"),
        ("grêle", "gel"), ("chêne", "sapin"), ("palmier", "cactus"),
        ("rose", "tulipe"), ("marguerite", "tournesol"), ("bambou", "lierre"),
        ("arrosoir", "seau"), ("râteau", "pelle"), ("brouette", "chariot"),
        ("sécateur", "hache"), ("graine", "bulbe"), ("pot", "vase"),
    ),
    "Sport et jeux": (
        ("football", "rugby"), ("basketball", "handball"), ("volley", "badminton"),
        ("tennis", "ping-pong"), ("hockey", "golf"), ("pétanque", "bowling"),
        ("natation", "plongée"), ("course", "marche"), ("saut", "lancer"),
        ("escalade", "randonnée"), ("ski", "snowboard"), ("surf", "voile"),
        ("boxe", "judo"), ("danse", "gymnastique"), ("yoga", "méditation"),
        ("échecs", "dames"), ("cartes", "dominos"), ("dés", "toupie"),
        ("scrabble", "monopoly"), ("puzzle", "labyrinthe"), ("loto", "tombola"),
        ("billard", "fléchettes"), ("ballon", "raquette"), ("filet", "but"),
        ("panier", "poteau"), ("sifflet", "chronomètre"), ("médaille", "trophée"),
    ),
    "Métiers": (
        ("médecin", "infirmier"), ("dentiste", "chirurgien"), ("pharmacien", "vétérinaire"),
        ("opticien", "bijoutier"), ("psychologue", "coach"), ("boulanger", "pâtissier"),
        ("boucher", "poissonnier"), ("cuisinier", "serveur"), ("barman", "sommelier"),
        ("berger", "agriculteur"), ("chocolatier", "fromager"), ("pompier", "policier"),
        ("militaire", "gendarme"), ("juge", "avocat"), ("facteur", "livreur"),
        ("éboueur", "jardinier"), ("pilote", "marin"), ("douanier", "vigile"),
        ("architecte", "ingénieur"), ("plombier", "électricien"), ("maçon", "charpentier"),
        ("peintre", "sculpteur"), ("photographe", "journaliste"), ("acteur", "chanteur"),
    ),
    "Arts et culture": (
        ("piano", "orgue"), ("guitare", "violon"), ("batterie", "xylophone"),
        ("saxophone", "trompette"), ("flûte", "clarinette"), ("harpe", "accordéon"),
        ("rock", "metal"), ("jazz", "blues"), ("rap", "slam"),
        ("pop", "disco"), ("classique", "opéra"), ("reggae", "techno"),
        ("cinéma", "théâtre"), ("concert", "festival"), ("cirque", "parade"),
        ("musée", "bibliothèque"), ("karaoké", "bal"), ("magie", "hypnose"),
        ("dessin", "peinture"), ("sculpture", "poterie"), ("photo", "vidéo"),
        ("tricot", "couture"), ("origami", "collage"), ("gravure", "mosaïque"),
    ),
    "École et bureau": (
        ("stylo", "crayon"), ("gomme", "correcteur"), ("règle", "équerre"),
        ("cahier", "classeur"), ("colle", "scotch"), ("agrafeuse", "perforatrice"),
        ("calculatrice", "ordinateur"), ("maths", "physique"), ("histoire", "géographie"),
        ("chimie", "biologie"), ("anglais", "espagnol"), ("tableau", "écran"),
        ("cartable", "trousse"),
    ),
    "Ville": (
        ("boulangerie", "épicerie"), ("pharmacie", "hôpital"), ("librairie", "kiosque"),
        ("coiffeur", "esthéticienne"), ("banque", "poste"), ("marché", "brocante"),
        ("fleuriste", "jardinerie"), ("restaurant", "cantine"), ("bijouterie", "parfumerie"),
        ("château", "cathédrale"), ("phare", "tour"), ("pont", "barrage"),
        ("statue", "fontaine"), ("ruine", "temple"), ("arène", "stade"),
    ),
}

WORD_PAIRS: tuple[WordPair, ...] = tuple(
    pair for pairs in PAIRS_BY_THEME.values() for pair in pairs
)


def theme_of(pair_index: int) -> str:
    """Le thème auquel appartient la paire d'indice donné."""
    seen = 0
    for theme, pairs in PAIRS_BY_THEME.items():
        if pair_index < seen + len(pairs):
            return theme
        seen += len(pairs)
    raise IndexError(pair_index)


class WordGenerator:
    """Tire une des paires du dictionnaire."""

    def __init__(
        self,
        pairs: Sequence[Sequence[str]] = WORD_PAIRS,
        rng: random.Random | None = None,
    ) -> None:
        if not pairs:
            raise ValueError("Il faut au moins une paire de mots")
        invalid = [
            i for i, pair in enumerate(pairs)
            if len(pair) != 2 or pair[0] == pair[1]
        ]
        if invalid:
            raise ValueError(
                f"Ces paires n'ont pas deux mots distincts : {invalid}"
            )
        self._pairs = tuple(tuple(pair) for pair in pairs)
        self._rng = rng or random.Random()

    def pair(self) -> WordPair:
        """Une paire au hasard.

        L'ordre est tiré lui aussi : sans cela, le mot de la majorité
        serait toujours le premier écrit, et un joueur qui connaît la
        liste saurait dans quel camp il est.
        """
        first, second = self._rng.choice(self._pairs)
        return (first, second) if self._rng.random() < 0.5 else (second, first)

    def pair_count(self) -> int:
        """Nombre de paires du dictionnaire."""
        return len(self._pairs)
