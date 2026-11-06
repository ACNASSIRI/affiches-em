/**
 * AFFICHES-EM v1.0 — Service d'authentification
 *
 * Le role d'un utilisateur n'est pas stocke dans un champ applicatif : il
 * decoule de son appartenance aux equipes Appwrite. C'est ce qui rend le
 * modele fiable — les memes equipes servent a la fois a determiner ce que
 * l'interface affiche et a autoriser chaque requete cote serveur. Un
 * utilisateur ne peut donc pas s'attribuer un role en manipulant le code.
 */

import { AppwriteException, type Models } from './pb-appwrite';
import { account, teams, EQUIPES } from './appwrite';

export type Role = 'administrateur' | 'operateur' | 'aucun';

export interface Utilisateur {
  readonly id: string;
  readonly nom: string;
  /** Nom d'utilisateur saisi a la connexion (ex. « achraf »). */
  readonly identifiant: string;
  readonly email: string;
  readonly role: Role;
}

/**
 * Connexion par identifiant
 * ---------------------------------------------------------------------------
 * Appwrite n'ouvre une session qu'a partir d'une adresse e-mail. Chaque
 * identifiant est donc associe a une adresse technique, jamais affichee :
 * « achraf » devient « achraf@affiches-em.local ». Les comptes sont crees avec
 * cette adresse par le script `npm run utilisateurs`.
 *
 * Une saisie contenant deja un « @ » est utilisee telle quelle, ce qui laisse
 * fonctionner d'eventuels anciens comptes crees avec une vraie adresse.
 */
export const DOMAINE_IDENTIFIANTS = (
  import.meta.env.VITE_DOMAINE_IDENTIFIANTS ?? 'affiches-em.local'
).replace(/^@/, '');

/** Met un identifiant sous sa forme canonique : minuscules, sans espaces. */
export function normaliserIdentifiant(saisie: string): string {
  return saisie.trim().toLowerCase().replace(/\s+/g, '.');
}

/** Adresse technique Appwrite correspondant a un identifiant. */
export function emailDepuisIdentifiant(saisie: string): string {
  const identifiant = normaliserIdentifiant(saisie);
  return identifiant.includes('@') ? identifiant : `${identifiant}@${DOMAINE_IDENTIFIANTS}`;
}

/** Identifiant affichable a partir de l'adresse technique. */
export function identifiantDepuisEmail(email: string): string {
  const suffixe = `@${DOMAINE_IDENTIFIANTS}`;
  return email.toLowerCase().endsWith(suffixe) ? email.slice(0, -suffixe.length) : email;
}

/**
 * Determine le role a partir des equipes auxquelles le compte appartient.
 * Un administrateur dispose aussi de tous les droits d'un operateur, d'ou la
 * priorite donnee a ce role lorsque les deux appartenances existent.
 */
async function resolverRole(): Promise<Role> {
  const liste = await teams.list();
  const identifiants = liste.teams.map((equipe) => equipe.$id);

  if (identifiants.includes(EQUIPES.ADMINISTRATEURS)) return 'administrateur';
  if (identifiants.includes(EQUIPES.OPERATEURS)) return 'operateur';
  return 'aucun';
}

function versUtilisateur(compte: Models.User<Models.Preferences>, role: Role): Utilisateur {
  return {
    id: compte.$id,
    nom: compte.name || identifiantDepuisEmail(compte.email),
    identifiant: identifiantDepuisEmail(compte.email),
    email: compte.email,
    role,
  };
}

/**
 * Recupere l'utilisateur de la session en cours.
 * Renvoie null si personne n'est connecte — ce n'est pas une erreur, c'est
 * l'etat normal au premier chargement.
 */
export async function utilisateurCourant(): Promise<Utilisateur | null> {
  try {
    const compte = await account.get();
    const role = await resolverRole();
    return versUtilisateur(compte, role);
  } catch {
    return null;
  }
}

/** Ouvre une session. Leve une erreur porteuse d'un message lisible en cas d'echec. */
export async function seConnecter(identifiant: string, motDePasse: string): Promise<Utilisateur> {
  try {
    await account.createEmailPasswordSession({
      email: emailDepuisIdentifiant(identifiant),
      password: motDePasse,
    });
  } catch (erreur) {
    throw new Error(messageErreurConnexion(erreur));
  }

  const compte = await account.get();
  const role = await resolverRole();
  return versUtilisateur(compte, role);
}

/** Ferme la session en cours. */
export async function seDeconnecter(): Promise<void> {
  try {
    await account.deleteSession({ sessionId: 'current' });
  } catch {
    // Session deja expiree cote serveur : l'objectif est atteint.
  }
}

/**
 * Traduit les erreurs Appwrite en messages exploitables par l'utilisateur.
 * Les identifiants invalides recoivent volontairement un message unique, qui
 * ne revele pas si l'adresse existe.
 */
function messageErreurConnexion(erreur: unknown): string {
  if (!(erreur instanceof AppwriteException)) {
    return 'Connexion au serveur impossible. Verifiez votre reseau.';
  }

  switch (erreur.type) {
    case 'user_invalid_credentials':
      return "Nom d'utilisateur ou mot de passe incorrect.";
    case 'user_blocked':
      return 'Ce compte est bloque. Contactez un administrateur.';
    case 'general_rate_limit_exceeded':
      return 'Trop de tentatives. Patientez quelques minutes avant de reessayer.';
    case 'general_argument_invalid':
      return "Nom d'utilisateur invalide : lettres, chiffres, point, tiret ou souligne uniquement.";
    case 'user_session_already_exists':
      return 'Une session est deja ouverte. Rechargez la page.';
    default:
      return erreur.message || 'La connexion a echoue.';
  }
}

/** Libelle affichable d'un role. */
export const LIBELLE_ROLE: Readonly<Record<Role, string>> = {
  administrateur: 'Administrateur',
  operateur: 'Operateur',
  aucun: 'Aucun acces',
};
