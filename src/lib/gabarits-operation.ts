/**
 * AFFICHES-EM v1.0 — Gabarits d'operation
 *
 * Un gabarit d'operation (« Maison & Beaute a prix legers », « Ramadan »,
 * « Rentree »…) remplace, pour une campagne, les cadres Electro et Nouvelles
 * technologies. Il se compose :
 * - d'une image A4 portrait (PNG de preference, centre transparent), rangee
 *   dans le compartiment « medias » sous l'identifiant `fond_op_<id>` ;
 * - d'une fiche dans la table `parametres`, cle `gabaritsOperation` : liste
 *   JSON des gabarits (nom, fichier, mise en page).
 *
 * Aucune modification du schema Appwrite n'est necessaire pour les gabarits
 * eux-memes. Seul le choix du gabarit par campagne demande une colonne
 * `gabarit` dans la table `campagnes` (voir campagnes.ts).
 */

import { ID, Query, AppwriteException } from './pb-appwrite';
import { storage, tablesDB, BUCKET_MEDIAS, DATABASE_ID, TABLES } from './appwrite';
import { oublierMedia } from './medias';
import { MODELES_INTEGRES, type Disposition, type ModeleAffiche } from '../config/gabarits';

const CLE = 'gabaritsOperation';
const DESCRIPTION = "Gabarits d'operation : liste JSON { id, nom, fileId, disposition, cadreDessus }";

export interface GabaritOperation {
  readonly id: string;
  readonly nom: string;
  readonly fileId: string;
  readonly disposition: Disposition;
  readonly cadreDessus: boolean;
}

/** Prefixe des choix de gabarit designant une operation. */
export const PREFIXE_OPERATION = 'op:';

export function versModele(g: GabaritOperation): ModeleAffiche {
  return {
    code: `${PREFIXE_OPERATION}${g.id}`,
    libelle: g.nom,
    cadreUrl: null,
    cadreFileId: g.fileId,
    cadreDessus: g.cadreDessus,
    disposition: g.disposition,
  };
}

interface LigneParametre {
  $id: string;
  cle: string;
  valeur: string;
}

async function lireLigne(): Promise<LigneParametre | null> {
  const reponse = await tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId: TABLES.PARAMETRES,
    queries: [Query.equal('cle', CLE), Query.limit(1)],
  });
  return (reponse.rows as unknown as LigneParametre[])[0] ?? null;
}

/** Liste des gabarits d'operation. Vide en cas d'absence ou d'erreur de lecture. */
export async function listerGabaritsOperation(): Promise<GabaritOperation[]> {
  try {
    const ligne = await lireLigne();
    if (!ligne) return [];
    const brut: unknown = JSON.parse(ligne.valeur);
    if (!Array.isArray(brut)) return [];
    return brut.filter(
      (g): g is GabaritOperation =>
        typeof g === 'object' &&
        g !== null &&
        typeof (g as GabaritOperation).id === 'string' &&
        typeof (g as GabaritOperation).fileId === 'string',
    );
  } catch {
    return [];
  }
}

async function enregistrerListe(liste: readonly GabaritOperation[]): Promise<void> {
  const valeur = JSON.stringify(liste);
  const ligne = await lireLigne();
  if (ligne) {
    await tablesDB.updateRow({
      databaseId: DATABASE_ID,
      tableId: TABLES.PARAMETRES,
      rowId: ligne.$id,
      data: { valeur },
    });
  } else {
    await tablesDB.createRow({
      databaseId: DATABASE_ID,
      tableId: TABLES.PARAMETRES,
      rowId: ID.unique(),
      data: { cle: CLE, valeur, description: DESCRIPTION },
    });
  }
}

/**
 * Le centre de l'image est-il transparent ? Si oui, le cadre se pose
 * au-dessus du contenu, comme les cadres Electro. Sinon (JPEG, fond blanc),
 * il passe dessous pour ne pas masquer les prix.
 */
