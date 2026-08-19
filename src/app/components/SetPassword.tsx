import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { AlertTriangle, Check, Eye, EyeOff, KeyRound, UserRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";
import Button from "./ui-kit/Button";
import { inputClassName, labelClassName } from "./ui-kit/Input";
import RolePicker from "./ui-kit/RolePicker";
import { normalizeName, normalizeRole } from "../../lib/roles";
import { XSpinnerBlock } from "./ui-kit/XSpinner";

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

// "profile" sits between the password and the app: activation is not complete
// until we know who this person is. Both fields print on generated reports
// (under "Préparé par", and in the ASSISTAIENT table), so an account that
// reaches the app blank produces reports with an anonymous author.
type Phase = "verifying" | "ready" | "profile" | "invalid" | "done";

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

  // Pre-filled from whatever the inviting admin entered, then confirmed by
  // the person themselves — an admin's guess at a colleague's title must
  // never be the last word on it.
  const [profileName, setProfileName] = useState("");
  const [profileRole, setProfileRole] = useState("");

  const settled = useRef(false);

  useEffect(() => {
    const hashError = readHashError();
    if (hashError) {
      settled.current = true;
      setReason(hashError);
      setPhase("invalid");
      return;
    }

    const accept = (session: { user: { email?: string; user_metadata?: any } }) => {
      if (settled.current) return;
      settled.current = true;
      setEmail(session.user.email ?? null);
      // user_metadata is the pre-fill carrier here, not the profiles row: for
      // an emailed invitation the claim has not run yet (FirmGate does that
      // once they reach /app), so no profile row has been populated. Both
      // inviteUserByEmail and admin.createUser stash name/role there.
      const meta = session.user.user_metadata ?? {};
      setProfileName(normalizeName(meta.name));
      setProfileRole(normalizeRole(meta.role));
      setPhase("ready");
    };

    // Subscribe BEFORE probing, so a session that lands in between is not
    // missed. PASSWORD_RECOVERY is what a recovery link fires; SIGNED_IN is
    // what an invite link fires.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        accept(session);
      }
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) accept(data.session);
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

  /**
   * Second step: who is this person.
   *
   * Written to BOTH profiles and user_metadata. profiles is what the app and
   * the report generator read; user_metadata keeps the two from drifting,
   * since other screens still read it as a fallback.
   */
  async function submitProfile(e: React.FormEvent) {
    e.preventDefault();
    const name = normalizeName(profileName);
    const role = normalizeRole(profileRole);
    if (!name || !role) {
      toast.error("Le nom et le titre sont requis.");
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) {
      toast.error("Votre session a expiré. Reconnectez-vous.");
      return;
    }

    setSaving(true);
    try {
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ name, role, updated_at: new Date().toISOString() })
        .eq("id", userId);
      if (profileError) throw profileError;

      const { error: metaError } = await supabase.auth.updateUser({ data: { name, role } });
      // Non-fatal: profiles is the source of truth for everything that reads
      // a name, and it is already written.
      if (metaError) console.warn("Could not sync user_metadata:", metaError.message);

      setPhase("done");
      toast.success("Bienvenue dans RedMark.");

      // updateUser on a recovery session leaves the user signed in, so this
      // goes straight into the app. FirmGate then does the rest: a
      // provisioned user is already in their firm, and someone who arrived
      // from an email invitation has their invitation claimed there.
      window.setTimeout(() => navigate("/app/dashboard", { replace: true }), 900);
    } catch (err: any) {
      console.error("Save profile failed:", err);
      toast.error(err?.message || "Impossible d'enregistrer votre profil.");
    } finally {
      setSaving(false);
    }
  }

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

      // Straight on to identity. The password alone does not make an account
      // usable — a profile with no name produces reports signed by nobody.
      setPhase("profile");
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
          <XSpinnerBlock size={48} />
          <p className="mt-4 text-muted">Vérification du lien…</p>
        </div>
      </div>
    );
  }

  if (phase === "invalid") {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-[4px] border border-line bg-surface p-6 text-center">
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

  if (phase === "profile") {
    const nameOk = normalizeName(profileName).length > 0;
    const roleOk = normalizeRole(profileRole).length > 0;
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-[4px] border border-line bg-surface p-6">
          <div className="text-center mb-6">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-[4px] bg-subtle">
              <UserRound className="h-6 w-6 text-ink" aria-hidden="true" />
            </div>
            <h1 className="text-lg font-semibold text-ink">Confirmez votre identité</h1>
            <p className="mt-2 text-sm text-muted">
              Ces informations apparaissent sur les rapports de visite que vous produirez.
            </p>
          </div>

          <form onSubmit={submitProfile} className="space-y-4">
            <div>
              <label className={labelClassName} htmlFor="profile-name">
                Nom complet
              </label>
              <input
                id="profile-name"
                type="text"
                required
                autoFocus
                autoComplete="name"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="Prénom Nom"
                className={inputClassName}
              />
            </div>

            <div>
              <label className={labelClassName} htmlFor="profile-role">
                Titre
              </label>
              <RolePicker
                id="profile-role"
                value={profileRole}
                onChange={setProfileRole}
                required
              />
            </div>

            <Button type="submit" disabled={saving || !nameOk || !roleOk} fullWidth>
              {saving ? "Enregistrement…" : "Terminer"}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-[4px] border border-line bg-surface p-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-[4px] bg-subtle">
            <Check className="h-6 w-6 text-ink" aria-hidden="true" />
          </div>
          <h1 className="text-lg font-semibold text-ink">Mot de passe défini</h1>
          <p className="mt-2 text-sm text-muted">Ouverture de RedMark…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-[4px] border border-line bg-surface p-6">
        <div className="text-center mb-6">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-[4px] bg-subtle">
            <KeyRound className="h-6 w-6 text-ink" aria-hidden="true" />
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
            {saving ? "Enregistrement…" : "Continuer"}
          </Button>
        </form>
      </div>
    </div>
  );
}
