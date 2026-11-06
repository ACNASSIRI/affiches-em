/**
 * AFFICHES-EM v1.0 — Acces aux donnees « campagnes » et « affiches »
 *
 * Une campagne regroupe les affiches d'une meme operation commerciale. Elle
 * remplace la feuille SAISIE_EM du classeur, qui ne pouvait en contenir qu'une
 * a la fois : chaque nouvelle operation ecrasait la precedente.
 */

import { ID, Query, AppwriteException, Permission, Role } from './pb-appwrite';
import { tablesDB, DATABASE_ID, TABLES } from './appwrite';
import type { FormatAffiche } from '../config/constants';
import { lireMentions, type CleBadge } from '../components/affiche/BadgesPromo';

export type StatutCampagne = 'brouillon' | 'validee' | 'imprimee' | 'archivee';

export interface Campagne {
  readonly id: string;
  readonly nom: string;
  readonly statut: StatutCampagne;
  readonly createdBy: string;
  readonly creeeLe: string;
  /**
   * Gabarit impose a toute la campagne (« electro », « nouvelles-technologies »
   * ou « op:<id> »), ou null pour le choix automatique selon la categorie.
   */
  readonly gabarit: string | null;
}

export interface Affiche {
  readonly id: string;
  readonly campagneId: string;
  readonly ean: string;
  readonly prixBarre: number;
  readonly prixPrincipal: number;
  readonly format: FormatAffiche;
  readonly stockLimite: boolean;
  readonly nouveaute: boolean;
  readonly promotion: boolean;
  /** Badges supplementaires : Vu dans le depliant, Exclusivite, Marjane s'engage. */
  readonly mentions: readonly CleBadge[];
  readonly ordre: number;
}

export interface SaisieAffiche {
  ean: string;
  prixBarre: number;
  prixPrincipal: number;
  format: FormatAffiche;
  stockLimite: boolean;
  nouveaute: boolean;
  promotion: boolean;
  mentions?: readonly CleBadge[];
}

interface LigneCampagne {
  $id: string;
  $createdAt: string;
  nom: string;
  statut?: StatutCampagne | null;
  createdBy?: string | null;
  gabarit?: string | null;
}

interface LigneAffiche {
  $id: string;
  campagneId: string;
  ean: string;
  prixBarre?: number | null;
  prixPrincipal: number;
  format?: FormatAffiche | null;
  stockLimite?: boolean | null;
  nouveaute?: boolean | null;
  promotion?: boolean | null;
  mentions?: string | null;
  ordre?: number | null;
}

const versCampagne = (l: LigneCampagne): Campagne => ({
  id: l.$id,
  nom: l.nom,
  statut: l.statut ?? 'brouillon',
  createdBy: l.createdBy ?? '',
  creeeLe: l.$createdAt,
  gabarit: l.gabarit || null,
});

const versAffiche = (l: LigneAffiche): Affiche => ({
  id: l.$id,
  campagneId: l.campagneId,
  ean: l.ean,
  prixBarre: l.prixBarre ?? 0,
  prixPrincipal: l.prixPrincipal,
  format: l.format ?? 'A4',
  stockLimite: l.stockLimite ?? false,
  nouveaute: l.nouveaute ?? false,
  promotion: l.promotion ?? false,
  mentions: lireMentions(l.mentions),
  ordre: l.ordre ?? 0,
});

/* -------------------------------------------------------------------------- */
/* Campagnes                                                                   */
/* -------------------------------------------------------------------------- */

export async function listerCampagnes(): Promise<Campagne[]> {
  const reponse = await tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId: TABLES.CAMPAGNES,
    queries: [Query.orderDesc('$createdAt'), Query.limit(100)],
  });
  return (reponse.rows as unknown as LigneCampagne[]).map(versCampagne);
}

/**
 * Cree une campagne appartenant a son auteur.
 *
 * Les permissions sont posees ligne par ligne : un operateur ne verra et ne
 * modifiera que ses propres campagnes, tandis que les administrateurs y ont
 * acces via les permissions de table. C'est Appwrite qui applique cette regle,
 * pas l'interface.
 */
export async function creerCampagne(nom: string, userId: string): Promise<Campagne> {
  const ligne = await tablesDB.createRow({
    databaseId: DATABASE_ID,
    tableId: TABLES.CAMPAGNES,
    rowId: ID.unique(),
    data: { nom: nom.trim(), statut: 'brouillon', createdBy: userId },
    permissions: [
      Permission.read(Role.user(userId)),
      Permission.update(Role.user(userId)),
      Permission.delete(Role.user(userId)),
    ],
  });
  return versCampagne(ligne as unknown as LigneCampagne);
}

export async function obtenirCampagne(id: string): Promise<Campagne> {
  const ligne = await tablesDB.getRow({
    databaseId: DATABASE_ID,
    tableId: TABLES.CAMPAGNES,
    rowId: id,
  });
  return versCampagne(ligne as unknown as LigneCampagne);
}

export async function changerStatutCampagne(
  id: string,
  statut: StatutCampagne,
): Promise<Campagne> {
  const ligne = await tablesDB.updateRow({
    databaseId: DATABASE_ID,
    tableId: TABLES.CAMPAGNES,
    rowId: id,
    data: { statut },
  });
  return versCampagne(ligne as unknown as LigneCampagne);
}

/**
 * Enregistre le gabarit de la campagne. Necessite la colonne `gabarit`
 * (texte, 64 caracteres, facultative) dans la table `campagnes`.
 */
