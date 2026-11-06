// @ts-check
/**
 * AFFICHES-EM — Outils partages par les scripts PocketBase
 * ---------------------------------------------------------------------------
 *   - lecture de .env.local et de deploiement/config.txt ;
 *   - adresse du serveur : --serveur=https://... ou https://<DOMAINE> ;
 *   - connexion en super-administrateur PocketBase (mot de passe saisi au
 *     clavier, jamais enregistre) ;
 *   - lecture et controle de utilisateurs.json.
 */

import { readFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import PocketBase from 'pocketbase';

/* -------------------------------------------------------------------------- */
/* Configuration                                                              */
/* -------------------------------------------------------------------------- */

/** @param {string} chemin @returns {Record<string, string>} */
function lireCleValeur(chemin) {
  /** @type {Record<string, string>} */
  const sortie = {};
  try {
    for (const ligne of readFileSync(new URL(chemin, import.meta.url), 'utf8').split(/\r?\n/)) {
      const nette = ligne.trim();
      if (!nette || nette.startsWith('#')) continue;
      const i = nette.indexOf('=');
      if (i === -1) continue;
      sortie[nette.slice(0, i).trim()] = nette.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    /* fichier absent */
  }
  return sortie;
}

for (const [cle, valeur] of Object.entries(lireCleValeur('../.env.local'))) {
  if (!(cle in process.env)) process.env[cle] = valeur;
}
const config = lireCleValeur('../deploiement/config.txt');

export const DOMAINE_IDENTIFIANTS = (process.env.VITE_DOMAINE_IDENTIFIANTS || 'affiches-em.local').replace(/^@/, '');

/** Valeur d'une option --nom=valeur de la ligne de commande. */
export function option(/** @type {string} */ nom) {
  const brut = process.argv.find((a) => a.startsWith(`--${nom}=`));
  return brut ? brut.slice(nom.length + 3) : undefined;
}

export function adresseServeur() {
  const explicite = option('serveur');
  if (explicite) return explicite.replace(/\/$/, '');
  const domaine = config.DOMAINE && config.DOMAINE !== 'votre-domaine.com' ? config.DOMAINE : '';
  if (domaine) return `https://${domaine}`;
  const ip = config.IP_VPS;
  if (!ip || ip === '0.0.0.0') {
    console.error('Renseignez IP_VPS dans deploiement/config.txt (ou --serveur=https://...).');
    process.exit(1);
  }
  // Sans nom de domaine : adresse gratuite sslip.io deduite de l'IP (HTTPS automatique).
  return `https://${ip.replace(/\./g, '-')}.sslip.io`;
}

/* -------------------------------------------------------------------------- */
/* Saisie au clavier                                                          */
/* -------------------------------------------------------------------------- */

/** @param {string} question */
export function demander(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((r) => rl.question(question, (rep) => (rl.close(), r(rep.trim()))));
}

/** Saisie masquee (mot de passe). @param {string} question @returns {Promise<string>} */
export function demanderSecret(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const entree = process.stdin;
    let valeur = '';
    entree.setRawMode?.(true);
    entree.resume();
    entree.setEncoding('utf8');
    /** @param {string} touches */
    const lire = (touches) => {
      for (const c of touches) {
        if (c === '\r' || c === '\n') {
          entree.setRawMode?.(false);
          entree.pause();
          entree.off('data', lire);
          process.stdout.write('\n');
          resolve(valeur);
          return;
        }
        if (c === '\u0003') process.exit(1); // Ctrl+C
        if (c === '\u0008' || c === '\u007f') valeur = valeur.slice(0, -1);
        else valeur += c;
      }
    };
    entree.on('data', lire);
  });
}

/* -------------------------------------------------------------------------- */
/* PocketBase                                                                 */
/* -------------------------------------------------------------------------- */

/** Client PocketBase connecte en super-administrateur. */
export async function connecterPocketBase() {
  const url = adresseServeur();
  const pb = new PocketBase(url);
  pb.autoCancellation(false);
  console.log(`\nServeur PocketBase : ${url}`);
  console.log('Compte super-administrateur (cree lors de INSTALLER-SERVEUR.bat) :');
  const email = option('email') || (await demander('  E-mail       : '));
  const mdp = await demanderSecret('  Mot de passe : ');
  try {
    await pb.collection('_superusers').authWithPassword(email, mdp);
  } catch (e) {
    const statut = /** @type {any} */ (e)?.status;
    console.error(
      statut === 0
        ? `\n[X] Serveur injoignable (${url}). Le site est-il en ligne ?`
        : '\n[X] E-mail ou mot de passe du super-administrateur incorrect.',
    );
    process.exit(1);
  }
  console.log('  Connecte.\n');
  return pb;
}

