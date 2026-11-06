/**
 * AFFICHES-EM — Chargement des visuels (collection PocketBase « medias »)
 *
 * Chaque visuel est retrouve par sa cle (logo_..., picto_..., fond_...), puis
 * telecharge et expose sous forme d'URL locale (blob:). Chaque cle n'est
 * demandee qu'une fois par session ; un fichier absent est memorise (null) et
 * l'affiche bascule sur son rendu de secours, sans erreur visible.
 */

import { urlMedia } from './pb-appwrite';

const cache = new Map<string, Promise<string | null>>();
const enCours = new Set<Promise<string | null>>();

async function telecharger(fileId: string): Promise<string | null> {
  try {
    const url = await urlMedia(fileId);
    if (!url) return null;
    // « no-cache » : un logo remplace sous la meme cle ne reste pas en ancienne version.
    const reponse = await fetch(url, { cache: 'no-cache' });
    if (!reponse.ok) return null;
    const contenu = await reponse.blob();
    if (!contenu.type.startsWith('image/')) return null;
    return URL.createObjectURL(contenu);
  } catch {
    return null;
  }
}

/** Renvoie une URL affichable pour le fichier, ou null s'il n'existe pas. */
export function chargerMedia(fileId: string): Promise<string | null> {
  const existant = cache.get(fileId);
  if (existant) return existant;

  const promesse = telecharger(fileId);
  cache.set(fileId, promesse);
  enCours.add(promesse);
  void promesse.finally(() => enCours.delete(promesse));
  return promesse;
}

/**
 * Retire un fichier du cache, apres son remplacement ou sa suppression : le
 * prochain affichage ira chercher la nouvelle version.
 */
export function oublierMedia(fileId: string): void {
  // L'ancienne URL n'est pas revoquee : une image encore affichee l'utilise
  // peut-etre. Le navigateur la liberera a la fermeture de la page.
  cache.delete(fileId);
}

/** Resout quand tous les telechargements lances sont termines. */
export async function attendreMedias(): Promise<void> {
  while (enCours.size > 0) {
    await Promise.allSettled([...enCours]);
  }
}

/**
 * Attend que la page soit prete a etre imprimee : visuels telecharges, images
 * decodees et polices chargees. Sans cette attente, le navigateur imprimerait
 * des emplacements vides.
 */
export async function attendreRenduComplet(): Promise<void> {
  await attendreMedias();
  // Laisse React inserer les images obtenues avant de les inspecter.
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  const images = Array.from(document.images).filter((img) => !img.complete);
  await Promise.allSettled(
    images.map(
      (img) =>
        new Promise((r) => {
          img.addEventListener('load', r, { once: true });
          img.addEventListener('error', r, { once: true });
        }),
    ),
  );
  if ('fonts' in document) await document.fonts.ready;
}
