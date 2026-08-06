// IndexedDB-backed queue for photo uploads that failed or are waiting to be sent.
// Kept separate from the `redmark_photos` database in indexedDB.ts.
import { uploadPhoto } from "./supabaseApi";
import { isRetriableUploadError } from "./networkErrors";

const DB_NAME = "redmark_upload_queue";
const DB_VERSION = 1;
const QUEUE_STORE = "uploadQueue";

/**
 * How long a single queued upload may run before it is abandoned.
 *
 * THE BUG THIS EXISTS FOR: fetch has no default timeout, and neither the
 * Supabase client nor storage-js adds one. On a weak reconnect — one bar, a
 * captive portal, a cell handoff — the POST can hang indefinitely. The item
 * stayed pinned in "uploading", processQueue never returned, no catch ever
 * ran, and the indicator span forever with nothing logged. A photo taken on
 * site was invisibly stranded.
 *
 * 60s is generous for a compressed site photo on bad signal, while still
 * bounded — the point is that the state machine always gets an answer.
 */
export const QUEUE_UPLOAD_TIMEOUT_MS = 60_000;

/**
 * pending    — queued, not yet attempted (or reset for another try)
 * uploading  — in flight right now
 * failed     — transient failure (transport/timeout/5xx); WILL be retried
 * permanent  — the server gave a verdict (403 RLS, 413 too large, 400).
 *              Retrying can never succeed, so the drain skips it and the
 *              user is told, rather than a spinner running forever.
 */
export type QueuedUploadStatus = "pending" | "uploading" | "failed" | "permanent";

export interface QueuedUpload {
  id: string;
  file: Blob;
  userId: string;
  projectId: string;
  visitId: string;
  tags: string[];
  location?: { floor?: string; room?: string };
  description?: string;
  locationId?: string;
  status: QueuedUploadStatus;
  createdAt: string;
  /** How many drain attempts this item has survived. Diagnostic. */
  attempts?: number;
  /** Message from the most recent failure, so the UI can name it. */
  lastError?: string;
}

/** Items the drain will actually attempt. "permanent" is deliberately absent. */
const RETRIABLE_STATUSES: QueuedUploadStatus[] = ["pending", "uploading", "failed"];

export const isRetriableStatus = (status: QueuedUploadStatus): boolean =>
  RETRIABLE_STATUSES.includes(status);

let db: IDBDatabase | null = null;

// Fired on window whenever the queue's contents change (add/remove/status update),
// so UI like OfflineIndicator can refresh its pending count without polling.
export const UPLOAD_QUEUE_CHANGED_EVENT = "uploadqueue:change";

const notifyQueueChanged = (): void => {
  window.dispatchEvent(new Event(UPLOAD_QUEUE_CHANGED_EVENT));
};

// IDBRequest.error is nullable even when onerror fires; fall back to a generic Error.
const requestError = (error: DOMException | null): Error => error ?? new Error("IndexedDB request failed");

// Initialize IndexedDB
const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error("❌ Upload queue IndexedDB error:", request.error);
      reject(requestError(request.error));
    };

    request.onsuccess = () => {
      db = request.result;
      console.log("✅ Upload queue IndexedDB initialized");
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      if (!database.objectStoreNames.contains(QUEUE_STORE)) {
        const objectStore = database.createObjectStore(QUEUE_STORE, { keyPath: "id" });
        objectStore.createIndex("status", "status", { unique: false });
        objectStore.createIndex("visitId", "visitId", { unique: false });
        console.log("✅ Upload queue store created");
      }
    };
  });
};

