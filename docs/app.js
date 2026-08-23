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

const MAX_PLAYERS = 20;
const SAVE_KEY = 'undercover:save';

const el = (id) => document.getElementById(id);

const state = {
  numPlayers: 4,
  undercover: 1,
  mrWhite: 0,
  maxSpecial: maxSpecialRoles(4),
  revealIndex: 0,
  draftPhotos: [], // par ligne de saisie, avant que le nom soit définitif
  photos: {}, // par nom, une fois la partie lancée
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

/** Redessine la pastille d'une ligne selon sa photo brouillon. */
function refreshRowAvatar(row, index) {
  const button = row.querySelector('.avatar-button');
  const photo = state.draftPhotos[index] ?? null;
  const name = row.querySelector('input[type="text"]').value.trim();

  button.replaceChildren(avatarElement(name || '?', photo, 'avatar-sm'));
  button.setAttribute(
    'aria-label',
    photo ? `Changer la photo de ${name || `joueur ${index + 1}`}`
          : `Ajouter une photo pour ${name || `joueur ${index + 1}`}`,
  );
  row.querySelector('.avatar-clear').hidden = !photo;
}

async function pickPhoto(row, index, file) {
  if (!file) return;
  try {
    state.draftPhotos[index] = await fileToAvatar(file);
    refreshRowAvatar(row, index);
  } catch (error) {
    notify(error.message, 'error');
  }
}

/* ---------------------------------------------------------------- caméra */

const camera = new Camera();
let cameraTarget = null; // { row, index } de la ligne en cours de photo

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

async function openCamera(row, index, name) {
  cameraTarget = { row, index };
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
  const { row, index } = cameraTarget;
  try {
    state.draftPhotos[index] = camera.grab();
  } catch (error) {
    cameraError(error.message);
    return;
  }
  closeCamera();
  refreshRowAvatar(row, index);
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

  const { row, index } = cameraTarget;
  closeCamera();
  await pickPhoto(row, index, file);
});

function buildPlayerRow(index, value) {
  const row = document.createElement('div');
  row.className = 'player-input';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'avatar-button';
  button.addEventListener('click', () =>
    openCamera(row, index, row.querySelector('input[type="text"]').value.trim()),
  );

  const name = document.createElement('input');
  name.type = 'text';
  name.className = 'form-control';
  name.placeholder = `Joueur ${index + 1}`;
  name.autocomplete = 'off';
  name.value = value;

  // Un joueur qui revient retrouve sa photo dès que son nom est écrit.
  name.addEventListener('change', () => {
    const known = state.photos[name.value.trim()];
    if (known && !state.draftPhotos[index]) state.draftPhotos[index] = known;
    refreshRowAvatar(row, index);
  });

  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'avatar-clear';
  clear.textContent = '×';
  clear.hidden = true;
  clear.setAttribute('aria-label', 'Retirer la photo');
  clear.addEventListener('click', () => {
    const who = name.value.trim();
    state.draftPhotos[index] = null;
    if (who) removePhoto(who);
    refreshRowAvatar(row, index);
  });

  row.append(button, name, clear);
  refreshRowAvatar(row, index);
  return row;
}

function renderNameInputs() {
  const container = el('player-names');
  const typed = nameInputs().map((input) => input.value);

  container.replaceChildren();
  for (let i = 0; i < state.numPlayers; i += 1) {
    container.appendChild(buildPlayerRow(i, typed[i] ?? ''));
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

  state.revealIndex = 0;
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
    const button = document.createElement('button');
    button.className = 'vote-button';
    button.textContent = 'Éliminer';
    button.addEventListener('click', () => onEliminate(name));
    row.appendChild(button);
  }
  return row;
}

function render() {
  const over = game.isOver;

  const active = el('active-list');
  active.replaceChildren();
  game.activePlayers.forEach((name) => {
    active.appendChild(playerRow(name, { onEliminate: over ? null : eliminate }));
  });

  const eliminated = el('eliminated-list');
  eliminated.replaceChildren();
  game.eliminatedPlayers.forEach((name) => {
    eliminated.appendChild(playerRow(name, { eliminated: true }));
  });
  el('eliminated-card').hidden = game.eliminatedPlayers.length === 0;

  const banner = el('winner-banner');
  banner.hidden = !over;
  if (over) {
    banner.textContent = game.winnerMessage;
    showReveal();
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
  } else {
    save('play');
    notify(`${result.player} était ${ROLE_LABELS[result.role]}.`, 'info');
  }
  render();
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

el('start-game').addEventListener('click', startGame);
el('show-word').addEventListener('click', showWord);
el('next-player').addEventListener('click', nextPlayer);
el('new-game').addEventListener('click', () => {
  clearSave();
  window.location.reload();
});

state.photos = loadPhotos();
renderNameInputs();
refreshRules();
setupInstallHint();
resume();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // Sans service worker le jeu marche encore, il ne sera juste pas
      // disponible hors-ligne.
    });
  });
}
