// @ts-check
/**
 * AFFICHES-EM — Copie des donnees Appwrite Cloud -> PocketBase (une fois)
 * ---------------------------------------------------------------------------
 * Lit le projet Appwrite (cle API de .env.local) et recopie dans PocketBase :
 *   1. les comptes (memes identifiants, role d'apres les equipes ; mots de
 *      passe repris de utilisateurs.json, sinon mot de passe aleatoire) ;
 *   2. toutes les tables (memes identifiants de lignes, proprietaire deduit
 *      des permissions) ;
 *   3. les fichiers du compartiment « medias » (logos, pictos, fonds).
 *
 * Le script peut etre relance sans risque : ce qui existe deja est mis a jour
 * (lignes) ou laisse tel quel (fichiers).
 *
 * Utilisation (ou double-clic sur MIGRER-DONNEES.bat) :
 *   npm run migrer:pocketbase   [--serveur=https://...] [--email=...]
 */

import { randomBytes } from 'node:crypto';
import { Client, Users, Teams, TablesDB, Storage, Query } from 'node-appwrite';
import {
  connecterPocketBase,
  lireUtilisateurs,
  enregistrerCompte,
  messageErreur,
  normaliser,
  DOMAINE_IDENTIFIANTS,
} from './pb-commun.mjs';

/* -------------------------------------------------------------------------- */
/* Appwrite                                                                   */
/* -------------------------------------------------------------------------- */

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || '';
const PROJET = process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID || '';
const CLE = process.env.APPWRITE_API_KEY || '';
const BASE = process.env.VITE_APPWRITE_DATABASE_ID || 'affiches-em';

if (!ENDPOINT || !PROJET || !CLE) {
  console.error(`
Il manque les acces Appwrite dans .env.local :
  VITE_APPWRITE_ENDPOINT=https://fra.cloud.appwrite.io/v1
  VITE_APPWRITE_PROJECT_ID=...
  APPWRITE_API_KEY=...   (droits users.read, teams.read, rows.read, files.read)
`);
  process.exit(1);
}

const aw = new Client().setEndpoint(ENDPOINT).setProject(PROJET).setKey(CLE);
const awUsers = new Users(aw);
const awTeams = new Teams(aw);
const awTables = new TablesDB(aw);
const awStorage = new Storage(aw);

/**
 * Parcourt toutes les entrees d'une liste Appwrite (pages de 100).
 * @template T
 * @param {(queries: string[]) => Promise<T[]>} page
 */
async function tout(page) {
  /** @type {T[]} */
  const sortie = [];
  /** @type {string | null} */
  let curseur = null;
  for (;;) {
    const queries = [Query.limit(100)];
    if (curseur) queries.push(Query.cursorAfter(curseur));
    const lot = await page(queries);
    sortie.push(...lot);
    if (lot.length < 100) return sortie;
    curseur = /** @type {any} */ (lot[lot.length - 1]).$id;
  }
}

/* -------------------------------------------------------------------------- */
/* Copie                                                                      */
/* -------------------------------------------------------------------------- */

const pb = await connecterPocketBase();
const bilan = /** @type {string[]} */ ([]);

// 1. Comptes ----------------------------------------------------------------
console.log('1/3 Comptes');
const fiches = new Map(lireUtilisateurs(false).map((f) => [f.identifiant, f]));
const membres = async (/** @type {string} */ teamId) =>
  new Set(
    (await tout((queries) => awTeams.listMemberships({ teamId, queries }).then((r) => r.memberships)).catch(() => [])).map(
      (m) => m.userId,
    ),
  );
const admins = await membres('administrateurs');
const operateurs = await membres('operateurs');

