/**
 * Job titles used inside an architecture firm.
 *
 * This is the single source for every place a person's title is set: signup,
 * the firm-admin invite form, activation, and the profile screen. It used to
 * be a free-text box in each of those, which produced "architecte",
 * "Architecte", "arch." and "Architecte junior" for the same job — and those
 * strings are not decorative. They print on the generated report, under
 * "Préparé par" and in the ASSISTAIENT table, so the inconsistency is visible
 * to the client receiving it.
 *
 * The list is deliberately a PICKLIST WITH AN ESCAPE HATCH rather than an
 * enum: firms invent titles, and refusing to store one would be worse than an
 * occasional one-off. `role` stays a free-text column — the list constrains
 * the UI, not the database.
 *
 * Ordered roughly by seniority within a discipline rather than alphabetically,
 * because that is how someone scanning for their own title reads it.
 */
export const FIRM_ROLES = [
  "Architecte",
  "Architecte stagiaire",
  "Chargé de projet",
  "Chargé de projet intermédiaire",
  "Technologue",
  "Designer",
  "Surveillant de chantier",
  "Conseiller",
  "Directeur de projet",
] as const;

export type FirmRole = (typeof FIRM_ROLES)[number];

/** Label for the escape-hatch option. */
export const OTHER_ROLE_LABEL = "Autre…";

/** True when the stored value is one of the canonical titles. */
export function isKnownRole(role: string | null | undefined): boolean {
  return !!role && (FIRM_ROLES as readonly string[]).includes(role);
}

/**
 * Trims and collapses whitespace. Deliberately does NOT change case: a custom
 * title like "Designer d'intérieur" or an acronym should survive as typed.
 */
export function normalizeRole(role: string | null | undefined): string {
  return (role ?? "").trim().replace(/\s+/g, " ");
}

/** Same treatment for names — they print on reports beside the role. */
export function normalizeName(name: string | null | undefined): string {
  return (name ?? "").trim().replace(/\s+/g, " ");
}

/**
 * Whether a profile carries enough to appear on a report. Both fields print,
 * so a blank in either produces a report with an anonymous author.
 */
export function isProfileComplete(profile: {
  name?: string | null;
  role?: string | null;
}): boolean {
  return normalizeName(profile.name).length > 0 && normalizeRole(profile.role).length > 0;
}
