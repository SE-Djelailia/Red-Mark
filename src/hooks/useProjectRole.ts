import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/useAuth";

export type OrgRole = "admin" | "member";
export type ProjectMemberRole = "owner" | "editor" | "commenter";

export interface ProjectRoleInfo {
  loading: boolean;
  userId: string | undefined;
  /** The caller's firm, or null if they belong to none. */
  orgId: string | null;
  orgRole: OrgRole | null;
  /** Firm admin OF THE CALLER'S OWN FIRM. Never a global flag. */
  isOrgAdmin: boolean;
  /** True when this project belongs to the caller's firm. */
  sameFirm: boolean;
  projectRole: ProjectMemberRole | null;
  isOwner: boolean;
  /** Firm admin or project owner — can invite/remove members, change roles. */
  canManageMembers: boolean;
  /** Owner or editor — commenters cannot create issues. */
  canCreateIssues: boolean;
  /** Same set as canCreateIssues — commenters cannot upload photos. */
  canUploadPhotos: boolean;
}

const EMPTY_ROLE: Omit<ProjectRoleInfo, "loading" | "userId"> = {
  orgId: null,
  orgRole: null,
  isOrgAdmin: false,
  sameFirm: false,
  projectRole: null,
  isOwner: false,
  canManageMembers: false,
  canCreateIssues: false,
  canUploadPhotos: false,
};

/**
 * Resolves what the current user may do in a specific project, under the
 * organization (firm) model.
 *
 * WHAT CHANGED AND WHY IT MATTERS
 *
 * This used to read `profiles.org_role` and derive an `isAdmin` flag that
 * granted content permissions — editing issues, uploading photos, managing
 * anything. Two problems, both now fixed:
 *
 *  1. `profiles.org_role` was a GLOBAL flag with no firm scope. It made an
 *     admin powerful in every firm's projects. Firm-admin status now comes
 *     from `organization_members.org_role`, always tied to one organization.
 *
 *  2. A firm admin deliberately gets NO content access. The approved model is
 *     that an admin manages ACCESS without automatically seeing or editing
 *     project CONTENTS, and the Stage 4 RLS policies enforce exactly that. An
 *     `isAdmin` that unlocked edit buttons therefore showed controls the
 *     database would refuse. `isAdmin` has been REMOVED rather than renamed,
 *     so any consumer still expecting it fails to compile instead of silently
 *     inheriting the old meaning.
 *
 * RLS is still the enforcement boundary. This hook exists so the UI can hide
 * controls the user cannot use, rather than letting them hit an RLS error.
 */
export function useProjectRole(projectId: string | undefined): ProjectRoleInfo {
  const { user } = useAuth();
  const [state, setState] = useState<Omit<ProjectRoleInfo, "loading" | "userId">>(EMPTY_ROLE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    if (!user || !projectId) {
      setState(EMPTY_ROLE);
      setLoading(false);
      return;
    }

    setLoading(true);

    Promise.all([
      // The caller's firm membership. maybeSingle, not single: a user who
      // belongs to no organization is a real state (a fresh signup that has
      // not been placed in a firm yet), not an error to throw on.
      supabase
        .from("organization_members")
        .select("organization_id, org_role")
        .eq("user_id", user.id)
        .maybeSingle(),
      // The project's firm. Readable only if RLS already lets us see the
      // project, so a null here also means "not visible to you".
      supabase.from("projects").select("organization_id").eq("id", projectId).maybeSingle(),
      supabase
        .from("project_members")
        .select("role")
        .eq("project_id", projectId)
        .eq("user_id", user.id)
        .maybeSingle(),
    ])
      .then(([orgRes, projectRes, memberRes]) => {
        if (cancelled) return;

        const orgId = (orgRes.data?.organization_id as string | undefined) ?? null;
        const orgRole = (orgRes.data?.org_role as OrgRole | undefined) ?? null;
        const projectOrgId = (projectRes.data?.organization_id as string | undefined) ?? null;
        const projectRole = (memberRes.data?.role as ProjectMemberRole | undefined) ?? null;

        // Both must be present AND equal. Two nulls are not a match — that
        // would make a firm-less user look like a colleague of a firm-less
        // project.
        const sameFirm = !!orgId && !!projectOrgId && orgId === projectOrgId;
        const isOrgAdmin = orgRole === "admin" && sameFirm;
        const isOwner = projectRole === "owner";

        // The ONLY permission a firm admin grants. Everything else below is
        // membership-derived, matching the Stage 4 policies.
        const canManageMembers = isOrgAdmin || isOwner;

        // Deliberately NOT `|| isOrgAdmin`. Content access comes from
        // project membership alone.
        const canCreateIssues = isOwner || projectRole === "editor";

        setState({
          orgId,
          orgRole,
          isOrgAdmin,
          sameFirm,
          projectRole,
          isOwner,
          canManageMembers,
          canCreateIssues,
          canUploadPhotos: canCreateIssues,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Error fetching project role:", err);
        setState(EMPTY_ROLE);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, user]);

  return { loading, userId: user?.id, ...state };
}

/**
 * Whether the current user can edit/delete a specific issue: the project
 * owner, or the editor who created it.
 *
 * A firm admin is NOT included — `issues` has no admin policy since Stage 4,
 * so offering the control would produce an RLS failure on save.
 */
export function canEditIssue(
  role: Pick<ProjectRoleInfo, "isOwner" | "projectRole" | "userId">,
  issueCreatedBy: string | undefined,
): boolean {
  if (role.isOwner) return true;
  return role.projectRole === "editor" && !!issueCreatedBy && issueCreatedBy === role.userId;
}

/**
 * Whether the current user can select/delete a specific photo: the project
 * owner, or the editor who uploaded it. Commenters never manage photos.
 *
 * A firm admin is NOT included — and note the storage policy is stricter
 * still: since Stage 4, `project-photos delete` is uploader-only.
 */
/**
 * Whether the current user can edit a photo's METADATA (location,
 * description, tags) — the project owner or any editor, regardless of who
 * uploaded it.
 *
 * Deliberately separate from canManagePhoto, and deliberately wider. That
 * one gates DELETION, where the storage policy really is uploader-only.
 * Editing is governed by the `Editors can update project photos` RLS
 * policy, which has no uploader condition — so reusing canManagePhoto here
 * would block a non-creator editor in the UI even though the database
 * allows the write. Fixing a colleague's missing local is the whole point
 * of the feature.
 *
 * (A commenter can in fact still edit a photo THEY uploaded, via the older
 * `Creator can update their photos` policy. Only reachable if their role
 * was downgraded after uploading; narrowing it would need a migration, so
 * the UI simply doesn't offer them the action.)
 */
export function canEditPhotoMetadata(
  role: Pick<ProjectRoleInfo, "isOwner" | "projectRole">,
): boolean {
  return role.isOwner || role.projectRole === "editor";
}

export function canManagePhoto(
  role: Pick<ProjectRoleInfo, "isOwner" | "projectRole" | "userId">,
  photoUploadedBy: string | undefined,
): boolean {
  if (role.isOwner) return true;
  return role.projectRole === "editor" && !!photoUploadedBy && photoUploadedBy === role.userId;
}
