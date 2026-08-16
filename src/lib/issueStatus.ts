// Canonical déficience lifecycle: the four states, their order, their
// French labels, and the predicates every screen derives from them.
//
// The DB is the authority (Stage 12's issues_status_check, Stage 13's
// narrowing to exactly these four). This module exists so the client can
// never again drift from it — the incident this replaces was the client
// writing 'open' after the CHECK had narrowed, which made creating any
// deficiency fail outright.
//
// Deliberately dependency-free (no React, no supabase) so it can be
// imported by API modules, UI, and tests alike.

export const ISSUE_STATUSES = ["signale", "a_corriger", "corrige", "verifie"] as const;

export type IssueStatus = (typeof ISSUE_STATUSES)[number];

// The status a brand-new déficience takes. Matches the column default the
// DB now carries, so sending it explicitly and omitting it agree.
export const DEFAULT_ISSUE_STATUS: IssueStatus = "signale";

// The terminal state. "Open" in every count, pill and filter means "not
// this" — closing the loop requires an inspector to verify the correction,
// not merely a contractor to claim it.
export const TERMINAL_ISSUE_STATUS: IssueStatus = "verifie";

// The three states that still need somebody to act. Used as the default
// filter selection on the Déficiences view and as the definition of
// "outstanding" everywhere else.
export const OUTSTANDING_ISSUE_STATUSES: IssueStatus[] = ISSUE_STATUSES.filter(
  (s) => s !== TERMINAL_ISSUE_STATUS,
);

export const ISSUE_STATUS_LABEL: Record<IssueStatus, string> = {
  signale: "Signalé",
  a_corriger: "À corriger",
  corrige: "Corrigé",
  verifie: "Vérifié",
};

// Position in the lifecycle, for sorting and for rendering progress. The
// Record forces exhaustiveness: adding a state to the union without
// ranking it here is a compile error.
export const ISSUE_STATUS_RANK: Record<IssueStatus, number> = {
  signale: 0,
  a_corriger: 1,
  corrige: 2,
  verifie: 3,
};

// Legacy vocabulary. These values no longer exist in the DB (Stage 13
// migrated every row and narrowed the CHECK), but rows can still reach the
// client from a cached response, an offline queue entry written before the
// migration, or an export. Mapping them keeps such a row renderable
// instead of crashing a lookup — it is NOT a licence to write them.
const LEGACY_STATUS_MAP: Record<string, IssueStatus> = {
  open: "signale",
  resolved: "verifie",
};

/**
 * Coerces any status value read from storage into one of the four states.
 *
 * Read-side only. Unknown values fall back to `signale` rather than
 * throwing, on the principle that a déficience with an unrecognised status
 * is still outstanding — the safe direction to be wrong in.
 */
export function normalizeIssueStatus(value: string | null | undefined): IssueStatus {
  if (!value) return DEFAULT_ISSUE_STATUS;
  if ((ISSUE_STATUSES as readonly string[]).includes(value)) return value as IssueStatus;
  return LEGACY_STATUS_MAP[value] ?? DEFAULT_ISSUE_STATUS;
}

export function isIssueStatus(value: unknown): value is IssueStatus {
  return typeof value === "string" && (ISSUE_STATUSES as readonly string[]).includes(value);
}

/** A déficience still requiring action — anything short of verified. */
export function isOutstanding(status: IssueStatus): boolean {
  return status !== TERMINAL_ISSUE_STATUS;
}

export const ISSUE_STATUS_OPTIONS: { value: IssueStatus; label: string }[] = ISSUE_STATUSES.map(
  (value) => ({ value, label: ISSUE_STATUS_LABEL[value] }),
);

// ---------------------------------------------------------------------------
// Aging
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000;

/** Whole days between `from` and now. Negative values clamp to 0. */
export function ageInDays(from: string | null | undefined, now: Date = new Date()): number | null {
  if (!from) return null;
  const t = Date.parse(from);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / MS_PER_DAY));
}

/**
 * Whether a déficience has passed its due date without being verified.
 *
 * A verified déficience is never overdue: the work is done, and flagging a
 * closed item in red would make the overdue filter useless for finding
 * work that still needs chasing. Due dates are date-only ("YYYY-MM-DD"),
 * so the deadline is the END of that day.
 */
export function isOverdue(
  dueDate: string | null | undefined,
  status: IssueStatus,
  now: Date = new Date(),
): boolean {
  if (!dueDate) return false;
  if (status === TERMINAL_ISSUE_STATUS) return false;
  const due = Date.parse(`${dueDate}T23:59:59.999`);
  if (Number.isNaN(due)) return false;
  return now.getTime() > due;
}

/** Days until the due date; negative once past. Null when no due date. */
export function daysUntilDue(
  dueDate: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!dueDate) return null;
  const due = Date.parse(`${dueDate}T23:59:59.999`);
  if (Number.isNaN(due)) return null;
  return Math.ceil((due - now.getTime()) / MS_PER_DAY);
}
