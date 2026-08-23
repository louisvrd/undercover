/**
 * Caméra intégrée à la page.
 *
 * Pourquoi ne pas se contenter de <input type="file" capture> : dans une
 * PWA lancée depuis l'écran d'accueil iOS, cet input ouvre l'appareil
 * photo mais ne reçoit jamais le flux — l'écran reste noir. getUserMedia,
 * autorisé pour les apps de l'écran d'accueil depuis iOS 14.3, n'a pas
 * ce défaut.
 *
 * Le flux vidéo n'est jamais transmis nulle part : il sert seulement à
 * remplir un canvas local.
 */

import { drawAvatar } from './photos.js';

export function isCameraSupported() {
  return Boolean(navigator.mediaDevices?.getUserMedia);
}

/** Traduit les erreurs getUserMedia en quelque chose d'actionnable. */
function explain(error) {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      // Le chemin exact des réglages diffère entre Safari et une app
      // installée : on reste volontairement générique.
      return "Accès à la caméra refusé. Autorisez-le dans les réglages, puis relancez l'app.";
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'Aucune caméra disponible sur cet appareil.';
    case 'NotReadableError':
      return 'La caméra est déjà utilisée par une autre application.';
    default:
      return "La caméra n'a pas pu démarrer.";
  }
}

export class Camera {
  #stream = null;
  #video = null;
  #facing = 'user';

  get facingMode() {
    return this.#facing;
  }

  /** Ouvre le flux et l'affiche dans `video`. */
  async start(video, facing = this.#facing) {
    this.stop();
    this.#facing = facing;

    if (!isCameraSupported()) {
      throw new Error("Ce navigateur ne donne pas accès à la caméra.");
    }

    try {
      this.#stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 1280 },
          height: { ideal: 1280 },
        },
        audio: false,
      });
    } catch (error) {
      throw new Error(explain(error));
    }

    this.#video = video;
    video.srcObject = this.#stream;
    // iOS exige playsinline + muted, sinon la lecture part en plein écran
    // ou est refusée sans geste utilisateur. Les deux sont dans le HTML.
    try {
      await video.play();
    } catch {
      // Safari rejette parfois la promesse alors que l'image arrive quand
      // même ; on laisse `grab()` juger sur videoWidth.
    }
  }

  /** Bascule avant / arrière. */
  async flip(video) {
    return this.start(video, this.#facing === 'user' ? 'environment' : 'user');
  }

  /** Coupe le flux — indispensable, sinon le voyant reste allumé. */
  stop() {
    this.#stream?.getTracks().forEach((track) => track.stop());
    this.#stream = null;

    if (this.#video) {
      this.#video.srcObject = null;
      this.#video = null;
    }
  }

  get isRunning() {
    return Boolean(this.#stream);
  }

  /** Fige l'image courante en vignette carrée. */
  grab() {
    const video = this.#video;
    if (!video?.videoWidth) {
      throw new Error("La caméra n'est pas encore prête, réessayez.");
    }
    // Caméra frontale : l'aperçu est miroir, la photo doit l'être aussi
    // pour capturer ce que la personne voyait à l'écran.
    return drawAvatar(video, video.videoWidth, video.videoHeight, {
      mirror: this.#facing === 'user',
    });
  }
}
