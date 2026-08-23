/**
 * Photos de profil des joueurs.
 *
 * Les photos ne quittent jamais l'appareil : elles sont réduites en
 * vignette puis rangées dans localStorage. Aucun envoi réseau, et le
 * service worker n'y touche pas.
 *
 * Une photo brute de téléphone pèse 3 à 5 Mo, alors que localStorage
 * plafonne autour de 5 Mo pour TOUT le site. On recadre donc en carré de
 * 256 px et on réencode en JPEG : environ 20 Ko par joueur.
 */

const STORE_KEY = 'undercover:photos';
const SIZE = 256;
const QUALITY = 0.82;

/* ------------------------------------------------------------ stockage */

export function loadPhotos() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const data = raw ? JSON.parse(raw) : {};
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {}; // mode privé, quota, JSON corrompu : on repart sans photos
  }
}

function persist(photos) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(photos));
    return true;
  } catch {
    return false; // quota dépassé
  }
}

export function setPhoto(name, dataUrl) {
  const photos = loadPhotos();
  photos[name] = dataUrl;
  return persist(photos);
}

export function removePhoto(name) {
  const photos = loadPhotos();
  delete photos[name];
  persist(photos);
}

export function clearPhotos() {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {
    /* rien à faire */
  }
}

/* ------------------------------------------------------- traitement image */

/**
 * Recadre au carré centré, réduit à SIZE et réencode en JPEG.
 *
 * Partagé par la caméra intégrée et par le choix depuis la photothèque,
 * pour que les deux produisent exactement la même vignette.
 *
 * `mirror` sert à la caméra frontale : on capture ce que l'utilisateur
 * voyait à l'écran, pas son image inversée.
 */
export function drawAvatar(source, width, height, { mirror = false } = {}) {
  if (!width || !height) throw new Error("Cette image n'a pas pu être lue.");

  const side = Math.min(width, height);
  const sx = (width - side) / 2;
  const sy = (height - side) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');

  if (mirror) {
    ctx.translate(SIZE, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(source, sx, sy, side, side, 0, 0, SIZE, SIZE);

  return canvas.toDataURL('image/jpeg', QUALITY);
}

/* -------------------------------------------------------------- fichier */

/**
 * Décode le fichier choisi.
 *
 * `imageOrientation: 'from-image'` applique la rotation EXIF : sans elle,
 * les photos prises en portrait sur iPhone arrivent couchées.
 */
async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Navigateur qui ne connaît pas l'option : on retente sans.
    }
    try {
      return await createImageBitmap(file);
    } catch {
      // On retombe sur <img>.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Cette image n'a pas pu être lue."));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Transforme le fichier d'un <input type="file"> en vignette carrée. */
export async function fileToAvatar(file) {
  if (!file || !file.type.startsWith('image/')) {
    throw new Error('Choisissez une image.');
  }

  const source = await decode(file);
  try {
    return drawAvatar(source, source.width, source.height);
  } finally {
    if (typeof source.close === 'function') source.close(); // libère l'ImageBitmap
  }
}

/* -------------------------------------------------------------- affichage */

/**
 * Pastille du joueur : sa photo si elle existe, sinon son initiale.
 * `extraClass` est une classe CSS (avatar-sm / avatar-lg).
 */
export function avatarElement(name, photo, extraClass = '') {
  if (photo) {
    const image = document.createElement('img');
    image.className = `avatar ${extraClass}`.trim();
    image.src = photo;
    image.alt = ''; // décoratif : le nom est déjà écrit à côté
    return image;
  }

  const fallback = document.createElement('span');
  fallback.className = `avatar avatar-initial ${extraClass}`.trim();
  fallback.textContent = [...name][0]?.toUpperCase() ?? '?';
  fallback.setAttribute('aria-hidden', 'true');
  return fallback;
}
