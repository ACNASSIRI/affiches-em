// @ts-check
/**
 * AFFICHES-EM — Mise a niveau de la base Appwrite
 * ---------------------------------------------------------------------------
 * Le script d'installation (setup-appwrite.mjs) cree la structure de depart.
 * L'application a evolue depuis et ecrit des colonnes qu'il ne cree pas :
 *
 *   articles   picto1 … picto6   (remplacent garantieAnnees / pictosTechniques)
 *   campagnes  gabarit           (gabarit d'affiche choisi pour la campagne)
 *   affiches   mentions          (badges : nouveau, exclusivite, …)
 *   journal    utilisateur, appareil
 *
 * Sans elles : « Invalid document structure: Unknown attribute: "picto1" ».
 *
 * IDEMPOTENT : relancable sans dommage. Utilisation : npm run completer:schema
 * Necessite APPWRITE_API_KEY dans .env.local (droits tables / columns).
 */

import { readFileSync } from 'node:fs';
import { Client, TablesDB } from 'node-appwrite';

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
    /* variables du shell */
  }
}

chargerEnv();

const ENDPOINT = process.env.VITE_APPWRITE_ENDPOINT ?? '';
const PROJECT_ID = process.env.VITE_APPWRITE_PROJECT_ID ?? '';
const DATABASE_ID = process.env.VITE_APPWRITE_DATABASE_ID || 'affiches-em';
const API_KEY = process.env.APPWRITE_API_KEY ?? '';

if (!ENDPOINT || !PROJECT_ID || !API_KEY) {
  console.error('\n[X] .env.local incomplet : VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID et APPWRITE_API_KEY sont requis.\n');
  process.exit(1);
}

const tablesDB = new TablesDB(new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY));

/** Colonnes texte a ajouter : [table, cle, taille]. */
const AJOUTS = [
  ['articles', 'picto1', 60],
  ['articles', 'picto2', 60],
  ['articles', 'picto3', 60],
  ['articles', 'picto4', 60],
  ['articles', 'picto5', 60],
  ['articles', 'picto6', 60],
  ['campagnes', 'gabarit', 64],
  ['affiches', 'mentions', 500],
  ['journal', 'utilisateur', 120],
  ['journal', 'appareil', 250],
];

/** Colonnes de l'ancien modele que l'application n'envoie plus. */
const SUPPRESSIONS = [
  ['articles', 'garantieAnnees'],
  ['articles', 'pictosTechniques'],
];

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
/** @param {any} e */
const code = (e) => e?.code;
/** @param {any} e */
const message = (e) => e?.message ?? String(e);

async function colonnes(/** @type {string} */ tableId) {
  const { columns } = await tablesDB.listColumns({ databaseId: DATABASE_ID, tableId });
  return /** @type {{ key: string, status: string }[]} */ (/** @type {unknown} */ (columns));
}

async function main() {
  console.log(`\nMise a niveau de la base "${DATABASE_ID}" (projet ${PROJECT_ID})\n`);
  let erreurs = 0;

  for (const [tableId, key, size] of AJOUTS) {
    try {
      await tablesDB.createStringColumn({
        databaseId: DATABASE_ID,
        tableId: String(tableId),
        key: String(key),
        size: Number(size),
        required: false,
      });
      console.log(`  + ${tableId}.${key}`);
    } catch (e) {
      if (code(e) === 409) console.log(`  = ${tableId}.${key} (deja presente)`);
      else {
        erreurs++;
        console.log(`  ✗ ${tableId}.${key} : ${message(e)}`);
      }
    }
  }

  // Appwrite cree les colonnes en arriere-plan : on attend qu'elles soient pretes.
  const tables = [...new Set(AJOUTS.map(([t]) => String(t)))];
  for (let essai = 0; essai < 60; essai++) {
    const etats = (await Promise.all(tables.map(colonnes))).flat();
    const enCours = etats.filter((c) => c.status === 'processing');
    const echecs = etats.filter((c) => c.status === 'failed');
    if (echecs.length) {
      erreurs++;
      console.log(`  ✗ colonnes en echec : ${echecs.map((c) => c.key).join(', ')}`);
      break;
    }
    if (!enCours.length) break;
    await pause(1000);
  }

  for (const [tableId, key] of SUPPRESSIONS) {
    try {
      await tablesDB.deleteColumn({ databaseId: DATABASE_ID, tableId, key });
      console.log(`  - ${tableId}.${key} (ancien modele, supprimee)`);
    } catch (e) {
      if (code(e) !== 404) {
        erreurs++;
        console.log(`  ✗ ${tableId}.${key} : ${message(e)}`);
      }
    }
  }

  console.log(
    erreurs
      ? `\n[X] ${erreurs} erreur(s). Corrigez puis relancez.\n`
      : '\n[OK] Base a jour. Vous pouvez ajouter des articles.\n',
  );
  if (erreurs) process.exitCode = 1;
}

main().catch((e) => {
  console.error(`\n[X] ${message(e)}\n`);
  process.exit(1);
});
