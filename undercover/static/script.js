/**
 * Undercover — pilotage de l'interface.
 *
 * Le serveur détient les rôles et les mots ; cette page ne fait que les
 * demander au moment de les afficher. Les noms saisis par les joueurs ne
 * sont jamais injectés en HTML (textContent uniquement) : un joueur qui
 * s'appelle `<img onerror=...>` ne casse rien.
 */

const MAX_PLAYERS = 20;

const state = {
  minPlayers: Number(document.body.dataset.minPlayers) || 4,
  numPlayers: 4,
  undercover: 1,
  mrWhite: 0,
  maxSpecial: 1,
  names: [],
  revealIndex: 0,
};

const el = (id) => document.getElementById(id);

/* ---------------------------------------------------------------- réseau */

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Le serveur a renvoyé une erreur.');
  }
  return data;
}

/* --------------------------------------------------------- notifications */

function notify(message, type = 'info') {
  const node = document.createElement('div');
  node.className = `notification ${type}`;
  node.textContent = message;
  document.body.appendChild(node);

  setTimeout(() => {
    node.classList.add('fade-out');
    node.addEventListener('transitionend', () => node.remove(), { once: true });
    setTimeout(() => node.remove(), 500);
  }, 3000);
}

function showScreen(id) {
  ['setup-screen', 'reveal-screen', 'game-screen'].forEach((screen) => {
    el(screen).hidden = screen !== id;
  });
}

/* ------------------------------------------------------------ écran 1 */

function renderNameInputs() {
  const container = el('player-names');
  const typed = [...container.querySelectorAll('input')].map((input) => input.value);

  container.replaceChildren();
  for (let i = 0; i < state.numPlayers; i += 1) {
    const row = document.createElement('div');
    row.className = 'player-input';

    const icon = document.createElement('i');
    icon.className = 'fas fa-user';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-control';
    input.placeholder = `Joueur ${i + 1}`;
    input.value = typed[i] ?? ''; // on ne perd pas les noms déjà saisis

    row.append(icon, input);
    container.appendChild(row);
  }
}

async function refreshRules() {
  try {
    const { maxSpecialRoles } = await api(`/api/rules?players=${state.numPlayers}`);
    state.maxSpecial = maxSpecialRoles;
  } catch (error) {
    notify(error.message, 'error');
    return;
  }

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
    if (next < state.minPlayers || next > MAX_PLAYERS) return;
    state.numPlayers = next;
    el('num-players').value = next;
    renderNameInputs();
    refreshRules();
    return;
  }

  const key = target === 'num-undercover' ? 'undercover' : 'mrWhite';
  const next = state[key] + delta;
  if (next < 0) return;
  if (delta > 0 && state.undercover + state.mrWhite >= state.maxSpecial) {
    notify(`Maximum ${state.maxSpecial} rôle(s) spécial(aux) à ${state.numPlayers} joueurs.`, 'warning');
    return;
  }
  state[key] = next;
  el(target).value = next;
}

function collectNames() {
  const names = [...el('player-names').querySelectorAll('input')].map((i) => i.value.trim());

  if (names.some((name) => !name)) {
    throw new Error('Tous les joueurs doivent avoir un nom.');
  }
  if (new Set(names).size !== names.length) {
    throw new Error('Deux joueurs ne peuvent pas porter le même nom.');
  }
  return names;
}

async function startGame() {
  let names;
  try {
    names = collectNames();
  } catch (error) {
    notify(error.message, 'error');
    return;
  }

  try {
    const game = await api('/api/game', {
      method: 'POST',
      body: JSON.stringify({
        players: names,
        undercover: state.undercover,
        mrWhite: state.mrWhite,
      }),
    });

    state.names = game.players;
    state.revealIndex = 0;
    showScreen('reveal-screen');
    showTurn();
  } catch (error) {
    notify(error.message, 'error');
  }
}

/* ------------------------------------------------------------ écran 2 */

function showTurn() {
  el('current-player').textContent = state.names[state.revealIndex];
  el('word-card').hidden = true;
  el('show-word').hidden = false;
  el('next-player').hidden = true;
}

