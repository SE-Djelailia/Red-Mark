// The punch list's DATA layer: gathering a project's déficiences and shaping
// them into exactly what the .docx template consumes.
//
// Deliberately separate from the generation step so the shape can be tested
// and reasoned about without a template, and so a future PDF-direct path
// consumes the same structure.

import { supabase } from "./supabase";
import type { Photo } from "./supabase";
import { getIssuesByProject, type Issue } from "./issuesApi";
import { getLocations, type Location } from "./locationsApi";
import { getPhotosSignedUrls } from "./supabaseApi";
import {
  ISSUE_STATUS_LABEL,
  OUTSTANDING_ISSUE_STATUSES,
  TERMINAL_ISSUE_STATUS,
  ageInDays,
  isOverdue,
  type IssueStatus,
} from "./issueStatus";
import { locationLabel } from "./photoZone";
import { formatDateLong, extractDateOnly } from "./dateUtils";

/** The two cuts chosen at generation time. */
export type PunchListCut =
  | { kind: "complete" }
  /** One trade's items. `discipline` matches issues.discipline exactly. */
  | { kind: "discipline"; discipline: string };

export interface PunchListOptions {
  cut: PunchListCut;
  /**
   * Verified items are excluded by default — a punch list is a list of work
   * REMAINING. When true they are still excluded from the main body and
   * collected into a separate closeout appendix instead, never merged in.
   */
  includeVerified: boolean;
}

/** One déficience, as the template reads it. */
export interface PunchListItem {
  /** Sequential within THIS document, 1-based. Ephemeral by design: the
   *  issues table has no number column, and a punch list is a snapshot, not
   *  a numbered register like the note de visite. */
  number: number;
  title: string;
  description: string;
  /** "A-101 — Bureau", resolved via location_id; "" when unlocated. */
  location: string;
  discipline: string;
  priority: string;
  status: string;
  /** "12 mars 2026" — when the déficience was first raised. */
  dateFirstSeen: string;
  /** "34 j" — days since first seen. */
  age: string;
  /** "12 mars 2026", or "" when no due date is set. */
  dueDate: string;
  /** True when past due and not yet verified. Lets the template mark a row. */
  overdue: boolean;
  assignedTo: string;
  /** Signed URLs, ready for the image module. May be empty. */
  photos: { image: string; caption: string }[];
}

export interface PunchListDocument {
  /** Body items — outstanding work. */
  items: PunchListItem[];
  /** Closeout appendix; empty unless includeVerified was set. */
  verifiedItems: PunchListItem[];
  /** Every discipline present on the project's outstanding items, for the
   *  generation UI's picker. Sorted, deduped, blanks excluded. */
  disciplinesPresent: string[];
  counts: { total: number; outstanding: number; verified: number };
}

const PRIORITY_LABEL: Record<Issue["priority"], string> = {
  critical: "Critique",
  high: "Élevé",
  medium: "Moyen",
  low: "Faible",
};

/** Sort: overdue first, then priority, then oldest — the order a site walk
 *  would actually take them in. */