async function centreTransparent(fichier: File): Promise<boolean> {
  try {
    const image = await createImageBitmap(fichier);
    const canvas = document.createElement('canvas');
    canvas.width = 40;
    canvas.height = 40;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    ctx.drawImage(image, image.width * 0.3, image.height * 0.45, image.width * 0.4, image.height * 0.2, 0, 0, 40, 40);
    image.close();
    const pixels = ctx.getImageData(0, 0, 40, 40).data;
    let transparents = 0;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i]! < 20) transparents += 1;
    return transparents > (pixels.length / 4) * 0.8;
  } catch {
    return false;
  }
}

export const ACCEPT_GABARIT = '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp';

/** Ajoute un gabarit d'operation : envoi de l'image puis mise a jour de la liste. */
export async function ajouterGabaritOperation(
  nom: string,
  fichier: File,
  disposition: Disposition,
): Promise<GabaritOperation> {
  const nomPropre = nom.trim();
  if (!nomPropre) throw new Error("Donnez un nom a l'operation.");
  if (!/\.(png|jpe?g|webp)$/i.test(fichier.name)) {
    throw new Error('Format non accepte. Utilisez une image PNG (conseille), JPG ou WEBP.');
  }
  if (fichier.size > 10 * 1024 * 1024) throw new Error('Image trop lourde (10 Mo maximum).');

  const id = ID.unique().slice(0, 20);
  const fileId = `fond_op_${id}`;
  const cadreDessus = await centreTransparent(fichier);
  await storage.createFile({ bucketId: BUCKET_MEDIAS, fileId, file: fichier });

  const gabarit: GabaritOperation = { id, nom: nomPropre, fileId, disposition, cadreDessus };
  const liste = await listerGabaritsOperation();
  try {
    await enregistrerListe([...liste, gabarit]);
  } catch (erreur) {
    // La fiche n'a pas pu etre enregistree : on ne laisse pas d'image orpheline.
    await storage.deleteFile({ bucketId: BUCKET_MEDIAS, fileId }).catch(() => undefined);
    throw erreur;
  }
  return gabarit;
}

/** Change la mise en page d'un gabarit existant. */
export async function modifierDisposition(id: string, disposition: Disposition): Promise<void> {
  const liste = await listerGabaritsOperation();
  await enregistrerListe(liste.map((g) => (g.id === id ? { ...g, disposition } : g)));
}

/** Supprime un gabarit et son image. Les campagnes qui l'utilisaient reviennent en automatique. */
export async function supprimerGabaritOperation(gabarit: GabaritOperation): Promise<void> {
  const liste = await listerGabaritsOperation();
  await enregistrerListe(liste.filter((g) => g.id !== gabarit.id));
  try {
    await storage.deleteFile({ bucketId: BUCKET_MEDIAS, fileId: gabarit.fileId });
  } catch (erreur) {
    if (!(erreur instanceof AppwriteException && erreur.code === 404)) throw erreur;
  }
  oublierMedia(gabarit.fileId);
}

export function messageErreurGabarit(erreur: unknown): string {
  if (!(erreur instanceof AppwriteException)) {
    return erreur instanceof Error ? erreur.message : 'Une erreur est survenue.';
  }
  if (erreur.type === 'user_unauthorized') return "Vous n'avez pas les droits pour cette action.";
  if (erreur.code === 401) return 'Session expiree. Reconnectez-vous.';
  if (erreur.code === 403) return 'Seuls les administrateurs peuvent gerer les gabarits.';
  return erreur.message || 'Une erreur est survenue.';
}

/**
 * Modele impose par un choix de campagne, ou null pour « automatique ».
 * Un gabarit d'operation supprime depuis retombe en automatique.
 */
export function modeleDepuisChoix(
  choix: string | null | undefined,
  operations: readonly GabaritOperation[],
): ModeleAffiche | null {
  if (!choix || choix === 'auto') return null;
  if (choix === 'electro' || choix === 'nouvelles-technologies') return MODELES_INTEGRES[choix];
  if (choix.startsWith(PREFIXE_OPERATION)) {
    const g = operations.find((o) => `${PREFIXE_OPERATION}${o.id}` === choix);
    return g ? versModele(g) : null;
  }
  return null;
}
