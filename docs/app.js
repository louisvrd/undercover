/**
 * Undercover — interface de la PWA.
 *
 * Tout tourne dans le navigateur : aucune requête réseau une fois la
 * page chargée. Les règles vivent dans core.js, cette couche ne fait que
 * les afficher.
 *
 * Les noms saisis ne sont jamais injectés en HTML (textContent partout).
 */

import { Game, MIN_PLAYERS, ROLE_LABELS, maxSpecialRoles } from './core.js';
import { avatarElement, fileToAvatar, loadPhotos, removePhoto, setPhoto } from './photos.js';
import { Camera, isCameraSupported } from './camera.js';

// Doit rester identique à CACHE_VERSION dans sw.js — affiché en bas de
// l'écran de configuration pour savoir d'un coup d'œil quelle version
// tourne réellement sur un téléphone.
const APP_VERSION = 'v8';

const MAX_PLAYERS = 20;
const SAVE_KEY = 'undercover:save';
const ROSTER_KEY = 'undercover:roster';
const CONFIRM_MS = 3000;

const el = (id) => document.getElementById(id);

const state = {
  numPlayers: 4,
  undercover: 1,
  mrWhite: 0,
  maxSpecial: maxSpecialRoles(4),
  revealIndex: 0,
  draftPhotos: [], // par ligne de saisie, avant que le nom soit définitif
  photos: {}, // par nom, une fois la partie lancée
  pendingNames: [], // composition mémorisée de la partie précédente
};

let game = null;

/* ------------------------------------------------------------ sauvegarde */

function save(phase) {
  try {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ game: game.toJSON(), phase, revealIndex: state.revealIndex }),
    );
  } catch {
    // Mode privé, quota plein… : la partie continue, elle ne survivra
    // simplement pas à un rechargement.
  }
}

function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* rien à faire */
  }
}

/** Retient la composition du groupe pour la prochaine partie. */
function saveRoster(names) {
  try {
    localStorage.setItem(
      ROSTER_KEY,
      JSON.stringify({ names, undercover: state.undercover, mrWhite: state.mrWhite }),
    );
  } catch {
    /* pas grave : il faudra retaper les noms */
  }
}

function applyRoster() {
  let roster;
  try {
    roster = JSON.parse(localStorage.getItem(ROSTER_KEY) ?? 'null');
  } catch {
    return;
  }
  if (!roster || !Array.isArray(roster.names) || roster.names.length < MIN_PLAYERS) return;

  const names = roster.names.filter((n) => typeof n === 'string').slice(0, MAX_PLAYERS);
  if (names.length < MIN_PLAYERS) return;

  state.numPlayers = names.length;
  state.undercover = Number.isInteger(roster.undercover) ? roster.undercover : state.undercover;
  state.mrWhite = Number.isInteger(roster.mrWhite) ? roster.mrWhite : state.mrWhite;
  state.pendingNames = names;

  // Les habitués retrouvent leur photo en même temps que leur nom.
  names.forEach((name, i) => {
    if (state.photos[name]) state.draftPhotos[i] = state.photos[name];
  });
  el('num-players').value = state.numPlayers;
}

/* -------------------------------------------------------------- haptique */

/** Vibration courte. Sans effet sur iOS, qui n'expose pas l'API. */
function haptic(pattern) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* certains navigateurs lèvent au lieu d'ignorer */
  }
}

function loadSave() {
  let raw;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const data = JSON.parse(raw);
    const restored = Game.restore(data.game);
    if (!restored) return null;
    return { game: restored, phase: data.phase, revealIndex: data.revealIndex ?? 0 };
  } catch {
    return null;
  }
}

/* --------------------------------------------------------- notifications */

function notify(message, type = 'info') {
  const node = document.createElement('div');
  node.className = `notification ${type}`;
  node.textContent = message;
  document.body.appendChild(node);

  setTimeout(() => {
    node.classList.add('fade-out');
    setTimeout(() => node.remove(), 400);
  }, 3000);
}

function showScreen(id) {
  ['setup-screen', 'reveal-screen', 'game-screen'].forEach((screen) => {
    el(screen).hidden = screen !== id;
  });
  window.scrollTo(0, 0);
}

/* --------------------------------------------------------------- écran 1 */

function nameInputs() {
  return [...el('player-names').querySelectorAll('input[type="text"]')];
}

