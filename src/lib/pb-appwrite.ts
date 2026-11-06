/**
 * AFFICHES-EM — Couche de compatibilite Appwrite -> PocketBase
 * ---------------------------------------------------------------------------
 * L'application a ete ecrite pour le SDK Appwrite. Ce module en reproduit la
 * petite partie utilisee (Client, Account, TablesDB, Storage, Teams, ID,
 * Query, Permission, Role, AppwriteException) en s'appuyant sur PocketBase.
 *
 * vite.config.ts et tsconfig redirigent l'import « appwrite » vers ce fichier :
 * les modules metier (articles, campagnes, marques...) n'ont donc pas change.
 *
 * Correspondances :
 *   - table Appwrite        -> collection PocketBase (meme nom, « - » -> « _ ») ;
 *   - $id / $createdAt      -> id / created ;
 *   - equipes (roles)       -> champ `role` de l'utilisateur ;
 *   - permission Role.user  -> champ `proprietaire` (regles PocketBase) ;
 *   - compartiment « medias » -> collection `medias` (cle + fichier).
 */

import PocketBase, { ClientResponseError, type RecordModel } from 'pocketbase';

/* -------------------------------------------------------------------------- */
/* Client                                                                      */
/* -------------------------------------------------------------------------- */

let pb: PocketBase | null = null;

/** Instance PocketBase partagee (creee par Client.setEndpoint). */
export function pocketbase(): PocketBase {
  if (!pb) {
    pb = new PocketBase(window.location.origin);
    pb.autoCancellation(false);
  }
  return pb;
}

export class Client {
  setEndpoint(endpoint: string): this {
    pb = new PocketBase(endpoint.replace(/\/v1\/?$/, '').replace(/\/$/, '') || window.location.origin);
    pb.autoCancellation(false);
    return this;
  }
  setProject(_projet: string): this {
    return this;
  }
}

/* -------------------------------------------------------------------------- */
/* Erreurs                                                                     */
/* -------------------------------------------------------------------------- */

export class AppwriteException extends Error {
  readonly code: number;
  readonly type: string;
  readonly response: string;

  constructor(message: string, code = 0, type = '', response = '') {
    super(message);
    this.name = 'AppwriteException';
    this.code = code;
    this.type = type;
    this.response = response;
  }
}

/** Traduit une erreur PocketBase dans le format attendu par l'application. */
function traduire(erreur: unknown, contexte: 'auth' | 'ecriture' | 'lecture' = 'lecture'): AppwriteException {
  if (erreur instanceof AppwriteException) return erreur;
  if (!(erreur instanceof ClientResponseError)) {
    return new AppwriteException(erreur instanceof Error ? erreur.message : String(erreur));
  }
  const statut = erreur.status;
  const donnees = (erreur.response?.data ?? {}) as Record<string, { code?: string; message?: string }>;
  const champs = Object.entries(donnees);
  const message = erreur.response?.message || erreur.message || 'Erreur du serveur.';

  if (statut === 0) return new AppwriteException('Connexion au serveur impossible. Verifiez votre reseau.', 0, 'network');
  if (champs.some(([, v]) => v?.code === 'validation_not_unique')) {
    return new AppwriteException('Cette valeur existe deja.', 409, 'row_already_exists');
  }
  if (contexte === 'auth' && statut === 400) {
    return new AppwriteException('Identifiants invalides.', 401, 'user_invalid_credentials');
  }
  if (statut === 429) return new AppwriteException(message, 429, 'general_rate_limit_exceeded');
  if (statut === 401) return new AppwriteException(message, 401, 'user_unauthorized');
  if (statut === 403) return new AppwriteException(message, 403, 'user_unauthorized');
  if (statut === 404) return new AppwriteException(message, 404, 'row_not_found');
  if (statut === 413) return new AppwriteException(message, 413, 'storage_invalid_file_size');
  if (statut === 400 && champs.length > 0) {
    const [champ, detail] = champs[0]!;
    if (detail?.code === 'validation_invalid_mime_type') {
      return new AppwriteException(detail.message ?? message, 400, 'storage_file_type_unsupported');
    }
    if (detail?.code === 'validation_file_size_limit') {
      return new AppwriteException(detail.message ?? message, 413, 'storage_invalid_file_size');
    }
    return new AppwriteException(`Unknown attribute or invalid value: "${champ}" — ${detail?.message ?? ''}`, 400, 'document_invalid_structure');
  }
  // Ecriture refusee par une regle : PocketBase repond 400 sans detail de champ.
  if (statut === 400 && contexte === 'ecriture') {
    return new AppwriteException("Vous n'avez pas les droits pour cette action.", 401, 'user_unauthorized');
  }
  return new AppwriteException(message, statut, 'general_error');
}

