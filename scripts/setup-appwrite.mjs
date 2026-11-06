// @ts-check
/**
 * AFFICHES-EM v1.0 — Installation de la structure Appwrite (etape 0.4)
 * ---------------------------------------------------------------------------
 * Cree la base de donnees, les equipes, les 7 tables avec leurs colonnes et
 * index, ainsi que les 3 compartiments de fichiers.
 *
 * Le script est IDEMPOTENT : il peut etre relance sans dommage. Tout element
 * deja present est signale puis ignore. En cas d'interruption, relancez-le
 * simplement.
 *
 * Utilisation :
 *   1. Renseignez APPWRITE_API_KEY dans .env.local
 *   2. npm run setup:appwrite
 *   3. Supprimez la cle API une fois l'installation terminee
 *
 * La cle API est un VRAI secret, contrairement a l'identifiant de projet :
 * elle donne un acces administrateur complet. Elle ne doit jamais etre
 * commitee ni figurer dans le code compile (aucun prefixe VITE_).
 */

import { readFileSync } from 'node:fs';
import { Client, TablesDB, Storage, Teams, Permission, Role } from 'node-appwrite';
import { TablesDBIndexType } from 'node-appwrite';

/* ========================================================================== */
/* Configuration                                                              */
/* ========================================================================== */

