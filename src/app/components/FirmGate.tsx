import { useCallback, useEffect, useRef, useState } from "react";
import { Building2, LogOut, MailCheck, RefreshCw } from "lucide-react";
import { useAuth } from "../../contexts/useAuth";
import { supabase } from "../../lib/supabase";
import { claimInvitation, type ClaimStatus } from "../../lib/organizationApi";
import { XSpinnerBlock } from "./ui-kit/XSpinner";

/**
 * Stands between login and the app for a user who belongs to no firm.
 *
 * WHY THIS IS A SCREEN AND NOT A BACKGROUND EFFECT
 *
 * Every list in this app is firm-scoped by RLS, so a user with no firm sees a
 * working app in which nothing exists — no projects, no visits, no error.
 * That is the worst possible failure mode: indistinguishable from data loss.
 * The claim therefore runs as a visible, explainable step, and when there is
 * nothing to claim it says so in words.
 *
 * The claim itself is deliberately NOT fire-and-forget: joining a firm is the
 * security boundary of the whole product, so it happens where the user can
 * see the outcome and retry.
 */

/** Reads ?token= / #token= from an invitation link, if the user arrived by one. */
function readInvitationToken(): string | null {
  try {
    const fromQuery = new URLSearchParams(window.location.search).get("token");
    if (fromQuery) return fromQuery;
    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
    return new URLSearchParams(hash).get("token");
  } catch {
    return null;
  }
}

type Phase = "checking" | "joining" | "joined" | "blocked";

export default function FirmGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [phase, setPhase] = useState<Phase>("checking");
  const [status, setStatus] = useState<ClaimStatus | null>(null);
  const [message, setMessage] = useState<string>("");

  // The claim is idempotent server-side, but React 18 StrictMode double-mounts
  // effects in development and a token can only disambiguate once — so guard
  // it here too rather than relying on the server to absorb the duplicate.
  const ranFor = useRef<string | null>(null);

  const run = useCallback(async () => {
    if (!user?.id) return;
    setPhase("checking");
    setMessage("");

    // Fast path: already in a firm. A direct read under the
    // "Members can view their organization roster" SELECT policy — no round
    // trip to the edge function for the overwhelmingly common case.
    const { data, error } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("FirmGate: membership lookup failed", error);
      setPhase("blocked");
      setStatus(null);
      setMessage("Impossible de vérifier votre firme. Réessayez.");
      return;
    }

    if (data?.organization_id) {
      setPhase("joined");
      return;
    }

    setPhase("joining");
    try {
      const result = await claimInvitation(readInvitationToken());
      setStatus(result.status);

      if (result.status === "claimed" || result.status === "already_member") {
        setPhase("joined");
        return;
      }

      setPhase("blocked");
      setMessage(result.error || "");
    } catch (err: any) {
      console.error("FirmGate: claim failed", err);
      setPhase("blocked");
      setStatus(null);
      setMessage(err?.message || "Impossible de rejoindre votre firme.");
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    if (ranFor.current === user.id) return;
    ranFor.current = user.id;
    void run();
  }, [user?.id, run]);

  if (phase === "joined") return <>{children}</>;

  if (phase === "checking" || phase === "joining") {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center p-6">
        <div className="text-center">
          <XSpinnerBlock size={48} />
          <p className="mt-4 text-muted">
            {phase === "joining" ? "Adhésion à votre firme…" : "Vérification…"}
          </p>
        </div>
      </div>
    );
  }

  const isUnverified = status === "email_unverified";

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-[4px] border border-line bg-surface p-6 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-[4px] bg-subtle">
          {isUnverified ? (
            <MailCheck className="h-6 w-6 text-ink" aria-hidden="true" />
          ) : (
            <Building2 className="h-6 w-6 text-ink" aria-hidden="true" />
          )}
        </div>

        <h1 className="text-lg font-semibold text-ink">
          {isUnverified ? "Confirmez votre adresse courriel" : "Vous n'êtes dans aucune firme"}
        </h1>

        <p className="mt-2 text-sm text-muted">
          {message ||
            "Votre compte n'est rattaché à aucune firme. Demandez à l'administrateur de votre firme de vous inviter."}
        </p>

        {status === "ambiguous" && (
          <p className="mt-2 text-sm text-muted">
            Ouvrez le lien reçu par courriel : il identifie la firme à rejoindre.
          </p>
        )}

        <p className="mt-4 text-xs text-muted break-all">Connecté en tant que {user?.email}</p>

        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void run()}
            className="inline-flex items-center justify-center gap-2 rounded-[4px] bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 active:bg-brand-800"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Réessayer
          </button>
          <button
            type="button"
            onClick={() => void supabase.auth.signOut()}
            className="inline-flex items-center justify-center gap-2 rounded-[4px] border border-line px-4 py-2.5 text-sm font-medium text-ink hover:bg-canvas"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Se déconnecter
          </button>
        </div>
      </div>
    </div>
  );
}
