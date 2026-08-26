/**
 * Undercover — interface de la PWA.
 *
 * Tout tourne dans le navigateur : aucune requête réseau une fois la
 * page chargée. Les règles vivent dans core.js, cette couche ne fait que
 * les afficher.
 *
 * Déroulé : on choisit un effectif, le moteur pose les rôles sur des
 * cartes anonymes, puis chacun prend la carte qu'il veut. Le hasard vient
 * donc de la table, pas de l'application.
 *
 * Les noms saisis ne sont jamais injectés en HTML (textContent partout).
 */

import { Game, MIN_PLAYERS, ROLE_LABELS, maxSpecialRoles } from './core.js';
import { avatarElement, fileToAvatar, loadPhotos, setPhoto } from './photos.js';
import { Camera, isCameraSupported } from './camera.js';

// Doit rester identique à CACHE_VERSION dans sw.js — affiché en bas de
// l'écran de configuration pour savoir d'un coup d'œil quelle version
// tourne réellement sur un téléphone.
const APP_VERSION = 'v11';

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
  photos: {},
  roster: [], // prénoms mémorisés des parties précédentes
  queue: [], // qui doit piocher, dans l'ordre — vide au tout premier tour
  queueIndex: 0,
  pendingCard: null, // carte en attente d'un nom
  draftPhoto: null, // photo prise dans la feuille de profil
};

let game = null;

/* ------------------------------------------------------------ stockage */

function readJSON(key) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // mode privé, quota plein
  }
}

function save(phase) {
  writeJSON(SAVE_KEY, {
    game: game.toJSON(),
    phase,
    queue: state.queue,
    queueIndex: state.queueIndex,
  });
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
  state.roster = names;
  writeJSON(ROSTER_KEY, { names, undercover: state.undercover, mrWhite: state.mrWhite });
}

function applyRoster() {
  const roster = readJSON(ROSTER_KEY);
  if (!roster || !Array.isArray(roster.names)) return;

  const names = roster.names.filter((n) => typeof n === 'string' && n.trim());
  state.roster = names.slice(0, MAX_PLAYERS);

  if (names.length >= MIN_PLAYERS) {
    state.numPlayers = Math.min(names.length, MAX_PLAYERS);
    el('num-players').value = state.numPlayers;
  }
  if (Number.isInteger(roster.undercover)) state.undercover = roster.undercover;
  if (Number.isInteger(roster.mrWhite)) state.mrWhite = roster.mrWhite;
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
  ['setup-screen', 'board-screen', 'game-screen'].forEach((screen) => {
    el(screen).hidden = screen !== id;
  });
  window.scrollTo(0, 0);
}

function shuffled(items, random = Math.random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/* --------------------------------------------------------------- écran 1 */

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

  const known = state.roster.length;
  const hint = el('roster-hint');
  hint.hidden = known < MIN_PLAYERS;
  hint.textContent =
    known >= state.numPlayers
      ? `${known} profils mémorisés : l'app annoncera qui pioche.`
      : `${known} profils mémorisés — les ${state.numPlayers - known} autres créeront le leur.`;
}

function step(target, delta) {
  if (target === 'num-players') {
    const next = state.numPlayers + delta;
    if (next < MIN_PLAYERS || next > MAX_PLAYERS) return;
    state.numPlayers = next;
    el('num-players').value = next;
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
  try {
    game = new Game(state.numPlayers, state.undercover, state.mrWhite);
  } catch (error) {
    notify(error.message, 'error');
    return;
  }

  // Assez de profils connus : l'app annonce qui pioche, dans un ordre
  // tiré au sort. Sinon chacun crée le sien en prenant sa carte.
  state.queue =
    state.roster.length >= state.numPlayers
      ? shuffled(state.roster).slice(0, state.numPlayers)
      : [];
  state.queueIndex = 0;

  haptic(25);
  showScreen('board-screen');
  renderBoard();
  save('board');
}

/* --------------------------------------------------------------- écran 2 */

/** Le prénom attendu pour la prochaine carte, ou null si création libre. */
function expectedName() {
  return state.queue[state.queueIndex] ?? null;
}

function renderBoard() {
  const owners = game.owners;
  const grid = el('board-cards');
  grid.replaceChildren();

  owners.forEach((owner, index) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = owner ? 'board-card taken' : 'board-card';

    if (owner) {
      card.appendChild(avatarElement(owner, state.photos[owner], 'avatar-sm'));
      const label = document.createElement('span');
      label.textContent = owner;
      card.appendChild(label);
      card.disabled = true;
    } else {
      const back = document.createElement('span');
      back.className = 'board-card-back';
      back.textContent = '?';
      card.appendChild(back);
      card.addEventListener('click', () => pickCard(index));
    }
    grid.appendChild(card);
  });
  stagger(grid);

  const done = game.allClaimed;
  const who = expectedName();

  el('board-turn').textContent = done
    ? 'Toutes les cartes sont prises.'
    : who
      ? `${who}, choisis une carte`
      : 'Prenez une carte chacun votre tour';
  el('board-hint').hidden = done;
  el('board-hint').textContent = who
    ? 'Le rôle dépend de la carte, pas de toi.'
    : 'Tu créeras ton profil juste après.';

  el('board-done').hidden = !done;
  if (done) el('first-speaker').textContent = game.firstSpeaker;
}

