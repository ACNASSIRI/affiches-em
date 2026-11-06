/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** Adresse du serveur PocketBase (facultatif : meme domaine par defaut). */
  readonly VITE_PB_URL?: string;
  /** Domaine des adresses techniques associees aux identifiants. */
  readonly VITE_DOMAINE_IDENTIFIANTS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