/** Contenu de la carte : la photo en grand, ou l'initiale à défaut. */
function cardFace(name, photo) {
  if (photo) {
    const image = document.createElement('img');
    image.className = 'player-card-img';
    image.src = photo;
    image.alt = ''; // décoratif : le nom est écrit juste en dessous
    return image;
  }

  const placeholder = document.createElement('span');
  placeholder.className = 'player-card-initial';
  placeholder.textContent = name ? [...name][0].toUpperCase() : '+';
  placeholder.setAttribute('aria-hidden', 'true');
  return placeholder;
}

/** Redessine une carte selon sa photo brouillon. */
function refreshCard(card, index) {
  const face = card.querySelector('.player-card-photo');
  const photo = state.draftPhotos[index] ?? null;
  const name = card.querySelector('.player-card-name').value.trim();
  const who = name || `joueur ${index + 1}`;

  face.replaceChildren(cardFace(name, photo));
  face.setAttribute('aria-label', photo ? `Changer la photo de ${who}` : `Ajouter une photo pour ${who}`);
  card.querySelector('.player-card-clear').hidden = !photo;
  card.classList.toggle('has-photo', Boolean(photo));
}

async function pickPhoto(card, index, file) {
  if (!file) return;
  try {
    state.draftPhotos[index] = await fileToAvatar(file);
    refreshCard(card, index);
  } catch (error) {
    notify(error.message, 'error');
  }
}

/* ---------------------------------------------------------------- caméra */

const camera = new Camera();
let cameraTarget = null; // { card, index } de la carte en cours de photo

// Input photothèque unique, hors de la modale : un <input type="file">
// visible dans une PWA iOS peut perdre le focus de la page à sa fermeture.
const galleryInput = document.createElement('input');
galleryInput.type = 'file';
galleryInput.accept = 'image/*';
galleryInput.hidden = true;

function cameraError(message) {
  const node = el('camera-error');
  node.textContent = message ?? '';
  node.hidden = !message;
  el('camera-shoot').disabled = Boolean(message);
}

async function openCamera(card, index, name) {
  cameraTarget = { card, index };
  el('camera-who').textContent = name || `joueur ${index + 1}`;
  cameraError(null);
  el('camera-modal').hidden = false;

  if (!isCameraSupported()) {
    cameraError('Caméra indisponible ici — passez par la photothèque.');
    return;
  }
  try {
    await camera.start(el('camera-video'));
  } catch (error) {
    cameraError(error.message);
  }
}

function closeCamera() {
  camera.stop(); // coupe le flux : sans ça le voyant reste allumé
  el('camera-modal').hidden = true;
  cameraTarget = null;
}

function shoot() {
  if (!cameraTarget) return;
  const { card, index } = cameraTarget;
  try {
    state.draftPhotos[index] = camera.grab();
  } catch (error) {
    cameraError(error.message);
    return;
  }
  closeCamera();
  refreshCard(card, index);
  haptic(20);
}

async function flipCamera() {
  cameraError(null);
  try {
    await camera.flip(el('camera-video'));
  } catch (error) {
    cameraError(error.message);
  }
}

galleryInput.addEventListener('change', async () => {
  const file = galleryInput.files[0];
  galleryInput.value = ''; // pour que reprendre la même photo redéclenche 'change'
  if (!file || !cameraTarget) return;

  const { card, index } = cameraTarget;
  closeCamera();
  await pickPhoto(card, index, file);
});

function buildPlayerCard(index, value) {
  const card = document.createElement('div');
  card.className = 'player-card';

  const face = document.createElement('button');
  face.type = 'button';
  face.className = 'player-card-photo';
  face.addEventListener('click', () => openCamera(card, index, name.value.trim()));

  const name = document.createElement('input');
  name.type = 'text';
  name.className = 'player-card-name';
  name.placeholder = `Joueur ${index + 1}`;
  name.autocomplete = 'off';
  name.maxLength = 14; // au-delà, le nom déborde de la carte
  name.value = value;

  // Un joueur qui revient retrouve sa photo dès que son nom est écrit.
  name.addEventListener('change', () => {
    const known = state.photos[name.value.trim()];
    if (known && !state.draftPhotos[index]) state.draftPhotos[index] = known;
    refreshCard(card, index);
  });
  name.addEventListener('input', () => {
    // L'initiale du placeholder suit la frappe tant qu'il n'y a pas de photo.
    if (!state.draftPhotos[index]) refreshCard(card, index);
  });

  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'player-card-clear';
  clear.textContent = '×';
  clear.hidden = true;
  clear.setAttribute('aria-label', 'Retirer la photo');
  clear.addEventListener('click', () => {
    const who = name.value.trim();
    state.draftPhotos[index] = null;
    if (who) removePhoto(who);
    refreshCard(card, index);
  });

  card.append(face, name, clear);
  refreshCard(card, index);
  return card;
}

