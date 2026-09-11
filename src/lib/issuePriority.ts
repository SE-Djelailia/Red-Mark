// Canonical déficience priority: the two levels the UI offers, and the
// mapping from the four values the DATABASE still stores.
//
// THE DB AND THE UI DELIBERATELY DISAGREE, AND THAT IS THE DESIGN.
//
// issues_priority_check (Stage 12) permits 'low' | 'medium' | 'high' |
// 'critical', and existing rows carry all four. The stakeholder review
// reduced the scheme to two levels — Normal and Urgent — but widening or
// narrowing the CHECK was deliberately NOT done:
//
//   * Narrowing it would require rewriting every existing row, destroying
//     the high/low distinction irreversibly.
//   * Widening it to six values would leave a two-option UI sitting on six
//     legal values, and every consumer would still need this mapping.
//
// So the column is untouched and the collapse happens on READ. If the
// two-level scheme proves right after real field use, this module is
// already the exact specification for a later data migration; if the
// stakeholder wants four levels back, it is a UI change only.
//
// Deliberately dependency-free (no React, no supabase) so it can be
// imported by API modules, UI, and the document generators alike.

/** What the DB column can hold. Unchanged — this is the CHECK's vocabulary. */
export const STORED_PRIORITIES = ["low", "medium", "high", "critical"] as const;
export type StoredPriority = (typeof STORED_PRIORITIES)[number];

/** What the UI offers and what a NEW issue may be written as. */
export const ISSUE_PRIORITIES = ["normal", "urgent"] as const;
export type IssuePriority = (typeof ISSUE_PRIORITIES)[number];

/**
 * The stored value each UI level writes.
 *
 * `urgent` → 'critical': the top of the stored scale, and already the only
 * priority the design system allows near red — which is what an urgent
 * deficiency should read as.
 *
 * `normal` → 'medium': also the column's DEFAULT, so writing it explicitly
 * and omitting it agree. That keeps `DEFAULT 'medium'` correct with no ALTER.
 */
export const PRIORITY_STORED_VALUE: Record<IssuePriority, StoredPriority> = {
  normal: "medium",
  urgent: "critical",
};

/**
 * Collapse a stored value onto the two-level scheme.
 *
 * 'high' reads as Urgent rather than Normal: in a two-level world the old
 * "Élevé" belonged with the things needing attention, and under-reporting
 * urgency is the more costly error on a construction site. The visual
 * promotion from amber to red is intended.
 *
 * NULL and any unrecognised legacy value fall back to Normal, so a row that
 * predates the CHECK can never render blank or crash a Record lookup.
 */
export function toIssuePriority(stored: string | null | undefined): IssuePriority {
  return stored === "critical" || stored === "high" ? "urgent" : "normal";
}

/** French labels. These reach the generated .docx, not just the screen. */
export const PRIORITY_LABEL: Record<IssuePriority, string> = {
  normal: "Normal",
  urgent: "Urgent",
};

/**
 * Sort rank: urgent first. Two buckets rather than four, so within a bucket
 * the secondary sort (overdue, then oldest) does the ordering work.
 */
export const PRIORITY_RANK: Record<IssuePriority, number> = {
  urgent: 0,
  normal: 1,
};

/** The level a new déficience takes unless the user says otherwise. */
export const DEFAULT_ISSUE_PRIORITY: IssuePriority = "normal";
