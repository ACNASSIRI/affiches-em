/**
 * AFFICHES-EM v1.0 — Acces aux donnees « articles »
 *
 * Les six emplacements de pictogrammes sont generiques : leur sens depend de la
 * famille de produit, pas de leur position. C'est le fonctionnement reel du
 * catalogue existant, ou l'emplacement 5 porte tantot une duree de garantie,
 * tantot une couleur. Le modele ne cherche donc pas a leur imposer une
 * semantique, mais preserve leur ordre, qui compte a l'affichage.
 */

import { ID, Query, AppwriteException } from './pb-appwrite';
import { tablesDB, DATABASE_ID, TABLES } from './appwrite';
import type { CategorieProduit } from '../config/constants';

/** Nombre d'emplacements de pictogrammes par article. */
export const NB_PICTOS = 6;

export interface Article {
  readonly id: string;
  readonly ean: string;
  readonly marqueId: string;
  readonly designation: string;
  readonly reference: string;
  readonly categorie: CategorieProduit;
  readonly photoFileId: string | null;
  /** Six emplacements ordonnes ; une chaine vide signifie « emplacement libre ». */
  readonly pictos: readonly string[];
  readonly livraisonGratuiteExclue: boolean;
  readonly actif: boolean;
}

export interface SaisieArticle {
  ean: string;
  marqueId: string;
  designation: string;
  reference: string;
  categorie: CategorieProduit;
  pictos: string[];
  livraisonGratuiteExclue: boolean;
  actif: boolean;
}

/**
 * Forme d'une ligne renvoyee par Appwrite.
 * Declaree localement plutot qu'importee du SDK : les noms des types de lignes
 * ont change entre versions (Document, Row, DefaultRow).
 */
interface LigneArticle {
  $id: string;
  ean: string;
  marqueId: string;
  designation: string;
  reference?: string | null;
  categorie: CategorieProduit;
  photoFileId?: string | null;
  picto1?: string | null;
  picto2?: string | null;
  picto3?: string | null;
  picto4?: string | null;
  picto5?: string | null;
  picto6?: string | null;
  livraisonGratuiteExclue?: boolean | null;
  actif?: boolean | null;
}

function versArticle(ligne: LigneArticle): Article {
  return {
    id: ligne.$id,
    ean: ligne.ean,
    marqueId: ligne.marqueId,
    designation: ligne.designation,
    reference: ligne.reference ?? '',
    categorie: ligne.categorie,
    photoFileId: ligne.photoFileId ?? null,
    pictos: [
      ligne.picto1 ?? '',
      ligne.picto2 ?? '',
      ligne.picto3 ?? '',
      ligne.picto4 ?? '',
      ligne.picto5 ?? '',
      ligne.picto6 ?? '',
    ],
    livraisonGratuiteExclue: ligne.livraisonGratuiteExclue ?? false,
    actif: ligne.actif ?? true,
  };
}

/** Convertit la saisie en charge utile Appwrite (emplacements a plat). */
function versDonnees(saisie: SaisieArticle): Record<string, unknown> {
  const donnees: Record<string, unknown> = {
    ean: saisie.ean.trim(),
    marqueId: saisie.marqueId,
    designation: saisie.designation.trim(),
    reference: saisie.reference.trim(),
    categorie: saisie.categorie,
    livraisonGratuiteExclue: saisie.livraisonGratuiteExclue,
    actif: saisie.actif,
  };
  for (let i = 0; i < NB_PICTOS; i++) {
    donnees[`picto${i + 1}`] = (saisie.pictos[i] ?? '').trim();
  }
  return donnees;
}

export interface PageArticles {
  readonly articles: Article[];
  readonly total: number;
}

export interface FiltresArticles {
  readonly recherche?: string;
  readonly marqueId?: string;
  readonly categorie?: CategorieProduit;
  readonly page?: number;
  readonly parPage?: number;
}

/**
 * Liste paginee des articles.
 *
 * Le catalogue reel compte environ 2 400 references : la pagination est
 * indispensable, Appwrite plafonnant de toute facon les reponses.
 *
 * La recherche interroge l'index plein texte sur `designation`, sauf si le
 * terme ressemble a un code — auquel cas elle porte sur `ean`. Cela evite a
 * l'operateur d'avoir a choisir un mode de recherche.
 */