/* -------------------------------------------------------------------------- */
/* Identifiants, requetes, permissions                                         */
/* -------------------------------------------------------------------------- */

export const ID = {
  /** Identifiant aleatoire de 15 caracteres, accepte par PocketBase. */
  unique(): string {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const octets = crypto.getRandomValues(new Uint8Array(15));
    return Array.from(octets, (o) => alphabet[o % alphabet.length]).join('');
  },
  custom(id: string): string {
    return id;
  },
};

interface Requete {
  method: string;
  attribute?: string;
  values?: unknown[];
}

const req = (method: string, attribute?: string, values?: unknown[]) =>
  JSON.stringify({ method, attribute, values } satisfies Requete);
const liste = (v: unknown) => (Array.isArray(v) ? v : [v]);

export const Query = {
  equal: (a: string, v: unknown) => req('equal', a, liste(v)),
  notEqual: (a: string, v: unknown) => req('notEqual', a, liste(v)),
  lessThan: (a: string, v: unknown) => req('lessThan', a, [v]),
  lessThanEqual: (a: string, v: unknown) => req('lessThanEqual', a, [v]),
  greaterThan: (a: string, v: unknown) => req('greaterThan', a, [v]),
  greaterThanEqual: (a: string, v: unknown) => req('greaterThanEqual', a, [v]),
  search: (a: string, v: string) => req('search', a, [v]),
  startsWith: (a: string, v: string) => req('startsWith', a, [v]),
  contains: (a: string, v: unknown) => req('contains', a, liste(v)),
  isNull: (a: string) => req('isNull', a),
  isNotNull: (a: string) => req('isNotNull', a),
  orderAsc: (a: string) => req('orderAsc', a),
  orderDesc: (a: string) => req('orderDesc', a),
  limit: (n: number) => req('limit', undefined, [n]),
  offset: (n: number) => req('offset', undefined, [n]),
  select: (a: string[]) => req('select', undefined, a),
};

/** Les permissions sont portees par les regles PocketBase ; seul le proprietaire est retenu. */
export const Role = {
  user: (id: string) => `user:${id}`,
  team: (id: string) => `team:${id}`,
  any: () => 'any',
  users: () => 'users',
};

export const Permission = {
  read: (r: string) => `read("${r}")`,
  update: (r: string) => `update("${r}")`,
  delete: (r: string) => `delete("${r}")`,
  create: (r: string) => `create("${r}")`,
  write: (r: string) => `write("${r}")`,
};

function proprietaireDepuis(permissions?: string[]): string | null {
  for (const p of permissions ?? []) {
    const m = /"user:([^"]+)"/.exec(p);
    if (m) return m[1]!;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Traduction des donnees                                                      */
/* -------------------------------------------------------------------------- */

const SYSTEME: Record<string, string> = { $id: 'id', $createdAt: 'created', $updatedAt: 'updated' };
const champ = (a: string) => SYSTEME[a] ?? a;
const collectionDe = (tableId: string) => tableId.replace(/-/g, '_');

const DATE_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const DATE_PB = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/;

/** Valeur ecrite dans un filtre PocketBase (dates au format « AAAA-MM-JJ HH:MM:SS »). */
function litteral(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  let s = String(v);
  if (DATE_ISO.test(s)) s = s.replace('T', ' ');
  return JSON.stringify(s);
}

