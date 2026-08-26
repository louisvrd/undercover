# Undercover

Le jeu de mots où il faut démasquer les imposteurs. Un seul appareil, qui
passe de main en main.

**→ [louisvrd.github.io/undercover](https://louisvrd.github.io/undercover/)**

Deux façades sur les mêmes règles :

- **`docs/`** — une PWA installable sur iPhone et Android, **sans store**,
  jouable hors-ligne. C'est la version à distribuer.
- **`undercover/`** — la version console Python.

## Règles

Chaque joueur reçoit un mot, sauf Mr. White qui n'en reçoit aucun.

| Rôle | Mot reçu |
| --- | --- |
| Civil | le mot de la majorité |
| Undercover | un mot voisin, tiré du même champ lexical |
| Mr. White | aucun — il doit deviner en écoutant |

À chaque manche, tout le monde décrit son mot en un indice, le groupe
débat, puis l'animateur élimine un joueur. Les civils gagnent quand tous
les imposteurs sont sortis ; les imposteurs gagnent dès qu'ils sont aussi
nombreux que les civils restants.

Le nombre de rôles spéciaux est plafonné à `(joueurs - 1) // 2` pour que
les civils soient strictement majoritaires au coup d'envoi — sinon la
condition de victoire des imposteurs serait déjà remplie au premier tour.

### Le dernier mot de Mr. White

Un Mr. White démasqué n'est pas encore battu : au moment où il sort, il
écrit le mot des civils sur l'app. **S'il trouve, les imposteurs gagnent
sur-le-champ**, quel que soit l'état du tableau.

C'est la seule contrepartie du rôle. Mr. White joue toute la partie sans
mot et n'a qu'une chose à faire : recouper les indices des autres. Sans
cette main finale, être démasqué au premier tour ne lui laisserait rien à
jouer — et il n'aurait aucune raison d'écouter.

Deux conséquences dans le moteur :

- **La partie se suspend.** Tant que la proposition n'est pas jouée,
  `winner` reste `None` et `eliminate()` est refusé. Sortir le dernier
  imposteur ne suffit donc plus à faire gagner les civils : le tableau dit
  « civils », la règle dit « attends ».
- **Le mot ne s'affiche que si la partie s'arrête là.** Une proposition
  ratée alors qu'un Undercover est encore en jeu ne révèle rien —
  l'annoncer donnerait la réponse à toute la table.

La comparaison ignore la casse, les accents et la ponctuation : le mot est
tapé au doigt sur un téléphone, et « Porte-Clés » vaut « porte cles ».
Ce qui reste — les lettres — doit correspondre exactement, parce que c'est
bien le mot qu'il faut deviner et pas une approximation.

Annuler l'élimination annule aussi la proposition : Mr. White revient en
jeu et sa main lui est rendue.

### On tire des cartes, pas des joueurs

Les rôles ne sont pas attribués aux noms saisis : ils sont posés sur des
**cartes anonymes**, que chacun vient revendiquer à son tour. `Game` se
construit avec un *nombre* de joueurs, et `claim(carte, nom)` associe
ensuite une personne à une carte.

Ça ne change rien aux probabilités — mais ça déplace le hasard de
l'application vers la table. Quand l'app annonce « Alice, tu es
Undercover », il faut la croire sur parole ; quand Alice choisit
elle-même la carte 3 parmi celles qui restent, il n'y a plus rien à
croire. C'est aussi ce qui rend le passage du téléphone naturel : l'écran
montre les cartes libres, pas une file de noms à respecter.

Tant que toutes les cartes ne sont pas prises, `winner` vaut `None` et
`eliminate()` est refusé : une partie à moitié distribuée n'est pas une
partie.

### Le tour de parole

**Qui ouvre la première manche** est tiré au sort parmi les cartes qui
**ne sont pas** Mr. White. Le faire ouvrir reviendrait à lui demander
d'inventer un indice sans avoir rien entendu — la place la plus intenable
de la partie, et un Mr. White grillé au premier tour n'a jamais fait une
bonne manche. Le tirage a lieu à la construction, donc `first_speaker`
reste inconnu tant que la carte désignée n'a pas trouvé son joueur.

**L'ordre ensuite suit la création des profils**, pas celui des cartes.
C'est l'ordre dans lequel le téléphone a circulé pendant la distribution —
lui-même une rotation de la liste du groupe, cf. [Les groupes](#les-groupes) —
donc celui que la table a déjà en tête ; l'ordre des cartes, lui, ne veut
rien dire pour les joueurs. `speaking_order` prend cette liste et la
pivote pour commencer par l'orateur de la manche.

**Chaque manche repart après l'éliminé.** Sortir un joueur passe la parole
à celui qui le suit, au lieu de recommencer du même bout de table :

```
tour       Ana → Ben → Cléo → Dan → Eve
Cléo sort  Dan → Eve → Ana → Ben
Ana sort   Ben → Dan → Eve
```

Rien n'est mémorisé pour autant : `first_speaker` se recalcule depuis la
liste des éliminés — c'est le dernier nom sorti qui désigne le suivant.
Annuler une élimination rend donc aussi la parole à qui l'avait, sans
qu'aucun code d'annulation n'ait à s'en occuper.

## Le dictionnaire

**2104 paires écrites à la main**, 2229 mots distincts, réparties en
64 thèmes — plus un thème **exclusif** de 60 paires, éteint par défaut.

Une version précédente tirait deux mots au hasard dans des groupes de
dix. Le problème : sur les 45 combinaisons d'un groupe, certaines étaient
bonnes et d'autres non, sans moyen de trier. « gare » et « piscine »
sont deux lieux de la ville, mais leurs indices n'ont rien en commun et
l'Undercover est grillé au premier tour. Avec des paires explicites,
**chaque tirage est validé**.

Ce qui fait une bonne paire :

1. **Même nature.** Deux fruits, deux métiers, deux instruments.
2. **Une seule différence saillante.** « courgette » et « concombre » se
   ressemblent, mais l'un se cuit et l'autre se croque. C'est cette
   unique différence qui permet de démasquer l'Undercover.
3. **Aucun synonyme.** « développeur » et « programmeur » se décrivent
   identiquement : les civils ne peuvent structurellement pas gagner.
4. **Aucun hyperonyme.** Pas de « chaussure » face à « botte ».
5. **Pas de différence de taille seule.** « lac » et « étang », c'est la
   même chose en plus petit — indécidable en un indice.
6. **Que des mots connus, et un seul mot par carte.** Un joueur qui
   reçoit « caracal » ne joue pas, il se tait. Aucun mot à espace non
   plus : l'indice unique porterait sur deux idées à la fois.
7. **Aucun duo réflexe.** C'est la règle ajoutée en passant à l'échelle,
   et la plus importante pour le plaisir de jeu.

### Le duo réflexe, et pourquoi un mot sert plusieurs fois

« bain » et « douche » vont par deux dans la tête de tout le monde. Celui
qui tire l'un sait aussitôt ce que tient l'autre camp : l'Undercover se
fond sans effort, et les civils n'ont plus rien à démasquer. La paire est
correcte selon les six premières règles, et pourtant elle tue la manche.

Les contraires tombent sous la même règle : « généreux » appelle
« avare » aussi sûrement. Les traits de caractère sont donc **croisés
sans rapport entre eux** — « bavard / gourmand », « têtu / rêveur » —
plutôt qu'opposés deux à deux.

C'est aussi ce qui justifie qu'**un mot serve dans plusieurs paires**,
trois au maximum. « pomme » tombe tantôt avec « poire », tantôt avec
« coing » : le tenir ne renseigne sur rien. Un dictionnaire où chaque mot
n'aurait qu'un seul partenaire est entièrement prévisible dès qu'on le
connaît — défaut supportable à 257 paires, rédhibitoire à 2500. La
répartition actuelle : 2174 mots dans une seule paire, 949 dans deux,
392 dans trois — soit 3515 mots distincts pour 5248 cartes distribuées.

Accessoirement, c'est ce qui rend la taille atteignable. Sans
réutilisation, 2500 paires exigeraient 5000 mots distincts, ce qui force
à descendre dans un vocabulaire que personne ne sait décrire — la règle 6
et la taille demandée se contredisent.

L'**ordre de la paire est tiré au sort** à chaque partie : sans cela, le
mot de la majorité serait toujours le premier écrit dans la liste, et un
joueur qui la connaît saurait immédiatement dans quel camp il est.

```bash
python tools/audit_words.py
```

L'audit échoue sur ce qui est objectivement cassé — paires en double, mot
au-delà de trois paires, mot à espace. Le reste est indicatif : il liste
les paires proches **de forme**, pas de sens. « fraise / framboise » y
remonte alors que les deux se décrivent très bien séparément. À lire
comme une liste de points à inspecter, pas comme un verdict — c'est en la
relisant que sont sortis « toit / toiture » (synonymes) et « ballon /
balle » (différence de taille seule).

### Ce que l'audit ne verra jamais

Les règles 3, 4 et 7 portent sur ce que deux mots **évoquent ensemble**.
Aucune mesure de forme ne les attrape : « bain » et « douche » ne se
ressemblent pas, « or » et « argent » non plus. Elles s'appliquent à la
relecture, thème par thème.

Cette relecture a été faite sur les thèmes et a retiré 583 paires :
59 duos réflexes (`or / argent`, `plafond / plancher`, `clavier / souris`,
`main / pied`), et le reste en synonymes, hyperonymes et différences de
taille. Elle a aussi coûté six thèmes entiers, écrits en cherchant le
volume et remplis de mots que personne ne sait décrire — `cynorhodon`,
`staphylin`, `tombolo`. C'est la règle 6 qui les condamne, et c'est le
risque permanent quand on vise un gros dictionnaire.

Le vocabulaire libéré a été réinvesti en **recombinaisons** : des mots
déjà validés appariés autrement, ce que le plafond de trois paires par
mot autorise. C'est plus sûr que d'aller chercher des mots rares.

### La règle 6 est la plus coûteuse

Une seconde passe, plus large, a retiré **920 paires** de plus. Le motif
est toujours le même : du vocabulaire de métier, correct mais indescriptible
en un indice. `turbot`, `steeple`, `sérac`, `galène`, `poolish`,
`télérupteur`, `corégone`, `mâchicoulis`. Trente-neuf thèmes entiers sont
partis — plomberie, minéraux, couture, fromages, races de chevaux — parce
qu'ils l'étaient d'un bout à l'autre.

C'est le piège permanent d'un gros dictionnaire : chaque famille de mots
paraît inépuisable tant qu'on ne se demande pas si un joueur saurait en
décrire les membres. Un thème sonne riche et n'est qu'un glossaire.

Le compte est donc passé de 2624 à 2104. Il vaut mieux : une paire que
personne ne sait décrire ne fait pas une manche, elle la gâche.

### Le mode Brawl Stars

Une case à cocher sur l'écran de configuration. Cochée, la partie ne tire
plus que des personnages du jeu : `Piper / Brock`, `Barley / Dynamike`,
`Mortis / Crow`. Décochée, ces 60 paires n'existent pas.

Un thème exclusif **remplace** le dictionnaire au lieu de le compléter, et
c'est délibéré. Mélanger `Shelly` à `courgette` laisserait la table sans
repère : personne ne saurait si l'indice qu'il vient d'entendre parle d'un
brawler ou d'un légume, et un joueur qui reçoit un mot du mauvais univers
est démasqué au premier tour sans avoir joué. Le moteur le garantit —
`WORD_PAIRS` exclut les thèmes listés dans `OPTIONAL_THEMES`, et un test
vérifie qu'aucune paire exclusive ne peut tomber dans une partie normale.

Le choix est mémorisé **par groupe**, comme le nombre d'Undercover : la
bande qui joue en mode Brawl Stars le retrouve coché à la partie suivante.

Ajouter un autre thème exclusif ne demande que deux choses : l'écrire dans
`PAIRS_BY_THEME` et le nommer dans `OPTIONAL_THEMES`. Le reste — audit,
génération du JavaScript, console — le prend en compte tout seul. Seule la
case à cocher est câblée en dur dans l'interface.

## Les groupes

L'app s'ouvre sur un **lobby** : la liste des groupes déjà constitués. On
en touche un pour jouer, ou `✎` pour modifier ses profils.

Une fois le groupe choisi, on n'y revient qu'en le demandant. **Nouvelle
partie** relance avec la même bande et repose sur l'écran de
configuration : enchaîner deux manches est le cas courant, et refaire le
tour par la liste des groupes à chaque fois n'apporte rien. La **flèche**
en haut à gauche remonte au lobby quand on veut vraiment changer.

Elle n'apparaît que sur la configuration et l'éditeur de groupe. Sur le
plateau et pendant le débat elle disparaît : une partie y est en cours, et
un doigt posé au mauvais endroit l'effacerait. Depuis l'éditeur, elle
enregistre les retouches avant de sortir — sortir n'est pas annuler.

Un groupe garde ses prénoms et ses photos d'une partie à l'autre, avec son
nombre d'Undercover et de Mr. White. C'est ce qui évite de ressaisir six
prénoms à chaque soirée — et ce qui permet à l'app d'annoncer **qui
pioche**, au lieu de laisser le téléphone tourner au hasard.

La liste du groupe, c'est **le tour de table**. Elle décide qui pioche
après qui, et donc qui parle après qui.

À la première partie d'un groupe neuf, elle se remplit dans l'ordre où les
profils sont créés — `claim_order`, celui du passage du téléphone. Surtout
pas l'ordre des cartes : chacun prend celle qu'il veut, donc `names` est
brassé et ne dit rien de qui a joué après qui.

Ensuite elle ne bouge plus toute seule, et **les flèches de l'éditeur sont
le seul moyen de la corriger**. C'est voulu : l'app ne sait pas comment la
table est assise, et une liste enregistrée de travers ne se répare pas en
jouant — chaque partie ne fait qu'en tirer une rotation, donc le désordre
se reconduit indéfiniment. Il faut pouvoir le dire à la main.

L'ordre de pioche est une **rotation** de cette liste : le premier est
tiré au sort, puis on suit la liste en bouclant. Avec un groupe
`Ana, Ben, Cléo, Dan, Eve`, une partie peut appeler `Ben, Cléo, Dan, Eve,
Ana`. Ce n'est pas un mélange, et c'est délibéré : l'appareil fait le tour
de la table dans un sens, chacun sait qui il doit servir ensuite. Un vrai
mélange obligerait à relire un nom sur l'écran à chaque passage.

C'est aussi ce qui fixe le tour de parole, puisqu'il suit l'ordre de
création des profils : les deux ordres sont la même rotation, seul le
point de départ diffère.

Un groupe neuf part vide, et c'est voulu : on lance la partie tout de
suite, et **chacun crée son profil au moment de prendre sa carte**. Les
prénoms saisis rejoignent le groupe à la fin de la manche. Rien à préparer
avant de jouer ; le groupe se remplit en jouant.

L'éditeur sert ensuite à corriger ce que la première partie a laissé :
changer un prénom, ajouter une photo, retirer quelqu'un qui ne vient plus.
Toucher un joueur rouvre sa fiche.

Deux détails qui se voient à l'usage :

- **La photo suit le prénom.** Renommer « Léa » en « Léna » déplace sa
  vignette, rangée sous son nom. L'ancienne n'est effacée que si plus
  aucun groupe ne s'en sert — le même prénom peut jouer ailleurs.
- **Retirer quelqu'un ne supprime pas sa photo.** Il peut revenir, ou
  figurer dans un autre groupe.

Les téléphones qui tournaient une version d'avant les groupes avaient une
seule liste mémorisée : elle devient automatiquement un groupe nommé
« Mon groupe » au premier lancement.

## Installer sur un téléphone

L'app n'a besoin d'aucun store et d'aucun serveur. Il suffit de publier
le dossier `docs/` sur une URL en **HTTPS** (obligatoire : sans lui, un
navigateur refuse d'installer une PWA et de lancer le service worker).

| | Geste |
| --- | --- |
| **iPhone** | Ouvrir l'URL **dans Safari** (Chrome iOS ne sait pas installer), bouton Partager → « Sur l'écran d'accueil » |
| **Android** | Chrome propose « Installer l'application » — l'app affiche aussi son propre bouton |

Les photos de profil et la composition du groupe restent dans le
stockage du navigateur, sur l'appareil. Rien n'est envoyé nulle part.

La partie en cours y est sauvegardée elle aussi, à chaque étape. Un
téléphone qui passe de main en main finit toujours par se verrouiller ou
par voir son onglet vidé par iOS : au rechargement, `Game.restore()`
remonte la partie — cartes distribuées, éliminations, manche en cours —
et l'app rouvre l'écran où le groupe s'était arrêté. Une sauvegarde
illisible est ignorée plutôt que de faire planter le démarrage.

### Publier une mise à jour

```bash
python tools/gen_words_js.py   # si les mots ont changé
git add -A && git commit -m "..." && git push
```

**Incrémenter `CACHE_VERSION` dans `docs/sw.js` ET `APP_VERSION` dans
`docs/app.js`** — les deux doivent rester identiques, le numéro est
affiché en bas de l'écran de configuration pour savoir d'un coup d'œil ce
qui tourne sur un téléphone.

GitHub Pages sert les fichiers en `max-age=600`. Le service worker
contourne ce cache avec `new Request(url, { cache: 'reload' })` : sans
cela, une version installée juste après un déploiement re-cache les
anciens fichiers sous un nouveau numéro, et le téléphone reste bloqué.

## Développement

```bash
python -m http.server 8000 --directory docs   # http://127.0.0.1:8000
python -m undercover.cli                      # version console
python -m pytest                              # 68 tests Python
node --test tests/core.test.js                # 64 tests JavaScript
```

`localhost` est traité comme un contexte sécurisé : la PWA et son service
worker fonctionnent en local sans HTTPS.

### Fichiers générés — ne pas éditer à la main

```bash
python tools/gen_words_js.py   # docs/words.js  <- undercover/words.py
python tools/gen_icons.py      # docs/icons/*.png
```

## Structure

```
docs/                 la PWA — c'est ce qui est publié
  index.html
  app.js              interface           -> core.js
  core.js             règles, aucune I/O
  words.js            généré depuis words.py
  photos.js           vignettes + stockage local
  groups.js           les groupes de joueurs, mémorisés
  camera.js           capture via getUserMedia
  style.css
  manifest.webmanifest
  sw.js               cache hors-ligne
  icons/
undercover/           version console Python
  core.py             règles, aucune I/O
  words.py            2104 paires, 64 thèmes + 1 exclusif
  cli.py              terminal            -> core.py
tests/
  test_core.py        68 tests Python
  core.test.js        64 tests JavaScript, les mêmes cas
tools/
  gen_words_js.py     words.py  -> words.js
  gen_icons.py        icônes de la PWA
  audit_words.py      audit du dictionnaire
```

### Le moteur existe en deux exemplaires

`core.py` et `core.js` encodent les mêmes règles dans deux langages.
C'est le prix à payer pour une app qui tourne sans serveur tout en
gardant une version console.

Le garde-fou : `tests/core.test.js` rejoue **les mêmes cas** que
`tests/test_core.py` — plafond des rôles, distribution, les deux
conditions de victoire, annulation d'élimination. Si un moteur dérive de
l'autre, une suite casse.

Si tu touches aux règles, modifie les deux fichiers et lance les deux
suites.

### Pourquoi la caméra n'utilise pas `<input type="file">`

Dans une PWA lancée depuis l'écran d'accueil iOS, cet input ouvre
l'appareil photo mais ne reçoit jamais le flux : l'écran reste noir. Le
même code marche dans Safari. `getUserMedia`, autorisé pour les apps de
l'écran d'accueil depuis iOS 14.3, n'a pas ce défaut — d'où `camera.js`.
La photothèque reste accessible via un `<input type="file">` classique,
qui lui n'a jamais été cassé.
