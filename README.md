# AFFICHES-EM v1.0

> **Version locale** (design clair, connexion par identifiant) : voir [DEMARRAGE-LOCAL.md](DEMARRAGE-LOCAL.md).

Générateur d'affiches prix pour le département Électroménager.
Remplace le classeur Excel à macros VBA (`SAISIE_EM` / `BASE_DONNEES_EM`) et la génération PowerPoint.

**Architecture** — Application web progressive (PWA) hébergée sur GitHub Pages, données et authentification sur Appwrite Cloud.

---

## Avancement

| Étape | Contenu | État |
|---|---|---|
| 0.1 | Structure du dépôt et coquille PWA | ✅ Terminé |
| 0.2 | Déploiement automatique sur GitHub Pages | ⏳ En cours |
| 0.3 | Création du projet Appwrite | À venir |
| 0.4 | Collections, buckets et permissions | À venir |
| 0.5 | Connexion utilisateur et rôles | À venir |

---

## Démarrer dans GitHub Codespaces

1. Sur la page du dépôt, cliquez sur **Code** → onglet **Codespaces** → **Create codespace on main**.
2. Attendez l'ouverture de l'éditeur (une à deux minutes au premier lancement).
3. Dans le terminal intégré :

```bash
npm install
npm run dev
```

4. Codespaces propose automatiquement d'ouvrir l'aperçu dans le navigateur. L'application se recharge à chaque modification enregistrée.

Le terminal s'exécute sur les serveurs GitHub : aucune installation n'est nécessaire sur votre poste.

---

## Commandes disponibles

| Commande | Effet |
|---|---|
| `npm run dev` | Serveur de développement avec rechargement instantané |
| `npm run build` | Compilation de production dans `dist/` |
| `npm run preview` | Prévisualise le résultat de `build` |
| `npm run typecheck` | Vérifie les types sans produire de fichiers |

---

## Structure du projet

```
AFFICHES-EM_v1.0/
├─ public/                    Fichiers servis tels quels
│  ├─ icon.svg                Icône de l'application
│  ├─ icon-maskable.svg       Icône adaptative (Android)
│  └─ favicon.svg
├─ src/
│  ├─ components/             Composants réutilisables
│  │  └─ AppShell.tsx         Barre latérale, en-tête, zone de contenu
│  ├─ config/
│  │  └─ constants.ts         Formats, catégories, règles commerciales
│  ├─ lib/
│  │  └─ appwrite.ts          Client Appwrite, identifiants de collections
│  ├─ pages/                  Écrans de l'application
│  ├─ styles/
│  │  ├─ tokens.css           Palette, typographie, espacements
│  │  └─ global.css           Réinitialisation et styles de base
│  ├─ App.tsx                 Routage
│  └─ main.tsx                Point d'entrée
├─ .env.example               Modèle de configuration Appwrite
├─ index.html
└─ vite.config.ts             Build, chemin GitHub Pages, PWA
```

---

## Configuration Appwrite

À l'étape 0.3, copiez `.env.example` en `.env.local` et renseignez les valeurs de votre projet.

```bash
cp .env.example .env.local
```

`.env.local` n'est jamais versionné.

**Point important sur la sécurité** — l'identifiant de projet et l'URL Appwrite sont publics par conception : ils figurent dans le code de toute application cliente Appwrite. La sécurité repose entièrement sur les permissions déclarées côté serveur (collections, buckets, Teams), jamais sur leur confidentialité.

**Aucune clé API ne doit figurer dans ce dépôt.** Le code publié sur GitHub Pages est intégralement lisible.

---

## Choix techniques notables

**Routage par fragment (`HashRouter`)** — GitHub Pages ne sait pas rediriger les URL profondes vers `index.html`. Les adresses prennent donc la forme `.../#/campagnes`, ce qui fonctionne sans configuration serveur.

**Chemin de base dynamique** — GitHub Pages sert le site depuis `/<nom-du-dépôt>/`. La variable `BASE_PATH`, injectée par le workflow de déploiement, ajuste automatiquement les chemins des ressources et du manifeste PWA.

**Règles commerciales dans `constants.ts`** — le barème de crédit et les seuils y figurent comme valeurs par défaut. À partir de l'étape 0.4, ils seront lus depuis Appwrite et modifiables par un administrateur, conformément au document de cadrage.

---

## Phase 3 — Génération des affiches A4 (Electro / Image & Son)

Reproduction fidèle du modèle PowerPoint `EMPOTXA4.potx` (cotes en mm relevées dans le fichier).

| Élément | Règle (identique à la macro `InsererDonnees`) |
|---|---|
| Gabarit | **Electro** (fond bleu) : gem, pem, cuisson, froid, lavage — **Nouvelles technologies** (fond rose) : image-son, nt, telephonie, pc. Forçable à l'impression. |
| Logo | Fichier `logo_<idMarque>` du bucket `medias` ; à défaut, nom de la marque en toutes lettres. |
| Pictos 1 à 6 | Fichiers `picto_<CODE>` ; à défaut, hexagone jaune (ou cartouche rouge « GARANTIE » pour `1AN`, `2ANS`, `5ANS`…). |
| Prix barré | Affiché dès qu'il dépasse le prix de vente, avec le trait orange. |
| Bandeau « وفر » | Seulement si la remise ≥ seuil (10 %). |
| Crédit 0 % | À partir de 2 999 dh (12 / 15 / 18 / 24 mois). |
| Livraison gratuite | À partir de 2 000 dh, sauf article exclu. |

**Écrans** : aperçu en direct dans la saisie ; bouton **Affiches** (liste des campagnes) ou **Aperçu & impression** (saisie) → page `/affiches/:campagneId`.

**Impression / PDF** : bouton *Imprimer / PDF*, puis A4, marges *Aucune*, échelle 100 %, *Graphiques d'arrière-plan* coché. Les formats A5 / A6 / A7 sont imposés automatiquement (2 / 4 / 8 par feuille A4).

**Visuels fixes** : `public/affiches/` (cadres, crédit 0 %, livraison gratuite) — extraits du modèle PowerPoint.