/** Charge .env.local sans dependance externe. */
function chargerEnv() {
  try {
    const contenu = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
    for (const ligne of contenu.split('\n')) {
      const nette = ligne.trim();
      if (!nette || nette.startsWith('#')) continue;
      const separateur = nette.indexOf('=');
      if (separateur === -1) continue;
      const cle = nette.slice(0, separateur).trim();
      const valeur = nette.slice(separateur + 1).trim().replace(/^["']|["']$/g, '');
      if (!(cle in process.env)) process.env[cle] = valeur;
    }
  } catch {
    // Fichier absent : on se rabat sur les variables d'environnement du shell.
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

Verifiez que .env.local contient bien :

  VITE_APPWRITE_ENDPOINT=https://fra.cloud.appwrite.io/v1
  VITE_APPWRITE_PROJECT_ID=votre-identifiant-de-projet
  VITE_APPWRITE_DATABASE_ID=affiches-em
  APPWRITE_API_KEY=votre-cle-api

La cle API se cree dans la console Appwrite : Overview > Integrations > API Keys.
`);
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);

const tablesDB = new TablesDB(client);
const storage = new Storage(client);
const teams = new Teams(client);

/* ========================================================================== */
/* Identifiants et permissions                                                */
/* ========================================================================== */

const TEAM_OPERATEURS = 'operateurs';
const TEAM_ADMINISTRATEURS = 'administrateurs';

const roleOperateurs = Role.team(TEAM_OPERATEURS);
const roleAdmins = Role.team(TEAM_ADMINISTRATEURS);

/** Catalogue de reference : lecture pour tous, ecriture reservee aux admins. */
const PERMS_REFERENCE = [
  Permission.read(roleOperateurs),
  Permission.read(roleAdmins),
  Permission.create(roleAdmins),
  Permission.update(roleAdmins),
  Permission.delete(roleAdmins),
];

/**
 * Donnees de travail : chaque operateur cree ses propres lignes et n'accede
 * qu'aux siennes. La securite au niveau ligne (rowSecurity) complete ces
 * regles avec des permissions individuelles posees a la creation.
 */
const PERMS_TRAVAIL = [
  Permission.create(roleOperateurs),
  Permission.create(roleAdmins),
  Permission.read(roleAdmins),
  Permission.update(roleAdmins),
  Permission.delete(roleAdmins),
];

/** Demandes d'article : creees par les operateurs, traitees par les admins. */
const PERMS_DEMANDES = [
  Permission.create(roleOperateurs),
  Permission.create(roleAdmins),
  Permission.read(roleAdmins),
  Permission.update(roleAdmins),
  Permission.delete(roleAdmins),
];

/** Journal d'audit : alimente par l'application, consultable par les admins. */
const PERMS_JOURNAL = [
  Permission.create(roleOperateurs),
  Permission.create(roleAdmins),
  Permission.read(roleAdmins),
];

/* ========================================================================== */
/* Definition du modele de donnees                                            */
/* ========================================================================== */

/**
 * @typedef {{ type: 'string', key: string, size: number, required: boolean, xdefault?: string, array?: boolean }} ColonneTexte
 * @typedef {{ type: 'integer', key: string, required: boolean, min?: number, max?: number, xdefault?: number }} ColonneEntier
 * @typedef {{ type: 'float', key: string, required: boolean, min?: number, max?: number, xdefault?: number }} ColonneDecimal
 * @typedef {{ type: 'boolean', key: string, required: boolean, xdefault?: boolean }} ColonneBooleen
 * @typedef {{ type: 'enum', key: string, elements: string[], required: boolean, xdefault?: string }} ColonneEnum
 * @typedef {{ type: 'datetime', key: string, required: boolean }} ColonneDate
 * @typedef {ColonneTexte | ColonneEntier | ColonneDecimal | ColonneBooleen | ColonneEnum | ColonneDate} Colonne
 * @typedef {{ key: string, type: 'key' | 'unique' | 'fulltext', columns: string[] }} Index
 * @typedef {{ id: string, nom: string, permissions: string[], rowSecurity: boolean, colonnes: Colonne[], index: Index[] }} Table
 */

const CATEGORIES = [
  'gem',
  'pem',
  'image-son',
  'nt',
  'telephonie',
  'pc',
  'cuisson',
  'froid',
  'lavage',
];

/** @type {Table[]} */
const TABLES = [
  {
    id: 'marques',
    nom: 'Marques',
    permissions: PERMS_REFERENCE,
    rowSecurity: false,
    colonnes: [
      { type: 'string', key: 'nom', size: 100, required: true },
      { type: 'string', key: 'logoFileId', size: 255, required: false },
      { type: 'boolean', key: 'actif', required: false, xdefault: true },
    ],
    index: [{ key: 'idx_nom_unique', type: 'unique', columns: ['nom'] }],
  },

  {
    id: 'articles',
    nom: 'Articles',
    permissions: PERMS_REFERENCE,
    rowSecurity: false,
    colonnes: [
      { type: 'string', key: 'ean', size: 20, required: true },
      { type: 'string', key: 'marqueId', size: 36, required: true },
      { type: 'string', key: 'designation', size: 120, required: true },
      { type: 'string', key: 'reference', size: 200, required: false },
      { type: 'enum', key: 'categorie', elements: CATEGORIES, required: true },
      { type: 'string', key: 'photoFileId', size: 255, required: false },
      { type: 'integer', key: 'garantieAnnees', required: false, min: 0, max: 10 },
      { type: 'string', key: 'pictosTechniques', size: 60, required: false, array: true },
      { type: 'boolean', key: 'livraisonGratuiteExclue', required: false, xdefault: false },
      { type: 'boolean', key: 'actif', required: false, xdefault: true },
    ],
    index: [
      { key: 'idx_ean_unique', type: 'unique', columns: ['ean'] },
      { key: 'idx_marque', type: 'key', columns: ['marqueId'] },
      { key: 'idx_categorie', type: 'key', columns: ['categorie'] },
      { key: 'idx_designation_texte', type: 'fulltext', columns: ['designation'] },
    ],
  },

  {
    id: 'campagnes',
    nom: 'Campagnes',
    permissions: PERMS_TRAVAIL,
    rowSecurity: true,
    colonnes: [
      { type: 'string', key: 'nom', size: 120, required: true },
      { type: 'datetime', key: 'dateDebut', required: false },
      { type: 'datetime', key: 'dateFin', required: false },
      {
        type: 'enum',
        key: 'statut',
        elements: ['brouillon', 'validee', 'imprimee', 'archivee'],
        required: false,
        xdefault: 'brouillon',
      },
      { type: 'string', key: 'createdBy', size: 36, required: false },
    ],
    index: [
      { key: 'idx_auteur', type: 'key', columns: ['createdBy'] },
      { key: 'idx_statut', type: 'key', columns: ['statut'] },
      { key: 'idx_date_debut', type: 'key', columns: ['dateDebut'] },
    ],
  },

  {
    id: 'affiches',
    nom: 'Affiches',
    permissions: PERMS_TRAVAIL,
    rowSecurity: true,
    colonnes: [
      { type: 'string', key: 'campagneId', size: 36, required: true },
      { type: 'string', key: 'ean', size: 20, required: true },
      { type: 'float', key: 'prixBarre', required: false, min: 0 },
      { type: 'float', key: 'prixPrincipal', required: true, min: 0 },
      {
        type: 'enum',
        key: 'format',
        elements: ['A4', 'A5', 'A6', 'A7'],
        required: false,
        xdefault: 'A4',
      },
      { type: 'boolean', key: 'stockLimite', required: false, xdefault: false },
      { type: 'boolean', key: 'nouveaute', required: false, xdefault: false },
      { type: 'boolean', key: 'promotion', required: false, xdefault: false },
      { type: 'string', key: 'visuelFondFileId', size: 255, required: false },
      { type: 'integer', key: 'ordre', required: false, min: 0, max: 100000 },
    ],
    index: [
      { key: 'idx_campagne', type: 'key', columns: ['campagneId'] },
      { key: 'idx_ean', type: 'key', columns: ['ean'] },
    ],
  },

  {
    id: 'parametres',
    nom: 'Parametres',
    permissions: PERMS_REFERENCE,
    rowSecurity: false,
    colonnes: [
      { type: 'string', key: 'cle', size: 60, required: true },
      { type: 'string', key: 'valeur', size: 5000, required: true },
      { type: 'string', key: 'description', size: 255, required: false },
    ],
    index: [{ key: 'idx_cle_unique', type: 'unique', columns: ['cle'] }],
  },

  {
    id: 'journal',
    nom: 'Journal',
    permissions: PERMS_JOURNAL,
    rowSecurity: false,
    colonnes: [
      {
        type: 'enum',
        key: 'action',
        elements: ['creation', 'modification', 'suppression', 'export', 'connexion'],
        required: true,
      },
      { type: 'string', key: 'ressource', size: 120, required: true },
      { type: 'string', key: 'userId', size: 36, required: true },
      // 4000 caracteres et non 10000 : MariaDB limite une ligne a 65535 octets,
      // et l'encodage utf8mb4 compte 4 octets par caractere. Deux colonnes de
      // 10000 caracteres consommaient a elles seules 80000 octets, au-dela de
      // la limite. 4000 laisse une marge confortable tout en restant tres
      // au-dessus du volume reel d'un instantane JSON de modification.
      { type: 'string', key: 'avant', size: 4000, required: false },
      { type: 'string', key: 'apres', size: 4000, required: false },
      { type: 'datetime', key: 'date', required: true },
    ],
    index: [
      { key: 'idx_utilisateur', type: 'key', columns: ['userId'] },
      { key: 'idx_date', type: 'key', columns: ['date'] },
      { key: 'idx_ressource', type: 'key', columns: ['ressource'] },
    ],
  },

  {
    id: 'demandes-article',
    nom: 'Demandes article',
    permissions: PERMS_DEMANDES,
    rowSecurity: true,
    colonnes: [
      { type: 'string', key: 'ean', size: 20, required: true },
      { type: 'string', key: 'demandeur', size: 36, required: true },
      { type: 'string', key: 'commentaire', size: 500, required: false },
      {
        type: 'enum',
        key: 'statut',
        elements: ['en_attente', 'traitee', 'rejetee'],
        required: false,
        xdefault: 'en_attente',
      },
    ],
    index: [
      { key: 'idx_statut', type: 'key', columns: ['statut'] },
      { key: 'idx_ean', type: 'key', columns: ['ean'] },
    ],
  },
];

/**
 * Un seul compartiment pour l'ensemble des visuels.
 *
 * Le plan gratuit d'Appwrite n'autorise qu'un compartiment. Ce n'est pas une
 * contrainte genante ici : les trois familles envisagees au cadrage (photos
 * produits, logos de marques, pictogrammes) partagent exactement les memes
 * permissions et les memes reglages. Les separer n'apportait qu'un confort de
 * rangement.
 *
 * La distinction se fait par un prefixe dans l'identifiant du fichier :
 *   logo_<marqueId>   photo_<ean>   picto_<code>   fond_<afficheId>
 *
 * Ce choix reste valable sur un plan payant : inutile d'y revenir plus tard.
 */
const BUCKET_MEDIAS = { id: 'medias', nom: 'Medias', tailleMaxMo: 10 };

/* ========================================================================== */
/* Utilitaires                                                                */
/* ========================================================================== */

/** @param {string} msg */
const ok = (msg) => console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
/** @param {string} msg */
const skip = (msg) => console.log(`  \x1b[90m•\x1b[0m ${msg} \x1b[90m(deja present)\x1b[0m`);
/** @param {string} msg */
const titre = (msg) => console.log(`\n\x1b[1m${msg}\x1b[0m`);
/** @param {string} msg */
const echec = (msg) => console.log(`  \x1b[31m✗\x1b[0m ${msg}`);

/** @param {number} ms */
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Vrai si l'erreur Appwrite signale un element deja existant.
 * @param {any} erreur
 */
function estDejaExistant(erreur) {
  const code = erreur?.code;
  const type = erreur?.type ?? '';
  return code === 409 || type.endsWith('_already_exists');
}

/**
 * Vrai si l'erreur signale un quota de plan atteint.
 *
 * Cas particulier a la relance du script : le plan gratuit n'autorise qu'une
 * seule base de donnees. Si elle existe deja, Appwrite refuse la creation avec
 * une erreur de quota plutot qu'avec un conflit classique. On ne peut pas
 * distinguer les deux situations sans droit de lecture, que la cle
 * d'installation n'a pas necessairement.
 *
 * @param {any} erreur
 */
function estQuotaAtteint(erreur) {
  const type = erreur?.type ?? '';
  const message = String(erreur?.message ?? '');
  return type.includes('usage_limit') || /maximum number.*(reached|allowed)/i.test(message);
}

/**
 * Execute une creation en tolerant le cas "deja existant".
 * @param {string} libelle
 * @param {() => Promise<unknown>} action
 */
async function creer(libelle, action) {
  try {
    await action();
    ok(libelle);
    return true;
  } catch (erreur) {
    if (estDejaExistant(erreur)) {
      skip(libelle);
      return false;
    }
    throw erreur;
  }
}

/**
 * Attend que toutes les colonnes d'une table soient exploitables.
 * Appwrite cree les colonnes de maniere asynchrone : creer un index avant
 * qu'elles soient disponibles echoue.
 * @param {string} tableId
 */
async function attendreColonnes(tableId) {
  const debut = Date.now();
  const limiteMs = 90_000;

  while (Date.now() - debut < limiteMs) {
    const { columns } = await tablesDB.listColumns({ databaseId: DATABASE_ID, tableId });
    const enAttente = columns.filter((c) => c.status !== 'available');

    if (enAttente.length === 0) return;

    const enEchec = enAttente.filter((c) => c.status === 'failed');
    if (enEchec.length > 0) {
      throw new Error(
        `Colonnes en echec sur "${tableId}" : ${enEchec.map((c) => c.key).join(', ')}`,
      );
    }

    await pause(1000);
  }

  throw new Error(`Delai depasse en attendant les colonnes de "${tableId}".`);
}

/* ========================================================================== */
/* Etapes d'installation                                                      */
/* ========================================================================== */

async function installerEquipes() {
  titre('Equipes et roles');

  await creer(`Equipe "${TEAM_OPERATEURS}"`, () =>
    teams.create({ teamId: TEAM_OPERATEURS, name: 'Operateurs' }),
  );
  await creer(`Equipe "${TEAM_ADMINISTRATEURS}"`, () =>
    teams.create({ teamId: TEAM_ADMINISTRATEURS, name: 'Administrateurs' }),
  );
}

async function installerBase() {
  titre('Base de donnees');

  try {
    await tablesDB.create({ databaseId: DATABASE_ID, name: 'AFFICHES-EM' });
    ok(`Base "${DATABASE_ID}"`);
  } catch (erreur) {
    if (estDejaExistant(erreur)) {
      skip(`Base "${DATABASE_ID}"`);
      return;
    }
    if (estQuotaAtteint(erreur)) {
      // On poursuit volontairement : si la base etait reellement absente, la
      // creation des tables echouerait juste apres avec un message explicite.
      skip(`Base "${DATABASE_ID}"`);
      console.log('    \x1b[90mquota de bases atteint — la base existante est reutilisee\x1b[0m');
      return;
    }
    throw erreur;
  }
}

/**
 * @param {Table} table
 * @param {Colonne} colonne
 */
async function installerColonne(table, colonne) {
  const base = { databaseId: DATABASE_ID, tableId: table.id, key: colonne.key };

  switch (colonne.type) {
    case 'string':
      return tablesDB.createStringColumn({
        ...base,
        size: colonne.size,
        required: colonne.required,
        xdefault: colonne.xdefault,
        array: colonne.array,
      });
    case 'integer':
      return tablesDB.createIntegerColumn({
        ...base,
        required: colonne.required,
        min: colonne.min,
        max: colonne.max,
        xdefault: colonne.xdefault,
      });
    case 'float':
      return tablesDB.createFloatColumn({
        ...base,
        required: colonne.required,
        min: colonne.min,
        max: colonne.max,
        xdefault: colonne.xdefault,
      });
    case 'boolean':
      return tablesDB.createBooleanColumn({
        ...base,
        required: colonne.required,
        xdefault: colonne.xdefault,
      });
    case 'enum':
      return tablesDB.createEnumColumn({
        ...base,
        elements: colonne.elements,
        required: colonne.required,
        xdefault: colonne.xdefault,
      });
    case 'datetime':
      return tablesDB.createDatetimeColumn({
        ...base,
        required: colonne.required,
      });
  }
}

const TYPES_INDEX = {
  key: TablesDBIndexType.Key,
  unique: TablesDBIndexType.Unique,
  fulltext: TablesDBIndexType.Fulltext,
};

async function installerTables() {
  for (const table of TABLES) {
    titre(`Table « ${table.nom} »`);

    await creer(`Table "${table.id}"`, () =>
      tablesDB.createTable({
        databaseId: DATABASE_ID,
        tableId: table.id,
        name: table.nom,
        permissions: table.permissions,
        rowSecurity: table.rowSecurity,
        enabled: true,
      }),
    );

    for (const colonne of table.colonnes) {
      await creer(`Colonne "${colonne.key}" (${colonne.type})`, () =>
        installerColonne(table, colonne),
      );
    }

    if (table.index.length > 0) {
      process.stdout.write('  \x1b[90m… attente de la disponibilite des colonnes\x1b[0m\r');
      await attendreColonnes(table.id);
      process.stdout.write('                                                      \r');

      for (const index of table.index) {
        await creer(`Index "${index.key}" (${index.type})`, () =>
          tablesDB.createIndex({
            databaseId: DATABASE_ID,
            tableId: table.id,
            key: index.key,
            type: TYPES_INDEX[index.type],
            columns: index.columns,
          }),
        );
      }
    }
  }
}

async function installerBuckets() {
  titre('Compartiment de fichiers');

  try {
    await storage.createBucket({
      bucketId: BUCKET_MEDIAS.id,
      name: BUCKET_MEDIAS.nom,
      permissions: PERMS_REFERENCE,
      fileSecurity: false,
      enabled: true,
      maximumFileSize: BUCKET_MEDIAS.tailleMaxMo * 1024 * 1024,
      allowedFileExtensions: ['png', 'jpg', 'jpeg', 'webp', 'svg'],
    });
    ok(`Compartiment "${BUCKET_MEDIAS.id}" (${BUCKET_MEDIAS.tailleMaxMo} Mo max)`);
  } catch (erreur) {
    if (estDejaExistant(erreur)) {
      skip(`Compartiment "${BUCKET_MEDIAS.id}"`);
      return;
    }
    if (estQuotaAtteint(erreur)) {
      echec(`Quota de compartiments atteint.`);
      console.log(
        `    \x1b[90mSupprimez les compartiments inutiles dans la console Appwrite,\n` +
          `    puis relancez. Un seul compartiment "${BUCKET_MEDIAS.id}" est necessaire.\x1b[0m`,
      );
      throw erreur;
    }
    throw erreur;
  }
}

/* ========================================================================== */
/* Execution                                                                  */
/* ========================================================================== */

async function main() {
  console.log(`
\x1b[1mAFFICHES-EM v1.0 — Installation Appwrite\x1b[0m
  Projet  : ${PROJECT_ID}
  Base    : ${DATABASE_ID}
  Serveur : ${ENDPOINT}`);

  await installerEquipes();
  await installerBase();
  await installerTables();
  await installerBuckets();

  console.log(`
\x1b[1;32mInstallation terminee.\x1b[0m

Etapes suivantes :
  1. Supprimez APPWRITE_API_KEY de .env.local (elle n'est plus necessaire).
  2. Revoquez la cle dans la console Appwrite, par precaution.
  3. Ajoutez votre compte a l'equipe "administrateurs" pour acceder au catalogue.
`);
}

main().catch((/** @type {any} */ erreur) => {
  console.error('');
  echec('Installation interrompue.');
  console.error(`\n  ${erreur?.message ?? erreur}`);
  if (erreur?.code === 401) {
    console.error(
      "\n  Erreur d'authentification : verifiez APPWRITE_API_KEY et ses permissions.\n" +
        '  La cle doit disposer des acces databases, tables, storage (buckets) et teams.',
    );
  }
  console.error('\n  Le script est relancable : corrigez puis relancez npm run setup:appwrite\n');
  process.exit(1);
});
