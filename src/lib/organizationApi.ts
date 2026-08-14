// Client-side API for firm (organization) membership.
//
// Everything here goes through the edge function rather than PostgREST,
// because organization_members and organization_invitations have NO
// INSERT/UPDATE/DELETE policy for `authenticated` — deliberately, so a user
// cannot place themselves in a firm or promote themselves within one. The
// edge function is the only write path, and it derives the target firm from
// the caller's own membership rather than from anything sent here.
//
// Reads of the roster and of pending invitations DO work directly over
// PostgREST under the existing SELECT policies; they are not in this file.
import { supabase } from "./supabase";
import { projectId as supabaseProjectId, publicAnonKey } from "../../utils/supabase/info";

const BASE = `https://${supabaseProjectId}.supabase.co/functions/v1/make-server-9fe75696`;

export interface ApiError extends Error {
  status: number;
  code?: string;
  /** Extra payload some routes attach, e.g. the project list on a blocked removal. */
  details?: Record<string, unknown>;
}

function apiError(message: string, status: number, code?: string, details?: any): ApiError {
  const err = new Error(message) as ApiError;
  err.status = status;
  err.code = code;
  err.details = details;
  return err;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token || publicAnonKey;

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });

  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON body (a gateway error page, say). Fall through to the raw text.
  }

  if (!res.ok) {
    throw apiError(body?.error || text || `Erreur ${res.status}`, res.status, body?.code, body);
  }
  return body as T;
}

// ---------------------------------------------------------------------------
// The handshake
// ---------------------------------------------------------------------------

export type ClaimStatus =
  | "claimed"
  | "already_member"
  | "none"
  | "expired"
  | "already_accepted"
  | "ambiguous"
  | "email_unverified";

export interface ClaimResult {
  status: ClaimStatus;
  organizationId?: string;
  orgRole?: "admin" | "member";
  error?: string;
}

/**
 * Claims a pending firm invitation for the signed-in user.
 *
 * The server takes the email from the verified JWT and the admin API — this
 * call sends no address, and could not usefully send one. `token` is read
 * from the invitation link when present; it only DISAMBIGUATES between
 * multiple pending invitations for the same verified address, and can never
 * substitute for the email match.
 *
 * Non-2xx statuses are real outcomes here (no invitation, expired, ambiguous),
 * not exceptions — they are returned rather than thrown so the caller can
 * render each one differently.
 */
export async function claimInvitation(token?: string | null): Promise<ClaimResult> {
  try {
    return await request<ClaimResult>("/organizations/claim", {
      method: "POST",
      body: JSON.stringify(token ? { token } : {}),
    });
  } catch (error) {
    const err = error as ApiError;
    const known: ClaimStatus[] = [
      "none",
      "expired",
      "already_accepted",
      "ambiguous",
      "email_unverified",
    ];
    const status = (err.details as any)?.status;
    if (known.includes(status)) {
      return { status, error: err.message };
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Firm identity
// ---------------------------------------------------------------------------

export interface Organization {
  id: string;
  name: string;
  slug: string;
  report_firm_name: string | null;
}

export interface MyOrganization {
  organization: Organization | null;
  orgRole: "admin" | "member" | null;
}

export async function getMyOrganization(): Promise<MyOrganization> {
  return request<MyOrganization>("/organizations/me");
}

// ---------------------------------------------------------------------------
// Firm administration (consumed by the Part 2 admin screen)
// ---------------------------------------------------------------------------

/**
 * `name` and `role` are optional PRE-FILLS for the invitee's profile, not
 * assertions about them: the person confirms and can correct both during
 * activation, which requires them either way.
 */
export async function createInvitation(
  email: string,
  orgRole: "admin" | "member" = "member",
  name = "",
  role = "",
): Promise<{ success: true; email: string; orgRole: string; emailed: boolean; expiresAt: string }> {
  return request("/organizations/invitations", {
    method: "POST",
    body: JSON.stringify({ email, orgRole, name, role }),
  });
}

export async function revokeInvitation(invitationId: string): Promise<{ success: true }> {
  return request(`/organizations/invitations/${invitationId}`, { method: "DELETE" });
}

export async function provisionMember(
  email: string,
  orgRole: "admin" | "member" = "member",
  name = "",
  role = "",
): Promise<{ success: true; userId: string; email: string; actionLink: string | null }> {
  return request("/organizations/members/provision", {
    method: "POST",
    body: JSON.stringify({ email, orgRole, name, role }),
  });
}

/**
 * Re-issues the set-password link for a provisioned account whose link was
 * lost.
 *
 * Only works while the account has never been signed into — the server
 * refuses with code `already_activated` otherwise, because a recovery link is
 * an account-takeover primitive and an admin should not be able to mint one
 * for a colleague with working credentials. Someone who has signed in uses
 * "Mot de passe oublié ?" on the login screen instead.
 */
export async function reissueRecoveryLink(
  userId: string,
): Promise<{ success: true; email: string; actionLink: string }> {
  return request(`/organizations/members/${userId}/recovery-link`, { method: "POST" });
}

export async function setMemberRole(
  userId: string,
  orgRole: "admin" | "member",
): Promise<{ success: true }> {
  return request(`/organizations/members/${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ orgRole }),
  });
}

/**
 * Removes someone from the firm.
 *
 * `cascade` decides what happens to their project access:
 *
 *   false (default) — throws with code `has_project_memberships` and
 *                     `details.projects` if they hold any project rows.
 *                     Nothing is deleted.
 *   true            — revokes project rows and firm membership together, in
 *                     one server-side transaction. All-or-nothing.
 *
 * The default is the safe one on purpose: cascading is destructive and should
 * only ever follow a confirmation that showed the admin what would be cut.
 * The auth account survives either way — the person keeps a login with no
 * firm, which can reach nothing.
 */
export async function removeMember(
  userId: string,
  cascade = false,
): Promise<{ success: true; projectsRemoved: number }> {
  const query = cascade ? "?cascade=1" : "";
  return request(`/organizations/members/${userId}${query}`, { method: "DELETE" });
}
