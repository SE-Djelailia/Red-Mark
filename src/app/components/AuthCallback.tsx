import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { LogoLockup } from "./ui-kit/Logo";
import { supabase } from "../../lib/supabase";
import { XSpinnerBlock } from "./ui-kit/XSpinner";

/**
 * Landing page for the Microsoft (Azure) OAuth return.
 *
 * WHY THIS ROUTE EXISTS AT ALL
 *
 * The provider returns with tokens in the URL hash. The Supabase client is
 * configured with detectSessionInUrl, so it exchanges them for a session —
 * but that exchange is ASYNCHRONOUS. Redirecting straight to /app would race
 * it: Layout renders, sees `!user`, and bounces to the login screen. The user
 * would have authenticated successfully and been thrown back to the form,
 * which is indistinguishable from a failed sign-in.
 *
 * So this route does one job: wait for the session to actually resolve, then
 * forward. Same event-driven wait as SetPassword — subscribe to
 * onAuthStateChange AND probe getSession(), because the session may land
 * either before or after this component mounts.
 *
 * DELIBERATELY OUTSIDE /app. It has to render before a session exists, which
 * is precisely what Layout refuses to do.
 *
 * It grants nothing. On success it forwards to /app, where FirmGate applies
 * the same firm-membership check every other account faces — a Microsoft
 * account with no membership stops there, as it should.
 */

// Long enough for a slow token exchange on a phone network, short enough
// that a genuinely broken return doesn't leave someone on a spinner forever.
const SESSION_WAIT_MS = 8000;

type Phase = "waiting" | "failed";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("waiting");
  const [detail, setDetail] = useState<string>("");

  useEffect(() => {
    let settled = false;

    // The provider can also come back with an explicit error (consent
    // refused, admin approval required). That arrives as query/hash params,
    // not as a session — surface it rather than timing out on a spinner.
    const readProviderError = (): string | null => {
      try {
        const q = new URLSearchParams(window.location.search);
        const h = new URLSearchParams(
          window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "",
        );
        const desc = q.get("error_description") || h.get("error_description");
        const code = q.get("error") || h.get("error");
        return desc || code;
      } catch {
        return null;
      }
    };

    const providerError = readProviderError();
    if (providerError) {
      setDetail(providerError);
      setPhase("failed");
      return;
    }

    const accept = () => {
      if (settled) return;
      settled = true;
      // replace: the callback URL still carries the token hash. Leaving it in
      // history means Back returns to a spent one-time link.
      navigate("/app", { replace: true });
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) accept();
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) accept();
    });

    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        setPhase("failed");
      }
    }, SESSION_WAIT_MS);

    return () => {
      subscription.unsubscribe();
      window.clearTimeout(timer);
    };
  }, [navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-surface px-6">
      <div className="w-full max-w-sm text-center">
        <div className="mb-10 flex justify-center">
          <LogoLockup size={40} />
        </div>

        {phase === "waiting" ? (
          <>
            <XSpinnerBlock size={40} label="Connexion en cours" />
            <p className="mt-4 text-muted text-sm">Connexion en cours…</p>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-ink mb-2">Connexion impossible</h1>
            <p className="text-sm text-muted mb-2">
              Nous n'avons pas pu terminer la connexion avec Microsoft.
            </p>
            {detail && <p className="text-xs text-faint mb-6 break-words">{detail}</p>}
            <button
              onClick={() => navigate("/", { replace: true })}
              className="w-full py-3 bg-brand-600 text-white rounded-[4px] hover:bg-brand-700 active:bg-[#A00400] transition-colors"
            >
              Retour à la connexion
            </button>
          </>
        )}
      </div>
    </div>
  );
}
