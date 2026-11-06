/**
 * AFFICHES-EM v1.0 — Cache local des grosses lectures
 *
 * Appwrite facture chaque LIGNE lue (lire 2 400 articles = 2 400 lectures).
 * Le plan gratuit en autorise 500 000 par mois : relire tout le catalogue a
 * chaque ouverture du tableau de bord epuise ce quota en quelques semaines.
 *
 * Principe : les listes volumineuses sont gardees dans le navigateur et ne
 * sont relues que si elles ont change. Pour le savoir, une seule requete
 * « limit(1) » suffit : elle coute 1 lecture et renvoie le nombre total de
 * lignes. Si ce nombre n'a pas bouge et que le cache est recent, on le garde.
 */

import { Query } from './pb-appwrite';
import { tablesDB, DATABASE_ID } from './appwrite';

const PREFIXE = 'affiches-em.cache.';

interface Enveloppe<T> {
  readonly v: 1;
  readonly date: number;
  readonly total: number;
  readonly donnees: T;
}

export function lireCache<T>(cle: string): Enveloppe<T> | null {
  try {
    const texte = localStorage.getItem(PREFIXE + cle);
    if (!texte) return null;
    const e = JSON.parse(texte) as Enveloppe<T>;
    return e && e.v === 1 ? e : null;
  } catch {
    return null;
  }
}

export function ecrireCache<T>(cle: string, total: number, donnees: T): void {
  try {
    const e: Enveloppe<T> = { v: 1, date: Date.now(), total, donnees };
    localStorage.setItem(PREFIXE + cle, JSON.stringify(e));
  } catch {
    // Quota du navigateur depasse : on vide les anciens caches et on n'insiste pas.
    viderCaches();
  }
}

/** Efface tous les caches (bouton « Actualiser », deconnexion, changement d'utilisateur). */
export function viderCaches(prefixe = ''): void {
  try {
    const cles: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIXE + prefixe)) cles.push(k);
    }
    cles.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* stockage indisponible */
  }
}

/** Nombre de lignes visibles d'une table, pour 1 seule lecture. */
export async function compterLignes(tableId: string, requetes: string[] = []): Promise<number> {
  const reponse = await tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId,
    queries: [...requetes, Query.limit(1)],
  });
  return reponse.total;
}

const HEURE = 3600_000;

/**
 * Renvoie la liste depuis le cache si le nombre de lignes n'a pas change et
 * que le cache a moins de `ageMaxHeures` ; sinon relit tout avec `lireTout`.
 */
export async function lectureEconome<T>(options: {
  readonly cle: string;
  readonly tableId: string;
  readonly lireTout: () => Promise<T>;
  readonly ageMaxHeures?: number;
  readonly forcer?: boolean;
}): Promise<T> {
  const { cle, tableId, lireTout, ageMaxHeures = 24, forcer = false } = options;
  const cache = forcer ? null : lireCache<T>(cle);
  if (cache && Date.now() - cache.date < ageMaxHeures * HEURE) {
    const total = await compterLignes(tableId);
    if (total === cache.total) return cache.donnees;
  }
  const donnees = await lireTout();
  const total = Array.isArray(donnees) ? donnees.length : await compterLignes(tableId);
  ecrireCache(cle, total, donnees);
  return donnees;
}
