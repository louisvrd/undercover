/**
 * Mêmes cas que tests/test_core.py, sur le portage JavaScript.
 * Les deux moteurs doivent répondre la même chose.
 *
 *   node --test tests/
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MIN_PLAYERS,
  Game,
  Role,
  RuleError,
  Team,
  maxSpecialRoles,
} from '../docs/core.js';
import { WORD_GROUPS, drawPair, pairCount } from '../docs/words.js';

const FOUR = ['Alice', 'Bob', 'Chloé', 'David'];
const SIX = [...FOUR, 'Emma', 'Farid'];
const EIGHT = [...SIX, 'Gaby', 'Hugo'];

/** PRNG déterministe, pour rejouer exactement la même distribution. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const makeGame = ({ names = SIX, undercover = 1, mrWhite = 0, seed = 1 } = {}) =>
  new Game(names, undercover, mrWhite, { random: seeded(seed) });

// -- Nombre de rôles spéciaux ------------------------------------------

test('maxSpecialRoles suit le tableau documenté', () => {
  for (const [players, expected] of [
    [4, 1], [5, 2], [6, 2], [7, 3], [8, 3], [9, 4], [10, 4],
  ]) {
    assert.equal(maxSpecialRoles(players), expected, `${players} joueurs`);
  }
});

test('le maximum garde les civils majoritaires', () => {
  for (let players = MIN_PLAYERS; players <= 20; players += 1) {
    const specials = maxSpecialRoles(players);
    assert.ok(specials < players - specials, `${players} joueurs`);
  }
});

// -- Validation du setup -----------------------------------------------

test('refuse moins de 4 joueurs', () => {
  assert.throws(() => makeGame({ names: ['Alice', 'Bob', 'Chloé'] }), /au moins 4 joueurs/);
});

test('refuse les doublons', () => {
  assert.throws(() => makeGame({ names: [...FOUR.slice(0, 3), 'Alice'] }), /uniques/);
});

test('refuse les noms vides', () => {
  assert.throws(() => makeGame({ names: ['Alice', '  ', 'Chloé', 'David'] }), /vides/);
});

test('nettoie les espaces autour des noms', () => {
  const game = makeGame({ names: ['  Alice ', 'Bob', 'Chloé', 'David'] });
  assert.equal(game.names[0], 'Alice');
});

test('refuse une partie sans aucun rôle spécial', () => {
  assert.throws(() => makeGame({ undercover: 0, mrWhite: 0 }), /au moins un Undercover/);
});

test('refuse trop de rôles spéciaux', () => {
  assert.throws(() => makeGame({ names: FOUR, undercover: 1, mrWhite: 1 }), /Trop de rôles/);
});

test('accepte le maximum documenté', () => {
  assert.equal(makeGame({ names: SIX, undercover: 1, mrWhite: 1 }).winner, null);
});

// -- Distribution ------------------------------------------------------

test('distribue les rôles demandés', () => {
  const roles = makeGame({ names: EIGHT, undercover: 2, mrWhite: 1 })
    .players.map((p) => p.role);

  assert.equal(roles.filter((r) => r === Role.UNDERCOVER).length, 2);
  assert.equal(roles.filter((r) => r === Role.MR_WHITE).length, 1);
  assert.equal(roles.filter((r) => r === Role.CIVILIAN).length, 5);
});

test('Mr. White ne reçoit aucun mot', () => {
  const game = makeGame({ names: SIX, undercover: 1, mrWhite: 1 });
  const mrWhite = game.players.find((p) => p.role === Role.MR_WHITE);
  assert.equal(mrWhite.word, null);
  assert.equal(game.wordOf(mrWhite.name), null);
});

test('les civils partagent un mot, les undercovers un autre', () => {
  const game = makeGame({ names: SIX, undercover: 2 });
  const civils = new Set(game.players.filter((p) => p.role === Role.CIVILIAN).map((p) => p.word));
  const under = new Set(game.players.filter((p) => p.role === Role.UNDERCOVER).map((p) => p.word));

  assert.equal(civils.size, 1);
  assert.equal(under.size, 1);
  assert.notDeepEqual([...civils], [...under]);
});

test("l'ordre des joueurs suit la saisie", () => {
  assert.deepEqual(makeGame({ names: SIX }).names, SIX);
});

test('même graine, même distribution', () => {
  assert.deepEqual(makeGame({ seed: 7 }).players, makeGame({ seed: 7 }).players);
});

test('un joueur inconnu est rejeté', () => {
  assert.throws(() => makeGame().wordOf('Mallory'), /ne fait pas partie/);
});

// -- Éliminations et victoire ------------------------------------------

test("l'éliminé sort de la liste active", () => {
  const game = makeGame({ names: SIX, undercover: 1 });
  game.eliminate('Bob');

  assert.ok(!game.activePlayers.includes('Bob'));
  assert.deepEqual(game.eliminatedPlayers, ['Bob']);
  assert.equal(game.activePlayers.length, 5);
});

test('on ne peut pas éliminer deux fois', () => {
  const game = makeGame({ names: SIX, undercover: 1 });
  const civil = game.players.find((p) => p.role === Role.CIVILIAN).name;
  game.eliminate(civil);

  assert.throws(() => game.eliminate(civil), /déjà éliminé/);
});

test('les civils gagnent quand le dernier imposteur tombe', () => {
  const game = makeGame({ names: SIX, undercover: 1 });
  const undercover = game.players.find((p) => p.role === Role.UNDERCOVER).name;

  const result = game.eliminate(undercover);
  assert.equal(result.gameOver, true);
  assert.equal(result.winner, Team.CIVILIANS);
  assert.ok(game.isOver);
});

test('les imposteurs gagnent dès qu’ils égalent les civils', () => {
  const game = makeGame({ names: SIX, undercover: 2 });
  const civils = game.players.filter((p) => p.role === Role.CIVILIAN).map((p) => p.name);

  assert.equal(game.eliminate(civils[0]).gameOver, false);
  const result = game.eliminate(civils[1]);

  assert.equal(result.gameOver, true);
  assert.equal(result.winner, Team.SPECIALS);
});

test("l'élimination annonce le rôle de la victime", () => {
  const game = makeGame({ names: SIX, undercover: 1 });
  const undercover = game.players.find((p) => p.role === Role.UNDERCOVER).name;
  assert.equal(game.eliminate(undercover).role, Role.UNDERCOVER);
});

test('on ne peut plus éliminer après la fin', () => {
  const game = makeGame({ names: SIX, undercover: 1 });
  const undercover = game.players.find((p) => p.role === Role.UNDERCOVER).name;
  game.eliminate(undercover);

  assert.throws(() => game.eliminate(game.activePlayers[0]), /terminée/);
});

// -- Générateur de mots ------------------------------------------------

test('une paire = deux mots distincts du même groupe', () => {
  const random = seeded(42);
  for (let i = 0; i < 500; i += 1) {
    const [first, second] = drawPair(random);
    assert.notEqual(first, second);
    assert.ok(WORD_GROUPS.some((g) => g.includes(first) && g.includes(second)));
  }
});

test('chaque mot du dictionnaire peut sortir', () => {
  // drawPair décale l'index du second tirage pour éviter un doublon :
  // ce décalage ne doit rendre aucun mot inatteignable.
  // (8 mots figurent dans deux groupes — « lapin », « kayak »… — donc on
  // compare au nombre de mots DISTINCTS, pas aux 400 emplacements.)
  const expected = new Set(WORD_GROUPS.flat());
  const random = seeded(3);
  const seen = new Set();

  for (let i = 0; i < 200000 && seen.size < expected.size; i += 1) {
    const [a, b] = drawPair(random);
    seen.add(a);
    seen.add(b);
  }
  assert.deepEqual([...expected].filter((w) => !seen.has(w)), []);
});

test('pairCount correspond aux groupes', () => {
  assert.equal(pairCount(), 40 * ((10 * 9) / 2));
});
