// Client-side API for managing issues (déficiences).
// Backed by Supabase (table `issues`). discipline/dueDate/assignedToName are
// real columns (added by stage-issue-consolidation.sql). `tags`/`location`
// (free-text label) still live in the `location` JSONB column — narrowed to
// just those two keys now that photos and assignedTo have real homes.
// Photos are now a real relationship (photos.issue_id), not a JSONB array.

import { supabase } from "./supabase";
import type { Update } from "./supabase";
import type { Json } from "./database.types";
import {
  DEFAULT_ISSUE_STATUS,
  TERMINAL_ISSUE_STATUS,
  normalizeIssueStatus,
  type IssueStatus,
} from "./issueStatus";

export interface Issue {
  id: string;
  visitId: string;
  projectId: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "critical";
  status: IssueStatus;
  // When the status last moved, maintained by the DB trigger (Stage 13).
  // Distinct from updated_at, which any edit bumps — this only advances on
  // an actual lifecycle transition, so "days in current state" is real.
  statusChangedAt?: string | null;
  discipline?: string;
  dueDate?: string | null;
  // Free-text assignee (external contractor not in the app). Kept as
  // `assignedTo` for back-compat with existing callers; `assignedToName` is
  // the same value under the canonical field name for new code to prefer.
  // Both read/write the same `assigned_to_name` column.
  assignedTo: string;
  assignedToName?: string;
  // Real project-member assignee (uuid FK -> auth.users). No UI writes this
  // yet (Stage 2/3 adds the member picker) — exposed for forward use.
  assignedToUserId?: string | null;
  createdBy: string;
  createdDate: string;
  // Full-precision counterparts of createdDate/status, for callers that need
  // real ordering (e.g. LocationDetail's activity timeline) rather than the
  // day-only display string. resolvedAt mirrors the DB's resolved_at, which
  // was already being written on every status change but never read back.
  createdAt?: string;
  resolvedAt?: string | null;
  // `url` (file_url) is kept for back-compat but is not signed and should
  // not be used directly for display against the private storage bucket —
  // use `storagePath` with SecureImage/getPhotosSignedUrls instead, same as
  // the visit page and getPhotosByLocation.
  // storagePath and visitId are REQUIRED: annotation is a universal photo
  // action, and both are needed to save one (the path to read, the visit to
  // write the annotated copy under). photos.visit_id is NOT NULL in the
  // schema, so every photo genuinely has a visit — making these optional
  // would only hide a missing field behind a silently disabled button.
  // locationId/description/tags are carried so the photo metadata editor
  // can open pre-filled from the issue view, rather than showing a blank
  // form that invites overwriting a good value with nothing.
  photos: {
    id: string;
    url: string;
    storagePath: string;
    visitId: string;
    locationId: string | null;
    description: string | null;
    tags: string[];
  }[];
  tags: string[];
  location: string;
  locationId?: string | null;
}

// Shape stored inside the issues.location JSONB column. Narrowed to just
// label/tags going forward — photos and assignedTo used to live here too
// (see stage-issue-consolidation.sql for the one-time backfill of legacy
// photos out of this blob into photos.issue_id). Old rows may still carry
// a legacy `assignedTo` key here; read side falls back to it below since
// that data was NOT part of the schema migration's backfill.
interface IssueExtras {
  label?: string;
  tags?: string[];
  assignedTo?: string; // legacy-only; no longer written
}

// Thrown by updateIssue/deleteIssue on failure, carrying the Postgres/PostgREST
// error code so callers can distinguish "blocked by RLS" from other failures.
export class IssueUpdateError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "IssueUpdateError";
    this.code = code;
  }
}

// PGRST116 = PostgREST's "0 rows" error. For an UPDATE/DELETE with .select(),
// that specific signature means RLS silently excluded the row from the write
// (the row exists and is readable, but the current user isn't allowed to
// modify it) rather than the row simply not existing.
function isPermissionError(err: unknown): boolean {
  return err instanceof IssueUpdateError && err.code === "PGRST116";
}

// Map an error from updateIssue/deleteIssue to a user-facing message.
export function getIssueErrorMessage(err: unknown, fallback: string): string {
  if (isPermissionError(err)) {
    return "Seul le créateur ou un administrateur peut modifier cette déficience.";
  }
  return fallback;
}

