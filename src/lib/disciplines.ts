// The disciplines a déficience can be attributed to.
//
// Previously hand-written inside IssueForm only, which meant the
// Déficiences view had no way to offer a discipline filter without
// duplicating (and eventually drifting from) the list.
//
// `discipline` is a free-text column, not an enum — rows created before
// this list existed, or imported from elsewhere, may carry a value that is
// not in it. Filters must therefore union these options with the values
// actually present in the data rather than assuming this list is complete.

export const DISCIPLINES = [
  "Architecture",
  "Structure",
  "Mécanique",
  "Électricité",
  "Plomberie",
] as const;

export type Discipline = (typeof DISCIPLINES)[number];

/**
 * The discipline options to show for a given set of rows: the canonical
 * list, plus any other non-empty value the data actually contains, so a
 * legacy discipline is still selectable instead of being invisible.
 */
export function disciplineOptions(present: (string | null | undefined)[]): string[] {
  const extra = new Set<string>();
  for (const d of present) {
    const v = (d ?? "").trim();
    if (v && !(DISCIPLINES as readonly string[]).includes(v)) extra.add(v);
  }
  return [...DISCIPLINES, ...[...extra].sort((a, b) => a.localeCompare(b, "fr"))];
}
