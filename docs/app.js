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

const MAX_PLAYERS = 20;
const SAVE_KEY = 'undercover:save';

const el = (id) => document.getElementById(id);

const state = {
  numPlayers: 4,
  undercover: 1,
  mrWhite: 0,
  maxSpecial: maxSpecialRoles(4),
  revealIndex: 0,
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

function renderNameInputs() {
  const container = el('player-names');
  const typed = [...container.querySelectorAll('input')].map((input) => input.value);

  container.replaceChildren();
  for (let i = 0; i < state.numPlayers; i += 1) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-control';
    input.placeholder = `Joueur ${i + 1}`;
    input.autocomplete = 'off';
    input.value = typed[i] ?? ''; // on ne perd pas les noms déjà saisis

    const row = document.createElement('div');
    row.className = 'player-input';
    row.appendChild(input);
    container.appendChild(row);
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
  const names = [...el('player-names').querySelectorAll('input')].map((i) => i.value.trim());

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

  state.revealIndex = 0;
  save('reveal');
  showScreen('reveal-screen');
  showTurn();
}

/* --------------------------------------------------------------- écran 2 */

function showTurn() {
  el('current-player').textContent = game.names[state.revealIndex];
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

    const name = document.createElement('span');
    name.textContent = player.name;

    const detail = document.createElement('span');
    detail.textContent = `${ROLE_LABELS[player.role]} — ${player.word ?? 'aucun mot'}`;

    row.append(name, detail);
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

el('start-game').addEventListener('click', startGame);
el('show-word').addEventListener('click', showWord);
el('next-player').addEventListener('click', nextPlayer);
el('new-game').addEventListener('click', () => {
  clearSave();
  window.location.reload();
});

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