// Get current user ID from Supabase
async function getCurrentUserId(): Promise<string | null> {
  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();
    if (error || !session) return null;
    return session.user.id;
  } catch (error) {
    console.error("Error getting user ID:", error);
    return null;
  }
}

// Map a Supabase row to the client-facing Issue shape, minus photos (which
// need a separate batched query — see attachPhotos below).
function rowToIssueBase(row: any): Omit<Issue, "photos"> {
  const extras: IssueExtras = row.location && typeof row.location === "object" ? row.location : {};
  const assignedToName = row.assigned_to_name ?? extras.assignedTo ?? "";
  return {
    id: row.id,
    visitId: row.visit_id || "",
    projectId: row.project_id,
    title: row.title,
    description: row.description || "",
    priority: row.priority,
    // Coerced rather than trusted: a row can reach here from a cached
    // response or an offline queue entry written under the old vocabulary,
    // and an unmapped value would break every Record<IssueStatus, …> lookup.
    status: normalizeIssueStatus(row.status),
    statusChangedAt: row.status_changed_at ?? null,
    discipline: row.discipline || undefined,
    dueDate: row.due_date ?? null,
    assignedTo: assignedToName,
    assignedToName,
    assignedToUserId: row.assigned_to || null,
    createdBy: row.user_id,
    createdDate: (row.created_at || new Date().toISOString()).split("T")[0],
    createdAt: row.created_at || undefined,
    resolvedAt: row.resolved_at || null,
    tags: Array.isArray(extras.tags) ? extras.tags : [],
    location: extras.label || "",
    locationId: row.location_id || null,
  };
}

// Batch-fetch photos for a set of issues in one query (avoids N+1) and
// merge them onto the base rows.
async function attachPhotos(rows: Omit<Issue, "photos">[]): Promise<Issue[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const { data, error } = await supabase
    .from("photos")
    .select("id, file_url, storage_path, issue_id, visit_id, location_id, description, tags")
    .in("issue_id", ids);

  const byIssue: Record<string, Issue["photos"]> = {};
  if (error) {
    console.error("Error fetching photos for issues:", error);
  } else {
    for (const p of data || []) {
      if (!p.issue_id) continue;
      (byIssue[p.issue_id] ??= []).push({
        id: p.id,
        url: p.file_url,
        storagePath: p.storage_path,
        visitId: p.visit_id,
        locationId: p.location_id,
        description: p.description,
        tags: p.tags || [],
      });
    }
  }
  return rows.map((r) => ({ ...r, photos: byIssue[r.id] || [] }));
}

// Build the location JSONB payload from client-facing fields. Narrowed to
// just label/tags — photos and assignedTo have real columns now.
// Returns Json rather than IssueExtras: this value is written straight into
// a jsonb column, and TypeScript will not structurally narrow an interface
// to the recursive `Json` union (interfaces lack an implicit index
// signature). Declaring the return type at the single producer keeps the
// cast out of both call sites.
function buildExtras(data: { location?: string; tags?: string[] }): Json {
  const extras: IssueExtras = {
    label: data.location || "",
    tags: data.tags || [],
  };
  return extras as unknown as Json;
}

// Attach/detach photos so that exactly `photoIds` end up linked to this
// issue: clears issue_id on any currently-linked photo not in the new list,
// then sets issue_id on the given ids. Mirrors the old JSONB-replace
// semantics (callers always pass the full desired list).
async function setIssuePhotos(issueId: string, photoIds: string[]): Promise<void> {
  let detachQuery = supabase.from("photos").update({ issue_id: null }).eq("issue_id", issueId);
  if (photoIds.length > 0) {
    detachQuery = detachQuery.not("id", "in", `(${photoIds.join(",")})`);
  }
  const { error: detachError } = await detachQuery;
  if (detachError) {
    console.error("Error detaching photos from issue:", detachError);
    throw detachError;
  }

  if (photoIds.length > 0) {
    const { error: attachError } = await supabase
      .from("photos")
      .update({ issue_id: issueId })
      .in("id", photoIds);
    if (attachError) {
      console.error("Error attaching photos to issue:", attachError);
      throw attachError;
    }
  }
}

