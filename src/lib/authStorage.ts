// Custom Supabase auth storage adapter backed by IndexedDB instead of the
// default localStorage. iOS evicts localStorage more aggressively than
// IndexedDB under storage pressure (and Safari's ITP caps localStorage
// lifetime to 7 days of script-writable storage in some configurations) —
// this is a mitigation for iPhone users getting randomly logged out, not a
// guarantee (see also requestPersistentStorage() below, and
// navigator.storage.persist() called from SupabaseAuthContext).
//
// Implements Supabase's SupportedStorage interface: getItem/setItem/
// removeItem, each allowed to return a Promise. GoTrue only ever calls this
// with its own storage key(s) (the session, and — if email-link/OAuth flows
// are ever added — a PKCE code verifier); this adapter doesn't need to know
// those keys ahead of time, it just proxies whatever key it's given.
const DB_NAME = "redmark_auth";
const DB_VERSION = 1;
const STORE_NAME = "kv";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
    });
  }
  return dbPromise;
}

async function idbGet(key: string): Promise<string | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve((req.result as string | undefined) ?? null);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB get failed"));
  });
}

async function idbSet(key: string, value: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB put failed"));
  });
}

async function idbRemove(key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB delete failed"));
  });
}

// One-time-per-key migration: if IndexedDB has nothing under this key yet
// but localStorage does (an existing session from before this change),
// copy it over and clear the localStorage copy so there's a single source
// of truth afterward. Cheap to call on every getItem — the IndexedDB check
// makes it a no-op once migrated.
async function migrateFromLocalStorageIfNeeded(key: string): Promise<void> {
  const existing = await idbGet(key);
  if (existing !== null) return;

  let legacyValue: string | null = null;
  try {
    legacyValue = localStorage.getItem(key);
  } catch {
    return; // localStorage inaccessible (private mode, etc.) — nothing to migrate
  }
  if (!legacyValue) return;

  await idbSet(key, legacyValue);
  try {
    localStorage.removeItem(key);
  } catch {
    // Non-fatal — IndexedDB now has the authoritative copy either way.
  }
}

// Falls back to localStorage (today's exact behavior) if IndexedDB throws —
// e.g. some older Safari private-browsing modes disallow it entirely. Auth
// should degrade to "works like before this change", never break outright.
export const indexedDbAuthStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      await migrateFromLocalStorageIfNeeded(key);
      return await idbGet(key);
    } catch (error) {
      console.error("Auth storage getItem failed, falling back to localStorage:", error);
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      await idbSet(key, value);
    } catch (error) {
      console.error("Auth storage setItem failed, falling back to localStorage:", error);
      try {
        localStorage.setItem(key, value);
      } catch {
        // Both storages unavailable — this write simply won't persist.
      }
    }
  },
  async removeItem(key: string): Promise<void> {
    try {
      await idbRemove(key);
    } catch (error) {
      console.error("Auth storage removeItem failed:", error);
    }
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore — best-effort cleanup of any pre-migration leftover
    }
  },
};

// Asks the browser to treat this origin's storage as "persistent" instead
// of evictable under storage pressure — the other half of the iOS mitigation
// (IndexedDB itself isn't exempt from eviction, just less aggressively
// targeted than localStorage). Best-effort and silent either way: the API
// isn't available in every browser, and even where it is, the browser can
// still say no (e.g. the PWA hasn't been used/installed enough yet) — this
// is a mitigation the app doesn't depend on to function.
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
  try {
    const alreadyPersisted = await navigator.storage.persisted?.();
    if (alreadyPersisted) return true;
    return await navigator.storage.persist();
  } catch (error) {
    console.error("navigator.storage.persist() failed:", error);
    return false;
  }
}
