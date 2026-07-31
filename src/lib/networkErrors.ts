// Deciding whether a failed upload should be queued for retry, or reported
// to the user as a real rejection.
//
// THE BUG THIS REPLACES: both upload paths tested `error instanceof
// TypeError`, which is never true for a Supabase failure. storage-js catches
// the raw fetch TypeError and re-wraps it as StorageUnknownError (an
// Error subclass, not a TypeError) before it reaches us. That left
// `!navigator.onLine` as the only working signal — and that flag is true
// whenever any interface is attached, so a captive portal, an attached but
// dead cellular connection, or a basement with one bar all reported
// "online" and the photo was discarded instead of queued.
//
// Supabase's error classes are not exported, so these are matched by shape
// (name / status / originalError) rather than instanceof.

interface SupabaseishError {
  name?: string;
  status?: number;
  statusCode?: string | number;
  message?: string;
  originalError?: unknown;
}

/** Fetch rejections. Chrome/Firefox say "Failed to fetch"; iOS Safari says
 *  "Load failed", which is easy to miss when testing on a desktop. */
const TRANSPORT_MESSAGE = /failed to fetch|load failed|network ?error|networkerror|connection|timed? ?out|aborted/i;

/**
 * True when the failure looks like the request never got a verdict from the
 * server, so retrying later is the right move.
 *
 * Deliberately conservative about HTTP statuses: if the server answered,
 * the request DID get a verdict. A 403 (RLS denial) or 413 (too large)
 * would never succeed on retry, and queuing it would hide a real problem
 * behind an upload that silently never completes.
 */
export function isRetriableUploadError(error: unknown): boolean {
  // Cheapest and most certain signal, when it happens to be right.
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;

  // A raw fetch failure, if anything ever hands us one undecorated.
  if (error instanceof TypeError) return true;

  const e = error as SupabaseishError | null | undefined;
  if (!e || typeof e !== "object") return false;

  // storage-js wraps transport failures in StorageUnknownError and keeps the
  // original on `originalError`. This is the case that was being missed.
  if (e.name === "StorageUnknownError" || e.name === "StorageVectorsUnknownError") return true;
  if (e.originalError instanceof TypeError) return true;

  // Aborts and timeouts — the request never completed.
  if (e.name === "AbortError" || e.name === "TimeoutError") return true;

  // The server responded, so this is a verdict, not a transport failure.
  // Only genuinely transient codes are worth retrying.
  if (typeof e.status === "number" && e.status > 0) {
    return e.status === 408 || e.status === 425 || e.status === 429 || e.status >= 500;
  }

  // PostgrestError from the DB-insert leg carries no status when the fetch
  // itself failed, so fall back to the message.
  if (typeof e.message === "string" && TRANSPORT_MESSAGE.test(e.message)) return true;

  return false;
}