// Get issues created by the current user (all projects)
export async function getUserIssues(): Promise<Issue[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from("issues")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Error fetching user issues:", error);
    return [];
  }
  return attachPhotos((data || []).map(rowToIssueBase));
}

// Get issues for a specific visit
export async function getIssuesByVisit(visitId: string): Promise<Issue[]> {
  if (!visitId) return [];
  const { data, error } = await supabase
    .from("issues")
    .select("*")
    .eq("visit_id", visitId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Error fetching issues by visit:", error);
    return [];
  }
  return attachPhotos((data || []).map(rowToIssueBase));
}

// Get issues for a specific project (includes teammates' issues via RLS)
export async function getIssuesByProject(projectId: string): Promise<Issue[]> {
  if (!projectId) return [];
  const { data, error } = await supabase
    .from("issues")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Error fetching issues by project:", error);
    return [];
  }
  return attachPhotos((data || []).map(rowToIssueBase));
}

// Get issues attached to a specific location (via issues.location_id), for the
// flat "existing issues here" list shown on a pin's location panel. Throws
// on failure (unlike most other get* functions in this file) so the panel
// can tell "failed to load" apart from "genuinely no issues here" — a
// silent empty array would render as an indistinguishable "0 issues".
export async function getIssuesByLocation(locationId: string): Promise<Issue[]> {
  if (!locationId) return [];
  const { data, error } = await supabase
    .from("issues")
    .select("*")
    .eq("location_id", locationId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Error fetching issues by location:", error);
    throw error;
  }
  return attachPhotos((data || []).map(rowToIssueBase));
}

// For a batch of location ids, reports which ones have at least one
// UNVERIFIED issue — the live signal behind the plan viewer's pin color
// (red = something outstanding, green = everything verified or no issues).
//
// "Outstanding" means not `verifie`: a deficiency the contractor marked
// `corrige` is NOT closed until an inspector verifies it, so the pin must
// stay red. Treating `corrige` as done would let the pin go green on the
// contractor's say-so, which is the whole failure mode the lifecycle exists
// to prevent.
// Never stored: recomputed from current issue statuses every time it's
// needed, so it can't drift from reality.
export async function getIssueStatusesByLocations(
  locationIds: string[],
): Promise<Record<string, boolean>> {
  if (locationIds.length === 0) return {};
  const { data, error } = await supabase
    .from("issues")
    .select("location_id, status")
    .in("location_id", locationIds);

  if (error) {
    console.error("Error fetching issue statuses by locations:", error);
    return {};
  }

  const hasOpenIssue: Record<string, boolean> = {};
  for (const row of data || []) {
    if (row.location_id && normalizeIssueStatus(row.status) !== TERMINAL_ISSUE_STATUS) {
      hasOpenIssue[row.location_id] = true;
    }
  }
  return hasOpenIssue;
}

// The set of visit ids (within a project) that have at least one
// UNVERIFIED issue — powers the Visits list's "has open issues" filter.
// One batched query for the whole project, then applied client-side as an
// `.in("id", ...)` restriction on the paginated visits query (see
// supabaseApi.ts's SiteVisitPageFilters.visitIds) — deliberately not an
// embedded/inner-join count, which would break pagination correctness for
// visits with more than one open issue.
/**
 * Cross-project sibling of getVisitIdsWithOpenIssues, for the Dashboard
 * calendar's red/green pills. Same predicate — a visit counts as "open" if
 * any of its issues is not yet verified — widened to several projects in one
 * query rather than one query per project.
 */
export async function getVisitIdsWithOpenIssuesAcrossProjects(
  projectIds: string[],
): Promise<Set<string>> {
  if (projectIds.length === 0) return new Set();

  const { data, error } = await supabase
    .from("issues")
    .select("visit_id")
    .in("project_id", projectIds)
    .neq("status", TERMINAL_ISSUE_STATUS)
    .not("visit_id", "is", null);

  if (error) {
    console.error("Error fetching visit ids with open issues across projects:", error);
    return new Set();
  }
  return new Set((data || []).map((r) => r.visit_id).filter((v): v is string => !!v));
}

