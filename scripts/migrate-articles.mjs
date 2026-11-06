// @ts-check
/**
 * AFFICHES-EM v1.0 — Migration de la table « articles » (phase 1.2)
 * ---------------------------------------------------------------------------
 * L'analyse de l'export reel (BD-EM-1108.xlsx, 2 419 articles) a montre que les
 * six colonnes de pictogrammes ne sont pas des champs typees mais des
 * EMPLACEMENTS GENERIQUES dont le sens change selon la famille de produit :
 *
 *   Emplacement 1 : « SMART » sur un televiseur, « 4Go » de RAM sur un
 *                   smartphone, « 8kg » de capacite sur un lave-linge.
 *   Emplacement 5 : « 1AN » de garantie le plus souvent, mais « Black » —
 *                   une couleur — sur quatorze articles Samsung et Apple.
 *
 * Le modele initial supposait des champs semantiques (garantieAnnees,
 * pictosTechniques). Il ne correspond pas a l'usage reel et empecherait de
 * reproduire fidelement les affiches existantes.
 *
 * Cette migration remplace ces deux colonnes par picto1 a picto6, qui
 * preservent aussi l'ordre d'affichage — lequel compte visuellement.
 *
 * Le script est IDEMPOTENT : relançable sans dommage.
 *
 * Utilisation :
 *   1. Ajoutez temporairement APPWRITE_API_KEY dans .env.local
 *   2. npm run migrate:articles
 *   3. Supprimez la cle et revoquez-la dans la console Appwrite
 */

import { readFileSync } from 'node:fs';
import { Client, TablesDB } from 'node-appwrite';

/* -------------------------------------------------------------------------- */

function chargerEnv() {
  try {
    const contenu = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
    for (const ligne of contenu.split('\n')) {
      const nette = ligne.trim();
      if (!nette || nette.startsWith('#')) continue;
      const sep = nette.indexOf('=');
      if (sep === -1) continue;
      const cle = nette.slice(0, sep).trim();
      const valeur = nette.slice(sep + 1).trim().replace(/^["']|["']$/g, '');
      if (!(cle in process.env)) process.env[cle] = valeur;
    }
  } catch {
    /* fichier absent : on utilise les variables du shell */
  }
}

chargerEnv();

const ENDPOINT = process.env.VITE_APPWRITE_ENDPOINT ?? '';
const PROJECT_ID = process.env.VITE_APPWRITE_PROJECT_ID ?? '';
const DATABASE_ID = process.env.VITE_APPWRITE_DATABASE_ID ?? 'affiches-em';
const API_KEY = process.env.APPWRITE_API_KEY ?? '';

if (!ENDPOINT || !PROJECT_ID || !API_KEY) {
  console.error(`
Configuration incomplete.

Ajoutez temporairement dans .env.local :
  APPWRITE_API_KEY=votre-cle-api

La cle se cree dans la console Appwrite (Overview > API Keys) avec les
peripheries columns.read et columns.write.
`);
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const tablesDB = new TablesDB(client);

const TABLE = 'articles';

/* -------------------------------------------------------------------------- */

/** @param {string} msg */
const ok = (msg) => console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
/** @param {string} msg */
const skip = (msg) => console.log(`  \x1b[90m•\x1b[0m ${msg} \x1b[90m(deja fait)\x1b[0m`);
/** @param {string} msg */
const titre = (msg) => console.log(`\n\x1b[1m${msg}\x1b[0m`);

const pause = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));

/** @param {any} erreur */
const estAbsent = (erreur) => erreur?.code === 404;
/** @param {any} erreur */
const estDejaExistant = (erreur) =>
  erreur?.code === 409 || String(erreur?.type ?? '').endsWith('_already_exists');

/** Attend que toutes les colonnes de la table soient exploitables. */
async function attendreColonnes() {
  const debut = Date.now();
  while (Date.now() - debut < 90_000) {
    const { columns } = await tablesDB.listColumns({ databaseId: DATABASE_ID, tableId: TABLE });
    const enAttente = columns.filter((c) => c.status !== 'available');
    if (enAttente.length === 0) return;
    const enEchec = enAttente.filter((c) => c.status === 'failed');
    if (enEchec.length > 0) {
      throw new Error(`Colonnes en echec : ${enEchec.map((c) => c.key).join(', ')}`);
    }
    await pause(1000);
  }
  throw new Error('Delai depasse en attendant les colonnes.');
}

/* -------------------------------------------------------------------------- */

async function main() {
  console.log(`
\x1b[1mAFFICHES-EM v1.0 — Migration « articles »\x1b[0m
  Projet : ${PROJECT_ID}
  Base   : ${DATABASE_ID}`);

  titre('Ajout des six emplacements de pictogrammes');

  for (let i = 1; i <= 6; i++) {
    const cle = `picto${i}`;
    try {
      await tablesDB.createStringColumn({
        databaseId: DATABASE_ID,
        tableId: TABLE,
        key: cle,
        size: 60,
        required: false,
      });
      ok(`Colonne "${cle}"`);
    } catch (erreur) {
      if (estDejaExistant(erreur)) skip(`Colonne "${cle}"`);
      else throw erreur;
    }
  }

  process.stdout.write('  \x1b[90m… attente de la disponibilite des colonnes\x1b[0m\r');
  await attendreColonnes();
  process.stdout.write('                                                      \r');

  titre('Suppression des colonnes obsoletes');

  for (const cle of ['garantieAnnees', 'pictosTechniques']) {
    try {
      await tablesDB.deleteColumn({ databaseId: DATABASE_ID, tableId: TABLE, key: cle });
      ok(`Colonne "${cle}" supprimee`);
    } catch (erreur) {
      if (estAbsent(erreur)) skip(`Colonne "${cle}"`);
      else throw erreur;
    }
  }

  console.log(`
\x1b[1;32mMigration terminee.\x1b[0m

La table « articles » comporte desormais picto1 a picto6.
Pensez a retirer APPWRITE_API_KEY de .env.local et a revoquer la cle.
`);
}

main().catch((/** @type {any} */ erreur) => {
  console.error(`\n  \x1b[31m✗\x1b[0m Migration interrompue.\n\n  ${erreur?.message ?? erreur}`);
  if (erreur?.code === 401) {
    console.error(
      "\n  Erreur d'authentification : verifiez APPWRITE_API_KEY et ses peripheries\n" +
        '  (columns.read et columns.write sont necessaires).',
    );
  }
  console.error('\n  Le script est relancable : corrigez puis relancez npm run migrate:articles\n');
  process.exit(1);
});
