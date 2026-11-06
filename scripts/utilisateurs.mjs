// @ts-check
/**
 * AFFICHES-EM — Gestion des comptes utilisateurs (connexion par identifiant)
 * ---------------------------------------------------------------------------
 * Lit `utilisateurs.json` a la racine du projet et met Appwrite en conformite :
 *
 *   - cree les comptes manquants (adresse technique <identifiant>@<domaine>) ;
 *   - met a jour le nom affiche et, si renseigne, le mot de passe ;
 *   - rattache chaque compte a la bonne equipe (administrateurs / operateurs)
 *     et le retire de l'autre ;
 *   - bloque les comptes marques "actif": false (ils ne peuvent plus se
 *     connecter, leur historique est conserve).
 *
 * Le script est IDEMPOTENT : relancez-le apres chaque modification du fichier.
 * Les comptes absents du fichier ne sont jamais supprimes.
 *
 * Utilisation :
 *   npm run utilisateurs            applique utilisateurs.json
 *   npm run utilisateurs -- --liste affiche les comptes existants
 *
 * Necessite APPWRITE_API_KEY dans .env.local, avec les droits
 * users.read, users.write, teams.read, teams.write.
 */

import { readFileSync, existsSync } from 'node:fs';
import { Client, Users, Teams, Query } from 'node-appwrite';

/* -------------------------------------------------------------------------- */
/* Configuration                                                              */
/* -------------------------------------------------------------------------- */

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
    // Pas de .env.local : on utilise les variables du shell.
  }
}

chargerEnv();

const ENDPOINT = process.env.VITE_APPWRITE_ENDPOINT ?? '';
const PROJECT_ID = process.env.VITE_APPWRITE_PROJECT_ID ?? '';
const API_KEY = process.env.APPWRITE_API_KEY ?? '';
const DOMAINE = (process.env.VITE_DOMAINE_IDENTIFIANTS || 'affiches-em.local').replace(/^@/, '');

const EQUIPES = { administrateur: 'administrateurs', operateur: 'operateurs' };