export async function getVisitIdsWithOpenIssues(projectId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("issues")
    .select("visit_id")
    .eq("project_id", projectId)
    .neq("status", TERMINAL_ISSUE_STATUS)
    .not("visit_id", "is", null);

  if (error) {
    console.error("Error fetching visit ids with open issues:", error);
    return new Set();
  }
  return new Set((data || []).map((r) => r.visit_id).filter((v): v is string => !!v));
}

// Get a single issue by ID
export async function getIssue(issueId: string): Promise<Issue | null> {
  const { data, error } = await supabase.from("issues").select("*").eq("id", issueId).single();
  if (error) {
    console.error("Error fetching issue:", error);
    return null;
  }
  if (!data) return null;
  const [issue] = await attachPhotos([rowToIssueBase(data)]);
  return issue;
}

// All issues created by the current user across every project, with each
// issue's project name attached — powers the cross-project /app/issues
// list (IssueManagement.tsx) and the Dashboard's "recent issues" panel.
// Moved here from supabaseApi.ts, which used to spread raw rows directly
// (snake_case fields, none of discipline/dueDate/assignedToUserId/photos) —
// now goes through the same rowToIssueBase/attachPhotos mapping as every
// other issue read in this file.
export async function getAllUserIssues(
  userId: string,
): Promise<(Issue & { projectName: string })[]> {
  const { data, error } = await supabase
    .from("issues")
    .select("*, projects(name)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching all user issues:", error);
    throw error;
  }

  const base = (data || []).map((row: any) => ({
    ...rowToIssueBase(row),
    projectName: row.projects?.name ?? "Projet inconnu",
  }));
  return (await attachPhotos(base)) as (Issue & { projectName: string })[];
}

// Most recent issues across every project the user is a MEMBER of (owner,
// editor, or commenter) — not just ones they personally authored. Powers the
// Dashboard's "Déficiences ouvertes" panel; getAllUserIssues above is
// authorship-only and under-reports activity for anyone who didn't create
// the issues themselves (a viewer/editor on someone else's project). An
// optional status filter lets the Dashboard ask for open issues specifically
// (distinct from "Activité récente", which already covers all recent
// issue/visit events regardless of status).

// Create a new issue
// `assignedTo` is optional on the way IN even though it is a required
// string on the way out: `assigned_to_name` is nullable in the schema, and a
// déficience raised from a plan pin genuinely has no assignee yet. It was
// only required here because the input type was derived from the read shape,
// which forced callers to pass a meaningless empty string.
export async function createIssue(
  issueData: Omit<Issue, "id" | "createdBy" | "createdDate" | "assignedTo"> & {
    assignedTo?: string;
  },
): Promise<Issue> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("User not authenticated");

  const { data, error } = await supabase
    .from("issues")
    .insert([
      {
        user_id: userId,
        project_id: issueData.projectId,
        visit_id: issueData.visitId || null,
        title: issueData.title,
        description: issueData.description,
        priority: issueData.priority,
        // Normalized, never passed through. The DB CHECK now accepts only
        // the four lifecycle states, so a stale 'open' from any caller —
        // including a queued offline capture written before this release —
        // would make the INSERT fail outright rather than degrade.
        status: issueData.status ? normalizeIssueStatus(issueData.status) : DEFAULT_ISSUE_STATUS,
        discipline: issueData.discipline || null,
        due_date: issueData.dueDate || null,
        assigned_to: issueData.assignedToUserId || null,
        assigned_to_name: issueData.assignedToUserId
          ? null
          : issueData.assignedToName || issueData.assignedTo || null,
        location: buildExtras(issueData),
        location_id: issueData.locationId || null,
      },
    ])
    .select()
    .single();

  if (error) {
    console.error("Error creating issue:", error);
    throw error;
  }

  if (issueData.photos && issueData.photos.length > 0) {
    await setIssuePhotos(
      data.id,
      issueData.photos.map((p) => p.id),
    );
  }

  const [issue] = await attachPhotos([rowToIssueBase(data)]);
  return issue;
}