function renderNameInputs() {
  const container = el('player-names');
  const typed = nameInputs().map((input) => input.value);

  container.replaceChildren();
  for (let i = 0; i < state.numPlayers; i += 1) {
    // Priorité : ce qui est déjà tapé, sinon la composition mémorisée.
    container.appendChild(buildPlayerCard(i, typed[i] ?? state.pendingNames[i] ?? ''));
  }
}

function refreshRules() {
  state.maxSpecial = maxSpecialRoles(state.numPlayers);

  // Les compteurs peuvent devenir illégaux quand on retire des joueurs.
  if (state.undercover + state.mrWhite > state.maxSpecial) {
    state.undercover = Math.min(state.undercover, state.maxSpecial);
    state.mrWhite = Math.max(0, state.maxSpecial - state.undercover);
  }

  el('num-undercover').value = state.undercover;
  el('num-mr-white').value = state.mrWhite;
  el('roles-hint').textContent =
    `À ${state.numPlayers} joueurs : ${state.maxSpecial} rôle(s) spécial(aux) au maximum, ` +
    'pour que les civils restent majoritaires au départ.';
}

function step(target, delta) {
  if (target === 'num-players') {
    const next = state.numPlayers + delta;
    if (next < MIN_PLAYERS || next > MAX_PLAYERS) return;
    if (delta < 0) state.draftPhotos[next] = null; // la ligne disparaît
    state.numPlayers = next;
    el('num-players').value = next;
    renderNameInputs();
    refreshRules();
    return;
  }

  const key = target === 'num-undercover' ? 'undercover' : 'mrWhite';
  if (delta > 0 && state.undercover + state.mrWhite >= state.maxSpecial) {
    notify(`Maximum ${state.maxSpecial} rôle(s) spécial(aux) à ${state.numPlayers} joueurs.`, 'warning');
    return;
  }
  if (state[key] + delta < 0) return;

  state[key] += delta;
  el(target).value = state[key];
}

function startGame() {
  const names = nameInputs().map((i) => i.value.trim());

  if (names.some((name) => !name)) {
    notify('Tous les joueurs doivent avoir un nom.', 'error');
    return;
  }
  if (new Set(names).size !== names.length) {
    notify('Deux joueurs ne peuvent pas porter le même nom.', 'error');
    return;
  }

  try {
    game = new Game(names, state.undercover, state.mrWhite);
  } catch (error) {
    notify(error.message, 'error');
    return;
  }

  // Les photos brouillon prennent enfin le nom définitif de leur joueur.
  let stored = true;
  names.forEach((name, i) => {
    if (state.draftPhotos[i]) stored = setPhoto(name, state.draftPhotos[i]) && stored;
  });
  state.photos = loadPhotos();
  if (!stored) notify('Photos non enregistrées : mémoire du navigateur pleine.', 'warning');
  saveRoster(names);

  state.revealIndex = 0;
  haptic(25);
  save('reveal');
  showScreen('reveal-screen');
  showTurn();
}

/* --------------------------------------------------------------- écran 2 */

function showTurn() {
  const name = game.names[state.revealIndex];

  el('current-avatar').replaceChildren(
    avatarElement(name, state.photos[name], 'avatar-lg'),
  );
  el('current-player').textContent = name;
  el('word-card').hidden = true;
  el('show-word').hidden = false;
  el('next-player').hidden = true;
}

function showWord() {
  const player = game.names[state.revealIndex];
  const word = game.wordOf(player);

  el('word-content').textContent = word ?? 'Mr. White';
  el('word-hint').textContent =
    word === null
      ? "Vous n'avez aucun mot : écoutez, et faites semblant."
      : 'Mémorisez-le, puis passez au joueur suivant.';
  el('word-card').hidden = false;
  el('show-word').hidden = true;

  const isLast = state.revealIndex === game.names.length - 1;
  el('next-label').textContent = isLast ? 'Commencer le débat' : 'Suivant';
  el('next-player').hidden = false;
  haptic(word === null ? [15, 40, 15] : 15); // Mr. White a droit à sa signature
}