for (const u of await tout((queries) => awUsers.list({ queries }).then((r) => r.users))) {
  const identifiant = normaliser(u.email.replace(`@${DOMAINE_IDENTIFIANTS}`, ''));
  const fiche = fiches.get(identifiant);
  const role = fiche?.role ?? (admins.has(u.$id) ? 'administrateur' : operateurs.has(u.$id) ? 'operateur' : 'operateur');
  const motDePasse = fiche?.motDePasse ?? randomBytes(12).toString('base64url');
  try {
    await enregistrerCompte(pb, {
      id: u.$id,
      email: u.email,
      nom: fiche?.nom?.trim() || u.name || identifiant,
      role,
      actif: fiche ? fiche.actif !== false : u.status,
      motDePasse,
    });
    console.log(`  ✓ ${identifiant} (${role})`);
    if (!fiche?.motDePasse) bilan.push(`Compte « ${identifiant} » : mot de passe a definir dans utilisateurs.json puis COMPTES.bat.`);
  } catch (e) {
    console.log(`  ✗ ${identifiant} : ${messageErreur(e)}`);
  }
}

// 2. Tables -----------------------------------------------------------------
console.log('\n2/3 Tables');
const TABLES = ['marques', 'articles', 'parametres', 'campagnes', 'affiches', 'demandes-article', 'journal'];
const AVEC_PROPRIETAIRE = new Set(['campagnes', 'affiches', 'demandes-article']);

for (const table of TABLES) {
  const collection = table.replace(/-/g, '_');
  /** @type {any[]} */
  let lignes;
  try {
    lignes = await tout((queries) => awTables.listRows({ databaseId: BASE, tableId: table, queries }).then((r) => r.rows));
  } catch (e) {
    console.log(`  - ${table} : ignoree (${messageErreur(e)})`);
    continue;
  }
  let ok = 0;
  let ko = 0;
  for (const ligne of lignes) {
    /** @type {Record<string, unknown>} */
    const donnees = {};
    for (const [k, v] of Object.entries(ligne)) {
      if (!k.startsWith('$') && v !== null && v !== undefined) donnees[k] = v;
    }
    if (AVEC_PROPRIETAIRE.has(table)) {
      const perm = (ligne.$permissions ?? []).find((/** @type {string} */ p) => /user:/.test(p));
      const proprio = perm ? /user:([^"]+)/.exec(perm)?.[1] : ligne.createdBy || ligne.demandeur;
      if (proprio) donnees.proprietaire = proprio;
    }
    try {
      await pb.collection(collection).update(ligne.$id, donnees);
      ok++;
    } catch (e) {
      try {
        if (/** @type {any} */ (e)?.status !== 404) throw e;
        await pb.collection(collection).create({ id: ligne.$id, ...donnees });
        ok++;
      } catch (e2) {
        ko++;
        if (ko <= 5) console.log(`    ✗ ${table} ${ligne.$id} : ${messageErreur(e2)}`);
      }
    }
    if ((ok + ko) % 250 === 0) process.stdout.write(`    ${table} : ${ok + ko}/${lignes.length}\r`);
  }
  console.log(`  ✓ ${table.padEnd(18)} ${ok}/${lignes.length} lignes${ko ? `  (${ko} en erreur)` : ''}`);
  if (ko) bilan.push(`Table ${table} : ${ko} ligne(s) non copiee(s).`);
}

// 3. Fichiers ---------------------------------------------------------------
console.log('\n3/3 Fichiers (medias)');
const existants = new Set((await pb.collection('medias').getFullList({ fields: 'cle' })).map((r) => r.cle));
const fichiers = await tout((queries) => awStorage.listFiles({ bucketId: 'medias', queries }).then((r) => r.files)).catch(
  () => /** @type {any[]} */ ([]),
);
let copies = 0;
for (const f of fichiers) {
  if (existants.has(f.$id)) continue;
  try {
    const contenu = await awStorage.getFileDownload({ bucketId: 'medias', fileId: f.$id });
    const fichier = new File([Buffer.from(contenu)], f.name || `${f.$id}.png`, { type: f.mimeType });
    await pb.collection('medias').create({ cle: f.$id, fichier });
    copies++;
  } catch (e) {
    console.log(`  ✗ ${f.$id} : ${messageErreur(e)}`);
    bilan.push(`Fichier ${f.$id} non copie.`);
  }
}
console.log(`  ✓ ${copies} fichier(s) copies, ${fichiers.length - copies} deja presents ou en erreur.`);

console.log('\nTermine.');
if (bilan.length) console.log('\nA verifier :\n  - ' + bilan.join('\n  - '));
process.exit(0);