// Add a photo to the pending-upload queue
export const addToQueue = async (
  item: Omit<QueuedUpload, "id" | "status" | "createdAt">,
): Promise<string> => {
  const database = await initDB();

  const queuedItem: QueuedUpload = {
    ...item,
    id: `queued-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([QUEUE_STORE], "readwrite");
    const store = transaction.objectStore(QUEUE_STORE);
    const request = store.add(queuedItem);

    request.onsuccess = () => {
      console.log("✅ Photo added to upload queue:", queuedItem.id);
      notifyQueueChanged();
      resolve(queuedItem.id);
    };

    request.onerror = () => {
      console.error("❌ Error adding photo to upload queue:", request.error);
      reject(requestError(request.error));
    };
  });
};

// Get all queued items
export const getQueuedItems = async (): Promise<QueuedUpload[]> => {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([QUEUE_STORE], "readonly");
    const store = transaction.objectStore(QUEUE_STORE);
    const request = store.getAll();

    request.onsuccess = () => {
      resolve(request.result as QueuedUpload[]);
    };

    request.onerror = () => {
      console.error("❌ Error getting queued items:", request.error);
      reject(requestError(request.error));
    };
  });
};

// Remove an item from the queue (e.g. after a successful upload)
export const removeFromQueue = async (id: string): Promise<void> => {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([QUEUE_STORE], "readwrite");
    const store = transaction.objectStore(QUEUE_STORE);
    const request = store.delete(id);

    request.onsuccess = () => {
      console.log("✅ Item removed from upload queue:", id);
      notifyQueueChanged();
      resolve();
    };

    request.onerror = () => {
      console.error("❌ Error removing item from upload queue:", request.error);
      reject(requestError(request.error));
    };
  });
};

// Patch a queued item in place (status, attempt count, last error).
export const updateQueueItem = async (
  id: string,
  patch: Partial<Pick<QueuedUpload, "status" | "attempts" | "lastError">>,
): Promise<void> => {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([QUEUE_STORE], "readwrite");
    const store = transaction.objectStore(QUEUE_STORE);
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const existing = getRequest.result as QueuedUpload | undefined;
      if (!existing) {
        reject(new Error(`Queued item ${id} not found`));
        return;
      }

      const updated: QueuedUpload = { ...existing, ...patch };
      const putRequest = store.put(updated);

      putRequest.onsuccess = () => {
        console.log(`✅ Upload queue item ${id} →`, updated.status, patch.lastError ?? "");
        notifyQueueChanged();
        resolve();
      };

      putRequest.onerror = () => {
        console.error("❌ Error updating upload queue item status:", putRequest.error);
        reject(requestError(putRequest.error));
      };
    };

    getRequest.onerror = () => {
      console.error("❌ Error reading upload queue item:", getRequest.error);
      reject(requestError(getRequest.error));
    };
  });
};

export interface ProcessQueueResult {
  uploaded: number;
  /** Transient failures — still queued, will be retried. */
  failed: number;
  /** Server verdicts — will NOT be retried; needs the user. */
  permanent: number;
  /** True when another drain was already running and this call did nothing. */
  skipped: boolean;
}

/**
 * AbortSignal.timeout() is iOS 16+/Chrome 103+. Fall back to a controller so
 * an older device degrades to "still times out" rather than "hangs forever",
 * which is the whole point of this module.
 */
function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(new DOMException("Upload timed out", "TimeoutError")), ms);
  return controller.signal;
}

/**
 * Settles `work` when the signal fires, whether or not the underlying request
 * honours it.
 *
 * storage-js 2.108's FileOptions has no `signal` (only download/list take
 * FetchParameters), so the storage POST cannot actually be cancelled — the
 * request may keep running in the background. That is acceptable: what must
 * never happen is the QUEUE hanging on it. The DB-insert leg does honour the
 * signal via postgrest's .abortSignal().
 */
function withTimeout<T>(work: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const signal = timeoutSignal(ms);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () =>
      reject(signal.reason ?? new DOMException("Upload timed out", "TimeoutError"));
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    work(signal).then(resolve, reject);
  });
}

// Module-level, not per-caller: the mount drain and the "online" drain are
// different call sites, and both firing together used to run two passes over
// the same items — uploading each photo twice.
let draining = false;

/** True while a drain is in flight. */
export const isDraining = (): boolean => draining;

/**
 * A page load kills any in-flight request, so an item left in "uploading"
 * from a previous session is a lie — nothing is uploading it. Reset those to
 * "pending" at startup or the indicator shows a spinner for a request that
 * no longer exists.
 */
export async function reconcileStaleUploads(): Promise<number> {
  const items = await getQueuedItems();
  const stale = items.filter((i) => i.status === "uploading");
  for (const item of stale) {
    console.warn("⚠️ Resetting stale 'uploading' queue item to pending:", item.id);
    await updateQueueItem(item.id, { status: "pending" });
  }
  return stale.length;
}

/** Puts permanently-failed items back in the retry pool (the Réessayer button). */
export async function retryFailedUploads(): Promise<ProcessQueueResult> {
  const items = await getQueuedItems();
  for (const item of items) {
    if (item.status === "permanent" || item.status === "failed") {
      await updateQueueItem(item.id, { status: "pending", lastError: undefined });
    }
  }
  return processQueue();
}

/**
 * Retries every queued photo that is still retriable. Successful uploads are
 * removed; transient failures stay queued as "failed"; server verdicts become
 * "permanent" and are never attempted again.
 */
export async function processQueue(): Promise<ProcessQueueResult> {
  if (draining) {
    console.log("⏭️ Upload queue drain already in progress — skipping this trigger");
    return { uploaded: 0, failed: 0, permanent: 0, skipped: true };
  }
  draining = true;

  let uploaded = 0;
  let failed = 0;
  let permanent = 0;

  try {
    const items = await getQueuedItems();
    const attemptable = items.filter((item) => isRetriableStatus(item.status));
    console.log(
      `🔄 Draining upload queue: ${attemptable.length} attemptable of ${items.length} queued`,
    );

    for (const item of attemptable) {
      const attempts = (item.attempts ?? 0) + 1;
      try {
        await updateQueueItem(item.id, { status: "uploading", attempts });

        // IndexedDB's structured clone preserves File instances (name, type) as-is;
        // fall back to a synthesized name for plain Blobs.
        const fileForUpload =
          item.file instanceof File
            ? item.file
            : new File([item.file], `queued-photo-${item.id}.jpg`, {
                type: item.file.type || "image/jpeg",
              });

        await withTimeout(
          (signal) =>
            uploadPhoto(fileForUpload, item.userId, item.projectId, item.visitId, {
              tags: item.tags,
              location: item.location,
              description: item.description,
              locationId: item.locationId,
              signal,
            }),
          QUEUE_UPLOAD_TIMEOUT_MS,
        );

        await removeFromQueue(item.id);
        uploaded++;
        console.log(`✅ Queued photo uploaded on attempt ${attempts}:`, item.id);
      } catch (error) {
        // A 403 (storage RLS) or 413 (too large) is a verdict, not a blip —
        // retrying it every reconnect forever is how a queue silently never
        // drains. isRetriableUploadError already knows the difference.
        const retriable = isRetriableUploadError(error);
        const message = (error as Error)?.message || String(error);
        console.error(
          `❌ Queued photo failed (attempt ${attempts}, ${retriable ? "transient" : "PERMANENT"}):`,
          item.id,
          error,
        );
        await updateQueueItem(item.id, {
          status: retriable ? "failed" : "permanent",
          lastError: message,
        });
        if (retriable) failed++;
        else permanent++;
      }
    }
  } finally {
    // Always clears, so one thrown IndexedDB error can't wedge the queue shut
    // for the rest of the session.
    draining = false;
  }

  return { uploaded, failed, permanent, skipped: false };
}
