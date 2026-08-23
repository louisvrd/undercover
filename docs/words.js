// Généré par tools/gen_words_js.py — ne pas éditer à la main.
// La source est undercover/words.py.

export const WORD_GROUPS = [
  ["chat", "chien", "lapin", "hamster", "souris", "rat", "cochon", "cheval", "vache", "mouton"],
  ["lion", "tigre", "panthère", "léopard", "guépard", "jaguar", "puma", "lynx", "ocelot", "caracal"],
  ["aigle", "faucon", "hibou", "chouette", "vautour", "corbeau", "pie", "perroquet", "colombe", "moineau"],
  ["dauphin", "baleine", "requin", "orque", "phoque", "morse", "otarie", "narval", "marsouin", "lamantin"],
  ["pomme", "poire", "banane", "orange", "citron", "pamplemousse", "mandarine", "kiwi", "fraise", "framboise"],
  ["carotte", "poireau", "oignon", "ail", "navet", "radis", "betterave", "céleri", "panais", "rutabaga"],
  ["boeuf", "porc", "poulet", "dinde", "canard", "agneau", "veau", "lapin", "cheval", "autruche"],
  ["pizza", "burger", "sandwich", "tacos", "kebab", "hot-dog", "burrito", "wrap", "panini", "croque"],
  ["chemise", "t-shirt", "pull", "sweat", "veste", "manteau", "blouson", "gilet", "cardigan", "polo"],
  ["pantalon", "jean", "short", "bermuda", "jupe", "robe", "legging", "jogging", "salopette", "combinaison"],
  ["chaussure", "basket", "botte", "sandale", "mocassin", "espadrille", "derby", "richelieu", "mule", "tong"],
  ["chapeau", "casquette", "bonnet", "béret", "cagoule", "bandana", "bob", "panama", "fedora", "borsalino"],
  ["salon", "cuisine", "chambre", "salle de bain", "bureau", "garage", "cave", "grenier", "buanderie", "véranda"],
  ["table", "chaise", "fauteuil", "canapé", "lit", "armoire", "commode", "buffet", "étagère", "bibliothèque"],
  ["fenêtre", "porte", "escalier", "balcon", "terrasse", "cheminée", "radiateur", "climatiseur", "volet", "store"],
  ["assiette", "verre", "tasse", "bol", "casserole", "poêle", "marmite", "passoire", "louche", "spatule"],
  ["voiture", "camion", "bus", "moto", "vélo", "scooter", "trottinette", "skateboard", "roller", "segway"],
  ["avion", "hélicoptère", "planeur", "dirigeable", "montgolfière", "drone", "ULM", "autogire", "jet", "biplan"],
  ["bateau", "voilier", "yacht", "péniche", "ferry", "paquebot", "catamaran", "kayak", "canot", "pédalo"],
  ["train", "métro", "tramway", "TGV", "RER", "locomotive", "wagon", "funiculaire", "téléphérique", "monorail"],
  ["arbre", "arbuste", "buisson", "herbe", "fleur", "fougère", "mousse", "lichen", "algue", "champignon"],
  ["montagne", "colline", "vallée", "plateau", "plaine", "canyon", "falaise", "volcan", "dune", "glacier"],
  ["rivière", "fleuve", "ruisseau", "torrent", "cascade", "lac", "étang", "mare", "océan", "mer"],
  ["forêt", "jungle", "savane", "désert", "toundra", "taïga", "steppe", "prairie", "marais", "mangrove"],
  ["football", "rugby", "basketball", "volleyball", "handball", "baseball", "cricket", "hockey", "tennis", "badminton"],
  ["natation", "plongée", "water-polo", "surf", "voile", "aviron", "canoë", "kayak", "planche", "ski nautique"],
  ["athlétisme", "gymnastique", "danse", "patinage", "boxe", "judo", "karaté", "taekwondo", "lutte", "escrime"],
  ["cyclisme", "VTT", "BMX", "skateboard", "roller", "trottinette", "motocross", "karting", "F1", "rallye"],
  ["médecin", "infirmier", "dentiste", "pharmacien", "kiné", "ostéopathe", "psychologue", "psychiatre", "vétérinaire", "sage-femme"],
  ["professeur", "instituteur", "éducateur", "formateur", "coach", "mentor", "tuteur", "instructeur", "maître", "enseignant"],
  ["boulanger", "pâtissier", "boucher", "charcutier", "poissonnier", "fromager", "primeur", "épicier", "traiteur", "restaurateur"],
  ["architecte", "ingénieur", "technicien", "designer", "artiste", "graphiste", "photographe", "vidéaste", "développeur", "programmeur"],
  ["cinéma", "théâtre", "concert", "spectacle", "exposition", "musée", "galerie", "cirque", "opéra", "cabaret"],
  ["lecture", "écriture", "dessin", "peinture", "sculpture", "poterie", "broderie", "tricot", "couture", "crochet"],
  ["jardinage", "bricolage", "menuiserie", "mécanique", "électronique", "informatique", "robotique", "domotique", "impression 3D", "modélisme"],
  ["jeu vidéo", "puzzle", "échecs", "cartes", "dés", "dominos", "scrabble", "monopoly", "risk", "uno"],
  ["piano", "guitare", "violon", "batterie", "basse", "saxophone", "trompette", "flûte", "harpe", "accordéon"],
  ["rock", "jazz", "blues", "rap", "pop", "classique", "metal", "reggae", "funk", "soul"],
  ["concert", "festival", "récital", "opéra", "comédie musicale", "karaoké", "jam", "bal", "boîte", "discothèque"],
  ["orchestre", "groupe", "band", "chorale", "quartet", "trio", "duo", "soliste", "ensemble", "fanfare"],
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
