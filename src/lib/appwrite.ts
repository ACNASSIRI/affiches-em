/**
 * AFFICHES-EM — Connexion au serveur PocketBase
 *
 * En ligne, PocketBase est servi par le meme domaine que l'application
 * (Caddy redirige /api vers PocketBase) : aucune adresse a configurer.
 * En developpement, VITE_PB_URL peut pointer vers un autre serveur ; a defaut,
 * le serveur de Vite relaie /api vers http://127.0.0.1:8090.
 *
 * Les modules metier importent toujours « Client, TablesDB... » : ces classes
 * viennent de la couche de compatibilite ./pb-appwrite.
 */

import { Client, Account, TablesDB, Storage, Teams } from './pb-appwrite';

const endpoint = import.meta.env.VITE_PB_URL || window.location.origin;

/** Toujours vrai : le serveur est sur le meme domaine que l'application. */
export const estConfigure: boolean = true;

const client = new Client().setEndpoint(endpoint);

export const account = new Account(client);
export const tablesDB = new TablesDB(client);
export const storage = new Storage(client);
export const teams = new Teams(client);

export { client };

/** Base de donnees creee a l'etape 0.4. */
export const DATABASE_ID = 'affiches-em';

/**
 * Identifiants des tables et compartiments.
 * Regroupes ici pour eviter les chaines de caracteres disseminees dans le code.
 */
export const TABLES = {
  MARQUES: 'marques',
  ARTICLES: 'articles',
  CAMPAGNES: 'campagnes',
  AFFICHES: 'affiches',
  PARAMETRES: 'parametres',
  JOURNAL: 'journal',
  DEMANDES_ARTICLE: 'demandes-article',
} as const;

/**
 * Compartiment unique regroupant tous les visuels.
 *
 * Les trois familles envisagees au cadrage (photos produits, logos de marques,
 * pictogrammes) partagent les memes permissions et les memes reglages : les
 * separer n'apportait qu'un confort de rangement, et le plan gratuit d'Appwrite
 * n'autorise de toute facon qu'un compartiment.
 *
 * La distinction se fait par un prefixe dans l'identifiant du fichier, ce qui
 * permet aussi de retrouver directement un visuel a partir de la donnee qui le
 * porte, sans stocker d'identifiant supplementaire.
 */
export const BUCKET_MEDIAS = 'medias';

/** Construit l'identifiant du logo d'une marque. */
export const idLogo = (marqueId: string) => `logo_${marqueId}`;

/** Construit l'identifiant de la photo d'un article, a partir de son EAN. */
export const idPhotoProduit = (ean: string) => `photo_${ean}`;

/**
 * Construit l'identifiant d'un pictogramme de la bibliotheque.
 *
 * Appwrite n'accepte dans un identifiant que lettres, chiffres, point, tiret et
 * souligne (36 caracteres au plus) : « SMART TV » devient `picto_SMART_TV`.
 */
export const idPictogramme = (code: string) =>
  `picto_${code.trim().toUpperCase().replace(/[^A-Z0-9._-]+/g, '_')}`.slice(0, 36);

/** Construit l'identifiant du visuel de fond d'une affiche. */
export const idVisuelFond = (afficheId: string) => `fond_${afficheId}`;

/** Equipes Appwrite portant les roles applicatifs. */
export const EQUIPES = {
  OPERATEURS: 'operateurs',
  ADMINISTRATEURS: 'administrateurs',
} as const;
