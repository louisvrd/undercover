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
6. **Que des mots connus, et un seul mot par carte.** Un joueur qui
   reçoit « caracal » ne joue pas, il se tait. Rien qui contienne un
   espace non plus, sinon l'indice unique porterait sur deux idées.
7. **Aucun duo réflexe.** « bain » et « douche » vont par deux dans la
   tête de tout le monde : celui qui tire l'un sait aussitôt ce qu'a
   l'autre camp, et l'Undercover se fond sans effort. Il faut que le mot
   reçu laisse plusieurs voisins possibles.

Les contraires tombent sous la règle 7 autant que les duos d'usage :
« généreux » appelle « avare » aussi sûrement que « bain » appelle
« douche ». Les traits de caractère sont donc croisés sans rapport entre
eux plutôt qu'opposés deux à deux.

C'est encore la règle 7 qui explique **qu'un mot serve dans plusieurs
paires**, trois au maximum. « pomme » tombe tantôt avec « coing »,
tantôt avec « pêche » : le tenir ne renseigne sur rien. Un dictionnaire
où chaque mot n'aurait qu'un seul partenaire serait entièrement
prévisible dès qu'on le connaît — défaut supportable à 257 paires,
rédhibitoire à 2500.

Les règles 3, 4 et 7 ne se vérifient pas automatiquement : elles portent
sur ce que deux mots évoquent, pas sur leur forme. Elles s'appliquent à
la relecture, thème par thème. `tools/audit_words.py` couvre le reste —
doublons, mots trop sollicités, mots à espace — et signale les paires
proches de forme, qui sont des points à relire, pas un verdict.
"""

from __future__ import annotations

import random
from typing import Sequence

WordPair = tuple[str, str]

# Les themes servent a la relecture et a l'audit ; le tirage, lui, pioche
# uniformement dans WORD_PAIRS.
PAIRS_BY_THEME: dict[str, tuple[WordPair, ...]] = {
    "Ferme": (
        ("vache", "chèvre"), ("vache", "brebis"), ("chèvre", "truie"),
        ("mouton", "cochon"), ("mouton", "veau"), ("agneau", "veau"),
        ("taureau", "bélier"), ("bélier", "bouc"), ("cheval", "âne"),
        ("cheval", "mulet"), ("poney", "âne"), ("poney", "mulet"),
        ("jument", "truie"), ("poule", "oie"), ("coq", "paon"),
        ("canard", "oie"), ("canard", "dinde"), ("lapin", "cochon"),
        ("étable", "poulailler"), ("clôture", "haie"), ("blé", "orge"),
        ("ruche", "poulailler"), ("enclos", "haie"), ("coq", "canard"),
        ("agneau", "poussin"), ("truie", "brebis"), ("lapin", "chèvre"),
        ("veau", "poney"), ("mulet", "taureau"), ("grange", "étable"),
        ("berger", "ruche"), ("chat", "lapin"), ("chien", "cheval"),
        ("chat", "poule"), ("chien", "vache"), ("taureau", "bouc"),
        ("blé", "maïs"), ("berger", "tracteur"),
    ),
    "Animaux sauvages": (
        ("lion", "tigre"), ("lion", "guépard"), ("tigre", "panthère"),
        ("guépard", "léopard"), ("panthère", "lynx"), ("loup", "renard"),
        ("ours", "sanglier"), ("ours", "panda"), ("panda", "koala"),
        ("singe", "gorille"), ("gorille", "chimpanzé"), ("éléphant", "rhinocéros"),
        ("rhinocéros", "hippopotame"), ("girafe", "zèbre"), ("cerf", "chevreuil"),
        ("kangourou", "autruche"), ("chameau", "lama"), ("hérisson", "taupe"),
        ("castor", "loutre"), ("loutre", "phoque"), ("phoque", "morse"),
        ("chauve-souris", "hibou"), ("lion", "ours"), ("loup", "lynx"),
        ("tigre", "hyène"), ("girafe", "chameau"), ("éléphant", "bison"),
        ("singe", "koala"), ("cerf", "sanglier"), ("morse", "loutre"),
        ("gazelle", "renne"), ("guépard", "gazelle"), ("éléphant", "girafe"),
        ("hippopotame", "bison"), ("écureuil", "souris"), ("singe", "rat"),
        ("chimpanzé", "koala"), ("renne", "bison"), ("hippopotame", "crocodile"),
        ("hyène", "gazelle"), ("écureuil", "hérisson"), ("taupe", "rat"),
        ("souris", "castor"), ("morse", "baleine"),
    ),
    "Oiseaux": (
        ("aigle", "faucon"), ("aigle", "vautour"), ("corbeau", "pie"),
        ("pigeon", "mouette"), ("cygne", "oie"), ("cygne", "flamant"),
        ("manchot", "autruche"), ("paon", "faisan"), ("perroquet", "toucan"),
        ("perruche", "canari"), ("nid", "terrier"), ("plume", "écaille"),
        ("aile", "nageoire"), ("aigle", "cygne"), ("corbeau", "moineau"),
        ("hibou", "paon"), ("perroquet", "canari"), ("pigeon", "faisan"),
        ("hirondelle", "merle"), ("colibri", "toucan"), ("plume", "nid"),
        ("hibou", "pie"), ("moineau", "merle"), ("hirondelle", "colibri"),
        ("oiseau", "poisson"), ("oiseau", "insecte"),
    ),
    "Mer et rivière": (
        ("dauphin", "requin"), ("requin", "raie"), ("baleine", "orque"),
        ("thon", "saumon"), ("étoile", "oursin"), ("crabe", "homard"),
        ("moule", "huître"), ("corail", "algue"), ("hippocampe", "poisson-clown"),
        ("tortue", "crocodile"), ("marée", "courant"), ("dauphin", "baleine"),
        ("thon", "sardine"), ("poulpe", "calmar"), ("orque", "phoque"),
        ("crevette", "moule"), ("huître", "coquillage"), ("méduse", "oursin"),
        ("algue", "sable"), ("sardine", "morue"), ("marée", "vague"),
        ("courant", "écume"), ("poisson", "coquillage"),
    ),
    "Insectes et petites bêtes": (
        ("abeille", "guêpe"), ("abeille", "bourdon"), ("guêpe", "frelon"),
        ("papillon", "libellule"), ("coccinelle", "scarabée"), ("araignée", "scorpion"),
        ("scorpion", "mille-pattes"), ("limace", "ver"), ("toile", "nid"),
        ("cobra", "python"), ("abeille", "frelon"), ("guêpe", "bourdon"),
        ("papillon", "coccinelle"), ("libellule", "cigale"), ("fourmi", "puce"),
        ("cafard", "moustique"), ("scarabée", "araignée"), ("lézard", "caméléon"),
        ("frelon", "bourdon"), ("moustique", "mouche"), ("escargot", "limace"),
        ("serpent", "cobra"), ("grenouille", "crapaud"),
    ),
    "Fruits": (
        ("poire", "prune"), ("pêche", "abricot"), ("abricot", "prune"),
        ("cerise", "prune"), ("fraise", "framboise"), ("framboise", "mûre"),
        ("mûre", "myrtille"), ("raisin", "figue"), ("figue", "datte"),
        ("banane", "mangue"), ("ananas", "mangue"), ("orange", "mandarine"),
        ("citron", "pamplemousse"), ("pamplemousse", "orange"), ("noix", "noisette"),
        ("noisette", "amande"), ("amande", "pistache"), ("cacahuète", "pistache"),
        ("avocat", "olive"), ("peau", "écorce"), ("verger", "vigne"),
        ("abricot", "figue"), ("banane", "datte"), ("noix", "cacahuète"),
        ("pastèque", "courge"), ("avocat", "kiwi"), ("pêche", "raisin"),
        ("pomme", "pêche"), ("cerise", "myrtille"), ("fraise", "mûre"),
        ("pastèque", "grenade"), ("noix", "pistache"), ("amande", "cacahuète"),
        ("courge", "vigne"), ("pomme", "poire"), ("cerise", "fraise"),
        ("framboise", "myrtille"), ("ananas", "kiwi"), ("pamplemousse", "mandarine"),
    ),
    "Légumes": (
        ("carotte", "navet"), ("navet", "radis"), ("radis", "betterave"),
        ("betterave", "céleri"), ("tomate", "poivron"), ("poivron", "piment"),
        ("courgette", "concombre"), ("courgette", "aubergine"), ("aubergine", "poivron"),
        ("oignon", "échalote"), ("échalote", "ail"), ("ail", "poireau"),
        ("poireau", "asperge"), ("asperge", "haricot"), ("salade", "épinard"),
        ("chou", "brocoli"), ("brocoli", "chou-fleur"), ("fenouil", "céleri"),
        ("champignon", "truffe"), ("potager", "serre"), ("carotte", "poireau"),
        ("tomate", "aubergine"), ("navet", "fenouil"), ("chou-fleur", "haricot"),
        ("épinard", "asperge"), ("oignon", "piment"), ("maïs", "riz"),
        ("chou-fleur", "salade"), ("oignon", "ail"), ("échalote", "céleri"),
        ("haricot", "petit"), ("piment", "truffe"),
    ),
    "Plats": (
        ("pizza", "quiche"), ("burger", "sandwich"), ("sandwich", "wrap"),
        ("wrap", "kebab"), ("hot-dog", "kebab"), ("paella", "couscous"),
        ("couscous", "tajine"), ("tajine", "curry"), ("curry", "chili"),
        ("frites", "chips"), ("beignet", "croquette"), ("croquette", "nugget"),
        ("crêpe", "galette"), ("galette", "gaufre"), ("choucroute", "cassoulet"),
        ("cassoulet", "chili"), ("rôti", "grillade"), ("grillade", "brochette"),
        ("brochette", "kebab"), ("saucisse", "merguez"), ("pizza", "lasagnes"),
        ("soupe", "salade"), ("omelette", "gratin"), ("crêpe", "gaufre"),
        ("frites", "purée"), ("steak", "saucisse"), ("brochette", "croquette"),
        ("chips", "nugget"), ("quiche", "gratin"), ("raviolis", "lasagnes"),
        ("tajine", "chili"), ("sushi", "raviolis"), ("lasagnes", "gratin"),
        ("soupe", "purée"), ("galette", "omelette"),
    ),
    "Desserts et sucreries": (
        ("gâteau", "tarte"), ("tarte", "flan"), ("macaron", "meringue"),
        ("bonbon", "sucette"), ("sucette", "chewing-gum"), ("glace", "sorbet"),
        ("croissant", "brioche"), ("brioche", "chausson"), ("chausson", "beignet"),
        ("cookie", "biscuit"), ("compote", "confiture"), ("confiture", "gelée"),
        ("miel", "sirop"), ("sucre", "vanille"), ("donut", "beignet"),
        ("gâteau", "flan"), ("chocolat", "caramel"), ("muffin", "donut"),
        ("compote", "gelée"), ("sorbet", "milkshake"), ("chocolat", "vanille"),
        ("bonbon", "chewing-gum"), ("sucette", "biscuit"), ("sucre", "truffe"),
        ("flan", "compote"), ("chewing-gum", "biscuit"), ("cookie", "macaron"),
        ("meringue", "brioche"), ("gelée", "sirop"),
    ),
    "Boissons": (
        ("soda", "limonade"), ("bière", "cidre"), ("vin", "champagne"),
        ("whisky", "rhum"), ("rhum", "vodka"), ("vodka", "gin"),
        ("milkshake", "smoothie"), ("bouteille", "gourde"), ("bar", "terrasse"),
        ("whisky", "gin"), ("cola", "limonade"), ("café", "thé"),
        ("eau", "jus"), ("cola", "sirop"), ("verre", "tasse"),
        ("glaçon", "paille"),
    ),
    "Épicerie": (
        ("pain", "baguette"), ("moutarde", "mayonnaise"), ("mayonnaise", "ketchup"),
        ("sel", "sucre"), ("cannelle", "gingembre"), ("jambon", "saucisson"),
        ("bocal", "conserve"), ("boîte", "sachet"), ("sel", "poivre"),
        ("menthe", "thym"), ("conserve", "sachet"), ("fromage", "yaourt"),
        ("fromage", "beurre"), ("lait", "yaourt"), ("beurre", "huile"),
        ("œuf", "lait"), ("ketchup", "vinaigre"), ("pâtes", "riz"),
        ("céréales", "farine"), ("confiture", "beurre"),
    ),
    "Vêtements": (
        ("chemise", "polo"), ("polo", "tee-shirt"), ("pull", "gilet"),
        ("pull", "sweat"), ("manteau", "parka"), ("parka", "doudoune"),
        ("doudoune", "anorak"), ("pantalon", "jean"), ("pyjama", "peignoir"),
        ("peignoir", "kimono"), ("maillot", "combinaison"), ("combinaison", "salopette"),
        ("costume", "tailleur"), ("chaussette", "chausson"), ("manche", "col"),
        ("tissu", "cuir"), ("laine", "coton"), ("chemise", "pull"),
        ("robe", "salopette"), ("jean", "short"), ("manteau", "cape"),
        ("pyjama", "maillot"), ("costume", "uniforme"), ("collant", "chaussette"),
        ("manche", "poche"), ("veste", "manteau"), ("parka", "anorak"),
        ("doudoune", "imperméable"), ("uniforme", "tailleur"), ("pli", "bouton"),
        ("sweat", "gilet"), ("robe", "jupe"), ("short", "collant"),
        ("kimono", "cape"), ("salopette", "uniforme"), ("poche", "bouton"),
        ("pli", "tissu"), ("cuir", "soie"),
    ),
    "Chaussures et accessoires": (
        ("sandale", "tong"), ("lacet", "boucle"), ("semelle", "talon"),
        ("casquette", "bonnet"), ("écharpe", "foulard"), ("ceinture", "bretelles"),
        ("lunettes", "masque"), ("valise", "malle"), ("malle", "coffre"),
        ("mouchoir", "serviette"), ("lacet", "semelle"), ("bretelles", "lunettes"),
        ("basket", "sandale"), ("botte", "tong"), ("talon", "boucle"),
        ("chapeau", "foulard"), ("écharpe", "gant"), ("sac", "valise"),
        ("parapluie", "serviette"), ("mouchoir", "montre"),
    ),
    "Corps humain": (
        ("coude", "genou"), ("genou", "cheville"), ("poignet", "cheville"),
        ("épaule", "hanche"), ("hanche", "taille"), ("pouce", "index"),
        ("ongle", "cheveu"), ("cheveu", "poil"), ("front", "menton"),
        ("menton", "joue"), ("nez", "oreille"), ("œil", "sourcil"),
        ("lèvre", "paupière"), ("cœur", "poumon"), ("poumon", "foie"),
        ("foie", "rein"), ("rein", "estomac"), ("peau", "ongle"),
        ("crâne", "mâchoire"), ("ride", "cicatrice"), ("genou", "épaule"),
        ("dent", "langue"), ("cœur", "rein"), ("foie", "estomac"),
        ("poumon", "cerveau"), ("os", "muscle"), ("crâne", "côte"),
        ("talon", "pouce"), ("coude", "poignet"), ("ongle", "poil"),
        ("cheveu", "sourcil"), ("front", "joue"), ("paupière", "œil"),
        ("bras", "jambe"), ("main", "pied"), ("doigt", "pouce"),
        ("menton", "nez"), ("oreille", "œil"), ("sourcil", "paupière"),
        ("côte", "dos"),
    ),
    "Santé et soins": (
        ("rhume", "grippe"), ("toux", "éternuement"), ("fièvre", "frisson"),
        ("migraine", "vertige"), ("nausée", "vertige"), ("coupure", "brûlure"),
        ("brûlure", "ampoule"), ("entorse", "fracture"), ("piqûre", "morsure"),
        ("pansement", "bandage"), ("bandage", "attelle"), ("plâtre", "attelle"),
        ("béquille", "canne"), ("vaccin", "rappel"), ("infirmerie", "urgences"),
        ("massage", "étirement"), ("rhume", "toux"), ("grippe", "fièvre"),
        ("migraine", "nausée"), ("vertige", "frisson"), ("ampoule", "piqûre"),
        ("morsure", "allergie"), ("éternuement", "rappel"), ("fièvre", "toux"),
        ("allergie", "vaccin"),
    ),
    "Pièces et bâti": (
        ("chambre", "bureau"), ("bureau", "atelier"), ("atelier", "garage"),
        ("balcon", "terrasse"), ("escalier", "échelle"), ("échelle", "rampe"),
        ("mur", "cloison"), ("plancher", "parquet"), ("parquet", "carrelage"),
        ("portail", "grille"), ("store", "rideau"), ("tuile", "ardoise"),
        ("cheminée", "poêle"), ("clé", "verrou"), ("poignée", "bouton"),
        ("radiateur", "climatiseur"), ("escalier", "rampe"), ("mur", "plancher"),
        ("rideau", "portail"), ("salon", "chambre"), ("cuisine", "garage"),
        ("cave", "grenier"), ("couloir", "escalier"), ("plancher", "plafond"),
        ("porte", "fenêtre"), ("store", "grille"), ("toit", "tuile"),
    ),
    "Meubles": (
        ("table", "comptoir"), ("chaise", "tabouret"), ("canapé", "fauteuil"),
        ("lit", "hamac"), ("hamac", "matelas"), ("armoire", "commode"),
        ("commode", "buffet"), ("étagère", "bibliothèque"), ("chevet", "commode"),
        ("parasol", "store"), ("tapis", "paillasson"), ("cadre", "toile"),
        ("table", "étagère"), ("chaise", "coussin"), ("canapé", "lit"),
        ("armoire", "tiroir"), ("cadre", "globe"), ("placard", "tiroir"),
        ("miroir", "cadre"), ("paillasson", "parasol"), ("table", "bureau"),
        ("lit", "matelas"), ("placard", "étagère"), ("bibliothèque", "buffet"),
        ("tiroir", "coffre"), ("horloge", "tableau"),
    ),
    "Cuisine : ustensiles": (
        ("assiette", "bol"), ("saladier", "plat"), ("tasse", "mug"),
        ("mug", "bol"), ("fourchette", "pique"), ("cuillère", "louche"),
        ("ciseaux", "pince"), ("casserole", "poêle"), ("poêle", "wok"),
        ("plaque", "grille"), ("bouchon", "capsule"), ("bocal", "boîte"),
        ("passoire", "râpe"), ("cuillère", "pique"), ("torchon", "tablier"),
        ("plaque", "boîte"), ("fourchette", "cuillère"), ("planche", "rouleau"),
        ("marmite", "wok"), ("louche", "pince"), ("four", "frigo"),
    ),
    "Électroménager": (
        ("plaque", "réchaud"), ("aspirateur", "balai"), ("bouilloire", "cafetière"),
        ("enceinte", "casque"), ("radio", "réveil"), ("téléphone", "tablette"),
        ("chargeur", "batterie"), ("ampoule", "néon"), ("sèche-linge", "radio"),
    ),
    "Outils et bricolage": (
        ("tournevis", "clé"), ("clé", "pince"), ("perceuse", "visseuse"),
        ("mètre", "équerre"), ("équerre", "compas"), ("échelle", "escabeau"),
        ("escabeau", "échafaudage"), ("vis", "boulon"), ("peinture", "vernis"),
        ("pinceau", "rouleau"), ("ciment", "plâtre"), ("planche", "poutre"),
        ("clou", "agrafe"), ("casque", "gants"), ("scie", "perceuse"),
        ("mètre", "compas"), ("ruban", "agrafe"), ("clou", "vis"),
        ("colle", "ruban"), ("brique", "poutre"), ("compas", "gants"),
        ("casque", "échafaudage"),
    ),
    "Jardin": (
        ("arrosoir", "seau"), ("râteau", "pelle"), ("bêche", "fourche"),
        ("brouette", "chariot"), ("graine", "bulbe"), ("clôture", "barrière"),
        ("allée", "sentier"), ("bassin", "mare"), ("fontaine", "cascade"),
        ("hamac", "balançoire"), ("arrosoir", "brouette"), ("bassin", "fontaine"),
        ("barbecue", "balançoire"), ("seau", "bac"), ("mare", "fontaine"),
        ("tondeuse", "hache"), ("pot", "bac"), ("serre", "cabane"),
        ("barrière", "portail"),
    ),
    "Véhicules": (
        ("bus", "autocar"), ("autocar", "navette"), ("train", "locomotive"),
        ("moto", "scooter"), ("vélo", "trottinette"), ("skateboard", "roller"),
        ("ambulance", "taxi"), ("caravane", "camping-car"), ("traîneau", "luge"),
        ("pédale", "manette"), ("moteur", "batterie"), ("klaxon", "sirène"),
        ("péage", "parking"), ("station", "garage"), ("camion", "autocar"),
        ("vélo", "roller"), ("train", "métro"), ("caravane", "remorque"),
        ("traîneau", "charrette"), ("roue", "phare"), ("moteur", "klaxon"),
        ("wagon", "remorque"), ("sirène", "manette"), ("voiture", "camion"),
        ("tramway", "wagon"), ("luge", "remorque"), ("avion", "bateau"),
        ("moteur", "roue"), ("phare", "klaxon"),
    ),
    "Bateaux et eau": (
        ("canoë", "kayak"), ("radeau", "ponton"), ("port", "quai"),
        ("marin", "capitaine"), ("barque", "radeau"), ("phare", "capitaine"),
        ("bateau", "barque"), ("voilier", "kayak"), ("canoë", "radeau"),
        ("ancre", "voile"),
    ),
    "Air et espace": (
        ("avion", "jet"), ("parachute", "aile"), ("drone", "satellite"),
        ("fusée", "navette"), ("navette", "capsule"), ("hublot", "cockpit"),
        ("aile", "hélice"), ("comète", "météorite"), ("étoile", "galaxie"),
        ("cratère", "canyon"), ("météorite", "étoile"), ("cratère", "orbite"),
        ("avion", "fusée"), ("hélicoptère", "drone"), ("lune", "cratère"),
        ("galaxie", "orbite"),
    ),
    "Paysages": (
        ("montagne", "colline"), ("falaise", "canyon"), ("vallée", "plaine"),
        ("plaine", "plateau"), ("plage", "crique"), ("crique", "baie"),
        ("baie", "golfe"), ("désert", "savane"), ("forêt", "jungle"),
        ("rivière", "torrent"), ("torrent", "cascade"), ("source", "puits"),
        ("sentier", "col"), ("colline", "falaise"), ("forêt", "marais"),
        ("lac", "torrent"), ("fleuve", "source"), ("récif", "iceberg"),
        ("marais", "lac"), ("plateau", "col"), ("île", "récif"),
        ("rivière", "fleuve"), ("grotte", "sentier"), ("iceberg", "glacier"),
    ),
    "Météo et ciel": (
        ("averse", "orage"), ("rosée", "brume"), ("vent", "brise"),
        ("tempête", "ouragan"), ("canicule", "sécheresse"), ("nuage", "brume"),
        ("arc-en-ciel", "éclipse"), ("pluie", "neige"), ("rosée", "gel"),
        ("soleil", "nuage"),
    ),
    "Arbres et plantes": (
        ("olivier", "figuier"), ("pommier", "cerisier"), ("cerisier", "prunier"),
        ("mousse", "fougère"), ("tronc", "branche"), ("racine", "souche"),
        ("écorce", "sève"), ("feuille", "aiguille"), ("bourgeon", "pousse"),
        ("sapin", "palmier"), ("saule", "olivier"), ("cactus", "bambou"),
        ("noyer", "figuier"), ("pommier", "prunier"), ("racine", "bourgeon"),
        ("tronc", "sève"), ("feuille", "gland"), ("prunier", "palmier"),
        ("chêne", "sapin"), ("pin", "palmier"), ("noyer", "bambou"),
        ("cactus", "fougère"), ("mousse", "herbe"), ("gland", "bourgeon"),
        ("fleur", "arbre"),
    ),
    "Sports": (
        ("football", "rugby"), ("basketball", "handball"), ("volley", "badminton"),
        ("ping-pong", "badminton"), ("hockey", "crosse"), ("pétanque", "bowling"),
        ("baseball", "cricket"), ("natation", "plongeon"), ("aviron", "canoë"),
        ("course", "marche"), ("sprint", "marathon"), ("escalade", "randonnée"),
        ("ski", "snowboard"), ("patinage", "luge"), ("boxe", "judo"),
        ("judo", "karaté"), ("karaté", "taekwondo"), ("lutte", "sumo"),
        ("équitation", "polo"), ("cyclisme", "BMX"), ("danse", "gymnastique"),
        ("gymnastique", "trampoline"), ("football", "hockey"), ("tennis", "golf"),
        ("boxe", "lutte"), ("natation", "aviron"), ("ski", "patinage"),
        ("danse", "trampoline"), ("yoga", "musculation"), ("judo", "sumo"),
        ("cyclisme", "équitation"), ("volley", "baseball"), ("randonnée", "alpinisme"),
        ("course", "marathon"), ("sprint", "marche"), ("trampoline", "acrobatie"),
        ("tennis", "ping-pong"), ("golf", "bowling"), ("pétanque", "billard"),
        ("karaté", "lutte"), ("surf", "voile"),
    ),
    "Équipement sportif": (
        ("raquette", "batte"), ("batte", "crosse"), ("filet", "but"),
        ("but", "panier"), ("panier", "poteau"), ("chronomètre", "sifflet"),
        ("sifflet", "drapeau"), ("coupe", "ceinture"), ("terrain", "piste"),
        ("piste", "couloir"), ("tapis", "ring"), ("corde", "élastique"),
        ("bâton", "fixation"), ("arc", "arbalète"), ("crosse", "arc"),
        ("coupe", "podium"), ("vestiaire", "terrain"), ("ballon", "raquette"),
        ("maillot", "short"), ("médaille", "coupe"), ("podium", "piste"),
    ),
    "Jeux": (
        ("cartes", "tarot"), ("toupie", "yoyo"), ("monopoly", "cluedo"),
        ("cluedo", "risk"), ("puzzle", "labyrinthe"), ("billard", "fléchettes"),
        ("baby-foot", "flipper"), ("balançoire", "toboggan"), ("poupée", "peluche"),
        ("peluche", "marionnette"), ("robot", "figurine"), ("cube", "brique"),
        ("robot", "cube"), ("échecs", "dames"), ("cartes", "dominos"),
        ("dés", "toupie"), ("yoyo", "bille"), ("cerf-volant", "frisbee"),
    ),
    "Métiers": (
        ("médecin", "infirmier"), ("pharmacien", "biologiste"), ("sage-femme", "pédiatre"),
        ("boulanger", "pâtissier"), ("pâtissier", "chocolatier"), ("boucher", "charcutier"),
        ("serveur", "barman"), ("berger", "agriculteur"), ("pêcheur", "marin"),
        ("pompier", "secouriste"), ("douanier", "vigile"), ("juge", "avocat"),
        ("facteur", "livreur"), ("chauffeur", "coursier"), ("architecte", "ingénieur"),
        ("plombier", "électricien"), ("maçon", "charpentier"), ("charpentier", "menuisier"),
        ("serrurier", "vitrier"), ("horloger", "bijoutier"), ("esthéticienne", "manucure"),
        ("écrivain", "traducteur"), ("libraire", "bibliothécaire"), ("éducateur", "animateur"),
        ("comptable", "banquier"), ("caissier", "vendeur"), ("chanteur", "musicien"),
        ("arbitre", "entraîneur"), ("archéologue", "géologue"), ("boulanger", "boucher"),
        ("cuisinier", "serveur"), ("médecin", "pharmacien"), ("dentiste", "opticien"),
        ("pompier", "douanier"), ("juge", "notaire"), ("facteur", "chauffeur"),
        ("jardinier", "éboueur"), ("pilote", "marin"), ("architecte", "comptable"),
        ("plombier", "serrurier"), ("peintre", "vitrier"), ("horloger", "cordonnier"),
        ("coiffeur", "manucure"), ("photographe", "écrivain"), ("acteur", "danseur"),
        ("libraire", "épicier"), ("mineur", "bûcheron"), ("astronome", "géologue"),
        ("vétérinaire", "biologiste"), ("guide", "arbitre"), ("clown", "musicien"),
        ("dentiste", "pharmacien"), ("opticien", "vétérinaire"), ("chocolatier", "boucher"),
        ("vigile", "juge"), ("livreur", "coursier"), ("chauffeur", "pilote"),
        ("contrôleur", "éboueur"), ("bijoutier", "cordonnier"), ("tailleur", "coiffeur"),
        ("traducteur", "libraire"), ("médecin", "chirurgien"), ("sage-femme", "esthéticienne"),
        ("boulanger", "chocolatier"), ("secouriste", "militaire"), ("banquier", "caissier"),
        ("vendeur", "comptable"), ("chirurgien", "vétérinaire"), ("pâtissier", "cuisinier"),
        ("épicier", "fleuriste"), ("pêcheur", "bûcheron"), ("pompier", "policier"),
        ("militaire", "douanier"), ("maçon", "menuisier"), ("peintre", "serrurier"),
        ("mécanicien", "horloger"), ("photographe", "journaliste"), ("professeur", "éducateur"),
        ("acteur", "chanteur"), ("danseur", "musicien"), ("clown", "arbitre"),
        ("guide", "astronome"),
    ),
    "Instruments": (
        ("saxophone", "clarinette"), ("trombone", "tuba"), ("cor", "tuba"),
        ("touche", "pédale"), ("piano", "guitare"), ("violon", "trompette"),
        ("harpe", "tambour"), ("flûte", "cymbale"), ("saxophone", "xylophone"),
        ("orgue", "accordéon"), ("corde", "touche"), ("pédale", "partition"),
        ("étui", "guitare"), ("violon", "harpe"), ("flûte", "clarinette"),
        ("saxophone", "trompette"), ("tambour", "cymbale"), ("xylophone", "accordéon"),
        ("orgue", "cor"),
    ),
    "Musique et spectacle": (
        ("rock", "punk"), ("punk", "metal"), ("jazz", "blues"),
        ("blues", "soul"), ("chorale", "orchestre"), ("orchestre", "fanfare"),
        ("concert", "festival"), ("festival", "tournée"), ("projecteur", "micro"),
        ("rideau", "décor"), ("costume", "maquillage"), ("applaudissement", "rappel"),
        ("billet", "programme"), ("rock", "jazz"), ("rap", "pop"),
        ("fanfare", "micro"), ("maquillage", "perruque"), ("cirque", "théâtre"),
    ),
    "Arts et loisirs créatifs": (
        ("peinture", "aquarelle"), ("fresque", "graffiti"), ("collage", "origami"),
        ("tricot", "crochet"), ("montage", "retouche"), ("crayon", "feutre"),
        ("moule", "empreinte"), ("galerie", "atelier"),
    ),
    "École": (
        ("règle", "équerre"), ("cahier", "classeur"), ("classeur", "chemise"),
        ("agenda", "carnet"), ("colle", "scotch"), ("ciseaux", "cutter"),
        ("cartable", "trousse"), ("tableau", "ardoise"), ("craie", "marqueur"),
        ("maths", "physique"), ("chimie", "biologie"), ("histoire", "philosophie"),
        ("géographie", "économie"), ("anglais", "espagnol"), ("allemand", "italien"),
        ("latin", "grec"), ("examen", "concours"), ("note", "moyenne"),
        ("bulletin", "carnet"), ("leçon", "chapitre"), ("manuel", "dictionnaire"),
        ("diplôme", "certificat"), ("cahier", "trousse"), ("cartable", "agenda"),
        ("maths", "géographie"), ("chimie", "philosophie"), ("latin", "italien"),
        ("dictée", "exposé"), ("note", "bulletin"), ("grammaire", "conjugaison"),
        ("scotch", "agrafeuse"), ("marqueur", "cutter"), ("histoire", "géographie"),
        ("philosophie", "économie"), ("exposé", "leçon"), ("chapitre", "examen"),
        ("concours", "note"), ("moyenne", "bulletin"), ("stylo", "règle"),
        ("gomme", "colle"), ("tableau", "craie"), ("maths", "histoire"),
    ),
    "Bureau et informatique": (
        ("ordinateur", "tablette"), ("imprimante", "scanner"), ("serveur", "routeur"),
        ("fichier", "dossier"), ("site", "blog"), ("corbeille", "archive"),
        ("raccourci", "menu"), ("onglet", "fenêtre"), ("tampon", "signature"),
        ("réunion", "entretien"), ("planning", "échéance"), ("écran", "imprimante"),
        ("entretien", "planning"),
    ),
    "Ville et commerces": (
        ("boulangerie", "pâtisserie"), ("librairie", "papeterie"), ("kiosque", "tabac"),
        ("banque", "assurance"), ("restaurant", "brasserie"), ("tribunal", "prison"),
        ("collège", "lycée"), ("théâtre", "cinéma"), ("musée", "galerie"),
        ("stade", "gymnase"), ("piscine", "patinoire"), ("impasse", "ruelle"),
        ("rond-point", "carrefour"), ("feu", "panneau"), ("pharmacie", "papeterie"),
        ("banque", "poste"), ("musée", "cinéma"), ("stade", "piscine"),
        ("mairie", "tribunal"), ("caserne", "prison"), ("collège", "gymnase"),
        ("fleuriste", "bijouterie"), ("parking", "carrefour"), ("feu", "rond-point"),
        ("galerie", "patinoire"), ("brasserie", "cinéma"), ("théâtre", "musée"),
        ("gymnase", "piscine"), ("patinoire", "spa"), ("panneau", "lampadaire"),
        ("pharmacie", "librairie"), ("marché", "restaurant"), ("gare", "aéroport"),
    ),
    "Voyage": (
        ("bagage", "colis"), ("passeport", "visa"), ("hôtel", "auberge"),
        ("tente", "caravane"), ("guichet", "comptoir"), ("douane", "contrôle"),
        ("carte", "boussole"), ("boussole", "GPS"), ("plage", "station"),
        ("gourde", "thermos"), ("duvet", "matelas"), ("valise", "bagage"),
        ("colis", "passeport"), ("visa", "billet"), ("détour", "étape"),
        ("réception", "plage"), ("passeport", "billet"),
    ),
    "Fêtes et célébrations": (
        ("réception", "cocktail"), ("bal", "soirée"), ("carnaval", "défilé"),
        ("emballage", "ruban"), ("masque", "perruque"), ("sapin", "crèche"),
        ("cloche", "trompette"), ("vœux", "résolution"), ("manège", "stand"),
    ),
    "Temps et calendrier": (
        ("seconde", "minute"), ("heure", "journée"), ("matin", "après-midi"),
        ("midi", "goûter"), ("année", "décennie"), ("décennie", "siècle"),
        ("printemps", "automne"), ("été", "hiver"), ("montre", "chronomètre"),
        ("agenda", "planning"), ("date", "échéance"), ("matin", "midi"),
        ("année", "siècle"),
    ),
    "Communication": (
        ("lettre", "carte"), ("enveloppe", "étiquette"), ("appel", "message"),
        ("affiche", "panneau"), ("journal", "magazine"), ("interview", "reportage"),
        ("code", "signal"), ("lettre", "colis"), ("timbre", "enveloppe"),
        ("magazine", "article"), ("reportage", "émission"),
    ),
    "Matières": (
        ("marbre", "granit"), ("granit", "ardoise"), ("sable", "gravier"),
        ("gravier", "galet"), ("aluminium", "zinc"), ("plastique", "résine"),
        ("caoutchouc", "latex"), ("papier", "carton"), ("tissu", "feutre"),
        ("fourrure", "peau"), ("laine", "cachemire"), ("nylon", "polyester"),
        ("liège", "paille"), ("cire", "résine"), ("pétrole", "goudron"),
        ("papier", "plastique"), ("cuivre", "zinc"), ("latex", "nylon"),
        ("cachemire", "cuir"), ("fourrure", "feutre"),
    ),
    "Formes et couleurs": (
        ("rouge", "bordeaux"), ("rose", "fuchsia"), ("orange", "corail"),
        ("jaune", "moutarde"), ("bleu", "indigo"), ("indigo", "marine"),
        ("marron", "beige"), ("beige", "taupe"), ("carré", "losange"),
        ("cercle", "ovale"), ("sphère", "cylindre"), ("cylindre", "cône"),
        ("rayure", "carreau"), ("bordeaux", "fuchsia"), ("marine", "corail"),
        ("ovale", "sphère"),
    ),
    "Argent et commerce": (
        ("euro", "dollar"), ("facture", "ticket"), ("salaire", "prime"),
        ("prime", "pourboire"), ("budget", "dépense"), ("banque", "coffre"),
    ),
    "Récits et imaginaire": (
        ("conte", "fable"), ("poème", "chanson"), ("roi", "empereur"),
        ("prince", "duc"), ("sorcière", "fée"), ("géant", "ogre"),
        ("vampire", "loup-garou"), ("zombie", "momie"), ("détective", "espion"),
        ("roman", "poème"), ("épreuve", "héros"),
    ),
    "Objets du quotidien": (
        ("bougie", "lanterne"), ("aiguille", "épingle"), ("trombone", "agrafe"),
        ("crochet", "clou"), ("éponge", "brosse"), ("gant", "tablier"),
        ("réveil", "minuteur"), ("télécommande", "manette"), ("fer", "planche"),
        ("miroir", "loupe"), ("loupe", "jumelles"), ("jumelles", "carnet"),
        ("jumelles", "télécommande"),
    ),
    "Histoire et société": (
        ("royaume", "empire"), ("empire", "république"), ("siège", "assaut"),
        ("marché", "foire"), ("citoyen", "sujet"), ("marchand", "foire"),
        ("siège", "traité"), ("manuscrit", "fouille"),
    ),
    "Traits de caractère": (
        ("bavard", "gourmand"), ("timide", "distrait"), ("généreux", "drôle"),
        ("avare", "râleur"), ("courageux", "patient"), ("peureux", "coquet"),
        ("travailleur", "discret"), ("menteur", "moqueur"), ("honnête", "économe"),
        ("gentil", "ordonné"), ("sévère", "ponctuel"), ("curieux", "maladroit"),
        ("habile", "solitaire"), ("têtu", "rêveur"), ("modeste", "sociable"),
        ("nerveux", "dépensier"), ("prudent", "brouillon"), ("audacieux", "bienveillant"),
        ("méfiant", "bruyant"), ("orgueilleux", "frileux"), ("indulgent", "impulsif"),
        ("posé", "négligé"), ("attentif", "conciliant"), ("bavard", "coquet"),
        ("timide", "gourmand"), ("généreux", "ordonné"), ("avare", "distrait"),
        ("courageux", "moqueur"), ("peureux", "économe"), ("travailleur", "râleur"),
        ("menteur", "frileux"), ("honnête", "solitaire"), ("gentil", "brouillon"),
        ("drôle", "prudent"), ("curieux", "sévère"), ("habile", "naïf"),
        ("maladroit", "sociable"), ("têtu", "ponctuel"), ("modeste", "nerveux"),
        ("orgueilleux", "patient"), ("impulsif", "discret"), ("rêveur", "bruyant"),
        ("posé", "audacieux"), ("indulgent", "méfiant"), ("attentif", "négligé"),
        ("conciliant", "dépensier"), ("timide", "coquet"), ("courageux", "ponctuel"),
        ("sévère", "distrait"), ("habile", "discret"), ("têtu", "bienveillant"),
        ("patient", "bruyant"), ("posé", "dépensier"), ("prudent", "moqueur"),
        ("audacieux", "naïf"), ("rêveur", "attentif"), ("ordonné", "sociable"),
        ("solitaire", "conciliant"), ("honnête", "impulsif"), ("menteur", "indulgent"),
        ("travailleur", "négligé"),
    ),
    "Cinéma et télévision": (
        ("film", "série"), ("épisode", "saison"), ("réalisateur", "producteur"),
        ("animation", "marionnette"), ("salle", "écran"), ("acteur", "réalisateur"),
        ("décor", "accessoire"), ("accessoire", "perruque"),
    ),
    "Camping et plein air": (
        ("duvet", "couverture"), ("gourde", "filtre"), ("lampe", "bougie"),
        ("trousse", "attelle"), ("sac", "bâche"), ("nœud", "boucle"),
    ),
    "Coiffure et beauté": (
        ("mèche", "frange"), ("chignon", "tresse"), ("raie", "épi"),
        ("teinture", "mèches"), ("ciseaux", "rasoir"), ("cape", "serviette"),
        ("bac", "fauteuil"), ("pinceau", "éponge"), ("rasage", "mèches"),
    ),
    "Écrans et réseaux": (
        ("pixel", "résolution"), ("abonnement", "essai"), ("profil", "avatar"),
        ("publication", "commentaire"), ("filtre", "effet"), ("story", "direct"),
        ("wifi", "données"), ("cookie", "historique"), ("bug", "panne"),
        ("wifi", "antenne"), ("historique", "données"), ("essai", "certificat"),
    ),
    "Brawl Stars": (
        ("Bull", "Frank"), ("Rosa", "Jacky"), ("Darryl", "Ash"),
        ("Hank", "Buster"), ("Draco", "Meg"), ("Frank", "Rosa"),
        ("Bull", "Jacky"), ("Ash", "Buster"), ("Piper", "Brock"),
        ("Bea", "Nani"), ("Belle", "Mandy"), ("Angelo", "Janet"),
        ("Brock", "Bea"), ("Piper", "Belle"), ("Nani", "Angelo"),
        ("Mandy", "Janet"), ("Barley", "Dynamike"), ("Tick", "Sprout"),
        ("Grom", "Willow"), ("Juju", "Sprout"), ("Dynamike", "Grom"),
        ("Barley", "Willow"), ("Mortis", "Crow"), ("Leon", "Edgar"),
        ("Fang", "Buzz"), ("Stu", "Kenji"), ("Melodie", "Lily"),
        ("Cordelius", "Shade"), ("Crow", "Leon"), ("Edgar", "Fang"),
        ("Poco", "Byron"), ("Pam", "Gus"), ("Kit", "Berry"),
        ("Doug", "Ruffs"), ("Max", "Gale"), ("Byron", "Gus"),
        ("Poco", "Kit"), ("Gene", "Tara"), ("Sandy", "Emz"),
        ("Otis", "Charlie"), ("Lou", "Chester"), ("Colette", "Amber"),
        ("Tara", "Sandy"), ("Emz", "Otis"), ("Colt", "Rico"),
        ("Spike", "Carl"), ("Bibi", "Surge"), ("Nita", "Jessie"),
        ("Penny", "Bo"), ("Griff", "Sam"), ("Squeak", "Gray"),
        ("Chuck", "Mico"), ("Clancy", "Moe"), ("Pearl", "Lola"),
        ("Maisie", "Eve"), ("Bonnie", "Ollie"), ("8-Bit", "R-T"),
        ("Rico", "Squeak"), ("Shelly", "Nita"), ("Carl", "Surge"),
    ),
    "Fleurs": (
        ("rose", "tulipe"), ("marguerite", "coquelicot"), ("iris", "lys"),
        ("lilas", "lavande"), ("pivoine", "tournesol"), ("violette", "muguet"),
        ("orchidée", "cactus"), ("bouquet", "couronne"), ("tige", "pétale"),
    ),
}

OPTIONAL_THEMES: tuple[str, ...] = ("Brawl Stars",)
"""Thèmes qui ne rejoignent jamais le tirage général.

