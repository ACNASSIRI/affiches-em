/// <reference path="../pb_data/types.d.ts" />
/**
 * AFFICHES-EM — Structure de la base PocketBase
 * ---------------------------------------------------------------------------
 * Reprend a l'identique les tables Appwrite (memes noms de colonnes) pour que
 * l'application et la copie des donnees n'aient rien a traduire.
 *
 * Droits (equivalent des equipes Appwrite) :
 *   - champ `role` des utilisateurs : "administrateur" ou "operateur" ;
 *   - referentiel (marques, articles, parametres, medias) : lecture pour tout
 *     compte connecte, ecriture reservee aux administrateurs ;
 *   - travail (campagnes, affiches) : chacun ne voit que ses lignes
 *     (champ `proprietaire`), l'administrateur voit tout ;
 *   - journal : ecrit par tous, lu par les administrateurs.
 *
 * Execute automatiquement au demarrage de PocketBase (une seule fois).
 */

const CONNECTE = '@request.auth.id != ""';
const ADMIN = '@request.auth.role = "administrateur"';
const PROPRIO = `(${ADMIN} || proprietaire = @request.auth.id)`;
const CREE_PAR_SOI = `${CONNECTE} && @request.body.proprietaire = @request.auth.id`;

const CATEGORIES = ['gem', 'pem', 'image-son', 'nt', 'telephonie', 'pc', 'cuisson', 'froid', 'lavage'];

// Les champs sont decrits en objets simples avec leur `type` : c'est la forme
// attendue par new Collection({ fields: [...] }).

/** Identifiant : on conserve ceux d'Appwrite (20 caracteres) lors de la copie. */
function champId() {
  return {
    type: 'text',
    name: 'id',
    primaryKey: true,
    system: true,
    required: true,
    min: 1,
    max: 36,
    pattern: '^[a-zA-Z0-9_-]+$',
    autogeneratePattern: '[a-z0-9]{15}',
  };
}

const texte = (name, max, required = false) => ({ type: 'text', name, max, required });
const choix = (name, values, required = false) => ({ type: 'select', name, values, maxSelect: 1, required });
const booleen = (name) => ({ type: 'bool', name });
const nombre = (name, opts = {}) => ({ type: 'number', name, ...opts });
const date = (name, required = false) => ({ type: 'date', name, required });