const PRIORITY_RANK: Record<Issue["priority"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/**
 * Photos attached to a set of issues, via photos.issue_id.
 *
 * One query for the whole document rather than one per déficience: a punch
 * list of 60 items would otherwise fire 60 round trips. Returns a map so the
 * caller can attach them without a second pass.
 *
 * RLS-scoped like every other read here — this uses the same client and
 * therefore the same firm isolation as the rest of the app.
 */
async function fetchPhotosByIssue(issueIds: string[]): Promise<Map<string, Photo[]>> {
  const byIssue = new Map<string, Photo[]>();
  if (issueIds.length === 0) return byIssue;

  const { data, error } = await supabase
    .from("photos")
    .select("*")
    .in("issue_id", issueIds)
    .order("created_at", { ascending: true });

  if (error) {
    // A punch list without photos is still a usable punch list; failing the
    // whole document because the image query fell over would be worse.
    console.error("❌ Error loading punch list photos:", error);
    return byIssue;
  }

  for (const row of (data ?? []) as Photo[]) {
    if (!row.issue_id) continue;
    const list = byIssue.get(row.issue_id);
    if (list) list.push(row);
    else byIssue.set(row.issue_id, [row]);
  }
  return byIssue;
}

/**
 * Builds the whole document model for one project.
 *
 * Every read goes through the existing RLS-scoped helpers, so a punch list
 * can never contain a project the user cannot already open.
 */
export async function buildPunchList(
  projectId: string,
  options: PunchListOptions,
): Promise<PunchListDocument> {
  const [issues, locations] = await Promise.all([
    getIssuesByProject(projectId),
    // Location labels are a nicety; an empty list degrades to a blank
    // location rather than failing the document.
    getLocations(projectId).catch(() => [] as Location[]),
  ]);

  const locationsById = new Map(locations.map((l) => [l.id, l]));

  const outstandingSet = new Set<IssueStatus>(OUTSTANDING_ISSUE_STATUSES);
  const isOutstanding = (i: Issue) => outstandingSet.has(i.status);

  // The cut applies to BOTH the body and the appendix: a plumbing punch list
  // must not carry an electrical item into its closeout section.
  const matchesCut = (i: Issue) =>
    options.cut.kind === "complete" || (i.discipline ?? "") === options.cut.discipline;

  const inScope = issues.filter(matchesCut);
  const outstanding = inScope.filter(isOutstanding);
  const verified = inScope.filter((i) => i.status === TERMINAL_ISSUE_STATUS);

  const bodyIssues = sortForWalk(outstanding);
  const appendixIssues = options.includeVerified ? sortForWalk(verified) : [];

  // One photo query covering both sections.
  const photosByIssue = await fetchPhotosByIssue(
    [...bodyIssues, ...appendixIssues].map((i) => i.id),
  );

  // One signing call for every photo in the document — getPhotosSignedUrls
  // batches, so this is a single round trip rather than one per photo.
  const allPhotos = [...bodyIssues, ...appendixIssues].flatMap(
    (i) => photosByIssue.get(i.id) ?? [],
  );
  const signed = await getPhotosSignedUrls(allPhotos.map((p) => p.storage_path));
  const urlByPhotoId = new Map(allPhotos.map((p, idx) => [p.id, signed[idx] ?? ""]));

  const toItem = (issue: Issue, index: number): PunchListItem => {
    const loc = issue.locationId ? locationsById.get(issue.locationId) : undefined;
    const days = ageInDays(issue.createdAt ?? issue.createdDate);
    const photos = (photosByIssue.get(issue.id) ?? [])
      .map((p) => ({
        image: urlByPhotoId.get(p.id) ?? "",
        caption: p.description ?? "",
      }))
      // A photo whose URL failed to sign would render as a broken image box.
      .filter((p) => p.image !== "");

    return {
      number: index + 1,
      title: issue.title,
      description: issue.description || "",
      location: loc ? locationLabel(loc) : "",
      discipline: issue.discipline || "",
      priority: PRIORITY_LABEL[issue.priority],
      status: ISSUE_STATUS_LABEL[issue.status],
      dateFirstSeen: formatDateLong(extractDateOnly(issue.createdAt ?? issue.createdDate)),
      age: days === null ? "" : `${days} j`,
      dueDate: issue.dueDate ? formatDateLong(issue.dueDate) : "",
      overdue: isOverdue(issue.dueDate, issue.status),
      assignedTo: issue.assignedToName || issue.assignedTo || "",
      photos,
    };
  };

  return {
    items: bodyIssues.map(toItem),
    verifiedItems: appendixIssues.map(toItem),
    disciplinesPresent: [
      ...new Set(issues.filter(isOutstanding).map((i) => i.discipline).filter(Boolean)),
    ].sort((a, b) => a!.localeCompare(b!, "fr-CA")) as string[],
    counts: {
      total: inScope.length,
      outstanding: outstanding.length,
      verified: verified.length,
    },
  };
}

/** Overdue first, then priority, then oldest. */
function sortForWalk(issues: Issue[]): Issue[] {
  return [...issues].sort((a, b) => {
    const aOver = isOverdue(a.dueDate, a.status) ? 0 : 1;
    const bOver = isOverdue(b.dueDate, b.status) ? 0 : 1;
    if (aOver !== bOver) return aOver - bOver;

    const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (p !== 0) return p;

    return Date.parse(a.createdAt ?? a.createdDate) - Date.parse(b.createdAt ?? b.createdDate);
  });
}
