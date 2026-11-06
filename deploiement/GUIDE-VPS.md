# Mettre Affiches EM en ligne sur un VPS Ubuntu (avec PocketBase)

Tout tourne sur votre VPS : l'application **et** la base de données
(PocketBase : comptes, articles, campagnes, logos). Plus besoin d'Appwrite
Cloud, rien ne se met en pause.

## 1. Louer le VPS

- **VPS** : OVHcloud **VPS-1**, datacenter Europe (Allemagne si la France est
  indisponible), système **Ubuntu 24.04**, paiement mensuel.
- L'hébergeur envoie l'**adresse IP**, l'utilisateur (**ubuntu**) et le mot
  de passe. Ne partagez jamais ce mot de passe dans une conversation.

## 2. Pas de nom de domaine à acheter

Le site aura une adresse gratuite déduite de l'IP, avec HTTPS automatique :
IP `51.68.12.34` → **https://51-68-12-34.sslip.io**. Rien à configurer.

## 3. Renseigner `deploiement/config.txt`

```
IP_VPS=51.68.12.34
UTILISATEUR=ubuntu
DOMAINE=
```

## 4. Installer le serveur (une seule fois)

Double-cliquez sur **`INSTALLER-SERVEUR.bat`**. Mot de passe du VPS demandé
deux fois (tapez `yes` à la première connexion). À la fin, choisissez
l'**e-mail et le mot de passe du super-administrateur PocketBase** : notez-les,
ils servent à la console `https://<adresse-du-site>/_/` et aux scripts.

## 5. Mettre l'application en ligne

Double-cliquez sur **`DEPLOYER.bat`**. À chaque modification de l'application,
relancez seulement celui-ci.

## 6. Copier les données d'Appwrite (une seule fois)

Double-cliquez sur **`MIGRER-DONNEES.bat`** (votre `.env.local` doit encore
contenir les accès Appwrite et la clé API). Il recopie comptes, articles,
marques, campagnes, affiches et logos. Les mots de passe sont repris de
`utilisateurs.json`. Ensuite, supprimez la clé API dans la console Appwrite.

## Au quotidien

| Besoin | Fichier |
| --- | --- |
| Ajouter / modifier un compte | `utilisateurs.json` puis **`COMPTES.bat`** (dossier principal) |
| Publier une nouvelle version | **`DEPLOYER.bat`** |
| Tester sur le PC avec les données en ligne | **`LANCER.bat`** |
| Sauvegarde complète sur le PC | **`SAUVEGARDER.bat`** |
| Changer de serveur | `INSTALLER-SERVEUR.bat` sur le nouveau VPS, puis **`RESTAURER.bat`** |

Une sauvegarde automatique est aussi faite chaque nuit sur le serveur
(7 jours gardés, visible dans la console → Settings → Backups).

`INSTALLER.bat` et `METTRE-A-JOUR-BASE.bat` concernaient Appwrite : ils ne
servent plus.

## En cas de problème

- *Le site ne s'ouvre pas* : vérifiez l'IP dans `config.txt` et que le VPS est démarré.
- *« Identifiants invalides »* : relancez `COMPTES.bat`.
- *Connexion SSH refusée* : vérifiez l'IP et l'utilisateur dans `config.txt`.