function versFiltre(requetes: Requete[]): { filter: string; sort: string; perPage: number; page: number; fields?: string } {
  const conditions: string[] = [];
  const tri: string[] = [];
  let limite = 25;
  let decalage = 0;
  let fields: string | undefined;

  for (const r of requetes) {
    const a = r.attribute ? champ(r.attribute) : '';
    const v = r.values ?? [];
    switch (r.method) {
      case 'equal':
        conditions.push(`(${v.map((x) => `${a} = ${litteral(x)}`).join(' || ')})`);
        break;
      case 'notEqual':
        conditions.push(`(${v.map((x) => `${a} != ${litteral(x)}`).join(' && ')})`);
        break;
      case 'lessThan':
        conditions.push(`${a} < ${litteral(v[0])}`);
        break;
      case 'lessThanEqual':
        conditions.push(`${a} <= ${litteral(v[0])}`);
        break;
      case 'greaterThan':
        conditions.push(`${a} > ${litteral(v[0])}`);
        break;
      case 'greaterThanEqual':
        conditions.push(`${a} >= ${litteral(v[0])}`);
        break;
      case 'search':
      case 'contains':
        conditions.push(`(${v.map((x) => `${a} ~ ${litteral(x)}`).join(' || ')})`);
        break;
      case 'startsWith':
        conditions.push(`${a} ~ ${litteral(`${String(v[0]).replace(/%/g, '')}%`)}`);
        break;
      case 'isNull':
        conditions.push(`${a} = ""`);
        break;
      case 'isNotNull':
        conditions.push(`${a} != ""`);
        break;
      case 'orderAsc':
        tri.push(a);
        break;
      case 'orderDesc':
        tri.push(`-${a}`);
        break;
      case 'limit':
        limite = Number(v[0]) || 25;
        break;
      case 'offset':
        decalage = Number(v[0]) || 0;
        break;
      case 'select':
        fields = ['id', 'created', 'updated', ...v.map((x) => champ(String(x)))].join(',');
        break;
    }
  }
  const perPage = Math.min(Math.max(limite, 1), 1000);
  return {
    filter: conditions.join(' && '),
    sort: tri.join(','),
    perPage,
    page: Math.floor(decalage / perPage) + 1,
    fields,
  };
}

/** Enregistrement PocketBase -> ligne au format Appwrite. */
function versLigne<T>(r: RecordModel): T {
  const ligne: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) {
    if (k === 'collectionId' || k === 'collectionName' || k === 'expand') continue;
    if (k === 'id') ligne.$id = v;
    else if (k === 'created') ligne.$createdAt = isoDepuis(v);
    else if (k === 'updated') ligne.$updatedAt = isoDepuis(v);
    else if (v === '') ligne[k] = null; // Appwrite renvoie null pour une valeur absente
    else if (typeof v === 'string' && DATE_PB.test(v)) ligne[k] = isoDepuis(v);
    else ligne[k] = v;
  }
  return ligne as T;
}

function isoDepuis(v: unknown): string {
  return typeof v === 'string' ? v.replace(' ', 'T') : '';
}

/** Donnees envoyees a PocketBase : null -> « vide ». */
function versDonnees(data: Record<string, unknown>): Record<string, unknown> {
  const sortie: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (k.startsWith('$')) continue;
    sortie[k] = v === null || v === undefined ? '' : v;
  }
  return sortie;
}

/* -------------------------------------------------------------------------- */
/* Tables                                                                      */
/* -------------------------------------------------------------------------- */

interface ArgsListe {
  databaseId?: string;
  tableId: string;
  queries?: string[];
}

export class TablesDB {
  constructor(_client?: Client) {}

  async listRows<T = Record<string, unknown>>({ tableId, queries = [] }: ArgsListe): Promise<{ total: number; rows: T[] }> {
    const { filter, sort, perPage, page, fields } = versFiltre(queries.map((q) => JSON.parse(q) as Requete));
    try {
      const res = await pocketbase()
        .collection(collectionDe(tableId))
        .getList(page, perPage, { filter, sort: sort || undefined, fields });
      return { total: res.totalItems, rows: res.items.map((r) => versLigne<T>(r)) };
    } catch (e) {
      throw traduire(e);
    }
  }

  async getRow<T = Record<string, unknown>>({ tableId, rowId }: { databaseId?: string; tableId: string; rowId: string }): Promise<T> {
    try {
      return versLigne<T>(await pocketbase().collection(collectionDe(tableId)).getOne(rowId));
    } catch (e) {
      throw traduire(e);
    }
  }

  async createRow<T = Record<string, unknown>>({
    tableId,
    rowId,
    data,
    permissions,
  }: {
    databaseId?: string;
    tableId: string;
    rowId?: string;
    data: object;
    permissions?: string[];
  }): Promise<T> {
    const corps = versDonnees(data as Record<string, unknown>);
    if (rowId && rowId !== 'unique()') corps.id = rowId;
    const proprietaire = proprietaireDepuis(permissions);
    if (proprietaire) corps.proprietaire = proprietaire;
    try {
      return versLigne<T>(await pocketbase().collection(collectionDe(tableId)).create(corps));
    } catch (e) {
      throw traduire(e, 'ecriture');
    }
  }

