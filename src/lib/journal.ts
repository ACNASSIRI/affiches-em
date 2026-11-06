/**
 * AFFICHES-EM v1.0 — Journal d'activite
 *
 * Trace qui fait quoi, quand et depuis quel appareil : connexions,
 * affiches saisies, articles, marques, campagnes, impressions, parametres.
 *
 * Table `journal` (creee par setup-appwrite) : creation par tous les roles,
 * lecture reservee aux administrateurs. Personne ne peut modifier ni effacer
 * une ligne depuis l'application : le journal est une trace fiable.
 *
 * L'ecriture ne bloque jamais le travail : si le journal est indisponible,
 * l'action de l'utilisateur reste valable.
 */

import { AppwriteException, ID, Query } from './pb-appwrite';
import { account, tablesDB, DATABASE_ID, TABLES } from './appwrite';

/** Valeurs admises par la colonne enum `action` de la table. */
export type ActionJournal = 'creation' | 'modification' | 'suppression' | 'export' | 'connexion';

/** Familles d'evenements, colonne `ressource`. */
export type RessourceJournal =
  | 'session'
  | 'affiches'
  | 'articles'
  | 'marques'
  | 'campagnes'
  | 'gabarits'
  | 'parametres'
  | 'impression';

export const LIBELLE_RESSOURCE: Readonly<Record<string, string>> = {
  session: 'Connexion',
  affiches: 'Affiches',
  articles: 'Catalogue',
  marques: 'Marques',
  campagnes: 'Campagnes',
  gabarits: 'Gabarits',
  parametres: 'Parametres',
  impression: 'Impression',
};

export const LIBELLE_ACTION: Readonly<Record<ActionJournal, string>> = {
  creation: 'Ajout',
  modification: 'Modification',
  suppression: 'Suppression',
  export: 'Impression / export',
  connexion: 'Connexion',
};

export interface EntreeJournal {
  readonly id: string;
  readonly date: string;
  readonly action: ActionJournal;
  readonly ressource: string;
  readonly userId: string;
  readonly utilisateur: string;
  readonly appareil: string;
  readonly detail: string;
}

interface LigneJournal {
  $id: string;
  date: string;
  action: ActionJournal;
  ressource: string;
  userId: string;
  utilisateur?: string | null;
  appareil?: string | null;
  avant?: string | null;
  apres?: string | null;
}

/* -------------------------------------------------------------------------- */
/* Utilisateur et appareil courants                                            */
/* -------------------------------------------------------------------------- */

interface Auteur {
  readonly id: string;
  readonly nom: string;
}

let auteur: Auteur | null = null;
let appareil: string | null = null;

const CLE_NOM_APPAREIL = 'affiches-em.nom-appareil';

/** Nom libre donne a cet appareil (« PC Deco », « Tel. Karim »), memorise dans le navigateur. */
export function nomAppareilLocal(): string {
  try {
    return localStorage.getItem(CLE_NOM_APPAREIL) ?? '';
  } catch {
    return '';
  }
}

export function definirNomAppareilLocal(nom: string): void {
  try {
    if (nom.trim()) localStorage.setItem(CLE_NOM_APPAREIL, nom.trim().slice(0, 60));
    else localStorage.removeItem(CLE_NOM_APPAREIL);
  } catch {
    /* stockage indisponible (navigation privee) */
  }
  appareil = null;
}

/** Appele par le contexte d'authentification a chaque changement d'utilisateur. */
export function definirAuteur(u: Auteur | null): void {
  auteur = u;
  appareil = null;
}

/** Description de l'appareil fournie par Appwrite pour la session en cours. */
async function decrireAppareil(): Promise<string> {
  if (appareil) return appareil;
  const morceaux: string[] = [];
  const nomLocal = nomAppareilLocal();
  if (nomLocal) morceaux.push(`« ${nomLocal} »`);
  try {
    const s = await account.getSession({ sessionId: 'current' });
    const modele = [s.deviceBrand, s.deviceModel].filter(Boolean).join(' ');
    const type = s.deviceName ? { desktop: 'Ordinateur', smartphone: 'Telephone', tablet: 'Tablette' }[s.deviceName] ?? s.deviceName : '';
    const systeme = [s.osName, s.osVersion].filter(Boolean).join(' ');
    const navigateur = [s.clientName, s.clientVersion?.split('.')[0]].filter(Boolean).join(' ');
    morceaux.push([type, modele, systeme, navigateur].filter(Boolean).join(' · '));
    if (s.ip) morceaux.push(`IP ${s.ip}${s.countryName && s.countryName !== 'Unknown' ? ` (${s.countryName})` : ''}`);
  } catch {
    morceaux.push(navigator.userAgent.slice(0, 120));
  }
  appareil = morceaux.filter(Boolean).join(' — ').slice(0, 250);
  return appareil;
}

