// IndexedDB storage for Pinball Forge parts kit image blobs.
// Keeps large PNG data out of localStorage (which has a ~5 MB cap).
// Each parts kit is identified by a string ID stored on the table object.
// Slots are named after the renderer.js `parts.*` keys:
//   bumper_base, bumper_cap, bumper_cap_lit,
//   slingshot, rail, rail_post, flipper_left,
//   target_drop, target_flag, target_shield, target_gem,
//   saucer, apron_left, apron_right
//
// Architecture note: loadKitAssets() returns plain HTMLImageElement objects
// so the AI theme generator can call the same function as a manual upload —
// the engine's setImages({ parts }) interface is the single entry point.

const DB_NAME = "urlinc_pinball_parts_v1";
const DB_VERSION = 1;
const STORE = "parts";

interface PartRecord {
  key: string;    // `${kitId}/${slot}`
  kitId: string;
  slot: string;
  blob: Blob;
  mimeType: string;
}

export interface KitAssets {
  images: Record<string, HTMLImageElement>;
  /** Blob-URLs for thumbnail display. Caller must NOT revoke these manually —
   *  they are tracked internally and revoked when replaced or removed. */
  thumbUrls: Record<string, string>;
}

// Module-level blob URL registry so we can revoke stale URLs on replace/remove.
const _liveUrls: Record<string, string> = {};
function _trackUrl(key: string, url: string) {
  if (_liveUrls[key] && _liveUrls[key] !== url) URL.revokeObjectURL(_liveUrls[key]);
  _liveUrls[key] = url;
}
function _revokeUrl(key: string) {
  if (_liveUrls[key]) { URL.revokeObjectURL(_liveUrls[key]); delete _liveUrls[key]; }
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "key" });
        store.createIndex("kitId", "kitId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new Error(`IndexedDB open failed: ${req.error?.message}`));
  });
}

/** Persist a single image blob into a kit slot. */
export async function savePart(kitId: string, slot: string, blob: Blob): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const record: PartRecord = {
      key: `${kitId}/${slot}`,
      kitId,
      slot,
      blob,
      mimeType: blob.type || "image/png",
    };
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error(`Failed to save part "${slot}": ${tx.error?.message}`));
  });
}

/** Remove a single slot from a kit. */
export async function removePart(kitId: string, slot: string): Promise<void> {
  _revokeUrl(`${kitId}/${slot}`);
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(`${kitId}/${slot}`);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error(`Failed to remove part "${slot}": ${tx.error?.message}`));
  });
}

/** Delete all blobs for a kit. Only call when no saved table references this kitId. */
export async function deleteKit(kitId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).index("kitId").openCursor(IDBKeyRange.only(kitId));
    req.onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (cursor) {
        _revokeUrl(cursor.value.key as string);
        cursor.delete();
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error(`Failed to delete kit "${kitId}": ${tx.error?.message}`));
  });
}

/** Returns all slot names stored for a kit (without loading blobs). */
export async function listKitSlots(kitId: string): Promise<string[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).index("kitId").getAllKeys(IDBKeyRange.only(kitId));
    req.onsuccess = () => {
      const keys = req.result as string[];
      resolve(keys.map((k) => k.split("/").slice(1).join("/")));
    };
    req.onerror = () => reject(new Error(`Failed to list kit slots: ${req.error?.message}`));
  });
}

/** Loads all blobs for a kit, returns HTMLImageElements + thumbnail blob-URLs.
 *  Slots that fail to decode are silently skipped (procedural fallback takes over). */
export async function loadKitAssets(kitId: string): Promise<KitAssets> {
  const db = await openDB();
  const records: PartRecord[] = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).index("kitId").getAll(IDBKeyRange.only(kitId));
    req.onsuccess = () => resolve(req.result as PartRecord[]);
    req.onerror = () => reject(new Error(`Failed to load kit "${kitId}": ${req.error?.message}`));
  });

  const images: Record<string, HTMLImageElement> = {};
  const thumbUrls: Record<string, string> = {};

  await Promise.all(
    records.map(
      (rec) =>
        new Promise<void>((resolve) => {
          const url = URL.createObjectURL(rec.blob);
          _trackUrl(rec.key, url);
          thumbUrls[rec.slot] = url;
          const img = new Image();
          img.onload = () => { images[rec.slot] = img; resolve(); };
          img.onerror = () => {
            // Blob URL is tracked for revocation later; skip this slot.
            resolve();
          };
          img.src = url;
        })
    )
  );

  return { images, thumbUrls };
}

/** Generates a unique kit ID. */
export function generateKitId(): string {
  return `kit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
