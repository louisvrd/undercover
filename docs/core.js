/**
 * Règles du jeu Undercover — port JavaScript de undercover/core.py.
 *
 * Les rôles sont distribués à des CARTES, pas à des joueurs : au moment
 * du tirage, personne n'a encore de nom. Les joueurs revendiquent
 * ensuite une carte de leur choix, ce qui déplace le hasard de l'app
 * vers la table.
 *
 * Comme la version Python, ce module ne fait aucune I/O : ni DOM, ni
 * réseau, ni stockage. Il est testé par tests/core.test.js sur les mêmes
 * cas que tests/test_core.py.
 */

import { drawPair as defaultDrawPair } from './words.js';

export const MIN_PLAYERS = 4;

export const Role = Object.freeze({
  CIVILIAN: 'civilian',
  UNDERCOVER: 'undercover',
  MR_WHITE: 'mr_white',
});

export const Team = Object.freeze({
  CIVILIANS: 'civilians',
  SPECIALS: 'specials',
});

export const ROLE_LABELS = Object.freeze({
  [Role.CIVILIAN]: 'Civil',
  [Role.UNDERCOVER]: 'Undercover',
  [Role.MR_WHITE]: 'Mr. White',
});

export const WINNER_MESSAGES = Object.freeze({
  [Team.CIVILIANS]: 'Les civils ont gagné : tous les imposteurs sont démasqués !',
  [Team.SPECIALS]: 'Les imposteurs ont gagné : ils ont tenu jusqu’au bout !',
});

/** Une victoire de Mr. White ne se raconte pas comme les autres. */
export const MR_WHITE_WIN_MESSAGE =
  'Mr. White a trouvé le mot en sortant : les imposteurs gagnent !';

/** Une règle du jeu est violée (setup invalide, coup impossible). */
export class RuleError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RuleError';
  }
}

/**
 * Nombre maximum d'Undercover + Mr. White pour `numPlayers` joueurs.
 *
 * Les civils doivent rester strictement majoritaires au coup d'envoi :
 * sinon la condition de victoire des rôles spéciaux est déjà remplie et
 * la partie est finie avant d'avoir commencé.
 *
 *   4 joueurs -> 1     7 joueurs -> 3
 *   5 joueurs -> 2     8 joueurs -> 3
 *   6 joueurs -> 2     9 joueurs -> 4
 */
/**
 * Forme canonique d'un mot, pour comparer une proposition tapée au doigt.
 *
 * Casse, accents et ponctuation sont ignorés : un Mr. White qui a trouvé
 * « porte-clés » ne doit pas perdre parce qu'il a écrit « Porte cles » sur
 * un clavier de téléphone. Ce qui reste — les lettres — doit correspondre
 * exactement : c'est le mot qu'il faut deviner, pas une approximation.
 */
export function normalizeWord(word) {
  const stripped = String(word)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return (stripped.match(/[a-z0-9]+/g) ?? []).join(' ');
}

export function maxSpecialRoles(numPlayers) {
  return Math.max(0, Math.floor((numPlayers - 1) / 2));
}

function shuffle(items, random) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/**
 * Une partie d'Undercover.
 *
 * À la construction, les rôles sont posés sur des cartes anonymes.
 * `claim()` associe ensuite un joueur à une carte.
 */
export class Game {
  constructor(playerCount, numUndercover, numMrWhite, options = {}) {
    const { random = Math.random, drawPair = defaultDrawPair, restore = null } = options;

    if (restore) {
      this.#cards = restore.cards.map((c) => ({ ...c }));
      this.#eliminated = [...restore.eliminated];
      this.#firstCard = restore.firstCard ?? 0;
      this.#pendingGuess = restore.pendingGuess ?? null;
      this.#mrWhiteWon = restore.mrWhiteWon === true;
      return;
    }

    Game.#validate(playerCount, numUndercover, numMrWhite);
    this.#eliminated = [];
    this.#pendingGuess = null;
    this.#mrWhiteWon = false;
    this.#cards = Game.#deal(playerCount, numUndercover, numMrWhite, random, drawPair);

    // Mr. White n'a ni mot ni indice entendu : le faire ouvrir le débat
    // reviendrait à lui demander d'inventer à l'aveugle.
    const eligible = this.#cards
      .map((card, i) => (card.role === Role.MR_WHITE ? -1 : i))
      .filter((i) => i >= 0);
    this.#firstCard = eligible[Math.floor(random() * eligible.length)];
  }

  #cards;
  #eliminated;
  #firstCard;
  #pendingGuess;
  #mrWhiteWon;

  // -- Construction ---------------------------------------------------

