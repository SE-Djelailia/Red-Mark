// Client-side API for managing issues (déficiences).
// Backed by Supabase (table `issues`). The rich client-facing fields that have
// no dedicated column (tags, assignedTo label, photos, free-text location) are
// packed into the `location` JSONB column so we don't need a schema migration.

import { supabase } from "./supabase";

export interface Issue {
  id: string;
  visitId: string;
  projectId: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "critical";
  status: "open" | "in_progress" | "resolved";
  assignedTo: string;
  createdBy: string;
  createdDate: string;
  photos: { id: string; url: string }[];
  tags: string[];
  location: string;
}

// Shape stored inside the issues.location JSONB column
interface IssueExtras {
  label?: string;
  tags?: string[];
  assignedTo?: string;
  photos?: { id: string; url: string }[];
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

// Map a Supabase row to the client-facing Issue shape
function rowToIssue(row: any): Issue {
  const extras: IssueExtras = row.location && typeof row.location === "object" ? row.location : {};
  return {
    id: row.id,
    visitId: row.visit_id || "",
    projectId: row.project_id,
    title: row.title,
    description: row.description || "",
    priority: row.priority,
    status: row.status,
    assignedTo: extras.assignedTo || "",
    createdBy: row.user_id,
    createdDate: (row.created_at || new Date().toISOString()).split("T")[0],
    photos: Array.isArray(extras.photos) ? extras.photos : [],
    tags: Array.isArray(extras.tags) ? extras.tags : [],
    location: extras.label || "",
  };
}

// Build the location JSONB payload from client-facing fields
function buildExtras(data: {
  location?: string;
  tags?: string[];
  assignedTo?: string;
  photos?: { id: string; url: string }[];
}): IssueExtras {
  return {
    label: data.location || "",
    tags: data.tags || [],
    assignedTo: data.assignedTo || "",
    photos: data.photos || [],
  };
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
  return (data || []).map(rowToIssue);
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
  return (data || []).map(rowToIssue);
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
  return (data || []).map(rowToIssue);
}

// Get a single issue by ID
export async function getIssue(issueId: string): Promise<Issue | null> {
  const { data, error } = await supabase.from("issues").select("*").eq("id", issueId).single();
  if (error) {
    console.error("Error fetching issue:", error);
    return null;
  }
  return data ? rowToIssue(data) : null;
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
        location: buildExtras(issueData),
      },
    ])
    .select()
    .single();

  if (error) {
    console.error("Error creating issue:", error);
    throw error;
  }
  return rowToIssue(data);
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

  // Rebuild extras JSONB if any of its constituent fields changed
  if (
    updates.location !== undefined ||
    updates.tags !== undefined ||
    updates.assignedTo !== undefined ||
    updates.photos !== undefined
  ) {
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
  return rowToIssue(data);
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
