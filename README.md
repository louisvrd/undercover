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

## Le dictionnaire

**257 paires écrites à la main**, 514 mots dont aucun ne se répète,
réparties en 11 thèmes.

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
6. **Que des mots connus.** Un joueur qui reçoit « caracal » ne joue pas,
   il se tait.

L'**ordre de la paire est tiré au sort** à chaque partie : sans cela, le
mot de la majorité serait toujours le premier écrit dans la liste, et un
joueur qui la connaît saurait immédiatement dans quel camp il est.

```bash
python tools/audit_words.py
```

L'audit sort les paires en double, les mots réutilisés, les mots composés
et les paires proches. Il mesure la **forme** des mots, pas leur sens :
« grêle / gel » y remonte alors que les deux se décrivent très
différemment. À lire comme une liste de points à inspecter, pas comme un
verdict.

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
python -m pytest                              # 35 tests Python
node --test tests/core.test.js                # 28 tests JavaScript
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
  camera.js           capture via getUserMedia
  style.css
  manifest.webmanifest
  sw.js               cache hors-ligne
  icons/
undercover/           version console Python
  core.py             règles, aucune I/O
  words.py            257 paires, 11 thèmes
  cli.py              terminal            -> core.py
tests/
  test_core.py        35 tests Python
  core.test.js        28 tests JavaScript, les mêmes cas
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
