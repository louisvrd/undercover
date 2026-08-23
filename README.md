# Undercover

Le jeu de mots où il faut démasquer les imposteurs. Un seul appareil, qui
passe de main en main.

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

## Installer sur un téléphone

L'app n'a besoin d'aucun store et d'aucun serveur. Il suffit de publier
le dossier `docs/` sur une URL en **HTTPS** (obligatoire : sans lui, un
navigateur refuse d'installer une PWA et de mettre le service worker en
route).

### Publier sur GitHub Pages

```bash
git init
git add .
git commit -m "Undercover"
git branch -M main
git remote add origin https://github.com/<TON-PSEUDO>/undercover.git
git push -u origin main
```

Puis sur GitHub : **Settings → Pages → Source: Deploy from a branch →
Branch `main`, dossier `/docs` → Save**. Au bout d'une minute le jeu est
sur `https://<TON-PSEUDO>.github.io/undercover/`.

En offre gratuite, GitHub Pages exige un dépôt **public**. Pour garder le
code privé, Cloudflare Pages et Netlify acceptent les dépôts privés et
fournissent aussi le HTTPS.

### Ajouter à l'écran d'accueil

| | Geste |
| --- | --- |
| **iPhone** | Ouvrir l'URL **dans Safari** (Chrome iOS ne sait pas installer), bouton Partager → « Sur l'écran d'accueil » |
| **Android** | Chrome propose « Installer l'application » — l'app affiche aussi son propre bouton |

Une fois installée : icône sur l'écran d'accueil, plein écran sans barre
d'adresse, et **jouable en avion**.

### Mettre à jour l'app

Un `git push` suffit — les téléphones récupèrent la nouvelle version tout
seuls. **Mais** il faut incrémenter `CACHE_VERSION` dans `docs/sw.js`,
sinon le service worker continue de servir l'ancienne version depuis son
cache.

## Développement

```bash
npm run serve     # http://127.0.0.1:8000  (python -m http.server sur docs/)
npm test          # tests JavaScript du moteur
python -m pytest  # tests Python du moteur
python -m undercover.cli   # version console
```

`localhost` est traité comme un contexte sécurisé : la PWA et son service
worker fonctionnent en local sans HTTPS.

### Fichiers générés — ne pas éditer à la main

```bash
python tools/gen_words_js.py   # docs/words.js  <- undercover/words.py
python tools/gen_icons.py      # docs/icons/*.png
```

`docs/words.js` est produit depuis `undercover/words.py` : la liste des
mots n'est saisie qu'une fois, les deux versions ne peuvent pas diverger.

## Structure

```
docs/                 la PWA — c'est ce qui est publié
  index.html
  app.js              interface           -> core.js
  core.js             règles, aucune I/O
  words.js            généré depuis words.py
  style.css
  manifest.webmanifest
  sw.js               cache hors-ligne
  icons/
undercover/           version console Python
  core.py             règles, aucune I/O
  words.py            40 groupes de 10 mots, 1800 paires
  cli.py              terminal            -> core.py
tests/
  test_core.py        31 tests Python
  core.test.js        24 tests JavaScript, les mêmes cas
tools/
  gen_words_js.py
  gen_icons.py
```

### Le moteur existe en deux exemplaires

`core.py` et `core.js` encodent les mêmes règles dans deux langages.
C'est le prix à payer pour une app qui tourne sans serveur tout en
gardant une version console.

Le garde-fou : `tests/core.test.js` rejoue **les mêmes cas** que
`tests/test_core.py` — plafond des rôles, distribution, les deux
conditions de victoire, doubles éliminations. Si un moteur dérive de
l'autre, une suite casse.

Si tu touches aux règles, modifie les deux fichiers et lance les deux
suites.