if (!ENDPOINT || !PROJECT_ID || !API_KEY) {
  console.error(`
Configuration incomplete. .env.local doit contenir :

  VITE_APPWRITE_ENDPOINT=https://fra.cloud.appwrite.io/v1
  VITE_APPWRITE_PROJECT_ID=votre-identifiant-de-projet
  APPWRITE_API_KEY=votre-cle-api   (droits users.* et teams.*)
`);
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const users = new Users(client);
const teams = new Teams(client);

/* -------------------------------------------------------------------------- */
/* Outils                                                                     */
/* -------------------------------------------------------------------------- */

/** Meme normalisation que l'ecran de connexion (src/lib/auth.ts). */
const normaliser = (/** @type {string} */ s) => s.trim().toLowerCase().replace(/\s+/g, '.');

/** Identifiant de compte Appwrite : 36 caracteres max, sans point initial. */
const idCompte = (/** @type {string} */ identifiant) =>
  `u_${identifiant.replace(/[^a-z0-9_-]+/g, '_')}`.slice(0, 36);

const emailDe = (/** @type {string} */ identifiant) => `${identifiant}@${DOMAINE}`;

/** @param {unknown} e */
const estIntrouvable = (e) => /** @type {any} */ (e)?.code === 404;

/** @param {unknown} e */
const message = (e) => /** @type {any} */ (e)?.message ?? String(e);

/**
 * @typedef {{ identifiant: string, nom?: string, motDePasse?: string,
 *             role: 'administrateur' | 'operateur', actif?: boolean }} Fiche
 */

/** @returns {Fiche[]} */
function lireFichier() {
  const chemin = new URL('../utilisateurs.json', import.meta.url);
  if (!existsSync(chemin)) {
    console.error(
      'Fichier utilisateurs.json introuvable.\n' +
        'Copiez utilisateurs.exemple.json en utilisateurs.json puis adaptez-le.',
    );
    process.exit(1);
  }
  /** @type {unknown} */
  let donnees;
  try {
    donnees = JSON.parse(readFileSync(chemin, 'utf8'));
  } catch (e) {
    console.error(`utilisateurs.json n'est pas un JSON valide : ${message(e)}`);
    process.exit(1);
  }
  const liste = Array.isArray(donnees) ? donnees : /** @type {any} */ (donnees)?.utilisateurs;
  if (!Array.isArray(liste)) {
    console.error('utilisateurs.json doit contenir une liste "utilisateurs": [ ... ].');
    process.exit(1);
  }

  const vus = new Set();
  const erreurs = [];
  const fiches = liste.map((brut, i) => {
    const identifiant = normaliser(String(brut.identifiant ?? ''));
    const ligne = `utilisateur n°${i + 1}`;
    if (!/^[a-z0-9][a-z0-9._-]{1,29}$/.test(identifiant)) {
      erreurs.push(`${ligne} : identifiant "${brut.identifiant}" invalide (2 a 30 caracteres : lettres, chiffres, . _ -).`);
    }
    if (vus.has(identifiant)) erreurs.push(`${ligne} : identifiant "${identifiant}" en double.`);
    vus.add(identifiant);
    if (!(brut.role in EQUIPES)) {
      erreurs.push(`${ligne} : role "${brut.role}" inconnu (administrateur ou operateur).`);
    }
    if (brut.motDePasse !== undefined && String(brut.motDePasse).length < 8) {
      erreurs.push(`${ligne} : le mot de passe doit faire au moins 8 caracteres.`);
    }
    return /** @type {Fiche} */ ({ ...brut, identifiant });
  });

  if (erreurs.length) {
    console.error('Corrigez utilisateurs.json :\n  - ' + erreurs.join('\n  - '));
    process.exit(1);
  }
  return fiches;
}

/** Appartenance d'un compte a une equipe, ou null. */
async function appartenance(/** @type {string} */ teamId, /** @type {string} */ userId) {
  const { memberships } = await teams.listMemberships({
    teamId,
    queries: [Query.equal('userId', userId), Query.limit(1)],
  });
  return memberships[0] ?? null;
}

/* -------------------------------------------------------------------------- */
/* Commandes                                                                  */
/* -------------------------------------------------------------------------- */

async function lister() {
  const { users: comptes } = await users.list({ queries: [Query.limit(100)] });
  const [admins, ops] = await Promise.all(
    Object.values(EQUIPES).map((teamId) =>
      teams.listMemberships({ teamId, queries: [Query.limit(100)] }),
    ),
  );
  const idsAdmins = new Set(admins.memberships.map((m) => m.userId));
  const idsOps = new Set(ops.memberships.map((m) => m.userId));

  console.log('\nComptes existants :\n');
  for (const c of comptes) {
    const identifiant = c.email.endsWith(`@${DOMAINE}`) ? c.email.split('@')[0] : c.email;
    const role = idsAdmins.has(c.$id) ? 'administrateur' : idsOps.has(c.$id) ? 'operateur' : '— aucun';
    const etat = c.status ? '' : '  [bloque]';
    console.log(`  ${identifiant.padEnd(22)} ${c.name.padEnd(24)} ${role}${etat}`);
  }
  console.log('');
}

async function appliquer() {
  const fiches = lireFichier();
  let erreurs = 0;

  for (const fiche of fiches) {
    const { identifiant, role } = fiche;
    const nom = fiche.nom?.trim() || identifiant;
    const email = emailDe(identifiant);
    const actif = fiche.actif !== false;

    try {
      // 1. Retrouver le compte par son adresse technique (stable), sinon le creer.
      const { users: trouves } = await users.list({ queries: [Query.equal('email', email)] });
      let compte = trouves[0];

      if (!compte) {
        if (!fiche.motDePasse) {
          console.log(`  ✗ ${identifiant} : compte nouveau, "motDePasse" obligatoire.`);
          erreurs++;
          continue;
        }
        compte = await users.create({
          userId: idCompte(identifiant),
          email,
          password: fiche.motDePasse,
          name: nom,
        });
        console.log(`  + ${identifiant} cree (${role})`);
      } else {
        if (compte.name !== nom) await users.updateName({ userId: compte.$id, name: nom });
        if (fiche.motDePasse) {
          await users.updatePassword({ userId: compte.$id, password: fiche.motDePasse });
        }
        console.log(`  ✓ ${identifiant} a jour${fiche.motDePasse ? ' (mot de passe change)' : ''}`);
      }

      // 2. Statut (bloque / actif).
      if (compte.status !== actif) {
        await users.updateStatus({ userId: compte.$id, status: actif });
        console.log(`    ${actif ? 'debloque' : 'bloque'}`);
      }

      // 3. Equipe : une seule appartenance, celle du role demande.
      for (const [r, teamId] of Object.entries(EQUIPES)) {
        const membre = await appartenance(teamId, compte.$id);
        if (r === role && !membre) {
          await teams.createMembership({ teamId, roles: ['membre'], userId: compte.$id });
        }
        if (r !== role && membre) {
          await teams.deleteMembership({ teamId, membershipId: membre.$id });
        }
      }
    } catch (e) {
      erreurs++;
      if (estIntrouvable(e)) {
        console.log(`  ✗ ${identifiant} : equipe introuvable. Lancez d'abord npm run setup:appwrite.`);
      } else {
        console.log(`  ✗ ${identifiant} : ${message(e)}`);
      }
    }
  }

  console.log(
    erreurs
      ? `\n${erreurs} erreur(s). Corrigez puis relancez : le script reprend ou il s'est arrete.\n`
      : `\n${fiches.length} compte(s) a jour. Pensez a retirer les mots de passe de utilisateurs.json.\n`,
  );
  if (erreurs) process.exitCode = 1;
}

/* -------------------------------------------------------------------------- */

console.log(`Projet ${PROJECT_ID} — domaine des identifiants : @${DOMAINE}`);
if (process.argv.includes('--liste')) await lister();
else await appliquer();