  async updateRow<T = Record<string, unknown>>({
    tableId,
    rowId,
    data,
  }: {
    databaseId?: string;
    tableId: string;
    rowId: string;
    data?: object;
    permissions?: string[];
  }): Promise<T> {
    try {
      return versLigne<T>(await pocketbase().collection(collectionDe(tableId)).update(rowId, versDonnees((data ?? {}) as Record<string, unknown>)));
    } catch (e) {
      throw traduire(e, 'ecriture');
    }
  }

  async deleteRow({ tableId, rowId }: { databaseId?: string; tableId: string; rowId: string }): Promise<object> {
    try {
      await pocketbase().collection(collectionDe(tableId)).delete(rowId);
      return {};
    } catch (e) {
      throw traduire(e, 'ecriture');
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Fichiers (collection « medias » : cle + fichier)                            */
/* -------------------------------------------------------------------------- */

async function mediaParCle(cle: string): Promise<RecordModel | null> {
  try {
    return await pocketbase().collection('medias').getFirstListItem(`cle = ${litteral(cle)}`);
  } catch (e) {
    if (e instanceof ClientResponseError && e.status === 404) return null;
    throw traduire(e);
  }
}

/** URL du fichier enregistre sous `cle`, ou null s'il n'existe pas. */
export async function urlMedia(cle: string): Promise<string | null> {
  const r = await mediaParCle(cle);
  if (!r || !r.fichier) return null;
  return pocketbase().files.getURL(r, String(r.fichier));
}

export class Storage {
  constructor(_client?: Client) {}

  async createFile({ fileId, file }: { bucketId?: string; fileId: string; file: File }): Promise<{ $id: string }> {
    try {
      await pocketbase().collection('medias').create({ cle: fileId, fichier: file });
      return { $id: fileId };
    } catch (e) {
      throw traduire(e, 'ecriture');
    }
  }

  async deleteFile({ fileId }: { bucketId?: string; fileId: string }): Promise<object> {
    const r = await mediaParCle(fileId);
    if (!r) throw new AppwriteException('Fichier introuvable.', 404, 'storage_file_not_found');
    try {
      await pocketbase().collection('medias').delete(r.id);
      return {};
    } catch (e) {
      throw traduire(e, 'ecriture');
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Comptes et roles                                                            */
/* -------------------------------------------------------------------------- */

export class Account {
  constructor(_client?: Client) {}

  async get(): Promise<Models.User<Models.Preferences>> {
    const client = pocketbase();
    if (!client.authStore.isValid) throw new AppwriteException('Non connecte.', 401, 'general_unauthorized_scope');
    try {
      await client.collection('users').authRefresh();
    } catch (e) {
      client.authStore.clear();
      throw traduire(e);
    }
    const r = client.authStore.record as RecordModel;
    return { $id: r.id, name: String(r.name ?? ''), email: String(r.email ?? ''), prefs: {} };
  }

  async createEmailPasswordSession({ email, password }: { email: string; password: string }): Promise<object> {
    try {
      await pocketbase().collection('users').authWithPassword(email, password);
      return {};
    } catch (e) {
      throw traduire(e, 'auth');
    }
  }

  /** PocketBase ne decrit pas l'appareil : le journal se rabat sur le navigateur. */
  async getSession(_args?: { sessionId: string }): Promise<Models.Session> {
    throw new AppwriteException('Non disponible.', 404, 'user_session_not_found');
  }

  async deleteSession(_args?: { sessionId: string }): Promise<object> {
    pocketbase().authStore.clear();
    return {};
  }
}

export class Teams {
  constructor(_client?: Client) {}

  /** Le role porte par l'utilisateur tient lieu d'equipe. */
  async list(): Promise<{ total: number; teams: { $id: string }[] }> {
    const role = pocketbase().authStore.record?.role;
    const equipe = role === 'administrateur' ? 'administrateurs' : role === 'operateur' ? 'operateurs' : null;
    return { total: equipe ? 1 : 0, teams: equipe ? [{ $id: equipe }] : [] };
  }
}

/* -------------------------------------------------------------------------- */
/* Types utilises par l'application                                            */
/* -------------------------------------------------------------------------- */

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Models {
  export type Preferences = Record<string, unknown>;
  export interface User<P = Preferences> {
    $id: string;
    name: string;
    email: string;
    prefs: P;
  }
  /** Champs de session Appwrite lus par le journal (jamais fournis ici). */
  export interface Session {
    deviceBrand?: string;
    deviceModel?: string;
    deviceName?: string;
    osName?: string;
    osVersion?: string;
    clientName?: string;
    clientVersion?: string;
    ip?: string;
    countryName?: string;
  }
}
