// Client-side API for managing issues (déficiences).
// Backed by Supabase (table `issues`). discipline/dueDate/assignedToName are
// real columns (added by stage-issue-consolidation.sql). `tags`/`location`
// (free-text label) still live in the `location` JSONB column — narrowed to
// just those two keys now that photos and assignedTo have real homes.
// Photos are now a real relationship (photos.issue_id), not a JSONB array.

import { supabase } from "./supabase";

export interface Issue {
  id: string;
  visitId: string;
  projectId: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "critical";
  status: "open" | "resolved";
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
  photos: { id: string; url: string; storagePath?: string }[];
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
    status: row.status,
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
    .select("id, file_url, storage_path, issue_id")
    .in("issue_id", ids);

  const byIssue: Record<string, { id: string; url: string; storagePath: string }[]> = {};
  if (error) {
    console.error("Error fetching photos for issues:", error);
  } else {
    for (const p of data || []) {
      if (!p.issue_id) continue;
      (byIssue[p.issue_id] ??= []).push({ id: p.id, url: p.file_url, storagePath: p.storage_path });
    }
  }
  return rows.map((r) => ({ ...r, photos: byIssue[r.id] || [] }));
}

// Build the location JSONB payload from client-facing fields. Narrowed to
// just label/tags — photos and assignedTo have real columns now.
function buildExtras(data: { location?: string; tags?: string[] }): IssueExtras {
  return {
    label: data.location || "",
    tags: data.tags || [],
  };
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
// non-resolved issue — the live signal behind the plan viewer's pin color
// (red = has an open issue, green = all resolved or no issues at all).
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
    if (row.location_id && row.status !== "resolved") hasOpenIssue[row.location_id] = true;
  }
  return hasOpenIssue;
}

// The set of visit ids (within a project) that have at least one
// non-resolved issue — powers the Visits list's "has open issues" filter.
// One batched query for the whole project, then applied client-side as an
// `.in("id", ...)` restriction on the paginated visits query (see
// supabaseApi.ts's SiteVisitPageFilters.visitIds) — deliberately not an
// embedded/inner-join count, which would break pagination correctness for
// visits with more than one open issue.
export async function getVisitIdsWithOpenIssues(projectId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("issues")
    .select("visit_id")
    .eq("project_id", projectId)
    .neq("status", "resolved")
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
// Dashboard's "recent issues" panel; getAllUserIssues above is authorship-only
// and under-reports activity for anyone who didn't create the issues
// themselves (a viewer/editor on someone else's project).
export async function getRecentIssuesAcrossProjects(
  projectIds: string[],
  limit = 5,
): Promise<(Issue & { projectName: string })[]> {
  if (projectIds.length === 0) return [];

  const { data, error } = await supabase
    .from("issues")
    .select("*, projects(name)")
    .in("project_id", projectIds)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Error fetching recent issues across projects:", error);
    throw error;
  }

  const base = (data || []).map((row: any) => ({
    ...rowToIssueBase(row),
    projectName: row.projects?.name ?? "Projet inconnu",
  }));
  return (await attachPhotos(base)) as (Issue & { projectName: string })[];
}

// Create a new issue
export async function createIssue(
  issueData: Omit<Issue, "id" | "createdBy" | "createdDate">,
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
        status: issueData.status,
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
  const payload: Record<string, any> = {};

  if (updates.title !== undefined) payload.title = updates.title;
  if (updates.description !== undefined) payload.description = updates.description;
  if (updates.priority !== undefined) payload.priority = updates.priority;
  if (updates.status !== undefined) {
    payload.status = updates.status;
    payload.resolved_at = updates.status === "resolved" ? new Date().toISOString() : null;
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
