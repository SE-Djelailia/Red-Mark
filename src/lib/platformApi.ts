// Client-side API for the PLATFORM tier — the level above firms.
//
// A platform operator administers FIRMS: create one, name it, set the firm
// name that prints on reports, designate its first admin. That is the entire
// surface, and it is the entire surface on purpose.
//
// WHAT IS NOT HERE, AND WILL NOT BE
//
// There is no call in this file that reads a project, a visit, a photo, an
// observation, a report or a deficiency, because no such route exists on the
// server. An operator belongs to no firm, and every data policy in the
// database resolves through firm membership — so an operator reading firm data
// is not something this file declines to do, it is something the database will
// not answer. If a feature here ever seems to need project data, the answer is
// to ask that firm's own admin, not to widen this tier.
//
// Every call is gated server-side on the platform_operators allowlist, which
// no code writes — rows are inserted by hand in psql. Hiding the /platform
// route from the nav is presentation; the allowlist is the access control.
import { supabase } from "./supabase";
import { projectId as supabaseProjectId, publicAnonKey } from "../../utils/supabase/info";

const BASE = `https://${supabaseProjectId}.supabase.co/functions/v1/make-server-9fe75696`;

export interface PlatformApiError extends Error {
  status: number;
  code?: string;
}

function apiError(message: string, status: number, code?: string): PlatformApiError {
  const err = new Error(message) as PlatformApiError;
  err.status = status;
  err.code = code;
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
    // Non-JSON body (a gateway error page, say).
  }

  if (!res.ok) {
    throw apiError(body?.error || text || `Erreur ${res.status}`, res.status, body?.code);
  }
  return body as T;
}

export interface FirmAdminSummary {
  userId: string;
  name: string | null;
  email: string | null;
}

export interface PlatformOrganization {
  id: string;
  name: string;
  slug: string;
  report_firm_name: string | null;
  created_at: string;
  memberCount: number;
  admins: FirmAdminSummary[];
}

/**
 * Every firm, with its admins — and nothing inside any of them.
 *
 * Throws a 404 for a non-operator. The server answers 404 rather than 403 on
 * purpose: a 403 would confirm the tier exists and that the caller is not in
 * it. Callers should treat 404 as "this page does not exist for you".
 */
export async function listOrganizations(): Promise<PlatformOrganization[]> {
  const body = await request<{ organizations: PlatformOrganization[] }>("/platform/organizations");
  return body.organizations || [];
}

export interface CreateOrganizationInput {
  name: string;
  /** Optional; the server derives one from `name` when blank. */
  slug?: string;
  reportFirmName?: string;
  adminEmail: string;
  adminName?: string;
  adminRole?: string;
}

export interface CreateOrganizationResult {
  success: true;
  organization: { id: string; name: string; slug: string; report_firm_name: string | null };
  adminUserId: string;
  adminEmail: string;
  /** The set-password link. Null if minting it failed — re-issuable afterwards. */
  actionLink: string | null;
}

/** Creates the firm and installs its first admin in one transaction. */
export function createOrganization(input: CreateOrganizationInput) {
  return request<CreateOrganizationResult>("/platform/organizations", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Renames a firm, or sets the name that prints on its reports. */
export function updateOrganization(
  orgId: string,
  patch: { name?: string; reportFirmName?: string },
) {
  return request<{ success: true }>(`/platform/organizations/${orgId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

/**
 * Re-mints the activation link for a firm's admin who never set a password.
 *
 * Refused with 409 `already_activated` once they have one — same gate as the
 * firm-admin re-issue route. Operators stand up firms; they do not hold
 * anyone's identity, and someone with a password uses "Mot de passe oublié ?"
 * themselves.
 */
export function reissueAdminLink(orgId: string, userId: string) {
  return request<{ success: true; email: string; actionLink: string | null }>(
    `/platform/organizations/${orgId}/admin-recovery-link`,
    { method: "POST", body: JSON.stringify({ userId }) },
  );
}

/** Same slug derivation the server uses, so the form can preview it. */
export function slugify(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}
