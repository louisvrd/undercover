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
import { OPTIONAL_THEMES, drawPair } from './words.js';
import { avatarElement, fileToAvatar, loadPhotos, removePhoto, setPhoto } from './photos.js';
import { deleteGroup, emptyGroup, loadGroups, saveGroup } from './groups.js';
import { Camera, isCameraSupported } from './camera.js';

// Doit rester identique à CACHE_VERSION dans sw.js — affiché en bas de
// l'écran de configuration pour savoir d'un coup d'œil quelle version
// tourne réellement sur un téléphone.
const APP_VERSION = 'v17';

const MAX_PLAYERS = 20;
const SAVE_KEY = 'undercover:save';
const CONFIRM_MS = 3000;

const el = (id) => document.getElementById(id);

const state = {
  numPlayers: 4,
  undercover: 1,
  mrWhite: 0,
  brawl: false, // thème exclusif : il remplace tout le dictionnaire
  maxSpecial: maxSpecialRoles(4),
  photos: {},
  groups: [], // tous les groupes connus
  group: null, // le groupe avec lequel on joue
  editing: null, // le groupe ouvert dans l'éditeur
  profile: null, // ce que la feuille de profil est en train de faire
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
    groupId: state.group?.id ?? null,
  });
}

function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* rien à faire */
  }
}

/**
 * Retient la composition du groupe pour la prochaine partie.
 *
 * Les nouveaux venus s'ajoutent à la fin ; les habitués gardent leur
 * place, pour que l'ordre affiché dans l'éditeur reste stable.
 */
function rememberGroup(names) {
  if (!state.group) return;

  const members = [...state.group.members];
  names.forEach((name) => {
    if (!members.includes(name)) members.push(name);
  });

  state.group = {
    ...state.group,
    members,
    undercover: state.undercover,
    mrWhite: state.mrWhite,
    brawl: state.brawl,
  };
  state.groups = saveGroup(state.group);
}