function nextPlayer() {
  state.revealIndex += 1;

  if (state.revealIndex < game.names.length) {
    save('reveal');
    showTurn();
    return;
  }
  save('play');
  showScreen('game-screen');
  render();
}

/* --------------------------------------------------------------- écran 3 */

function playerRow(name, { eliminated = false, onEliminate = null } = {}) {
  const row = document.createElement('div');
  row.className = eliminated ? 'player-item eliminated' : 'player-item';
  row.appendChild(avatarElement(name, state.photos[name], 'avatar-sm'));

  const label = document.createElement('span');
  label.textContent = name;
  row.appendChild(label);

  if (onEliminate) {
    row.appendChild(eliminateButton(name, onEliminate));
  }
  return row;
}

/**
 * Bouton d'élimination à deux temps : le premier tap arme, le second
 * valide. Il se désarme seul au bout de CONFIRM_MS, pour qu'un bouton
 * oublié ne piège pas le tap suivant.
 */
function eliminateButton(name, onEliminate) {
  const button = document.createElement('button');
  button.className = 'vote-button';
  button.textContent = 'Éliminer';

  let armed = false;
  let timer = null;

  const disarm = () => {
    armed = false;
    clearTimeout(timer);
    button.classList.remove('confirming');
    button.textContent = 'Éliminer';
  };

  button.addEventListener('click', () => {
    if (!armed) {
      armed = true;
      button.classList.add('confirming');
      button.textContent = 'Confirmer';
      haptic(12);
      timer = setTimeout(disarm, CONFIRM_MS);
      return;
    }
    disarm();
    onEliminate(name);
  });

  return button;
}

/** Décale l'apparition des lignes pour qu'elles arrivent en cascade. */
function stagger(container) {
  [...container.children].forEach((child, i) => {
    child.style.animationDelay = `${Math.min(i, 8) * 45}ms`;
  });
}

function render() {
  const over = game.isOver;

  const active = el('active-list');
  active.replaceChildren();
  game.activePlayers.forEach((name) => {
    active.appendChild(playerRow(name, { onEliminate: over ? null : eliminate }));
  });
  stagger(active);

  const eliminated = el('eliminated-list');
  eliminated.replaceChildren();
  game.eliminatedPlayers.forEach((name) => {
    eliminated.appendChild(playerRow(name, { eliminated: true }));
  });
  stagger(eliminated);

  el('eliminated-card').hidden = game.eliminatedPlayers.length === 0;
  el('undo-elimination').hidden = !game.canUndo;
  el('peek-open').hidden = over; // plus rien à cacher une fois la partie finie

  const banner = el('winner-banner');
  banner.hidden = !over;
  if (over) {
    banner.textContent = game.winnerMessage;
    showReveal();
  } else {
    el('reveal-card').hidden = true; // une annulation peut relancer la partie
  }
}

function eliminate(name) {
  let result;
  try {
    result = game.eliminate(name);
  } catch (error) {
    notify(error.message, 'error');
    return;
  }

  if (result.gameOver) {
    clearSave(); // partie finie : rien à reprendre
    haptic([40, 60, 120]);
  } else {
    save('play');
    notify(`${result.player} était ${ROLE_LABELS[result.role]}.`, 'info');
    haptic(35);
  }
  render();
}

/* ------------------------------------------------- revoir son mot */

/**
 * Un joueur qui a oublié son mot peut le reconsulter en cours de partie.
 *
 * Rien n'empêche de regarder le mot d'un autre : sur un seul téléphone
 * qui circule, ce n'est de toute façon pas défendable. On se contente
 * donc de le rendre pratique, et de rappeler de masquer avant de rendre
 * l'appareil.
 */
function openPeek() {
  const list = el('peek-list');
  list.replaceChildren();

  game.activePlayers.forEach((name) => {
    const row = playerRow(name);
    row.style.cursor = 'pointer';
    row.addEventListener('click', () => showPeekWord(name));
    list.appendChild(row);
  });
  stagger(list);

  el('peek-title').textContent = 'Qui veut revoir son mot ?';
  el('peek-card').hidden = true;
  list.hidden = false;
  el('peek-modal').hidden = false;
}

function showPeekWord(name) {
  const word = game.wordOf(name);

  el('peek-title').textContent = name;
  el('peek-word').textContent = word ?? 'Mr. White';
  el('peek-list').hidden = true;
  el('peek-card').hidden = false;
  haptic(15);
}

