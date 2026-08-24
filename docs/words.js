// Généré par tools/gen_words_js.py — ne pas éditer à la main.
// La source est undercover/words.py.

export const WORD_GROUPS = [
  ["chat", "chien", "lapin", "poule", "cochon", "cheval", "vache", "mouton", "chèvre", "âne"],
  ["lion", "tigre", "ours", "loup", "renard", "éléphant", "girafe", "zèbre", "singe", "kangourou"],
  ["aigle", "hibou", "pigeon", "perroquet", "manchot", "autruche", "flamant", "cygne", "mouette", "corbeau"],
  ["dauphin", "baleine", "requin", "pieuvre", "crabe", "tortue", "méduse", "hippocampe", "homard", "saumon"],
  ["souris", "écureuil", "hérisson", "grenouille", "serpent", "araignée", "papillon", "abeille", "fourmi", "escargot"],
  ["pomme", "banane", "orange", "citron", "fraise", "raisin", "cerise", "pastèque", "ananas", "poire"],
  ["carotte", "tomate", "oignon", "salade", "courgette", "poivron", "concombre", "champignon", "épinard", "haricot"],
  ["pizza", "burger", "sushi", "couscous", "lasagnes", "raclette", "paella", "crêpe", "quiche", "omelette"],
  ["gâteau", "glace", "chocolat", "bonbon", "croissant", "tarte", "macaron", "yaourt", "miel", "confiture"],
  ["eau", "café", "thé", "jus", "limonade", "soda", "bière", "vin", "lait", "sirop"],
  ["chemise", "pull", "veste", "manteau", "robe", "jupe", "pantalon", "short", "pyjama", "maillot"],
  ["basket", "botte", "sandale", "tong", "chausson", "casquette", "bonnet", "béret", "écharpe", "gant"],
  ["sac", "ceinture", "cravate", "lunettes", "montre", "bague", "collier", "bracelet", "parapluie", "portefeuille"],
  ["salon", "cuisine", "chambre", "garage", "cave", "grenier", "couloir", "balcon", "jardin", "escalier"],
  ["table", "chaise", "canapé", "lit", "armoire", "étagère", "bureau", "tabouret", "hamac", "coussin"],
  ["assiette", "verre", "fourchette", "couteau", "cuillère", "casserole", "poêle", "four", "frigo", "bouilloire"],
  ["douche", "baignoire", "savon", "serviette", "shampooing", "peigne", "rasoir", "éponge", "brosse", "miroir"],
  ["voiture", "camion", "bus", "moto", "vélo", "trottinette", "tracteur", "ambulance", "taxi", "caravane"],
  ["avion", "hélicoptère", "fusée", "montgolfière", "parachute", "drone", "planeur", "satellite", "navette", "deltaplane"],
  ["voilier", "yacht", "ferry", "péniche", "sous-marin", "canoë", "radeau", "pédalo", "barque", "gondole"],
  ["montagne", "volcan", "falaise", "canyon", "dune", "grotte", "île", "plage", "désert", "forêt"],
  ["arrosoir", "râteau", "pelle", "brouette", "tondeuse", "sécateur", "tuyau", "graine", "pot", "engrais"],
  ["pluie", "neige", "vent", "orage", "brouillard", "arc-en-ciel", "nuage", "soleil", "grêle", "gel"],
  ["chêne", "sapin", "palmier", "cactus", "rose", "tulipe", "marguerite", "bambou", "lierre", "herbe"],
  ["football", "rugby", "basketball", "volley", "handball", "hockey", "tennis", "badminton", "ping-pong", "pétanque"],
  ["natation", "course", "saut", "escalade", "ski", "surf", "boxe", "judo", "danse", "yoga"],
  ["échecs", "dames", "cartes", "dés", "dominos", "scrabble", "monopoly", "puzzle", "loto", "billard"],
  ["ballon", "raquette", "filet", "panier", "but", "sifflet", "chronomètre", "médaille", "trophée", "casque"],
  ["médecin", "infirmier", "dentiste", "pharmacien", "vétérinaire", "chirurgien", "ambulancier", "opticien", "psychologue", "kiné"],
  ["boulanger", "boucher", "pêcheur", "agriculteur", "cuisinier", "serveur", "barman", "berger", "chocolatier", "fromager"],
  ["pompier", "policier", "militaire", "juge", "avocat", "facteur", "éboueur", "pilote", "marin", "douanier"],
  ["architecte", "ingénieur", "plombier", "électricien", "maçon", "peintre", "photographe", "journaliste", "acteur", "chanteur"],
  ["piano", "guitare", "violon", "batterie", "saxophone", "trompette", "flûte", "harpe", "accordéon", "tambour"],
  ["rock", "jazz", "rap", "pop", "classique", "metal", "reggae", "techno", "country", "opéra"],
  ["cinéma", "théâtre", "concert", "cirque", "musée", "festival", "karaoké", "bal", "parade", "magie"],
  ["dessin", "peinture", "sculpture", "photo", "tricot", "poterie", "origami", "collage", "gravure", "mosaïque"],
  ["stylo", "crayon", "gomme", "règle", "cahier", "classeur", "ciseaux", "colle", "agrafeuse", "calculatrice"],
  ["maths", "français", "histoire", "géographie", "physique", "chimie", "biologie", "anglais", "sport", "musique"],
  ["boulangerie", "pharmacie", "librairie", "coiffeur", "banque", "supermarché", "fleuriste", "restaurant", "poste", "bijouterie"],
  ["château", "cathédrale", "phare", "pont", "tour", "statue", "fontaine", "ruine", "temple", "arène"],
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
