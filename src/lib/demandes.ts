/**
 * AFFICHES-EM v1.0 — Demandes d'ajout d'article
 *
 * Un operateur ne peut pas ecrire dans le catalogue (reserve aux
 * administrateurs). Quand il trouve un article absent, il envoie une demande
 * avec les informations qu'il connait ; un administrateur la valide (l'article
 * est cree) ou la rejette.
 *
 * Table `demandes-article` (creee par setup-appwrite) :
 *   ean, demandeur (userId), commentaire (500 car.), statut
 * Les details de l'article sont ranges en JSON dans `commentaire` : aucune
 * colonne a ajouter dans Appwrite.
 *
 * Permissions : creation par tous les roles, lecture / modification par les
 * administrateurs. Chaque demande porte en plus une permission de lecture pour
 * son auteur, qui suit ainsi ses propres demandes (securite par ligne active).
 */

import { AppwriteException, ID, Permission, Query, Role } from './pb-appwrite';
import { tablesDB, DATABASE_ID, TABLES } from './appwrite';
import type { CategorieProduit } from '../config/constants';
import type { SaisieArticle } from './articles';

export type StatutDemande = 'en_attente' | 'traitee' | 'rejetee';

export const LIBELLE_STATUT_DEMANDE: Readonly<Record<StatutDemande, string>> = {
  en_attente: 'En attente',
  traitee: 'Validee — article cree',
  rejetee: 'Rejetee',
};

/** Contenu de la demande, stocke en JSON. Cles courtes : la colonne fait 500 caracteres. */
interface Contenu {
  m?: string; // marqueId
  mn?: string; // nom de la marque (lisible meme si la marque change)
  d?: string; // designation
  r?: string; // reference
  c?: CategorieProduit;
  p?: string[]; // pictos
  n?: string; // nom du demandeur
  x?: string; // motif de rejet
}

export interface DemandeArticle {
  readonly id: string;
  readonly ean: string;
  readonly demandeurId: string;
  readonly demandeurNom: string;
  readonly statut: StatutDemande;
  readonly date: string;
  readonly marqueId: string;
  readonly marqueNom: string;
  readonly designation: string;
  readonly reference: string;
  readonly categorie: CategorieProduit;
  readonly pictos: readonly string[];
  readonly motifRejet: string;
}

interface LigneDemande {
  $id: string;
  $createdAt: string;
  ean: string;
  demandeur: string;
  commentaire?: string | null;
  statut?: StatutDemande | null;
}

function lireContenu(texte: string | null | undefined): Contenu {
  try {
    const v = JSON.parse(texte ?? '{}') as unknown;
    return v && typeof v === 'object' ? (v as Contenu) : {};
  } catch {
    // Ancienne demande en texte libre.
    return { d: texte ?? '' };
  }
}

const versDemande = (l: LigneDemande): DemandeArticle => {
  const c = lireContenu(l.commentaire);
  return {
    id: l.$id,
    ean: l.ean,
    demandeurId: l.demandeur,
    demandeurNom: c.n ?? '',
    statut: l.statut ?? 'en_attente',
    date: l.$createdAt,
    marqueId: c.m ?? '',
    marqueNom: c.mn ?? '',
    designation: c.d ?? '',
    reference: c.r ?? '',
    categorie: c.c ?? 'gem',
    pictos: Array.from({ length: 6 }, (_, i) => c.p?.[i] ?? ''),
    motifRejet: c.x ?? '',
  };
};

/** JSON compact tenant dans 500 caracteres (la reference est raccourcie si besoin). */
function serialiser(c: Contenu): string {
  let texte = JSON.stringify(c);
  if (texte.length > 500 && c.p) texte = JSON.stringify({ ...c, p: c.p.map((x) => x.slice(0, 12)) });
  if (texte.length > 500) texte = JSON.stringify({ ...c, r: (c.r ?? '').slice(0, 80) });
  return texte.slice(0, 500);
}

/** Envoie une demande d'ajout (operateur ou administrateur). */
export async function envoyerDemande(
  saisie: SaisieArticle,
  marqueNom: string,
  auteur: { id: string; nom: string },
): Promise<DemandeArticle> {
  const ligne = await tablesDB.createRow({
    databaseId: DATABASE_ID,
    tableId: TABLES.DEMANDES_ARTICLE,
    rowId: ID.unique(),
    data: {
      ean: saisie.ean.trim(),
      demandeur: auteur.id,
      statut: 'en_attente',
      commentaire: serialiser({
        m: saisie.marqueId,
        mn: marqueNom,
        d: saisie.designation.trim(),
        r: saisie.reference.trim(),
        c: saisie.categorie,
        p: saisie.pictos.map((x) => x.trim()),
        n: auteur.nom,
      }),
    },
    // L'auteur peut relire sa demande ; les administrateurs y ont acces par la table.
    permissions: [Permission.read(Role.user(auteur.id))],
  });
  return versDemande(ligne as unknown as LigneDemande);
}

/** Demandes visibles par l'utilisateur (toutes pour un admin, les siennes pour un operateur). */
export async function listerDemandes(statut?: StatutDemande): Promise<DemandeArticle[]> {
  const queries = [Query.orderDesc('$createdAt'), Query.limit(200)];
  if (statut) queries.push(Query.equal('statut', statut));
  const reponse = await tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId: TABLES.DEMANDES_ARTICLE,
    queries,
  });
  return (reponse.rows as unknown as LigneDemande[]).map(versDemande);
}

/** Cloture une demande (administrateurs). */
export async function cloturerDemande(
  demande: DemandeArticle,
  statut: Exclude<StatutDemande, 'en_attente'>,
  motif = '',
): Promise<void> {
  const data: Record<string, string> = { statut };
  if (motif.trim()) {
    data.commentaire = serialiser({
      m: demande.marqueId,
      mn: demande.marqueNom,
      d: demande.designation,
      r: demande.reference,
      c: demande.categorie,
      p: [...demande.pictos],
      n: demande.demandeurNom,
      x: motif.trim().slice(0, 120),
    });
  }
  await tablesDB.updateRow({
    databaseId: DATABASE_ID,
    tableId: TABLES.DEMANDES_ARTICLE,
    rowId: demande.id,
    data,
  });
}

/** Saisie article pre-remplie a partir d'une demande. */
export function saisieDepuisDemande(d: DemandeArticle): SaisieArticle {
  return {
    ean: d.ean,
    marqueId: d.marqueId,
    designation: d.designation,
    reference: d.reference,
    categorie: d.categorie,
    pictos: [...d.pictos],
    livraisonGratuiteExclue: false,
    actif: true,
  };
}

export function messageErreurDemande(erreur: unknown): string {
  if (erreur instanceof AppwriteException) {
    if (erreur.type === 'user_unauthorized' || erreur.code === 403) {
      return "Envoi refuse par Appwrite : la table « Demandes article » doit autoriser Create a l'equipe operateurs.";
    }
    if (erreur.code === 401) return 'Session expiree. Reconnectez-vous.';
    if (erreur.code === 404) return 'Table « demandes-article » introuvable dans Appwrite.';
    return erreur.message;
  }
  return erreur instanceof Error ? erreur.message : 'Une erreur est survenue.';
}
