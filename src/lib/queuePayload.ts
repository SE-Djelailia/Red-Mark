// The photo payload of a queued upload: how its bytes are stored, and how an
// uploadable File is rebuilt from them.
//
// Deliberately free of imports. This is the code path that decides whether a
// site photo survives, and keeping it dependency-free means it can be executed
// and verified directly, rather than reasoned about — see the note on
// materializeFile for the failure it exists to prevent.

/** Thrown when a queued photo's bytes are gone. Never retriable. */
export class UnreadablePhotoError extends Error {
  readonly name = "UnreadablePhotoError";
  constructor(detail: string) {
    super(`Photo illisible : ${detail}`);
  }
}

/** Just enough of a queued record to rebuild its file. */
export interface QueuedPayload {
  id: string;
  bytes?: ArrayBuffer;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  /** LEGACY: pre-migration records that still hold a Blob. */
  file?: Blob;
}

/**
 * Flattens a thrown value into one greppable line.
 *
 * `error.message` alone is not enough to classify a failure: a Supabase
 * StorageApiError carries the HTTP status on `status`/`statusCode`, a
 * PostgrestError carries a Postgres SQLSTATE on `code` (42501 =
 * insufficient_privilege, i.e. an RLS denial) and nothing on `status`, and a
 * wrapped transport failure hides the real cause on `originalError`. Those are
 * exactly the fields that decide retriable vs permanent, so they are what has
 * to be visible when diagnosing from a phone with no dev tools.
 */
export function describeError(error: unknown): string {
  if (!error || typeof error !== "object") return String(error);
  const e = error as Record<string, unknown>;
  const parts: string[] = [];
  const push = (key: string, value: unknown) => {
    if (value !== undefined && value !== null && value !== "") parts.push(`${key}=${String(value)}`);
  };
  push("leg", e.leg); // which request failed: "storage" or "db-insert"
  push("name", e.name);
  push("status", e.status);
  push("statusCode", e.statusCode);
  push("code", e.code);
  push("error", e.error);
  const original = e.originalError as { name?: string; message?: string } | undefined;
  if (original && typeof original === "object") {
    push("origName", original.name);
    push("origMsg", original.message);
  }
  push("msg", e.message ?? String(error));
  return parts.join(" | ");
}

/**
 * Rebuilds an uploadable File from a queued record.
 *
 * THE FAILURE THIS PREVENTS — read off an iPhone (iOS 18.7, Safari):
 *
 *   [permanent] attempts=2 size=1065802 type=image/jpeg isFile=true
 *               err=No content provided
 *
 * The queue used to hand the stored File straight to the uploader. WebKit does
 * not serialise blob data into an IndexedDB record: it writes the bytes to a
 * separate blob-file store and keeps a REFERENCE in the record. That reference
 * can outlive what it points at — iOS reclaims the backing file on memory
 * pressure, on termination, on relaunch. What comes back is a Blob whose
 * `size` and `type` are intact, because those live in the record, and whose
 * bytes are gone.
 *
 * The upload therefore POSTed a zero-length body and Supabase answered "No
 * content provided" — a message about the request, saying nothing about the
 * cause, which is why this was misdiagnosed as auth, then as a token problem,
 * then as a timeout.
 *
 * Two defences here:
 *   1. New records store an ArrayBuffer, which is structured-cloned BY VALUE.
 *      The bytes ARE the record; there is no reference left to dangle.
 *   2. Anything that still yields zero bytes fails HERE, with a named error
 *      that says so, instead of being sent as an empty body.
 */
export async function materializeFile(
  item: QueuedPayload,
): Promise<{ file: File; upgraded?: ArrayBuffer }> {
  let bytes = item.bytes;
  let upgraded: ArrayBuffer | undefined;

  if (!bytes || bytes.byteLength === 0) {
    if (!item.file) {
      throw new UnreadablePhotoError("aucune donnée enregistrée");
    }
    // Legacy record. One attempt at reading the blob out — which succeeds
    // while the reference is still live, the common case for something queued
    // minutes ago on a phone that has not been relaunched since.
    try {
      bytes = await item.file.arrayBuffer();
      upgraded = bytes;
    } catch (error) {
      throw new UnreadablePhotoError(
        `lecture impossible depuis le stockage local (${describeError(error)})`,
      );
    }
  }

  if (!bytes || bytes.byteLength === 0) {
    // The exact iOS signature: metadata survived, bytes did not.
    const expected = item.fileSize || item.file?.size || 0;
    throw new UnreadablePhotoError(
      `0 octet lu alors que ${expected} étaient attendus (données perdues par le navigateur)`,
    );
  }

  if (item.fileSize && bytes.byteLength !== item.fileSize) {
    console.warn(
      `⚠️ Queued photo ${item.id}: read ${bytes.byteLength} bytes, expected ${item.fileSize}`,
    );
  }

  const file = new File([bytes], item.fileName || `queued-photo-${item.id}.jpg`, {
    type: item.fileType || item.file?.type || "image/jpeg",
  });
  return { file, upgraded };
}