// Update an existing issue
export async function updateIssue(
  issueId: string,
  updates: Partial<Omit<Issue, "id" | "createdBy">>,
): Promise<Issue | null> {
  // Fetch the current issue so we can merge the JSONB extras
  const current = await getIssue(issueId);
  if (!current) return null;

  const merged = { ...current, ...updates };
  const payload: Update<"issues"> = {};

  if (updates.title !== undefined) payload.title = updates.title;
  if (updates.description !== undefined) payload.description = updates.description;
  if (updates.priority !== undefined) payload.priority = updates.priority;
  if (updates.status !== undefined) {
    // resolved_at and status_changed_at are NO LONGER written here: the
    // Stage 13 trigger maintains both, and it fires on a bare UPDATE too.
    // Setting resolved_at from the client would race the trigger and could
    // only ever disagree with it.
    //
    // Prefer setIssueStatus() for lifecycle moves — it carries a note and
    // visit_id into the timeline. This path still works (and still logs an
    // event, via the trigger), it just logs one with no note.
    payload.status = normalizeIssueStatus(updates.status);
  }
  if (updates.visitId !== undefined) payload.visit_id = updates.visitId || null;
  if (updates.createdDate !== undefined) {
    payload.created_at = new Date(`${updates.createdDate}T00:00:00.000Z`).toISOString();
  }
  if (updates.discipline !== undefined) payload.discipline = updates.discipline || null;
  if (updates.dueDate !== undefined) payload.due_date = updates.dueDate || null;
  // XOR: setting one assignee field clears the other, matching the form's
  // client-enforced member-vs-free-text toggle.
  if (updates.assignedToUserId !== undefined) {
    payload.assigned_to = updates.assignedToUserId || null;
    if (updates.assignedToUserId) payload.assigned_to_name = null;
  }
  if (updates.assignedToName !== undefined || updates.assignedTo !== undefined) {
    const name = updates.assignedToName ?? updates.assignedTo ?? null;
    payload.assigned_to_name = name;
    if (name) payload.assigned_to = null;
  }

  // Rebuild extras JSONB if any of its constituent fields changed
  if (updates.location !== undefined || updates.tags !== undefined) {
    payload.location = buildExtras(merged);
  }

  const { data, error } = await supabase
    .from("issues")
    .update(payload)
    .eq("id", issueId)
    .select()
    .single();

  if (error) {
    console.error("Error updating issue:", error);
    throw new IssueUpdateError(error.message, error.code);
  }

  if (updates.photos !== undefined) {
    await setIssuePhotos(
      issueId,
      updates.photos.map((p) => p.id),
    );
  }

  const [issue] = await attachPhotos([rowToIssueBase(data)]);
  return issue;
}

// Delete an issue
export async function deleteIssue(issueId: string): Promise<boolean> {
  // .select() forces PostgREST to return the deleted row(s); an empty array
  // means RLS silently excluded the row from the delete (0 rows affected),
  // which otherwise reports no error at all for a plain DELETE.
  const { data, error } = await supabase.from("issues").delete().eq("id", issueId).select();

  if (error) {
    console.error("Error deleting issue:", error);
    throw new IssueUpdateError(error.message, error.code);
  }
  if (!data || data.length === 0) {
    throw new IssueUpdateError("No rows deleted", "PGRST116");
  }
  return true;
}

// ---------------------------------------------------------------------------
// Lifecycle: status transitions and history
// ---------------------------------------------------------------------------

// One entry in a déficience's status timeline, from `issue_status_events`.
// The table is append-only (SELECT policy only; the DB trigger is the sole
// writer), so these rows are a record, not a cache — nothing the client
// does can edit or forge one.
export interface IssueStatusEvent {
  id: string;
  issueId: string;
  fromStatus: IssueStatus | null;
  toStatus: IssueStatus;
  changedBy: string | null;
  changedByName?: string | null;
  visitId: string | null;
  note: string | null;
  createdAt: string;
}

// What the set_issue_status RPC reports back. Every case is explicit —
// notably `not_permitted`, which exists because a policy denial on UPDATE
// is otherwise a silent 0-row no-op: the UI would show success while
// nothing changed.
export type SetIssueStatusOutcome =
  | { result: "changed"; from: IssueStatus | null; to: IssueStatus }
  | { result: "unchanged"; from: IssueStatus; to: IssueStatus }
  | { result: "not_found" }
  | { result: "not_permitted" }
  | { result: "invalid_status" };

