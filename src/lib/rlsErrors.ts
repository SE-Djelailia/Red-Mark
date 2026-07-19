// Shared helper for write functions (delete/update) across the API layer
// that need to distinguish "blocked by RLS" from other failures. A plain
// Supabase delete/update reports no error at all when RLS silently excludes
// the target row — from the caller's point of view it looks identical to a
// successful no-op. Chaining `.select()` onto the write and checking for
// zero returned rows (with no error) is how that gets caught; this module
// is that check's shared error type and message helper, so every API
// module doesn't need to redefine its own. Same pattern issuesApi.ts's
// deleteIssue established first (kept local there — not touched here).
export class RlsWriteError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "RlsWriteError";
    this.code = code;
  }
}

// PGRST116 is PostgREST's real "0 rows" code for `.single()`/`.maybeSingle()`
// queries; we reuse it here as a synthetic code for the same underlying
// situation on a plain `.select()` after a write, so callers can check with
// one function regardless of which shape produced it.
export function isRlsBlocked(err: unknown): boolean {
  return err instanceof RlsWriteError && err.code === "PGRST116";
}

export function getRlsErrorMessage(err: unknown, fallback: string, deniedMessage?: string): string {
  if (isRlsBlocked(err)) {
    return deniedMessage || "Vous n'avez pas la permission d'effectuer cette action.";
  }
  return fallback;
}