Un thème optionnel est **exclusif** : soit il est éteint et ses paires
n'existent pas pour la partie, soit il est allumé et c'est le seul
dictionnaire. Le mélanger au reste n'aurait pas de sens — les indices
d'un personnage de jeu vidéo et ceux d'un légume ne se ressemblent en
rien, et la table ne saurait plus dans quel univers elle joue.
"""

WORD_PAIRS: tuple[WordPair, ...] = tuple(
    pair
    for theme, pairs in PAIRS_BY_THEME.items()
    if theme not in OPTIONAL_THEMES
    for pair in pairs
)


def theme_pairs(theme: str) -> tuple[WordPair, ...]:
    """Les paires d'un seul thème, pour jouer en mode exclusif."""
    try:
        return PAIRS_BY_THEME[theme]
    except KeyError:
        raise KeyError(f"Thème inconnu : {theme!r}") from None


def theme_of(pair_index: int) -> str:
    """Le theme auquel appartient la paire d'indice donne."""
    seen = 0
    for theme, pairs in PAIRS_BY_THEME.items():
        if theme in OPTIONAL_THEMES:
            continue  # hors du tirage général, donc hors des indices
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

        L'ordre est tire lui aussi : sans cela, le mot de la majorite
        serait toujours le premier ecrit, et un joueur qui connait la
        liste saurait dans quel camp il est.
        """
        first, second = self._rng.choice(self._pairs)
        return (first, second) if self._rng.random() < 0.5 else (second, first)

    def pair_count(self) -> int:
        """Nombre de paires du dictionnaire."""
        return len(self._pairs)