/**
 * Move a déficience to a new lifecycle state.
 *
 * Routed through the `set_issue_status` RPC rather than a plain UPDATE so
 * the note and visit_id reach the history trigger — a bare UPDATE still
 * logs an event, but an anonymous one with no explanation attached.
 *
 * The RPC is SECURITY INVOKER: authorization is Stage 12's owner/editor
 * UPDATE policy, not a second rule duplicated inside the function.
 */
export async function setIssueStatus(
  issueId: string,
  toStatus: IssueStatus,
  options: { note?: string | null; visitId?: string | null } = {},
): Promise<SetIssueStatusOutcome> {
  // The generator types optional SQL parameters as `p_note?: string` — it
  // does not model the `DEFAULT NULL` in the signature, so a JSON null is
  // not expressible in its type even though the function accepts one and
  // treats it as "no note". Passing undefined would drop the key instead,
  // which happens to reach the same default; null states the intent, so the
  // narrow cast here is preferred over changing the call's meaning.
  const { data, error } = await supabase.rpc("set_issue_status", {
    p_issue_id: issueId,
    p_to_status: toStatus,
    p_note: (options.note?.trim() ? options.note.trim() : null) as unknown as string | undefined,
    p_visit_id: (options.visitId || null) as unknown as string | undefined,
  });

  if (error) {
    console.error("Error setting issue status:", error);
    throw new IssueUpdateError(error.message, error.code);
  }

  const payload = (data ?? {}) as Record<string, unknown>;
  const result = payload.status as SetIssueStatusOutcome["result"] | undefined;

  switch (result) {
    case "changed":
    case "unchanged":
      return {
        result,
        from: (payload.from as IssueStatus) ?? null,
        to: (payload.to as IssueStatus) ?? toStatus,
      } as SetIssueStatusOutcome;
    case "not_found":
    case "not_permitted":
    case "invalid_status":
      return { result };
    default:
      // The RPC always returns one of the five. Anything else means the
      // deployed function is older than this client — surface it rather
      // than reporting a success that may not have happened.
      throw new IssueUpdateError(
        `Réponse inattendue de set_issue_status: ${JSON.stringify(data)}`,
      );
  }
}

/** A user-facing French message for a non-`changed` RPC outcome. */
export function getSetStatusErrorMessage(outcome: SetIssueStatusOutcome): string | null {
  switch (outcome.result) {
    case "changed":
    case "unchanged":
      return null;
    case "not_permitted":
      return "Vous n'avez pas les droits pour modifier l'état de cette déficience.";
    case "not_found":
      return "Déficience introuvable.";
    case "invalid_status":
      return "État invalide.";
  }
}

/**
 * The status history of one déficience, oldest first.
 *
 * Author names are resolved through `profiles` in a second batched query
 * rather than an embedded join: `issue_status_events.changed_by` points at
 * auth.users, which PostgREST cannot traverse, and the column is nullable
 * (SET NULL on user deletion, plus events written with no session) so an
 * inner join would silently drop those rows from the timeline.
 */
export async function getIssueStatusEvents(issueId: string): Promise<IssueStatusEvent[]> {
  const { data, error } = await supabase
    .from("issue_status_events")
    .select("id, issue_id, from_status, to_status, changed_by, visit_id, note, created_at")
    .eq("issue_id", issueId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching issue status events:", error);
    return [];
  }

  const rows = data || [];
  const userIds = [...new Set(rows.map((r) => r.changed_by).filter((v): v is string => !!v))];

  const names: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, name, email")
      .in("id", userIds);
    if (profileError) {
      // Non-fatal: the timeline is still readable without names.
      console.error("Error fetching status event authors:", profileError);
    } else {
      for (const p of profiles || []) {
        // `name` is nullable on profiles; email is the only field
        // guaranteed present, and attributing an event to an address
        // beats attributing it to nobody.
        const label = p.name?.trim() || p.email || "";
        if (label) names[p.id] = label;
      }
    }
  }

  return rows.map((r) => ({
    id: r.id,
    issueId: r.issue_id,
    fromStatus: r.from_status ? normalizeIssueStatus(r.from_status) : null,
    toStatus: normalizeIssueStatus(r.to_status),
    changedBy: r.changed_by ?? null,
    changedByName: r.changed_by ? (names[r.changed_by] ?? null) : null,
    visitId: r.visit_id ?? null,
    note: r.note ?? null,
    createdAt: r.created_at,
  }));
}
