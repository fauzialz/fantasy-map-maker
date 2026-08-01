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
}

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
    json: serialize({ ...scene, meta: { ...scene.meta, updatedAt } }),
  };
}

export async function saveScene(scene: Scene): Promise<void> {
  const db = await open();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put(draftRecord(scene));
  // Settle on the transaction, not the put: a put can report success and the transaction
  // still abort — on quota, most often — which would be silent data loss.
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error ?? new Error("autosave failed"));
  });
}

/** The most recently saved draft, or null on a first visit. */
export async function loadLatestScene(): Promise<Scene | null> {
  const db = await open();
  const index = db.transaction(STORE, "readonly").objectStore(STORE).index("updatedAt");
  const request = index.openCursor(null, "prev");
  const cursor = await new Promise<IDBCursorWithValue | null>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("could not read drafts"));
  });
  return cursor ? deserialize((cursor.value as DraftRecord).json) : null;
}
