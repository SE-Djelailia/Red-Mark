import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/useAuth";

export type OrgRole = "admin" | "member";
export type ProjectMemberRole = "owner" | "editor" | "commenter";

export interface ProjectRoleInfo {
  loading: boolean;
  userId: string | undefined;
  orgRole: OrgRole | null;
  projectRole: ProjectMemberRole | null;
  isAdmin: boolean;
  isOwner: boolean;
  /** Admin or project owner — can invite/remove members, change roles. */
  canManageMembers: boolean;
  /** Admin, owner, or editor — commenters cannot create issues. */
  canCreateIssues: boolean;
  /** Same set as canCreateIssues — commenters cannot upload photos. */
  canUploadPhotos: boolean;
}

const EMPTY_ROLE: Omit<ProjectRoleInfo, "loading" | "userId"> = {
  orgRole: null,
  projectRole: null,
  isAdmin: false,
  isOwner: false,
  canManageMembers: false,
  canCreateIssues: false,
  canUploadPhotos: false,
};

/**
 * Fetches the current user's org-level role (profiles.org_role) and their
 * project_members role for a specific project, and derives the permission
 * flags used to gate UI controls. RLS already enforces all of this at the
 * database level — this hook exists purely so the UI can hide controls the
 * user can't use, instead of letting them hit an RLS error.
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
      supabase.from("profiles").select("org_role").eq("id", user.id).single(),
      supabase
        .from("project_members")
        .select("role")
        .eq("project_id", projectId)
        .eq("user_id", user.id)
        .maybeSingle(),
    ])
      .then(([profileRes, memberRes]) => {
        if (cancelled) return;

        const orgRole = (profileRes.data?.org_role as OrgRole | undefined) ?? null;
        const projectRole = (memberRes.data?.role as ProjectMemberRole | undefined) ?? null;
        const isAdmin = orgRole === "admin";
        const isOwner = projectRole === "owner";
        const canManageMembers = isAdmin || isOwner;
        const canCreateIssues = isAdmin || isOwner || projectRole === "editor";

        setState({
          orgRole,
          projectRole,
          isAdmin,
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
 * Whether the current user can edit/delete a specific issue: admin, project
 * owner, or the editor who created it. Not part of useProjectRole() itself
 * since it depends on the issue's creator, not just the caller's role.
 */
export function canEditIssue(
  role: Pick<ProjectRoleInfo, "isAdmin" | "isOwner" | "projectRole" | "userId">,
  issueCreatedBy: string | undefined,
): boolean {
  if (role.isAdmin || role.isOwner) return true;
  return role.projectRole === "editor" && !!issueCreatedBy && issueCreatedBy === role.userId;
}
