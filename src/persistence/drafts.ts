import { deserialize, serialize } from "../scene/scene";
import type { Scene } from "../scene/types";

/**
 * WP-12 — local drafts in IndexedDB, the whole of P0's persistence.
 *
 * IndexedDB rather than localStorage (ADR-07): a scene with a couple of thousand objects
 * is megabytes of JSON, well past localStorage's ~5 MB and it would be a synchronous
 * write on the main thread besides. **No scene data may go to localStorage.**
 *
 * Raw IDB, no wrapper library — this is one store, three operations. The keyPath is the
 * scene's own `meta.id`, the client UUID ADR-07 requires from day one so P2 can claim
 * drafts into an account idempotently; that is why drafts are a keyed collection rather
 * than the single "current scene" slot P0 alone would need.
 */

const DB_NAME = "map-byfauzi";
const DB_VERSION = 1;
const STORE = "scenes";

export interface DraftRecord {
  /** `scene.meta.id` — the key, and P2's claim handle (ADR-07) */
  id: string;
  title: string;
  /** ISO save time, indexed: startup restores the newest without reading any other record */
  updatedAt: string;
  /** the scene as `serialize()` wrote it; `deserialize()` is the only way back, so a
   *  restored draft always passes through `migrate()` (ADR-23) */
  json: string;
  /** Canvas size, so the gallery can label a row without parsing `json`. WP-22. */
  canvas?: { w: number; h: number };
  /** Small JPEG of the map, rendered on demand. Absent until the map has been opened. */
  thumb?: Blob;
}

/**
 * A gallery row: everything except the scene itself.
 *
 * ponytail: `listDrafts` still reads whole records and drops `json`, because IndexedDB has
 * no projection — a cursor hands back the entire value. **Measured** at 20 drafts of a
 * 152 KB scene with a 20 KB thumbnail each: **7.4 ms** per gallery open, against 1.0 ms if
 * summaries lived in their own store. A 7× ratio and an irrelevant absolute — it is half a
 * frame, once, on a dialog open — so the second store and its `DB_VERSION` migration are not
 * worth buying. It scales linearly, so split them if the local draft cap ever rises well
 * past ADR-33's ~20.
 */
export type DraftSummary = Omit<DraftRecord, "json">;

let opening: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (request.result.objectStoreNames.contains(STORE)) return;
      const store = request.result.createObjectStore(STORE, { keyPath: "id" });
      store.createIndex("updatedAt", "updatedAt");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB unavailable"));
  }).catch((err: unknown) => {
    // Don't cache a rejection: private-mode and quota failures are worth retrying.
    opening = undefined;
    throw err;
  });
  return opening;
}

/**
 * The record as it goes to disk. `updatedAt` is stamped here rather than in the store,
 * because a save is not an edit — writing it back into the live scene would make autosave
 * its own trigger.
 */
export function draftRecord(scene: Scene, at = new Date()): DraftRecord {
  const updatedAt = at.toISOString();
  return {
    id: scene.meta.id,
    title: scene.meta.title,
    updatedAt,
    canvas: { w: scene.meta.canvas.w, h: scene.meta.canvas.h },
    json: serialize({ ...scene, meta: { ...scene.meta, updatedAt } }),
  };
}

/**
 * The record after a rename: the row's title **and** the scene's own `meta.title`.
 *
 * Both, or the gallery and the map disagree — rewriting only the row leaves the old name
 * inside `json`, so reopening the map silently reverts it, and an export or a P1 `.map.json`
 * carries the stale one. Pure, so the part that actually goes wrong is unit-tested.
 */
export function renamedRecord(record: DraftRecord, title: string): DraftRecord {
  const scene = deserialize(record.json);
  return {
    ...record,
    title,
    json: serialize({ ...scene, meta: { ...scene.meta, title } }),
  };
}

/** Promise over a request, since every IDB call below needs the same three lines. */
const settle = <T>(request: IDBRequest<T>, what: string): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error(what));
  });

const complete = (tx: IDBTransaction, what: string): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error ?? new Error(what));
  });

export async function saveScene(scene: Scene): Promise<void> {
  const db = await open();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  // Carry the thumbnail forward. `put` replaces the whole record, so without this every
  // autosave tick would blank the gallery's picture of the map being edited — read and
  // write inside one transaction so nothing can interleave.
  const existing = await settle(store.get(scene.meta.id), "could not read the draft");
  const record = draftRecord(scene);
  store.put(existing?.thumb ? { ...record, thumb: existing.thumb } : record);
  // Settle on the transaction, not the put: a put can report success and the transaction
  // still abort — on quota, most often — which would be silent data loss.
  await complete(tx, "autosave failed");
}

/** One draft by id, or null if it is not there — deleted in another tab, most likely. */
export async function loadScene(id: string): Promise<Scene | null> {
  const db = await open();
  const record = await settle(
    db.transaction(STORE, "readonly").objectStore(STORE).get(id),
    "could not read that map",
  );
  return record ? deserialize((record as DraftRecord).json) : null;
}

/** Every draft, newest first, without the scenes. The gallery's whole data source. */
export async function listDrafts(): Promise<DraftSummary[]> {
  const db = await open();
  const index = db.transaction(STORE, "readonly").objectStore(STORE).index("updatedAt");
  const request = index.openCursor(null, "prev");
  return new Promise((resolve, reject) => {
    const out: DraftSummary[] = [];
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return resolve(out);
      const { json: _json, ...summary } = cursor.value as DraftRecord;
      out.push(summary);
      cursor.continue();
    };
    request.onerror = () => reject(request.error ?? new Error("could not list your maps"));
  });
}

export async function deleteDraft(id: string): Promise<void> {
  const db = await open();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).delete(id);
  await complete(tx, "could not delete that map");
}

export async function renameDraft(id: string, title: string): Promise<void> {
  const db = await open();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  const record = await settle(store.get(id), "could not read that map");
  if (record) store.put(renamedRecord(record as DraftRecord, title));
  await complete(tx, "could not rename that map");
}

export async function putThumb(id: string, thumb: Blob): Promise<void> {
  const db = await open();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  const record = await settle(store.get(id), "could not read that map");
  // Only ever decorate a record that exists; a thumbnail must never resurrect a draft the
  // user just deleted, which a bare `put` would do.
  if (record) store.put({ ...(record as DraftRecord), thumb });
  await complete(tx, "could not store the thumbnail");
}

// `rememberOpen` / `rememberedOpen` lived here until WP-30: a localStorage id recording which
// map was open, so a reload came back to it. The URL says that now (`14` §4.4), and the route
// parameter is already this store's keyPath — so routing *removed* a mechanism rather than
// adding one, and `loadLatestScene` went with it.