  static #validate(playerCount, numUndercover, numMrWhite) {
    if (!Number.isInteger(playerCount)) {
      throw new RuleError('Nombre de joueurs invalide');
    }
    if (playerCount < MIN_PLAYERS) {
      throw new RuleError(`Il faut au moins ${MIN_PLAYERS} joueurs`);
    }
    if (!Number.isInteger(numUndercover) || !Number.isInteger(numMrWhite)) {
      throw new RuleError('Les nombres de rôles doivent être entiers');
    }
    if (numUndercover < 0 || numMrWhite < 0) {
      throw new RuleError('Les nombres de rôles ne peuvent pas être négatifs');
    }

    const totalSpecial = numUndercover + numMrWhite;
    if (totalSpecial < 1) {
      throw new RuleError('Il faut au moins un Undercover ou un Mr. White');
    }

    const allowed = maxSpecialRoles(playerCount);
    if (totalSpecial > allowed) {
      throw new RuleError(
        `Trop de rôles spéciaux : ${totalSpecial} demandés, ` +
          `${allowed} maximum à ${playerCount} joueurs`,
      );
    }
  }

  static #deal(playerCount, numUndercover, numMrWhite, random, drawPair) {
    const [majorityWord, undercoverWord] = drawPair(random);

    const roles = [
      ...Array(numUndercover).fill(Role.UNDERCOVER),
      ...Array(numMrWhite).fill(Role.MR_WHITE),
      ...Array(playerCount - numUndercover - numMrWhite).fill(Role.CIVILIAN),
    ];
    shuffle(roles, random);

    const wordOf = {
      [Role.CIVILIAN]: majorityWord,
      [Role.UNDERCOVER]: undercoverWord,
      [Role.MR_WHITE]: null,
    };
    return roles.map((role) => ({ role, word: wordOf[role], owner: null }));
  }

  // -- Cartes ---------------------------------------------------------

  get cardCount() {
    return this.#cards.length;
  }

  /** Qui détient chaque carte, ou null si elle est encore libre. */
  get owners() {
    return this.#cards.map((card) => card.owner);
  }

  get allClaimed() {
    return this.#cards.every((card) => card.owner !== null);
  }

  #card(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.#cards.length) {
      throw new RuleError('Cette carte n’existe pas');
    }
    return this.#cards[index];
  }

  /**
   * Attribue une carte à un joueur et révèle son mot.
   * Renvoie `{ role, word }` — `word` vaut null pour Mr. White.
   */
  claim(index, name) {
    const card = this.#card(index);
    if (card.owner !== null) {
      throw new RuleError(`Cette carte est déjà prise par ${card.owner}`);
    }

    const cleaned = String(name).trim();
    if (!cleaned) {
      throw new RuleError('Le nom ne peut pas être vide');
    }
    if (this.names.includes(cleaned)) {
      throw new RuleError(`${cleaned} a déjà pris une carte`);
    }

    card.owner = cleaned;
    return { role: card.role, word: card.word };
  }

  /** Le joueur qui ouvre le débat — jamais Mr. White. */
  get firstSpeaker() {
    return this.#cards[this.#firstCard].owner;
  }

  /**
   * Les joueurs dans l'ordre de parole, le premier orateur en tête.
   *
   * Le tour part de la carte tirée à la construction puis fait le tour de
   * la table. Les cartes encore libres sont ignorées : l'ordre se complète
   * au fur et à mesure de la distribution.
   */
  get speakingOrder() {
    const count = this.#cards.length;
    return Array.from({ length: count }, (_, i) => this.#cards[(this.#firstCard + i) % count])
      .filter((card) => card.owner !== null)
      .map((card) => card.owner);
  }

  // -- Lecture --------------------------------------------------------

  /** Toutes les cartes prises, rôle et mot compris. Pour la révélation. */
  get players() {
    return this.#cards
      .filter((card) => card.owner !== null)
      .map((card) => Object.freeze({ name: card.owner, role: card.role, word: card.word }));
  }

  get names() {
    return this.#cards.filter((c) => c.owner !== null).map((c) => c.owner);
  }

  get activePlayers() {
    const out = new Set(this.#eliminated);
    return this.names.filter((name) => !out.has(name));
  }

  get eliminatedPlayers() {
    return [...this.#eliminated];
  }

  #player(name) {
    const card = this.#cards.find((c) => c.owner === name);
    if (!card) {
      throw new RuleError(`« ${name} » ne fait pas partie de la partie`);
    }
    return card;
  }

  /** Le mot du joueur, ou null s'il est Mr. White. */
  wordOf(name) {
    return this.#player(name).word;
  }

  roleOf(name) {
    return this.#player(name).role;
  }

  /**
   * Le mot des civils — la réponse que Mr. White doit deviner.
   * Le plafond des rôles spéciaux garantit qu'il reste toujours au moins
   * un civil pour le porter.
   */
  get majorityWord() {
    const civilian = this.#cards.find((c) => c.role === Role.CIVILIAN);
    if (!civilian) throw new RuleError('Cette partie n’a aucun civil');
    return civilian.word;
  }

  /** L'équipe gagnante, ou null si la partie continue. */
  get winner() {
    if (this.#mrWhiteWon) return Team.SPECIALS; // trouvé le mot en sortant
    if (!this.allClaimed) return null; // distribution en cours
    if (this.#pendingGuess !== null) return null; // une main reste à jouer

    const active = this.activePlayers.map((name) => this.#player(name));
    const specials = active.filter((c) => c.role !== Role.CIVILIAN).length;
    const civilians = active.length - specials;

    if (specials === 0) return Team.CIVILIANS;
    if (specials >= civilians) return Team.SPECIALS;
    return null;
  }

  get isOver() {
    return this.winner !== null;
  }

  /** Le message de fin de partie, ou null tant qu'elle continue. */
  get winnerMessage() {
    if (this.#mrWhiteWon) return MR_WHITE_WIN_MESSAGE;
    const winner = this.winner;
    return winner ? WINNER_MESSAGES[winner] : null;
  }

  // -- Jeu ------------------------------------------------------------

  /** Sort un joueur de la partie et recalcule la condition de victoire. */
  eliminate(name) {
    if (!this.allClaimed) {
      throw new RuleError('La distribution des cartes n’est pas terminée');
    }
    if (this.#pendingGuess !== null) {
      throw new RuleError(`${this.#pendingGuess} doit d’abord proposer un mot`);
    }
    if (this.isOver) {
      throw new RuleError('La partie est terminée');
    }
    const card = this.#player(name);
    if (this.#eliminated.includes(name)) {
      throw new RuleError(`${name} est déjà éliminé`);
    }

    this.#eliminated.push(name);

    // Un Mr. White démasqué a droit à une dernière main : s'il nomme le
    // mot des civils, il renverse la partie. Tant qu'il n'a pas joué,
    // `winner` reste null — même si le tableau désigne déjà les civils,
    // la partie n'est pas finie.
    if (card.role === Role.MR_WHITE) {
      this.#pendingGuess = name;
    }

    const winner = this.winner;
    return {
      player: name,
      role: card.role,
      gameOver: winner !== null,
      winner,
      message: this.winnerMessage,
      activePlayers: this.activePlayers,
      awaitingGuess: this.#pendingGuess,
    };
  }

  /** Le Mr. White dont on attend la proposition, ou null. */
  get awaitingGuess() {
    return this.#pendingGuess;
  }

  /**
   * Joue la proposition du Mr. White éliminé.
   *
   * S'il nomme le mot des civils, les imposteurs gagnent sur-le-champ,
   * quel que soit l'état du tableau. Sinon son élimination tient et la
   * partie reprend son cours.
   */
  guess(word) {
    if (this.#pendingGuess === null) {
      throw new RuleError('Personne n’attend de proposition');
    }

    const cleaned = String(word).trim();
    if (!cleaned) {
      throw new RuleError('La proposition ne peut pas être vide');
    }

    const answer = this.majorityWord;
    const correct = normalizeWord(cleaned) === normalizeWord(answer);

    const player = this.#pendingGuess;
    this.#pendingGuess = null;
    this.#mrWhiteWon = correct;

    const winner = this.winner;
    return {
      player,
      word: cleaned,
      correct,
      answer,
      gameOver: winner !== null,
      winner,
      message: this.winnerMessage,
    };
  }

  /**
   * Remet en jeu le dernier joueur éliminé — pour rattraper un tap raté.
   *
   * `winner` étant recalculé à partir des joueurs actifs, retirer le nom
   * de la liste suffit : une partie déclarée finie redevient en cours.
   */
  undoLastElimination() {
    const name = this.#eliminated.pop();
    if (name === undefined) {
      throw new RuleError('Aucune élimination à annuler');
    }
    // Le dernier éliminé est le seul à avoir pu proposer un mot :
    // annuler efface aussi sa proposition.
    this.#pendingGuess = null;
    this.#mrWhiteWon = false;
    return name;
  }

  get canUndo() {
    return this.#eliminated.length > 0;
  }

  // -- Sauvegarde ------------------------------------------------------

  /** État sérialisable — pour survivre à un rechargement de la page. */
  toJSON() {
    return {
      cards: this.#cards.map((c) => ({ ...c })),
      eliminated: this.eliminatedPlayers,
      firstCard: this.#firstCard,
      pendingGuess: this.#pendingGuess,
      mrWhiteWon: this.#mrWhiteWon,
    };
  }

  /**
   * Reconstruit une partie depuis `toJSON()`.
   * Renvoie null si l'état est absent ou corrompu : une sauvegarde
   * illisible ne doit jamais empêcher de lancer une nouvelle partie.
   */
  static restore(state) {
    const looksValid =
      state &&
      Array.isArray(state.cards) &&
      Array.isArray(state.eliminated) &&
      state.cards.length >= MIN_PLAYERS &&
      state.cards.every((c) => c && c.role in ROLE_LABELS);

    if (!looksValid) return null;
    try {
      return new Game(0, 0, 0, { restore: state });
    } catch {
      return null;
    }
  }
}
