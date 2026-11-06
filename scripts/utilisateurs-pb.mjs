// @ts-check
/**
 * AFFICHES-EM — Comptes utilisateurs sur PocketBase
 * ---------------------------------------------------------------------------
 * Applique utilisateurs.json au serveur en ligne :
 *   - cree les comptes manquants, met a jour nom, role et mot de passe ;
 *   - "actif": false bloque la connexion (l'historique est conserve).
 * Les comptes absents du fichier ne sont jamais supprimes.
 *
 * Utilisation (ou double-clic sur COMPTES.bat) :
 *   npm run utilisateurs              applique utilisateurs.json
 *   npm run utilisateurs -- --liste   affiche les comptes existants
 *   options : --serveur=https://...   --email=admin@exemple.com
 */

import {
  connecterPocketBase,
  lireUtilisateurs,
  enregistrerCompte,
  idCompte,
  emailDe,
  messageErreur,
  DOMAINE_IDENTIFIANTS,
} from './pb-commun.mjs';

const pb = await connecterPocketBase();

if (process.argv.includes('--liste')) {
  const comptes = await pb.collection('users').getFullList({ sort: 'email' });
  console.log('Comptes existants :\n');
  for (const c of comptes) {
    const identifiant = String(c.email).replace(`@${DOMAINE_IDENTIFIANTS}`, '');
    console.log(`  ${identifiant.padEnd(22)} ${String(c.name).padEnd(26)} ${c.role || '— aucun'}${c.actif ? '' : '  [bloque]'}`);
  }
  console.log('');
  process.exit(0);
}

let erreurs = 0;
for (const fiche of lireUtilisateurs()) {
  try {
    const etat = await enregistrerCompte(pb, {
      id: idCompte(fiche.identifiant),
      email: emailDe(fiche.identifiant),
      nom: fiche.nom?.trim() || fiche.identifiant,
      role: fiche.role,
      actif: fiche.actif !== false,
      motDePasse: fiche.motDePasse,
    });
    console.log(`  ✓ ${fiche.identifiant.padEnd(20)} ${etat === 'cree' ? 'cree' : 'mis a jour'} (${fiche.role}${fiche.actif === false ? ', bloque' : ''})`);
  } catch (e) {
    erreurs++;
    console.log(`  ✗ ${fiche.identifiant} : ${messageErreur(e)}`);
  }
}
console.log(erreurs ? `\n${erreurs} erreur(s).` : '\nComptes a jour.');
process.exit(erreurs ? 1 : 0);