export async function listerArticles(filtres: FiltresArticles = {}): Promise<PageArticles> {
  const parPage = filtres.parPage ?? 25;
  const page = filtres.page ?? 0;

  const requetes: string[] = [Query.limit(parPage), Query.offset(page * parPage)];

  const terme = filtres.recherche?.trim() ?? '';
  if (terme) {
    if (/^\d{4,}$/.test(terme)) {
      requetes.push(Query.startsWith('ean', terme));
    } else {
      requetes.push(Query.search('designation', terme));
    }
  } else {
    requetes.push(Query.orderAsc('designation'));
  }

  if (filtres.marqueId) requetes.push(Query.equal('marqueId', filtres.marqueId));
  if (filtres.categorie) requetes.push(Query.equal('categorie', filtres.categorie));

  const reponse = await tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId: TABLES.ARTICLES,
    queries: requetes,
  });

  return {
    articles: (reponse.rows as unknown as LigneArticle[]).map(versArticle),
    total: reponse.total,
  };
}

/** Recherche un article par son code exact. Renvoie null s'il n'existe pas. */
export async function trouverParEan(ean: string): Promise<Article | null> {
  const reponse = await tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId: TABLES.ARTICLES,
    queries: [Query.equal('ean', ean.trim()), Query.limit(1)],
  });
  const premiere = (reponse.rows as unknown as LigneArticle[])[0];
  return premiere ? versArticle(premiere) : null;
}

/**
 * Tous les codes deja presents au catalogue, lus par pages de 500 et reduits a
 * la seule colonne `ean`. Sert a l'import pour ne pas renvoyer a Appwrite des
 * articles qu'il refuserait de toute facon.
 */
export async function listerTousLesCodes(): Promise<Set<string>> {
  const codes = new Set<string>();
  const PAGE = 500;
  for (let offset = 0; ; offset += PAGE) {
    const reponse = await tablesDB.listRows({
      databaseId: DATABASE_ID,
      tableId: TABLES.ARTICLES,
      queries: [Query.select(['ean']), Query.limit(PAGE), Query.offset(offset)],
    });
    const lignes = reponse.rows as unknown as { ean: string }[];
    lignes.forEach((l) => codes.add(l.ean));
    if (lignes.length < PAGE || codes.size >= reponse.total) break;
  }
  return codes;
}

export async function creerArticle(saisie: SaisieArticle): Promise<Article> {
  const ligne = await tablesDB.createRow({
    databaseId: DATABASE_ID,
    tableId: TABLES.ARTICLES,
    rowId: ID.unique(),
    data: versDonnees(saisie),
  });
  return versArticle(ligne as unknown as LigneArticle);
}

export async function modifierArticle(id: string, saisie: SaisieArticle): Promise<Article> {
  const ligne = await tablesDB.updateRow({
    databaseId: DATABASE_ID,
    tableId: TABLES.ARTICLES,
    rowId: id,
    data: versDonnees(saisie),
  });
  return versArticle(ligne as unknown as LigneArticle);
}

export async function supprimerArticle(id: string): Promise<void> {
  await tablesDB.deleteRow({
    databaseId: DATABASE_ID,
    tableId: TABLES.ARTICLES,
    rowId: id,
  });
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Verifie la cle de controle d'un code EAN-13.
 *
 * Le catalogue reel contient 110 codes qui n'en sont pas (references internes
 * de 7 a 12 chiffres). Ils restent acceptes : la fonction sert a signaler une
 * anomalie probable, pas a bloquer la saisie.
 */
export function estEan13Valide(code: string): boolean {
  const c = code.trim();
  if (!/^\d{13}$/.test(c)) return false;
  let somme = 0;
  for (let i = 0; i < 12; i++) {
    somme += Number(c[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (somme % 10)) % 10 === Number(c[12]);
}

/** Renvoie la liste des problemes bloquants, vide si la saisie est valide. */
export function validerArticle(saisie: SaisieArticle): string[] {
  const problemes: string[] = [];
  if (!saisie.ean.trim()) problemes.push('Le code article est obligatoire.');
  if (!saisie.designation.trim()) problemes.push('La designation est obligatoire.');
  if (!saisie.marqueId) problemes.push('La marque est obligatoire.');
  return problemes;
}

/** Message lisible pour les erreurs les plus courantes. */
export function messageErreurArticle(erreur: unknown): string {
  if (!(erreur instanceof AppwriteException)) {
    return erreur instanceof Error ? erreur.message : 'Une erreur est survenue.';
  }
  if (erreur.code === 409) return 'Un article porte deja ce code.';
  // Appwrite repond 401 « user_unauthorized » quand les droits manquent : ce n'est pas une session expiree.
  if (erreur.type === 'user_unauthorized') return "Vous n'avez pas les droits pour cette action (reservee aux administrateurs).";
  if (erreur.code === 401) return 'Session expiree. Reconnectez-vous.';
  if (erreur.code === 403) return "Vous n'avez pas les droits pour cette action.";
  return erreur.message || 'Une erreur est survenue.';
}