function pickCard(index) {
  state.pendingCard = index;
  const who = expectedName();

  if (who) {
    claimCard(index, who); // profil déjà connu : on prend directement
    return;
  }
  openProfileSheet();
}

function claimCard(index, name) {
  let result;
  try {
    result = game.claim(index, name);
  } catch (error) {
    notify(error.message, 'error');
    return;
  }

  if (state.draftPhoto) {
    setPhoto(name, state.draftPhoto);
    state.photos = loadPhotos();
    state.draftPhoto = null;
  }

  state.pendingCard = null;
  state.queueIndex += 1;
  closeProfileSheet();
  showWord(name, result.word);

  renderBoard();
  save(game.allClaimed ? 'board-done' : 'board');
}

/* -- feuille de création de profil -- */

function refreshProfilePhoto() {
  const name = el('profile-name').value.trim();
  el('profile-photo').replaceChildren(
    avatarElement(name || '?', state.draftPhoto, 'avatar-lg'),
  );
}

function openProfileSheet() {
  state.draftPhoto = null;
  el('profile-name').value = '';
  el('profile-error').hidden = true;
  refreshProfilePhoto();
  el('profile-modal').hidden = false;
  el('profile-name').focus();
}

function closeProfileSheet() {
  el('profile-modal').hidden = true;
}

function confirmProfile() {
  const name = el('profile-name').value.trim();
  const error = el('profile-error');

  if (!name) {
    error.textContent = 'Il faut un prénom.';
    error.hidden = false;
    return;
  }
  if (game.names.includes(name)) {
    error.textContent = `${name} a déjà pris une carte.`;
    error.hidden = false;
    return;
  }
  claimCard(state.pendingCard, name);
}

function cancelProfile() {
  state.pendingCard = null;
  state.draftPhoto = null;
  closeProfileSheet();
}

/* -- le mot que porte la carte -- */

function showWord(name, word) {
  el('word-owner').textContent = name;
  el('word-content').textContent = word ?? 'Mr. White';
  el('word-hint').textContent =
    word === null
      ? "Tu n'as aucun mot : écoute, et fais semblant."
      : 'Mémorise-le, puis passe le téléphone.';
  el('word-modal').hidden = false;
  haptic(word === null ? [15, 40, 15] : 15);
}

function closeWord() {
  el('word-modal').hidden = true;
}

function goToDebate() {
  saveRoster(game.names);
  showScreen('game-screen');
  render();
  save('play');
  haptic(25);
}

/* --------------------------------------------------------------- écran 3 */

/** Décale l'apparition des lignes pour qu'elles arrivent en cascade. */
function stagger(container) {
  [...container.children].forEach((child, i) => {
    child.style.animationDelay = `${Math.min(i, 8) * 45}ms`;
  });
}