/* -------------------------------------------------------------------------- */
/* Comptes                                                                    */
/* -------------------------------------------------------------------------- */

/** Meme normalisation que l'ecran de connexion (src/lib/auth.ts). */
export const normaliser = (/** @type {string} */ s) => s.trim().toLowerCase().replace(/\s+/g, '.');

/** Identifiant de compte (identique a celui cree autrefois dans Appwrite). */
export const idCompte = (/** @type {string} */ identifiant) =>
  `u_${identifiant.replace(/[^a-z0-9_-]+/g, '_')}`.slice(0, 36);

export const emailDe = (/** @type {string} */ identifiant) => `${identifiant}@${DOMAINE_IDENTIFIANTS}`;

/**
 * @typedef {{ identifiant: string, nom?: string, motDePasse?: string,
 *             role: 'administrateur' | 'operateur', actif?: boolean }} Fiche
 */

/** @returns {Fiche[]} */
export function lireUtilisateurs(obligatoire = true) {
  const chemin = new URL('../utilisateurs.json', import.meta.url);
  if (!existsSync(chemin)) {
    if (!obligatoire) return [];
    console.error('utilisateurs.json introuvable : copiez utilisateurs.exemple.json puis adaptez-le.');
    process.exit(1);
  }
  /** @type {any} */
  let donnees;
  try {
    donnees = JSON.parse(readFileSync(chemin, 'utf8'));
  } catch (e) {
    console.error(`utilisateurs.json n'est pas un JSON valide : ${/** @type {any} */ (e)?.message}`);
    process.exit(1);
  }
  const liste = Array.isArray(donnees) ? donnees : donnees?.utilisateurs;
  if (!Array.isArray(liste)) {
    console.error('utilisateurs.json doit contenir une liste "utilisateurs": [ ... ].');
    process.exit(1);
  }
  const vus = new Set();
  const erreurs = [];
  const fiches = liste.map((brut, i) => {
    const identifiant = normaliser(String(brut.identifiant ?? ''));
    const ligne = `utilisateur n°${i + 1}`;
    if (!/^[a-z0-9][a-z0-9._-]{1,29}$/.test(identifiant)) erreurs.push(`${ligne} : identifiant "${brut.identifiant}" invalide.`);
    if (vus.has(identifiant)) erreurs.push(`${ligne} : identifiant "${identifiant}" en double.`);
    vus.add(identifiant);
    if (brut.role !== 'administrateur' && brut.role !== 'operateur') {
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

/**
 * Cree ou met a jour un compte PocketBase.
 * @param {PocketBase} pb
 * @param {{ id: string, email: string, nom: string, role: string, actif: boolean, motDePasse?: string }} c
 * @returns {Promise<'cree' | 'maj'>}
 */
export async function enregistrerCompte(pb, c) {
  /** @type {Record<string, unknown>} */
  const donnees = { email: c.email, name: c.nom, role: c.role, actif: c.actif, verified: true, emailVisibility: false };
  if (c.motDePasse) Object.assign(donnees, { password: c.motDePasse, passwordConfirm: c.motDePasse });

  const existant = await pb
    .collection('users')
    .getFirstListItem(`email = ${JSON.stringify(c.email)} || id = ${JSON.stringify(c.id)}`)
    .catch(() => null);
  if (existant) {
    await pb.collection('users').update(existant.id, donnees);
    return 'maj';
  }
  if (!c.motDePasse) throw new Error('compte nouveau : "motDePasse" obligatoire');
  await pb.collection('users').create({ id: c.id, ...donnees });
  return 'cree';
}

/** Message lisible d'une erreur PocketBase. @param {unknown} e */
export function messageErreur(e) {
  const err = /** @type {any} */ (e);
  const champs = Object.entries(err?.response?.data ?? {})
    .map(([k, v]) => `${k}: ${/** @type {any} */ (v)?.message}`)
    .join(', ');
  return champs ? `${err?.message} (${champs})` : err?.message ?? String(e);
}
