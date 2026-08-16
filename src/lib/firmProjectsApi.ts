// Project-access management for a firm admin.
//
// THE POINT OF THIS FILE is that a firm admin manages WHO has access to a
// project without gaining access to what is IN it. That asymmetry is enforced
// by the database, not here:
//
//   • projects        — an admin who is not a project member CANNOT SELECT the
//                       row. Hence org_projects_for_admin(), a SECURITY
//                       DEFINER function that returns names and ids only.
//   • project_members — an admin CAN read, insert, update and delete the
//                       roster of any project in their own firm.
//
// So an admin sees project names and who is on them, and never a visit,
// photo, observation or déficience.
import { supabase } from "./supabase";
import type { Insert } from "./supabase";

export type ProjectRole = "owner" | "editor" | "commenter";

export interface FirmProject {
  id: string;
  name: string;
}

export interface ProjectAssignment {
  userId: string;
  role: ProjectRole;
}

/**
 * Every project in the caller's firm, name and id only.
 *
 * A plain `from("projects").select("id, name")` would return only the ones
 * the admin happens to be a member of — the SELECT policy requires
 * is_project_member(id). This RPC is the sanctioned way around that, and is
 * itself gated on is_org_admin() inside the function body.
 */
export async function listFirmProjects(): Promise<FirmProject[]> {
  const { data, error } = await supabase.rpc("org_projects_for_admin");
  if (error) throw error;
  return (data ?? []).map((p: any) => ({ id: p.id, name: p.name }));
}

/** Who is on this project. Readable by a firm admin under the Stage 4 policy. */
export async function listProjectAssignments(projectId: string): Promise<ProjectAssignment[]> {
  const { data, error } = await supabase
    .from("project_members")
    .select("user_id, role")
    .eq("project_id", projectId);
  if (error) throw error;
  return (data ?? []).map((m: any) => ({ userId: m.user_id, role: m.role as ProjectRole }));
}

/**
 * Adds someone to a project.
 *
 * BARE INSERT — no .select() chained, deliberately.
 *
 * An admin assigning someone to a project the admin is not a member of cannot
 * read that project row back, and an INSERT ... RETURNING that trips a SELECT
 * policy fails AFTER the write has happened: the caller sees an error for a
 * row that was in fact created. Verified in the sandbox — the embedded read
 * returned nothing while the row was present.
 *
 * organization_id is NOT sent: set_project_member_organization() derives it
 * from the project, which is what makes a cross-firm assignment structurally
 * impossible rather than merely rejected.
 */
export async function assignToProject(
  projectId: string,
  userId: string,
  role: ProjectRole,
): Promise<void> {
  const { error } = await supabase
    .from("project_members")
    // organization_id omitted — trigger-filled from the project's firm.
    .insert({ project_id: projectId, user_id: userId, role } as Insert<"project_members">);
  if (error) throw error;
}

/** Changes an existing assignment's role. Bare update, same reasoning. */
export async function setProjectRole(
  projectId: string,
  userId: string,
  role: ProjectRole,
): Promise<void> {
  const { error } = await supabase
    .from("project_members")
    .update({ role })
    .eq("project_id", projectId)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function unassignFromProject(projectId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("project_members")
    .delete()
    .eq("project_id", projectId)
    .eq("user_id", userId);
  if (error) throw error;
}

/**
 * The projects a given firm member is on, by name — for the confirmation
 * shown before revoking their access.
 *
 * Two queries, and neither needs a new endpoint:
 *
 *   1. project_members is readable by a firm admin for any project in the
 *      firm ("Members can view their project roster" covers is_org_admin).
 *   2. the NAMES come from org_projects_for_admin(), because `projects`
 *      itself is NOT selectable by an admin who is not a project member —
 *      that is the whole "manage access without seeing contents" boundary.
 *
 * This is a preview for the dialog only. The authoritative count is the one
 * the removal transaction reports back.
 */
export async function getMemberProjects(userId: string): Promise<FirmProject[]> {
  const { data, error } = await supabase
    .from("project_members")
    .select("project_id")
    .eq("user_id", userId);
  if (error) throw error;

  const ids = new Set((data ?? []).map((m: any) => m.project_id as string));
  if (ids.size === 0) return [];

  const all = await listFirmProjects();
  return all.filter((p) => ids.has(p.id));
}

export const PROJECT_ROLE_LABEL: Record<ProjectRole, string> = {
  owner: "Propriétaire",
  editor: "Éditeur",
  commenter: "Commentateur",
};

/**
 * Turns a Postgres error from the writes above into something a human can act
 * on. The composite foreign keys produce constraint names, not sentences.
 */
export function describeProjectAccessError(error: any, fallback: string): string {
  const message = String(error?.message || "");
  const code = String(error?.code || "");

  if (message.includes("project_members_user_org_fkey")) {
    return "Cette personne ne fait pas partie de votre firme.";
  }
  if (message.includes("project_members_project_org_fkey")) {
    return "Ce projet n'appartient pas à votre firme.";
  }
  if (code === "23505") {
    return "Cette personne est déjà sur ce projet.";
  }
  if (code === "42501" || message.toLowerCase().includes("row-level security")) {
    return "Vous n'avez pas les droits pour gérer l'accès à ce projet.";
  }
  return message || fallback;
}