function playerRow(name, { eliminated = false, onEliminate = null } = {}) {
  const row = document.createElement('div');
  row.className = eliminated ? 'player-item eliminated' : 'player-item';
  row.appendChild(avatarElement(name, state.photos[name], 'avatar-sm'));

  const label = document.createElement('span');
  label.textContent = name;
  row.appendChild(label);

  if (onEliminate) row.appendChild(eliminateButton(name, onEliminate));
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

  // Un Mr. White démasqué garde une main à jouer : rien n'est tranché
  // tant qu'il n'a pas proposé son mot.
  if (result.awaitingGuess) {
    save('guess');
    notify(`${result.player} était ${ROLE_LABELS[result.role]}.`, 'info');
    render();
    openGuess(result.player);
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

/* -- la dernière chance de Mr. White -- */

function openGuess(name) {
  el('guess-who').textContent = name;
  el('guess-input').value = '';
  el('guess-error').hidden = true;
  el('guess-modal').hidden = false;
  el('guess-input').focus();
  haptic([15, 40, 15]);
}

function submitGuess() {
  let result;
  try {
    result = game.guess(el('guess-input').value);
  } catch (error) {
    const box = el('guess-error');
    box.textContent = error.message;
    box.hidden = false;
    return;
  }

  el('guess-modal').hidden = true;

  if (result.correct) {
    notify(`${result.player} a trouvé : « ${result.answer} » !`, 'success');
    haptic([40, 60, 120]);
  } else {
    // Le mot reste secret : l'annoncer alors qu'un Undercover est encore
    // en jeu donnerait la réponse à toute la table. La révélation de fin
    // s'en charge quand la partie s'arrête vraiment.
    notify(`« ${result.word} » : raté.`, 'error');
    haptic(35);
  }

  if (game.isOver) clearSave();
  else save('play');
  render();
}

function cancelGuess() {
  // Sortie de secours d'un tap raté : Mr. White retourne en jeu.
  el('guess-modal').hidden = true;
  undoElimination();
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
    row.classList.add('tappable');
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
  el('peek-title').textContent = name;
  el('peek-word').textContent = game.wordOf(name) ?? 'Mr. White';
  el('peek-list').hidden = true;
  el('peek-card').hidden = false;
  haptic(15);
}

function closePeek() {
  el('peek-modal').hidden = true;
  el('peek-card').hidden = true;
  el('peek-list').hidden = false;
}

/* ---------------------------------------------------------------- caméra */

const camera = new Camera();

// Input photothèque unique, hors des feuilles : un <input type="file">
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

async function openCamera() {
  el('camera-who').textContent = el('profile-name').value.trim() || 'ce joueur';
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
}

function shoot() {
  try {
    state.draftPhoto = camera.grab();
  } catch (error) {
    cameraError(error.message);
    return;
  }
  closeCamera();
  refreshProfilePhoto();
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
  if (!file) return;

  closeCamera();
  try {
    state.draftPhoto = await fileToAvatar(file);
    refreshProfilePhoto();
  } catch (error) {
    notify(error.message, 'error');
  }
});

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
  const saved = readJSON(SAVE_KEY);
  const restored = saved && Game.restore(saved.game);
  if (!restored) return false;

  game = restored;
  state.queue = Array.isArray(saved.queue) ? saved.queue : [];
  state.queueIndex = saved.queueIndex ?? 0;

  if (saved.phase === 'play' || saved.phase === 'guess') {
    showScreen('game-screen');
    render();
    // Le téléphone a pu se verrouiller pendant que Mr. White réfléchit :
    // on lui rend la main là où il l'avait laissée.
    if (game.awaitingGuess) openGuess(game.awaitingGuess);
  } else {
    showScreen('board-screen');
    renderBoard();
  }
  notify('Partie en cours reprise.', 'info');
  return true;
}

document.querySelectorAll('.btn-number').forEach((button) => {
  button.addEventListener('click', () =>
    step(button.dataset.target, Number(button.dataset.step)),
  );
});

el('start-game').addEventListener('click', startGame);
el('go-debate').addEventListener('click', goToDebate);

el('profile-photo').addEventListener('click', openCamera);
el('profile-name').addEventListener('input', refreshProfilePhoto);
el('profile-confirm').addEventListener('click', confirmProfile);
el('profile-cancel').addEventListener('click', cancelProfile);
el('profile-name').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') confirmProfile();
});

el('word-done').addEventListener('click', closeWord);
el('peek-open').addEventListener('click', openPeek);
el('peek-close').addEventListener('click', closePeek);
el('undo-elimination').addEventListener('click', undoElimination);

el('guess-confirm').addEventListener('click', submitGuess);
el('guess-cancel').addEventListener('click', cancelGuess);
el('guess-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submitGuess();
});

el('camera-shoot').addEventListener('click', shoot);
el('camera-cancel').addEventListener('click', closeCamera);
el('camera-flip').addEventListener('click', flipCamera);
el('camera-gallery').addEventListener('click', () => galleryInput.click());
document.body.appendChild(galleryInput);

el('new-game').addEventListener('click', () => {
  clearSave();
  window.location.reload();
});

// Passage en arrière-plan : on relâche la caméra plutôt que de la garder
// ouverte pour rien.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && camera.isRunning) closeCamera();
});

el('app-version').textContent = APP_VERSION;

state.photos = loadPhotos();
applyRoster();
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
