/**
 * AFFICHES-EM v1.0 — Acces aux donnees « marques »
 *
 * Couche mince au-dessus d'Appwrite : elle traduit les lignes brutes en objets
 * du domaine et centralise les requetes. Les composants d'interface n'ont ainsi
 * jamais a manipuler les identifiants de table ni la forme des reponses.
 */

import { ID, Query, AppwriteException } from './pb-appwrite';
import { tablesDB, DATABASE_ID, TABLES } from './appwrite';

export interface Marque {
  readonly id: string;
  readonly nom: string;
  readonly logoFileId: string | null;
  readonly actif: boolean;
}

/** Champs modifiables depuis l'interface. */
export interface SaisieMarque {
  nom: string;
  actif: boolean;
}

/**
 * Forme d'une ligne telle que renvoyee par Appwrite.
 *
 * Le type est decrit ici plutot qu'importe du SDK : les noms des types de
 * lignes ont change entre versions du SDK (Document, Row, DefaultRow), et une
 * declaration locale evite que le projet cesse de compiler a la prochaine mise
 * a jour. Seuls les champs reellement utilises sont declares.
 */
interface LigneMarque {
  $id: string;
  nom: string;
  logoFileId?: string | null;
  actif?: boolean | null;
}

function versMarque(ligne: LigneMarque): Marque {
  return {
    id: ligne.$id,
    nom: ligne.nom,
    logoFileId: ligne.logoFileId ?? null,
    // La colonne accepte le vide : une marque sans valeur est consideree active.
    actif: ligne.actif ?? true,
  };
}

/**
 * Liste les marques par ordre alphabetique.
 *
 * La limite de 500 couvre largement les 78 marques du catalogue reel. Elle est
 * explicite plutot que laissee au defaut d'Appwrite (25), qui aurait tronque la
 * liste sans le signaler.
 */
export async function listerMarques(): Promise<Marque[]> {
  const reponse = await tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId: TABLES.MARQUES,
    queries: [Query.orderAsc('nom'), Query.limit(500)],
  });
  return (reponse.rows as unknown as LigneMarque[]).map(versMarque);
}

export async function creerMarque(saisie: SaisieMarque): Promise<Marque> {
  const ligne = await tablesDB.createRow({
    databaseId: DATABASE_ID,
    tableId: TABLES.MARQUES,
    rowId: ID.unique(),
    data: { nom: saisie.nom.trim(), actif: saisie.actif },
  });
  return versMarque(ligne as unknown as LigneMarque);
}

export async function modifierMarque(id: string, saisie: SaisieMarque): Promise<Marque> {
  const ligne = await tablesDB.updateRow({
    databaseId: DATABASE_ID,
    tableId: TABLES.MARQUES,
    rowId: id,
    data: { nom: saisie.nom.trim(), actif: saisie.actif },
  });
  return versMarque(ligne as unknown as LigneMarque);
}

export async function supprimerMarque(id: string): Promise<void> {
  await tablesDB.deleteRow({
    databaseId: DATABASE_ID,
    tableId: TABLES.MARQUES,
    rowId: id,
  });
}

/**
 * Cree plusieurs marques en une passe, en ignorant celles qui existent deja.
 *
 * Appwrite ne propose pas d'insertion en lot : les creations sont donc
 * sequentielles. Un doublon (contrainte d'unicite sur `nom`) n'interrompt pas
 * le traitement — il est compte comme ignore, ce qui rend l'import relancable
 * sans creer de doublons.
 */
export interface ResultatImport {
  readonly crees: number;
  readonly ignores: number;
  readonly erreurs: { readonly nom: string; readonly message: string }[];
}

export async function importerMarques(
  noms: readonly string[],
  surProgression?: (traites: number, total: number) => void,
): Promise<ResultatImport> {
  let crees = 0;
  let ignores = 0;
  const erreurs: { nom: string; message: string }[] = [];

  for (const [index, nom] of noms.entries()) {
    try {
      await creerMarque({ nom, actif: true });
      crees += 1;
    } catch (erreur) {
      if (erreur instanceof AppwriteException && estDoublon(erreur)) {
        ignores += 1;
      } else {
        erreurs.push({
          nom,
          message: erreur instanceof Error ? erreur.message : 'Erreur inconnue',
        });
      }
    }
    surProgression?.(index + 1, noms.length);
  }

  return { crees, ignores, erreurs };
}

/** Vrai si l'erreur correspond a une violation de la contrainte d'unicite. */
function estDoublon(erreur: AppwriteException): boolean {
  return erreur.code === 409 || erreur.type === 'row_already_exists';
}

/** Message lisible pour les erreurs les plus courantes. */
export function messageErreur(erreur: unknown): string {
  if (!(erreur instanceof AppwriteException)) {
    return erreur instanceof Error ? erreur.message : 'Une erreur est survenue.';
  }
  if (estDoublon(erreur)) return 'Cette marque existe deja.';
  if (erreur.type === 'user_unauthorized') return "Vous n'avez pas les droits pour cette action.";
  if (erreur.code === 401) return 'Session expiree. Reconnectez-vous.';
  if (erreur.code === 403) return "Vous n'avez pas les droits pour cette action.";
  return erreur.message || 'Une erreur est survenue.';
}
