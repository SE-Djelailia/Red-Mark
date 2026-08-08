import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { AlertTriangle, Check, Eye, EyeOff, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";
import Button from "./ui-kit/Button";
import { inputClassName, labelClassName } from "./ui-kit/Input";

/**
 * The recipient's side of an invitation or an admin-provisioned account:
 * "choose your password".
 *
 * HOW THE USER GETS HERE
 *
 * The edge function generates a Supabase action link with
 * `redirectTo: <origin>/auth/set-password`. Supabase verifies the token on its
 * own domain and then bounces the browser here. Without that redirectTo the
 * link dead-ends on a Supabase URL with nowhere to go — which is exactly what
 * it did before this page existed.
 *
 * HOW THE SESSION ARRIVES
 *
 * The client uses auth-js's default `flowType: 'implicit'`, so Supabase
 * appends the tokens to the URL HASH (#access_token=…&type=recovery). The
 * client is created with `detectSessionInUrl: true`, which parses that hash
 * and establishes a session on its own — this page never touches the tokens.
 * It just waits for the session to appear.
 *
 * WHY THE WAIT IS EVENT-DRIVEN AND NOT A HASH READ
 *
 * detectSessionInUrl runs when the Supabase client module is imported, which
 * is BEFORE this component renders, and it strips the hash once consumed.
 * Reading the hash here would be a race with cleanup. Subscribing to
 * onAuthStateChange and also probing getSession() catches the session whether
 * it lands before or after mount.
 *
 * THIS ROUTE IS DELIBERATELY OUTSIDE /app — /app is wrapped in Layout, which
 * requires a session and then FirmGate. Someone arriving from an email invite
 * has no firm yet, and someone provisioned has no password yet; neither can be
 * asked to clear those gates before they can set a password.
 */

const MIN_PASSWORD_LENGTH = 8;

// Long enough to cover a slow parse, short enough that a genuinely dead link
// doesn't leave someone staring at a spinner.
const SESSION_WAIT_MS = 6000;

type Phase = "verifying" | "ready" | "invalid" | "done";

/** Supabase reports failures as hash params rather than an HTTP error. */
function readHashError(): string | null {
  try {
    const raw = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
    if (!raw) return null;
    const params = new URLSearchParams(raw);
    const code = params.get("error_code");
    const description = params.get("error_description");
    if (!params.get("error") && !code) return null;
    if (code === "otp_expired" || /expired/i.test(description || "")) {
      return "Ce lien a expiré. Demandez-en un nouveau à l'administrateur de votre firme.";
    }
    return description?.replace(/\+/g, " ") || "Ce lien n'est plus valide.";
  } catch {
    return null;
  }
}

export default function SetPassword() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("verifying");
  const [reason, setReason] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [reveal, setReveal] = useState(false);
  const [saving, setSaving] = useState(false);

  const settled = useRef(false);

  useEffect(() => {
    const hashError = readHashError();
    if (hashError) {
      settled.current = true;
      setReason(hashError);
      setPhase("invalid");
      return;
    }

    const accept = (userEmail: string | undefined) => {
      if (settled.current) return;
      settled.current = true;
      setEmail(userEmail ?? null);
      setPhase("ready");
    };

    // Subscribe BEFORE probing, so a session that lands in between is not
    // missed. PASSWORD_RECOVERY is what a recovery link fires; SIGNED_IN is
    // what an invite link fires.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        accept(session.user.email);
      }
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) accept(data.session.user.email);
    });

    const timer = window.setTimeout(() => {
      if (settled.current) return;
      settled.current = true;
      setReason(
        "Ce lien est invalide ou a expiré. Demandez un nouveau lien à l'administrateur de votre firme.",
      );
      setPhase("invalid");
    }, SESSION_WAIT_MS);

    return () => {
      subscription.unsubscribe();
      window.clearTimeout(timer);
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      toast.error(`Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`);
      return;
    }
    if (password !== confirm) {
      toast.error("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      setPhase("done");
      toast.success("Mot de passe défini. Bienvenue dans RedMark.");

      // updateUser on a recovery session leaves the user signed in, so this
      // goes straight into the app. FirmGate then does the rest: a
      // provisioned user is already in their firm, and someone who arrived
      // from an email invitation has their invitation claimed there.
      window.setTimeout(() => navigate("/app/dashboard", { replace: true }), 900);
    } catch (err: any) {
      console.error("Set password failed:", err);
      const message = String(err?.message || "");
      toast.error(
        /session|jwt|expired/i.test(message)
          ? "Votre lien a expiré pendant la saisie. Demandez-en un nouveau."
          : message || "Impossible de définir le mot de passe.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (phase === "verifying") {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center p-6">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600 mx-auto" />
          <p className="mt-4 text-muted">Vérification du lien…</p>
        </div>
      </div>
    );
  }

  if (phase === "invalid") {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-open/10">
            <AlertTriangle className="h-6 w-6 text-open" aria-hidden="true" />
          </div>
          <h1 className="text-lg font-semibold text-ink">Lien invalide</h1>
          <p className="mt-2 text-sm text-muted">{reason}</p>
          <div className="mt-6">
            <Button variant="secondary" onClick={() => navigate("/", { replace: true })} fullWidth>
              Retour à la connexion
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50">
            <Check className="h-6 w-6 text-brand-600" aria-hidden="true" />
          </div>
          <h1 className="text-lg font-semibold text-ink">Mot de passe défini</h1>
          <p className="mt-2 text-sm text-muted">Ouverture de RedMark…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6">
        <div className="text-center mb-6">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50">
            <KeyRound className="h-6 w-6 text-brand-600" aria-hidden="true" />
          </div>
          <h1 className="text-lg font-semibold text-ink">Choisissez votre mot de passe</h1>
          <p className="mt-2 text-sm text-muted">
            Dernière étape pour activer votre accès à RedMark.
          </p>
          {email && <p className="mt-2 text-xs text-muted break-all">{email}</p>}
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className={labelClassName} htmlFor="new-password">
              Nouveau mot de passe
            </label>
            <div className="relative">
              <input
                id="new-password"
                type={reveal ? "text" : "password"}
                required
                autoFocus
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputClassName} pr-11`}
              />
              <button
                type="button"
                onClick={() => setReveal((v) => !v)}
                aria-label={reveal ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-muted hover:text-ink"
              >
                {reveal ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
              </button>
            </div>
            <p className="text-xs text-muted mt-1.5">
              Au moins {MIN_PASSWORD_LENGTH} caractères.
            </p>
          </div>

          <div>
            <label className={labelClassName} htmlFor="confirm-password">
              Confirmer le mot de passe
            </label>
            <input
              id="confirm-password"
              type={reveal ? "text" : "password"}
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={inputClassName}
            />
            {confirm.length > 0 && confirm !== password && (
              <p className="text-xs text-open mt-1.5">Les deux mots de passe ne correspondent pas.</p>
            )}
          </div>

          <Button
            type="submit"
            disabled={saving || password.length < MIN_PASSWORD_LENGTH || password !== confirm}
            fullWidth
          >
            {saving ? "Enregistrement…" : "Activer mon compte"}
          </Button>
        </form>
      </div>
    </div>
  );
}
