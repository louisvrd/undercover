/**
 * Les groupes de joueurs — qui joue ensemble, et avec quels réglages.
 *
 * Un groupe garde ses profils d'une partie à l'autre : on retrouve sa
 * bande sans ressaisir six prénoms à chaque soirée. Les photos, elles,
 * restent dans photos.js, rangées par prénom : deux groupes qui
 * comptent une « Léa » partagent sa vignette, ce qui est presque
 * toujours le comportement voulu sur un téléphone de famille.
 *
 * Comme le reste de l'app, rien ne sort de l'appareil.
 */

const STORE_KEY = 'undercover:groups';
const LEGACY_KEY = 'undercover:roster'; // une seule liste, avant les groupes

export const MAX_MEMBERS = 20;

/* ------------------------------------------------------------ stockage */

function readRaw(key) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    return null; // mode privé, JSON corrompu
  }
}

function persist(groups) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(groups));
    return true;
  } catch {
    return false; // quota dépassé
  }
}

export function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Remet un groupe lu du stockage dans les clous.
 *
 * Le contenu vient de localStorage, que rien ne garantit : une version
 * plus ancienne, une écriture interrompue, un bidouillage. On répare au
 * lieu de faire planter le démarrage.
 */
function sanitize(group) {
  if (!group || typeof group !== 'object') return null;

  const members = Array.isArray(group.members)
    ? group.members
        .filter((n) => typeof n === 'string' && n.trim())
        .map((n) => n.trim())
        .slice(0, MAX_MEMBERS)
    : [];

  // Un prénom en double casserait la distribution : deux cartes ne
  // peuvent pas appartenir au même joueur.
  const unique = [...new Set(members)];

  return {
    id: typeof group.id === 'string' && group.id ? group.id : newId(),
    name: typeof group.name === 'string' && group.name.trim() ? group.name.trim() : 'Sans nom',
    members: unique,
    undercover: Number.isInteger(group.undercover) ? Math.max(0, group.undercover) : 1,
    mrWhite: Number.isInteger(group.mrWhite) ? Math.max(0, group.mrWhite) : 0,
    brawl: group.brawl === true,
  };
}

/** L'unique liste d'avant les groupes devient le premier groupe. */
function migrateLegacy() {
  const legacy = readRaw(LEGACY_KEY);
  if (!legacy || !Array.isArray(legacy.names) || !legacy.names.length) return [];

  const group = sanitize({
    name: 'Mon groupe',
    members: legacy.names,
    undercover: legacy.undercover,
    mrWhite: legacy.mrWhite,
  });
  persist([group]);
  return [group];
}

export function loadGroups() {
  const stored = readRaw(STORE_KEY);
  if (Array.isArray(stored)) {
    return stored.map(sanitize).filter(Boolean);
  }
  return migrateLegacy();
}

/** Crée ou remplace un groupe, et renvoie la liste à jour. */
export function saveGroup(group) {
  const clean = sanitize(group);
  if (!clean) return loadGroups();

  const groups = loadGroups();
  const at = groups.findIndex((g) => g.id === clean.id);
  if (at === -1) groups.push(clean);
  else groups[at] = clean;

  persist(groups);
  return groups;
}

export function deleteGroup(id) {
  const groups = loadGroups().filter((g) => g.id !== id);
  persist(groups);
  return groups;
}

export function emptyGroup(name) {
  return sanitize({ id: newId(), name, members: [], undercover: 1, mrWhite: 0 });
}