function horodatage() {
  return [
    { type: 'autodate', name: 'created', onCreate: true, onUpdate: false },
    { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
  ];
}

function collection(name, rules, fields, indexes = []) {
  return new Collection({
    type: 'base',
    name,
    listRule: rules.list,
    viewRule: rules.view ?? rules.list,
    createRule: rules.create,
    updateRule: rules.update,
    deleteRule: rules.delete ?? rules.update,
    fields: [champId(), ...fields, ...horodatage()],
    indexes,
  });
}

const REFERENTIEL = { list: CONNECTE, create: ADMIN, update: ADMIN };
const TRAVAIL = { list: PROPRIO, create: CREE_PAR_SOI, update: PROPRIO };

migrate(
  (app) => {
    /* --- Utilisateurs : role + identifiants Appwrite conserves ----------- */
    const users = app.findCollectionByNameOrId('users');
    const id = users.fields.getByName('id');
    id.max = 36;
    id.min = 1;
    id.pattern = '^[a-zA-Z0-9_-]+$';
    users.fields.add(new SelectField({ name: 'role', values: ['administrateur', 'operateur'], maxSelect: 1 }));
    users.fields.add(new BoolField({ name: 'actif' }));
    users.authRule = 'actif = true'; // un compte desactive ne peut plus se connecter
    users.listRule = `id = @request.auth.id || ${ADMIN}`;
    users.viewRule = `id = @request.auth.id || ${ADMIN}`;
    users.createRule = null; // comptes crees par l'administrateur (script)
    users.updateRule = null;
    users.deleteRule = null;
    app.save(users);

    /* --- Referentiel ------------------------------------------------------ */
    app.save(
      collection('marques', REFERENTIEL, [
        texte('nom', 100, true),
        texte('logoFileId', 255),
        booleen('actif'),
      ], ['CREATE UNIQUE INDEX idx_marques_nom ON marques (nom)']),
    );

    app.save(
      collection('articles', REFERENTIEL, [
        texte('ean', 20, true),
        texte('marqueId', 36, true),
        texte('designation', 120, true),
        texte('reference', 200),
        choix('categorie', CATEGORIES, true),
        texte('photoFileId', 255),
        texte('picto1', 60),
        texte('picto2', 60),
        texte('picto3', 60),
        texte('picto4', 60),
        texte('picto5', 60),
        texte('picto6', 60),
        booleen('livraisonGratuiteExclue'),
        booleen('actif'),
      ], [
        'CREATE UNIQUE INDEX idx_articles_ean ON articles (ean)',
        'CREATE INDEX idx_articles_marque ON articles (marqueId)',
        'CREATE INDEX idx_articles_categorie ON articles (categorie)',
      ]),
    );

    app.save(
      collection('parametres', REFERENTIEL, [
        texte('cle', 60, true),
        texte('valeur', 5000),
        texte('description', 255),
      ], ['CREATE UNIQUE INDEX idx_parametres_cle ON parametres (cle)']),
    );

    /* --- Travail ---------------------------------------------------------- */
    app.save(
      collection('campagnes', TRAVAIL, [
        texte('nom', 120, true),
        date('dateDebut'),
        date('dateFin'),
        choix('statut', ['brouillon', 'validee', 'imprimee', 'archivee']),
        texte('createdBy', 36),
        texte('gabarit', 64),
        texte('proprietaire', 36),
      ], [
        'CREATE INDEX idx_campagnes_auteur ON campagnes (createdBy)',
        'CREATE INDEX idx_campagnes_proprietaire ON campagnes (proprietaire)',
      ]),
    );

    app.save(
      collection('affiches', TRAVAIL, [
        texte('campagneId', 36, true),
        texte('ean', 20, true),
        nombre('prixBarre', { min: 0 }),
        nombre('prixPrincipal', { min: 0 }),
        choix('format', ['A4', 'A5', 'A6', 'A7']),
        booleen('stockLimite'),
        booleen('nouveaute'),
        booleen('promotion'),
        texte('visuelFondFileId', 255),
        nombre('ordre', { min: 0, max: 100000, onlyInt: true }),
        texte('mentions', 500),
        texte('proprietaire', 36),
      ], [
        'CREATE INDEX idx_affiches_campagne ON affiches (campagneId)',
        'CREATE INDEX idx_affiches_proprietaire ON affiches (proprietaire)',
      ]),
    );

    app.save(
      collection(
        'demandes_article',
        { list: PROPRIO, create: CREE_PAR_SOI, update: ADMIN },
        [
          texte('ean', 20, true),
          texte('demandeur', 36, true),
          texte('commentaire', 500),
          choix('statut', ['en_attente', 'traitee', 'rejetee']),
          texte('proprietaire', 36),
        ],
        ['CREATE INDEX idx_demandes_statut ON demandes_article (statut)'],
      ),
    );

    app.save(
      collection(
        'journal',
        { list: ADMIN, create: CONNECTE, update: null, delete: null },
        [
          choix('action', ['creation', 'modification', 'suppression', 'export', 'connexion'], true),
          texte('ressource', 120, true),
          texte('userId', 36, true),
          texte('avant', 4000),
          texte('apres', 4000),
          date('date', true),
          texte('utilisateur', 120),
          texte('appareil', 250),
        ],
        ['CREATE INDEX idx_journal_date ON journal (date)'],
      ),
    );

    /* --- Fichiers (logos, pictogrammes, fonds d'operation) ---------------- */
    app.save(
      collection('medias', REFERENTIEL, [
        texte('cle', 120, true),
        {
          type: 'file',
          name: 'fichier',
          maxSelect: 1,
          maxSize: 10 * 1024 * 1024,
          mimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'],
          protected: false,
        },
      ], ['CREATE UNIQUE INDEX idx_medias_cle ON medias (cle)']),
    );

    /* --- Sauvegarde automatique chaque nuit (7 jours gardes) -------------- */
    const settings = app.settings();
    settings.meta.appName = 'Affiches EM';
    settings.backups.cron = '0 3 * * *';
    settings.backups.cronMaxKeep = 7;
    app.save(settings);
  },
  (app) => {
    for (const nom of ['medias', 'journal', 'demandes_article', 'affiches', 'campagnes', 'parametres', 'articles', 'marques']) {
      try {
        app.delete(app.findCollectionByNameOrId(nom));
      } catch (_) {
        /* deja absente */
      }
    }
  },
);