export async function changerGabaritCampagne(id: string, gabarit: string | null): Promise<Campagne> {
  try {
    const ligne = await tablesDB.updateRow({
      databaseId: DATABASE_ID,
      tableId: TABLES.CAMPAGNES,
      rowId: id,
      data: { gabarit },
    });
    return versCampagne(ligne as unknown as LigneCampagne);
  } catch (erreur) {
    // Colonne absente : message guide. Tout autre refus : message exact d'Appwrite,
    // pour que la cause reelle (droits, type de colonne...) reste visible.
    if (
      erreur instanceof AppwriteException &&
      /unknown (attribute|column)/i.test(erreur.message) &&
      /gabarit/i.test(erreur.message)
    ) {
      throw new Error(
        "La colonne « gabarit » n'existe pas encore dans la table campagnes : ajoutez-la dans la console Appwrite (texte, facultative).",
      );
    }
    if (erreur instanceof AppwriteException) {
      throw new Error(`Appwrite (${erreur.code}${erreur.type ? ` ${erreur.type}` : ''}) : ${erreur.message}`);
    }
    throw erreur;
  }
}

export async function supprimerCampagne(id: string): Promise<void> {
  // Les affiches rattachees sont retirees d'abord : Appwrite n'assure pas de
  // suppression en cascade, et des affiches orphelines fausseraient les
  // comptages sans jamais etre visibles.
  const affiches = await listerAffiches(id);
  for (const affiche of affiches) {
    await supprimerAffiche(affiche.id);
  }
  await tablesDB.deleteRow({
    databaseId: DATABASE_ID,
    tableId: TABLES.CAMPAGNES,
    rowId: id,
  });
}

/* -------------------------------------------------------------------------- */
/* Affiches                                                                    */
/* -------------------------------------------------------------------------- */

export async function listerAffiches(campagneId: string): Promise<Affiche[]> {
  const reponse = await tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId: TABLES.AFFICHES,
    queries: [Query.equal('campagneId', campagneId), Query.orderAsc('ordre'), Query.limit(500)],
  });
  return (reponse.rows as unknown as LigneAffiche[]).map(versAffiche);
}

/** Colonne « mentions » absente de la table affiches (a creer dans Appwrite). */
const colonneMentionsAbsente = (e: unknown) =>
  e instanceof AppwriteException && /unknown (attribute|column).*mentions/i.test(e.message);

/**
 * Donnees envoyees a Appwrite. La colonne « mentions » n'est envoyee que si
 * elle sert, pour que l'application fonctionne avant sa creation.
 */
function versLigne(saisie: SaisieAffiche, avecMentions: boolean) {
  const { mentions, ...reste } = saisie;
  return avecMentions ? { ...reste, mentions: (mentions ?? []).join(',') } : reste;
}

/**
 * Enregistre la ligne ; si la colonne « mentions » n'existe pas encore,
 * enregistre sans elle. Les mentions sont alors perdues : l'ecran de saisie
 * le detecte (affiche renvoyee sans mentions) et previent l'utilisateur.
 */
async function avecRepli<T>(
  saisie: SaisieAffiche,
  envoi: (data: object) => Promise<T>,
  toujoursMentions = false,
): Promise<T> {
  // En modification, on envoie toujours la colonne pour pouvoir vider les mentions.
  const avecMentions = toujoursMentions || (saisie.mentions?.length ?? 0) > 0;
  try {
    return await envoi(versLigne(saisie, avecMentions));
  } catch (e) {
    if (avecMentions && colonneMentionsAbsente(e)) return envoi(versLigne(saisie, false));
    throw e;
  }
}

export async function ajouterAffiche(
  campagneId: string,
  saisie: SaisieAffiche,
  ordre: number,
  userId: string,
): Promise<Affiche> {
  const ligne = await avecRepli(saisie, (data) =>
    tablesDB.createRow({
      databaseId: DATABASE_ID,
      tableId: TABLES.AFFICHES,
      rowId: ID.unique(),
      data: { campagneId, ordre, ...data },
      permissions: [
        Permission.read(Role.user(userId)),
        Permission.update(Role.user(userId)),
        Permission.delete(Role.user(userId)),
      ],
    }),
  );
  return versAffiche(ligne as unknown as LigneAffiche);
}

export async function modifierAffiche(id: string, saisie: SaisieAffiche): Promise<Affiche> {
  const ligne = await avecRepli(saisie, (data) =>
    tablesDB.updateRow({
      databaseId: DATABASE_ID,
      tableId: TABLES.AFFICHES,
      rowId: id,
      data,
    }),
    true,
  );
  return versAffiche(ligne as unknown as LigneAffiche);
}

export async function supprimerAffiche(id: string): Promise<void> {
  await tablesDB.deleteRow({
    databaseId: DATABASE_ID,
    tableId: TABLES.AFFICHES,
    rowId: id,
  });
}

/* -------------------------------------------------------------------------- */

export const LIBELLE_STATUT: Readonly<Record<StatutCampagne, string>> = {
  brouillon: 'Brouillon',
  validee: 'Validee',
  imprimee: 'Imprimee',
  archivee: 'Archivee',
};

export function messageErreurCampagne(erreur: unknown): string {
  if (!(erreur instanceof AppwriteException)) {
    return erreur instanceof Error ? erreur.message : 'Une erreur est survenue.';
  }
  if (erreur.type === 'user_unauthorized') return "Vous n'avez pas les droits pour cette action.";
  if (erreur.code === 401) return 'Session expiree. Reconnectez-vous.';
  if (erreur.code === 403) return "Vous n'avez pas les droits pour cette action.";
  if (erreur.code === 404) return 'Element introuvable.';
  return erreur.message || 'Une erreur est survenue.';
}
