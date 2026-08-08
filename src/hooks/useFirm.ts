import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/useAuth";

export type OrgRole = "admin" | "member";

export interface FirmMember {
  userId: string;
  orgRole: OrgRole;
  name: string;
  email: string;
  createdAt: string | null;
}

export interface FirmInvitation {
  id: string;
  email: string;
  orgRole: OrgRole;
  expiresAt: string;
  createdAt: string;
  /** True once expires_at has passed — still listed, but no longer claimable. */
  expired: boolean;
}

export interface Firm {
  id: string;
  name: string;
  slug: string;
  reportFirmName: string | null;
}

export interface FirmInfo {
  loading: boolean;
  error: string | null;
  firm: Firm | null;
  orgRole: OrgRole | null;
  isOrgAdmin: boolean;
  members: FirmMember[];
  invitations: FirmInvitation[];
  refresh: () => Promise<void>;
}

/**
 * The org-level sibling of useProjectRole: who the caller's firm is, what
 * their role in it is, and who else is in it.
 *
 * READS ONLY, and all of them go straight through PostgREST rather than the
 * edge function, because the Stage 4 SELECT policies already permit exactly
 * this much and no more:
 *
 *   organizations              → "Members can view their organization"
 *   organization_members       → "Members can view their organization roster"
 *   profiles                   → "Firm colleagues can view each other's profiles"
 *   organization_invitations   → "Org admins can view their invitations"
 *
 * The invitations query therefore returns nothing at all for a non-admin —
 * enforced by the database, not by the `isOrgAdmin` flag below. That flag
 * exists to shape the UI, never to protect anything: every WRITE lives in
 * organizationApi.ts and is re-authorized server-side.
 *
 * WHY THE ROSTER IS TWO QUERIES
 *
 * organization_members and profiles both reference auth.users(id) and have no
 * foreign key BETWEEN them, so PostgREST cannot infer a relationship and an
 * embedded `profiles(...)` select fails at runtime. Same reason the invite
 * route in the edge function does two queries.
 */
export function useFirm(): FirmInfo {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [firm, setFirm] = useState<Firm | null>(null);
  const [orgRole, setOrgRole] = useState<OrgRole | null>(null);
  const [members, setMembers] = useState<FirmMember[]>([]);
  const [invitations, setInvitations] = useState<FirmInvitation[]>([]);

  const load = useCallback(async () => {
    if (!user?.id) {
      setFirm(null);
      setOrgRole(null);
      setMembers([]);
      setInvitations([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // The caller's own membership tells us both the firm and the role.
      const { data: mine, error: mineError } = await supabase
        .from("organization_members")
        .select("organization_id, org_role")
        .eq("user_id", user.id)
        .maybeSingle();
      if (mineError) throw mineError;

      if (!mine?.organization_id) {
        setFirm(null);
        setOrgRole(null);
        setMembers([]);
        setInvitations([]);
        return;
      }

      const callerRole = (mine.org_role as OrgRole) ?? "member";
      setOrgRole(callerRole);

      const [orgRes, rosterRes] = await Promise.all([
        supabase
          .from("organizations")
          .select("id, name, slug, report_firm_name")
          .eq("id", mine.organization_id)
          .maybeSingle(),
        supabase
          .from("organization_members")
          .select("user_id, org_role, created_at")
          .eq("organization_id", mine.organization_id),
      ]);

      if (orgRes.error) throw orgRes.error;
      if (rosterRes.error) throw rosterRes.error;

      setFirm(
        orgRes.data
          ? {
              id: orgRes.data.id,
              name: orgRes.data.name,
              slug: orgRes.data.slug,
              reportFirmName: orgRes.data.report_firm_name ?? null,
            }
          : null,
      );

      const roster = rosterRes.data ?? [];
      const ids = roster.map((r) => r.user_id);

      // Second query, joined in memory — see the note above.
      let profilesById = new Map<string, { name: string | null; email: string }>();
      if (ids.length > 0) {
        const { data: profileRows, error: profileError } = await supabase
          .from("profiles")
          .select("id, name, email")
          .in("id", ids);
        if (profileError) throw profileError;
        profilesById = new Map(
          (profileRows ?? []).map((p) => [p.id, { name: p.name, email: p.email }]),
        );
      }

      setMembers(
        roster
          .map((r) => {
            const profile = profilesById.get(r.user_id);
            return {
              userId: r.user_id,
              orgRole: (r.org_role as OrgRole) ?? "member",
              name: profile?.name || profile?.email || "Membre",
              email: profile?.email || "",
              createdAt: r.created_at ?? null,
            };
          })
          // Admins first, then alphabetical — the people who can change
          // things are the ones an admin is usually looking for.
          .sort((a, b) =>
            a.orgRole !== b.orgRole
              ? a.orgRole === "admin"
                ? -1
                : 1
              : a.name.localeCompare(b.name, "fr"),
          ),
      );

      // Returns [] for a non-admin by policy, not by the check below.
      if (callerRole === "admin") {
        const { data: inviteRows, error: inviteError } = await supabase
          .from("organization_invitations")
          .select("id, email, org_role, expires_at, created_at, accepted_at")
          .eq("organization_id", mine.organization_id)
          .is("accepted_at", null)
          .order("created_at", { ascending: false });
        if (inviteError) throw inviteError;

        const now = Date.now();
        setInvitations(
          (inviteRows ?? []).map((i) => ({
            id: i.id,
            email: i.email,
            orgRole: (i.org_role as OrgRole) ?? "member",
            expiresAt: i.expires_at,
            createdAt: i.created_at,
            expired: new Date(i.expires_at).getTime() <= now,
          })),
        );
      } else {
        setInvitations([]);
      }
    } catch (err: any) {
      console.error("useFirm: load failed", err);
      setError(err?.message || "Impossible de charger la firme.");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    loading,
    error,
    firm,
    orgRole,
    isOrgAdmin: orgRole === "admin",
    members,
    invitations,
    refresh: load,
  };
}