/** Le groupe est choisi : on passe à la configuration de la partie. */
function selectGroup(group) {
  state.group = group;
  state.numPlayers = Math.min(
    MAX_PLAYERS,
    Math.max(MIN_PLAYERS, group.members.length || state.numPlayers),
  );
  state.undercover = group.undercover;
  state.mrWhite = group.mrWhite;
  state.brawl = group.brawl === true;

  el('num-players').value = state.numPlayers;
  el('brawl-mode').checked = state.brawl;
  refreshRules();
  showScreen('setup-screen');
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

const SCREENS = ['lobby-screen', 'group-screen', 'setup-screen', 'board-screen', 'game-screen'];

function showScreen(id) {
  SCREENS.forEach((screen) => {
    el(screen).hidden = screen !== id;
  });
  window.scrollTo(0, 0);
}

/**
 * La liste pivotée à partir d'un point tiré au sort.
 *
 * On ne mélange pas : seul le point de départ est au hasard, l'ordre du
 * groupe est conservé ensuite. Le téléphone fait alors le tour de la
 * table dans un sens, comme au tour de parole — un vrai mélange
 * obligerait à relire un nom à chaque passage.
 */
function rotatedFrom(items, random = Math.random) {
  if (items.length === 0) return [];
  const start = Math.floor(random() * items.length);
  return [...items.slice(start), ...items.slice(0, start)];
}

/* --------------------------------------------------------------- écran 0 */

function renderLobby() {
  state.groups = loadGroups();

  const list = el('lobby-list');
  list.replaceChildren();

  state.groups.forEach((group) => {
    const row = document.createElement('div');
    row.className = 'group-item';

    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'group-main';

    // Un aperçu des visages : on reconnaît sa bande avant de lire le nom.
    const faces = document.createElement('span');
    faces.className = 'avatar-stack';
    group.members
      .slice(0, 4)
      .forEach((name) => faces.appendChild(avatarElement(name, state.photos[name], 'avatar-sm')));
    open.appendChild(faces);

    const text = document.createElement('span');
    text.className = 'group-text';
    const title = document.createElement('span');
    title.className = 'group-name';
    title.textContent = group.name;
    const count = document.createElement('small');
    count.textContent = group.members.length
      ? `${group.members.length} profil${group.members.length > 1 ? 's' : ''}`
      : 'aucun profil pour l’instant';
    text.append(title, count);
    open.appendChild(text);
    open.addEventListener('click', () => selectGroup(group));

    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'group-edit';
    edit.textContent = '✎';
    edit.setAttribute('aria-label', `Modifier ${group.name}`);
    edit.addEventListener('click', () => openGroupEditor(group));

    row.append(open, edit);
    list.appendChild(row);
  });
  stagger(list);

  el('lobby-hint').textContent = state.groups.length
    ? 'Touche un groupe pour jouer, ou ✎ pour modifier ses profils.'
    : 'Crée un groupe pour commencer : les profils se rempliront tout seuls à la première partie.';
}

function backToLobby() {
  state.group = null;
  state.editing = null;
  renderLobby();
  showScreen('lobby-screen');
}

function createGroup() {
  const group = emptyGroup(`Groupe ${state.groups.length + 1}`);
  state.groups = saveGroup(group);
  openGroupEditor(group);
}

/* -- l'éditeur de groupe -- */

function openGroupEditor(group) {
  // On travaille sur une copie : rien n'est écrit avant de quitter l'écran.
  state.editing = { ...group, members: [...group.members] };
  el('group-name').value = state.editing.name;
  disarmDelete();
  renderMembers();
  showScreen('group-screen');
}

function renderMembers() {
  const list = el('group-members');
  list.replaceChildren();

  state.editing.members.forEach((name, index) => {
    const row = playerRow(name);
    row.classList.add('tappable');
    row.addEventListener('click', () => openProfileSheet({ mode: 'edit', index, name }));
    list.appendChild(row);
  });
  stagger(list);

  el('group-members').hidden = state.editing.members.length === 0;
  el('member-add').hidden = state.editing.members.length >= MAX_PLAYERS;
}

/** Écrit le groupe en cours d'édition et renvoie sa version enregistrée. */
function commitGroup() {
  const typed = el('group-name').value.trim();
  state.editing.name = typed || 'Sans nom';
  state.groups = saveGroup(state.editing);
  return state.groups.find((group) => group.id === state.editing.id);
}

// Suppression à deux temps : le premier tap arme, le second valide.
let deleteArmed = false;

function disarmDelete() {
  deleteArmed = false;
  el('group-delete').textContent = 'Supprimer le groupe';
  el('group-delete').classList.remove('confirming');
}

function removeGroup() {
  if (!deleteArmed) {
    deleteArmed = true;
    el('group-delete').textContent = 'Confirmer la suppression';
    el('group-delete').classList.add('confirming');
    haptic(12);
    return;
  }

  const name = state.editing.name;
  state.groups = deleteGroup(state.editing.id);
  disarmDelete();
  backToLobby();
  notify(`${name} supprimé.`, 'info');
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

  // Au démarrage, aucun groupe n'est encore choisi : l'indice reste muet.
  const group = state.group;
  const known = group?.members.length ?? 0;
  const hint = el('roster-hint');

  hint.hidden = known === 0;
  if (group && known > 0) {
    hint.textContent =
      known >= state.numPlayers
        ? `${known} profils dans ${group.name} : l'app annoncera qui pioche.`
        : `${known} profil(s) dans ${group.name} — les ${state.numPlayers - known} autres créeront le leur.`;
  }
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

/**
 * Le dictionnaire de la partie.
 *
 * Un thème exclusif ne complète pas le tirage général, il le remplace :
 * mélanger des personnages de jeu vidéo à des légumes laisserait la
 * table sans repère sur l'univers dans lequel elle joue.
 */
function chosenPool() {
  return state.brawl ? OPTIONAL_THEMES['Brawl Stars'] : null;
}

function startGame() {
  const pool = chosenPool();
  try {
    game = new Game(state.numPlayers, state.undercover, state.mrWhite, {
      drawPair: pool ? (random) => drawPair(random, pool) : undefined,
    });
  } catch (error) {
    notify(error.message, 'error');
    return;
  }

  // Assez de profils connus : l'app annonce qui pioche. Le premier est
  // tiré au sort, puis on suit l'ordre du groupe en bouclant. Sinon
  // chacun crée le sien en prenant sa carte.
  const members = state.group?.members ?? [];
  state.queue =
    members.length >= state.numPlayers
      ? rotatedFrom(members).slice(0, state.numPlayers)
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
  openProfileSheet({ mode: 'claim' });
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

/**
 * La même feuille sert trois usages : prendre une carte en début de
 * partie, ajouter un joueur au groupe, et modifier un profil existant.
 * `intent` dit lequel — et ce qu'il faudra faire à la validation.
 */
function openProfileSheet(intent) {
  state.profile = intent;
  state.draftPhoto = intent.name ? (state.photos[intent.name] ?? null) : null;

  const titles = {
    claim: 'Qui prend cette carte ?',
    add: 'Nouveau joueur',
    edit: 'Modifier le profil',
  };
  el('profile-title').textContent = titles[intent.mode];
  el('profile-confirm').textContent = intent.mode === 'claim' ? 'Voir mon mot' : 'Enregistrer';
  el('profile-remove').hidden = intent.mode !== 'edit';

  el('profile-name').value = intent.name ?? '';
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
  const refuse = (message) => {
    error.textContent = message;
    error.hidden = false;
  };

  if (!name) return refuse('Il faut un prénom.');

  const intent = state.profile;

  if (intent.mode === 'claim') {
    if (game.names.includes(name)) return refuse(`${name} a déjà pris une carte.`);
    claimCard(state.pendingCard, name);
    return;
  }

  // Deux joueurs d'un même groupe ne peuvent pas porter le même prénom :
  // le moteur refuserait de leur donner deux cartes.
  const clash = state.editing.members.some((m, i) => m === name && i !== intent.index);
  if (clash) return refuse(`${name} est déjà dans le groupe.`);

  if (intent.mode === 'add') {
    if (state.draftPhoto) setPhoto(name, state.draftPhoto);
    state.editing.members.push(name);
  } else {
    renameMember(intent.index, name);
  }

  state.photos = loadPhotos();
  cancelProfile();
  renderMembers();
}

/** Change le prénom d'un membre — sa photo le suit, elle est rangée dessous. */
function renameMember(index, name) {
  const before = state.editing.members[index];
  const photo = state.draftPhoto ?? state.photos[before];

  if (photo) setPhoto(name, photo);

  // La photo d'avant ne part que si plus personne ne s'en sert : le même
  // prénom peut figurer dans un autre groupe.
  const usedElsewhere = state.groups.some(
    (group) => group.id !== state.editing.id && group.members.includes(before),
  );
  if (before !== name && !usedElsewhere) removePhoto(before);

  state.editing.members[index] = name;
}

function removeMember() {
  // On ne touche pas à la photo : le joueur peut revenir, ou jouer ailleurs.
  state.editing.members.splice(state.profile.index, 1);
  cancelProfile();
  renderMembers();
}

function cancelProfile() {
  state.pendingCard = null;
  state.draftPhoto = null;
  state.profile = null;
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
  rememberGroup(game.names);
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

function playerRow(name, { eliminated = false, first = false, onEliminate = null } = {}) {
  const row = document.createElement('div');
  row.className = eliminated ? 'player-item eliminated' : 'player-item';
  row.appendChild(avatarElement(name, state.photos[name], 'avatar-sm'));

  const label = document.createElement('span');
  label.textContent = name;
  row.appendChild(label);

  if (first) {
    const tag = document.createElement('small');
    tag.className = 'speaker-tag';
    tag.textContent = 'commence';
    row.appendChild(tag);
  }

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

  // La liste suit l'ordre de parole, pas celui des cartes : celui qui
  // ouvre le débat est en haut, et on descend dans le sens du tour.
  const stillIn = new Set(game.activePlayers);
  const active = el('active-list');
  active.replaceChildren();
  game.speakingOrder
    .filter((name) => stillIn.has(name))
    .forEach((name) => {
      active.appendChild(
        playerRow(name, {
          first: name === game.firstSpeaker,
          onEliminate: over ? null : eliminate,
        }),
      );
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
  // Le groupe a pu être supprimé entre-temps : la partie reste jouable,
  // elle ne sera simplement mémorisée nulle part à la fin.
  state.group = state.groups.find((group) => group.id === saved.groupId) ?? null;

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

el('group-new').addEventListener('click', createGroup);
el('group-play').addEventListener('click', () => selectGroup(commitGroup()));
el('group-back').addEventListener('click', () => {
  commitGroup();
  backToLobby();
});
el('group-delete').addEventListener('click', removeGroup);
el('member-add').addEventListener('click', () => openProfileSheet({ mode: 'add' }));
el('group-name').addEventListener('input', disarmDelete);

el('brawl-mode').addEventListener('change', (e) => {
  state.brawl = e.target.checked;
  haptic(12);
});

el('setup-back').addEventListener('click', backToLobby);
el('start-game').addEventListener('click', startGame);
el('go-debate').addEventListener('click', goToDebate);

el('profile-photo').addEventListener('click', openCamera);
el('profile-name').addEventListener('input', refreshProfilePhoto);
el('profile-confirm').addEventListener('click', confirmProfile);
el('profile-remove').addEventListener('click', removeMember);
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
state.groups = loadGroups();
renderLobby();
refreshRules();
setupInstallHint();

// Une partie en cours court-circuite le lobby : on reprend là où le
// groupe s'était arrêté.
if (!resume()) showScreen('lobby-screen');

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