function closePeek() {
  el('peek-modal').hidden = true;
  el('peek-card').hidden = true;
  el('peek-list').hidden = false;
}

function undoElimination() {
  let name;
  try {
    name = game.undoLastElimination();
  } catch (error) {
    notify(error.message, 'error');
    return;
  }

  save('play'); // la partie repart, même si elle venait de se terminer
  render();
  notify(`${name} revient en jeu.`, 'success');
  haptic(20);
}

function showReveal() {
  const list = el('reveal-list');
  list.replaceChildren();

  game.players.forEach((player) => {
    const eliminated = game.eliminatedPlayers.includes(player.name);
    const row = document.createElement('div');
    row.className = eliminated ? 'word-item eliminated' : 'word-item';

    const who = document.createElement('div');
    who.className = 'word-item-who';
    who.appendChild(avatarElement(player.name, state.photos[player.name], 'avatar-sm'));

    const name = document.createElement('span');
    name.textContent = player.name;
    who.appendChild(name);

    const detail = document.createElement('span');
    detail.className = 'word-item-detail';
    detail.textContent = `${ROLE_LABELS[player.role]} — ${player.word ?? 'aucun mot'}`;

    row.append(who, detail);
    list.appendChild(row);
  });

  el('reveal-card').hidden = false;
}

/* ------------------------------------------------------------ install PWA */

function setupInstallHint() {
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  if (standalone) return;

  const hint = el('install-hint');
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  if (isIOS) {
    // iOS n'émet jamais beforeinstallprompt : il faut expliquer le geste.
    hint.textContent = "Pour l'installer : bouton Partager, puis « Sur l'écran d'accueil ».";
    hint.hidden = false;
    return;
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    hint.replaceChildren();

    const button = document.createElement('button');
    button.className = 'app-button';
    button.textContent = "Installer l'application";
    button.addEventListener('click', async () => {
      hint.hidden = true;
      event.prompt();
      await event.userChoice;
    });

    hint.appendChild(button);
    hint.hidden = false;
  });
}

/* ------------------------------------------------------------ démarrage */

function resume() {
  const saved = loadSave();
  if (!saved) return false;

  game = saved.game;
  state.revealIndex = Math.min(saved.revealIndex, game.names.length - 1);

  if (saved.phase === 'reveal') {
    showScreen('reveal-screen');
    showTurn();
  } else {
    showScreen('game-screen');
    render();
  }
  notify('Partie en cours reprise.', 'info');
  return true;
}

document.querySelectorAll('.btn-number').forEach((button) => {
  button.addEventListener('click', () =>
    step(button.dataset.target, Number(button.dataset.step)),
  );
});

el('camera-shoot').addEventListener('click', shoot);
el('camera-cancel').addEventListener('click', closeCamera);
el('camera-flip').addEventListener('click', flipCamera);
el('camera-gallery').addEventListener('click', () => galleryInput.click());
document.body.appendChild(galleryInput);

// Passage en arrière-plan : on relâche la caméra plutôt que de la garder
// ouverte pour rien.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && camera.isRunning) closeCamera();
});

el('undo-elimination').addEventListener('click', undoElimination);
el('peek-open').addEventListener('click', openPeek);
el('peek-close').addEventListener('click', closePeek);
el('start-game').addEventListener('click', startGame);
el('show-word').addEventListener('click', showWord);
el('next-player').addEventListener('click', nextPlayer);
el('new-game').addEventListener('click', () => {
  clearSave();
  window.location.reload();
});

el('app-version').textContent = APP_VERSION;

state.photos = loadPhotos();
applyRoster();
renderNameInputs();
refreshRules();
setupInstallHint();
resume();

if ('serviceWorker' in navigator) {
  // Le nouveau service worker prend la main (skipWaiting + clients.claim),
  // mais la page affichée vient encore de l'ancien cache. On la recharge
  // pour éviter le « fermer et rouvrir deux fois » à chaque mise à jour.
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;

    if (game) {
      // Partie en cours : on ne recharge pas sous les doigts des joueurs.
      notify("Mise à jour prête — elle s'appliquera à la prochaine ouverture.", 'info');
      return;
    }
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // Sans service worker le jeu marche encore, il ne sera juste pas
      // disponible hors-ligne.
    });
  });
}