/* -------------------------------------------------------------------------- */
/* Ecriture                                                                    */
/* -------------------------------------------------------------------------- */

const colonneAbsente = (e: unknown) =>
  e instanceof AppwriteException && /unknown (attribute|column).*(utilisateur|appareil)/i.test(e.message);

/**
 * Ajoute une ligne au journal. Ne leve jamais d'erreur.
 * @param detail texte lisible, par ex. « Affiche 6923... — 4 999 dh (campagne Promo) »
 */
export async function journaliser(
  action: ActionJournal,
  ressource: RessourceJournal,
  detail: string,
): Promise<void> {
  if (!auteur) return;
  try {
    const machine = await decrireAppareil();
    const base = {
      action,
      ressource,
      userId: auteur.id,
      apres: detail.slice(0, 4000),
      date: new Date().toISOString(),
    };
    try {
      await tablesDB.createRow({
        databaseId: DATABASE_ID,
        tableId: TABLES.JOURNAL,
        rowId: ID.unique(),
        data: { ...base, utilisateur: auteur.nom.slice(0, 120), appareil: machine },
      });
    } catch (e) {
      if (!colonneAbsente(e)) throw e;
      // Colonnes pas encore creees : nom et appareil sont ranges dans « avant ».
      await tablesDB.createRow({
        databaseId: DATABASE_ID,
        tableId: TABLES.JOURNAL,
        rowId: ID.unique(),
        data: { ...base, avant: `${auteur.nom} — ${machine}`.slice(0, 4000) },
      });
    }
  } catch (e) {
    console.warn('[journal] ecriture impossible', e);
  }
}

/** Version « on n'attend pas » pour ne pas ralentir l'ecran. */
export function tracer(action: ActionJournal, ressource: RessourceJournal, detail: string): void {
  void journaliser(action, ressource, detail);
}

/* -------------------------------------------------------------------------- */
/* Lecture (administrateurs)                                                   */
/* -------------------------------------------------------------------------- */

const versEntree = (l: LigneJournal): EntreeJournal => {
  // Anciennes lignes ou colonnes absentes : nom et appareil sont dans « avant ».
  const [nomAvant, ...reste] = (l.avant ?? '').split(' — ');
  const secours = !l.utilisateur && l.ressource !== 'parametres';
  return {
    id: l.$id,
    date: l.date,
    action: l.action,
    ressource: l.ressource,
    userId: l.userId,
    utilisateur: l.utilisateur || (secours && nomAvant ? nomAvant : ''),
    appareil: l.appareil || (secours ? reste.join(' — ') : ''),
    detail:
      l.ressource === 'parametres' && l.avant
        ? `Avant : ${l.avant} — Apres : ${l.apres ?? ''}`
        : (l.apres ?? ''),
  };
};

/** Toutes les lignes depuis une date (lues par pages de 500, 2 000 au plus). */
export async function lireJournal(depuis: Date | null): Promise<EntreeJournal[]> {
  const lignes: LigneJournal[] = [];
  const PAGE = 500;
  for (let offset = 0; offset < 2000; offset += PAGE) {
    const queries = [Query.orderDesc('date'), Query.limit(PAGE), Query.offset(offset)];
    if (depuis) queries.push(Query.greaterThanEqual('date', depuis.toISOString()));
    const reponse = await tablesDB.listRows({
      databaseId: DATABASE_ID,
      tableId: TABLES.JOURNAL,
      queries,
    });
    const page = reponse.rows as unknown as LigneJournal[];
    lignes.push(...page);
    if (page.length < PAGE || lignes.length >= reponse.total) break;
  }
  return lignes.map(versEntree);
}

export function messageErreurJournal(erreur: unknown): string {
  if (erreur instanceof AppwriteException) {
    if (erreur.type === 'user_unauthorized') {
      return "Lecture du journal refusee : verifiez dans Appwrite que la table « journal » donne le droit Read a l'equipe administrateurs.";
    }
    if (erreur.code === 401) return 'Session expiree. Reconnectez-vous.';
    if (erreur.code === 403 || erreur.code === 404) {
      return "Lecture du journal refusee : verifiez dans Appwrite que la table « journal » donne le droit Read a l'equipe administrateurs.";
    }
    return erreur.message;
  }
  return erreur instanceof Error ? erreur.message : 'Une erreur est survenue.';
}
