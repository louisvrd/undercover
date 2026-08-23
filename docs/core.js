/**
 * Règles du jeu Undercover — port JavaScript de undercover/core.py.
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
 * Les rôles sont distribués à la construction : un objet `Game`
 * représente toujours une partie déjà prête à jouer.
 */
export class Game {
  constructor(names, numUndercover, numMrWhite, options = {}) {
    const { random = Math.random, drawPair = defaultDrawPair, restore = null } = options;

    if (restore) {
      this.#players = restore.players.map((p) => Object.freeze({ ...p }));
      this.#eliminated = [...restore.eliminated];
    } else {
      const cleaned = Game.#validate(names, numUndercover, numMrWhite);
      this.#eliminated = [];
      this.#players = Game.#deal(cleaned, numUndercover, numMrWhite, random, drawPair);
    }
    this.#byName = new Map(this.#players.map((p) => [p.name, p]));
  }

  #players;
  #byName;
  #eliminated;

  // -- Sauvegarde ------------------------------------------------------

  /** État sérialisable — pour survivre à un rechargement de la page. */
  toJSON() {
    return { players: this.players, eliminated: this.eliminatedPlayers };
  }

  /**
   * Reconstruit une partie depuis `toJSON()`.
   * Renvoie null si l'état est absent ou corrompu : une sauvegarde
   * illisible ne doit jamais empêcher de lancer une nouvelle partie.
   */
  static restore(state) {
    const looksValid =
      state &&
      Array.isArray(state.players) &&
      Array.isArray(state.eliminated) &&
      state.players.length >= MIN_PLAYERS &&
      state.players.every(
        (p) => p && typeof p.name === 'string' && p.role in ROLE_LABELS,
      );

    if (!looksValid) return null;
    try {
      return new Game(null, 0, 0, { restore: state });
    } catch {
      return null;
    }
  }

  // -- Construction ---------------------------------------------------

  static #validate(names, numUndercover, numMrWhite) {
    if (!Array.isArray(names)) {
      throw new RuleError('Liste de joueurs invalide');
    }
    const cleaned = names.map((name) => String(name).trim());

    if (cleaned.some((name) => !name)) {
      throw new RuleError('Les noms de joueurs ne peuvent pas être vides');
    }
    if (new Set(cleaned).size !== cleaned.length) {
      throw new RuleError('Les noms de joueurs doivent être uniques');
    }
    if (cleaned.length < MIN_PLAYERS) {
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

    const allowed = maxSpecialRoles(cleaned.length);
    if (totalSpecial > allowed) {
      throw new RuleError(
        `Trop de rôles spéciaux : ${totalSpecial} demandés, ` +
          `${allowed} maximum à ${cleaned.length} joueurs`,
      );
    }
    return cleaned;
  }

  static #deal(names, numUndercover, numMrWhite, random, drawPair) {
    const [majorityWord, undercoverWord] = drawPair(random);

    const roles = [
      ...Array(numUndercover).fill(Role.UNDERCOVER),
      ...Array(numMrWhite).fill(Role.MR_WHITE),
      ...Array(names.length - numUndercover - numMrWhite).fill(Role.CIVILIAN),
    ];
    shuffle(roles, random);

    const wordOf = {
      [Role.CIVILIAN]: majorityWord,
      [Role.UNDERCOVER]: undercoverWord,
      [Role.MR_WHITE]: null,
    };
    // L'ordre affiché suit la saisie ; c'est le tirage des rôles qui est
    // mélangé, pas la liste des joueurs.
    return names.map((name, i) =>
      Object.freeze({ name, role: roles[i], word: wordOf[roles[i]] }),
    );
  }

  // -- Lecture --------------------------------------------------------

  /** Tous les joueurs, rôle et mot compris. Réservé à la révélation. */
  get players() {
    return [...this.#players];
  }

  get names() {
    return this.#players.map((p) => p.name);
  }

  get activePlayers() {
    const out = new Set(this.#eliminated);
    return this.names.filter((name) => !out.has(name));
  }

  get eliminatedPlayers() {
    return [...this.#eliminated];
  }

  #player(name) {
    const player = this.#byName.get(name);
    if (!player) {
      throw new RuleError(`« ${name} » ne fait pas partie de la partie`);
    }
    return player;
  }

  /** Le mot du joueur, ou null s'il est Mr. White. */
  wordOf(name) {
    return this.#player(name).word;
  }

  roleOf(name) {
    return this.#player(name).role;
  }

  /** L'équipe gagnante, ou null si la partie continue. */
  get winner() {
    const active = this.activePlayers.map((name) => this.#byName.get(name));
    const specials = active.filter((p) => p.role !== Role.CIVILIAN).length;
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
    const winner = this.winner;
    return winner ? WINNER_MESSAGES[winner] : null;
  }

  // -- Jeu ------------------------------------------------------------

  /** Sort un joueur de la partie et recalcule la condition de victoire. */
  eliminate(name) {
    if (this.isOver) {
      throw new RuleError('La partie est terminée');
    }
    const player = this.#player(name);
    if (this.#eliminated.includes(name)) {
      throw new RuleError(`${name} est déjà éliminé`);
    }

    this.#eliminated.push(name);
    const winner = this.winner;
    return {
      player: name,
      role: player.role,
      gameOver: winner !== null,
      winner,
      message: winner ? WINNER_MESSAGES[winner] : null,
      activePlayers: this.activePlayers,
    };
  }
}
