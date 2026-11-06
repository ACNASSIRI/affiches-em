# AFFICHES-EM — Lancer l'application en local

Cette version tourne sur votre PC (`http://localhost:5173`) et garde les données
dans **votre propre projet Appwrite Cloud** (gratuit). Elle apporte :

- un **nouveau design clair** (menu en haut, l'interface seulement : les affiches A4 sont identiques) ;
- une **connexion par nom d'utilisateur** (`achraf`, `rayon51`…) au lieu d'une adresse e-mail ;
- un script pour **créer et gérer les comptes** depuis un simple fichier.

---

## 1. Installer Node.js (une seule fois)

Téléchargez la version **LTS** sur <https://nodejs.org> et installez-la.
Vérifiez dans un terminal (PowerShell sous Windows) :

```bash
node -v    # doit afficher v20 ou plus
```

## 2. Créer votre projet Appwrite (une seule fois)

1. Créez un compte gratuit sur <https://cloud.appwrite.io>, puis un projet (ex. « Affiches Kenitra 2 »).
2. Dans le projet : **Overview → Add a platform → Web**, nom d'hôte : `localhost`.
3. **Overview → Integrations → API Keys → Create API key** avec les droits
   `databases`, `tables`, `storage`, `users` et `teams` (lecture + écriture).
4. Notez l'**Endpoint** (ex. `https://fra.cloud.appwrite.io/v1`) et le **Project ID**.

## 3. Configurer l'application

Dans le dossier du projet, copiez `.env.example` en `.env.local` et remplissez :

```ini
VITE_APPWRITE_ENDPOINT=https://fra.cloud.appwrite.io/v1
VITE_APPWRITE_PROJECT_ID=votre-project-id
VITE_APPWRITE_DATABASE_ID=affiches-em
VITE_DOMAINE_IDENTIFIANTS=affiches-em.local
APPWRITE_API_KEY=votre-cle-api
```

Puis, dans un terminal ouvert dans le dossier :

```bash
npm install
npm run setup:appwrite     # crée la base, les tables, les équipes et le stockage
```

## 4. Créer les comptes utilisateurs

1. Copiez `utilisateurs.exemple.json` en `utilisateurs.json`.
2. Mettez-y vos comptes :

```json
{
  "utilisateurs": [
    { "identifiant": "achraf",  "nom": "Achraf Nassiri", "motDePasse": "MotDePasse-Solide1", "role": "administrateur" },
    { "identifiant": "rayon51", "nom": "Rayon Image & Son", "motDePasse": "Autre-MotDePasse2", "role": "operateur" }
  ]
}
```

3. Lancez :

```bash
npm run utilisateurs
```

| Champ | Rôle |
|---|---|
| `identifiant` | Ce qu'on tape à la connexion. 2 à 30 caractères : lettres, chiffres, `.` `_` `-`. Pas de majuscules (converties automatiquement). |
| `nom` | Nom affiché en haut à droite et dans le journal. |
| `motDePasse` | Obligatoire à la création (8 caractères min.). Ensuite, ne le mettez que pour **changer** le mot de passe. |
| `role` | `administrateur` (tout) ou `operateur` (campagnes et affiches, catalogue en lecture). |
| `actif` | Mettez `false` pour **bloquer** un compte sans le supprimer. |

- Relancez `npm run utilisateurs` après chaque modification : le script ne crée que ce qui manque et met à jour le reste.
- `npm run utilisateurs -- --liste` affiche les comptes existants et leur rôle.
- Une fois les comptes créés, **retirez les mots de passe** de `utilisateurs.json` (le fichier n'est jamais publié sur GitHub).

> Comment ça marche : Appwrite n'accepte que des adresses e-mail. Chaque identifiant
> est donc associé à une adresse technique invisible, `achraf@affiches-em.local`.
> Ne changez pas `VITE_DOMAINE_IDENTIFIANTS` après avoir créé des comptes.

## 5. Lancer l'application

```bash
npm run dev
```

Ouvrez <http://localhost:5173> et connectez-vous avec un identifiant.

**Sous Windows**, vous pouvez aussi double-cliquer sur `LANCER.bat` : il installe ce qui manque,
démarre l'application et ouvre le navigateur.

**Depuis un téléphone du magasin** (même Wi-Fi) : le terminal affiche une ligne
`Network: http://192.168.x.x:5173` — ouvrez cette adresse sur le téléphone. Ajoutez aussi
cette adresse IP comme plateforme Web dans Appwrite (étape 2.2), sinon la connexion sera refusée.

Après la configuration, **supprimez `APPWRITE_API_KEY` de `.env.local`** si vous n'avez plus de
comptes à créer : l'application elle-même n'en a pas besoin.

---

## Ce qui a changé par rapport à la v1.0

| Fichier | Changement |
|---|---|
| `src/lib/auth.ts`, `src/pages/Connexion.tsx` | Connexion par nom d'utilisateur |
| `scripts/utilisateurs.mjs`, `utilisateurs.exemple.json` | Gestion des comptes et des rôles |
| `src/styles/tokens.css`, `src/styles/theme.css` | Palette claire, police Figtree, cartes, boutons, tableaux |
| `src/components/AppShell.*`, `src/styles/mobile.css` | Menu en haut au lieu de la barre latérale |
| `src/pages/Connexion.css` | Nouvel écran de connexion |

Les fichiers des affiches (`src/components/affiche/`, `public/affiches/`) n'ont pas été modifiés.
