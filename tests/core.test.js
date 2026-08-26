/**
 * Mêmes cas que tests/test_core.py, sur le portage JavaScript.
 * Les deux moteurs doivent répondre la même chose.
 *
 *   node --test tests/core.test.js
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
  normalizeWord,
} from '../docs/core.js';
import { OPTIONAL_THEMES, WORD_PAIRS, drawPair, pairCount } from '../docs/words.js';

const NAMES = ['Alice', 'Bob', 'Chloé', 'David', 'Emma', 'Farid', 'Gaby', 'Hugo'];

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

function makeGame({ players = 6, undercover = 1, mrWhite = 0, seed = 1, claim = true } = {}) {
  const game = new Game(players, undercover, mrWhite, { random: seeded(seed) });
  if (claim) for (let i = 0; i < players; i += 1) game.claim(i, NAMES[i]);
  return game;
}

const named = (game, role) => game.players.find((p) => p.role === role).name;

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
  assert.throws(() => makeGame({ players: 3 }), /au moins 4 joueurs/);
});

test('refuse une partie sans aucun rôle spécial', () => {
  assert.throws(() => makeGame({ undercover: 0, mrWhite: 0 }), /au moins un Undercover/);
});

test('refuse trop de rôles spéciaux', () => {
  assert.throws(() => makeGame({ players: 4, undercover: 1, mrWhite: 1 }), /Trop de rôles/);
});

test('accepte le maximum documenté', () => {
  assert.equal(makeGame({ players: 6, undercover: 1, mrWhite: 1 }).winner, null);
});

// -- Distribution sur les cartes ---------------------------------------

test('distribue les rôles demandés', () => {
  const roles = makeGame({ players: 8, undercover: 2, mrWhite: 1 }).players.map((p) => p.role);

  assert.equal(roles.filter((r) => r === Role.UNDERCOVER).length, 2);
  assert.equal(roles.filter((r) => r === Role.MR_WHITE).length, 1);
  assert.equal(roles.filter((r) => r === Role.CIVILIAN).length, 5);
});

test('les cartes commencent libres', () => {
  const game = makeGame({ claim: false });
  assert.equal(game.cardCount, 6);
  assert.deepEqual(game.owners, Array(6).fill(null));
  assert.equal(game.allClaimed, false);
  assert.deepEqual(game.names, []);
});

test('prendre une carte revèle le mot et la réserve', () => {
  const game = makeGame({ claim: false });
  const { role, word } = game.claim(2, 'Alice');

  assert.equal(game.owners[2], 'Alice');
  assert.deepEqual(game.names, ['Alice']);
  assert.equal(word === null, role === Role.MR_WHITE);
});

test('on ne peut pas prendre une carte déjà prise', () => {
  const game = makeGame({ claim: false });
  game.claim(0, 'Alice');
  assert.throws(() => game.claim(0, 'Bob'), /déjà prise par Alice/);
});

test('on ne peut pas prendre deux cartes', () => {
  const game = makeGame({ claim: false });
  game.claim(0, 'Alice');
  assert.throws(() => game.claim(1, 'Alice'), /déjà pris une carte/);
});

test('refuse un nom vide', () => {
  assert.throws(() => makeGame({ claim: false }).claim(0, '   '), /ne peut pas être vide/);
});

test('refuse une carte inexistante', () => {
  const game = makeGame({ claim: false });
  for (const bad of [-1, 6, 99, 1.5]) {
    assert.throws(() => game.claim(bad, 'Alice'), /n’existe pas/, `carte ${bad}`);
  }
});

test('le nom est nettoyé de ses espaces', () => {
  const game = makeGame({ claim: false });
  game.claim(0, '  Alice ');
  assert.deepEqual(game.names, ['Alice']);
});

test('Mr. White ne reçoit aucun mot', () => {
  const game = makeGame({ players: 6, undercover: 1, mrWhite: 1 });
  assert.equal(game.wordOf(named(game, Role.MR_WHITE)), null);
});

test('les civils partagent un mot, les undercovers un autre', () => {
  const game = makeGame({ players: 6, undercover: 2 });
  const civils = new Set(game.players.filter((p) => p.role === Role.CIVILIAN).map((p) => p.word));
  const under = new Set(game.players.filter((p) => p.role === Role.UNDERCOVER).map((p) => p.word));

  assert.equal(civils.size, 1);
  assert.equal(under.size, 1);
  assert.notDeepEqual([...civils], [...under]);
});

test('même graine, même distribution', () => {
  assert.deepEqual(makeGame({ seed: 7 }).players, makeGame({ seed: 7 }).players);
});

test('un joueur inconnu est rejeté', () => {
  assert.throws(() => makeGame().wordOf('Mallory'), /ne fait pas partie/);
});

// -- Qui ouvre le débat -------------------------------------------------

test("Mr. White n'ouvre jamais le débat", () => {
  // Sans mot ni indice entendu, il devrait inventer à l'aveugle.
  for (let seed = 0; seed < 60; seed += 1) {
    const game = makeGame({ players: 6, undercover: 1, mrWhite: 1, seed });
    assert.notEqual(game.roleOf(game.firstSpeaker), Role.MR_WHITE, `graine ${seed}`);
  }
});

test('le premier joueur change d’une partie à l’autre', () => {
  const speakers = new Set();
  for (let seed = 0; seed < 40; seed += 1) speakers.add(makeGame({ seed }).firstSpeaker);
  assert.ok(speakers.size > 1, 'le premier joueur doit être tiré au sort');
});

test('le premier joueur est inconnu tant que sa carte est libre', () => {
  assert.equal(makeGame({ claim: false }).firstSpeaker, null);
});

test('l’ordre de parole commence par le premier orateur', () => {
  const game = makeGame({ players: 6, undercover: 1 });
  assert.equal(game.speakingOrder[0], game.firstSpeaker);
});

test('l’ordre de parole fait le tour de la table', () => {
  // C'est une rotation de l'ordre des cartes, pas un nouveau tirage.
  const game = makeGame({ players: 6, undercover: 1 });
  const order = game.speakingOrder;
  const names = game.names;

  assert.deepEqual([...order].sort(), [...names].sort());
  const start = names.indexOf(order[0]);
  assert.deepEqual(order, [...names.slice(start), ...names.slice(0, start)]);
});

test('l’ordre de parole ignore les cartes encore libres', () => {
  const game = makeGame({ players: 6, undercover: 1, claim: false });
  assert.deepEqual(game.speakingOrder, []);

  game.claim(0, 'Alice');
  assert.deepEqual(game.speakingOrder, ['Alice']);
});

// -- Éliminations et victoire ------------------------------------------

test('aucune élimination avant que toutes les cartes soient prises', () => {
  const game = makeGame({ claim: false });
  game.claim(0, 'Alice');
  assert.throws(() => game.eliminate('Alice'), /distribution/);
});

test("l'éliminé sort de la liste active", () => {
  const game = makeGame({ players: 6, undercover: 1 });
  game.eliminate('Bob');

  assert.ok(!game.activePlayers.includes('Bob'));
  assert.deepEqual(game.eliminatedPlayers, ['Bob']);
  assert.equal(game.activePlayers.length, 5);
});

test('on ne peut pas éliminer deux fois', () => {
  const game = makeGame({ players: 6, undercover: 1 });
  const civil = named(game, Role.CIVILIAN);
  game.eliminate(civil);
  assert.throws(() => game.eliminate(civil), /déjà éliminé/);
});

test('les civils gagnent quand le dernier imposteur tombe', () => {
  const game = makeGame({ players: 6, undercover: 1 });
  const result = game.eliminate(named(game, Role.UNDERCOVER));

  assert.equal(result.gameOver, true);
  assert.equal(result.winner, Team.CIVILIANS);
  assert.ok(game.isOver);
});

test('les imposteurs gagnent dès qu’ils égalent les civils', () => {
  const game = makeGame({ players: 6, undercover: 2 });
  const civils = game.players.filter((p) => p.role === Role.CIVILIAN).map((p) => p.name);

  assert.equal(game.eliminate(civils[0]).gameOver, false);
  const result = game.eliminate(civils[1]);

  assert.equal(result.gameOver, true);
  assert.equal(result.winner, Team.SPECIALS);
});

test('on ne peut plus éliminer après la fin', () => {
  const game = makeGame({ players: 6, undercover: 1 });
  game.eliminate(named(game, Role.UNDERCOVER));
  assert.throws(() => game.eliminate(game.activePlayers[0]), /terminée/);
});

// -- Le dernier mot de Mr. White ---------------------------------------

test('éliminer Mr. White suspend la partie', () => {
  const game = makeGame({ players: 6, undercover: 0, mrWhite: 1 });
  const result = game.eliminate(named(game, Role.MR_WHITE));

  assert.equal(result.awaitingGuess, named(game, Role.MR_WHITE));
  assert.equal(result.gameOver, false); // le tableau dit civils, la règle dit « attends »
  assert.equal(result.winner, null);
  assert.equal(game.isOver, false);
});

test('Mr. White gagne en nommant le mot de la majorité', () => {
  const game = makeGame({ players: 6, undercover: 0, mrWhite: 1 });
  const mrWhite = named(game, Role.MR_WHITE);
  game.eliminate(mrWhite);

  const result = game.guess(game.majorityWord);

  assert.equal(result.correct, true);
  assert.equal(result.player, mrWhite);
  assert.equal(result.winner, Team.SPECIALS);
  assert.equal(game.winner, Team.SPECIALS);
  assert.match(game.winnerMessage, /Mr\. White a trouvé/);
});

test('une mauvaise proposition rend la partie aux civils', () => {
  const game = makeGame({ players: 6, undercover: 0, mrWhite: 1 });
  game.eliminate(named(game, Role.MR_WHITE));

  const result = game.guess('nimportequoi');

  assert.equal(result.correct, false);
  assert.equal(result.answer, game.majorityWord); // révélé pour la table
  assert.equal(game.winner, Team.CIVILIANS);
});

test('une mauvaise proposition laisse repartir une partie en cours', () => {
  const game = makeGame({ players: 6, undercover: 1, mrWhite: 1 });
  game.eliminate(named(game, Role.MR_WHITE));

  assert.equal(game.guess('nimportequoi').gameOver, false);
  assert.equal(game.isOver, false);
  assert.equal(game.awaitingGuess, null);
});

test('la proposition ignore casse, accents et ponctuation', () => {
  assert.equal(normalizeWord('Porte-Clés'), normalizeWord('  porte cles '));
  assert.equal(normalizeWord('Éclair'), normalizeWord('eclair'));
  assert.notEqual(normalizeWord('chat'), normalizeWord('chien'));
});

test('rien d’autre ne se passe tant que Mr. White n’a pas parlé', () => {
  const game = makeGame({ players: 6, undercover: 1, mrWhite: 1 });
  const mrWhite = named(game, Role.MR_WHITE);
  game.eliminate(mrWhite);

  assert.equal(game.awaitingGuess, mrWhite);
  assert.throws(() => game.eliminate(named(game, Role.CIVILIAN)), {
    name: 'RuleError',
    message: /doit d’abord proposer/,
  });
});

test('seul un Mr. White éliminé peut proposer', () => {
  const game = makeGame({ players: 6, undercover: 1, mrWhite: 0 });
  assert.throws(() => game.guess('chat'), RuleError);

  game.eliminate(named(game, Role.CIVILIAN));
  assert.throws(() => game.guess('chat'), { message: /Personne n’attend/ });
});

test('une proposition vide est refusée', () => {
  const game = makeGame({ players: 6, undercover: 0, mrWhite: 1 });
  game.eliminate(named(game, Role.MR_WHITE));

  assert.throws(() => game.guess('   '), { message: /ne peut pas être vide/ });
  assert.notEqual(game.awaitingGuess, null); // la main reste à jouer
});

test('chaque Mr. White a sa propre proposition', () => {
  const game = makeGame({ players: 8, undercover: 0, mrWhite: 2 });
  const whites = game.players.filter((p) => p.role === Role.MR_WHITE).map((p) => p.name);

  game.eliminate(whites[0]);
  game.guess('nimportequoi');
  game.eliminate(whites[1]);

  assert.equal(game.awaitingGuess, whites[1]);
  assert.equal(game.guess(game.majorityWord).winner, Team.SPECIALS);
});

// -- Annulation --------------------------------------------------------

test('annuler remet le joueur en jeu', () => {
  const game = makeGame({ players: 6, undercover: 1 });
  const civil = named(game, Role.CIVILIAN);
  game.eliminate(civil);

  assert.equal(game.undoLastElimination(), civil);
  assert.ok(game.activePlayers.includes(civil));
  assert.deepEqual(game.eliminatedPlayers, []);
});

test('annuler relance une partie terminée', () => {
  const game = makeGame({ players: 6, undercover: 1 });
  const undercover = named(game, Role.UNDERCOVER);
  game.eliminate(undercover);
  assert.ok(game.isOver);

  game.undoLastElimination();

  assert.ok(!game.isOver);
  assert.equal(game.eliminate(undercover).gameOver, true);
});

test('annuler efface une victoire par proposition', () => {
  const game = makeGame({ players: 6, undercover: 0, mrWhite: 1 });
  const mrWhite = named(game, Role.MR_WHITE);
  game.eliminate(mrWhite);
  game.guess(game.majorityWord);
  assert.equal(game.winner, Team.SPECIALS);

  game.undoLastElimination();

  assert.equal(game.winner, null);
  assert.ok(game.activePlayers.includes(mrWhite));
});

test('annuler efface une proposition encore due', () => {
  const game = makeGame({ players: 6, undercover: 1, mrWhite: 1 });
  game.eliminate(named(game, Role.MR_WHITE));

  game.undoLastElimination();

  assert.equal(game.awaitingGuess, null);
  assert.equal(game.eliminate(named(game, Role.CIVILIAN)).gameOver, false);
});

test('annuler sans élimination est refusé', () => {
  const game = makeGame();
  assert.equal(game.canUndo, false);
  assert.throws(() => game.undoLastElimination(), /Aucune élimination/);
});

// -- Sauvegarde ---------------------------------------------------------

test('une partie survit à un aller-retour par toJSON', () => {
  const game = makeGame({ players: 6, undercover: 1 });
  game.eliminate('Bob');

  const restored = Game.restore(JSON.parse(JSON.stringify(game)));

  assert.deepEqual(restored.players, game.players);
  assert.deepEqual(restored.eliminatedPlayers, ['Bob']);
  assert.equal(restored.firstSpeaker, game.firstSpeaker);
});

test('une proposition en attente survit au rechargement', () => {
  // Le téléphone peut se verrouiller pendant que Mr. White réfléchit.
  const game = makeGame({ players: 6, undercover: 1, mrWhite: 1 });
  game.eliminate(named(game, Role.MR_WHITE));

  const restored = Game.restore(JSON.parse(JSON.stringify(game)));

  assert.equal(restored.awaitingGuess, game.awaitingGuess);
  assert.equal(restored.isOver, false);
  assert.equal(restored.guess(restored.majorityWord).winner, Team.SPECIALS);
});

test('une victoire de Mr. White survit au rechargement', () => {
  const game = makeGame({ players: 6, undercover: 0, mrWhite: 1 });
  game.eliminate(named(game, Role.MR_WHITE));
  game.guess(game.majorityWord);

  const restored = Game.restore(JSON.parse(JSON.stringify(game)));

  assert.equal(restored.winner, Team.SPECIALS);
  assert.match(restored.winnerMessage, /Mr\. White a trouvé/);
});

test('une sauvegarde corrompue renvoie null au lieu de casser', () => {
  for (const bad of [null, {}, { cards: 'nope', eliminated: [] }, { cards: [], eliminated: [] }]) {
    assert.equal(Game.restore(bad), null);
  }
});

// -- Générateur de mots ------------------------------------------------

const key = (a, b) => [a, b].sort().join(' ');

test('une paire tirée vient du dictionnaire', () => {
  const known = new Set(WORD_PAIRS.map(([a, b]) => key(a, b)));
  const random = seeded(42);

  for (let i = 0; i < 500; i += 1) {
    const [first, second] = drawPair(random);
    assert.notEqual(first, second);
    assert.ok(known.has(key(first, second)), `${first} / ${second}`);
  }
});

test("l'ordre de la paire est tiré aussi", () => {
  // drawPair consomme deux valeurs : la première choisit la paire, la
  // seconde son sens. On les fournit plutôt que d'espérer tomber sur la
  // bonne paire au hasard — le dictionnaire compte des milliers d'entrées.
  const scripted = (...values) => {
    let i = 0;
    return () => values[i++];
  };
  const [a, b] = WORD_PAIRS[0];

  assert.deepEqual(drawPair(scripted(0, 0.2)), [a, b]);
  assert.deepEqual(drawPair(scripted(0, 0.8)), [b, a]);
});

test('un thème exclusif reste hors du tirage général', () => {
  const general = new Set(WORD_PAIRS.map(([a, b]) => key(a, b)));
  for (const pairs of Object.values(OPTIONAL_THEMES)) {
    for (const [a, b] of pairs) {
      assert.ok(!general.has(key(a, b)), `${a} / ${b} fuite dans le général`);
    }
  }
});

test('un thème exclusif se joue seul', () => {
  const pairs = OPTIONAL_THEMES['Brawl Stars'];
  assert.ok(pairs.length >= 20);

  const random = seeded(9);
  const known = new Set(pairs.map(([a, b]) => key(a, b)));
  for (let i = 0; i < 120; i += 1) {
    const [first, second] = drawPair(random, pairs);
    assert.notEqual(first, second);
    assert.ok(known.has(key(first, second)), `${first} / ${second}`);
  }
  assert.equal(pairCount(pairs), pairs.length);
});

test('les paires exclusives sont bien formées', () => {
  for (const pairs of Object.values(OPTIONAL_THEMES)) {
    const keys = pairs.map(([a, b]) => key(a, b));
    assert.equal(new Set(keys).size, keys.length);
    for (const [a, b] of pairs) {
      assert.notEqual(a, b);
      assert.ok(!a.includes(' ') && !b.includes(' '), `${a} / ${b}`);
    }
  }
});

test('une partie peut tourner sur le seul thème exclusif', () => {
  const pairs = OPTIONAL_THEMES['Brawl Stars'];
  const noms = new Set(pairs.flat());
  const game = new Game(6, 1, 0, {
    random: seeded(4),
    drawPair: (random) => drawPair(random, pairs),
  });
  for (let i = 0; i < 6; i += 1) game.claim(i, NAMES[i]);

  for (const joueur of game.players) {
    if (joueur.word !== null) assert.ok(noms.has(joueur.word), joueur.word);
  }
});

test('aucune paire en double', () => {
  const keys = WORD_PAIRS.map(([a, b]) => key(a, b));
  assert.equal(new Set(keys).size, keys.length);
});

test('pairCount correspond au dictionnaire', () => {
  assert.equal(pairCount(), WORD_PAIRS.length);
});
