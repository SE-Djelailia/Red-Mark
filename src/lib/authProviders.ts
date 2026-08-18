// Federated sign-in (Microsoft Entra ID / Azure AD).
//
// SSO proves IDENTITY only. It grants no access to anything: every list in
// the app is scoped by RLS through organization_members, and a brand-new
// Microsoft account belongs to no firm, so it lands on FirmGate exactly like
// any other firm-less account. Authentication is not authorization — this
// module deliberately does nothing beyond starting the OAuth handshake.

import { supabase } from "./supabase";

/**
 * Where Microsoft sends the browser back to.
 *
 * Built from the CURRENT origin rather than a hardcoded red-mark.ca so the
 * flow also works on preview deployments and localhost — each origin still
 * has to be on Supabase's redirect allow-list, but the code does not need to
 * know which environment it is running in.
 *
 * Points at /auth/callback rather than /app: the tokens come back in the URL
 * hash, and the Supabase client needs a beat to exchange them for a session.
 * Landing directly on /app would race Layout's `if (!user) redirect to /`
 * check and bounce a legitimately-authenticated user back to the login
 * screen. The callback route waits for the session to resolve first.
 */
export function oauthRedirectUrl(): string {
  return `${window.location.origin}/auth/callback`;
}

export async function signInWithMicrosoft(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "azure",
    options: {
      redirectTo: oauthRedirectUrl(),
      // `email` is what the invitation claim matches on. Azure returns it in
      // the id_token, and Supabase stamps email_confirmed_at for federated
      // providers — which is exactly what claim_organization_invitation
      // requires before it will honour a pending invitation.
      scopes: "email",
    },
  });
  if (error) throw error;
}
