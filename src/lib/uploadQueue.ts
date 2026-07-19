// IndexedDB-backed queue for photo uploads that failed or are waiting to be sent.
// Kept separate from the `redmark_photos` database in indexedDB.ts.
import { uploadPhoto } from "./supabaseApi";

const DB_NAME = "redmark_upload_queue";
const DB_VERSION = 1;
const QUEUE_STORE = "uploadQueue";

export type QueuedUploadStatus = "pending" | "uploading" | "failed";

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
}

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

// Update the status of a queued item
export const updateQueueItemStatus = async (
  id: string,
  status: QueuedUploadStatus,
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

      const updated: QueuedUpload = { ...existing, status };
      const putRequest = store.put(updated);

      putRequest.onsuccess = () => {
        console.log(`✅ Upload queue item ${id} status updated to "${status}"`);
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
  failed: number;
}

// Retries every queued photo. Successful uploads are removed from the queue;
// photos that fail again are marked "failed" and left in place for the next attempt.
export async function processQueue(): Promise<ProcessQueueResult> {
  const items = await getQueuedItems();
  let uploaded = 0;
  let failed = 0;

  for (const item of items) {
    try {
      await updateQueueItemStatus(item.id, "uploading");

      // IndexedDB's structured clone preserves File instances (name, type) as-is;
      // fall back to a synthesized name for plain Blobs.
      const fileForUpload =
        item.file instanceof File
          ? item.file
          : new File([item.file], `queued-photo-${item.id}.jpg`, {
              type: item.file.type || "image/jpeg",
            });

      await uploadPhoto(fileForUpload, item.userId, item.projectId, item.visitId, {
        tags: item.tags,
        location: item.location,
        description: item.description,
        locationId: item.locationId,
      });

      await removeFromQueue(item.id);
      uploaded++;
    } catch (error) {
      console.error("❌ Failed to upload queued photo:", item.id, error);
      await updateQueueItemStatus(item.id, "failed");
      failed++;
    }
  }

  return { uploaded, failed };
}