async function showWord() {
  const player = state.names[state.revealIndex];
  try {
    const { word, isMrWhite } = await api('/api/word', {
      method: 'POST',
      body: JSON.stringify({ player }),
    });

    el('word-content').textContent = isMrWhite ? 'Mr. White' : word;
    el('word-hint').textContent = isMrWhite
      ? "Vous n'avez aucun mot : écoutez, et faites semblant."
      : 'Mémorisez-le, puis passez au joueur suivant.';
    el('word-card').hidden = false;
    el('show-word').hidden = true;

    const isLast = state.revealIndex === state.names.length - 1;
    el('next-label').textContent = isLast ? 'Commencer le débat' : 'Suivant';
    el('next-player').hidden = false;
  } catch (error) {
    notify(error.message, 'error');
  }
}

function nextPlayer() {
  state.revealIndex += 1;
  if (state.revealIndex < state.names.length) {
    showTurn();
    return;
  }
  showScreen('game-screen');
  refreshState();
}

/* ------------------------------------------------------------ écran 3 */

function playerRow(name, { eliminated = false, onEliminate = null } = {}) {
  const row = document.createElement('div');
  row.className = eliminated ? 'player-item eliminated' : 'player-item';

  const icon = document.createElement('i');
  icon.className = eliminated ? 'fas fa-user-slash' : 'fas fa-user';

  const label = document.createElement('span');
  label.textContent = name;

  row.append(icon, label);

  if (onEliminate) {
    const button = document.createElement('button');
    button.className = 'vote-button';
    button.textContent = 'Éliminer';
    button.addEventListener('click', () => onEliminate(name));
    row.appendChild(button);
  }
  return row;
}

function render(gameState) {
  const over = gameState.gameOver;

  const active = el('active-list');
  active.replaceChildren();
  gameState.active.forEach((name) => {
    active.appendChild(playerRow(name, { onEliminate: over ? null : eliminate }));
  });

  const eliminated = el('eliminated-list');
  eliminated.replaceChildren();
  gameState.eliminated.forEach((name) => {
    eliminated.appendChild(playerRow(name, { eliminated: true }));
  });
  el('eliminated-card').hidden = gameState.eliminated.length === 0;

  const banner = el('winner-banner');
  banner.hidden = !over;
  if (over) {
    banner.textContent = gameState.message;
    showReveal();
  }
}

async function refreshState() {
  try {
    render(await api('/api/state'));
  } catch (error) {
    notify(error.message, 'error');
  }
}

async function eliminate(name) {
  try {
    const result = await api('/api/eliminate', {
      method: 'POST',
      body: JSON.stringify({ player: name }),
    });
    render(result);
    if (!result.gameOver) {
      notify(`${result.player} était ${result.role}.`, 'info');
    }
  } catch (error) {
    notify(error.message, 'error');
  }
}

async function showReveal() {
  try {
    const players = await api('/api/reveal');
    const list = el('reveal-list');
    list.replaceChildren();

    players.forEach((player) => {
      const row = document.createElement('div');
      row.className = player.eliminated ? 'word-item eliminated' : 'word-item';

      const name = document.createElement('span');
      name.textContent = player.name;

      const detail = document.createElement('span');
      detail.textContent = `${player.role} — ${player.word ?? 'aucun mot'}`;

      row.append(name, detail);
      list.appendChild(row);
    });

    el('reveal-card').hidden = false;
  } catch (error) {
    notify(error.message, 'error');
  }
}

/* -------------------------------------------------------------- câblage */

document.querySelectorAll('.btn-number').forEach((button) => {
  button.addEventListener('click', () =>
    step(button.dataset.target, Number(button.dataset.step)),
  );
});

el('start-game').addEventListener('click', startGame);
el('show-word').addEventListener('click', showWord);
el('next-player').addEventListener('click', nextPlayer);
el('new-game').addEventListener('click', () => window.location.reload());

renderNameInputs();
refreshRules();
